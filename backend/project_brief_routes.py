"""Phase D part 3 — Per-phase AI Project Brief flow with revision history.

Workflow evolution (replaces the old "approve whole brief at once" pattern):
  1. Admin creates a brief and fills each phase's Claude summary via the
     WYSIWYG editor. Each save creates a `revisions[]` entry on that phase
     (transparency).
  2. Admin clicks "Send Phase X for review". The phase flips to
     `sent_for_review`; client gets a per-phase email with the rendered
     summary + admin's optional note + Review button.
  3. Client opens the Brief tab and sees a progress bar (Phase 1 ✅ ·
     Phase 2 🔄 · Phase 3 ⏳). For each phase awaiting review they can:
        • Leave a comment → phase flips to `in_revision`, admin rolls a new
          summary, re-sends.
        • OR tick the legal checkbox and Approve Phase X → phase flips to
          `approved`, the matching milestone auto-completes.
  4. The final "Approve Project Brief" CTA is disabled until ALL 3 phases
     are individually approved; a confirmation dialog warns about additional
     scope incurring fees.
  5. On full approval:
        • The five standard milestones seed (Discovery / Design / Build /
          QA / Launch).
        • A Project Mode workspace auto-seeds with AI-generated
          Emergent-ready dev tasks (Claude turns phase summaries into
          actionable prompts).
        • A PDF snapshot is rendered and dropped into the client's
          Project Files (category=brief).
        • Founder Slack + email digest fires.

Per-phase status state machine:
   draft → sent_for_review → in_revision → sent_for_review → approved
                                ^
                          (client comment loop)

Data shape per phase (phase_summaries.phaseN):
  {
    summary: str|None,                # WYSIWYG HTML
    status: "draft"|"sent_for_review"|"in_revision"|"approved",
    sent_at: iso|None,
    approved_at: iso|None,
    latest_comment: str|None,         # last client comment, if any
    admin_reply_note: str|None,       # admin's chip-note on a re-roll
    revisions: [
        {
            summary: str,
            comment: str|None,        # the client comment that triggered this revision
            admin_reply_note: str|None,
            created_at: iso,
            created_by: str,          # admin email or "client:{email}"
        },
        ...
    ],
    updated_at: iso,
  }
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import bleach
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from activity_log import log_activity
from auth import get_current_user
from db_utils import prepare_for_mongo

log = logging.getLogger("project_brief")

PHASE_KEYS = ("phase1", "phase2", "phase3")
PHASE_TITLES = {
    "phase1": "Design Language",
    "phase2": "Functionality",
    "phase3": "Company Background",
}
PHASE_STATUSES = ("draft", "sent_for_review", "in_revision", "approved")
BRIEF_STATUSES = ("draft", "in_review", "approved", "archived")

# WYSIWYG-safe allow-list — TipTap output is constrained but we sanitise on
# every write to defend against admin XSS slip-ups.
ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u", "s", "code", "pre",
    "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "hr",
]
ALLOWED_ATTRS = {"a": ["href", "title", "target", "rel"]}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _sanitize_html(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    return bleach.clean(s, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True).strip() or None


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =========================================================================
# Prompt generators (unchanged — kept inline for backward compat)
# =========================================================================
def _onb_phase(onboarding: Dict[str, Any], key: str) -> Dict[str, Any]:
    return (onboarding or {}).get(key) or {}


def generate_design_prompt(phase1: Dict[str, Any]) -> str:
    if not phase1:
        return (
            "You are an experienced creative director. The client didn't share any "
            "design references yet, so write a generic but high-craft Design Language "
            "summary for a B2B SaaS site: clean, confident typography, a calm cool-blue "
            "primary, restrained motion, accessibility-first."
        )
    refs = phase1.get("design_links") or []
    ref_block = "\n".join(
        f"- {r.get('url')}: {r.get('why', '(no reason given)')}" for r in refs
    ) or "(no references shared)"
    return (
        "You are an experienced creative director writing the **Design Language** "
        "summary for a client. Read their answers below and produce a 4-6 paragraph "
        "summary that translates their preferences into a concrete plan: color, type, "
        "iconography, motion, layout density, and tone. Be specific. End with a one-line "
        "confidence statement.\n\n"
        f"Design references:\n{ref_block}\n\n"
        f"Color preferences: {phase1.get('color_preferences') or '(unspecified)'}\n"
        f"Mood keywords: {phase1.get('mood_keywords') or '(unspecified)'}\n\n"
        "Output ONLY the summary (no preamble)."
    )


def generate_function_prompt(phase2: Dict[str, Any]) -> str:
    if not phase2:
        return (
            "You are a senior product engineer. The client didn't share any feature "
            "references yet, so write a generic 'Functionality' summary placeholder "
            "asking the team to clarify scope on the discovery call."
        )
    refs = phase2.get("function_links") or []
    ref_block = "\n".join(
        f"- {r.get('url')}: {r.get('why', '(no reason given)')}" for r in refs
    ) or "(no references shared)"
    return (
        "You are a senior product engineer writing the **Functionality** summary "
        "for a client. Translate their feature references into a concrete shipping list "
        "with rough scope notes. 4-6 paragraphs. End with a one-line confidence statement.\n\n"
        f"Feature references:\n{ref_block}\n\n"
        f"Additional specs: {phase2.get('additional_specs') or '(none)'}\n\n"
        "Output ONLY the summary (no preamble)."
    )


def generate_company_prompt(phase3: Dict[str, Any]) -> str:
    if not phase3:
        return (
            "You are a brand strategist. The client didn't fully finish their business "
            "phase yet — write a placeholder Company Background summary noting the "
            "team will refine this on the kickoff call."
        )
    scenarios = phase3.get("success_scenarios") or []
    scen_block = "\n".join(
        f"- {s.get('description', '')} (metric: {s.get('metric', '?')})" for s in scenarios
    ) or "(no success scenarios shared)"
    return (
        "You are a brand strategist writing the **Company Background** summary for a "
        "client. Read their answers below and produce a 4-6 paragraph summary that pulls "
        "out: who they're for, their wedge, their 12-month bet, and how we'll measure "
        "the win. Be specific. End with a one-line confidence statement.\n\n"
        f"Project name: {phase3.get('project_name') or '(unspecified)'}\n"
        f"Company story: {phase3.get('company_story') or '(unspecified)'}\n"
        f"Goals: {phase3.get('goals') or '(unspecified)'}\n"
        f"Timeline: {phase3.get('timeline_expectation') or '(unspecified)'}\n"
        f"Success scenarios:\n{scen_block}\n\n"
        "Output ONLY the summary (no preamble)."
    )


def build_prompts_from_onboarding(onboarding: Dict[str, Any]) -> Dict[str, str]:
    return {
        "design": generate_design_prompt(_onb_phase(onboarding, "phase1")),
        "function": generate_function_prompt(_onb_phase(onboarding, "phase2")),
        "company": generate_company_prompt(_onb_phase(onboarding, "phase3")),
    }


# =========================================================================
# Per-phase helpers
# =========================================================================
def _default_phase() -> Dict[str, Any]:
    return {
        "summary": None,
        "status": "draft",
        "sent_at": None,
        "approved_at": None,
        "latest_comment": None,
        "admin_reply_note": None,
        "revisions": [],
        "updated_at": None,
    }


def _migrate_phase_shape(phase: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Upgrade old-shape phase docs (just summary/updated_at) to the new shape."""
    p = phase or {}
    defaults = _default_phase()
    for k, v in defaults.items():
        p.setdefault(k, v)
    return p


