"""Client Portal Contact Us — email-only support pipeline.

After Phase A removed the ThriveDesk API integration, contact-form submissions
follow this flow:

  1. Client portal posts `subject + body + priority (+ optional attachment)`.
  2. Backend saves the record to `client_contacts` (kept for admin history).
  3. Branded "we received your message" email goes to the client (Emailit).
  4. Notification email to founder@thesalvador.group with the full body +
     attachment download link (Emailit).
  5. Slack ping for high-priority items.
  6. Auto-generated ticket reference (`BL-YYYY-####`) is included in every
     email subject so replies thread cleanly into ThriveDesk (admin manages
     ThriveDesk in a separate tab).

Owner-only attachment download endpoint persists.
"""
from __future__ import annotations

import logging
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import aiofiles
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
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

import object_storage
from auth import get_current_user
from client_routes import get_current_client
from db_utils import prepare_for_mongo, serialize_doc
import slack_notifier

log = logging.getLogger("client.contact")

UPLOAD_DIR = Path(os.environ.get("UPLOADS_DIR", "/app/backend/uploads"))
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_PRIORITIES = {"low", "medium", "high"}
FOUNDER_EMAIL = os.environ.get("FOUNDER_EMAIL", "founder@thesalvador.group")
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "support@bybloomlabs.com")
SUPPORT_VIP_EMAIL = os.environ.get("SUPPORT_VIP_EMAIL", "vipsupport@bybloomlabs.com")


def _ensure_upload_dir() -> Path:
    """Lazily create the uploads dir on first use to avoid crash-on-import
    in production read-only filesystems."""
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # pragma: no cover
        log.warning("Could not create UPLOAD_DIR %s: %s", UPLOAD_DIR, exc)
    return UPLOAD_DIR


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =========================================================================
# Ticket reference generator: BL-YYYY-####
# =========================================================================
async def _next_ticket_ref(db: AsyncIOMotorDatabase) -> str:
    """Atomically increments a per-year counter to mint the next ticket ref.

    Persisted in `app_settings.ticket_counter.{year}` so it survives
    restarts. Format: `BL-2026-0001` (4-digit zero-padded sequence).
    """
    year = _now().year
    res = await db.app_settings.find_one_and_update(
        {"_id": "ticket_counter"},
        {"$inc": {f"counters.{year}": 1}},
        upsert=True,
        return_document=True,
    )
    seq = (((res or {}).get("counters") or {}).get(str(year))) or 1
    return f"BL-{year}-{seq:04d}"


# =========================================================================
# Client-facing router
# =========================================================================
client_contact_router = APIRouter(
    prefix="/clients/me/contact",
    tags=["client-contact"],
)


