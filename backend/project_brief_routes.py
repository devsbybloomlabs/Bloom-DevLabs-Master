"""Phase D part 2 — AI Project Brief flow.

Workflow:
  1. Client submits Phase 1 / 2 / 3 of onboarding (existing flow).
  2. Admin opens `/admin/onboarding`, sees the submitter, clicks "AI Brief".
  3. We surface their answers + auto-generate 3 ready-to-paste AI prompts
     (Design Language, Function Language, Company Background).
     • Admin runs each prompt in Claude (externally OR via the future
       "Auto-fill via Claude" button in a later iteration).
  4. Admin pastes Claude's summary back per phase → saves brief.
  5. Admin clicks "Send for approval" → client gets a branded email with
     a deep link to the Project Brief tab in their portal.
  6. Client opens the tab, reviews 3 summaries, clicks Approve.
  7. Brief flips to `approved` with a stamped date. The portal's Project
     Brief tab disappears; the brief becomes accessible inside the Orders
     tab accordion until a new project request kicks off.

Data shape (`project_briefs` collection):
  {
    id: uuid,
    company_id: uuid|None,
    client_email: str,
    project_name: str,
    onboarding_id: uuid|None,                  # source onboarding
    phase_summaries: {
       phase1: {summary: str, updated_at: iso},
       phase2: {summary: str, updated_at: iso},
       phase3: {summary: str, updated_at: iso},
    },
    status: "draft" | "sent_for_approval" | "approved" | "archived",
    sent_for_approval_at: iso|None,
    approved_at: iso|None,
    approved_by_email: str|None,
    created_at, updated_at: iso,
  }
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from activity_log import log_activity
from auth import get_current_user
from db_utils import prepare_for_mongo

log = logging.getLogger("project_brief")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =========================================================================
# AI prompt generators — these are the user-specified templates.
# Each pulls the client's actual answers from the onboarding doc.
# =========================================================================
def _safe(s: Any, fallback: str = "—") -> str:
    if s is None or (isinstance(s, str) and not s.strip()):
        return fallback
    return str(s).strip()


def generate_design_prompt(phase1: Dict[str, Any]) -> str:
    """Phase 1 → Design Language prompt."""
    links = phase1.get("design_links") or []
    if not links:
        link_block = "(The client didn't share any design references.)"
    else:
        parts = []
        for idx, link in enumerate(links, 1):
            url = _safe((link or {}).get("url"))
            why = _safe((link or {}).get("why"))
            parts.append(f"  [Design Link {idx}]: {url}\n  [Reason for Link {idx}]: {why}")
        link_block = "\n".join(parts)
    color = _safe(phase1.get("color_preferences"))
    mood = _safe(phase1.get("mood_keywords"))
    return (
        "You are Bloom Labs' senior strategist preparing a Design Language "
        "Summary for a client to approve. The client would like to create a "
        "web system/app that looks and feels like the references below.\n\n"
        f"{link_block}\n\n"
        f"  [Color preferences]: {color}\n"
        f"  [Mood keywords]: {mood}\n\n"
        "Task: Compile everything above into a clear, summarized Design "
        "Language brief that the client can read and approve. Address it "
        "to the client in second person, use short paragraphs, and end "
        "with a 'What this means for your build' bullet list (3–5 items) "
        "summarizing the visual direction we'll take. Keep the entire "
        "summary under 350 words."
    )


def generate_function_prompt(phase2: Dict[str, Any]) -> str:
    """Phase 2 → Function Language prompt."""
    links = phase2.get("function_links") or []
    if not links:
        link_block = "(The client didn't share any feature references.)"
    else:
        parts = []
        for idx, link in enumerate(links, 1):
            url = _safe((link or {}).get("url"))
            why = _safe((link or {}).get("why"))
            parts.append(
                f"  [Feature Link {idx}]: {url}\n  [Reason for Link {idx}]: {why}"
            )
        link_block = "\n".join(parts)
    extras = _safe(phase2.get("additional_specs"))
    return (
        "You are Bloom Labs' senior strategist preparing a Function Summary "
        "for a client to approve. The client is trying to create a web "
        "system/app that functions the same way as the references below, "
        "and these are the specific functions they like about each.\n\n"
        f"{link_block}\n\n"
        f"  [Additional requirements / open questions]: {extras}\n\n"
        "Task: Compile everything above into a summarized Function "
        "Language brief that the client can read and approve. Use second "
        "person, plain-English bullet points grouped by capability (e.g. "
        "'Authentication', 'Search', 'Notifications'). End with a 'Build "
        "scope confirmation' section that surfaces any ambiguities for "
        "the client to clarify. Keep it under 400 words."
    )


def generate_company_prompt(phase3: Dict[str, Any]) -> str:
    """Phase 3 → Company Background + Goals prompt."""
    name = _safe(phase3.get("project_name"))
    story = _safe(phase3.get("company_story"))
    goals = _safe(phase3.get("goals"))
    timeline = _safe(phase3.get("timeline_expectation"))
    budget = _safe(phase3.get("budget"))
    scenarios = phase3.get("success_scenarios") or []
    if not scenarios:
        scen_block = "(No specific success scenarios were captured.)"
    else:
        parts = []
        for idx, s in enumerate(scenarios, 1):
            desc = _safe((s or {}).get("description"))
            metric = _safe((s or {}).get("metric"))
            parts.append(f"  [Scenario {idx}]: {desc}\n  [Metric {idx}]: {metric}")
        scen_block = "\n".join(parts)
    return (
        "You are Bloom Labs' senior strategist preparing a Project "
        "Brief for a client to approve. Below is the client's company, "
        "its background, goals, and things they would like their system "
        "or app to have.\n\n"
        f"  [Project name]: {name}\n"
        f"  [Company story / context]: {story}\n"
        f"  [Goals]: {goals}\n"
        f"  [Timeline expectation]: {timeline}\n"
        f"  [Budget]: {budget}\n\n"
        f"  [Success scenarios]\n{scen_block}\n\n"
        "Task: Compile this into a single detailed Project Brief that the "
        "client can read and approve. Use second person. Open with a 1-2 "
        "sentence elevator description of what we're building together. "
        "Then sections: 'Why we're building this', 'What success looks "
        "like' (turn the scenarios into measurable bullet points), and "
        "'How we'll deliver' (a high-level phased plan that respects the "
        "timeline & budget). Keep under 500 words. End with: "
        "'Ready to approve? Once you sign off, we kick off Design.'"
    )


def build_prompts_from_onboarding(onboarding: Dict[str, Any]) -> Dict[str, str]:
    return {
        "design": generate_design_prompt(onboarding.get("phase1") or {}),
        "function": generate_function_prompt(onboarding.get("phase2") or {}),
        "company": generate_company_prompt(onboarding.get("phase3") or {}),
    }


# =========================================================================
# Auto-seed milestones on brief approval
# =========================================================================
# Default 5-phase build plan. Each phase becomes a Milestone the client sees
# inside the animated Project Timeline.  Phase 1 (Discovery) is marked
# `in_progress` on approval so the client gets the "we already started" moment.
DEFAULT_MILESTONE_PLAN: List[Dict[str, Any]] = [
    {
        "title": "Discovery & Brief Sign-off",
        "description": "Brief approved. Team is reviewing scope, success metrics, and timeline.",
        "status": "in_progress",
        "offset_days": 3,
    },
    {
        "title": "Design Language",
        "description": "Style tile, color system, typography, hero concepts.",
        "status": "pending",
        "offset_days": 10,
    },
    {
        "title": "Build — Core flows",
        "description": "Frontend + backend for the highest-leverage user journeys.",
        "status": "pending",
        "offset_days": 28,
    },
    {
        "title": "QA & Polish",
        "description": "Cross-browser, mobile, accessibility, copy pass, edge cases.",
        "status": "pending",
        "offset_days": 38,
    },
    {
        "title": "Launch",
        "description": "DNS, monitoring, analytics, hand-off, founder walkthrough.",
        "status": "pending",
        "offset_days": 45,
        "is_final_deliverable": True,
        "notify_client_on_complete": True,
    },
]


async def _seed_milestones_from_brief(
    db: AsyncIOMotorDatabase, brief: Dict[str, Any]
) -> int:
    """Insert default milestones tied to the client's project on approval.

    Idempotent — skips creation when this client already has milestones for
    this exact project_name. Returns the number of milestones inserted.
    """
    client_email = brief.get("client_email")
    project_name = (brief.get("project_name") or "Project").strip()
    if not client_email:
        return 0
    existing = await db.milestones.count_documents(
        {"client_email": client_email.lower(), "project_name": project_name}
    )
    if existing > 0:
        return 0  # Already seeded — leave whatever's there alone.

    now = datetime.now(timezone.utc)
    docs: List[Dict[str, Any]] = []
    for plan in DEFAULT_MILESTONE_PLAN:
        due = now + timedelta(days=int(plan.get("offset_days") or 7))
        docs.append(
            {
                "id": str(uuid.uuid4()),
                "client_email": client_email.lower(),
                "project_name": project_name,
                "title": plan["title"],
                "status": plan.get("status", "pending"),
                "description": plan.get("description", ""),
                "is_final_deliverable": bool(plan.get("is_final_deliverable", False)),
                "notify_client_on_complete": bool(
                    plan.get("notify_client_on_complete", False)
                ),
                "nifty_task_id": None,
                "due_date": due.isoformat(),
                "completion_date": None,
                "blocked_reason": None,
                "blocked_eta": None,
                "notes": [],
                "last_updated": now.isoformat(),
                "created_at": now.isoformat(),
                "seeded_from_brief": brief.get("id"),
            }
        )
    if docs:
        await db.milestones.insert_many(docs)
    return len(docs)


# =========================================================================
# Pydantic models
# =========================================================================
class BriefCreateRequest(BaseModel):
    client_email: str
    project_name: Optional[str] = None
    onboarding_id: Optional[str] = None


class PhaseUpdateRequest(BaseModel):
    summary: str = Field(..., min_length=10, max_length=10000)


class SendForApprovalRequest(BaseModel):
    include_phase: Optional[List[str]] = None  # default: all 3
    note_to_client: Optional[str] = None


# =========================================================================
# Admin router
# =========================================================================
brief_admin_router = APIRouter(
    prefix="/admin/briefs",
    tags=["briefs-admin"],
    dependencies=[Depends(get_current_user)],
)


@brief_admin_router.get("/prompts/{onboarding_id}")
async def get_ai_prompts(
    onboarding_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Generate the 3 ready-to-paste AI prompts for an onboarding."""
    onboarding = await db.onboardings.find_one({"id": onboarding_id}, {"_id": 0})
    if not onboarding:
        raise HTTPException(404, "Onboarding not found")
    return {
        "onboarding_id": onboarding_id,
        "client_email": onboarding.get("client_email"),
        "client_name": onboarding.get("client_name"),
        "phases_submitted": {
            "phase1": bool(onboarding.get("phase1_submitted_at")),
            "phase2": bool(onboarding.get("phase2_submitted_at")),
            "phase3": bool(onboarding.get("phase3_submitted_at")),
        },
        "prompts": build_prompts_from_onboarding(onboarding),
        "answers": {
            "phase1": onboarding.get("phase1"),
            "phase2": onboarding.get("phase2"),
            "phase3": onboarding.get("phase3"),
        },
    }


