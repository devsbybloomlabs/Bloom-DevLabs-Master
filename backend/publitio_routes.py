"""
Client-facing upload routes that proxy through Publit.io.

Used by the onboarding wizard's Step 3 company-logo field. Validates the file
on the server (size + extension + magic bytes) then signs the request and
forwards to Publit.io. Returns the CDN URL so the frontend can store it on
the onboarding doc.

Mounted under /api as ``/clients/me/uploads/*`` (client-auth) and
``/admin/uploads/*`` (admin-auth).
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from auth import get_current_user
from client_routes import get_current_client
from publitio_client import PublitioClient, PublitioError

log = logging.getLogger("publitio_routes")


# 5 MB ceiling enforced server-side; the frontend already pre-validates but we
# don't trust browser-side checks.
MAX_LOGO_BYTES = 5 * 1024 * 1024
ALLOWED_LOGO_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/svg+xml",
}
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg"}

# Magic byte signatures — defense in depth, MIME headers can be forged.
MAGIC_BYTES = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/jpg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
    # SVG is plain XML, allow a broader prefix.
    "image/svg+xml": (b"<?xml", b"<svg", b" <"),
}


def _safe_basename(name: str) -> str:
    name = (name or "").strip().lower()
    base = re.sub(r"[^a-z0-9._-]+", "-", name).strip("-")
    return base[-60:] or f"upload-{uuid.uuid4().hex[:6]}"


def _validate_logo(file_bytes: bytes, filename: str, content_type: str) -> None:
    if not file_bytes:
        raise HTTPException(400, "Empty file")
    if len(file_bytes) > MAX_LOGO_BYTES:
        raise HTTPException(
            413, f"Logo exceeds {MAX_LOGO_BYTES // (1024 * 1024)}MB limit"
        )
    ct = (content_type or "").lower()
    if ct not in ALLOWED_LOGO_TYPES:
        raise HTTPException(
            415, f"Unsupported content-type '{content_type}'. Allowed: png/jpg/webp/svg"
        )
    _, ext = os.path.splitext(filename or "")
    if ext.lower() not in ALLOWED_LOGO_EXTENSIONS:
        raise HTTPException(
            415, f"Unsupported extension '{ext}'. Allowed: png/jpg/webp/svg"
        )
    expected_prefixes = MAGIC_BYTES.get(ct) or ()
    if expected_prefixes and not any(
        file_bytes.startswith(p) for p in expected_prefixes
    ):
        raise HTTPException(400, "File content does not match the declared format")


def _get_publitio(request: Request) -> PublitioClient:
    client = getattr(request.app.state, "publitio", None)
    if client is None:
        client = PublitioClient()
        request.app.state.publitio = client
    return client


async def _upload_logo_handler(
    request: Request, file: UploadFile, folder: str
) -> Dict[str, Any]:
    body = await file.read()
    _validate_logo(body, file.filename or "logo", file.content_type or "")
    publitio = _get_publitio(request)
    if not publitio.is_configured:
        raise HTTPException(503, "Publit.io credentials not configured")
    public_id = f"{folder}/{_safe_basename(file.filename or 'logo')}-{uuid.uuid4().hex[:8]}"
    try:
        res = await publitio.upload(
            file_bytes=body,
            filename=file.filename or "logo",
            content_type=file.content_type or "application/octet-stream",
            public_id=public_id,
        )
    except PublitioError as exc:
        log.warning("Publit.io upload failed: %s", exc)
        raise HTTPException(502, f"Upload to CDN failed: {exc}") from exc
    cdn_url, thumb_url = PublitioClient.extract_urls(res)
    if not cdn_url:
        raise HTTPException(502, "Publit.io did not return a URL")
    return {
        "ok": True,
        "url": cdn_url,
        "thumbnail_url": thumb_url,
        "public_id": res.get("public_id") or public_id,
        "size_bytes": len(body),
        "content_type": file.content_type,
        "filename": file.filename,
    }


# ---------------------------------------------------------------------------
# Client-auth routes
# ---------------------------------------------------------------------------
publitio_client_router = APIRouter(
    prefix="/clients/me/uploads",
    tags=["publitio_client"],
)


@publitio_client_router.post("/logo")
async def client_upload_logo(
    request: Request,
    file: UploadFile = File(...),
    client=Depends(get_current_client),
) -> Dict[str, Any]:
    """Upload a company logo during onboarding. Returns the CDN URL."""
    folder = f"bloom-labs/onboarding/{client['email']}"
    return await _upload_logo_handler(request, file, folder=folder)


# ---------------------------------------------------------------------------
# Admin routes (uses same handler)
# ---------------------------------------------------------------------------
publitio_admin_router = APIRouter(
    prefix="/admin/uploads",
    tags=["publitio_admin"],
    dependencies=[Depends(get_current_user)],
)


@publitio_admin_router.post("/logo")
async def admin_upload_logo(
    request: Request,
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    return await _upload_logo_handler(request, file, folder="bloom-labs/admin")


__all__: List[str] = ["publitio_client_router", "publitio_admin_router"]
