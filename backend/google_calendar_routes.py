"""Google Calendar admin routes (Phase 16).

Admin OAuth flow + optional "sync milestone to calendar" hook.

Routes:
  • GET /api/admin/integrations/calendar/start — returns the authorization URL
  • GET /api/oauth/calendar/callback        — Google redirects here with `code`
  • GET /api/admin/integrations/calendar/status — connected?, primary calendar info
  • POST /api/admin/integrations/calendar/test — light auth probe
  • POST /api/admin/integrations/calendar/disconnect — wipe stored tokens
  • POST /api/admin/milestones/{id}/calendar-event — create a Calendar event for a milestone
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from google_calendar_client import GoogleCalendarClient

log = logging.getLogger("calendar.routes")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_cal(request: Request) -> GoogleCalendarClient:
    return request.app.state.google_calendar


def _now() -> datetime:
    return datetime.now(timezone.utc)


# =========================================================================
# Public OAuth callback — Google redirects here
# =========================================================================
calendar_oauth_router = APIRouter(prefix="/oauth", tags=["calendar-oauth"])


@calendar_oauth_router.get("/calendar/callback")
async def calendar_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    cal: GoogleCalendarClient = Depends(get_cal),
):
    """Finalize Google OAuth and redirect the admin back to /admin/integrations."""
    base = (request.app.state.config.get("APP_BASE_URL") if hasattr(request.app.state, "config") else None)
    if not base:
        import os
        base = os.environ.get("APP_BASE_URL") or "https://bybloomlabs.com"
    target = f"{base.rstrip('/')}/admin/integrations"

    if error:
        return RedirectResponse(f"{target}?calendar_error={error}", status_code=302)
    if not code:
        return RedirectResponse(f"{target}?calendar_error=missing_code", status_code=302)

    # Verify state matches what we issued
    from app_settings import get_setting
    stored_state = await get_setting(db, "calendar_oauth_state")
    if state and stored_state and stored_state.get("value") and stored_state["value"] != state:
        return RedirectResponse(f"{target}?calendar_error=state_mismatch", status_code=302)

    res = await cal.exchange_code(code)
    if not res.get("success"):
        return RedirectResponse(
            f"{target}?calendar_error=exchange_failed", status_code=302
        )
    return RedirectResponse(f"{target}?calendar_connected=1", status_code=302)


# =========================================================================
# Admin router
# =========================================================================
calendar_admin_router = APIRouter(
    prefix="/admin/integrations/calendar",
    tags=["calendar-admin"],
    dependencies=[Depends(get_current_user)],
)


@calendar_admin_router.get("/start")
async def calendar_start_oauth(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    cal: GoogleCalendarClient = Depends(get_cal),
) -> Dict[str, Any]:
    """Return the Google authorization URL for the admin to visit."""
    await cal._resolve_creds()
    if not cal.is_oauth_configured:
        raise HTTPException(
            503,
            "Google Calendar OAuth is not configured — set GOOGLE_CLIENT_ID + "
            "GOOGLE_CLIENT_SECRET + GOOGLE_CALENDAR_REDIRECT_URI (env or credentials).",
        )
    state = secrets.token_urlsafe(24)
    from app_settings import set_setting
    await set_setting(db, "calendar_oauth_state", {"value": state, "issued_at": _now().isoformat()})
    return {"authorization_url": cal.authorization_url(state)}


@calendar_admin_router.get("/status")
async def calendar_status(
    cal: GoogleCalendarClient = Depends(get_cal),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Return connection state + calendar metadata when connected."""
    await cal._resolve_creds()
    connected = await cal.is_connected()
    primary = None
    upcoming_count = None
    if connected:
        meta = await cal.get_calendar_metadata("primary")
        if meta.get("success"):
            primary = {
                "summary": (meta.get("data") or {}).get("summary"),
                "timeZone": (meta.get("data") or {}).get("timeZone"),
                "id": (meta.get("data") or {}).get("id"),
            }
        events = await cal.list_upcoming_events(max_results=10)
        if events.get("success"):
            upcoming_count = len((events.get("data") or {}).get("items") or [])
    stored = await db.integrations.find_one(
        {"key": "google_calendar"},
        {"_id": 0, "access_token": 0, "refresh_token": 0},
    )
    return {
        "oauth_configured": cal.is_oauth_configured,
        "redirect_uri": cal.redirect_uri,
        "connected": connected,
        "primary": primary,
        "upcoming_count": upcoming_count,
        "stored": serialize_doc(stored) if stored else None,
    }


