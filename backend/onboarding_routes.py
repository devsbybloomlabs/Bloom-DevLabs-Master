"""Onboarding form (3-phase) + Nifty PM + Agency Handy automation.

Phase 1 — Design Language
Phase 2 — Function Language
Phase 3 — Company Background & Kickoff

Flow:
  • Auto-created on PayPal payment success (best-effort).
  • Resumable via secure token link (admin can re-send).
  • Each phase submission creates Nifty task(s) and notifies admin/email.
  • Phase 3 also creates an Agency Handy order/project if available.
  • Robust fallback: if Nifty fails, the admin gets a notification with full
    form payload so they can create the task manually.
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from client_routes import get_current_client
from db_utils import prepare_for_mongo
from models import (
    NotificationItem,
    OnboardingPhase1,
    OnboardingPhase2,
    OnboardingPhase3,
    OnboardingSubmission,
)
from nifty_client import NiftyClient

log = logging.getLogger("onboarding")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_nifty(request: Request) -> NiftyClient:
    return request.app.state.nifty


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _business_days_from_now(days: int) -> datetime:
    """Naive business-days calc (Mon-Fri). Adds whole days."""
    now = _now()
    added = 0
    cursor = now
    while added < days:
        cursor = cursor + timedelta(days=1)
        if cursor.weekday() < 5:  # 0-4 Mon-Fri
            added += 1
    return cursor


def _safe_get_assignees() -> Dict[str, List[str]]:
    """Read team assignee emails from env (comma-separated). DB-stored
    preferences (set via /admin/integrations) override env values when present."""

    def parse(env_key: str) -> List[str]:
        raw = os.environ.get(env_key, "")
        return [e.strip() for e in raw.split(",") if e.strip()]

    return {
        "designer": parse("NIFTY_DESIGNER_ASSIGNEES"),
        "pm": parse("NIFTY_PM_ASSIGNEES"),
        "developer": parse("NIFTY_DEVELOPER_ASSIGNEES"),
    }


async def _resolve_assignees(db: AsyncIOMotorDatabase) -> Dict[str, List[str]]:
    """Final assignee resolution: DB preferences first, env fallback."""
    from app_settings import get_setting
    env_defaults = _safe_get_assignees()
    prefs = await get_setting(db, "nifty.preferences") or {}
    return {
        "designer": prefs.get("designer_assignees") or env_defaults["designer"],
        "pm": prefs.get("pm_assignees") or env_defaults["pm"],
        "developer": prefs.get("developer_assignees") or env_defaults["developer"],
    }


# ============================================================
# Helpers — find/upsert onboarding doc
# ============================================================
async def _get_or_create_onboarding(
    db: AsyncIOMotorDatabase,
    *,
    client_email: str,
    client_name: str = "",
    client_id: Optional[str] = None,
) -> Dict[str, Any]:
    email_lc = client_email.lower().strip()
    existing = await db.onboardings.find_one({"client_email": email_lc}, {"_id": 0})
    if existing:
        return existing
    doc = OnboardingSubmission(
        client_email=email_lc,
        client_name=client_name,
        client_id=client_id,
        resume_token=secrets.token_urlsafe(32),
    ).model_dump()
    await db.onboardings.insert_one(prepare_for_mongo(doc))
    return doc


async def ensure_onboarding_for_payment(
    db: AsyncIOMotorDatabase,
    request: Request,
    *,
    email: str,
    name: str,
    source: str,
    source_id: str,
) -> Dict[str, Any]:
    """Called from PayPal capture/webhook. Idempotent."""
    doc = await _get_or_create_onboarding(
        db, client_email=email, client_name=name
    )
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    onboarding_url = f"{base}/portal/onboarding?token={doc['resume_token']}"
    # Notify admin
    notif = NotificationItem(
        kind="onboarding",
        title=f"📝 Onboarding ready: {email}",
        body=f"Triggered by {source} ({source_id}). Resume link: {onboarding_url}",
        link="/admin/onboarding",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    # Best-effort email to client
    try:
        emailit = request.app.state.emailit
        if emailit.is_configured:
            await emailit.send_email(
                to=email,
                subject="Let's kick off your project — quick 3-step onboarding",
                html=_onboarding_email_html(name or email.split("@")[0], onboarding_url),
                text=f"Start your onboarding: {onboarding_url}",
            )
    except Exception as exc:  # pragma: no cover
        log.warning("Onboarding email failed: %s", exc)
    return doc


def _onboarding_email_html(name: str, url: str) -> str:
    return f"""
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif; color:#0F172A; background:#F8FAFC; padding:32px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <h1 style="margin:0 0 16px; font-size:24px; color:#1E3A8A;">Let's get building, {name} 🚀</h1>
    <p style="line-height:1.6; color:#475569;">Your project is officially in motion! To kick things off, we need a quick 3-step onboarding from you. It takes ~10 minutes.</p>
    <p style="line-height:1.6; color:#475569;"><strong>Step 1:</strong> Design language (links you love + why)</p>
    <p style="line-height:1.6; color:#475569;"><strong>Step 2:</strong> Function references (apps that work like yours should)</p>
    <p style="line-height:1.6; color:#475569;"><strong>Step 3:</strong> Company background + success metrics</p>
    <p style="margin:28px 0;"><a href="{url}" style="background:#1E3A8A; color:#fff; padding:14px 28px; border-radius:10px; text-decoration:none; font-weight:600;">Start onboarding →</a></p>
    <p style="color:#94A3B8; font-size:13px;">You can save and resume anytime using the same link.</p>
    <p style="color:#94A3B8; font-size:13px;">— The Bloom Labs Team</p>
  </div>
