"""ThriveDesk ↔ Nifty support escalation loop (Part 4).

Inbound flow (ThriveDesk → us):
  • POST /api/webhooks/thrivedesk
      - `conversation.created`:
          * High-priority detection (tag "High Priority" OR subject contains "urgent"/"blocked")
            → Nifty task "🚨 URGENT SUPPORT — {subject}" assigned to PM team, due today,
              custom field `ThriveDesk_Ticket_ID`.
            → Slack message to #urgent-support (if SLACK_WEBHOOK_URL configured).
          * Feature Request tag → Nifty task "Feature Request — {subject}" assigned to PM,
            custom field `Scope Creep?: To Be Determined`, tag "Client Request".
      - `conversation.tags.updated`:
          * If the new tag mix triggers a rule and no escalation exists yet, create one.

Outbound flow (Nifty → ThriveDesk):
  • milestone_routes.nifty_webhook calls `relay_nifty_completion_to_thrivedesk()`:
      - On task.completed for a task whose custom_fields["ThriveDesk_Ticket_ID"] is set,
        post a public ThriveDesk reply ("We've resolved your request…") + optionally
        close the ticket when `Close Ticket: Yes`.

State lives in `support_escalations` Mongo collection:
    { id, ticket_id, ticket_uuid, subject, client_name, client_email,
      escalation_type: 'urgent'|'feature'|'other',
      nifty_task_id, slack_message_ts,
      status: 'open'|'resolved'|'closed',
      created_at, resolved_at }
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from models import NotificationItem
from nifty_client import NiftyClient
from thrivedesk_client import ThriveDeskClient
import slack_notifier

log = logging.getLogger("thrivedesk.routes")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_td(request: Request) -> ThriveDeskClient:
    return request.app.state.thrivedesk


def get_nifty(request: Request) -> NiftyClient:
    return request.app.state.nifty


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# =========================================================================
# Webhook signature (ThriveDesk uses HMAC-SHA1 + base64 over JSON-stringified data)
# =========================================================================
def _verify_td_signature(
    data: Any, headers: Dict[str, str], secret: str
) -> Optional[bool]:
    """ThriveDesk signs only the `data` field of the payload — see help.thrivedesk.com/en/webhooks."""
    if not secret:
        return None
    provided = (
        headers.get("x-td-signature")
        or headers.get("x-thrivedesk-signature")
        or headers.get("x-signature")
        or ""
    ).strip()
    if not provided:
        return False
    body_str = json.dumps(data, separators=(",", ":"))
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), body_str.encode("utf-8"), hashlib.sha1).digest()
    ).decode("ascii")
    return hmac.compare_digest(provided, expected)


# =========================================================================
# Rule engine — derive escalation type from event payload
# =========================================================================
URGENT_KEYWORDS = ("urgent", "blocked", "asap", "critical", "emergency")
URGENT_TAGS = {"high priority", "high-priority", "urgent"}
FEATURE_REQUEST_TAGS = {"feature request", "feature-request", "feature_request"}


def _classify(payload_data: Dict[str, Any]) -> str:
    """Return 'urgent' | 'feature' | 'other'."""
    subject = (payload_data.get("subject") or "").lower()
    tags = [t.lower() for t in (payload_data.get("tags") or []) if isinstance(t, str)]
    if (
        any(t in URGENT_TAGS for t in tags)
        or (payload_data.get("priority") or "").lower() == "high"
        or any(kw in subject for kw in URGENT_KEYWORDS)
    ):
        return "urgent"
    if any(t in FEATURE_REQUEST_TAGS for t in tags):
        return "feature"
    return "other"


def _client_name(data: Dict[str, Any]) -> str:
    customer = data.get("customer") or data.get("contact") or {}
    if isinstance(customer, dict):
        name = (
            (customer.get("firstName") or customer.get("first_name") or "")
            + " "
            + (customer.get("lastName") or customer.get("last_name") or "")
        ).strip()
        return name or customer.get("email") or "Unknown customer"
    return "Unknown customer"


def _client_email(data: Dict[str, Any]) -> str:
    customer = data.get("customer") or data.get("contact") or {}
    if isinstance(customer, dict):
        return (customer.get("email") or "").lower()
    return ""


# =========================================================================
# Escalation creator
# =========================================================================
async def _create_escalation(
    request: Request,
    db: AsyncIOMotorDatabase,
    *,
    data: Dict[str, Any],
    classification: str,
) -> Dict[str, Any]:
    """Idempotent: one escalation per (ticket_id, classification)."""
    ticket_id = data.get("ticketId") or data.get("ticket_id") or data.get("id")
    if not ticket_id:
        return {"outcome": "no_ticket_id"}
    existing = await db.support_escalations.find_one(
        {"ticket_id": ticket_id, "escalation_type": classification},
        {"_id": 0},
    )
    if existing:
        return {"outcome": "already_escalated", "escalation_id": existing["id"]}

    subject = data.get("subject") or "(no subject)"
    excerpt = data.get("excerpt") or data.get("body") or ""
    name = _client_name(data)
    email = _client_email(data)
    td: ThriveDeskClient = request.app.state.thrivedesk
    ticket_url = td.ticket_url(ticket_id)
    nifty: NiftyClient = request.app.state.nifty
    prefs = (
        (await __import__("app_settings", fromlist=["get_setting"]).get_setting(db, "nifty.preferences"))
        or {}
    )

    # ---- Build Nifty task ----
    if classification == "urgent":
        task_name = f"🚨 URGENT SUPPORT — {subject}"
        description = (
            f"{excerpt}\n\n"
            f"Client: {name}{f' ({email})' if email else ''}\n"
            f"ThriveDesk Link: {ticket_url}"
        )
        # Due today
        due_date = _now()
        # Prefer PM team, fall back to designer or developer
        assignees = (
            prefs.get("pm_assignees")
            or prefs.get("developer_assignees")
            or []
        )
        tags = ["Support", "Urgent"]
        custom_fields = {
            "ThriveDesk_Ticket_ID": str(ticket_id),
            "Source": "ThriveDesk",
        }
    elif classification == "feature":
        task_name = f"Feature Request — {subject}"
        description = (
            f"{excerpt}\n\n"
            f"Client: {name}{f' ({email})' if email else ''}\n\n"
            f"Note: Triage for scope & priority"
        )
        due_date = _now() + timedelta(days=5)
        assignees = prefs.get("pm_assignees") or []
        tags = ["Client Request"]
        custom_fields = {
            "ThriveDesk_Ticket_ID": str(ticket_id),
            "Source": "ThriveDesk",
            "Scope Creep?": "To Be Determined",
        }
    else:
        return {"outcome": "no_rule_matched"}

    nifty_task_id: Optional[str] = None
    nifty_error: Optional[str] = None
    if await nifty.is_connected():
        res = await nifty.create_task(
            name=task_name,
            description=description,
            assignees=assignees or None,
            due_date=due_date,
            tags=tags,
            custom_fields=custom_fields,
        )
        if res.get("success"):
            task = res.get("data") or {}
            nifty_task_id = task.get("id") or task.get("_id")
        else:
            nifty_error = str(res.get("error") or "create_task failed")
            log.warning("Nifty task creation failed for ticket %s: %s", ticket_id, nifty_error)

    # ---- Persist escalation record ----
    escalation_id = str(uuid4())
    doc = {
        "id": escalation_id,
        "ticket_id": str(ticket_id),
        "ticket_uuid": data.get("id"),
        "ticket_url": ticket_url,
        "subject": subject,
        "client_name": name,
        "client_email": email,
        "escalation_type": classification,
        "nifty_task_id": nifty_task_id,
        "nifty_error": nifty_error,
        "status": "open",
        "tags": data.get("tags") or [],
        "created_at": _iso(_now()),
        "raw_data": data,
    }
    await db.support_escalations.insert_one(prepare_for_mongo(doc))

    # ---- Fallback: if Nifty failed, queue an admin notification ----
    if nifty_error:
        notif = NotificationItem(
            kind="support_escalation_error",
            title=f"⚠️ Nifty escalation failed — create manually: {subject}",
            body=(
                f"Type: {classification}\nTicket: {ticket_url}\n"
                f"Client: {name} ({email})\nError: {nifty_error}\n\n"
                f"--- Description ---\n{description}"
            ),
            link="/admin/support-triage",
        )
        await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))

    # ---- Slack notification (urgent only) ----
    slack_result = {"ok": False, "reason": "not_configured"}
    if classification == "urgent":
        nifty_link = (
            f"https://nifty.pm/task/{nifty_task_id}"
            if nifty_task_id
            else "(Nifty task not created)"
        )
        slack_text = (
            f"🚨 URGENT: *{name}* — {subject}\n"
            f"<{ticket_url}|View in ThriveDesk> · <{nifty_link}|View in Nifty>"
        )
        slack_result = await slack_notifier.post_message(
            db, text=slack_text, channel_hint="#urgent-support"
        )
        if not slack_result.get("ok") and slack_result.get("reason") != "not_configured":
            # Slack delivery failed — log to admin notifications so it's not lost
            notif = NotificationItem(
                kind="support_escalation",
                title=f"⚠️ Slack alert failed for urgent ticket: {subject}",
                body=f"Reason: {slack_result.get('reason')}\nTicket: {ticket_url}",
                link="/admin/support-triage",
            )
            await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
        elif slack_result.get("reason") == "not_configured":
            # Surface URGENT events even when Slack isn't wired
            notif = NotificationItem(
                kind="support_escalation",
                title=f"🚨 Urgent support: {name} — {subject}",
                body=f"Ticket: {ticket_url}\nClient: {name} ({email})",
                link="/admin/support-triage",
            )
            await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))

    return {
        "outcome": "escalated",
        "escalation_id": escalation_id,
        "nifty_task_id": nifty_task_id,
        "nifty_error": nifty_error,
        "slack": slack_result,
        "classification": classification,
    }


# =========================================================================
# Webhook router (public)
# =========================================================================
thrivedesk_webhook_router = APIRouter(prefix="/webhooks", tags=["thrivedesk-webhooks"])


@thrivedesk_webhook_router.post("/thrivedesk")
async def thrivedesk_webhook(request: Request) -> Dict[str, Any]:
    db: AsyncIOMotorDatabase = request.app.state.db
    td: ThriveDeskClient = request.app.state.thrivedesk
    headers = {k.lower(): v for k, v in request.headers.items()}
    raw_body = await request.body()
    try:
        payload = await request.json() if raw_body else {}
    except Exception:
        payload = {"raw": raw_body.decode("utf-8", "replace")[:2000]}

    event_type = (payload.get("eventType") or payload.get("event_type") or "").lower()
    data = payload.get("data") or {}

    # Verify signature using DB-stored secret if env var not set
    await td._resolve_creds()
    sig_ok = _verify_td_signature(data, headers, td.webhook_secret)
    log.info("ThriveDesk webhook: event=%s sig_ok=%s", event_type, sig_ok)

    audit = {
        "received_at": _iso(_now()),
        "event_type": event_type,
        "sig_verified": sig_ok,
        "payload": payload,
    }
    await db.thrivedesk_webhook_events.insert_one(prepare_for_mongo(audit))

    if sig_ok is False:
        return {"ok": True, "verified": False, "note": "signature mismatch"}

    # Routes
    if event_type in ("conversation.created", "conversation.tags.updated"):
        classification = _classify(data)
        if classification != "other":
            result = await _create_escalation(request, db, data=data, classification=classification)
            return {"ok": True, "verified": True, "event": event_type, "result": result}
        return {"ok": True, "verified": True, "event": event_type, "result": {"outcome": "no_rule_matched"}}

    # Resolution path — when a Portal_Contact ticket is Resolved/Closed,
    # email the client (Part 6 reverse-sync)
    if event_type == "conversation.status.updated":
        new_status = (data.get("status") or "").lower()
        if new_status in ("resolved", "closed"):
            ticket_id = data.get("id") or data.get("ticketId") or data.get("ticket_id")
            try:
                from contact_routes import relay_td_resolution_to_client
                relay_res = await relay_td_resolution_to_client(request, db, ticket_id)
                if relay_res:
                    return {
                        "ok": True,
                        "verified": True,
                        "event": event_type,
                        "result": {"outcome": "portal_contact_resolved", "relay": relay_res},
                    }
            except Exception as exc:  # pragma: no cover
                log.warning("portal contact resolution relay failed: %s", exc)

    return {"ok": True, "verified": True, "event": event_type, "result": {"outcome": "ignored"}}


# =========================================================================
# Reverse-sync — called from milestone_routes.nifty_webhook on task completion
# =========================================================================
async def relay_nifty_completion_to_thrivedesk(
    request: Request,
    db: AsyncIOMotorDatabase,
    nifty_resource: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Called when a Nifty task has been marked complete.

    Inspects custom_fields for `ThriveDesk_Ticket_ID`. If present, posts a public
    reply on the ticket and (when `Close Ticket: Yes`) closes it.
    """
    custom_fields = nifty_resource.get("custom_fields") or {}
    ticket_id = (
        custom_fields.get("ThriveDesk_Ticket_ID")
        or custom_fields.get("thrivedesk_ticket_id")
    )
    if not ticket_id:
        return None
    td: ThriveDeskClient = request.app.state.thrivedesk
    close_ticket = (
        (custom_fields.get("Close Ticket") or custom_fields.get("close_ticket") or "")
        .strip()
        .lower()
        == "yes"
    )
    summary = (
        nifty_resource.get("comment")
        or nifty_resource.get("description")
        or "Issue resolved internally."
    )
    reply_text = (
        f"We've resolved your request! Summary: {summary[:300]}\n\n"
        f"Let us know if you need anything else."
    )

    reply_res = await td.add_reply(ticket_id, reply_text)
    closed_res = None
    if close_ticket:
        closed_res = await td.update_status(ticket_id, "Closed")

    # Mark escalation as resolved
    update = {
        "status": "closed" if close_ticket else "resolved",
        "resolved_at": _iso(_now()),
        "resolution_summary": summary[:500],
    }
    await db.support_escalations.update_one(
        {"ticket_id": str(ticket_id)},
        {"$set": update},
    )
    return {
        "ticket_id": ticket_id,
        "reply_ok": bool(reply_res.get("success")),
        "closed": bool(close_ticket and closed_res and closed_res.get("success")),
        "td_mode": td.mode,
    }


