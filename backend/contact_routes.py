"""Client Portal Contact Us → ThriveDesk pipeline (Part 6).

End-to-end flow:

  1. Client logged into the portal hits POST /api/clients/me/contact with:
       • subject, body, priority (Low|Medium|High), optional file (≤10MB)
     The endpoint:
       a. Saves the file to /app/backend/uploads/<uuid>.<ext>
       b. Creates a ThriveDesk conversation via REST (or queues if scope-limited)
       c. Inserts `client_contacts` Mongo doc {id, client_email, subject, body, priority,
          attachment_path, ticket_id, status: 'sent'|'queued', created_at, retries}
       d. Emailit confirmation to client ("Your message has been received…")
       e. Slack alert to the channel that owns the incoming webhook
       f. If ThriveDesk failed → admin notification queued + `status='queued'`
  2. Hourly cron (`thrivedesk_retry_cron`) retries every queued message
     up to 6 times (1h backoff). Stops once `status='sent'` or `retries >= 6`.
  3. Reverse-sync: when a ThriveDesk ticket flagged with `Portal_Contact = Yes`
     is moved to status "Resolved" (via existing webhook receiver), we email
     the client a "Your support request has been resolved" message.

Files served via GET /api/clients/me/contact/attachment/{id} — only the owner
(matched by `client_email` in JWT) can download.
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
    UploadFile,
)
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import get_current_user
from client_routes import get_current_client
from db_utils import prepare_for_mongo, serialize_doc
from models import NotificationItem
from thrivedesk_client import ThriveDeskClient
import slack_notifier

log = logging.getLogger("client.contact")

UPLOAD_DIR = Path(os.environ.get("UPLOADS_DIR", "/app/backend/uploads"))
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_PRIORITIES = {"low", "medium", "high"}
PRIORITY_TO_TD = {"low": "Low", "medium": "Normal", "high": "High"}


def _ensure_upload_dir() -> Path:
    """Lazily create the uploads dir on first use.

    Doing this at module import time crashes the entire backend if the
    filesystem layer is read-only (common in production containers), so
    we defer it to actual upload time and swallow EEXIST/permission errors
    in favour of returning the path for caller-side handling.
    """
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


def get_td(request: Request) -> ThriveDeskClient:
    return request.app.state.thrivedesk


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
    td: ThriveDeskClient = Depends(get_td),
) -> Dict[str, Any]:
    """Create a support ticket from a client portal submission."""
    pri = (priority or "medium").lower().strip()
    if pri not in ALLOWED_PRIORITIES:
        raise HTTPException(422, "Priority must be one of: Low, Medium, High")

    # --- Handle attachment ---
    attachment_meta = None
    if file and (file.filename or "").strip():
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "File must be under 10MB")
        if not contents:
            file = None
        else:
            ext = Path(file.filename).suffix.lower()[:10] or ".bin"
            stored_name = f"{uuid4().hex}{ext}"
            stored_path = _ensure_upload_dir() / stored_name
            async with aiofiles.open(stored_path, "wb") as f:
                await f.write(contents)
            attachment_meta = {
                "id": stored_name,
                "original_name": file.filename,
                "size_bytes": len(contents),
                "content_type": file.content_type or mimetypes.guess_type(file.filename)[0],
                "stored_path": str(stored_path),
            }

    client_email = client.get("email")
    client_name = client.get("name") or client_email.split("@")[0]

    # --- Build the ThriveDesk payload ---
    contact_id = str(uuid4())
    td_payload = {
        "subject": subject,
        "message": _format_td_message(body, attachment_meta, request),
        "customer": {"email": client_email, "name": client_name},
        "priority": PRIORITY_TO_TD[pri],
        "tags": ["portal-contact"],
        "customFields": {"Portal_Contact": "Yes", "Portal_Contact_Id": contact_id},
    }

    # --- Try ThriveDesk; tolerate scope-limited fallback ---
    td_res = await td.create_conversation(td_payload) if hasattr(td, "create_conversation") else {
        "success": False,
        "status": 0,
        "data": None,
        "error": "create_conversation not yet implemented on client",
    }
    ticket_id = None
    queued = False
    if td_res.get("success"):
        data = td_res.get("data") or {}
        ticket_id = data.get("id") or data.get("conversationId") or data.get("ticketId")
        status = "sent"
        if data.get("scope_limited"):
            queued = True
            status = "queued"
    else:
        status = "queued"
        queued = True

    # --- Persist contact record ---
    doc = {
        "id": contact_id,
        "client_email": client_email,
        "client_name": client_name,
        "subject": subject,
        "body": body,
        "priority": pri,
        "attachment": attachment_meta,
        "ticket_id": ticket_id,
        "status": status,
        "td_error": td_res.get("error") if not td_res.get("success") else None,
        "td_mode": td.mode,
        "retries": 0,
        "created_at": _iso(_now()),
        "last_retry_at": None,
        "resolved_at": None,
    }
    await db.client_contacts.insert_one(prepare_for_mongo(doc))

    # --- Slack notification (best-effort) ---
    slack_text = (
        f"📩 *New portal contact* — *{client_name}* ({client_email})\n"
        f"Priority: *{PRIORITY_TO_TD[pri]}* · Subject: {subject}\n"
        f"{'⚠️ ThriveDesk queued (will retry)' if queued else '✅ Ticket created'}"
    )
    if ticket_id:
        slack_text += f"\n<{td.ticket_url(ticket_id)}|View in ThriveDesk>"
    slack_res = await slack_notifier.post_message(db, text=slack_text)

    # --- Confirmation email to the client (branded template) ---
    try:
        import email_service

        emailit = request.app.state.emailit
        await email_service.send_support_ack(
            emailit,
            to=client_email,
            name=client_name,
            subject_line=subject,
            ticket_id=str(ticket_id or ""),
        )
    except Exception as exc:
        log.warning("confirmation email failed for %s: %s", client_email, exc)

    # --- If queued, queue admin notification ---
    if queued:
        notif = NotificationItem(
            kind="portal_contact_queued",
            title=f"⚠️ Portal contact queued — {subject}",
            body=(
                f"Client: {client_name} ({client_email})\nPriority: {PRIORITY_TO_TD[pri]}\n"
                f"Reason: {td_res.get('error') or 'ThriveDesk write scope unavailable'}\n"
                f"Will retry hourly (max 6 attempts)."
            ),
            link="/admin/support-triage",
        )
        await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))

    fresh = await db.client_contacts.find_one({"id": contact_id}, {"_id": 0})
    return {
        "contact": serialize_doc(fresh),
        "slack_ok": bool(slack_res.get("ok")),
        "td_mode": td.mode,
        "queued": queued,
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
    # Strip server-only fields like stored_path before returning
    for d in docs:
        if d.get("attachment"):
            d["attachment"] = {
                k: v for k, v in d["attachment"].items() if k != "stored_path"
            }
    return [serialize_doc(d) for d in docs]


@client_contact_router.get("/attachment/{attachment_id}")
async def download_attachment(
    attachment_id: str,
    client=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Owner-only file download. Verifies the requesting client matches the
    contact's `client_email` before serving."""
    contact = await db.client_contacts.find_one(
        {
            "attachment.id": attachment_id,
            "client_email": client["email"],
        },
        {"_id": 0},
    )
    if not contact or not contact.get("attachment"):
        raise HTTPException(404, "Not found")
    stored_path = Path(contact["attachment"].get("stored_path") or "")
    if not stored_path.exists():
        raise HTTPException(410, "File no longer available")
    # Re-derive content type defensively
    content_type = contact["attachment"].get("content_type") or "application/octet-stream"
    return FileResponse(
        path=stored_path,
        media_type=content_type,
        filename=contact["attachment"].get("original_name") or attachment_id,
    )