</body></html>"""


# ============================================================
# Nifty task creation per phase
# ============================================================
async def _create_nifty_task_safe(
    nifty: NiftyClient,
    db: AsyncIOMotorDatabase,
    *,
    onboarding_id: str,
    phase_key: str,
    name: str,
    description: str,
    assignees: List[str],
    due_date: datetime,
    custom_fields: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Create a Nifty task; on failure persist error and notify admin.
    Returns Nifty task id or None on failure."""
    res = await nifty.create_task(
        name=name,
        description=description,
        assignees=assignees or None,
        due_date=due_date,
        custom_fields=custom_fields,
    )
    # Detect & rewrite the most common cause so the admin sees something actionable
    if not res.get("success"):
        err_lower = (res.get("error") or "").lower()
        status_code = res.get("status") or 0
        looks_disconnected = (
            "nifty not connected" in err_lower
            or "not connected" in err_lower
            or (status_code == 0 and "timeout" not in err_lower)
            or status_code == 401
        )
        if looks_disconnected:
            res["error"] = (
                "Nifty isn't connected. Open /admin/integrations → Nifty → "
                "Connect, then click 'Retry pending tasks' on the onboarding page."
            )
    if res.get("success"):
        task = res.get("data") or {}
        task_id = task.get("id") or task.get("_id") or ""
        await db.onboardings.update_one(
            {"id": onboarding_id},
            {"$push": {f"nifty_task_ids.{phase_key}": task_id}},
        )
        return task_id
    # FAILURE — log + notify admin with full payload for manual creation
    err_entry = {
        "phase": phase_key,
        "task_name": name,
        "description_preview": description[:500],
        "assignees": assignees,
        "due_date": due_date.isoformat(),
        "error": res.get("error"),
        "status": res.get("status"),
        "at": _now().isoformat(),
    }
    await db.onboardings.update_one(
        {"id": onboarding_id},
        {"$push": {"nifty_errors": err_entry}},
    )
    notif = NotificationItem(
        kind="onboarding_error",
        title="⚠️ Nifty task failed — create manually",
        body=(
            f"Phase: {phase_key}\nTask: {name}\nAssignees: {assignees}\n"
            f"Error: {res.get('error')}\n\n--- Description ---\n{description}"
        ),
        link="/admin/onboarding",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    return None


# ============================================================
# Phase processors
# ============================================================
async def _process_phase1(
    db: AsyncIOMotorDatabase,
    request: Request,
    onboarding: Dict[str, Any],
) -> Dict[str, Any]:
    teams = await _resolve_assignees(db)
    p1 = onboarding.get("phase1", {})
    links = p1.get("design_links") or []
    desc_lines = ["[Design Links]"]
    for idx, link in enumerate(links, start=1):
        url = (link or {}).get("url", "—")
        why = (link or {}).get("why", "—")
        desc_lines.append(f"{idx}. {url}\n   Why: {why}")
    desc_lines.append("")
    desc_lines.append(f"Color Preferences: {p1.get('color_preferences', '—')}")
    desc_lines.append(f"Mood Keywords: {p1.get('mood_keywords', '—')}")
    desc = "\n".join(desc_lines)
    due = _business_days_from_now(2)
    nifty: NiftyClient = request.app.state.nifty
    task_id = await _create_nifty_task_safe(
        nifty, db,
        onboarding_id=onboarding["id"],
        phase_key="phase1",
        name=f"Design Language Review — {onboarding.get('client_name') or onboarding['client_email']}",
        description=desc,
        assignees=teams["designer"],
        due_date=due,
        custom_fields={"Client_ID": onboarding.get("client_id") or onboarding["client_email"]},
    )
    return {"task_id": task_id, "due_date": due.isoformat()}


async def _process_phase2(
    db: AsyncIOMotorDatabase,
    request: Request,
    onboarding: Dict[str, Any],
) -> Dict[str, Any]:
    teams = await _resolve_assignees(db)
    p2 = onboarding.get("phase2", {})
    links = p2.get("function_links") or []
    desc_lines = ["[Function References]"]
    for idx, link in enumerate(links, start=1):
        url = (link or {}).get("url", "—")
        why = (link or {}).get("why", "—")
        desc_lines.append(f"{idx}. {url}\n   Why: {why}")
    desc_lines.append("")
    desc_lines.append(f"Additional Requirements: {p2.get('additional_specs', '—')}")
    desc = "\n".join(desc_lines)
    due = _business_days_from_now(2)
    nifty: NiftyClient = request.app.state.nifty
    name_label = onboarding.get('client_name') or onboarding['client_email']
    # Two tasks: Function Spec Review + Functional Design Mockups
    spec_task_id = await _create_nifty_task_safe(
        nifty, db, onboarding_id=onboarding["id"], phase_key="phase2",
        name=f"Function Spec Review — {name_label}",
        description=desc,
        assignees=teams["pm"] or teams["developer"],
        due_date=due,
    )
    mock_task_id = await _create_nifty_task_safe(
        nifty, db, onboarding_id=onboarding["id"], phase_key="phase2",
        name=f"Functional Design Mockups — {name_label}",
        description=f"Mockups based on function references.\n\n{desc}",
        assignees=teams["designer"],
        due_date=due,
    )
    return {"task_ids": [t for t in [spec_task_id, mock_task_id] if t], "due_date": due.isoformat()}


async def _process_phase3(
    db: AsyncIOMotorDatabase,
    request: Request,
    onboarding: Dict[str, Any],
) -> Dict[str, Any]:
    teams = _safe_get_assignees()
    p3 = onboarding.get("phase3", {})
    name_label = onboarding.get('client_name') or onboarding['client_email']
    # 1) Project Kickoff Brief
    desc_lines = [
        "[Project Kickoff Brief]",
        f"Project: {p3.get('project_name', '—')}",
        "",
        f"Company Story:\n{p3.get('company_story', '—')}",
        "",
        f"Goals:\n{p3.get('goals', '—')}",
        "",
        f"Timeline Expectation: {p3.get('timeline_expectation', '—')}",
        f"Budget: {p3.get('budget', '—')}",
    ]
    desc_kickoff = "\n".join(desc_lines)
    due = _business_days_from_now(2)
    nifty: NiftyClient = request.app.state.nifty
    kickoff_id = await _create_nifty_task_safe(
        nifty, db, onboarding_id=onboarding["id"], phase_key="phase3",
        name=f"Project Kickoff Brief — {name_label}",
        description=desc_kickoff, assignees=teams["pm"], due_date=due,
    )
    # 2) Success Metrics Dashboard
    scenarios = p3.get("success_scenarios") or []
    metric_lines = ["[Success Scenarios]"]
    for idx, s in enumerate(scenarios, start=1):
        metric_lines.append(
            f"{idx}. {(s or {}).get('description', '—')}\n   Metric: {(s or {}).get('metric', '—')}"
        )
    metric_id = await _create_nifty_task_safe(
        nifty, db, onboarding_id=onboarding["id"], phase_key="phase3",
        name=f"Success Metrics Dashboard — {name_label}",
        description="\n".join(metric_lines), assignees=teams["pm"], due_date=due,
    )
    # 3) Best-effort Agency Handy project creation (we don't have create-project API fully wired
    # in agencyhandy_client, so just notify admin with the data)
    notif = NotificationItem(
        kind="onboarding",
        title=f"🎯 Kickoff ready: {name_label}",
        body=(
            f"Project: {p3.get('project_name', '—')}\n"
            f"Timeline: {p3.get('timeline_expectation', '—')}\n"
            f"Success scenarios: {len(scenarios)} captured."
        ),
        link="/admin/onboarding",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    return {
        "task_ids": [t for t in [kickoff_id, metric_id] if t],
        "due_date": due.isoformat(),
    }


PHASE_PROCESSORS = {
    1: _process_phase1,
    2: _process_phase2,
    3: _process_phase3,
}


# ============================================================
# Request shapes
# ============================================================
class SaveDraftRequest(BaseModel):
    phase: int = Field(ge=1, le=3)
    payload: Dict[str, Any]


class SubmitPhaseRequest(BaseModel):
    phase: int = Field(ge=1, le=3)
    payload: Dict[str, Any]


class StartOnboardingRequest(BaseModel):
    client_email: EmailStr
    client_name: Optional[str] = ""


# ============================================================
# PUBLIC token-based router (resume by link, no auth)
# ============================================================
onboarding_public_router = APIRouter(prefix="/onboarding", tags=["onboarding-public"])


@onboarding_public_router.get("/by-token/{token}")
async def get_by_token(
    token: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.onboardings.find_one({"resume_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invalid or expired token")
    return doc


@onboarding_public_router.post("/by-token/{token}/save")
async def save_by_token(
    token: str, req: SaveDraftRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.onboardings.find_one({"resume_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invalid token")
    return await _save_phase_draft(db, doc, req.phase, req.payload)


@onboarding_public_router.post("/by-token/{token}/submit")
async def submit_by_token(
    token: str,
    req: SubmitPhaseRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await db.onboardings.find_one({"resume_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invalid token")
    return await _submit_phase(db, request, doc, req.phase, req.payload)


# ============================================================
# Helpers — draft save & phase submit (shared by all routers)
# ============================================================
def _validate_phase_payload(phase: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Validate via pydantic models; return cleaned dict."""
    if phase == 1:
        return OnboardingPhase1(**payload).model_dump()
    if phase == 2:
        return OnboardingPhase2(**payload).model_dump()
    if phase == 3:
        return OnboardingPhase3(**payload).model_dump()
    raise HTTPException(400, "Invalid phase")


async def _save_phase_draft(
    db: AsyncIOMotorDatabase, doc: Dict[str, Any], phase: int, payload: Dict[str, Any]
) -> Dict[str, Any]:
    cleaned = _validate_phase_payload(phase, payload)
    update = {f"phase{phase}": cleaned, "updated_at": _now().isoformat()}
    await db.onboardings.update_one({"id": doc["id"]}, {"$set": prepare_for_mongo(update)})
    fresh = await db.onboardings.find_one({"id": doc["id"]}, {"_id": 0})
    return fresh


async def _submit_phase(
    db: AsyncIOMotorDatabase,
    request: Request,
    doc: Dict[str, Any],
    phase: int,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    cleaned = _validate_phase_payload(phase, payload)
    now_iso = _now().isoformat()
    update = {
        f"phase{phase}": cleaned,
        f"phase{phase}_submitted_at": now_iso,
        "updated_at": now_iso,
    }
    # advance current_phase
    next_phase = min(phase + 1, 3)
    update["current_phase"] = next_phase
    if phase == 3:
        update["completed"] = True
    await db.onboardings.update_one({"id": doc["id"]}, {"$set": prepare_for_mongo(update)})

    fresh = await db.onboardings.find_one({"id": doc["id"]}, {"_id": 0})
    # Process automation (Nifty + AH + notifications)
    processor = PHASE_PROCESSORS.get(phase)
    nifty_task_ids: List[str] = []
    if processor:
        try:
            result = await processor(db, request, fresh) or {}
            # Phase 1 returns task_id (single), Phase 2/3 return task_ids (list)
            if result.get("task_ids"):
                nifty_task_ids = [t for t in result["task_ids"] if t]
            elif result.get("task_id"):
                nifty_task_ids = [result["task_id"]]
        except Exception as exc:
            log.exception("Phase %d processor crashed: %s", phase, exc)
    # Auto-create matching milestones in the client portal (Issue: milestones empty)
    try:
        await _create_phase_milestones(db, fresh, phase, nifty_task_ids)
    except Exception as exc:  # pragma: no cover
        log.warning("Phase %d milestone seed failed: %s", phase, exc)

    # Branded transactional emails — confirm receipt + nudge to next phase
    try:
        import email_service

        emailit = getattr(request.app.state, "emailit", None)
        client_name = fresh.get("client_name") or (fresh["client_email"].split("@")[0])
        await email_service.send_phase_received(
            emailit, to=fresh["client_email"], name=client_name, phase=phase
        )
        if phase == 3:
            await email_service.send_onboarding_complete(
                emailit,
                to=fresh["client_email"],
                name=client_name,
                project_name=(fresh.get("phase3") or {}).get("project_name") or "your project",
            )
    except Exception as exc:  # pragma: no cover
        log.warning("Phase %d confirmation email failed: %s", phase, exc)

    final_doc = await db.onboardings.find_one({"id": doc["id"]}, {"_id": 0})
    return final_doc


async def _create_phase_milestones(
    db: AsyncIOMotorDatabase,
    onboarding: Dict[str, Any],
    phase: int,
    nifty_task_ids: List[str],
) -> None:
    """Create client-portal milestone rows mirroring the Nifty tasks just made.

    Without this, the client portal Milestones view stays empty even though
    Phase 1/2/3 tasks were successfully created in Nifty. We seed one
    milestone per Nifty task so they appear immediately as "in_progress",
    then the existing Nifty webhook/poll updates their status to complete.
    """
    from models import Milestone

    project_name = (onboarding.get("phase3") or {}).get("project_name") or onboarding.get(
        "client_name") or onboarding["client_email"]
    phase_title = {
        1: "Design Language",
        2: "Function Specs & Mockups",
        3: "Kickoff Brief & Success Metrics",
    }.get(phase, f"Phase {phase}")

    if not nifty_task_ids:
        # Even if Nifty failed, create a placeholder milestone so the client portal
        # reflects progress. The admin can re-run automation later to backfill nifty_task_id.
        ms = Milestone(
            client_email=onboarding["client_email"],
            project_name=str(project_name)[:120],
            title=f"[Phase {phase}] — {phase_title}",
            status="in_progress",
            description=f"Onboarding Phase {phase} submitted — team is reviewing.",
        )
        await db.milestones.insert_one(prepare_for_mongo(ms.model_dump()))
        return

    for task_id in nifty_task_ids:
        # Skip if a milestone for this task already exists (idempotent re-runs)
        existing = await db.milestones.find_one({"nifty_task_id": task_id}, {"_id": 0, "id": 1})
        if existing:
            continue
        ms = Milestone(
            client_email=onboarding["client_email"],
            project_name=str(project_name)[:120],
            title=f"[Phase {phase}] — {phase_title}",
            status="in_progress",
            description=f"Onboarding Phase {phase} — work in progress.",
            nifty_task_id=task_id,
        )
        await db.milestones.insert_one(prepare_for_mongo(ms.model_dump()))


# ============================================================
# CLIENT router (auth as a client)
# ============================================================
onboarding_client_router = APIRouter(prefix="/clients/me/onboarding", tags=["onboarding-client"])


@onboarding_client_router.get("")
async def my_onboarding(
    request: Request,
    current=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await _get_or_create_onboarding(
        db,
        client_email=current["email"],
        client_name=current.get("name", ""),
        client_id=current.get("id"),
    )
    # Strip resume_token from the client view (they don't need it; admin manages it)
    safe = {k: v for k, v in doc.items() if k != "resume_token"}
    return safe


@onboarding_client_router.post("/save")
async def client_save_draft(
    req: SaveDraftRequest,
    current=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await _get_or_create_onboarding(
        db, client_email=current["email"], client_name=current.get("name", "")
    )
    return await _save_phase_draft(db, doc, req.phase, req.payload)


@onboarding_client_router.post("/submit")
async def client_submit_phase(
    req: SubmitPhaseRequest,
    request: Request,
    current=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await _get_or_create_onboarding(
        db, client_email=current["email"], client_name=current.get("name", "")
    )
    return await _submit_phase(db, request, doc, req.phase, req.payload)


# ============================================================
# ADMIN router (founder auth)
# ============================================================
onboarding_admin_router = APIRouter(
    prefix="/admin/onboarding",
    tags=["onboarding-admin"],
    dependencies=[Depends(get_current_user)],
)


@onboarding_admin_router.get("")
async def admin_list(db: AsyncIOMotorDatabase = Depends(get_db)) -> List[Dict[str, Any]]:
    docs = await db.onboardings.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@onboarding_admin_router.post("/start")
async def admin_start(
    req: StartOnboardingRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await _get_or_create_onboarding(
        db,
        client_email=req.client_email,
        client_name=req.client_name or req.client_email.split("@")[0],
    )
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    return {
        "onboarding": doc,
        "resume_url": f"{base}/portal/onboarding?token={doc['resume_token']}",
    }


@onboarding_admin_router.post("/{ob_id}/regenerate-link")
async def admin_regenerate_link(
    ob_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    new_token = secrets.token_urlsafe(32)
    res = await db.onboardings.update_one(
        {"id": ob_id},
        {"$set": {"resume_token": new_token, "updated_at": _now().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    return {"resume_token": new_token, "resume_url": f"{base}/portal/onboarding?token={new_token}"}


@onboarding_admin_router.delete("/{ob_id}")
async def admin_delete(
    ob_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.onboardings.delete_one({"id": ob_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@onboarding_admin_router.post("/{ob_id}/replay/{phase}")
async def admin_replay_phase(
    ob_id: str,
    phase: int,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Re-run the automation for a phase (useful when Nifty was down and tasks failed)."""
    if phase not in (1, 2, 3):
        raise HTTPException(400, "Invalid phase")
    doc = await db.onboardings.find_one({"id": ob_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    processor = PHASE_PROCESSORS[phase]
    result = await processor(db, request, doc)
    return {"ok": True, "phase": phase, "result": result}



@onboarding_admin_router.get("/health")
async def admin_onboarding_health(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Returns a fast snapshot the admin UI can render at the top:
    Nifty connection status + count of onboardings with failed automation.

    Powers the "Nifty isn't connected — phase tasks aren't syncing" banner.
    """
    nifty: NiftyClient = request.app.state.nifty
    try:
        connected = await nifty.is_connected()
    except Exception:
        connected = False
    failed_count = await db.onboardings.count_documents(
        {"nifty_errors.0": {"$exists": True}}
    )
    # How many of those errors were specifically caused by missing connection?
    pipeline = [
        {"$match": {"nifty_errors.0": {"$exists": True}}},
        {"$project": {"_id": 0, "id": 1, "nifty_errors": 1}},
    ]
    affected_obs: List[Dict[str, Any]] = []
    async for doc in db.onboardings.aggregate(pipeline):
        for err in doc.get("nifty_errors") or []:
            err_lower = (err.get("error") or "").lower()
            if (
                "nifty not connected" in err_lower
                or "isn't connected" in err_lower
                or "open /admin/integrations" in err_lower
            ):
                affected_obs.append({"id": doc["id"], "phase": err.get("phase")})
                break
    return {
        "nifty_connected": connected,
        "onboardings_with_errors": failed_count,
        "blocked_by_disconnect": affected_obs,
    }


@onboarding_admin_router.post("/replay-failed")
async def admin_replay_failed_tasks(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Replay every phase that previously failed because Nifty was disconnected.

    Idempotent — uses the same processors as a fresh submission. Clears
    `nifty_errors` per phase as it goes so the badges disappear once the
    backfill succeeds. Returns a per-onboarding result map.
    """
    nifty: NiftyClient = request.app.state.nifty
    if not await nifty.is_connected():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Nifty still isn't connected. Connect it in /admin/integrations first, then retry.",
        )
    results: List[Dict[str, Any]] = []
    async for doc in db.onboardings.find(
        {"nifty_errors.0": {"$exists": True}}, {"_id": 0}
    ):
        phases_to_replay: List[int] = []
        for err in doc.get("nifty_errors") or []:
            phase = err.get("phase")
            if isinstance(phase, str) and phase.startswith("phase"):
                try:
                    n = int(phase.replace("phase", ""))
                    if n in (1, 2, 3) and n not in phases_to_replay:
                        phases_to_replay.append(n)
                except ValueError:
                    continue
        if not phases_to_replay:
            continue
        ob_result: Dict[str, Any] = {"id": doc["id"], "client_email": doc.get("client_email"), "phases": {}}
        for phase in phases_to_replay:
            try:
                # Reset the errors for this phase so failures don't double-up
                await db.onboardings.update_one(
                    {"id": doc["id"]},
                    {"$pull": {"nifty_errors": {"phase": f"phase{phase}"}}},
                )
                fresh_doc = await db.onboardings.find_one({"id": doc["id"]}, {"_id": 0})
                res = await PHASE_PROCESSORS[phase](db, request, fresh_doc) or {}
                ob_result["phases"][phase] = {
                    "ok": True,
                    "task_id": res.get("task_id"),
                    "task_ids": res.get("task_ids"),
                }
            except Exception as exc:
                log.exception("Replay failed for %s phase %s: %s", doc["id"], phase, exc)
                ob_result["phases"][phase] = {"ok": False, "error": str(exc)}
        results.append(ob_result)
    return {"ok": True, "replayed_count": len(results), "results": results}
