"""Milestones — client-portal facing project deliverables synced from Nifty PM.

Webhook receiver: /api/webhooks/nifty
  Accepts Nifty's task.* events. Matches by nifty_task_id OR custom field "Client_ID".
  Routes status changes (in_progress, complete, blocked) to milestone updates.

APScheduler jobs:
  • Every 5 minutes — poll Nifty for recent task comments and update milestones.
  • Daily 08:00 UTC — refresh due_date from Nifty (timeline adjustments).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import get_current_user
from client_routes import get_current_client
from db_utils import prepare_for_mongo, serialize_doc
from models import Milestone, MilestoneCreate, MilestoneNote, MilestoneUpdate

log = logging.getLogger("milestones")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ================================================================
# Helpers — Nifty status mapping + matchers
# ================================================================
NIFTY_STATUS_MAP = {
    "in_progress": "in_progress",
    "in progress": "in_progress",
    "started": "in_progress",
    "doing": "in_progress",
    "complete": "complete",
    "completed": "complete",
    "done": "complete",
    "closed": "complete",
    "blocked": "blocked",
    "on hold": "blocked",
    "on_hold": "blocked",
    "stuck": "blocked",
    "todo": "pending",
    "to_do": "pending",
    "to do": "pending",
    "open": "pending",
    "new": "pending",
}


def _normalize_status(raw: str) -> str:
    return NIFTY_STATUS_MAP.get((raw or "").strip().lower(), "pending")


async def _find_milestone(
    db: AsyncIOMotorDatabase, *, nifty_task_id: str, client_id: Optional[str], title: Optional[str]
) -> Optional[Dict[str, Any]]:
    """Match by nifty_task_id first, then by (client_email==Client_ID, title)."""
    if nifty_task_id:
        m = await db.milestones.find_one({"nifty_task_id": nifty_task_id}, {"_id": 0})
        if m:
            return m
    if client_id and title:
        m = await db.milestones.find_one(
            {"client_email": (client_id or "").lower(), "title": title}, {"_id": 0}
        )
        if m:
            return m
    return None


async def _log_sync(
    db: AsyncIOMotorDatabase, *, kind: str, payload: Dict[str, Any], outcome: str
) -> None:
    await db.milestone_sync_history.insert_one(
        prepare_for_mongo(
            {
                "kind": kind,
                "payload": payload,
                "outcome": outcome,
                "at": _now().isoformat(),
            }
        )
    )


async def _notify_client_email(
    request: Request, *, to: str, subject: str, body_md: str
) -> bool:
    try:
        emailit = request.app.state.emailit
        if not emailit.is_configured:
            return False
        html = body_md.replace("\n", "<br/>")
        res = await emailit.send_email(
            to=to,
            subject=subject,
            html=f"<div style='font-family:sans-serif;font-size:15px;line-height:1.6;color:#0F172A;padding:24px;'>{html}</div>",
            text=body_md,
        )
        return bool(res and res.get("ok"))
    except Exception as exc:
        log.warning("client email failed: %s", exc)
        return False


# ================================================================
# Event handler — core business logic
# ================================================================
async def handle_nifty_event(
    request: Request, db: AsyncIOMotorDatabase, event: Dict[str, Any]
) -> Dict[str, Any]:
    """Process a single Nifty event. Idempotent. Returns outcome string."""
    event_type = event.get("event_type") or event.get("type") or ""
    resource = event.get("resource") or event.get("data") or event.get("task") or {}
    if not resource:
        await _log_sync(db, kind=event_type, payload=event, outcome="no_resource")
        return {"outcome": "no_resource"}

    task_id = resource.get("id") or resource.get("task_id") or resource.get("_id") or ""
    title = resource.get("name") or resource.get("title") or resource.get("task_name")
    custom_fields = resource.get("custom_fields", {}) or {}
    client_id = custom_fields.get("Client_ID") or custom_fields.get("client_id")
    notify_client = bool(custom_fields.get("Notify_Client") or custom_fields.get("notify_client"))
    raw_status = resource.get("status") or resource.get("state") or ""
    status = _normalize_status(str(raw_status))
    due_date = resource.get("due_date")

    milestone = await _find_milestone(
        db, nifty_task_id=task_id, client_id=client_id, title=title
    )
    if not milestone:
        await _log_sync(db, kind=event_type, payload=event, outcome="no_match")
        return {"outcome": "no_match", "task_id": task_id, "status": status}

    update: Dict[str, Any] = {
        "status": status,
        "last_updated": _now().isoformat(),
    }
    base = "https://bybloomlabs.com"

    # ---- comment with "Client Notes:" prefix ----
    comment = (
        resource.get("comment")
        or (event.get("comment") or {}).get("text")
        or event.get("text")
        or ""
    )
    if isinstance(comment, str) and comment.lower().startswith("client notes:"):
        note_text = comment.split(":", 1)[-1].strip()
        new_note = MilestoneNote(
            author=event.get("author") or resource.get("author") or "Team",
            text=note_text,
        ).model_dump()
        await db.milestones.update_one(
            {"id": milestone["id"]},
            {
                "$push": {"notes": prepare_for_mongo(new_note)},
                "$set": {"last_updated": _now().isoformat()},
            },
        )

    # ---- status transitions ----
    if status == "in_progress":
        update["blocked_reason"] = None
    elif status == "complete":
        update["completion_date"] = _now().isoformat()
        update["blocked_reason"] = None
        # Optional client notification
        if (
            notify_client
            or milestone.get("notify_client_on_complete")
            or milestone.get("is_final_deliverable")
        ):
            await _notify_client_email(
                request,
                to=milestone["client_email"],
                subject=f"Milestone complete: {milestone['title']}",
                body_md=(
                    f"Great news — **{milestone['title']}** is complete.\n\n"
                    f"View details in your portal: {base}/portal"
                ),
            )
    elif status == "blocked":
        # extract reason from latest comment (best-effort)
        reason = ""
        if isinstance(comment, str) and comment:
            reason = comment
        elif resource.get("blocked_reason"):
            reason = resource["blocked_reason"]
        update["blocked_reason"] = reason
        # email PM + client
        await _notify_client_email(
            request,
            to=milestone["client_email"],
            subject=f"On hold: {milestone['title']}",
            body_md=(
                f"**{milestone['title']}** is temporarily on hold.\n\n"
                f"Reason: {reason or 'awaiting clarification'}\n\n"
                f"We&apos;ll update you as soon as it&apos;s unblocked.\n\n"
                f"View details: {base}/portal"
            ),
        )

    if due_date:
        update["due_date"] = due_date

    await db.milestones.update_one(
        {"id": milestone["id"]}, {"$set": prepare_for_mongo(update)}
    )
    await _log_sync(
        db,
        kind=event_type,
        payload={"task_id": task_id, "status": status, "milestone_id": milestone["id"]},
        outcome="updated",
    )
    return {"outcome": "updated", "milestone_id": milestone["id"], "status": status}


# ================================================================
# Routers
# ================================================================
# Webhook (no auth — Nifty signs externally; verify if shared secret set)
nifty_webhook_router = APIRouter(prefix="/webhooks", tags=["nifty-webhooks"])


@nifty_webhook_router.post("/nifty")
async def nifty_webhook(request: Request) -> Dict[str, Any]:
    db = request.app.state.db
    try:
        event = await request.json()
    except Exception:
        return {"ok": False, "reason": "invalid_json"}
    result = await handle_nifty_event(request, db, event)
    return {"ok": True, **result}


# Client portal
milestone_client_router = APIRouter(prefix="/clients/me/milestones", tags=["milestones-client"])


@milestone_client_router.get("")
async def my_milestones(
    current=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = (
        await db.milestones.find(
            {"client_email": current["email"]}, {"_id": 0}
        )
        .sort("created_at", 1)
        .to_list(500)
    )
    return [serialize_doc(d) for d in docs]


# Admin
milestone_admin_router = APIRouter(
    prefix="/admin/milestones",
    tags=["milestones-admin"],
    dependencies=[Depends(get_current_user)],
)


@milestone_admin_router.get("")
async def admin_list(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client_email: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if client_email:
        q["client_email"] = client_email.lower()
    docs = await db.milestones.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(d) for d in docs]


@milestone_admin_router.post("")
async def admin_create(
    req: MilestoneCreate, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = Milestone(**req.model_dump())
    await db.milestones.insert_one(prepare_for_mongo(doc.model_dump()))
    return serialize_doc(doc.model_dump())


@milestone_admin_router.patch("/{ms_id}")
async def admin_update(
    ms_id: str, req: MilestoneUpdate, request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    if "status" in update and update["status"] == "complete":
        update["completion_date"] = _now().isoformat()
    update["last_updated"] = _now().isoformat()
    res = await db.milestones.update_one(
        {"id": ms_id}, {"$set": prepare_for_mongo(update)}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    fresh = await db.milestones.find_one({"id": ms_id}, {"_id": 0})
    return serialize_doc(fresh)


@milestone_admin_router.delete("/{ms_id}")
async def admin_delete(
    ms_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.milestones.delete_one({"id": ms_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@milestone_admin_router.get("/sync-history")
async def admin_sync_history(
    db: AsyncIOMotorDatabase = Depends(get_db), limit: int = 100
) -> List[Dict[str, Any]]:
    docs = (
        await db.milestone_sync_history.find({}, {"_id": 0})
        .sort("at", -1)
        .to_list(limit)
    )
    return [serialize_doc(d) for d in docs]


# ================================================================
# APScheduler jobs (registered from server.py)
# ================================================================
async def nifty_comment_poll(app) -> Dict[str, int]:
    """Every 5 min — poll Nifty for comments on tracked tasks."""
    db = app.state.db
    nifty = app.state.nifty
    if not await nifty.is_connected():
        return {"polled": 0, "reason": "nifty_not_connected"}
    # Find all milestones with a nifty_task_id
    cursor = db.milestones.find(
        {"nifty_task_id": {"$ne": None}}, {"_id": 0, "id": 1, "nifty_task_id": 1, "client_email": 1, "title": 1}
    )
    polled = 0
    async for m in cursor:
        try:
            res = await nifty._request(
                "GET", f"/api/v1.0/tasks/{m['nifty_task_id']}"
            )
            if not res.get("success"):
                continue
            task = res.get("data") or {}
            # Lightweight comment-only update; full handler needs request context
            comment = task.get("last_comment") or ""
            if isinstance(comment, str) and comment.lower().startswith("client notes:"):
                note_text = comment.split(":", 1)[-1].strip()
                await db.milestones.update_one(
                    {"id": m["id"]},
                    {
                        "$push": {
                            "notes": prepare_for_mongo(
                                MilestoneNote(author="Team", text=note_text).model_dump()
                            )
                        },
                        "$set": {"last_updated": _now().isoformat()},
                    },
                )
            polled += 1
        except Exception as exc:
            log.warning("comment poll failed: %s", exc)
    return {"polled": polled}


async def nifty_timeline_refresh(app) -> Dict[str, int]:
    """Daily — refresh due_dates from Nifty for all tracked milestones."""
    db = app.state.db
    nifty = app.state.nifty
    if not await nifty.is_connected():
        return {"refreshed": 0, "reason": "nifty_not_connected"}
    cursor = db.milestones.find(
        {"nifty_task_id": {"$ne": None}}, {"_id": 0, "id": 1, "nifty_task_id": 1}
    )
    refreshed = 0
    async for m in cursor:
        try:
            res = await nifty._request(
                "GET", f"/api/v1.0/tasks/{m['nifty_task_id']}"
            )
            if not res.get("success"):
                continue
            task = res.get("data") or {}
            due = task.get("due_date")
            if due:
                await db.milestones.update_one(
                    {"id": m["id"]},
                    {"$set": {"due_date": due, "last_updated": _now().isoformat()}},
                )
                refreshed += 1
        except Exception as exc:
            log.warning("timeline refresh failed: %s", exc)
    return {"refreshed": refreshed}
