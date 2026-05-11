"""Google Calendar OAuth2 + REST client (Phase 16).

Uses the standard Google OAuth2 web flow + Google Calendar v3 REST API. Tokens
are stored in `integrations.google_calendar` with auto-refresh on each call.

Credential resolution (env > DB > fail):
  • GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET — required for OAuth.
  • GOOGLE_CALENDAR_REDIRECT_URI — defaults to {APP_BASE_URL}/api/oauth/calendar/callback.

Scope: `https://www.googleapis.com/auth/calendar` (manage calendars + events).

Domain methods:
  • get_authorization_url(state) — kick off OAuth
  • exchange_code(code) — finalize OAuth + persist tokens
  • list_upcoming_events(max_results=10)
  • create_event({summary, description, start_iso, end_iso, attendees})
  • get_calendar_metadata() — primary calendar info (used for /test probe)
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from db_utils import prepare_for_mongo

log = logging.getLogger("google_calendar")

OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
API_BASE = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar"
DEFAULT_TIMEOUT = 20.0


class GoogleCalendarClient:
    """Async wrapper around the Google Calendar v3 REST API."""

    def __init__(self) -> None:
        self.client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
        self.client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
        self.redirect_uri = os.environ.get("GOOGLE_CALENDAR_REDIRECT_URI", "")
        self.timeout = DEFAULT_TIMEOUT
        self.db = None

    def bind_db(self, db) -> None:
        self.db = db

    async def _resolve_creds(self) -> None:
        """Pull DB-stored credentials when env vars are missing."""
        if self.db is None:
            return
        if self.client_id and self.client_secret and self.redirect_uri:
            return
        try:
            from integration_credentials import get_credentials
            creds = await get_credentials(self.db, "google_calendar")
            if not self.client_id:
                self.client_id = (creds.get("client_id") or "").strip()
            if not self.client_secret:
                self.client_secret = (creds.get("client_secret") or "").strip()
            if not self.redirect_uri:
                self.redirect_uri = (creds.get("redirect_uri") or "").strip()
        except Exception:
            pass

    @property
    def is_oauth_configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    @property
    def mode(self) -> str:
        return "live" if self.is_oauth_configured else "not_configured"

    # ---------------------------------------------------------------
    async def _get_stored_tokens(self) -> Optional[Dict[str, Any]]:
        if self.db is None:
            return None
        return await self.db.integrations.find_one(
            {"key": "google_calendar"}, {"_id": 0}
        )

    async def is_connected(self) -> bool:
        doc = await self._get_stored_tokens()
        return bool(doc and doc.get("access_token"))

    async def _persist_tokens(self, token_payload: Dict[str, Any]) -> None:
        """Store/refresh tokens. Preserves refresh_token if not in the response."""
        if self.db is None:
            return
        now = datetime.now(timezone.utc)
        expires_in = int(token_payload.get("expires_in") or 3600)
        update: Dict[str, Any] = {
            "key": "google_calendar",
            "access_token": token_payload.get("access_token"),
            "expires_at": (now + timedelta(seconds=expires_in)).isoformat(),
            "scope": token_payload.get("scope"),
            "token_type": token_payload.get("token_type", "Bearer"),
            "updated_at": now.isoformat(),
        }
        # Only overwrite refresh_token if Google sent one (they don't on refresh calls)
        if token_payload.get("refresh_token"):
            update["refresh_token"] = token_payload["refresh_token"]
        await self.db.integrations.update_one(
            {"key": "google_calendar"},
            {"$set": prepare_for_mongo(update)},
            upsert=True,
        )

    async def _refresh_if_needed(self) -> Optional[str]:
        """Refresh the access token when expired. Returns the live token."""
        doc = await self._get_stored_tokens()
        if not doc:
            return None
        expires_at = doc.get("expires_at")
        try:
            exp_dt = datetime.fromisoformat(expires_at) if expires_at else None
        except Exception:
            exp_dt = None
        # 60s safety margin
        if exp_dt and exp_dt > datetime.now(timezone.utc) + timedelta(seconds=60):
            return doc.get("access_token")
        refresh_token = doc.get("refresh_token")
        if not refresh_token:
            return doc.get("access_token")  # No refresh — use whatever we have
        await self._resolve_creds()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    OAUTH_TOKEN_URL,
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token",
                    },
                )
            if 200 <= r.status_code < 300:
                payload = r.json()
                await self._persist_tokens(payload)
                return payload.get("access_token")
            log.warning("Google token refresh failed %s: %s", r.status_code, r.text[:200])
        except Exception as exc:  # pragma: no cover
            log.exception("Google token refresh error: %s", exc)
        return doc.get("access_token")

    # ---------------------------------------------------------------
    # OAuth flow
    # ---------------------------------------------------------------
    def authorization_url(self, state: str) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",  # ensures refresh_token on every connect
            "state": state,
            "include_granted_scopes": "true",
        }
        return f"{OAUTH_AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_oauth_configured:
            return {"success": False, "error": "OAuth not configured", "data": None}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    OAUTH_TOKEN_URL,
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "redirect_uri": self.redirect_uri,
                        "code": code,
                        "grant_type": "authorization_code",
                    },
                )
            if 200 <= r.status_code < 300:
                payload = r.json()
                await self._persist_tokens(payload)
                return {"success": True, "data": payload, "error": None}
            return {
                "success": False,
                "status": r.status_code,
                "data": None,
                "error": r.text[:300],
            }
        except Exception as exc:
            return {"success": False, "data": None, "error": str(exc)}

    # ---------------------------------------------------------------
    # API methods
    # ---------------------------------------------------------------
    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        token = await self._refresh_if_needed()
        if not token:
            return {"success": False, "status": 0, "data": None, "error": "Not connected"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(
                    method,
                    f"{API_BASE}/{path.lstrip('/')}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    params=params,
                    json=json,
                )
            try:
                payload = r.json() if r.text else {}
            except Exception:
                payload = {"raw": r.text[:500]}
            if 200 <= r.status_code < 300:
                return {"success": True, "status": r.status_code, "data": payload, "error": None}
            return {
                "success": False,
                "status": r.status_code,
                "data": payload,
                "error": (payload.get("error") or {}).get("message")
                if isinstance(payload, dict)
                else r.text[:300],
            }
        except Exception as exc:  # pragma: no cover
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    async def get_calendar_metadata(self, calendar_id: str = "primary") -> Dict[str, Any]:
        return await self._request("GET", f"/calendars/{calendar_id}")

    async def list_upcoming_events(
        self, max_results: int = 10, calendar_id: str = "primary"
    ) -> Dict[str, Any]:
        return await self._request(
            "GET",
            f"/calendars/{calendar_id}/events",
            params={
                "timeMin": datetime.now(timezone.utc).isoformat(),
                "maxResults": max_results,
                "singleEvents": "true",
                "orderBy": "startTime",
            },
        )

    async def create_event(
        self,
        *,
        summary: str,
        description: Optional[str] = None,
        start_iso: str,
        end_iso: str,
        attendees: Optional[List[str]] = None,
        calendar_id: str = "primary",
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "summary": summary,
            "description": description or "",
            "start": {"dateTime": start_iso, "timeZone": "UTC"},
            "end": {"dateTime": end_iso, "timeZone": "UTC"},
        }
        if attendees:
            body["attendees"] = [{"email": e} for e in attendees if e]
        return await self._request(
            "POST", f"/calendars/{calendar_id}/events", json=body
        )

    async def delete_event(self, event_id: str, calendar_id: str = "primary") -> Dict[str, Any]:
        return await self._request(
            "DELETE", f"/calendars/{calendar_id}/events/{event_id}"
        )

    async def disconnect(self) -> None:
        """Wipe stored tokens. Does not revoke at Google — admin can do that
        manually at https://myaccount.google.com/permissions."""
        if self.db is None:
            return
        await self.db.integrations.delete_one({"key": "google_calendar"})
