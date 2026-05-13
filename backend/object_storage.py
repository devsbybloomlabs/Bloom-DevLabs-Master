"""Emergent Object Storage helper.

Tiny wrapper around the Emergent object-storage HTTP API. Encapsulates
init handshake, key caching, put/get/list operations, and best-effort
content-type guessing. Designed to be used from any route handler:

    from object_storage import put_object, get_object, APP_NAME

The module is intentionally side-effect free at import time so it can be
imported during unit tests without network calls. Call ``init_storage()``
once at FastAPI startup.
"""
from __future__ import annotations

import logging
import mimetypes
import os
import time
from typing import Optional, Tuple

import requests

log = logging.getLogger("object_storage")

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = os.environ.get("STORAGE_APP_NAME", "bybloomlabs")
_storage_key: Optional[str] = None


class StorageDisabled(Exception):
    """Raised when EMERGENT_LLM_KEY is missing or init failed."""


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise StorageDisabled("EMERGENT_LLM_KEY is not set")
    return key


def init_storage(force: bool = False) -> str:
    """Establish a session-scoped storage_key. Call ONCE at startup.

    Returns the cached key on subsequent calls unless ``force=True``.
    Raises ``StorageDisabled`` if the EMERGENT_LLM_KEY is missing.
    """
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    payload = {"emergent_key": _emergent_key()}
    resp = requests.post(f"{STORAGE_URL}/init", json=payload, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    log.info("Object storage initialized (app=%s)", APP_NAME)
    return _storage_key


def _request_with_retry(method: str, url: str, **kwargs):
    """Auto-retry on 403 (refresh key) + 429 (exponential backoff)."""
    for attempt in range(3):
        try:
            init_storage()
        except StorageDisabled:
            raise
        headers = kwargs.pop("headers", {}) or {}
        headers["X-Storage-Key"] = _storage_key
        resp = requests.request(method, url, headers=headers, **kwargs)
        if resp.status_code == 403 and attempt < 2:
            init_storage(force=True)
            continue
        if resp.status_code == 429 and attempt < 2:
            time.sleep(2 ** attempt)
            continue
        resp.raise_for_status()
        return resp
    raise RuntimeError("Object storage request retries exhausted")


def guess_content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    if not filename:
        return fallback
    ct, _ = mimetypes.guess_type(filename)
    return ct or fallback


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes to ``{APP_NAME}/<path>``. Returns the storage record."""
    full = f"{APP_NAME}/{path.lstrip('/')}"
    resp = _request_with_retry(
        "PUT",
        f"{STORAGE_URL}/objects/{full}",
        data=data,
        headers={"Content-Type": content_type},
        timeout=120,
    )
    return resp.json()


def get_object(path: str) -> Tuple[bytes, str]:
    """Download an object. Returns (bytes, content_type)."""
    full = path if path.startswith(f"{APP_NAME}/") else f"{APP_NAME}/{path.lstrip('/')}"
    resp = _request_with_retry(
        "GET", f"{STORAGE_URL}/objects/{full}", timeout=60
    )
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def is_enabled() -> bool:
    """True if EMERGENT_LLM_KEY is set + storage can init."""
    try:
        init_storage()
        return True
    except Exception:
        return False


__all__ = [
    "init_storage",
    "put_object",
    "get_object",
    "guess_content_type",
    "is_enabled",
    "StorageDisabled",
    "APP_NAME",
]
