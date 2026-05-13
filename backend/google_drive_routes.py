"""
Google Drive Mirror Sync.

Lets the founder connect ONE Google account (admin-side OAuth). Once connected,
each Project Mode project can flip a `sync_to_drive` toggle. When ON, every
file uploaded through `project_files_routes` is also mirrored to a Drive
folder named "Bloom Labs — {Project Name}". An explicit "Sync all now"
endpoint walks existing files and uploads any missing copies.

Storage:
  • Founder credentials → settings doc `google_drive_credentials` (single row,
    encrypted at rest by MongoDB's TLS / our hosting env). Refreshes on demand.
  • Per-project metadata → `pm_projects.sync_to_drive`, `drive_folder_id`,
    `last_sync_at`.
"""
from __future__ import annotations

import io
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import get_current_user
from app_settings import get_setting, set_setting

log = logging.getLogger("google_drive_routes")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db

GDRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]
GDRIVE_CREDS_KEY = "google_drive_credentials"


# -------------------------------------------------------------------------
# OAuth helpers
# -------------------------------------------------------------------------
def _client_config() -> Dict[str, Any]:
    cid = os.environ.get("GOOGLE_CLIENT_ID")
    secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI")
    if not (cid and secret and redirect):
        raise HTTPException(
            503,
            "Google Drive not configured — set GOOGLE_CLIENT_ID, "
            "GOOGLE_CLIENT_SECRET, GOOGLE_DRIVE_REDIRECT_URI in backend/.env",
        )
    return {
        "web": {
            "client_id": cid,
            "client_secret": secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect],
        }
    }


def _build_flow(scopes: Optional[List[str]] = None) -> Flow:
    cfg = _client_config()
    return Flow.from_client_config(
        cfg,
        scopes=scopes if scopes is not None else GDRIVE_SCOPES,
        redirect_uri=cfg["web"]["redirect_uris"][0],
    )


async def _load_creds(db: AsyncIOMotorDatabase) -> Optional[Credentials]:
    """Hydrate the founder's stored Drive credentials. Refreshes if expired."""
    blob = await get_setting(db, GDRIVE_CREDS_KEY)
    if not blob or not blob.get("refresh_token"):
        return None
    creds = Credentials(
        token=blob.get("access_token"),
        refresh_token=blob.get("refresh_token"),
        token_uri=blob.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=blob.get("client_id"),
        client_secret=blob.get("client_secret"),
        scopes=blob.get("scopes") or GDRIVE_SCOPES,
    )
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleAuthRequest())
            await _persist_creds(db, creds, account_email=blob.get("account_email"))
        except Exception as exc:  # noqa: BLE001
            log.warning("Drive token refresh failed: %s", exc)
            return None
    return creds


async def _persist_creds(
    db: AsyncIOMotorDatabase,
    creds: Credentials,
    account_email: Optional[str] = None,
) -> None:
    await set_setting(
        db,
        GDRIVE_CREDS_KEY,
        {
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes or GDRIVE_SCOPES),
            "expiry": creds.expiry.isoformat() if creds.expiry else None,
            "account_email": account_email,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )


def _drive_service(creds: Credentials):
    return build("drive", "v3", credentials=creds, cache_discovery=False)


# -------------------------------------------------------------------------
# Drive folder + file helpers
# -------------------------------------------------------------------------
async def _ensure_project_folder(
    db: AsyncIOMotorDatabase, project: Dict[str, Any], creds: Credentials
) -> str:
    """Return (and create if needed) the Drive folder ID for this project."""
    fid = project.get("drive_folder_id")
    if fid:
        return fid
    service = _drive_service(creds)
    folder_name = f"Bloom Labs — {project.get('name') or 'Untitled Project'}"
    meta = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    try:
        created = service.files().create(body=meta, fields="id, webViewLink").execute()
    except HttpError as exc:
        raise HTTPException(502, f"Failed to create Drive folder: {exc}") from exc
    fid = created["id"]
    await db.pm_projects.update_one(
        {"id": project["id"]},
        {"$set": {"drive_folder_id": fid, "drive_folder_link": created.get("webViewLink")}},
    )
    return fid