@client_contact_router.post("")
async def submit_contact(
    request: Request,
    subject: str = Form(..., min_length=2, max_length=200),
    body: str = Form(..., min_length=2, max_length=5000),
    priority: str = Form("medium"),
    file: Optional[UploadFile] = File(None),
    client=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Save a portal contact submission + notify founder via email + Slack."""
    pri = (priority or "medium").lower().strip()
    if pri not in ALLOWED_PRIORITIES:
        raise HTTPException(422, "Priority must be one of: Low, Medium, High")

    # --- Handle attachment ---
    attachment_meta = None
    if file and (file.filename or "").strip():
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File must be under 10MB")
        if contents:
            # Try object storage first; fall back to disk if storage is unavailable
            # (keeps the contact form functional even during outages or in test
            # environments without EMERGENT_LLM_KEY).
            attachment_id = uuid4().hex
            ext = Path(file.filename).suffix.lower()[:10] or ".bin"
            content_type = (
                file.content_type or mimetypes.guess_type(file.filename)[0]
            )
            client_email_lc = (client.get("email") or "").lower()
            storage_path: Optional[str] = None
            disk_path: Optional[str] = None
            try:
                rel = f"contact-attachments/{client_email_lc}/{attachment_id}{ext}"
                result = object_storage.put_object(
                    rel, contents, content_type or "application/octet-stream"
                )
                storage_path = result["path"]
            except object_storage.StorageDisabled:
                # Fall through to disk
                pass
            except Exception as exc:
                log.warning(
                    "Object storage put failed for contact attachment, falling back to disk: %s",
                    exc,
                )

            if not storage_path:
                stored_name = f"{attachment_id}{ext}"
                disk_target = _ensure_upload_dir() / stored_name
                async with aiofiles.open(disk_target, "wb") as fh:
                    await fh.write(contents)
                disk_path = str(disk_target)

            attachment_meta = {
                "id": attachment_id,
                "original_name": file.filename,
                "size_bytes": len(contents),
                "content_type": content_type,
                "storage_path": storage_path,  # set if uploaded to object storage
                "stored_path": disk_path,  # set if fell back to disk
            }

    client_email = client.get("email")
    client_name = client.get("name") or client_email.split("@")[0]
    contact_id = str(uuid4())
    ticket_ref = await _next_ticket_ref(db)

    # --- Persist contact record ---
    doc = {
        "id": contact_id,
        "ticket_ref": ticket_ref,
        "client_email": client_email,
        "client_name": client_name,
        "subject": subject,
        "body": body,
        "priority": pri,
        "attachment": attachment_meta,
        "status": "open",
        "created_at": _iso(_now()),
        "resolved_at": None,
    }
    await db.client_contacts.insert_one(prepare_for_mongo(doc))

    # --- Confirmation email to the client (branded template) ---
    try:
        import email_service

        emailit = request.app.state.emailit
        await email_service.send_support_ack(
            emailit,
            to=client_email,
            name=client_name,
            subject_line=f"[{ticket_ref}] {subject}",
            ticket_id=ticket_ref,
        )
    except Exception as exc:
        log.warning("Client ack email failed for %s: %s", client_email, exc)

    # --- Founder email notification ---
    try:
        await _email_founder_notification(
            request,
            ticket_ref=ticket_ref,
            client_email=client_email,
            client_name=client_name,
            subject=subject,
            body=body,
            priority=pri,
            attachment=attachment_meta,
            db=db,
        )
    except Exception as exc:
        log.warning("Founder notify email failed: %s", exc)

    # --- Slack notification (best-effort) ---
    slack_text = (
        f"📩 *New portal contact* `[{ticket_ref}]`\n"
        f"Client: *{client_name}* ({client_email})\n"
        f"Priority: *{pri.upper()}* · Subject: {subject}"
    )
    slack_res = await slack_notifier.post_message(db, text=slack_text)

    fresh = await db.client_contacts.find_one({"id": contact_id}, {"_id": 0})
    if fresh and fresh.get("attachment"):
        fresh["attachment"] = {
            k: v
            for k, v in fresh["attachment"].items()
            if k not in ("stored_path", "storage_path")
        }
    return {
        "contact": serialize_doc(fresh),
        "ticket_ref": ticket_ref,
        "slack_ok": bool(slack_res.get("ok")),
    }


@client_contact_router.get("")
async def list_my_contacts(
    client=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = (
        await db.client_contacts.find(
            {"client_email": client["email"]}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(100)
    )
    for d in docs:
        if d.get("attachment"):
            d["attachment"] = {
                k: v
                for k, v in d["attachment"].items()
                if k not in ("stored_path", "storage_path")
            }
    return [serialize_doc(d) for d in docs]


@client_contact_router.get("/attachment/{attachment_id}")
async def download_attachment(
    attachment_id: str,
    client=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Owner-only file download. Verifies the requesting client matches the
    contact's `client_email` before serving. Supports both new object-storage
    attachments and legacy disk-stored ones (backward compat)."""
    contact = await db.client_contacts.find_one(
        {
            "attachment.id": attachment_id,
            "client_email": client["email"],
        },
        {"_id": 0},
    )
    if not contact or not contact.get("attachment"):
        raise HTTPException(404, "Not found")
    att = contact["attachment"]
    content_type = att.get("content_type") or "application/octet-stream"
    filename = att.get("original_name") or attachment_id

    # 1. New path — object storage
    storage_path = att.get("storage_path")
    if storage_path:
        try:
            data, _ = object_storage.get_object(storage_path)
        except Exception as exc:
            log.warning("Object storage fetch failed for %s: %s", storage_path, exc)
            raise HTTPException(410, "File no longer available")
        return Response(
            content=data,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )

    # 2. Legacy path — local disk
    disk_path = Path(att.get("stored_path") or "")
    if disk_path and disk_path.exists():
        return FileResponse(
            path=disk_path,
            media_type=content_type,
            filename=filename,
        )

    raise HTTPException(410, "File no longer available")


# =========================================================================
# Admin router — list/search portal contacts (powers Phase I ticket lookup)
# =========================================================================
contact_admin_router = APIRouter(
    prefix="/admin/portal-contacts",
    tags=["portal-contacts-admin"],
    dependencies=[Depends(get_current_user)],
)


@contact_admin_router.get("")
async def admin_list_contacts(
    db: AsyncIOMotorDatabase = Depends(get_db),
    status: Optional[str] = None,
    q: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List portal contacts. `q` matches ticket_ref, email, or subject."""
    filt: Dict[str, Any] = {}
    if status:
        filt["status"] = status
    if q:
        from re import escape

        rx = {"$regex": escape(q), "$options": "i"}
        filt["$or"] = [
            {"ticket_ref": rx},
            {"client_email": rx},
            {"client_name": rx},
            {"subject": rx},
            {"body": rx},
        ]
    docs = (
        await db.client_contacts.find(filt, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    for d in docs:
        if d.get("attachment"):
            d["attachment"] = {
                k: v for k, v in d["attachment"].items() if k != "stored_path"
            }
    return [serialize_doc(d) for d in docs]


@contact_admin_router.post("/{contact_id}/resolve")
async def admin_resolve_contact(
    contact_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    res = await db.client_contacts.update_one(
        {"id": contact_id},
        {"$set": {"status": "resolved", "resolved_at": _iso(_now())}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Contact not found")
    return {"ok": True}


# =========================================================================
# Email helpers
# =========================================================================
async def _email_founder_notification(
    request: Request,
    *,
    ticket_ref: str,
    client_email: str,
    client_name: str,
    subject: str,
    body: str,
    priority: str,
    attachment: Optional[Dict[str, Any]],
    db: AsyncIOMotorDatabase,
) -> None:
    """Forward the contact submission to support@ AND founder via Emailit so
    they can reply directly. Subject includes the ticket ref for clean
    threading. Payload carries full client metadata so ThriveDesk can attribute
    + update the contact record."""
    emailit = request.app.state.emailit
    if not getattr(emailit, "is_configured", False):
        return
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")

    # Enrich with client company + support tier info so support sees who's writing.
    client_doc = await db.clients.find_one(
        {"email": client_email.lower()},
        {"_id": 0, "phone": 1, "company": 1, "created_at": 1},
    ) or {}
    company_doc = await db.companies.find_one(
        {"primary_email": client_email.lower()},
        {"_id": 0, "name": 1, "support_uid": 1, "support_tier": 1, "id": 1},
    ) or {}
    metadata_rows = []
    if client_doc.get("phone"):
        metadata_rows.append(("Phone", client_doc["phone"]))
    if client_doc.get("company") or company_doc.get("name"):
        metadata_rows.append(("Company", company_doc.get("name") or client_doc.get("company")))
    if company_doc.get("support_uid"):
        metadata_rows.append(("Support UID", company_doc["support_uid"]))
    if company_doc.get("support_tier"):
        metadata_rows.append(("Tier", company_doc["support_tier"].upper()))
    if client_doc.get("created_at"):
        metadata_rows.append(("Client since", str(client_doc["created_at"])[:10]))
    portal_company_link = (
        f"{base}/admin/companies/{company_doc['id']}" if company_doc.get("id") else ""
    )
    metadata_html = ""
    if metadata_rows:
        rows = "".join(
            f"<tr><td style='padding:2px 12px 2px 0;color:#64748B;font-size:12px;'>{_esc(k)}</td>"
            f"<td style='padding:2px 0;font-size:13px;color:#0F172A;'>{_esc(str(v))}</td></tr>"
            for k, v in metadata_rows
        )
        metadata_html = (
            "<table style='border-collapse:collapse;margin:8px 0 16px;'>"
            f"{rows}"
            "</table>"
        )

    attachment_block = ""
    if attachment:
        link = f"{base}/api/clients/me/contact/attachment/{attachment['id']}"
        attachment_block = (
            f"<p><strong>Attachment:</strong> {_esc(attachment.get('original_name', ''))} "
            f"({_human_size(attachment.get('size_bytes', 0))})<br>"
            f"<a href='{link}'>{link}</a></p>"
        )
    pri_color = {"high": "#DC2626", "medium": "#F59E0B", "low": "#64748B"}.get(
        priority.lower(), "#64748B"
    )
    portal_link_html = (
        f"<p style='margin:16px 0 0;'><a href='{portal_company_link}' "
        f"style='color:#1E3A8A;font-size:12px;'>Open company in admin →</a></p>"
        if portal_company_link
        else ""
    )
    html = (
        f"<div style='font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0F172A;padding:24px;max-width:640px;'>"
        f"<p style='color:#64748B;font-size:12px;margin:0 0 8px;'>Ticket ref</p>"
        f"<p style='font-family:ui-monospace,Menlo,monospace;font-size:14px;font-weight:600;margin:0 0 16px;color:#1E3A8A;'>{ticket_ref}</p>"
        f"<h2 style='color:#1E3A8A;margin:0 0 8px;'>{_esc(subject)}</h2>"
        f"<p style='margin:0 0 4px;'>"
        f"From: <strong>{_esc(client_name)}</strong> &lt;{_esc(client_email)}&gt; · "
        f"Priority: <span style='color:{pri_color};font-weight:600;'>{priority.upper()}</span>"
        f"</p>"
        f"{metadata_html}"
        f"<div style='border-left:3px solid #1E3A8A;padding:12px 16px;background:#F8FAFC;border-radius:8px;'>"
        f"<p style='margin:0;white-space:pre-wrap;'>{_esc(body)}</p>"
        f"</div>"
        f"{attachment_block}"
        f"{portal_link_html}"
        f"<p style='color:#94A3B8;font-size:12px;margin-top:24px;'>"
        f"Reply to this email — your response goes straight to the client. "
        f"Paste <code>{ticket_ref}</code> into ThriveDesk to thread."
        f"</p>"
        f"</div>"
    )
    text = (
        f"[{ticket_ref}] {subject}\n\n"
        f"From: {client_name} <{client_email}> · Priority: {priority.upper()}\n"
        + "".join(f"{k}: {v}\n" for k, v in metadata_rows)
        + "\n"
        f"{body}\n\n"
        + (
            f"Attachment: {attachment.get('original_name')} ({_human_size(attachment.get('size_bytes', 0))})\n"
            f"{base}/api/clients/me/contact/attachment/{attachment['id']}\n"
            if attachment
            else ""
        )
    )

    # Route to support@ (primary) + cc founder. Standard headers carry the
    # full client context — ThriveDesk uses these to attribute the inbound
    # message to the right contact record.
    extra_headers = {
        "Reply-To": client_email,
        "X-Bloom-Ticket": ticket_ref,
        "X-Bloom-Client-Email": client_email,
        "X-Bloom-Client-Name": client_name,
        "X-Bloom-Priority": priority,
    }
    if company_doc.get("support_uid"):
        extra_headers["X-Bloom-Support-UID"] = company_doc["support_uid"]
    if company_doc.get("name"):
        extra_headers["X-Bloom-Company"] = company_doc["name"]

    # Phase I (Feb 2026): tier-aware routing. VIP tickets go to a dedicated
    # inbox; Standard / Premium / no-plan stays on the general support inbox.
    company_tier = (company_doc.get("support_tier") or "none").lower()
    primary_to = SUPPORT_VIP_EMAIL if company_tier == "vip" else SUPPORT_EMAIL
    extra_headers["X-Bloom-Routed-Tier"] = company_tier
    cc_list = [FOUNDER_EMAIL] if FOUNDER_EMAIL and FOUNDER_EMAIL != primary_to else None

    try:
        await emailit.send_email(
            to=primary_to,
            cc=cc_list,
            reply_to=client_email,
            subject=f"[{ticket_ref}] {subject}",
            html=html,
            text=text,
            headers=extra_headers,
        )
    except TypeError:
        # Fallback if the emailit client doesn't yet support cc/headers kwargs
        await emailit.send_email(
            to=primary_to,
            reply_to=client_email,
            subject=f"[{ticket_ref}] {subject}",
            html=html,
            text=text,
        )


def _human_size(n: int) -> str:
    n = int(n or 0)
    for unit in ("B", "KB", "MB"):
        if n < 1024 or unit == "MB":
            return f"{n:.0f}{unit}" if unit == "B" else f"{n / 1024:.1f}{unit}"
        n = int(n / 1024)
    return f"{n}MB"


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


__all__ = [
    "client_contact_router",
    "contact_admin_router",
    "_next_ticket_ref",
]
