"""Approval Studio ↔ Nifty PM design-review loop.

End-to-end flow:

  1. Designer uploads a design (Figma link) via `POST /admin/approvals/upload`:
       a. Creates / re-uses an Approval Studio project (mocked when no creds).
       b. Auto-posts a comment to the linked Nifty task with the review link.
       c. Sets Nifty task status to "In Review".
       d. Records `approvals` doc {client_email, design_url, review_url, status='in_review', designer, ...}.

  2. Approval Studio webhook `POST /webhooks/approval-studio` receives:
       • ANNOTATION_ADDED → posts the comment on the linked Nifty task
                            ("[Feedback from <commenter>] <text>") + bumps approval.status='revision'.
       • TASK_APPROVED   → marks approval.status='approved', closes the Nifty task,
                            updates the linked Client Portal milestone to 'complete',
                            and emails the client.
       • TASK_REJECTED   → bumps approval.status='revision' + Nifty comment.

  3. APScheduler reminder job (hourly):
       Sends a reminder email to the designer if an approval has been
       sitting in `revision` state for > 48h without a new upload.

Webhook signature verification uses `APPROVAL_STUDIO_WEBHOOK_SECRET` if set.

When the Approval Studio client is in MOCK mode (no credentials in .env), all
upstream calls are logged via `aps_client.mock_log` and surface in the admin
UI for inspection.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from approval_studio_client import ApprovalStudioClient
from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from nifty_client import NiftyClient

log = logging.getLogger("approvals")


# ----------------------------------------------------------------------
# DI
# ----------------------------------------------------------------------
def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_aps(request: Request) -> ApprovalStudioClient:
    return request.app.state.approval_studio


def get_nifty(request: Request) -> NiftyClient:
    return request.app.state.nifty


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ----------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------
class ApprovalUploadRequest(BaseModel):
    client_email: EmailStr
    project_name: str = Field(min_length=1, max_length=200)
    asset_name: str = Field(min_length=1, max_length=200)
    design_url: str = Field(min_length=4, max_length=1000)  # Figma / Drive / etc.
    designer_email: Optional[EmailStr] = None
    nifty_task_id: Optional[str] = None  # If provided, sync to this Nifty task
    milestone_id: Optional[str] = None  # Optional: tie to a client portal milestone
    version: int = 1


class ApprovalDoc(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    client_email: EmailStr
    project_name: str
    asset_name: str
    design_url: str
    review_url: Optional[str] = None
    designer_email: Optional[str] = None
    aps_project_id: Optional[str] = None
    aps_asset_id: Optional[str] = None
    nifty_task_id: Optional[str] = None
    milestone_id: Optional[str] = None
    version: int = 1
    status: str = "in_review"  # in_review | revision | approved | rejected
    last_event_at: datetime = Field(default_factory=_now)
    created_at: datetime = Field(default_factory=_now)


# ----------------------------------------------------------------------
# Nifty status helpers — keep these names aligned with milestone_routes.NIFTY_STATUS_MAP
# ----------------------------------------------------------------------
async def _nifty_comment(nifty: NiftyClient, task_id: str, text: str) -> bool:
    """Best-effort: POST a comment on a Nifty task. Returns True on success."""
    if not task_id:
        return False
    res = await nifty._request(
        "POST", f"/api/v1.0/tasks/{task_id}/comments", json={"body": text}
    )
    if not res.get("success"):
        log.warning("Nifty comment failed for task %s: %s", task_id, res.get("error"))
    return bool(res.get("success"))


async def _nifty_set_status(nifty: NiftyClient, task_id: str, status: str) -> bool:
    """Best-effort: PATCH the status field on a Nifty task."""
    if not task_id:
        return False
    res = await nifty._request(
        "PATCH", f"/api/v1.0/tasks/{task_id}", json={"status": status}
    )
    if not res.get("success"):
        log.warning(
            "Nifty status update to %s failed for task %s: %s",
            status, task_id, res.get("error"),
        )
    return bool(res.get("success"))


# ----------------------------------------------------------------------
# Admin router — upload + list + manual resolve
# ----------------------------------------------------------------------
approvals_admin_router = APIRouter(
    prefix="/admin/approvals",
    tags=["approvals-admin"],
    dependencies=[Depends(get_current_user)],
)


@approvals_admin_router.get("")
async def admin_list_approvals(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client_email: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if client_email:
        q["client_email"] = client_email.lower()
    if status:
        q["status"] = status
    docs = (
        await db.approvals.find(q, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return [serialize_doc(d) for d in docs]


@approvals_admin_router.get("/mock-log")
async def admin_mock_log(
    aps: ApprovalStudioClient = Depends(get_aps),
) -> Dict[str, Any]:
    """Inspect what the (mocked) Approval Studio client logged."""
    return {"mode": aps.mode, "entries": list(reversed(aps.mock_log))[:50]}


@approvals_admin_router.post("/upload")
async def admin_upload_design(
    req: ApprovalUploadRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    aps: ApprovalStudioClient = Depends(get_aps),
    nifty: NiftyClient = Depends(get_nifty),
) -> Dict[str, Any]:
    """Designer pushes a new (or revised) design to Approval Studio.

    Re-runnable per (client_email, project_name, asset_name) — the second call
    creates a new version on the same Approval Studio project.
    """
    client_email_lc = req.client_email.lower()

    # 1) Reuse an existing approval doc (same client+project+asset) so we can bump version
    existing = await db.approvals.find_one(
        {
            "client_email": client_email_lc,
            "project_name": req.project_name,
            "asset_name": req.asset_name,
        },
        {"_id": 0},
    )

    # 2) Ensure an Approval Studio project exists
    if existing and existing.get("aps_project_id"):
        aps_project_id = existing["aps_project_id"]
    else:
        proj_res = await aps.create_project(
            project_name=req.project_name,
            customer=client_email_lc,
            description=f"Design review for {client_email_lc}",
        )
        if not proj_res.get("success"):
            raise HTTPException(502, f"Approval Studio create_project failed: {proj_res.get('error')}")
        aps_project_id = (proj_res.get("data") or {}).get("projectId")

    # 3) Upload the asset (always increments version)
    next_version = (existing or {}).get("version", 0) + 1
    upload_res = await aps.upload_asset(
        project_id=aps_project_id,
        asset_name=req.asset_name,
        asset_url=req.design_url,
        version=next_version,
    )
    if not upload_res.get("success"):
        raise HTTPException(502, f"Approval Studio upload_asset failed: {upload_res.get('error')}")
    data = upload_res.get("data") or {}
    review_url = data.get("reviewUrl") or data.get("review_url")
    asset_id = data.get("assetId") or data.get("asset_id")

    # 4) Upsert local approval doc
    doc = ApprovalDoc(
        client_email=client_email_lc,
        project_name=req.project_name,
        asset_name=req.asset_name,
        design_url=req.design_url,
        review_url=review_url,
        designer_email=(req.designer_email or "").lower() if req.designer_email else None,
        aps_project_id=aps_project_id,
        aps_asset_id=asset_id,
        nifty_task_id=req.nifty_task_id or (existing or {}).get("nifty_task_id"),
        milestone_id=req.milestone_id or (existing or {}).get("milestone_id"),
        version=next_version,
        status="in_review",
    ).model_dump()
    if existing:
        doc["id"] = existing["id"]
        doc["created_at"] = existing.get("created_at", _iso(_now()))
    await db.approvals.update_one(
        {"id": doc["id"]}, {"$set": prepare_for_mongo(doc)}, upsert=True
    )

    # 5) Sync to Nifty (best-effort)
    nifty_ok = False
    nifty_status_ok = False
    if doc["nifty_task_id"] and await nifty.is_connected():
        comment = (
            f"📐 Design uploaded to Approval Studio (v{next_version}).\n"
            f"Review link: {review_url}\n"
            f"Source design: {req.design_url}"
        )
        nifty_ok = await _nifty_comment(nifty, doc["nifty_task_id"], comment)
        nifty_status_ok = await _nifty_set_status(nifty, doc["nifty_task_id"], "In Review")

    # 6) Update milestone status to in_progress (if linked)
    if doc["milestone_id"]:
        await db.milestones.update_one(
            {"id": doc["milestone_id"]},
            {
                "$set": {
                    "status": "in_progress",
                    "last_updated": _iso(_now()),
                }
            },
        )

    # 7) Audit
    await db.approval_sync_history.insert_one(
        prepare_for_mongo(
            {
                "kind": "upload",
                "approval_id": doc["id"],
                "version": next_version,
                "nifty_comment_ok": nifty_ok,
                "nifty_status_ok": nifty_status_ok,
                "aps_mode": aps.mode,
                "at": _iso(_now()),
            }
        )
    )
    fresh = await db.approvals.find_one({"id": doc["id"]}, {"_id": 0})
    return {
        "approval": serialize_doc(fresh),
        "review_url": review_url,
        "aps_mode": aps.mode,
        "nifty_synced": {"comment": nifty_ok, "status": nifty_status_ok},
    }


@approvals_admin_router.post("/{approval_id}/resolve")
async def admin_resolve_approval(
    approval_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    nifty: NiftyClient = Depends(get_nifty),
) -> Dict[str, Any]:
    """Manual completion fallback if the Approval Studio webhook never arrives."""
    doc = await db.approvals.find_one({"id": approval_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    await _mark_approved(request, db, nifty, doc)
    fresh = await db.approvals.find_one({"id": approval_id}, {"_id": 0})
    return serialize_doc(fresh)


# ----------------------------------------------------------------------
# Webhook router — public (verified via shared secret)
# ----------------------------------------------------------------------
approvals_webhook_router = APIRouter(prefix="/webhooks", tags=["approval-webhooks"])


def _verify_aps_signature(raw_body: bytes, headers: Dict[str, str]) -> Optional[bool]:
    """Verify Approval Studio webhook signature when a shared secret is set."""
    secret = os.environ.get("APPROVAL_STUDIO_WEBHOOK_SECRET", "")
    if not secret:
        return None
    provided = (
        headers.get("x-aps-signature")
        or headers.get("x-approval-studio-signature")
        or headers.get("x-signature")
        or ""
    ).strip()
    if not provided:
        return False
    if provided.lower().startswith("sha256="):
        provided = provided.split("=", 1)[1]
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(provided.lower(), expected.lower())


@approvals_webhook_router.post("/approval-studio")
async def approval_studio_webhook(request: Request) -> Dict[str, Any]:
    """Receive events from Approval Studio. Always 200 to avoid retry storms."""
    db: AsyncIOMotorDatabase = request.app.state.db
    nifty: NiftyClient = request.app.state.nifty
    headers = {k.lower(): v for k, v in request.headers.items()}
    raw_body = await request.body()
    try:
        payload = await request.json() if raw_body else {}
    except Exception:
        payload = {"raw": raw_body.decode("utf-8", "replace")[:2000]}

    sig_ok = _verify_aps_signature(raw_body, headers)
    event_type = (payload.get("eventType") or payload.get("event_type") or "").upper()
    log.info("Approval Studio webhook: event=%s sig_ok=%s", event_type, sig_ok)

    audit = {
        "received_at": _iso(_now()),
        "event_type": event_type,
        "sig_verified": sig_ok,
        "payload": payload,
    }
    await db.approval_sync_history.insert_one(prepare_for_mongo(audit))

    if sig_ok is False:
        return {"ok": True, "verified": False, "note": "signature mismatch — skipped"}

    # Match the linked approval doc using project/asset ids if present
    aps_project_id = (
        payload.get("projectId")
        or payload.get("project_id")
        or (payload.get("project") or {}).get("id")
    )
    aps_asset_id = (
        payload.get("assetId")
        or payload.get("asset_id")
        or (payload.get("asset") or {}).get("id")
    )
    query: Dict[str, Any] = {}
    if aps_asset_id:
        query["aps_asset_id"] = aps_asset_id
    elif aps_project_id:
        query["aps_project_id"] = aps_project_id
    if not query:
        return {"ok": True, "verified": True, "note": "no project/asset id — skipped"}

    approval = await db.approvals.find_one(query, {"_id": 0})
    if not approval:
        return {"ok": True, "verified": True, "note": f"no approval matched {query}"}

    outcome = "noop"

    if event_type == "ANNOTATION_ADDED":
        comment_text = (
            (payload.get("annotation") or {}).get("text")
            or payload.get("text")
            or payload.get("comment")
            or ""
        )
        commenter = (
            (payload.get("annotation") or {}).get("author")
            or payload.get("author")
            or payload.get("commenter")
            or "Reviewer"
        )
        if approval.get("nifty_task_id") and await nifty.is_connected():
            await _nifty_comment(
                nifty,
                approval["nifty_task_id"],
                f"[Feedback from {commenter}] {comment_text}",
            )
        await db.approvals.update_one(
            {"id": approval["id"]},
            {
                "$set": {
                    "status": "revision",
                    "last_event_at": _iso(_now()),
                }
            },
        )
        outcome = "annotation_relayed"

    elif event_type == "TASK_APPROVED":
        await _mark_approved(request, db, nifty, approval)
        outcome = "approved"

    elif event_type == "TASK_REJECTED":
        if approval.get("nifty_task_id") and await nifty.is_connected():
            await _nifty_comment(
                nifty,
                approval["nifty_task_id"],
                f"❌ Design rejected in Approval Studio. Reason: {payload.get('reason') or '—'}",
            )
        await db.approvals.update_one(
            {"id": approval["id"]},
            {
                "$set": {
                    "status": "revision",
                    "last_event_at": _iso(_now()),
                }
            },
        )
        outcome = "rejected"

    return {"ok": True, "verified": True, "outcome": outcome, "approval_id": approval["id"]}


# ----------------------------------------------------------------------
# Shared "mark approved" logic (used by webhook + manual resolve)
# ----------------------------------------------------------------------
async def _mark_approved(
    request: Request,
    db: AsyncIOMotorDatabase,
    nifty: NiftyClient,
    approval: Dict[str, Any],
) -> None:
    """Approve in our DB, move Nifty task to Complete, update milestone, email client."""
    now_iso = _iso(_now())
    await db.approvals.update_one(
        {"id": approval["id"]},
        {
            "$set": {
                "status": "approved",
                "last_event_at": now_iso,
                "approved_at": now_iso,
            }
        },
    )
    # Nifty
    if approval.get("nifty_task_id") and await nifty.is_connected():
        await _nifty_comment(
            nifty,
            approval["nifty_task_id"],
            "✅ All Approval Studio comments resolved. Design approved by client.",
        )
        await _nifty_set_status(nifty, approval["nifty_task_id"], "Complete")
    # Milestone → complete
    if approval.get("milestone_id"):
        await db.milestones.update_one(
            {"id": approval["milestone_id"]},
            {
                "$set": {
                    "status": "complete",
                    "completion_date": now_iso,
                    "last_updated": now_iso,
                    "blocked_reason": None,
                }
            },
        )
    # Email client
    try:
        emailit = request.app.state.emailit
        if emailit and getattr(emailit, "is_configured", False):
            client_email = approval["client_email"]
            base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
            await emailit.send_email(
                to=client_email,
                subject=f"Design approved: {approval['asset_name']} 🎉",
                html=(
                    f"<div style='font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0F172A;padding:24px;'>"
                    f"<h2 style='color:#1E3A8A;'>Design approved!</h2>"
                    f"<p>Great news — <strong>{approval['asset_name']}</strong> "
                    f"({approval['project_name']}) has been approved.</p>"
                    f"<p>Next: we&apos;ll roll this into production. Track progress in your portal: "
                    f"<a href='{base}/portal'>{base}/portal</a></p>"
                    f"<p style='color:#94A3B8;font-size:13px;'>— The Bloom Labs Team</p>"
                    f"</div>"
                ),
                text=(
                    f"Design approved: {approval['asset_name']} ({approval['project_name']}).\n"
                    f"Track progress: {base}/portal"
                ),
            )
    except Exception as exc:
        log.warning("client approval email failed: %s", exc)


# ----------------------------------------------------------------------
# Reminder cron — runs hourly
# ----------------------------------------------------------------------
async def designer_reminder_cron(app) -> Dict[str, int]:
    """Email designers whose approvals have sat in 'revision' state > 48h.

    Idempotent: writes a `reminder_sent_at` field; will not re-send within 24h.
    """
    db = app.state.db
    emailit = app.state.emailit
    sent = 0
    now = _now()
    threshold = now - timedelta(hours=48)
    cursor = db.approvals.find(
        {"status": "revision", "last_event_at": {"$lte": threshold.isoformat()}},
        {"_id": 0},
    )
    async for ap in cursor:
        # Skip if we just nudged them
        last_reminder = ap.get("reminder_sent_at")
        if last_reminder:
            try:
                lr = datetime.fromisoformat(last_reminder.replace("Z", "+00:00"))
                if (now - lr) < timedelta(hours=24):
                    continue
            except Exception:
                pass
        designer = ap.get("designer_email")
        if not designer or not getattr(emailit, "is_configured", False):
            continue
        try:
            await emailit.send_email(
                to=designer,
                subject=f"Reminder: revisions waiting on {ap['asset_name']}",
                html=(
                    f"<div style='font-family:sans-serif;padding:16px;'>"
                    f"<p>Heads up — feedback from <strong>{ap['client_email']}</strong> on "
                    f"<strong>{ap['asset_name']}</strong> ({ap['project_name']}) has been waiting "
                    f"for &gt; 48 hours.</p>"
                    f"<p>Review: <a href='{ap.get('review_url') or '#'}'>{ap.get('review_url') or 'Approval Studio'}</a></p>"
                    f"</div>"
                ),
                text=(
                    f"Reminder: revisions waiting on {ap['asset_name']} for "
                    f"{ap['client_email']}. Review: {ap.get('review_url') or '—'}"
                ),
            )
            await db.approvals.update_one(
                {"id": ap["id"]},
                {"$set": {"reminder_sent_at": _iso(now)}},
            )
            sent += 1
        except Exception as exc:
            log.warning("designer reminder email failed for %s: %s", designer, exc)
    return {"reminders_sent": sent}


__all__ = [
    "approvals_admin_router",
    "approvals_webhook_router",
    "designer_reminder_cron",
]
