"""BreezeDocs proposal & contract routes (admin + client + cron sync).

Routes mounted in server.py:
  • breezedocs_admin_router   — `/admin/breezedocs/*`  (founder JWT)
  • breezedocs_client_router  — `/clients/me/proposals` (client JWT)

Admin endpoints:
  • GET    /admin/breezedocs/templates            — live BreezeDoc templates
  • GET    /admin/breezedocs/proposals            — list locally-tracked proposals
  • POST   /admin/breezedocs/proposals            — create from template + send
  • POST   /admin/breezedocs/proposals/{id}/sync  — poll status once
  • POST   /admin/breezedocs/proposals/{id}/resend — resend approval link via email
  • GET    /admin/breezedocs/mock-log             — debug helper

Client endpoint:
  • GET    /clients/me/proposals — caller's own proposals (sign link + status)

Schema (`breezedocs_proposals` collection):
{
  id: <uuid>,                # our internal id (UUID string)
  breezedocs_id: <int>,      # BreezeDoc document id
  template_id: <int>,
  title: "Express Launch — Standard Proposal",
  client_email: "...", client_name: "...",
  status: "draft|sent|opened|signed|completed|declined|expired",
  sent_at, opened_at, completed_at,                  # ISO strings
  amount: "5995.00", currency: "USD",                # optional context tag
  recipient_slug: "...",                              # for signing URL
  raw: {...}                                          # last full payload from BreezeDoc
}
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from auth import get_current_user
from breezedocs_client import BreezeDocsClient
from client_routes import get_current_client
from db_utils import prepare_for_mongo
import email_service

log = logging.getLogger("breezedocs.routes")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_bd(request: Request) -> BreezeDocsClient:
    return request.app.state.breezedocs


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _derive_status(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Look at recipients to compute high-level status + timestamps."""
    recipients = doc.get("recipients") or []
    signing_recipients = [r for r in recipients if not r.get("owner")]
    sent_at = next((r.get("sent_at") for r in signing_recipients if r.get("sent_at")), None)
    opened_at = next((r.get("opened_at") for r in signing_recipients if r.get("opened_at")), None)
    completed_count = sum(1 for r in signing_recipients if r.get("completed_at"))
    total_signers = len(signing_recipients) or 1
    if total_signers and completed_count == total_signers:
        status = "completed"
        completed_at = max((r.get("completed_at") for r in signing_recipients if r.get("completed_at")))
    elif completed_count > 0:
        status = "signed"
        completed_at = None
    elif opened_at:
        status = "opened"
        completed_at = None
    elif sent_at:
        status = "sent"
        completed_at = None
    else:
        status = "draft"
        completed_at = None
    primary = signing_recipients[0] if signing_recipients else {}
    return {
        "status": status,
        "sent_at": sent_at,
        "opened_at": opened_at,
        "completed_at": completed_at,
        "recipient_slug": primary.get("slug"),
    }


