"""Nifty PM API async client.

Auth: OAuth2 bearer token (long-lived access token from app registration).
Docs: https://developers.niftypm.com
Base URL: https://openapi.niftypm.com

Best-effort design — failures never crash callers. Always returns the
familiar `{success, status, data, error}` envelope.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("nifty")

DEFAULT_TIMEOUT = 25.0
DEFAULT_BASE_URL = "https://openapi.niftypm.com"


class NiftyClient:
    """Async wrapper over Nifty PM API v1."""

    def __init__(
        self,
        access_token: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.access_token = access_token or os.environ.get("NIFTY_ACCESS_TOKEN", "")
        self.base_url = (base_url or os.environ.get("NIFTY_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.default_project_id = os.environ.get("NIFTY_PROJECT_ID", "")
        self.timeout = timeout
        if not self.access_token:
            log.warning("NIFTY_ACCESS_TOKEN not set — Nifty calls will fail gracefully.")

    @property
    def is_configured(self) -> bool:
        return bool(self.access_token)

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured:
            return {"success": False, "status": 0, "data": None, "error": "NIFTY_ACCESS_TOKEN not configured"}
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(
                    method, url, headers=self.headers, params=params, json=json
                )
            try:
                payload = r.json() if r.text else {}
            except Exception:
                payload = {"raw": r.text[:500]}
            if 200 <= r.status_code < 300:
                return {"success": True, "status": r.status_code, "data": payload, "error": None}
            err = payload.get("message") if isinstance(payload, dict) else r.text[:300]
            log.warning("Nifty %s %s -> %s: %s", method, path, r.status_code, str(payload)[:300])
            return {"success": False, "status": r.status_code, "data": payload, "error": err or f"HTTP {r.status_code}"}
        except httpx.TimeoutException as exc:
            return {"success": False, "status": 0, "data": None, "error": f"timeout: {exc}"}
        except Exception as exc:  # pragma: no cover
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
        """Create a task in Nifty. Returns envelope; on success data has task obj."""
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

    async def list_projects(self) -> Dict[str, Any]:
        return await self._request("GET", "/api/v1.0/projects")

    async def get_project(self, project_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/api/v1.0/projects/{project_id}")

    async def list_members(self, project_id: Optional[str] = None) -> Dict[str, Any]:
        pid = project_id or self.default_project_id
        if pid:
            return await self._request("GET", f"/api/v1.0/projects/{pid}/members")
        return await self._request("GET", "/api/v1.0/members")