# =========================================================================
# Admin router — list/inspect/retry portal contacts
# =========================================================================
contact_admin_router = APIRouter(
    prefix="/admin/portal-contacts",
    tags=["portal-contacts-admin"],
)


@contact_admin_router.get("")
async def admin_list_contacts(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    # Manual dep check — keeps OpenAPI quiet about double-auth
    await get_current_user(request)
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    docs = (
        await db.client_contacts.find(q, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    for d in docs:
        if d.get("attachment"):
            d["attachment"] = {
                k: v for k, v in d["attachment"].items() if k != "stored_path"
            }
    return [serialize_doc(d) for d in docs]


@contact_admin_router.post("/{contact_id}/retry")
async def admin_retry_contact(
    contact_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    td: ThriveDeskClient = Depends(get_td),
) -> Dict[str, Any]:
    await get_current_user(request)
    return await _retry_single(request, db, td, contact_id)


# =========================================================================
# Retry logic + cron entry point
# =========================================================================
async def _retry_single(
    request: Request,
    db: AsyncIOMotorDatabase,
    td: ThriveDeskClient,
    contact_id: str,
) -> Dict[str, Any]:
    doc = await db.client_contacts.find_one({"id": contact_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Contact not found")
    if doc.get("status") == "sent":
        return {"contact_id": contact_id, "outcome": "already_sent"}
    if (doc.get("retries") or 0) >= 6:
        return {"contact_id": contact_id, "outcome": "max_retries_reached"}

    td_payload = {
        "subject": doc["subject"],
        "message": _format_td_message(
            doc["body"], doc.get("attachment"), request
        ),
        "customer": {"email": doc["client_email"], "name": doc.get("client_name")},
        "priority": PRIORITY_TO_TD.get(doc.get("priority", "medium"), "Normal"),
        "tags": ["portal-contact"],
        "customFields": {"Portal_Contact": "Yes", "Portal_Contact_Id": contact_id},
    }
    res = await td.create_conversation(td_payload) if hasattr(td, "create_conversation") else {
        "success": False,
        "error": "create_conversation not yet implemented",
    }
    if res.get("success") and not (res.get("data") or {}).get("scope_limited"):
        ticket_id = (res.get("data") or {}).get("id") or (res.get("data") or {}).get("ticketId")
        await db.client_contacts.update_one(
            {"id": contact_id},
            {
                "$set": {
                    "status": "sent",
                    "ticket_id": ticket_id,
                    "td_error": None,
                    "last_retry_at": _iso(_now()),
                },
                "$inc": {"retries": 1},
            },
        )
        return {"contact_id": contact_id, "outcome": "sent", "ticket_id": ticket_id}

    # Still failing
    await db.client_contacts.update_one(
        {"id": contact_id},
        {
            "$set": {
                "td_error": res.get("error") or "ThriveDesk write unavailable",
                "last_retry_at": _iso(_now()),
            },
            "$inc": {"retries": 1},
        },
    )
    return {"contact_id": contact_id, "outcome": "retry_failed", "error": res.get("error")}


async def thrivedesk_retry_cron(app) -> Dict[str, int]:
    """Re-attempt every queued portal contact (up to 6 tries).

    Wired into the APScheduler hourly job in `server.py`.
    """
    db = app.state.db
    td: ThriveDeskClient = app.state.thrivedesk
    sent = 0
    failed = 0
    cursor = db.client_contacts.find(
        {"status": "queued", "retries": {"$lt": 6}}, {"_id": 0}
    )
    async for doc in cursor:
        try:
            # Build a synthetic request-like object — _retry_single only uses
            # request.app.state.* for emailit which we don't touch on retry.
            class _ReqStub:
                pass

            req = _ReqStub()
            req.app = app  # type: ignore
            res = await _retry_single(req, db, td, doc["id"])  # type: ignore[arg-type]
            if res.get("outcome") == "sent":
                sent += 1
            else:
                failed += 1
        except Exception as exc:
            failed += 1
            log.warning("retry failed for %s: %s", doc.get("id"), exc)
    return {"sent": sent, "failed": failed}


# =========================================================================
# Reverse-sync: ThriveDesk resolves a Portal_Contact ticket → email client
# =========================================================================
async def relay_td_resolution_to_client(
    request: Request,
    db: AsyncIOMotorDatabase,
    ticket_id: Any,
) -> Optional[Dict[str, Any]]:
    """Hook into the ThriveDesk webhook receiver — when a ticket flagged
    Portal_Contact=Yes is marked Resolved/Closed, email the client."""
    if not ticket_id:
        return None
    contact = await db.client_contacts.find_one(
        {"ticket_id": str(ticket_id)}, {"_id": 0}
    )
    if not contact:
        return None
    if contact.get("resolved_at"):
        return {"outcome": "already_emailed"}
    try:
        emailit = request.app.state.emailit
        if getattr(emailit, "is_configured", False):
            await emailit.send_email(
                to=contact["client_email"],
                subject=f"Resolved: {contact['subject']}",
                html=_build_resolution_html(contact),
                text=_build_resolution_text(contact),
            )
    except Exception as exc:
        log.warning("resolution email failed for %s: %s", contact.get("client_email"), exc)
    await db.client_contacts.update_one(
        {"id": contact["id"]},
        {"$set": {"status": "resolved", "resolved_at": _iso(_now())}},
    )
    return {"outcome": "emailed", "contact_id": contact["id"]}


# =========================================================================
# Helpers
# =========================================================================
def _format_td_message(
    body: str, attachment: Optional[Dict[str, Any]], request: Request
) -> str:
    out = body
    if attachment:
        base = os.environ.get("APP_BASE_URL", "").rstrip("/")
        if not base:
            base = str(request.base_url).rstrip("/")
        link = f"{base}/api/clients/me/contact/attachment/{attachment['id']}"
        out += (
            "\n\n---\nAttachment: "
            f"{attachment.get('original_name')} "
            f"({_human_size(attachment.get('size_bytes') or 0)})\n"
            f"Download: {link}"
        )
    return out


def _human_size(n: int) -> str:
    for unit in ("B", "KB", "MB"):
        if n < 1024 or unit == "MB":
            return f"{n:.0f}{unit}" if unit == "B" else f"{n / 1024:.1f}{unit}"
        n = int(n / 1024)
    return f"{n}MB"


def _build_confirmation_html(name: str, subject: str, queued: bool) -> str:
    note = (
        "We're processing it and will respond within 2 hours."
        if not queued
        else "We've received it; our team has been notified directly via Slack and will follow up shortly."
    )
    return (
        "<div style='font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0F172A;padding:24px;max-width:520px;'>"
        f"<h2 style='color:#1E3A8A;margin-top:0;'>We've got your message, {_esc(name)}</h2>"
        f"<p>Subject: <strong>{_esc(subject)}</strong></p>"
        f"<p>{note}</p>"
        "<p style='color:#94A3B8;font-size:13px;'>— The Bloom Labs Team</p>"
        "</div>"
    )


def _build_confirmation_text(name: str, subject: str, queued: bool) -> str:
    note = (
        "We're processing it and will respond within 2 hours."
        if not queued
        else "We've received it; our team has been notified via Slack and will follow up shortly."
    )
    return (
        f"Hi {name},\n\nWe've received your message: \"{subject}\".\n{note}\n\n— The Bloom Labs Team"
    )


def _build_resolution_html(contact: Dict[str, Any]) -> str:
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    return (
        "<div style='font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0F172A;padding:24px;max-width:520px;'>"
        f"<h2 style='color:#1E3A8A;margin-top:0;'>Your support request has been resolved</h2>"
        f"<p>Re: <strong>{_esc(contact.get('subject') or '')}</strong></p>"
        "<p>Reply directly to this email for follow-ups, or visit your portal:</p>"
        f"<p><a href='{base}/portal'>{base}/portal</a></p>"
        "<p style='color:#94A3B8;font-size:13px;'>— The Bloom Labs Team</p>"
        "</div>"
    )


def _build_resolution_text(contact: Dict[str, Any]) -> str:
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    return (
        f"Your support request \"{contact.get('subject')}\" has been resolved.\n"
        f"Reply here for follow-ups or visit the portal: {base}/portal\n\n— The Bloom Labs Team"
    )


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


__all__ = [
    "client_contact_router",
    "contact_admin_router",
    "thrivedesk_retry_cron",
    "relay_td_resolution_to_client",
]
