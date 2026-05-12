"""BreezeDocs API client (https://breezedoc.com/api).

Async wrapper around BreezeDoc's REST API for proposals & contracts.
Follows the same MOCK-first, LIVE-on-credentials pattern used by
`approval_studio_client.py` / `thrivedesk_client.py`.

Resolution order for the API token:
  1. `BREEZEDOCS_API_KEY` env var (preview-only override)
  2. DB-stored `integration_credentials.breezedocs.api_key`

If neither is set, the client runs in MOCK mode and logs every call to
`mock_log` (inspectable via `/api/admin/breezedocs/mock-log`).

API surface used (full docs: https://breezedoc.com/developer/docs/):
  • GET  /api/me                                       — auth probe
  • GET  /api/documents                                — list all
  • GET  /api/documents/{id}                           — single
  • POST /api/templates/{id}/create-document           — clone template
  • POST /api/documents/{id}/send                      — push to recipients
  • GET  /api/documents/{id}/recipients                — poll signing status
  • GET  /api/templates                                — list templates

Important: BreezeDoc does NOT publish webhooks (as of Feb 2026). We
poll `/documents/{id}/recipients` every 10 min via APScheduler to refresh
opened_at + completed_at, then fire branded emails locally.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from integration_credentials import get_credential

log = logging.getLogger("breezedocs.client")

BASE_URL = "https://breezedoc.com/api"
RECIPIENT_SIGN_URL_TEMPLATE = "https://breezedoc.com/r/{slug}"


class BreezeDocsClient:
    """BreezeDoc REST wrapper. Falls back to mock mode when no token."""

    def __init__(self) -> None:
        self.api_key: str = ""
        self.mock_log: List[Dict[str, Any]] = []
        self._db: Optional[AsyncIOMotorDatabase] = None

    # ----- DB binding & credential resolution -----
    def bind_db(self, db: AsyncIOMotorDatabase) -> None:
        self._db = db

    async def _resolve_creds(self) -> None:
        """Pick up newest DB-stored or env-stored API key."""
        if self._db is None:
            self.api_key = os.environ.get("BREEZEDOCS_API_KEY", "").strip()
            return
        self.api_key = (
            await get_credential(
                self._db, "breezedocs", "api_key", env_var="BREEZEDOCS_API_KEY"
            )
        ).strip()

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    # ----- low-level request helper -----
    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "BloomLabs/1.0 (+https://bybloomlabs.com)",
        }

    def _log_mock(self, op: str, payload: Dict[str, Any]) -> None:
        self.mock_log.append(
            {"op": op, "payload": payload, "at": datetime.now(timezone.utc).isoformat()}
        )
        # Keep last 100 entries to bound memory.
        if len(self.mock_log) > 100:
            self.mock_log = self.mock_log[-100:]

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        await self._resolve_creds()
        url = f"{BASE_URL}{path}"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.request(
                    method,
                    url,
                    headers=self._headers(),
                    json=json,
                    params=params,
                )
        except httpx.RequestError as exc:
            log.warning("BreezeDocs %s %s failed: %s", method, path, exc)
            return {"success": False, "status": 0, "error": str(exc)}
        if res.status_code == 429:
            return {"success": False, "status": 429, "error": "rate_limited"}
        ok = 200 <= res.status_code < 300
        try:
            data = res.json()
        except Exception:
            data = {"raw": res.text[:200]}
        return {"success": ok, "status": res.status_code, "data": data,
                "error": None if ok else (data.get("message") if isinstance(data, dict) else str(data))}

    # ----- High-level operations -----
    async def get_me(self) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("get_me", {})
            return {"success": True, "status": 200, "data": {"id": 0, "email": "mock@breezedoc.local"}, "mock": True}
        return await self._request("GET", "/me")

    async def list_templates(self) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("list_templates", {})
            return {
                "success": True,
                "status": 200,
                "mock": True,
                "data": {
                    "data": [
                        {"id": 1001, "title": "Express Launch — Standard Proposal", "slug": "mock-express", "is_template": True},
                        {"id": 1002, "title": "Custom Build — Master Services Agreement", "slug": "mock-custom-msa", "is_template": True},
                        {"id": 1003, "title": "Enterprise — Statement of Work", "slug": "mock-enterprise-sow", "is_template": True},
                    ]
                },
            }
        return await self._request("GET", "/templates")

    async def list_documents(self) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("list_documents", {})
            return {"success": True, "status": 200, "data": {"data": []}, "mock": True}
        return await self._request("GET", "/documents", params={"order_by": "id", "direction": "desc"})

    async def get_document(self, doc_id: int) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("get_document", {"id": doc_id})
            return {
                "success": True,
                "status": 200,
                "mock": True,
                "data": {
                    "id": doc_id,
                    "title": "Mock Document",
                    "slug": f"mock-doc-{doc_id}",
                    "recipients": [],
                },
            }
        return await self._request("GET", f"/documents/{doc_id}")

    async def list_document_recipients(self, doc_id: int) -> Dict[str, Any]:
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("list_document_recipients", {"id": doc_id})
            return {"success": True, "status": 200, "data": {"data": []}, "mock": True}
        return await self._request("GET", f"/documents/{doc_id}/recipients")

    async def create_document_from_template(
        self,
        template_id: int,
    ) -> Dict[str, Any]:
        """Clone a template into a draft document. Returns the new document."""
        await self._resolve_creds()
        if not self.is_configured:
            from secrets import randbelow

            mock_doc_id = 90000 + randbelow(9000)
            self._log_mock(
                "create_document_from_template",
                {"template_id": template_id, "mock_doc_id": mock_doc_id},
            )
            return {
                "success": True,
                "status": 201,
                "mock": True,
                "data": {
                    "id": mock_doc_id,
                    "title": "Mock Document from Template",
                    "slug": f"mock-doc-{mock_doc_id}",
                    "recipients": [
                        {
                            "id": 1,
                            "slug": f"mockrec{mock_doc_id}",
                            "email": "client@example.com",
                            "name": "Test Client",
                            "party": 0,
                            "owner": False,
                        }
                    ],
                },
            }
        return await self._request(
            "POST", f"/templates/{template_id}/create-document"
        )

    async def send_document(
        self,
        doc_id: int,
        recipients: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        """Send a document to recipients (must match document's recipient list size)."""
        await self._resolve_creds()
        if not self.is_configured:
            self._log_mock("send_document", {"id": doc_id, "recipients": recipients})
            now = datetime.now(timezone.utc).isoformat()
            return {
                "success": True,
                "status": 200,
                "mock": True,
                "data": {
                    "id": doc_id,
                    "title": "Mock Sent Document",
                    "slug": f"mock-doc-{doc_id}",
                    "recipients": [
                        {
                            "id": idx + 1,
                            "slug": f"mockrec{doc_id}-{idx}",
                            "email": r["email"],
                            "name": r["name"],
                            "party": idx,
                            "owner": False,
                            "sent_at": now,
                        }
                        for idx, r in enumerate(recipients)
                    ],
                },
            }
        return await self._request(
            "POST",
            f"/documents/{doc_id}/send",
            json={"recipients": recipients},
        )

    @staticmethod
    def recipient_sign_url(slug: str) -> str:
        return RECIPIENT_SIGN_URL_TEMPLATE.format(slug=slug)
