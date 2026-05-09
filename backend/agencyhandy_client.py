"""Agency Handy API client.

Auth uses the `x-api-key` header (verified via integration testing).
Provides read-only fetchers and a few action helpers (create quotation, register webhook).

Designed to fail gracefully — every fetch returns a structured `{success, data, error}` shape
so callers can surface partial-state UX (cached data + warning) instead of throwing.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("agencyhandy")

DEFAULT_TIMEOUT = 30.0


class AgencyHandyError(Exception):
    """Raised for unrecoverable Agency Handy API errors."""


class AgencyHandyClient:
    """Thin async HTTP wrapper around the Agency Handy v1 API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        company_id: Optional[str] = None,
        default_currency: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key or os.environ.get("AGENCYHANDY_API_KEY", "")
        self.base_url = (base_url or os.environ.get(
            "AGENCYHANDY_BASE_URL", "https://api.agencyhandy.com/api/v1"
        )).rstrip("/")
        self.company_id = company_id or os.environ.get("AGENCYHANDY_COMPANY_ID", "")
        self.default_currency = default_currency or os.environ.get(
            "AGENCYHANDY_DEFAULT_CURRENCY", "USD"
        )
        self.timeout = timeout
        if not self.api_key:
            log.warning("AGENCYHANDY_API_KEY is not set — Agency Handy calls will fail.")

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Low-level HTTP request that always returns a `{success, status, data, error}` envelope."""
        if not self.is_configured:
            return {
                "success": False,
                "status": 0,
                "data": None,
                "error": "AGENCYHANDY_API_KEY not configured",
            }
        url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(
                    method,
                    url,
                    headers=self.headers,
                    params=params,
                    json=json,
                )
            try:
                payload = r.json()
            except Exception:
                payload = {"raw": r.text[:500]}
            if 200 <= r.status_code < 300:
                return {"success": True, "status": r.status_code, "data": payload, "error": None}
            log.warning(
                "Agency Handy %s %s -> %s: %s", method, path, r.status_code, str(payload)[:300]
            )
            err_msg = (
                (payload.get("errors") or [{}])[0].get("message")
                if isinstance(payload, dict) and isinstance(payload.get("errors"), list)
                else payload.get("message") if isinstance(payload, dict) else r.text[:300]
            )
            return {
                "success": False,
                "status": r.status_code,
                "data": payload,
                "error": err_msg or f"HTTP {r.status_code}",
            }
        except httpx.TimeoutException as exc:
            log.warning("Agency Handy timeout for %s %s: %s", method, path, exc)
            return {"success": False, "status": 0, "data": None, "error": f"timeout: {exc}"}
        except Exception as exc:  # pragma: no cover - network errors
            log.exception("Agency Handy request failed: %s %s", method, path)
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    # ------------------------------------------------------------------
    # Read endpoints — all return raw envelope; routes layer normalises.
    # ------------------------------------------------------------------
    async def get_account(self) -> Dict[str, Any]:
        return await self._request("GET", "/accounts")

    async def list_services(self, service_type: str = "service") -> Dict[str, Any]:
        return await self._request(
            "GET", "/services", params={"serviceType": service_type}
        )

    async def list_orders(self, **params: Any) -> Dict[str, Any]:
        return await self._request("GET", "/orders", params=params or None)

    async def get_order(self, project_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/orders/{project_id}")

    async def list_invoices(self, **params: Any) -> Dict[str, Any]:
        return await self._request("GET", "/invoices", params=params or None)

    async def list_subscriptions(self, **params: Any) -> Dict[str, Any]:
        """List order-subscriptions (recurring orders for clients)."""
        return await self._request(
            "GET", "/order-subscriptions/", params=params or None
        )

    async def list_quotations(self, **params: Any) -> Dict[str, Any]:
        return await self._request("GET", "/quotations/", params=params or None)

    async def list_clients(self, **params: Any) -> Dict[str, Any]:
        """List members of the company that are clients (members API requires COMPANY_ID)."""
        if not self.company_id:
            return {
                "success": False,
                "status": 0,
                "data": None,
                "error": "AGENCYHANDY_COMPANY_ID not configured",
            }
        return await self._request(
            "GET",
            f"/company/{self.company_id}/members",
            params={**params, "role": params.pop("role", "client")} if params else {"role": "client"},
        )

    async def list_notifications(self, **params: Any) -> Dict[str, Any]:
        return await self._request("GET", "/notifications", params=params or None)

    async def list_forms(self) -> Dict[str, Any]:
        return await self._request("GET", "/forms")

    # ------------------------------------------------------------------
    # Webhooks
    # ------------------------------------------------------------------
    async def list_webhooks(self) -> Dict[str, Any]:
        return await self._request("GET", "/webhooks")

    async def list_webhook_events(self) -> Dict[str, Any]:
        return await self._request("GET", "/webhooks/events/list")

    async def list_webhook_auths(self) -> Dict[str, Any]:
        return await self._request("GET", "/webhooks/webhook-auths")

    async def save_webhook_auth(
        self,
        webhook_auth_id: str,
        *,
        token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"webhookAuthId": webhook_auth_id}
        if token is not None:
            body["token"] = token
        if username is not None:
            body["username"] = username
        if password is not None:
            body["password"] = password
        return await self._request("POST", "/webhooks/save-webhook-auth", json=body)

    async def get_event_id_map(self) -> Dict[str, str]:
        """Fetch event NAME -> ObjectId map (cached lookup helper)."""
        res = await self.list_webhook_events()
        if not res.get("success"):
            return {}
        items = (res.get("data") or {}).get("data") or []
        return {e.get("name"): e.get("_id") for e in items if e.get("name") and e.get("_id")}

    async def create_webhook(
        self,
        url: str,
        events: List[str],
        *,
        name: str = "Bloom Labs Admin",
        description: str = "Posts Agency Handy events to the Bloom Labs admin dashboard.",
        is_enabled: bool = True,
    ) -> Dict[str, Any]:
        """Create a webhook. `events` may be names (e.g. 'ORDER.CREATED') or event ObjectIds.

        If names are provided, this fetches the event map and resolves them to IDs.
        """
        if events and any(("." in e and len(e) < 32) for e in events):
            event_map = await self.get_event_id_map()
            resolved: List[str] = []
            unknown: List[str] = []
            for e in events:
                if "." in e:  # treat as name
                    eid = event_map.get(e)
                    if eid:
                        resolved.append(eid)
                    else:
                        unknown.append(e)
                else:
                    resolved.append(e)
            if unknown:
                log.warning("Unknown Agency Handy event names: %s", unknown)
            events = resolved
        body = {
            "name": name,
            "description": description,
            "url": url,
            "events": events,
            "isEnabled": is_enabled,
        }
        return await self._request("POST", "/webhooks", json=body)

    async def update_webhook(self, webhook_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("PUT", f"/webhooks/{webhook_id}", json=body)

    async def roll_webhook_secret(self, webhook_id: str) -> Dict[str, Any]:
        return await self._request("PUT", f"/webhooks/roll-secret/{webhook_id}")

    async def delete_webhooks(self, webhook_ids: List[str]) -> Dict[str, Any]:
        # API expects { webhookIds: [...] } via PUT /webhooks
        return await self._request("PUT", "/webhooks", json={"webhookIds": webhook_ids})

    async def send_test_webhook_event(
        self,
        webhook_id: str,
        event_name: str,
        target_url: str,
    ) -> Dict[str, Any]:
        return await self._request(
            "POST",
            "/webhooks/send-test-event",
            json={"webhook": webhook_id, "eventName": event_name, "url": target_url},
        )

    async def list_webhook_logs(self, **params: Any) -> Dict[str, Any]:
        return await self._request("GET", "/webhooks/logs", params=params or None)

    # ------------------------------------------------------------------
    # Quotations / Two-way sync
    # ------------------------------------------------------------------
    async def create_quotation(self, body: Dict[str, Any]) -> Dict[str, Any]:
        return await self._request("POST", "/quotations", json=body)
