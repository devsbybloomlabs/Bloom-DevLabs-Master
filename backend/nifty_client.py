"""Nifty PM API async client.

Supports two auth modes:
  • OAuth2 (preferred) — tokens stored in MongoDB `integrations.nifty` doc with
    auto-refresh on 401.
  • Static bearer token (legacy) — read from NIFTY_ACCESS_TOKEN env var.

Docs: https://developers.niftypm.com
Base URL: https://openapi.niftypm.com
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger("nifty")

DEFAULT_TIMEOUT = 25.0
DEFAULT_BASE_URL = "https://openapi.niftypm.com"
TOKEN_URL = f"{DEFAULT_BASE_URL}/oauth/token"
AUTHORIZE_URL = "https://nifty.pm/authorize"
DEFAULT_SCOPES = (
    "file,doc,message,project,member,task,time_tracking,subteam,task_group,"
    "subtask,milestone,label"
)


class NiftyClient:
    """Async wrapper over Nifty PM API v1.0 with OAuth + refresh."""

    INTEGRATIONS_KEY = "nifty"

    def __init__(
        self,
        access_token: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        # Static fallback only
        self._static_token = access_token or os.environ.get("NIFTY_ACCESS_TOKEN", "")
        self.base_url = (base_url or os.environ.get("NIFTY_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.default_project_id = os.environ.get("NIFTY_PROJECT_ID", "")
        self.client_id = os.environ.get("NIFTY_CLIENT_ID", "")
        self.client_secret = os.environ.get("NIFTY_CLIENT_SECRET", "")
        self.redirect_uri = os.environ.get(
            "NIFTY_REDIRECT_URI",
            f"{os.environ.get('APP_BASE_URL', 'https://bybloomlabs.com').rstrip('/')}/auth/callback",
        )
        self.timeout = timeout
        # DB binding set lazily from app startup
        self.db: Optional[AsyncIOMotorDatabase] = None

    def bind_db(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Token lifecycle
    # ------------------------------------------------------------------
    async def _get_stored_token(self) -> Optional[Dict[str, Any]]:
        if self.db is None:
            return None
        return await self.db.integrations.find_one(
            {"key": self.INTEGRATIONS_KEY}, {"_id": 0}
        )

    async def _save_token_payload(
        self, payload: Dict[str, Any], *, source: str = "oauth"
    ) -> Dict[str, Any]:
        """Persist an OAuth token response."""
        if self.db is None:
            return {}
        now = datetime.now(timezone.utc)
        access_token = payload.get("access_token", "")
        refresh_token = payload.get("refresh_token") or ""
        expires_in = int(payload.get("expires_in", 3600) or 3600)
        expires_at = now + timedelta(seconds=max(60, expires_in - 60))
        doc = {
            "key": self.INTEGRATIONS_KEY,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": payload.get("token_type", "Bearer"),
            "scope": payload.get("scope", ""),
            "expires_at": expires_at.isoformat(),
            "source": source,
            "updated_at": now.isoformat(),
        }
        await self.db.integrations.update_one(
            {"key": self.INTEGRATIONS_KEY}, {"$set": doc}, upsert=True
        )
        return doc

    async def _current_access_token(self) -> Optional[str]:
        """Return a valid access token, refreshing if necessary. Falls back to
        env-var static token if no OAuth tokens stored."""
        stored = await self._get_stored_token()
        if not stored:
            return self._static_token or None
        # Check expiry
        try:
            expires_at = datetime.fromisoformat(
                stored["expires_at"].replace("Z", "+00:00")
            )
        except Exception:
            expires_at = datetime.now(timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            # Try to refresh
            if stored.get("refresh_token"):
                refreshed = await self.refresh_token(stored["refresh_token"])
                if refreshed.get("success"):
                    return refreshed["data"].get("access_token")
            # Stored is expired and refresh failed — fall back to whatever is
            # still on the doc (might still work) and let the request 401 itself
            return stored.get("access_token") or self._static_token or None
        return stored.get("access_token") or self._static_token or None

    @property
    def is_oauth_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def is_connected(self) -> bool:
        stored = await self._get_stored_token()
        if stored and stored.get("access_token"):
            return True
        return bool(self._static_token)

    @property
    def is_configured(self) -> bool:
        # Sync check: only true if a static token exists. Routes that need a
        # definite "yes/no" should `await is_connected()`.
        return bool(self._static_token)

    # ------------------------------------------------------------------
    # OAuth flow helpers
    # ------------------------------------------------------------------
    def authorize_url(self, state: str = "", scopes: Optional[str] = None) -> str:
        """Build the URL the admin opens to grant Nifty access."""
        from urllib.parse import urlencode

        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": scopes or DEFAULT_SCOPES,
        }
        if state:
            params["state"] = state
        return f"{AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, *, redirect_uri: Optional[str] = None) -> Dict[str, Any]:
        """Exchange an auth code for an access+refresh token. Persists on success."""
        if not self.is_oauth_configured:
            return {"success": False, "status": 0, "data": None, "error": "OAuth not configured"}
        body = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri or self.redirect_uri,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    TOKEN_URL, json=body, headers={"Content-Type": "application/json"}
                )
            try:
                payload = r.json()
            except Exception:
                payload = {"raw": r.text[:500]}
            if 200 <= r.status_code < 300:
                doc = await self._save_token_payload(payload, source="oauth_code")
                return {"success": True, "status": r.status_code, "data": doc, "error": None}
            err = (
                payload.get("message")
                or payload.get("error_description")
                or payload.get("error")
                if isinstance(payload, dict) else r.text[:300]
            )
            log.warning("Nifty exchange_code failed %s: %s", r.status_code, payload)
            return {"success": False, "status": r.status_code, "data": payload, "error": err}
        except Exception as exc:  # pragma: no cover
            log.exception("exchange_code error")
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    async def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        if not self.is_oauth_configured:
            return {"success": False, "status": 0, "data": None, "error": "OAuth not configured"}
        body = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    TOKEN_URL, json=body, headers={"Content-Type": "application/json"}
                )
            try:
                payload = r.json()
            except Exception:
                payload = {"raw": r.text[:500]}
            if 200 <= r.status_code < 300:
                doc = await self._save_token_payload(payload, source="oauth_refresh")
                return {"success": True, "status": r.status_code, "data": doc, "error": None}
            log.warning("Nifty refresh_token failed %s: %s", r.status_code, payload)
            return {
                "success": False,
                "status": r.status_code,
                "data": payload,
                "error": (payload.get("message") or payload.get("error_description") or payload.get("error"))
                if isinstance(payload, dict) else r.text[:300],
            }
        except Exception as exc:
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    async def disconnect(self) -> Dict[str, Any]:
        if self.db is None:
            return {"ok": False, "error": "db not bound"}
        await self.db.integrations.delete_one({"key": self.INTEGRATIONS_KEY})
        return {"ok": True}

    async def set_manual_token(self, access_token: str) -> Dict[str, Any]:
        """For testing — let the admin paste a long-lived token directly."""
        return await self._save_token_payload(
            {"access_token": access_token, "expires_in": 60 * 60 * 24 * 365}, source="manual"
        )

    # ------------------------------------------------------------------
    # Request layer (auto-refresh on 401)
    # ------------------------------------------------------------------
    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        _retried: bool = False,
    ) -> Dict[str, Any]:
        token = await self._current_access_token()
        if not token:
            return {"success": False, "status": 0, "data": None, "error": "Nifty not connected"}
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(method, url, headers=headers, params=params, json=json)
            try:
                payload = r.json() if r.text else {}
            except Exception:
                payload = {"raw": r.text[:500]}
            if 200 <= r.status_code < 300:
                return {"success": True, "status": r.status_code, "data": payload, "error": None}
            if r.status_code == 401 and not _retried:
                # Try refresh + retry once
                stored = await self._get_stored_token()
                if stored and stored.get("refresh_token"):
                    refresh = await self.refresh_token(stored["refresh_token"])
                    if refresh.get("success"):
                        return await self._request(
                            method, path, params=params, json=json, _retried=True
                        )
            err = payload.get("message") if isinstance(payload, dict) else r.text[:300]
            log.warning("Nifty %s %s -> %s: %s", method, path, r.status_code, str(payload)[:300])
            return {"success": False, "status": r.status_code, "data": payload, "error": err or f"HTTP {r.status_code}"}
        except httpx.TimeoutException as exc:
            return {"success": False, "status": 0, "data": None, "error": f"timeout: {exc}"}
        except Exception as exc:
            log.exception("Nifty request failed: %s %s", method, path)
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    # ------------------------------------------------------------------
    # Tasks
    # ------------------------------------------------------------------
    async def create_task(
        self,
        name: str,
        *,
        project_id: Optional[str] = None,
        description: Optional[str] = None,
        assignees: Optional[List[str]] = None,
        due_date: Optional[datetime] = None,
        tags: Optional[List[str]] = None,
        custom_fields: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"name": name}
        if project_id or self.default_project_id:
            body["project_id"] = project_id or self.default_project_id
        if description:
            body["description"] = description
        if assignees:
            body["assignees"] = assignees
        if due_date:
            body["due_date"] = due_date.strftime("%Y-%m-%d")
        if tags:
            body["tags"] = tags
        if custom_fields:
            body["custom_fields"] = custom_fields
        return await self._request("POST", "/api/v1.0/tasks", json=body)

    async def list_projects(self, *, page_size: int = 100) -> Dict[str, Any]:
        """Fetches ALL projects across pages (Nifty defaults to 25 per page)."""
        all_items: List[Dict[str, Any]] = []
        page = 1
        while True:
            res = await self._request(
                "GET",
                "/api/v1.0/projects",
                params={"page": page, "per_page": page_size},
            )
            if not res.get("success"):
                if all_items:
                    # Return what we have so far
                    return {"success": True, "status": 200, "data": {"projects": all_items}, "error": None}
                return res
            data = res.get("data") or {}
            chunk = (
                data.get("projects")
                or data.get("data")
                or (data if isinstance(data, list) else [])
            )
            if not isinstance(chunk, list):
                chunk = []
            all_items.extend(chunk)
            # Stop if smaller than page_size (or no items)
            if len(chunk) < page_size:
                break
            page += 1
            if page > 20:  # safety cap (2000 projects)
                break
        return {"success": True, "status": 200, "data": {"projects": all_items}, "error": None}

    async def get_project(self, project_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/api/v1.0/projects/{project_id}")

    async def list_members(self, project_id: Optional[str] = None, *, page_size: int = 100) -> Dict[str, Any]:
        """Fetch all members across pages."""
        pid = project_id or self.default_project_id
        base_path = f"/api/v1.0/projects/{pid}/members" if pid else "/api/v1.0/members"
        all_items: List[Dict[str, Any]] = []
        page = 1
        while True:
            res = await self._request(
                "GET", base_path, params={"page": page, "per_page": page_size}
            )
            if not res.get("success"):
                if all_items:
                    return {"success": True, "status": 200, "data": {"members": all_items}, "error": None}
                return res
            data = res.get("data") or {}
            chunk = (
                data.get("members")
                or data.get("data")
                or (data if isinstance(data, list) else [])
            )
            if not isinstance(chunk, list):
                chunk = []
            all_items.extend(chunk)
            if len(chunk) < page_size:
                break
            page += 1
            if page > 20:
                break
        return {"success": True, "status": 200, "data": {"members": all_items}, "error": None}