def _derive_brief_status(phase_summaries: Dict[str, Any]) -> str:
    """Roll up phase statuses into a brief-level status."""
    statuses = [
        (phase_summaries.get(k) or {}).get("status", "draft") for k in PHASE_KEYS
    ]
    if all(s == "approved" for s in statuses):
        return "approved"
    if any(s in ("sent_for_review", "in_revision", "approved") for s in statuses):
        return "in_review"
    return "draft"


def _all_phases_approved(brief: Dict[str, Any]) -> bool:
    summaries = brief.get("phase_summaries") or {}
    return all((summaries.get(k) or {}).get("status") == "approved" for k in PHASE_KEYS)


async def _publish_brief_status(
    db: AsyncIOMotorDatabase, brief_id: str, phase_summaries: Dict[str, Any]
) -> str:
    new_status = _derive_brief_status(phase_summaries)
    await db.project_briefs.update_one(
        {"id": brief_id},
        {"$set": {"status": new_status, "updated_at": _now_iso()}},
    )
    return new_status


# =========================================================================
# Brief Review milestone — single consolidated card (Feb 2026 rewrite)
# =========================================================================
# Originally each phase had its own "Brief Review: X" milestone. That cluttered
# the client portal timeline (3 review cards + 5 build cards = 8 cards) and
# created visual duplication after approval. New design: ONE milestone titled
# exactly "Discovery & Brief Sign-off" (matches the standard build plan) whose
# description carries per-phase progress chips. It flips to `complete` when
# all 3 phases approve, then the rest of the build plan seeds.
REVIEW_MILESTONE_PREFIX = "Brief Review:"   # kept for legacy archive matching
DISCOVERY_MILESTONE_TITLE = "Discovery & Brief Sign-off"

# Legacy per-phase mapping retained for migration (archive old rows on next sync).
PHASE_TO_REVIEW_TITLE = {
    "phase1": f"{REVIEW_MILESTONE_PREFIX} Design Language",
    "phase2": f"{REVIEW_MILESTONE_PREFIX} Functionality",
    "phase3": f"{REVIEW_MILESTONE_PREFIX} Company Background",
}

PHASE_SHORT_LABEL = {
    "phase1": "Design Language",
    "phase2": "Functionality",
    "phase3": "Company Background",
}


def _build_discovery_description(phase_summaries: Dict[str, Any]) -> str:
    """Render a human-readable progress string from the 3 phase statuses."""
    icons = {
        "draft": "⏳",
        "sent_for_review": "👀",
        "in_revision": "💬",
        "approved": "✅",
    }
    parts = []
    for k in PHASE_KEYS:
        s = (phase_summaries.get(k) or {}).get("status", "draft")
        icon = icons.get(s, "⏳")
        parts.append(f"{icon} {PHASE_SHORT_LABEL[k]}")
    return " · ".join(parts)


