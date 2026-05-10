"""Minimal Emailit transactional email client.

Note: until the sender domain is verified in the Emailit dashboard
(SPF/DKIM DNS records on bybloomlabs.com), the API will respond 422
\"Domain not verified\". The integration code below is correct —
emails will start sending automatically once DNS verification is complete.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("emailit")


class EmailitError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class EmailitClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("EMAILIT_API_KEY", "")
        self.base_url = (
            base_url or os.environ.get("EMAILIT_BASE_URL", "https://api.emailit.com/v1")
        ).rstrip("/")
        self.from_email = from_email or os.environ.get(
            "EMAILIT_FROM_EMAIL", "hello@bybloomlabs.com"
        )
        self.from_name = from_name or os.environ.get("EMAILIT_FROM_NAME", "Bloom Labs")

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def send_email(
        self,
        to: str | List[str],
        subject: str,
        html: str,
        text: Optional[str] = None,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None,
        timeout: float = 20.0,
    ) -> Dict[str, Any]:
        if isinstance(to, str):
            to_field: Any = to
        else:
            to_field = to
        payload = {
            "from": from_email or self.from_email,
            "from_name": from_name or self.from_name,
            "to": to_field,
            "subject": subject,
            "html": html,
            "text": text or "",
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                f"{self.base_url}/emails", headers=self.headers, json=payload
            )
            try:
                body = r.json()
            except Exception:
                body = {"raw": r.text}
            if r.status_code in (200, 201, 202):
                return {"ok": True, "data": body, "status_code": r.status_code}
            raise EmailitError(
                f"Emailit returned {r.status_code}: {body}",
                status_code=r.status_code,
                body=body,
            )
