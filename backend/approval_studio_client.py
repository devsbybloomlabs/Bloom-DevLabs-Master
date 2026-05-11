"""Approval Studio API client (mockable).

Approval Studio (https://approval.studio) is a design-review/proofing platform
with REST + GraphQL APIs and webhooks (ANNOTATION_ADDED, TASK_APPROVED, etc.).

This client is structured to **drop-in real credentials later** (set
`APPROVAL_STUDIO_USERNAME` + `APPROVAL_STUDIO_PASSWORD` or `APPROVAL_STUDIO_TOKEN`
in `.env`) but defaults to MOCK mode when neither is set. Every method returns
the same `{success, status, data, error}` envelope used elsewhere so callers
don't branch on mock vs live.

In MOCK mode every "API call" is logged + persisted to the in-memory `_MOCK_LOG`
list so the admin UI can inspect what would have been sent.

REST base URL: https://api.approval.studio/api/v1
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx

log = logging.getLogger("approval_studio")

DEFAULT_TIMEOUT = 25.0
DEFAULT_BASE_URL = "https://api.approval.studio/api/v1"


class ApprovalStudioClient:
    """Async wrapper. Mocks responses when credentials are absent."""

    def __init__(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        token: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.username = username or os.environ.get("APPROVAL_STUDIO_USERNAME", "")
        self.password = password or os.environ.get("APPROVAL_STUDIO_PASSWORD", "")
        self._static_token = token or os.environ.get("APPROVAL_STUDIO_TOKEN", "")
        self.base_url = (
            base_url or os.environ.get("APPROVAL_STUDIO_BASE_URL", DEFAULT_BASE_URL)
        ).rstrip("/")
        self.timeout = timeout
        self.webhook_secret = os.environ.get("APPROVAL_STUDIO_WEBHOOK_SECRET", "")
        # In-memory cache of latest bearer token + mock activity log
        self._auth_token: Optional[str] = self._static_token or None
        self.mock_log: List[Dict[str, Any]] = []

    @property
    def is_configured(self) -> bool:
        """True only when real credentials are present (live mode)."""
        return bool(self._static_token or (self.username and self.password))

    @property
    def mode(self) -> str:
        return "live" if self.is_configured else "mock"

    # ------------------------------------------------------------------
    # Mock activity logger
    # ------------------------------------------------------------------
    def _log_mock(self, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        entry = {
            "action": action,
            "payload": payload,
            "at": datetime.now(timezone.utc).isoformat(),
            "id": f"mock_{uuid4().hex[:12]}",
        }
        self.mock_log.append(entry)
        # Cap log to last 200 entries
        if len(self.mock_log) > 200:
            self.mock_log = self.mock_log[-200:]
        log.info("[APPROVAL STUDIO MOCK] %s: %s", action, str(payload)[:300])
        return entry

    # ------------------------------------------------------------------
    # Live request layer
    # ------------------------------------------------------------------
    async def _ensure_token(self) -> Optional[str]:
        """Fetch + cache bearer token from /token/login if username+password supplied."""
        if self._auth_token:
            return self._auth_token
        if not (self.username and self.password):
            return None
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    f"{self.base_url}/token/login",
                    json={"username": self.username, "password": self.password},
                    headers={"Content-Type": "application/json"},
                )
            if 200 <= r.status_code < 300:
                payload = r.json()
                self._auth_token = payload.get("token") or payload.get("access_token")
                return self._auth_token
            log.warning("Approval Studio login failed %s: %s", r.status_code, r.text[:200])
        except Exception as exc:  # pragma: no cover
            log.exception("Approval Studio login error: %s", exc)
        return None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        token = await self._ensure_token()
        if not token:
            return {
                "success": False,
                "status": 0,
                "data": None,
                "error": "Approval Studio not authenticated",
            }
        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(
                    method, url, headers=headers, params=params, json=json
                )
            try:
                payload = r.json() if r.text else {}
            except Exception:
                payload = {"raw": r.text[:500]}
            if 200 <= r.status_code < 300:
                return {"success": True, "status": r.status_code, "data": payload, "error": None}
            err = payload.get("message") if isinstance(payload, dict) else r.text[:300]
            return {
                "success": False,
                "status": r.status_code,
                "data": payload,
                "error": err or f"HTTP {r.status_code}",
            }
        except Exception as exc:  # pragma: no cover
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    # ------------------------------------------------------------------
    # Domain methods (all return the same envelope; mock when not live)
    # ------------------------------------------------------------------
    async def create_project(
        self,
        *,
        project_name: str,
        customer: str,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured:
            mock = self._log_mock(
                "create_project",
                {"projectName": project_name, "customer": customer, "description": description},
            )
            return {
                "success": True,
                "status": 200,
                "data": {"projectId": mock["id"], "projectName": project_name, "mock": True},
                "error": None,
            }
        return await self._request(
            "POST",
            "/project",
            json={
                "projectName": project_name,
                "customer": customer,
                "description": description or "",
            },
        )

    async def upload_asset(
        self,
        *,
        project_id: str,
        asset_name: str,
        asset_url: str,
        version: int = 1,
    ) -> Dict[str, Any]:
        """Upload an asset reference (a Figma/Drive URL) to a project."""
        if not self.is_configured:
            mock = self._log_mock(
                "upload_asset",
                {
                    "projectId": project_id,
                    "assetName": asset_name,
                    "assetUrl": asset_url,
                    "version": version,
                },
            )
            review_url = f"https://approval.studio/r/{mock['id']}"
            return {
                "success": True,
                "status": 200,
                "data": {
                    "assetId": mock["id"],
                    "reviewUrl": review_url,
                    "assetName": asset_name,
                    "version": version,
                    "mock": True,
                },
                "error": None,
            }
        return await self._request(
            "POST",
            f"/project/{project_id}/asset",
            json={"assetName": asset_name, "assetUrl": asset_url, "version": version},
        )

    async def list_comments(self, project_id: str) -> Dict[str, Any]:
        if not self.is_configured:
            self._log_mock("list_comments", {"projectId": project_id})
            return {"success": True, "status": 200, "data": {"comments": []}, "error": None}
        return await self._request("GET", f"/project/{project_id}/comments")

    async def get_project(self, project_id: str) -> Dict[str, Any]:
        if not self.is_configured:
            return {
                "success": True,
                "status": 200,
                "data": {"projectId": project_id, "status": "in_review", "mock": True},
                "error": None,
            }
        return await self._request("GET", f"/project/{project_id}")
