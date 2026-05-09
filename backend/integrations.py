"""TidyCal webhook receiver + notifications + internal sync logic.

PUBLIC ENDPOINTS (no auth required):
- POST /api/webhooks/tidycal — receives booking events from TidyCal

AUTHED ENDPOINTS:
- GET  /api/notifications      — list unread first
- POST /api/notifications/{id}/read
- POST /api/notifications/clear
- POST /api/sync/case-study/{id}/to-content — generate LinkedIn post from case study
- POST /api/sync/testimonial/{id}/feature   — mark testimonial featured + draft post
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from models import ContentPiece, NotificationItem, Prospect

log = logging.getLogger("webhooks")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_db(request: Request):
    return request.app.state.db


def get_or_client(request: Request):
    return request.app.state.openrouter


# =============================================================================
# WEBHOOKS — PUBLIC (no auth)
# =============================================================================
webhook_router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _extract_booking_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Extract relevant booking fields from a TidyCal webhook payload.

    TidyCal payloads look like:
    {
      "event": "booking.created" | "booking.updated" | "booking.cancelled",
      "data": {
        "id": ..., "starts_at": "...", "ends_at": "...",
        "contact": {"name":..., "email":..., "phone":...},
        "booking_type": {"title":...}, "meeting_url": "...", ...
      }
    }
    Plus we accept generic dicts gracefully.
    """
    event = payload.get("event") or payload.get("type") or ""
    data = payload.get("data") or payload.get("booking") or payload
    contact = data.get("contact") or {}
    return {
        "event": str(event),
        "booking_id": data.get("id") or data.get("uuid"),
        "starts_at": data.get("starts_at") or data.get("start_at") or data.get("start"),
        "ends_at": data.get("ends_at") or data.get("end_at") or data.get("end"),
        "name": contact.get("name") or data.get("name"),
        "email": contact.get("email") or data.get("email"),
        "phone": contact.get("phone") or data.get("phone"),
        "booking_type": (data.get("booking_type") or {}).get("title") if isinstance(data.get("booking_type"), dict) else data.get("booking_type"),
        "meeting_url": data.get("meeting_url") or data.get("zoom_url"),
        "raw": data,
    }


