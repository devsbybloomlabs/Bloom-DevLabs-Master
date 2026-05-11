"""ThriveDesk REST API client (mockable).

ThriveDesk provides REST endpoints for conversation/ticket management and
webhooks for real-time events (`conversation.created`, `conversation.tags.updated`,
`conversation.status.updated`, etc.). Webhooks use HMAC-SHA1 + base64 signature
verification.

Auth pattern: `Authorization: Bearer <API_KEY>`.

This client follows the same MOCK-by-default pattern as `approval_studio_client.py`:
when `THRIVEDESK_API_KEY` (env or DB-stored credentials) is missing, every call
is logged to `mock_log` and returns a synthetic `{success: True, data: {mock: True}}`.

Methods:
  • get_conversation(ticket_id) — fetch a ticket
  • add_note(ticket_id, text) — internal note
  • add_reply(ticket_id, text) — public-facing reply visible to the customer
  • update_status(ticket_id, status) — Active / Pending / Closed
  • add_tags(ticket_id, tags) — tag the ticket
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx

log = logging.getLogger("thrivedesk")

DEFAULT_TIMEOUT = 20.0
DEFAULT_BASE_URL = "https://api.thrivedesk.com/v1"


class ThriveDeskClient:
    """Async wrapper. Mocks responses when API key is absent."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key or os.environ.get("THRIVEDESK_API_KEY", "")
        self.base_url = (
            base_url or os.environ.get("THRIVEDESK_BASE_URL", DEFAULT_BASE_URL)
        ).rstrip("/")
        self.workspace_url = os.environ.get(
            "THRIVEDESK_WORKSPACE_URL", "https://app.thrivedesk.com"
        ).rstrip("/")
        self.webhook_secret = os.environ.get("THRIVEDESK_WEBHOOK_SECRET", "")
        self.timeout = timeout
        self.db = None
        self.mock_log: List[Dict[str, Any]] = []

    def bind_db(self, db) -> None:
        self.db = db

    async def _resolve_creds(self) -> None:
        if self.db is None:
            return
        if self.api_key and self.webhook_secret:
            return
        try:
            from integration_credentials import get_credentials
            creds = await get_credentials(self.db, "thrivedesk")
            if not self.api_key:
                self.api_key = (creds.get("api_key") or "").strip()
            if not self.webhook_secret:
                self.webhook_secret = (creds.get("webhook_secret") or "").strip()
            if creds.get("workspace_url"):
                self.workspace_url = creds["workspace_url"].rstrip("/")
        except Exception:
            pass

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    @property
    def mode(self) -> str:
        return "live" if self.is_configured else "mock"

    def ticket_url(self, ticket_id: Any) -> str:
        return f"{self.workspace_url}/conversation/{ticket_id}"

    # ------------------------------------------------------------------
    def _log_mock(self, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        entry = {
            "action": action,
            "payload": payload,
            "at": datetime.now(timezone.utc).isoformat(),
            "id": f"mock_{uuid4().hex[:12]}",
        }
        self.mock_log.append(entry)
        if len(self.mock_log) > 200:
            self.mock_log = self.mock_log[-200:]
        log.info("[THRIVEDESK MOCK] %s: %s", action, str(payload)[:300])
        return entry

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            return {
                "success": False,
                "status": 0,
                "data": None,
                "error": "ThriveDesk not configured",
            }
        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(method, url, headers=headers, params=params, json=json)
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
                "error": (payload.get("message") if isinstance(payload, dict) else r.text[:300])
                or f"HTTP {r.status_code}",
            }
        except Exception as exc:  # pragma: no cover
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    # ------------------------------------------------------------------
    # Public domain methods (mock-aware)
    # ------------------------------------------------------------------
    async def get_conversation(self, ticket_id: Any) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            return {
                "success": True,
                "status": 200,
                "data": {"id": ticket_id, "subject": "Mock ticket", "mock": True},
                "error": None,
            }
        return await self._request("GET", f"/conversations/{ticket_id}")

    async def add_reply(self, ticket_id: Any, text: str) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("add_reply", {"ticketId": ticket_id, "text": text})
            return {"success": True, "status": 200, "data": {"mock": True}, "error": None}
        return await self._request(
            "POST", f"/conversations/{ticket_id}/replies", json={"text": text, "public": True}
        )

    async def add_note(self, ticket_id: Any, text: str) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("add_note", {"ticketId": ticket_id, "text": text})
            return {"success": True, "status": 200, "data": {"mock": True}, "error": None}
        return await self._request(
            "POST", f"/conversations/{ticket_id}/notes", json={"text": text}
        )

    async def update_status(self, ticket_id: Any, status: str) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("update_status", {"ticketId": ticket_id, "status": status})
            return {"success": True, "status": 200, "data": {"mock": True}, "error": None}
        return await self._request(
            "PATCH", f"/conversations/{ticket_id}", json={"status": status}
        )

    async def add_tags(self, ticket_id: Any, tags: List[str]) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("add_tags", {"ticketId": ticket_id, "tags": tags})
            return {"success": True, "status": 200, "data": {"mock": True}, "error": None}
        return await self._request(
            "POST", f"/conversations/{ticket_id}/tags", json={"tags": tags}
        )