@brief_admin_router.get("")
async def list_briefs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client_email: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    filt: Dict[str, Any] = {}
    if client_email:
        filt["client_email"] = client_email.lower().strip()
    if status:
        filt["status"] = status
    docs = await db.project_briefs.find(filt, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@brief_admin_router.get("/{brief_id}")
async def get_brief(
    brief_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Brief not found")
    return doc


@brief_admin_router.post("")
async def create_brief(
    req: BriefCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Create an empty brief tied to a client (optionally an onboarding)."""
    email = req.client_email.lower().strip()
    # Resolve company_id if we can
    company = await db.companies.find_one({"primary_email": email}, {"_id": 0, "id": 1})
    onboarding = None
    if req.onboarding_id:
        onboarding = await db.onboardings.find_one({"id": req.onboarding_id}, {"_id": 0})
    project_name = req.project_name or (
        (onboarding or {}).get("phase3", {}).get("project_name")
        or f"{email.split('@')[0]}'s project"
    )
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": (company or {}).get("id"),
        "client_email": email,
        "project_name": project_name,
        "onboarding_id": req.onboarding_id,
        "phase_summaries": {
            "phase1": {"summary": None, "updated_at": None},
            "phase2": {"summary": None, "updated_at": None},
            "phase3": {"summary": None, "updated_at": None},
        },
        "status": "draft",
        "sent_for_approval_at": None,
        "approved_at": None,
        "approved_by_email": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.project_briefs.insert_one(prepare_for_mongo(doc))
    if doc["company_id"]:
        await log_activity(
            db,
            company_id=doc["company_id"],
            type="brief.created",
            title=f"Project brief drafted — {project_name}",
            meta={"brief_id": doc["id"]},
        )
    return doc


@brief_admin_router.patch("/{brief_id}/phase/{phase_key}")
async def update_phase_summary(
    brief_id: str,
    phase_key: str,
    req: PhaseUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if phase_key not in ("phase1", "phase2", "phase3"):
        raise HTTPException(400, "phase_key must be phase1, phase2, or phase3")
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    if brief.get("status") == "approved":
        raise HTTPException(409, "Approved briefs are read-only. Create a new revision.")
    now = _now_iso()
    await db.project_briefs.update_one(
        {"id": brief_id},
        {
            "$set": {
                f"phase_summaries.{phase_key}.summary": req.summary.strip(),
                f"phase_summaries.{phase_key}.updated_at": now,
                "updated_at": now,
            }
        },
    )
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


@brief_admin_router.post("/{brief_id}/send-for-approval")
async def send_brief_for_approval(
    brief_id: str,
    req: SendForApprovalRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    # Validate at least one phase has a summary
    summaries = brief.get("phase_summaries") or {}
    has_content = any(
        (summaries.get(k) or {}).get("summary") for k in ("phase1", "phase2", "phase3")
    )
    if not has_content:
        raise HTTPException(
            400,
            "Brief has no phase summaries yet. Fill at least one before sending.",
        )
    now = _now_iso()
    await db.project_briefs.update_one(
        {"id": brief_id},
        {
            "$set": {
                "status": "sent_for_approval",
                "sent_for_approval_at": now,
                "updated_at": now,
            }
        },
    )
    # Send branded email
    try:
        import email_service

        emailit = request.app.state.emailit
        base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
        portal_url = f"{base}/portal?tab=brief"
        await email_service.send_brief_for_approval(
            emailit,
            to=brief["client_email"],
            name=brief["client_email"].split("@")[0],
            project_name=brief["project_name"],
            portal_url=portal_url,
            note=req.note_to_client,
        )
    except Exception as exc:  # pragma: no cover
        log.warning("Brief approval email failed: %s", exc)
    if brief.get("company_id"):
        await log_activity(
            db,
            company_id=brief["company_id"],
            type="brief.sent",
            title=f"Project brief sent for approval — {brief['project_name']}",
            meta={"brief_id": brief_id},
        )
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


@brief_admin_router.delete("/{brief_id}")
async def archive_brief(
    brief_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    res = await db.project_briefs.update_one(
        {"id": brief_id},
        {"$set": {"status": "archived", "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


# =========================================================================
# Client portal router
# =========================================================================
brief_client_router = APIRouter(
    prefix="/clients/me/briefs",
    tags=["briefs-client"],
)


def _client_dep():
    from client_routes import get_current_client
    return get_current_client


@brief_client_router.get("/pending")
async def get_pending_brief(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Optional[Dict[str, Any]]:
    """Returns the one brief awaiting this client's approval, or null."""
    doc = await db.project_briefs.find_one(
        {
            "client_email": client["email"],
            "status": "sent_for_approval",
        },
        {"_id": 0},
        sort=[("sent_for_approval_at", -1)],
    )
    return doc


@brief_client_router.get("/approved")
async def list_approved_briefs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> List[Dict[str, Any]]:
    """Approved briefs the client has signed off on — shown inside Orders accordion."""
    docs = await db.project_briefs.find(
        {"client_email": client["email"], "status": "approved"},
        {"_id": 0},
    ).sort("approved_at", -1).to_list(20)
    return docs


@brief_client_router.post("/{brief_id}/approve")
async def approve_brief(
    brief_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Dict[str, Any]:
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    if brief["client_email"] != client["email"]:
        raise HTTPException(403, "This brief is not yours to approve.")
    if brief.get("status") == "approved":
        return brief  # idempotent
    if brief.get("status") != "sent_for_approval":
        raise HTTPException(409, "Brief isn't ready for approval yet.")
    now = _now_iso()
    await db.project_briefs.update_one(
        {"id": brief_id},
        {
            "$set": {
                "status": "approved",
                "approved_at": now,
                "approved_by_email": client["email"],
                "updated_at": now,
            }
        },
    )
    # ----- Auto-seed initial milestones from the approved brief -----
    # Tiny "wow we already started" moment for the client.
    seeded = await _seed_milestones_from_brief(db, brief)
    if brief.get("company_id"):
        await log_activity(
            db,
            company_id=brief["company_id"],
            type="brief.approved",
            title=f"Brief APPROVED by client — {brief['project_name']}",
            actor=f"client:{client['email']}",
            meta={"brief_id": brief_id, "approved_at": now, "milestones_seeded": seeded},
        )
    # Notify founder via email + Slack
    try:
        import email_service

        emailit = request.app.state.emailit
        await email_service.send_brief_approved_to_founder(
            emailit,
            to=os.environ.get("FOUNDER_EMAIL", "founder@thesalvador.group"),
            project_name=brief["project_name"],
            client_email=client["email"],
            approved_at=now,
        )
    except Exception as exc:  # pragma: no cover
        log.warning("Brief-approved email failed: %s", exc)
    try:
        import slack_notifier

        await slack_notifier.post_message(
            db,
            text=(
                f"✅ *Brief approved* by *{client['email']}*\n"
                f"Project: {brief['project_name']}\n"
                f"Kick off Design when ready."
            ),
        )
    except Exception:  # pragma: no cover
        pass
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


__all__ = [
    "brief_admin_router",
    "brief_client_router",
    "generate_design_prompt",
    "generate_function_prompt",
    "generate_company_prompt",
    "build_prompts_from_onboarding",
]
