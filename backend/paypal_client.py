"""PayPal REST API v2 async client.

Direct httpx integration (no deprecated SDK). Supports:
  • OAuth2 client_credentials token (cached)
  • Orders v2 (one-time payments)
  • Catalog Products + Billing Plans + Subscriptions (recurring)
  • Webhook signature verification via /v1/notifications/verify-webhook-signature

Toggle sandbox/live via PAYPAL_ENV env var.
Mirrors the envelope pattern used by AgencyHandyClient → {success, status, data, error}.
"""
from __future__ import annotations

import base64
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("paypal")

DEFAULT_TIMEOUT = 30.0
SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
LIVE_BASE = "https://api-m.paypal.com"


class PayPalClient:
    """Async wrapper around PayPal REST v2."""

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        env: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.client_id = client_id or os.environ.get("PAYPAL_CLIENT_ID", "")
        self.client_secret = client_secret or os.environ.get("PAYPAL_CLIENT_SECRET", "")
        self.env = (env or os.environ.get("PAYPAL_ENV", "sandbox")).lower()
        self.base_url = SANDBOX_BASE if self.env != "live" else LIVE_BASE
        self.webhook_id = os.environ.get("PAYPAL_WEBHOOK_ID", "")
        self.default_currency = os.environ.get("PAYPAL_CURRENCY", "USD")
        self.timeout = timeout

        # token cache
        self._token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None

        if not self.client_id or not self.client_secret:
            log.warning("PayPal credentials not fully configured.")

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    async def _get_access_token(self) -> Optional[str]:
        if not self.is_configured:
            return None
        now = datetime.now(timezone.utc)
        if self._token and self._token_expiry and self._token_expiry > now:
            return self._token
        auth = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(
                    f"{self.base_url}/v1/oauth2/token",
                    headers={
                        "Authorization": f"Basic {auth}",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data={"grant_type": "client_credentials"},
                )
            if r.status_code != 200:
                log.warning("PayPal token request failed %s: %s", r.status_code, r.text[:200])
                return None
            data = r.json()
            self._token = data["access_token"]
            self._token_expiry = now + timedelta(seconds=int(data.get("expires_in", 3600)) - 60)
            return self._token
        except Exception as exc:  # pragma: no cover
            log.exception("PayPal token error: %s", exc)
            return None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured:
            return {"success": False, "status": 0, "data": None, "error": "PayPal not configured"}
        token = await self._get_access_token()
        if not token:
            return {"success": False, "status": 0, "data": None, "error": "Unable to obtain access token"}
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=representation",
        }
        if extra_headers:
            headers.update(extra_headers)
        url = f"{self.base_url}{path}"
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
            err = (
                (payload.get("details") or [{}])[0].get("description")
                if isinstance(payload, dict) and isinstance(payload.get("details"), list)
                else payload.get("message") if isinstance(payload, dict) else r.text[:300]
            )
            log.warning("PayPal %s %s -> %s: %s", method, path, r.status_code, str(payload)[:300])
            return {
                "success": False,
                "status": r.status_code,
                "data": payload,
                "error": err or f"HTTP {r.status_code}",
            }
        except httpx.TimeoutException as exc:
            return {"success": False, "status": 0, "data": None, "error": f"timeout: {exc}"}
        except Exception as exc:  # pragma: no cover
            log.exception("PayPal request failed %s %s", method, path)
            return {"success": False, "status": 0, "data": None, "error": str(exc)}

    # ------------------------------------------------------------------
    # Orders v2 (one-time)
    # ------------------------------------------------------------------
    async def create_order(
        self,
        amount: str,
        *,
        currency: Optional[str] = None,
        reference_id: Optional[str] = None,
        description: Optional[str] = None,
        custom_id: Optional[str] = None,
        return_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
        brand_name: str = "Bloom Labs",
    ) -> Dict[str, Any]:
        purchase_unit: Dict[str, Any] = {
            "amount": {
                "currency_code": currency or self.default_currency,
                "value": str(amount),
            },
        }
        if reference_id:
            purchase_unit["reference_id"] = reference_id
        if description:
            purchase_unit["description"] = description[:127]
        if custom_id:
            purchase_unit["custom_id"] = custom_id[:127]

        body: Dict[str, Any] = {
            "intent": "CAPTURE",
            "purchase_units": [purchase_unit],
            "application_context": {
                "brand_name": brand_name,
                "user_action": "PAY_NOW",
                "shipping_preference": "NO_SHIPPING",
            },
        }
        if return_url:
            body["application_context"]["return_url"] = return_url
        if cancel_url:
            body["application_context"]["cancel_url"] = cancel_url
        return await self._request("POST", "/v2/checkout/orders", json=body)

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/v2/checkout/orders/{order_id}")

    async def capture_order(self, order_id: str) -> Dict[str, Any]:
        return await self._request("POST", f"/v2/checkout/orders/{order_id}/capture", json={})

    # ------------------------------------------------------------------
    # Catalog Products (for subscriptions)
    # ------------------------------------------------------------------
    async def create_product(
        self,
        name: str,
        *,
        description: Optional[str] = None,
        product_type: str = "SERVICE",
        category: str = "SOFTWARE",
    ) -> Dict[str, Any]:
        body = {
            "name": name,
            "type": product_type,
            "category": category,
        }
        if description:
            body["description"] = description[:256]
        return await self._request("POST", "/v1/catalog/products", json=body)

    async def list_products(self, page_size: int = 20) -> Dict[str, Any]:
        return await self._request(
            "GET", "/v1/catalog/products", params={"page_size": page_size}
        )

    # ------------------------------------------------------------------
    # Billing Plans (subscription tiers)
    # ------------------------------------------------------------------
    async def create_plan(
        self,
        product_id: str,
        name: str,
        price: str,
        *,
        description: Optional[str] = None,
        currency: Optional[str] = None,
        interval_unit: str = "MONTH",  # DAY|WEEK|MONTH|YEAR
        interval_count: int = 1,
        total_cycles: int = 0,  # 0 = infinite
    ) -> Dict[str, Any]:
        body = {
            "product_id": product_id,
            "name": name,
            "description": description or name,
            "status": "ACTIVE",
            "billing_cycles": [
                {
                    "frequency": {
                        "interval_unit": interval_unit,
                        "interval_count": interval_count,
                    },
                    "tenure_type": "REGULAR",
                    "sequence": 1,
                    "total_cycles": total_cycles,
                    "pricing_scheme": {
                        "fixed_price": {
                            "value": str(price),
                            "currency_code": currency or self.default_currency,
                        }
                    },
                }
            ],
            "payment_preferences": {
                "auto_bill_outstanding": True,
                "setup_fee_failure_action": "CONTINUE",
                "payment_failure_threshold": 3,
            },
        }
        return await self._request("POST", "/v1/billing/plans", json=body)

    async def list_plans(self, page_size: int = 20) -> Dict[str, Any]:
        return await self._request("GET", "/v1/billing/plans", params={"page_size": page_size})

    async def get_plan(self, plan_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/v1/billing/plans/{plan_id}")

    # ------------------------------------------------------------------
    # Subscriptions
    # ------------------------------------------------------------------
    async def create_subscription(
        self,
        plan_id: str,
        *,
        subscriber_email: Optional[str] = None,
        subscriber_name: Optional[Dict[str, str]] = None,
        custom_id: Optional[str] = None,
        return_url: Optional[str] = None,
        cancel_url: Optional[str] = None,
        brand_name: str = "Bloom Labs",
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "plan_id": plan_id,
            "application_context": {
                "brand_name": brand_name,
                "user_action": "SUBSCRIBE_NOW",
                "shipping_preference": "NO_SHIPPING",
            },
        }
        subscriber: Dict[str, Any] = {}
        if subscriber_email:
            subscriber["email_address"] = subscriber_email
        if subscriber_name:
            subscriber["name"] = subscriber_name
        if subscriber:
            body["subscriber"] = subscriber
        if custom_id:
            body["custom_id"] = custom_id
        if return_url:
            body["application_context"]["return_url"] = return_url
        if cancel_url:
            body["application_context"]["cancel_url"] = cancel_url
        return await self._request("POST", "/v1/billing/subscriptions", json=body)

    async def get_subscription(self, subscription_id: str) -> Dict[str, Any]:
        return await self._request("GET", f"/v1/billing/subscriptions/{subscription_id}")

    async def cancel_subscription(
        self, subscription_id: str, reason: str = "Customer requested cancellation"
    ) -> Dict[str, Any]:
        return await self._request(
            "POST",
            f"/v1/billing/subscriptions/{subscription_id}/cancel",
            json={"reason": reason},
        )

    # ------------------------------------------------------------------
    # Webhook signature verification (uses PayPal's own endpoint)
    # ------------------------------------------------------------------
    async def verify_webhook_signature(
        self,
        *,
        transmission_id: str,
        transmission_time: str,
        cert_url: str,
        auth_algo: str,
        transmission_sig: str,
        webhook_event: Dict[str, Any],
        webhook_id: Optional[str] = None,
    ) -> bool:
        """Use PayPal's verification endpoint. Returns True if signature is valid.

        In sandbox-test scenarios where webhook isn't registered yet, returns False
        (caller can decide to accept based on env)."""
        wid = webhook_id or self.webhook_id
        if not wid:
            log.warning("PAYPAL_WEBHOOK_ID not set — skipping signature verification.")
            return False
        body = {
            "auth_algo": auth_algo,
            "cert_url": cert_url,
            "transmission_id": transmission_id,
            "transmission_sig": transmission_sig,
            "transmission_time": transmission_time,
            "webhook_id": wid,
            "webhook_event": webhook_event,
        }
        res = await self._request(
            "POST", "/v1/notifications/verify-webhook-signature", json=body
        )
        if not res.get("success"):
            return False
        return (res.get("data") or {}).get("verification_status") == "SUCCESS"

    # ------------------------------------------------------------------
    # Webhook management (admin)
    # ------------------------------------------------------------------
    async def list_webhooks(self) -> Dict[str, Any]:
        return await self._request("GET", "/v1/notifications/webhooks")

    async def create_webhook(self, url: str, events: List[str]) -> Dict[str, Any]:
        body = {
            "url": url,
            "event_types": [{"name": e} for e in events],
        }
        return await self._request("POST", "/v1/notifications/webhooks", json=body)

    async def delete_webhook(self, webhook_id: str) -> Dict[str, Any]:
        return await self._request("DELETE", f"/v1/notifications/webhooks/{webhook_id}")
