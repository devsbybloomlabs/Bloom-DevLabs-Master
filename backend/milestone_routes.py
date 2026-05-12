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
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

import slack_notifier
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

    # Reverse-sync: if a Nifty task with a ThriveDesk_Ticket_ID custom field
    # was just completed, relay completion to ThriveDesk + close escalation.
    resource = event.get("resource") or event.get("data") or event.get("task") or {}
    raw_status = resource.get("status") or resource.get("state") or ""
    if _normalize_status(str(raw_status)) == "complete":
        try:
            from thrivedesk_routes import relay_nifty_completion_to_thrivedesk
            td_result = await relay_nifty_completion_to_thrivedesk(request, db, resource)
            if td_result:
                result = {**(result or {}), "thrivedesk_relay": td_result}
        except Exception as exc:  # pragma: no cover
            log.warning("thrivedesk relay failed: %s", exc)

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


@milestone_admin_router.get("/blockers")
async def admin_list_blockers(
    db: AsyncIOMotorDatabase = Depends(get_db), limit: int = 50
) -> List[Dict[str, Any]]:
    """Recent Nifty blockers detected by the comment cron (Integration #5)."""
    docs = await db.nifty_blockers.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


# ================================================================
# APScheduler jobs (registered from server.py)
# ================================================================
async def nifty_comment_poll(app) -> Dict[str, int]:
    """Every 5 min — poll Nifty for comments on tracked tasks.

    Also scans for blocker keywords (`blocker:`, `waiting on:`, `blocked by:`)
    and forwards them to Slack as an at-mention so unblockers act fast. We
    de-duplicate via the comment text + task_id so a single blocker only
    pings Slack once.
    """
    db = app.state.db
    nifty = app.state.nifty
    if not await nifty.is_connected():
        return {"polled": 0, "blockers": 0, "reason": "nifty_not_connected"}
    cursor = db.milestones.find(
        {"nifty_task_id": {"$ne": None}}, {"_id": 0, "id": 1, "nifty_task_id": 1, "client_email": 1, "title": 1}
    )
    polled = 0
    blockers = 0
    async for m in cursor:
        try:
            res = await nifty._request(
                "GET", f"/api/v1.0/tasks/{m['nifty_task_id']}"
            )
            if not res.get("success"):
                continue
            task = res.get("data") or {}
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
            # Blocker detection (Integration #5 from master workflow doc)
            if isinstance(comment, str) and comment.strip():
                fired = await _maybe_fire_blocker(
                    db,
                    task=task,
                    milestone=m,
                    comment=comment,
                )
                if fired:
                    blockers += 1
            polled += 1
        except Exception as exc:
            log.warning("comment poll failed: %s", exc)
    return {"polled": polled, "blockers": blockers}


BLOCKER_PREFIXES = ("blocker:", "waiting on:", "blocked by:")


async def _maybe_fire_blocker(
    db: AsyncIOMotorDatabase,
    *,
    task: Dict[str, Any],
    milestone: Dict[str, Any],
    comment: str,
) -> bool:
    """If the latest comment starts with a blocker prefix and we haven't
    notified about it before, post to Slack + create an admin notification.

    Returns True if we fired a notification, False otherwise.
    """
    text = comment.strip()
    lower = text.lower()
    matched = next((p for p in BLOCKER_PREFIXES if lower.startswith(p)), None)
    if not matched:
        return False

    body = text[len(matched):].strip()
    # Stable de-dupe key per task + comment text
    task_id = task.get("id") or task.get("_id") or milestone.get("nifty_task_id")
    digest_key = f"{task_id}::{lower[:160]}"
    existing = await db.nifty_blockers.find_one({"key": digest_key}, {"_id": 0, "id": 1})
    if existing:
        return False

    # Extract @mentions for at-the-ready unblocker callout
    import re

    mentions = re.findall(r"@([\w\-.]+)", body)
    severity = "🚨" if matched == "blocker:" else "⚠️"
    headline = {
        "blocker:": "Project blocker",
        "waiting on:": "Waiting on someone",
        "blocked by:": "Task blocked",
    }[matched]

    task_title = task.get("title") or task.get("name") or milestone.get("title") or "(untitled task)"
    task_url = task.get("url") or task.get("permalink") or ""
    mention_str = ", ".join(f"@{m}" for m in mentions) if mentions else "_(no one tagged)_"

    slack_text = (
        f"{severity} *{headline}* on `{task_title}`\n"
        f"> {body[:400]}\n"
        f"Tagged: {mention_str}"
    )
    if task_url:
        slack_text += f"\n<{task_url}|Open in Nifty>"
    if milestone.get("client_email"):
        slack_text += f"\nClient: {milestone['client_email']}"

    slack_res = await slack_notifier.post_message(db, text=slack_text)

    # Record this blocker so we don't re-notify and so admins can see history.
    record = {
        "id": str(uuid.uuid4()),
        "key": digest_key,
        "task_id": task_id,
        "task_title": task_title,
        "task_url": task_url,
        "milestone_id": milestone.get("id"),
        "client_email": milestone.get("client_email"),
        "kind": matched.rstrip(":"),
        "body": body,
        "mentions": mentions,
        "slack_ok": bool(slack_res.get("ok")),
        "slack_status": slack_res.get("status"),
        "slack_reason": slack_res.get("reason"),
        "created_at": _now().isoformat(),
    }
    await db.nifty_blockers.insert_one(record)

    # Admin notification fallback so the founder sees it even without Slack
    try:
        from models import NotificationItem

        notif = NotificationItem(
            kind="nifty_blocker",
            title=f"{severity} {headline}: {task_title}",
            body=f"{body[:300]}\nClient: {milestone.get('client_email') or '—'}",
            link="/admin/milestones",
        )
        await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    except Exception as exc:  # pragma: no cover
        log.warning("Blocker admin notif failed: %s", exc)
    return True


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