async def mirror_file_bytes_to_drive(
    db: AsyncIOMotorDatabase,
    project: Dict[str, Any],
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    project_file_id: str,
) -> Optional[Dict[str, Any]]:
    """Upload one file to the project's Drive folder.

    Returns the Drive file metadata (id + webViewLink) or None if Drive
    isn't configured/connected. Idempotent — if a `drive_file_id` is already
    on the project_files row we skip.
    """
    if not project.get("sync_to_drive"):
        return None
    creds = await _load_creds(db)
    if not creds:
        log.info("Drive not connected, skipping mirror for %s", filename)
        return None
    folder_id = await _ensure_project_folder(db, project, creds)
    service = _drive_service(creds)
    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type or "application/octet-stream")
    body = {"name": filename, "parents": [folder_id]}
    try:
        result = service.files().create(
            body=body, media_body=media, fields="id, webViewLink"
        ).execute()
    except HttpError as exc:
        log.warning("Drive upload failed for %s: %s", filename, exc)
        return None
    await db.project_files.update_one(
        {"id": project_file_id},
        {
            "$set": {
                "drive_file_id": result["id"],
                "drive_view_link": result.get("webViewLink"),
                "drive_synced_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    await db.pm_projects.update_one(
        {"id": project["id"]},
        {"$set": {"last_sync_at": datetime.now(timezone.utc).isoformat()}},
    )
    return result


# -------------------------------------------------------------------------
# Admin OAuth + sync routes
# -------------------------------------------------------------------------
gdrive_admin_router = APIRouter(
    prefix="/admin/google-drive",
    tags=["google-drive"],
)


@gdrive_admin_router.get("/status")
async def drive_status(
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Light status snapshot for the dashboard pill."""
    creds = None
    err: Optional[str] = None
    try:
        creds = await _load_creds(db)
    except Exception as exc:  # noqa: BLE001
        err = str(exc)
    configured = bool(
        os.environ.get("GOOGLE_CLIENT_ID")
        and os.environ.get("GOOGLE_CLIENT_SECRET")
        and os.environ.get("GOOGLE_DRIVE_REDIRECT_URI")
    )
    blob = await get_setting(db, GDRIVE_CREDS_KEY) or {}
    return {
        "configured": configured,
        "connected": bool(creds),
        "account_email": blob.get("account_email"),
        "scopes": blob.get("scopes"),
        "last_refresh_at": blob.get("updated_at"),
        "error": err,
    }


@gdrive_admin_router.get("/connect")
async def drive_connect(_user=Depends(get_current_user)) -> Dict[str, str]:
    """Return the OAuth URL the admin should visit to grant Drive access."""
    flow = _build_flow()
    auth_url, _state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return {"authorization_url": auth_url}


# Public callback (no admin auth — Google's redirect won't carry our JWT).
gdrive_oauth_router = APIRouter(
    prefix="/admin/google-drive/oauth",
    tags=["google-drive-oauth"],
)


@gdrive_oauth_router.get("/callback")
async def drive_callback(
    request: Request,
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Receive the OAuth code from Google and exchange it for tokens."""
    frontend = os.environ.get("FRONTEND_URL", "https://wave1-cleanups.preview.emergentagent.com")
    if error:
        return RedirectResponse(f"{frontend}/admin/integrations?drive_error={error}")
    if not code:
        return RedirectResponse(f"{frontend}/admin/integrations?drive_error=missing_code")
    # Accept any scopes Google chose to grant (Google may add userinfo.email/openid).
    flow = _build_flow(scopes=None)
    try:
        flow.fetch_token(code=code)
    except Exception as exc:  # noqa: BLE001
        log.warning("Drive token exchange failed: %s", exc)
        return RedirectResponse(f"{frontend}/admin/integrations?drive_error=exchange_failed")
    creds = flow.credentials
    # Required scope check (with subset semantics, per playbook).
    granted = set(creds.scopes or [])
    if not set(GDRIVE_SCOPES).issubset(granted):
        return RedirectResponse(f"{frontend}/admin/integrations?drive_error=missing_scope")
    # Best-effort fetch the connected Google account email for UI display.
    account_email: Optional[str] = None
    try:
        userinfo = build("oauth2", "v2", credentials=creds, cache_discovery=False).userinfo().get().execute()
        account_email = userinfo.get("email")
    except Exception:  # noqa: BLE001
        pass
    await _persist_creds(db, creds, account_email=account_email)
    return RedirectResponse(f"{frontend}/admin/integrations?drive_connected=1")


@gdrive_admin_router.post("/disconnect")
async def drive_disconnect(
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, bool]:
    await set_setting(db, GDRIVE_CREDS_KEY, None)
    return {"ok": True}


# -------------------------------------------------------------------------
# Per-project toggle + manual sync
# -------------------------------------------------------------------------
@gdrive_admin_router.post("/projects/{project_id}/toggle")
async def project_toggle(
    project_id: str,
    enable: bool = Query(...),
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    project = await db.pm_projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    if enable:
        # Verify Drive is connected before flipping the flag on.
        creds = await _load_creds(db)
        if not creds:
            raise HTTPException(400, "Connect Google Drive first")
        await _ensure_project_folder(db, project, creds)
    await db.pm_projects.update_one(
        {"id": project_id},
        {"$set": {"sync_to_drive": bool(enable)}},
    )
    fresh = await db.pm_projects.find_one({"id": project_id}, {"_id": 0})
    return {"ok": True, "project": fresh}


@gdrive_admin_router.post("/projects/{project_id}/sync-now")
async def project_sync_now(
    project_id: str,
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Walk every existing project_file for this project and upload any
    that haven't been mirrored yet."""
    project = await db.pm_projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.get("sync_to_drive"):
        raise HTTPException(400, "Project is not enabled for Drive sync")
    creds = await _load_creds(db)
    if not creds:
        raise HTTPException(400, "Drive not connected")
    client_email = (project.get("client_email") or "").lower()
    pending_files = await db.project_files.find(
        {
            "client_email": client_email,
            "is_deleted": {"$ne": True},
            "drive_file_id": {"$exists": False},
        },
        {"_id": 0},
    ).to_list(500)
    synced = 0
    failed = 0
    # We need the file bytes. The existing project_files API reads from object
    # storage — pull from there.
    from object_storage import get_object  # local import to avoid cycle
    for f in pending_files:
        try:
            file_bytes, _ct = get_object(f["storage_path"])
            res = await mirror_file_bytes_to_drive(
                db,
                project,
                file_bytes,
                filename=f.get("original_filename") or "file",
                mime_type=f.get("content_type") or "application/octet-stream",
                project_file_id=f["id"],
            )
            if res:
                synced += 1
            else:
                failed += 1
        except Exception as exc:  # noqa: BLE001
            log.warning("Manual sync failed for %s: %s", f.get("id"), exc)
            failed += 1
    return {
        "ok": True,
        "synced": synced,
        "failed": failed,
        "drive_folder_id": project.get("drive_folder_id"),
    }


__all__ = ["gdrive_admin_router", "gdrive_oauth_router", "mirror_file_bytes_to_drive"]