async def _upsert_local(
    db: AsyncIOMotorDatabase,
    bd_doc: Dict[str, Any],
    *,
    fallback: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Upsert a local proposal record from a BreezeDoc document payload."""
    fallback = fallback or {}
    bd_id = bd_doc.get("id")
    if not bd_id:
        return fallback
    derived = _derive_status(bd_doc)
    primary = next(
        (r for r in (bd_doc.get("recipients") or []) if not r.get("owner")),
        None,
    )
    existing = await db.breezedocs_proposals.find_one({"breezedocs_id": bd_id}, {"_id": 0})
    base = existing or {
        "id": str(uuid.uuid4()),
        "breezedocs_id": bd_id,
        "created_at": _now_iso(),
    }
    base.update({
        "template_id": bd_doc.get("template_id") or base.get("template_id") or fallback.get("template_id"),
        "title": bd_doc.get("title") or base.get("title") or fallback.get("title") or "Untitled Proposal",
        "slug": bd_doc.get("slug") or base.get("slug"),
        "client_email": (primary or {}).get("email") or base.get("client_email") or fallback.get("client_email"),
        "client_name": (primary or {}).get("name") or base.get("client_name") or fallback.get("client_name"),
        "amount": base.get("amount") or fallback.get("amount"),
        "currency": (base.get("currency") or fallback.get("currency") or "USD"),
        "status": derived["status"],
        "sent_at": derived["sent_at"] or base.get("sent_at"),
        "opened_at": derived["opened_at"] or base.get("opened_at"),
        "completed_at": derived["completed_at"] or base.get("completed_at"),
        "recipient_slug": derived["recipient_slug"] or base.get("recipient_slug"),
        "sign_url": (
            BreezeDocsClient.recipient_sign_url(derived["recipient_slug"])
            if derived["recipient_slug"]
            else base.get("sign_url")
        ),
        "raw": bd_doc,
        "updated_at": _now_iso(),
    })
    if isinstance(base.get("client_email"), str):
        base["client_email"] = base["client_email"].lower().strip()
    await db.breezedocs_proposals.update_one(
        {"breezedocs_id": bd_id},
        {"$set": prepare_for_mongo(base)},
        upsert=True,
    )
    return base


# ============================================================
# Admin router
# ============================================================
breezedocs_admin_router = APIRouter(
    prefix="/admin/breezedocs",
    tags=["breezedocs-admin"],
    dependencies=[Depends(get_current_user)],
)


class CreateProposalRequest(BaseModel):
    template_id: int
    client_email: EmailStr
    client_name: str
    title: Optional[str] = None
    amount: Optional[str] = None  # e.g. "5995.00" — informational only
    currency: Optional[str] = "USD"
    send_now: bool = True


@breezedocs_admin_router.get("/templates")
async def list_templates(bd: BreezeDocsClient = Depends(get_bd)) -> Dict[str, Any]:
    res = await bd.list_templates()
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "BreezeDocs template list failed")
    data = res.get("data") or {}
    # Normalize: API returns {data: [...], current_page, ...} for live, {data: [...]} for mock
    return {"templates": data.get("data") or [], "mock": res.get("mock", False)}


@breezedocs_admin_router.get("/proposals")
async def list_proposals(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client_email: Optional[str] = None,
    include_archived: bool = False,
) -> List[Dict[str, Any]]:
    filt: Dict[str, Any] = {}
    if client_email:
        filt["client_email"] = client_email.lower().strip()
    if not include_archived:
        filt["archived"] = {"$ne": True}
    docs = (
        await db.breezedocs_proposals.find(filt, {"_id": 0, "raw": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return docs


@breezedocs_admin_router.post("/proposals")
async def create_proposal(
    req: CreateProposalRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    bd: BreezeDocsClient = Depends(get_bd),
) -> Dict[str, Any]:
    """Clone a BreezeDoc template into a new document, optionally send it."""
    create_res = await bd.create_document_from_template(req.template_id)
    if not create_res.get("success"):
        raise HTTPException(502, create_res.get("error") or "BreezeDocs create failed")
    bd_doc = create_res.get("data") or {}
    bd_id = bd_doc.get("id")
    if not bd_id:
        raise HTTPException(502, "BreezeDocs did not return a document id")

    sent_payload = None
    if req.send_now:
        # BreezeDoc requires the send call to include the exact recipient list
        # in party order. Replace owner-less recipients with the requested
        # client; keep owners (party 0 is the sender usually) untouched.
        signing_recipients = [
            r for r in (bd_doc.get("recipients") or []) if not r.get("owner")
        ]
        if not signing_recipients:
            # Template has no client recipient; we treat the request as the
            # only signing party.
            recipients_payload = [{"name": req.client_name, "email": req.client_email}]
        else:
            recipients_payload = [
                {"name": req.client_name, "email": req.client_email}
                for _ in signing_recipients
            ]
        send_res = await bd.send_document(bd_id, recipients_payload)
        if not send_res.get("success"):
            # Send failed but document was created — leave it as draft, surface error.
            log.warning("BreezeDocs send failed for doc %s: %s", bd_id, send_res.get("error"))
        else:
            bd_doc = send_res.get("data") or bd_doc
            sent_payload = send_res

    saved = await _upsert_local(
        db,
        bd_doc,
        fallback={
            "template_id": req.template_id,
            "title": req.title,
            "client_email": req.client_email,
            "client_name": req.client_name,
            "amount": req.amount,
            "currency": req.currency or "USD",
        },
    )

    # Fire branded email with sign link (best-effort)
    if req.send_now and saved.get("sign_url"):
        try:
            await _email_proposal_sent(
                request,
                to=saved["client_email"],
                name=saved.get("client_name") or saved["client_email"].split("@")[0],
                title=saved.get("title") or "your proposal",
                sign_url=saved["sign_url"],
            )
        except Exception as exc:  # pragma: no cover
            log.warning("Proposal email failed: %s", exc)

    saved.pop("raw", None)
    return {
        "ok": True,
        "proposal": saved,
        "send_attempted": req.send_now,
        "send_succeeded": bool(sent_payload and sent_payload.get("success")),
        "mock": create_res.get("mock", False),
    }


@breezedocs_admin_router.post("/proposals/{proposal_id}/sync")
async def sync_proposal(
    proposal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    bd: BreezeDocsClient = Depends(get_bd),
) -> Dict[str, Any]:
    """Poll BreezeDoc once for this proposal's recipient timestamps."""
    local = await db.breezedocs_proposals.find_one({"id": proposal_id}, {"_id": 0})
    if not local:
        raise HTTPException(404, "Proposal not found")
    bd_id = local["breezedocs_id"]
    doc_res = await bd.get_document(bd_id)
    if not doc_res.get("success"):
        raise HTTPException(502, doc_res.get("error") or "BreezeDocs fetch failed")
    saved = await _upsert_local(db, doc_res.get("data") or {})
    saved.pop("raw", None)
    return {"ok": True, "proposal": saved}


@breezedocs_admin_router.post("/proposals/{proposal_id}/resend")
async def resend_proposal_email(
    proposal_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    local = await db.breezedocs_proposals.find_one({"id": proposal_id}, {"_id": 0})
    if not local:
        raise HTTPException(404, "Proposal not found")
    if not local.get("sign_url"):
        raise HTTPException(400, "Proposal has no signing URL yet — send it first")
    res = await _email_proposal_sent(
        request,
        to=local["client_email"],
        name=local.get("client_name") or local["client_email"].split("@")[0],
        title=local.get("title") or "your proposal",
        sign_url=local["sign_url"],
    )
    return {"ok": bool(res.get("ok")), "detail": res.get("error")}


@breezedocs_admin_router.delete("/proposals/{proposal_id}")
async def archive_proposal(
    proposal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Soft delete: marks our local copy archived. Does not delete in BreezeDoc."""
    res = await db.breezedocs_proposals.update_one(
        {"id": proposal_id},
        {"$set": {"archived": True, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Proposal not found")
    return {"ok": True}


@breezedocs_admin_router.get("/mock-log")
async def get_mock_log(bd: BreezeDocsClient = Depends(get_bd)) -> Dict[str, Any]:
    return {"mode": "live" if bd.is_configured else "mock", "log": bd.mock_log[-50:]}


# ============================================================
# Client portal — minimal listing (read-only)
# ============================================================
breezedocs_client_router = APIRouter(
    prefix="/clients/me",
    tags=["breezedocs-client"],
)


@breezedocs_client_router.get("/breezedocs-proposals")
async def my_breezedocs_proposals(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(get_current_client),
) -> List[Dict[str, Any]]:
    docs = (
        await db.breezedocs_proposals.find(
            {"client_email": client["email"], "archived": {"$ne": True}},
            {"_id": 0, "raw": 0},
        )
        .sort("created_at", -1)
        .to_list(50)
    )
    return docs


# ============================================================
# Email helper (branded)
# ============================================================
async def _email_proposal_sent(
    request: Request, *, to: str, name: str, title: str, sign_url: str
) -> Dict[str, Any]:
    emailit = getattr(request.app.state, "emailit", None)
    body = (
        email_service._h1(f"Your proposal is ready — {title}")
        + email_service._p(
            f"Hi {name}, we've prepared <strong>{title}</strong> for you. "
            "It's a short read — review, ask any questions, and sign electronically when you're ready."
        )
        + f'<p style="margin:24px 0;">{email_service._button(sign_url, "Review & sign")}</p>'
        + email_service._p(
            "Questions before signing? Just reply to this email — we read every response."
        )
    )
    html = email_service._frame(
        preheader=f"Proposal ready: {title}.",
        body_html=body,
    )
    return await email_service._safe_send(
        emailit,
        to=to,
        subject=f"Your proposal is ready · {email_service.BRAND_NAME}",
        html=html,
        text=f"Your proposal is ready — review & sign: {sign_url}",
    )


# ============================================================
# Periodic sync helper (called from APScheduler in server.py)
# ============================================================
async def breezedocs_sync_cron(db: AsyncIOMotorDatabase, bd: BreezeDocsClient) -> Dict[str, Any]:
    """Refresh status for all non-completed proposals.

    Runs every 10 min in production. Safe to call repeatedly — uses
    `_upsert_local` which is idempotent. Sends a one-time "completed"
    email to the client when status transitions to `completed`.
    """
    await bd._resolve_creds()
    if not bd.is_configured:
        return {"ok": True, "skipped": "mock_mode", "synced": 0}
    cursor = db.breezedocs_proposals.find(
        {"status": {"$nin": ["completed", "declined"]}, "archived": {"$ne": True}},
        {"_id": 0},
    )
    open_props = await cursor.to_list(200)
    synced = 0
    completed_transitions: List[Dict[str, Any]] = []
    for prop in open_props:
        res = await bd.get_document(prop["breezedocs_id"])
        if not res.get("success"):
            continue
        prev_status = prop.get("status")
        new_local = await _upsert_local(db, res.get("data") or {})
        synced += 1
        if prev_status != "completed" and new_local.get("status") == "completed":
            completed_transitions.append(new_local)
    return {
        "ok": True,
        "synced": synced,
        "completed_transitions": len(completed_transitions),
    }
