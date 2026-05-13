"""Project Files — admin uploads, client portal downloads.

Admin uploads design deliverables / PDFs / mockups against either a
company (visible to all contacts) or a specific client_email. Files are
stored in Emergent Object Storage; metadata lives in `project_files`.

Soft-delete only — storage has no delete API.

Collection:
  project_files: {
    id, company_id?, client_email, storage_path, original_filename,
    content_type, size_bytes, category (deliverable|brief|mockup|invoice|other),
    notes, uploaded_by, uploaded_at, is_deleted
  }
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from motor.motor_asyncio import AsyncIOMotorDatabase

import object_storage
from activity_log import log_activity
from auth import get_current_user
from client_routes import get_current_client

log = logging.getLogger("project_files")

CATEGORIES = ("deliverable", "brief", "mockup", "invoice", "other")
MAX_BYTES = int(os.environ.get("PROJECT_FILE_MAX_MB", "100")) * 1024 * 1024


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _public(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip server-only fields before returning to the client."""
    return {
        "id": doc["id"],
        "company_id": doc.get("company_id"),
        "client_email": doc.get("client_email"),
        "original_filename": doc["original_filename"],
        "content_type": doc.get("content_type"),
        "size_bytes": doc.get("size_bytes"),
        "category": doc.get("category", "deliverable"),
        "notes": doc.get("notes"),
        "uploaded_by": doc.get("uploaded_by"),
        "uploaded_at": doc.get("uploaded_at"),
    }


# =========================================================================
# Admin
# =========================================================================
pf_admin_router = APIRouter(
    prefix="/admin/project-files",
    tags=["project-files"],
    dependencies=[Depends(get_current_user)],
)


@pf_admin_router.get("")
async def list_files(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client_email: Optional[str] = None,
    company_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    filt: Dict[str, Any] = {"is_deleted": {"$ne": True}}
    if client_email:
        filt["client_email"] = client_email.lower().strip()
    if company_id:
        filt["company_id"] = company_id
    rows = await db.project_files.find(filt, {"_id": 0}).sort("uploaded_at", -1).to_list(500)
    return [_public(d) for d in rows]


@pf_admin_router.post("")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    client_email: str = Form(...),
    company_id: Optional[str] = Form(None),
    category: str = Form("deliverable"),
    notes: Optional[str] = Form(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    if category not in CATEGORIES:
        raise HTTPException(400, f"category must be one of {CATEGORIES}")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"File exceeds {MAX_BYTES // (1024 * 1024)}MB limit")

    email = client_email.lower().strip()
    # Auto-resolve company_id by primary email if not provided.
    if not company_id:
        co = await db.companies.find_one(
            {"primary_email": email}, {"_id": 0, "id": 1}
        )
        company_id = (co or {}).get("id")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    storage_path = f"project-files/{email}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or object_storage.guess_content_type(file.filename or "")
    try:
        result = object_storage.put_object(storage_path, data, content_type)
    except object_storage.StorageDisabled as exc:
        raise HTTPException(503, f"Object storage not configured: {exc}")
    except Exception as exc:
        log.exception("Upload failed: %s", exc)
        raise HTTPException(500, "Upload failed")

    doc = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "client_email": email,
        "storage_path": result["path"],
        "original_filename": file.filename or storage_path.rsplit("/", 1)[-1],
        "content_type": content_type,
        "size_bytes": len(data),
        "category": category,
        "notes": (notes or "").strip() or None,
        "uploaded_by": (user.get("email") if isinstance(user, dict) else None),
        "uploaded_at": _now_iso(),
        "is_deleted": False,
    }
    await db.project_files.insert_one(doc)
    if company_id:
        await log_activity(
            db,
            company_id=company_id,
            type="project_file.uploaded",
            title=f"File uploaded — {doc['original_filename']}",
            meta={"file_id": doc["id"], "category": category},
        )
    return _public(doc)


@pf_admin_router.delete("/{file_id}")
async def soft_delete_file(
    file_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.project_files.update_one(
        {"id": file_id, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True, "deleted_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "File not found")
    return {"ok": True}


@pf_admin_router.get("/{file_id}/download")
async def admin_download(
    file_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Response:
    doc = await db.project_files.find_one({"id": file_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "File not found")
    data, _ = object_storage.get_object(doc["storage_path"])
    return Response(
        content=data,
        media_type=doc.get("content_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{doc["original_filename"]}"'
        },
    )


# =========================================================================
# Client portal
# =========================================================================
pf_client_router = APIRouter(
    prefix="/clients/me/project-files",
    tags=["project-files-client"],
)


@pf_client_router.get("")
async def list_my_files(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(get_current_client),
) -> List[Dict[str, Any]]:
    email = (client["email"] or "").lower()
    # Caller sees files explicitly addressed to their email, OR files attached
    # to any company they're a contact of.
    contact_ids = await db.contacts.find(
        {"email": email}, {"_id": 0, "company_id": 1}
    ).to_list(50)
    company_ids = [c.get("company_id") for c in contact_ids if c.get("company_id")]
    filt: Dict[str, Any] = {
        "is_deleted": {"$ne": True},
        "$or": [{"client_email": email}],
    }
    if company_ids:
        filt["$or"].append({"company_id": {"$in": company_ids}})
    rows = await db.project_files.find(filt, {"_id": 0}).sort("uploaded_at", -1).to_list(500)
    return [_public(d) for d in rows]


@pf_client_router.get("/{file_id}/download")
async def client_download(
    file_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(get_current_client),
) -> Response:
    doc = await db.project_files.find_one(
        {"id": file_id, "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "File not found")
    email = (client["email"] or "").lower()
    if doc.get("client_email") != email:
        # Allow if they're a contact of the company that owns the file.
        if doc.get("company_id"):
            contact = await db.contacts.find_one(
                {"email": email, "company_id": doc["company_id"]}, {"_id": 0, "id": 1}
            )
            if not contact:
                raise HTTPException(403, "Forbidden")
        else:
            raise HTTPException(403, "Forbidden")
    data, _ = object_storage.get_object(doc["storage_path"])
    return Response(
        content=data,
        media_type=doc.get("content_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{doc["original_filename"]}"'
        },
    )


__all__ = ["pf_admin_router", "pf_client_router", "CATEGORIES"]