@webhook_router.post("/tidycal")
async def tidycal_webhook(request: Request) -> Dict[str, Any]:
    """Receive TidyCal booking events and create/update prospects + notifications.

    Idempotent: re-delivery with the same booking_id will not create duplicates.
    """
    db = request.app.state.db
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    fields = _extract_booking_fields(payload)
    event = fields["event"].lower() if fields["event"] else ""
    log.info("TidyCal webhook event=%s booking=%s", event, fields["booking_id"])

    # Always log raw event for audit
    await db.tidycal_events.insert_one(
        prepare_for_mongo({
            "received_at": _now(),
            "event": event,
            "booking_id": fields["booking_id"],
            "payload": fields["raw"],
        })
    )

    name = fields.get("name")
    email = fields.get("email")
    starts_at = fields.get("starts_at")

    if not name and not email:
        return {"ok": True, "skipped": "no contact info"}

    # Find or create a prospect (by email if available, else by booking_id+name)
    query = {}
    if email:
        query = {"email": email}
    elif fields.get("booking_id"):
        query = {"notes": {"$regex": str(fields["booking_id"])}}

    existing = await db.prospects.find_one(query) if query else None

    next_action = (
        f"Discovery call: {fields.get('booking_type') or 'TidyCal booking'}"
        + (f" — {fields.get('meeting_url')}" if fields.get("meeting_url") else "")
    )

    if event in ("booking.cancelled", "booking_cancelled"):
        # Cancelled — annotate but don't change status to lost automatically
        if existing:
            await db.prospects.update_one(
                {"id": existing["id"]},
                {
                    "$set": {
                        "next_action": "Cancelled by prospect",
                        "next_action_at": None,
                        "updated_at": _now().isoformat(),
                    }
                },
            )
        notif = NotificationItem(
            kind="booking",
            title="Discovery call cancelled",
            body=f"{name or email} cancelled their booking.",
            link="/admin/pipeline",
        )
        await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
        return {"ok": True, "action": "cancelled-noted"}

    if not existing:
        p = Prospect(
            name=name or email,
            email=email or None,
            source="tidycal",
            status="contacted",
            notes=f"Booking ID: {fields.get('booking_id')}\nMeeting URL: {fields.get('meeting_url') or '—'}",
            next_action=next_action,
            next_action_at=starts_at if isinstance(starts_at, str) else None,
        )
        await db.prospects.insert_one(prepare_for_mongo(p.model_dump()))
        notif = NotificationItem(
            kind="booking",
            title="New discovery call booked",
            body=f"{name or email} • {starts_at or 'time TBD'}",
            link="/admin/pipeline",
        )
        await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
        return {"ok": True, "action": "created", "prospect_id": p.id}

    # Update existing
    update = {
        "next_action": next_action,
        "updated_at": _now().isoformat(),
    }
    if starts_at:
        update["next_action_at"] = starts_at
    if email and not existing.get("email"):
        update["email"] = email
    await db.prospects.update_one({"id": existing["id"]}, {"$set": update})
    notif = NotificationItem(
        kind="booking",
        title="Discovery call updated",
        body=f"{existing.get('name')} • {starts_at or 'time updated'}",
        link="/admin/pipeline",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    return {"ok": True, "action": "updated", "prospect_id": existing.get("id")}


# =============================================================================
# NOTIFICATIONS (authed)
# =============================================================================
notification_router = APIRouter(
    prefix="/notifications", tags=["notifications"], dependencies=[Depends(get_current_user)]
)


@notification_router.get("")
async def list_notifications(db=Depends(get_db), limit: int = 30) -> Dict[str, Any]:
    docs = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {
        "items": [serialize_doc(d) for d in docs],
        "unread": sum(1 for d in docs if not d.get("read", False)),
    }


@notification_router.post("/{notif_id}/read")
async def mark_read(notif_id: str, db=Depends(get_db)) -> Dict[str, Any]:
    res = await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@notification_router.post("/clear")
async def clear_all(db=Depends(get_db)) -> Dict[str, Any]:
    await db.notifications.update_many({}, {"$set": {"read": True}})
    return {"ok": True}


# =============================================================================
# INTERNAL SYNC (authed)
# =============================================================================
sync_router = APIRouter(prefix="/sync", tags=["sync"], dependencies=[Depends(get_current_user)])


@sync_router.post("/case-study/{cs_id}/to-content")
async def case_study_to_content(
    cs_id: str, db=Depends(get_db), or_client=Depends(get_or_client)
) -> Dict[str, Any]:
    """Generate a LinkedIn post draft from a case study and save it as a draft."""
    from ai_prompts import generate_content_post  # local import to avoid cycles

    cs = await db.case_studies.find_one({"id": cs_id}, {"_id": 0})
    if not cs:
        raise HTTPException(status_code=404, detail="Case study not found")

    topic = (
        f"Case study: {cs.get('client_name')} ({cs.get('industry')}) — "
        f"{cs.get('challenge')[:120]} → {cs.get('solution')[:120]}. "
        f"Delivered in {cs.get('timeline_days')} days."
    )
    try:
        ai = await generate_content_post(
            or_client, topic=topic, type_="case_study", format_="single_post", length="medium"
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI failed: {e}")

    body = (ai.get("hook", "") + "\n\n" + ai.get("body", "") + "\n\n" + ai.get("cta", "")).strip()
    cp = ContentPiece(
        title=f"Case study: {cs.get('client_name')}",
        type="case_study",
        body=body,
        video_script=ai.get("video_script"),
        visual_direction=ai.get("visual_direction"),
        cta=ai.get("cta"),
        status="draft",
        tags=ai.get("hashtags", []),
    )
    await db.content_pieces.insert_one(prepare_for_mongo(cp.model_dump()))

    # Mark linkedin_post checklist on case study
    checklist = cs.get("checklist") or {}
    checklist["linkedin_post"] = True
    await db.case_studies.update_one(
        {"id": cs_id},
        {"$set": {"checklist": checklist, "updated_at": _now().isoformat()}},
    )

    notif = NotificationItem(
        kind="task",
        title="LinkedIn post draft created",
        body=f"From case study: {cs.get('client_name')}",
        link="/admin/content",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))

    return {"ok": True, "content_id": cp.id, "ai": ai}


@sync_router.post("/testimonial/{t_id}/feature")
async def feature_testimonial(
    t_id: str, db=Depends(get_db), or_client=Depends(get_or_client)
) -> Dict[str, Any]:
    """Mark a testimonial as featured and draft a LinkedIn 'celebrate' post."""
    from ai_prompts import generate_content_post

    t = await db.testimonials.find_one({"id": t_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Testimonial not found")

    await db.testimonials.update_one(
        {"id": t_id},
        {"$set": {"featured": True, "status": "featured", "updated_at": _now().isoformat()}},
    )

    topic = (
        f"Testimonial highlight from {t.get('client_name')} ({t.get('company') or 'client'}). "
        f"Quote: \"{(t.get('written') or '')[:200]}\". Project: {t.get('project') or 'web app'}"
    )
    try:
        ai = await generate_content_post(
            or_client, topic=topic, type_="case_study", format_="single_post", length="short"
        )
    except Exception as e:
        log.warning("AI draft failed for testimonial %s: %s", t_id, e)
        ai = {}
    if ai:
        body = (ai.get("hook", "") + "\n\n" + ai.get("body", "") + "\n\n" + ai.get("cta", "")).strip()
        cp = ContentPiece(
            title=f"Testimonial: {t.get('client_name')}",
            type="case_study",
            body=body,
            video_script=ai.get("video_script"),
            visual_direction=ai.get("visual_direction"),
            cta=ai.get("cta"),
            status="draft",
            tags=ai.get("hashtags", []),
        )
        await db.content_pieces.insert_one(prepare_for_mongo(cp.model_dump()))

    notif = NotificationItem(
        kind="task",
        title="Testimonial featured",
        body=f"{t.get('client_name')} marked featured + draft post created.",
        link="/admin/testimonials",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    return {"ok": True}