async def _archive_legacy_review_milestones(
    db: AsyncIOMotorDatabase, brief: Dict[str, Any]
) -> None:
    """Hard-delete the old per-phase 'Brief Review: X' milestones from the DB.

    Idempotent — safe to call on every brief access. Keeps the timeline clean
    so existing clients automatically get the consolidated single-card view."""
    client_email = (brief.get("client_email") or "").lower()
    if not client_email:
        return
    project_name = (brief.get("project_name") or "").strip()
    q = {
        "client_email": client_email,
        "title": {"$regex": f"^{REVIEW_MILESTONE_PREFIX}"},
    }
    if project_name:
        q["project_name"] = project_name
    await db.milestones.delete_many(q)


async def _ensure_review_milestone(
    db: AsyncIOMotorDatabase, brief: Dict[str, Any], phase_key: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Create the SINGLE Discovery & Brief Sign-off milestone if it doesn't
    exist yet. Returns the milestone doc (already in DB).

    `phase_key` is accepted for API compat with the legacy per-phase signature
    but is no longer used to vary the title."""
    client_email = (brief.get("client_email") or "").lower()
    if not client_email:
        return None
    project_name = (brief.get("project_name") or "Project").strip()
    existing = await db.milestones.find_one(
        {
            "client_email": client_email,
            "project_name": project_name,
            "title": DISCOVERY_MILESTONE_TITLE,
        },
        {"_id": 0},
    )
    if existing:
        return existing
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "client_email": client_email,
        "project_name": project_name,
        "title": DISCOVERY_MILESTONE_TITLE,
        "status": "in_progress",
        "description": _build_discovery_description(brief.get("phase_summaries") or {}),
        "is_final_deliverable": False,
        "notify_client_on_complete": False,
        "nifty_task_id": None,
        "due_date": (now + timedelta(days=3)).isoformat(),
        "completion_date": None,
        "blocked_reason": None,
        "blocked_eta": None,
        "notes": [],
        "last_updated": now.isoformat(),
        "created_at": now.isoformat(),
        "linked_brief_id": brief["id"],
        "linked_brief_phase": None,
    }
    await db.milestones.insert_one(doc)
    return doc


async def _sync_review_milestone(
    db: AsyncIOMotorDatabase,
    brief: Dict[str, Any],
    phase_key: Optional[str] = None,
    phase: Optional[Dict[str, Any]] = None,
) -> None:
    """Reflect the rolled-up phase statuses onto the single Discovery card."""
    # First archive any legacy per-phase rows so they disappear from the client
    # timeline on the next render.
    await _archive_legacy_review_milestones(db, brief)
    await _ensure_review_milestone(db, brief)

    # Re-read the brief so the phase summary we're updating from is fresh.
    fresh = await db.project_briefs.find_one({"id": brief["id"]}, {"_id": 0}) or brief
    summaries = fresh.get("phase_summaries") or {}

    all_approved = all(
        (summaries.get(k) or {}).get("status") == "approved" for k in PHASE_KEYS
    )
    new_status = "complete" if all_approved else "in_progress"
    update = {
        "status": new_status,
        "description": _build_discovery_description(summaries),
        "last_updated": _now_iso(),
    }
    if all_approved:
        update["completion_date"] = _now_iso()
    await db.milestones.update_one(
        {
            "title": DISCOVERY_MILESTONE_TITLE,
            "client_email": (brief.get("client_email") or "").lower(),
            "project_name": (brief.get("project_name") or "").strip(),
        },
        {"$set": update},
    )


# =========================================================================
# Final-approval seed: 5 standard build milestones + auto Project Mode
# =========================================================================
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
        "status": "in_progress",
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


async def _seed_build_milestones(
    db: AsyncIOMotorDatabase, brief: Dict[str, Any]
) -> int:
    client_email = (brief.get("client_email") or "").lower()
    project_name = (brief.get("project_name") or "Project").strip()
    if not client_email:
        return 0
    # Per-title idempotency: skip any milestone titles that already exist for
    # this client/project. The Discovery & Brief Sign-off milestone is now
    # pre-created during the per-phase review flow, so we expect it to exist
    # already at full-approval time — seed the remaining 4 build milestones.
    existing_titles = set(
        await db.milestones.distinct(
            "title",
            {"client_email": client_email, "project_name": project_name},
        )
    )
    now = _now()
    docs = []
    for plan in DEFAULT_MILESTONE_PLAN:
        if plan["title"] in existing_titles:
            continue
        due = now + timedelta(days=int(plan.get("offset_days") or 7))
        docs.append(
            {
                "id": str(uuid.uuid4()),
                "client_email": client_email,
                "project_name": project_name,
                "title": plan["title"],
                "status": plan.get("status", "pending"),
                "description": plan.get("description", ""),
                "is_final_deliverable": bool(plan.get("is_final_deliverable", False)),
                "notify_client_on_complete": bool(plan.get("notify_client_on_complete", False)),
                "nifty_task_id": None,
                "due_date": due.isoformat(),
                "completion_date": None,
                "blocked_reason": None,
                "blocked_eta": None,
                "notes": [],
                "last_updated": now.isoformat(),
                "created_at": now.isoformat(),
                "seeded_from_brief": brief.get("id"),
                "linked_brief_phase": None,
            }
        )
    if docs:
        await db.milestones.insert_many(docs)
    return len(docs)


# Backwards-compat alias for older code that imports the old helper name.
_seed_milestones_from_brief = _seed_build_milestones


async def _seed_project_mode(
    db: AsyncIOMotorDatabase, request: Request, brief: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """On full brief approval: create a Project Mode workspace with AI tasks.

    Idempotent — looks up an existing project by (client_email, name) first.
    """
    client_email = (brief.get("client_email") or "").lower()
    project_name = (brief.get("project_name") or "Project").strip()
    if not client_email:
        return None
    # Skip if a project already exists for this brief.
    existing = await db.pm_projects.find_one(
        {"client_email": client_email, "name": project_name},
        {"_id": 0, "id": 1},
    )
    if existing:
        return existing

    company = await db.companies.find_one(
        {"primary_email": client_email}, {"_id": 0, "id": 1}
    )

    now = _now_iso()
    project_doc = {
        "id": str(uuid.uuid4()),
        "name": project_name,
        "slug": re.sub(r"[^a-z0-9]+", "-", project_name.lower()).strip("-") or "project",
        "company_id": (company or {}).get("id"),
        "client_email": client_email,
        "color": "#1E3A8A",
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "created_by": "system:brief-approved",
        "seeded_from_brief": brief.get("id"),
    }
    await db.pm_projects.insert_one(project_doc)

    # Build AI-driven task list. Falls back to the standard 5 if AI is down.
    tasks = await _generate_emergent_dev_tasks(request, brief)

    # Tie each generated task to the corresponding build milestone via title-match.
    build_milestones = await db.milestones.find(
        {
            "client_email": client_email,
            "project_name": project_name,
            "linked_brief_phase": None,
        },
        {"_id": 0, "id": 1, "title": 1},
    ).to_list(20)
    title_to_id = {m["title"]: m["id"] for m in build_milestones}

    docs = []
    for idx, t in enumerate(tasks):
        # Most natural mapping: first task = Discovery, last = Launch.
        milestone_id = title_to_id.get(t.get("milestone_title"))
        docs.append(
            {
                "id": str(uuid.uuid4()),
                "project_id": project_doc["id"],
                "title": t["title"][:200],
                "description": t.get("description", "")[:4000],
                "status": "in_progress" if idx == 0 else "todo",
                "assignee": None,
                "due_date": None,
                "priority": t.get("priority", "medium"),
                "milestone_id": milestone_id,
                "order_idx": idx,
                "created_at": now,
                "updated_at": now,
                "created_by": "system:brief-approved",
            }
        )
    if docs:
        await db.pm_tasks.insert_many(docs)
    return project_doc


async def _generate_emergent_dev_tasks(
    request: Request, brief: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Ask Claude (via OpenRouter) to translate the approved brief into a list
    of Emergent-ready dev tasks. Each task is a short title + an
    Emergent-platform-ready prompt as the description.

    Returns the fallback 5-task template if the LLM is unreachable so the
    project always has SOMETHING to start from.
    """
    fallback = [
        {
            "title": "Discovery: lock scope, success metrics, accounts",
            "description": (
                "Confirm the success metrics from the approved brief. Open accounts "
                "the team will need (Stripe, Slack, Vercel, etc.). Pre-fill .env.example."
            ),
            "milestone_title": "Discovery & Brief Sign-off",
            "priority": "high",
        },
        {
            "title": "Design system v1: tokens, type scale, components",
            "description": (
                "Build a /tokens.css with the approved design language. Generate a "
                "type scale (xs to 6xl) using clamp(). Set up shadcn primitives "
                "(Button, Card, Input, Badge) styled to match the brief."
            ),
            "milestone_title": "Design Language",
            "priority": "high",
        },
        {
            "title": "Hero + nav + footer for the marketing site",
            "description": (
                "Build the public landing page using React + Tailwind. Hero with "
                "client copy from the brief, sticky mega-nav, footer with social "
                "links. Make sure mobile is excellent."
            ),
            "milestone_title": "Build — Core flows",
            "priority": "high",
        },
        {
            "title": "QA pass: a11y, mobile, copy, edge cases",
            "description": (
                "Run axe-core, Lighthouse, and manual mobile checks. Verify all CTAs "
                "fire correctly. Have a non-team member click through cold."
            ),
            "milestone_title": "QA & Polish",
            "priority": "medium",
        },
        {
            "title": "Launch: DNS, analytics, monitoring, walkthrough",
            "description": (
                "Point DNS, configure Sentry + GA4, write the launch tweet, schedule "
                "a 45-min founder walkthrough call."
            ),
            "milestone_title": "Launch",
            "priority": "medium",
        },
    ]

    openrouter = getattr(request.app.state, "openrouter", None)
    if openrouter is None:
        return fallback

    summaries = brief.get("phase_summaries") or {}

    def _strip(html: Optional[str]) -> str:
        if not html:
            return "(empty)"
        # Quick text-only flatten — strips HTML tags.
        return re.sub(r"<[^>]+>", " ", html).strip()[:2500]

    prompt = (
        "You are a senior full-stack engineering manager at Bloom Labs. The client's "
        "Project Brief has just been approved. Your job is to translate the three phase "
        "summaries below into a list of 8-12 Emergent-platform-ready dev tasks the team "
        "will use to build this project on emergent.sh.\n\n"
        "Each task MUST have:\n"
        "  - A short, action-verb-first title (max 80 chars).\n"
        "  - A description written AS A PROMPT for the Emergent platform — "
        "    technology-specific, file-path-aware where possible, mentioning the "
        "    component to build, the API contract, the visual outcome. Think: "
        "    `Build a React component at /src/pages/Dashboard.jsx that fetches "
        "    /api/x and renders y with shadcn Card components.`\n"
        "  - A milestone_title — pick from EXACTLY ONE of these standard build "
        "    milestones the project already has:\n"
        "      • Discovery & Brief Sign-off\n"
        "      • Design Language\n"
        "      • Build — Core flows\n"
        "      • QA & Polish\n"
        "      • Launch\n"
        "  - A priority (low, medium, high, urgent).\n\n"
        f"--- Phase 1 (Design Language) summary ---\n{_strip(summaries.get('phase1', {}).get('summary'))}\n\n"
        f"--- Phase 2 (Functionality) summary ---\n{_strip(summaries.get('phase2', {}).get('summary'))}\n\n"
        f"--- Phase 3 (Company Background) summary ---\n{_strip(summaries.get('phase3', {}).get('summary'))}\n\n"
        "Return ONLY a JSON array. No prose, no markdown, no preamble.\n"
        'Schema: [{"title": str, "description": str, "milestone_title": str, "priority": str}, ...]'
    )

    try:
        raw = await openrouter.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=2500,
        )
        log.info("dev-task LLM response len=%d", len(raw or ""))
        if not raw:
            return fallback
        # LLMs often wrap JSON in ```json ... ``` fences — strip them first.
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```\s*$", "", text)
        # Extract the JSON array from the response (LLMs sometimes wrap it).
        match = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
        if not match:
            log.warning(
                "LLM did not return a JSON array for dev tasks; first 200 chars: %r",
                text[:200],
            )
            return fallback
        import json
        items = json.loads(match.group(0))
        cleaned: List[Dict[str, Any]] = []
        allowed_ms = {m["title"] for m in DEFAULT_MILESTONE_PLAN}
        for it in items[:14]:
            title = (it.get("title") or "").strip()
            desc = (it.get("description") or "").strip()
            ms = (it.get("milestone_title") or "").strip()
            pri = (it.get("priority") or "medium").lower()
            if not title or not desc:
                continue
            if ms not in allowed_ms:
                ms = "Build — Core flows"
            if pri not in ("low", "medium", "high", "urgent"):
                pri = "medium"
            cleaned.append({"title": title, "description": desc, "milestone_title": ms, "priority": pri})
        return cleaned if cleaned else fallback
    except Exception as exc:  # pragma: no cover
        log.warning("AI dev-task generation failed: %s", exc)
        return fallback


# =========================================================================
# PDF snapshot — drop into Project Files on full approval
# =========================================================================
async def _generate_approved_brief_pdf(
    db: AsyncIOMotorDatabase, brief: Dict[str, Any]
) -> None:
    """Render the approved brief as a PDF and store it via object storage."""
    try:
        from weasyprint import HTML

        import object_storage
    except Exception as exc:  # pragma: no cover
        log.warning("PDF snapshot skipped — weasyprint/object_storage unavailable: %s", exc)
        return

    summaries = brief.get("phase_summaries") or {}
    blocks = []
    for k in PHASE_KEYS:
        p = summaries.get(k) or {}
        approved_at = p.get("approved_at") or "—"
        body = p.get("summary") or "<p>(no summary)</p>"
        blocks.append(
            f"<h2>{PHASE_TITLES[k]}</h2>"
            f"<p class='meta'>Approved {approved_at}</p>"
            f"<div class='body'>{body}</div>"
        )
    html = f"""
    <html><head><style>
        body {{ font-family: -apple-system, system-ui, sans-serif; padding: 40px; color: #1f2937; }}
        h1 {{ font-size: 28px; margin-bottom: 4px; }}
        .meta {{ color: #6b7280; font-size: 12px; }}
        h2 {{ margin-top: 32px; color: #1E3A8A; }}
        .body {{ font-size: 14px; line-height: 1.6; }}
        .footer {{ margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb;
                   font-size: 11px; color: #6b7280; }}
    </style></head><body>
        <h1>Approved Project Brief</h1>
        <p class='meta'>{brief.get('project_name')} · Client: {brief.get('client_email')}</p>
        {''.join(blocks)}
        <div class='footer'>
            Approved by {brief.get('approved_by_email')} on {brief.get('approved_at')}.
            Generated by Bloom Labs · bybloomlabs.com
        </div>
    </body></html>
    """
    try:
        pdf_bytes = HTML(string=html).write_pdf()
    except Exception as exc:  # pragma: no cover
        log.warning("PDF render failed: %s", exc)
        return

    rel = f"project-files/{brief['client_email']}/brief-{brief['id']}.pdf"
    try:
        result = object_storage.put_object(rel, pdf_bytes, "application/pdf")
    except Exception as exc:  # pragma: no cover
        log.warning("PDF snapshot upload failed: %s", exc)
        return

    now = _now_iso()
    company_id = brief.get("company_id")
    file_doc = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "client_email": brief["client_email"],
        "storage_path": result["path"],
        "original_filename": f"approved-brief-{brief.get('project_name', 'project').replace(' ', '-')}.pdf",
        "content_type": "application/pdf",
        "size_bytes": len(pdf_bytes),
        "category": "brief",
        "notes": "Auto-generated when this brief was fully approved.",
        "uploaded_by": "system:brief-approval",
        "uploaded_at": now,
        "is_deleted": False,
    }
    await db.project_files.insert_one(file_doc)


# =========================================================================
# Pydantic
# =========================================================================
class BriefCreateRequest(BaseModel):
    client_email: str
    onboarding_id: Optional[str] = None
    project_name: Optional[str] = None


class PhaseUpdateRequest(BaseModel):
    summary: str = Field(..., min_length=1)
    admin_reply_note: Optional[str] = None  # set when re-rolling after a comment


class PhaseSendRequest(BaseModel):
    note_to_client: Optional[str] = None


class PhaseCommentRequest(BaseModel):
    comment: str = Field(..., min_length=2, max_length=5000)


class PhaseApproveRequest(BaseModel):
    no_comments_confirmed: bool


# =========================================================================
# Admin router
# =========================================================================
brief_admin_router = APIRouter(
    prefix="/admin/briefs",
    tags=["briefs"],
    dependencies=[Depends(get_current_user)],
)


@brief_admin_router.get("/prompts/{onboarding_id}")
async def get_prompts(
    onboarding_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    onboarding = await db.onboardings.find_one({"id": onboarding_id}, {"_id": 0})
    if not onboarding:
        raise HTTPException(404, "Onboarding not found")
    return {
        "onboarding_id": onboarding_id,
        "client_email": onboarding.get("client_email"),
        "phases_submitted": {
            "phase1": bool(onboarding.get("phase1_submitted_at")),
            "phase2": bool(onboarding.get("phase2_submitted_at")),
            "phase3": bool(onboarding.get("phase3_submitted_at")),
        },
        "answers": {
            k: _onb_phase(onboarding, k) for k in PHASE_KEYS
        },
        "prompts": build_prompts_from_onboarding(onboarding),
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
    for d in docs:
        d["phase_summaries"] = {
            k: _migrate_phase_shape((d.get("phase_summaries") or {}).get(k)) for k in PHASE_KEYS
        }
    return docs


@brief_admin_router.get("/{brief_id}")
async def get_brief(
    brief_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Brief not found")
    doc["phase_summaries"] = {
        k: _migrate_phase_shape((doc.get("phase_summaries") or {}).get(k)) for k in PHASE_KEYS
    }
    return doc


@brief_admin_router.post("")
async def create_brief(
    req: BriefCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    email = req.client_email.lower().strip()
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
        "phase_summaries": {k: _default_phase() for k in PHASE_KEYS},
        "status": "draft",
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
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    if phase_key not in PHASE_KEYS:
        raise HTTPException(400, "phase_key must be phase1, phase2, or phase3")
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    summaries = brief.get("phase_summaries") or {}
    phase = _migrate_phase_shape(summaries.get(phase_key))
    if phase.get("status") == "approved":
        raise HTTPException(409, "Phase is already approved and locked. Create a new revision.")

    clean_summary = _sanitize_html(req.summary)
    if not clean_summary:
        raise HTTPException(400, "Summary is empty after sanitisation.")
    now = _now_iso()
    actor = (user.get("email") if isinstance(user, dict) else None) or "admin"

    # Snapshot the previous summary as a revision (if it existed).
    new_revision = {
        "summary": clean_summary,
        "comment": phase.get("latest_comment"),
        "admin_reply_note": _sanitize_html(req.admin_reply_note),
        "created_at": now,
        "created_by": actor,
    }
    revisions = phase.get("revisions") or []
    revisions.append(new_revision)

    # When admin edits after the client commented, status moves back to draft
    # so they can choose when to re-send.
    next_status = "draft" if phase.get("status") in ("in_revision", "sent_for_review") else phase.get("status", "draft")
    if next_status == "approved":
        next_status = "draft"

    phase.update(
        {
            "summary": clean_summary,
            "status": next_status,
            "admin_reply_note": _sanitize_html(req.admin_reply_note),
            "revisions": revisions,
            "updated_at": now,
        }
    )
    summaries[phase_key] = phase
    await db.project_briefs.update_one(
        {"id": brief_id}, {"$set": {f"phase_summaries.{phase_key}": phase, "updated_at": now}}
    )
    await _publish_brief_status(db, brief_id, summaries)
    await _sync_review_milestone(db, brief, phase_key, phase)
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


@brief_admin_router.post("/{brief_id}/phase/{phase_key}/send-for-review")
async def send_phase_for_review(
    brief_id: str,
    phase_key: str,
    req: PhaseSendRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if phase_key not in PHASE_KEYS:
        raise HTTPException(400, "phase_key must be phase1, phase2, or phase3")
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    summaries = brief.get("phase_summaries") or {}
    phase = _migrate_phase_shape(summaries.get(phase_key))
    if phase.get("status") == "approved":
        raise HTTPException(409, "Phase is already approved.")
    if not phase.get("summary"):
        raise HTTPException(400, "Save a summary before sending for review.")

    now = _now_iso()
    phase.update({"status": "sent_for_review", "sent_at": now, "updated_at": now})
    summaries[phase_key] = phase
    await db.project_briefs.update_one(
        {"id": brief_id}, {"$set": {f"phase_summaries.{phase_key}": phase, "updated_at": now}}
    )
    await _publish_brief_status(db, brief_id, summaries)
    await _sync_review_milestone(db, brief, phase_key, phase)

    # Send per-phase email with rendered summary + admin note
    try:
        import email_service

        emailit = request.app.state.emailit
        base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
        portal_url = f"{base}/portal?tab=brief&phase={phase_key}"
        await email_service.send_brief_phase_for_review(
            emailit,
            to=brief["client_email"],
            name=brief["client_email"].split("@")[0],
            project_name=brief["project_name"],
            phase_title=PHASE_TITLES[phase_key],
            phase_label=phase_key.replace("phase", "Phase "),
            summary_html=phase.get("summary") or "",
            admin_note=_sanitize_html(req.note_to_client),
            portal_url=portal_url,
        )
    except Exception as exc:  # pragma: no cover
        log.warning("Per-phase review email failed: %s", exc)
    # Slack notification
    try:
        import slack_notifier

        await slack_notifier.post_message(
            db,
            text=(
                f"📤 *Brief phase sent for review* — {brief['project_name']}\n"
                f"Phase: {PHASE_TITLES[phase_key]}\n"
                f"Client: {brief['client_email']}"
            ),
        )
    except Exception:  # pragma: no cover
        pass

    if brief.get("company_id"):
        await log_activity(
            db,
            company_id=brief["company_id"],
            type="brief.phase.sent",
            title=f"{PHASE_TITLES[phase_key]} sent for review",
            meta={"brief_id": brief_id, "phase": phase_key},
        )
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


@brief_admin_router.delete("/{brief_id}")
async def archive_brief(
    brief_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.project_briefs.update_one(
        {"id": brief_id}, {"$set": {"status": "archived", "updated_at": _now_iso()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Brief not found")
    return {"ok": True}


# =========================================================================
# Client portal router
# =========================================================================
brief_client_router = APIRouter(prefix="/clients/me/briefs", tags=["briefs-client"])


def _client_dep():
    from client_routes import get_current_client
    return get_current_client


@brief_client_router.get("/pending")
async def get_pending_brief(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Optional[Dict[str, Any]]:
    """The single brief currently in review for this client (or null)."""
    doc = await db.project_briefs.find_one(
        {"client_email": client["email"], "status": "in_review"},
        {"_id": 0},
        sort=[("updated_at", -1)],
    )
    if not doc:
        return None
    doc["phase_summaries"] = {
        k: _migrate_phase_shape((doc.get("phase_summaries") or {}).get(k)) for k in PHASE_KEYS
    }
    return doc


@brief_client_router.get("/approved")
async def list_approved_briefs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> List[Dict[str, Any]]:
    docs = await db.project_briefs.find(
        {"client_email": client["email"], "status": "approved"}, {"_id": 0}
    ).sort("approved_at", -1).to_list(20)
    for d in docs:
        d["phase_summaries"] = {
            k: _migrate_phase_shape((d.get("phase_summaries") or {}).get(k)) for k in PHASE_KEYS
        }
    return docs


@brief_client_router.post("/{brief_id}/phase/{phase_key}/comment")
async def post_phase_comment(
    brief_id: str,
    phase_key: str,
    req: PhaseCommentRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Dict[str, Any]:
    if phase_key not in PHASE_KEYS:
        raise HTTPException(400, "phase_key must be phase1, phase2, or phase3")
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    if brief["client_email"] != client["email"]:
        raise HTTPException(403, "This brief is not yours.")
    summaries = brief.get("phase_summaries") or {}
    phase = _migrate_phase_shape(summaries.get(phase_key))
    if phase.get("status") not in ("sent_for_review",):
        raise HTTPException(
            409,
            "You can only comment on a phase that is currently awaiting your review.",
        )
    now = _now_iso()
    clean_comment = (req.comment or "").strip()
    phase.update(
        {
            "status": "in_revision",
            "latest_comment": clean_comment,
            "updated_at": now,
        }
    )
    summaries[phase_key] = phase
    await db.project_briefs.update_one(
        {"id": brief_id}, {"$set": {f"phase_summaries.{phase_key}": phase, "updated_at": now}}
    )
    await _publish_brief_status(db, brief_id, summaries)
    await _sync_review_milestone(db, brief, phase_key, phase)

    if brief.get("company_id"):
        await log_activity(
            db,
            company_id=brief["company_id"],
            type="brief.phase.commented",
            title=f"Client comment on {PHASE_TITLES[phase_key]}",
            actor=f"client:{client['email']}",
            meta={"brief_id": brief_id, "phase": phase_key, "comment": clean_comment[:280]},
        )
    # Notify founder
    try:
        import email_service

        emailit = request.app.state.emailit
        await email_service.send_brief_phase_commented_to_founder(
            emailit,
            to=os.environ.get("FOUNDER_EMAIL", "founder@thesalvador.group"),
            project_name=brief["project_name"],
            client_email=client["email"],
            phase_title=PHASE_TITLES[phase_key],
            comment=clean_comment,
        )
    except Exception:  # pragma: no cover
        pass
    try:
        import slack_notifier

        await slack_notifier.post_message(
            db,
            text=(
                f"💬 *Brief comment* on {PHASE_TITLES[phase_key]}\n"
                f"Project: {brief['project_name']}\n"
                f"Client: {client['email']}\n"
                f"\"{clean_comment[:280]}\""
            ),
        )
    except Exception:  # pragma: no cover
        pass
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


@brief_client_router.post("/{brief_id}/phase/{phase_key}/approve")
async def approve_phase(
    brief_id: str,
    phase_key: str,
    req: PhaseApproveRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Dict[str, Any]:
    if phase_key not in PHASE_KEYS:
        raise HTTPException(400, "phase_key must be phase1, phase2, or phase3")
    if not req.no_comments_confirmed:
        raise HTTPException(
            400, "Please confirm 'I leave no comments' before approving the phase."
        )
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    if brief["client_email"] != client["email"]:
        raise HTTPException(403, "This brief is not yours.")
    summaries = brief.get("phase_summaries") or {}
    phase = _migrate_phase_shape(summaries.get(phase_key))
    if phase.get("status") == "approved":
        return brief  # idempotent
    if phase.get("status") != "sent_for_review":
        raise HTTPException(
            409, "Phase is not currently awaiting your approval."
        )
    now = _now_iso()
    phase.update({"status": "approved", "approved_at": now, "updated_at": now})
    summaries[phase_key] = phase
    await db.project_briefs.update_one(
        {"id": brief_id}, {"$set": {f"phase_summaries.{phase_key}": phase, "updated_at": now}}
    )
    new_status = await _publish_brief_status(db, brief_id, summaries)
    await _sync_review_milestone(db, brief, phase_key, phase)
    if brief.get("company_id"):
        await log_activity(
            db,
            company_id=brief["company_id"],
            type="brief.phase.approved",
            title=f"{PHASE_TITLES[phase_key]} APPROVED",
            actor=f"client:{client['email']}",
            meta={"brief_id": brief_id, "phase": phase_key},
        )
    try:
        import slack_notifier

        await slack_notifier.post_message(
            db,
            text=(
                f"✅ *Brief phase APPROVED* — {PHASE_TITLES[phase_key]}\n"
                f"Project: {brief['project_name']}\n"
                f"Client: {client['email']}"
            ),
        )
    except Exception:  # pragma: no cover
        pass
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})

    # If this was the final phase, kick off the full-approval pipeline.
    if new_status == "approved":
        await _finalize_brief_approval(db, request, fresh, client)
        fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


@brief_client_router.post("/{brief_id}/approve")
async def approve_brief(
    brief_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Dict[str, Any]:
    """Backward-compat wrapper. The new flow approves per-phase; this endpoint
    requires that ALL phases are already approved (otherwise 409)."""
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    if brief["client_email"] != client["email"]:
        raise HTTPException(403, "This brief is not yours to approve.")
    if brief.get("status") == "approved":
        return brief
    if not _all_phases_approved(brief):
        raise HTTPException(
            409,
            "All 3 phases must be approved before signing off on the whole brief.",
        )
    now = _now_iso()
    await db.project_briefs.update_one(
        {"id": brief_id},
        {"$set": {"status": "approved", "approved_at": now, "approved_by_email": client["email"], "updated_at": now}},
    )
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    await _finalize_brief_approval(db, request, fresh, client)
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return fresh


async def _finalize_brief_approval(
    db: AsyncIOMotorDatabase,
    request: Request,
    brief: Dict[str, Any],
    client: Dict[str, Any],
) -> None:
    """All 3 phases approved → seed build milestones, create Project Mode
    project with AI tasks, drop a PDF in Project Files, ping founder."""
    now = _now_iso()
    # Stamp brief-level approval (idempotent)
    if not brief.get("approved_at"):
        await db.project_briefs.update_one(
            {"id": brief["id"]},
            {
                "$set": {
                    "status": "approved",
                    "approved_at": now,
                    "approved_by_email": client["email"],
                    "updated_at": now,
                }
            },
        )
        brief["approved_at"] = now
        brief["approved_by_email"] = client["email"]
        brief["status"] = "approved"

    seeded = await _seed_build_milestones(db, brief)

    if brief.get("company_id"):
        await log_activity(
            db,
            company_id=brief["company_id"],
            type="brief.approved",
            title="Brief APPROVED — Project Mode workspace seeding",
            actor=f"client:{client['email']}",
            meta={
                "brief_id": brief["id"],
                "milestones_seeded": seeded,
            },
        )
    # Founder email
    try:
        import email_service

        emailit = request.app.state.emailit
        await email_service.send_brief_approved_to_founder(
            emailit,
            to=os.environ.get("FOUNDER_EMAIL", "founder@thesalvador.group"),
            project_name=brief["project_name"],
            client_email=client["email"],
            approved_at=brief["approved_at"],
        )
    except Exception:  # pragma: no cover
        pass
    # Founder Slack
    try:
        import slack_notifier

        await slack_notifier.post_message(
            db,
            text=(
                f"🎉 *Full brief APPROVED* — {brief['project_name']}\n"
                f"Project Mode workspace seeding. {seeded} milestones scheduled."
            ),
        )
    except Exception:  # pragma: no cover
        pass
    # Background: project mode seeding (LLM call can be slow) + PDF snapshot
    try:
        asyncio.create_task(_seed_project_mode(db, request, brief))
    except Exception:  # pragma: no cover
        pass
    try:
        asyncio.create_task(_generate_approved_brief_pdf(db, brief))
    except Exception:  # pragma: no cover
        pass


__all__ = [
    "brief_admin_router",
    "brief_client_router",
    "generate_design_prompt",
    "generate_function_prompt",
    "generate_company_prompt",
    "build_prompts_from_onboarding",
    "PHASE_KEYS",
    "PHASE_TITLES",
]