@calendar_admin_router.post("/test")
async def calendar_test(
    cal: GoogleCalendarClient = Depends(get_cal),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Light auth probe — fetch the primary calendar metadata."""
    await cal._resolve_creds()
    if not await cal.is_connected():
        raise HTTPException(503, "Google Calendar not connected — click Connect first")
    res = await cal.get_calendar_metadata("primary")
    ok = bool(res.get("success"))
    try:
        from integrations_admin_routes import _record_ping
        await _record_ping(db, "google_calendar", ok=ok, detail=None if ok else str(res.get("error"))[:80])
    except Exception:
        pass
    if not ok:
        raise HTTPException(502, f"Calendar API call failed: {res.get('error')}")
    return {
        "ok": True,
        "calendar_summary": (res.get("data") or {}).get("summary"),
    }


@calendar_admin_router.post("/disconnect")
async def calendar_disconnect(
    cal: GoogleCalendarClient = Depends(get_cal),
) -> Dict[str, Any]:
    await cal.disconnect()
    return {"ok": True}


@calendar_admin_router.get("/events")
async def calendar_list_events(
    cal: GoogleCalendarClient = Depends(get_cal),
    max_results: int = Query(10, ge=1, le=50),
) -> Dict[str, Any]:
    if not await cal.is_connected():
        raise HTTPException(503, "Not connected")
    res = await cal.list_upcoming_events(max_results=max_results)
    if not res.get("success"):
        raise HTTPException(502, str(res.get("error")))
    items = (res.get("data") or {}).get("items") or []
    return {"items": items, "count": len(items)}


# =========================================================================
# Milestone → Calendar event sync
# =========================================================================
class MilestoneEventRequest(BaseModel):
    """Optional overrides — defaults fill from the milestone doc."""
    summary: Optional[str] = None
    description: Optional[str] = None
    start_iso: Optional[str] = None
    end_iso: Optional[str] = None
    attendees: Optional[list[EmailStr]] = None


calendar_milestones_router = APIRouter(
    prefix="/admin/milestones",
    tags=["calendar-milestones"],
    dependencies=[Depends(get_current_user)],
)


@calendar_milestones_router.post("/{milestone_id}/calendar-event")
async def create_calendar_event_for_milestone(
    milestone_id: str,
    req: MilestoneEventRequest,
    cal: GoogleCalendarClient = Depends(get_cal),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Create a Google Calendar event for a milestone deadline.

    Defaults:
      • summary = "Milestone deadline: {title}"
      • description = milestone description + portal link
      • start = milestone.deadline OR (now + 7 days) at 9am UTC
      • end   = start + 1 hour
      • attendees = [milestone.client_email]
    """
    if not await cal.is_connected():
        raise HTTPException(503, "Google Calendar not connected")
    m = await db.milestones.find_one({"id": milestone_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Milestone not found")

    summary = req.summary or f"Milestone deadline: {m.get('title')}"
    description = (
        req.description
        or f"{m.get('description') or ''}\n\nProject: {m.get('project_name', '—')}\n"
        f"Client: {m.get('client_email', '—')}"
    )
    start_iso = req.start_iso
    if not start_iso:
        deadline = m.get("deadline") or (_now() + timedelta(days=7))
        if isinstance(deadline, str):
            try:
                deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
            except Exception:
                deadline = _now() + timedelta(days=7)
        # Anchor at 9am UTC for predictability
        deadline = deadline.replace(hour=9, minute=0, second=0, microsecond=0)
        start_iso = deadline.isoformat()
    end_iso = req.end_iso
    if not end_iso:
        try:
            start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        except Exception:
            start_dt = _now() + timedelta(days=7, hours=9)
        end_iso = (start_dt + timedelta(hours=1)).isoformat()
    attendees = list(req.attendees) if req.attendees else (
        [m["client_email"]] if m.get("client_email") else []
    )
    res = await cal.create_event(
        summary=summary,
        description=description,
        start_iso=start_iso,
        end_iso=end_iso,
        attendees=attendees,
    )
    if not res.get("success"):
        raise HTTPException(502, f"Calendar create failed: {res.get('error')}")
    event = res.get("data") or {}
    # Persist on the milestone for one-click revisit
    await db.milestones.update_one(
        {"id": milestone_id},
        {
            "$set": {
                "calendar_event_id": event.get("id"),
                "calendar_event_link": event.get("htmlLink"),
                "calendar_synced_at": _now().isoformat(),
            }
        },
    )
    return {
        "ok": True,
        "event_id": event.get("id"),
        "html_link": event.get("htmlLink"),
        "start": event.get("start"),
        "end": event.get("end"),
    }


__all__ = [
    "calendar_oauth_router",
    "calendar_admin_router",
    "calendar_milestones_router",
]