# =========================================================================
# Admin router — list escalations + manual replay + mock log
# =========================================================================
support_admin_router = APIRouter(
    prefix="/admin/support-triage",
    tags=["support-admin"],
    dependencies=[Depends(get_current_user)],
)


@support_admin_router.get("")
async def admin_list_escalations(
    db: AsyncIOMotorDatabase = Depends(get_db),
    status: Optional[str] = None,
    escalation_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    if escalation_type:
        q["escalation_type"] = escalation_type
    docs = (
        await db.support_escalations.find(q, {"_id": 0, "raw_data": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return [serialize_doc(d) for d in docs]


@support_admin_router.get("/mock-log")
async def admin_mock_log(td: ThriveDeskClient = Depends(get_td)) -> Dict[str, Any]:
    return {"mode": td.mode, "entries": list(reversed(td.mock_log))[:50]}


class ManualResolveRequest(BaseModel):
    summary: Optional[str] = Field(default=None, max_length=1000)
    close_ticket: bool = False


@support_admin_router.post("/{escalation_id}/resolve")
async def admin_resolve_escalation(
    escalation_id: str,
    req: ManualResolveRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    td: ThriveDeskClient = Depends(get_td),
) -> Dict[str, Any]:
    doc = await db.support_escalations.find_one({"id": escalation_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    summary = req.summary or "Issue resolved."
    reply_res = await td.add_reply(doc["ticket_id"], (
        f"We've resolved your request! Summary: {summary[:300]}\n\n"
        f"Let us know if you need anything else."
    ))
    closed_res = None
    if req.close_ticket:
        closed_res = await td.update_status(doc["ticket_id"], "Closed")
    await db.support_escalations.update_one(
        {"id": escalation_id},
        {
            "$set": {
                "status": "closed" if req.close_ticket else "resolved",
                "resolved_at": _iso(_now()),
                "resolution_summary": summary[:500],
            }
        },
    )
    fresh = await db.support_escalations.find_one({"id": escalation_id}, {"_id": 0, "raw_data": 0})
    return {
        "escalation": serialize_doc(fresh),
        "reply_ok": bool(reply_res.get("success")),
        "closed": bool(req.close_ticket and closed_res and closed_res.get("success")),
        "td_mode": td.mode,
    }


@support_admin_router.get("/{escalation_id}/timeline")
async def admin_escalation_timeline(
    escalation_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    td: ThriveDeskClient = Depends(get_td),
) -> Dict[str, Any]:
    """Build a chronological event timeline for a single escalation.

    Surfaces every touch point in the loop:
      • ThriveDesk webhook event (`created` / `tags.updated`)
      • Classification result + Nifty task creation outcome
      • Slack notification result (with fallback to admin notification)
      • Manual replies posted from `/admin/support-triage/{id}/resolve`
      • Final status transition
      • Any related admin notifications

    Combines data from `support_escalations`, `thrivedesk_webhook_events`,
    and `notifications` collections.
    """
    esc = await db.support_escalations.find_one({"id": escalation_id}, {"_id": 0})
    if not esc:
        raise HTTPException(404, "Escalation not found")

    events: List[Dict[str, Any]] = []

    # Initial creation event
    events.append({
        "kind": "escalation_created",
        "title": f"Ticket classified as {esc['escalation_type'].upper()}",
        "body": (
            f"Subject: {esc['subject']}\n"
            f"Client: {esc.get('client_name')} ({esc.get('client_email') or 'no email'})\n"
            f"Tags: {', '.join(esc.get('tags') or []) or '—'}"
        ),
        "at": esc.get("created_at"),
        "icon": "alert",
        "actor": "ThriveDesk",
    })

    # Nifty task creation result
    if esc.get("nifty_task_id"):
        events.append({
            "kind": "nifty_task_created",
            "title": "Nifty PM task created",
            "body": f"Task ID: {esc['nifty_task_id']}\nAuto-assigned to PM/Support lead.",
            "at": esc.get("created_at"),
            "icon": "check",
            "actor": "Nifty PM",
        })
    elif esc.get("nifty_error"):
        events.append({
            "kind": "nifty_task_failed",
            "title": "Nifty task creation FAILED",
            "body": (
                f"Reason: {esc['nifty_error']}\n"
                "Admin notification queued so you can create the task manually."
            ),
            "at": esc.get("created_at"),
            "icon": "error",
            "actor": "Nifty PM",
        })
    else:
        events.append({
            "kind": "nifty_task_skipped",
            "title": "Nifty PM not connected — task creation skipped",
            "body": "Connect Nifty in /admin/integrations to auto-create tasks.",
            "at": esc.get("created_at"),
            "icon": "info",
            "actor": "Nifty PM",
        })

    # Slack alerts — only for urgent escalations
    if esc.get("escalation_type") == "urgent":
        slack_notifications = await db.notifications.find(
            {
                "kind": "support_escalation",
                "title": {"$regex": esc["subject"][:30], "$options": "i"},
            },
            {"_id": 0},
        ).to_list(5)
        if slack_notifications:
            events.append({
                "kind": "slack_fallback",
                "title": "Slack not configured — admin notification queued",
                "body": "Connect Slack in /admin/integrations → Credentials to enable instant alerts.",
                "at": esc.get("created_at"),
                "icon": "info",
                "actor": "Slack",
            })

    # Related ThriveDesk webhook events (looking up by ticket id)
    td_events = (
        await db.thrivedesk_webhook_events.find(
            {"payload.data.ticketId": _coerce_ticket_id(esc["ticket_id"])},
            {"_id": 0},
        )
        .sort("received_at", 1)
        .to_list(50)
    )
    for ev in td_events:
        events.append({
            "kind": f"thrivedesk_{ev.get('event_type', 'event')}",
            "title": f"ThriveDesk webhook: {ev.get('event_type')}",
            "body": f"Verified: {ev.get('sig_verified')}",
            "at": ev.get("received_at"),
            "icon": "webhook",
            "actor": "ThriveDesk",
        })

    # Resolution
    if esc.get("resolved_at"):
        events.append({
            "kind": "resolution",
            "title": f"Marked {esc['status'].upper()}",
            "body": esc.get("resolution_summary") or "Issue resolved.",
            "at": esc.get("resolved_at"),
            "icon": "check_circle",
            "actor": "Admin",
        })

    # Sort chronologically (events without `at` go last)
    events.sort(key=lambda e: e.get("at") or "9999")

    # Annotate with ThriveDesk live thread when the API key is configured
    await td._resolve_creds()
    live_thread = None
    if td.is_configured:
        thread_res = await td.get_conversation(esc["ticket_id"])
        if thread_res.get("success") and not thread_res.get("scope_limited"):
            live_thread = thread_res.get("data")

    return {
        "escalation": serialize_doc(esc),
        "events": events,
        "live_thread": live_thread,
        "td_mode": td.mode,
    }


def _coerce_ticket_id(tid: Any) -> Any:
    """Webhook payloads sometimes carry numeric ticket IDs; our store keeps strings."""
    try:
        return int(tid)
    except (ValueError, TypeError):
        return tid


class SimulateTicketRequest(BaseModel):
    subject: str = "Sandbox test — please make headline bigger"
    body: Optional[str] = "This is a synthetic test ticket created from the admin UI."
    tags: List[str] = Field(default_factory=lambda: ["High Priority"])
    customer_name: str = "Sandbox Client"
    customer_email: EmailStr = "sandbox@example.com"


@support_admin_router.post("/simulate-ticket")
async def admin_simulate_ticket(
    req: SimulateTicketRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Synthetic test: bypass ThriveDesk and route a fake ticket through the rule engine."""
    fake_ticket_id = f"sandbox_{uuid4().hex[:8]}"
    data = {
        "id": fake_ticket_id,
        "ticketId": fake_ticket_id,
        "subject": req.subject,
        "excerpt": req.body or "",
        "tags": req.tags,
        "customer": {
            "firstName": req.customer_name.split(" ")[0],
            "lastName": " ".join(req.customer_name.split(" ")[1:]),
            "email": req.customer_email,
        },
        "priority": "High" if any(t.lower() in URGENT_TAGS for t in req.tags) else "Normal",
        "createdAt": _iso(_now()),
    }
    classification = _classify(data)
    if classification == "other":
        raise HTTPException(400, "No rule matched the provided tags/subject")
    return await _create_escalation(request, db, data=data, classification=classification)


__all__ = [
    "thrivedesk_webhook_router",
    "support_admin_router",
    "relay_nifty_completion_to_thrivedesk",
]
