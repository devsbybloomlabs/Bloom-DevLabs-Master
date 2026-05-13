"""
Publit.io CDN client — minimal async wrapper for file uploads.

Uses the signed API authentication scheme:
  api_signature = SHA1(api_timestamp + api_nonce + api_secret)

API key + secret are loaded from environment variables. All requests use
multipart/form-data — base64 mode is intentionally avoided for the 33% size
penalty.
"""
from __future__ import annotations

import hashlib
import os
import random
import time
from typing import Any, Dict, Optional, Tuple

import httpx


PUBLITIO_BASE = os.environ.get("PUBLITIO_BASE_URL", "https://api.publit.io/v1").rstrip("/")


class PublitioError(Exception):
    """Raised when Publit.io returns a non-success response."""


class PublitioClient:
    """Lightweight signed-request client."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("PUBLITIO_API_KEY", "")
        self.api_secret = api_secret or os.environ.get("PUBLITIO_API_SECRET", "")
        self.timeout = httpx.Timeout(timeout)

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_secret)

    def _signed_query(self) -> Dict[str, str]:
        """Generate signed query params for a single request."""
        ts = str(int(time.time()))
        nonce = str(random.randint(10000000, 99999999))
        sig = hashlib.sha1(f"{ts}{nonce}{self.api_secret}".encode()).hexdigest()
        return {
            "api_key": self.api_key,
            "api_nonce": nonce,
            "api_timestamp": ts,
            "api_signature": sig,
        }

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        public_id: Optional[str] = None,
        folder: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upload a single file. Returns the parsed JSON response from Publit.io.

        Useful fields in the response:
          • ``url_preview`` — direct CDN URL for the file
          • ``url_short`` — short-form URL
          • ``url_thumbnail`` — auto-generated thumbnail
          • ``public_id`` — Publit.io ID
        """
        if not self.is_configured:
            raise PublitioError("Publit.io API key/secret not configured")

        url = f"{PUBLITIO_BASE}/files/create"
        params = self._signed_query()
        data: Dict[str, str] = {}
        if public_id:
            data["public_id"] = public_id
        if folder:
            data["folder"] = folder
        files = {"file": (filename, file_bytes, content_type)}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.post(url, params=params, data=data, files=files)
        if res.status_code >= 400:
            raise PublitioError(f"Publit.io {res.status_code}: {res.text[:300]}")
        body: Dict[str, Any] = res.json() if res.text else {}
        if not body.get("success", True):
            raise PublitioError(f"Publit.io error: {body}")
        return body

    @staticmethod
    def extract_urls(body: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
        """Pull (cdn_url, thumbnail_url) out of an upload response."""
        cdn = body.get("url_preview") or body.get("url") or body.get("url_short")
        thumb = body.get("url_thumbnail") or body.get("thumbnail_url")
        return cdn, thumb


__all__ = ["PublitioClient", "PublitioError"]
