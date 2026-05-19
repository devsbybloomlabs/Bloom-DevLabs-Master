"""Audit submission engine — multi-step lead capture + AI analysis + sales pipeline.

Flow:
  1. Public visitor submits the 2-step audit form  → POST /api/audits
  2. Submission saved, confirmation email sent, Slack #leads pinged
  3. Background task calls Claude (OpenRouter) to draft 3-5 recommendations
  4. Sales team reviews + closes in the admin dashboard
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from emailit_client import EmailitClient
from slack_notifier import post_message as slack_post

log = logging.getLogger("audit")

# =============================================================================
# Enums + defaults
# =============================================================================
INDUSTRIES = [
    "Gym Owners",
    "Clinics/Wellness",
    "E-commerce",
    "SaaS",
    "Marketplace",
    "Real Estate",
    "Coaching/Consulting",
    "Other",
]
COMPANY_SIZES = ["1-10", "11-50", "51-200", "200+"]
PAIN_POINTS = [
    "Member/Patient Retention",
    "Booking/Scheduling",
    "Inventory/Operations",
    "Sales/Marketing",
    "Analytics/Reporting",
    "Custom Problem",
]
BUDGETS = ["$3K-$7K", "$7K-$12K", "$12K-$20K", "$20K+"]
TIMELINES = ["ASAP (this month)", "Next month", "Next quarter", "Still exploring"]
ROLES = ["Founder", "Manager", "Operations Lead", "Other"]
STATUSES = ["submitted", "analyzed", "reviewed", "called", "closed_won", "closed_lost", "abandoned"]

AUDIT_FROM_EMAIL = "audit@bybloomlabs.com"
AUDIT_FROM_NAME = "Audit Team @ Bloom DevLabs"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return str(uuid.uuid4())


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =============================================================================
# Models
# =============================================================================
class AuditSubmission(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    # Step 1 — business info
    company_name: str
    customer_name: str
    customer_title: str  # one of ROLES
    customer_email: EmailStr
    customer_phone: str
    industry: str
    company_size: str
    pain_point: str
    budget_range: str
    # Step 2 — workflow
    workflow_description: str
    bottleneck_description: str
    timeline: str
    # Funnel attribution
    source_cta: Optional[str] = None  # which CTA the user clicked
    source_url: Optional[str] = None
    # Sales workflow
    status: str = "submitted"
    assigned_to: Optional[str] = None
    analyzed_recommendations: Optional[str] = None
    recommendation_titles: List[str] = Field(default_factory=list)
    estimated_price_tier: Optional[str] = None
    quick_win: Optional[str] = None
    call_scheduled_at: Optional[datetime] = None
    call_completed_at: Optional[datetime] = None
    deal_status: Optional[str] = None  # won|lost|pipeline
    deal_value_usd: Optional[float] = None
    notes: Optional[str] = None
    # Timestamps
    created_at: datetime = Field(default_factory=_now)
    submitted_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    analyzed_at: Optional[datetime] = None


class AuditCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    customer_name: str = Field(min_length=1, max_length=120)
    customer_title: str
    customer_email: EmailStr
    customer_phone: str = Field(min_length=4, max_length=40)
    industry: str
    company_size: str
    pain_point: str
    budget_range: str
    workflow_description: str = Field(min_length=80, max_length=2000)
    bottleneck_description: str = Field(min_length=20, max_length=1000)
    timeline: str
    source_cta: Optional[str] = None
    source_url: Optional[str] = None
    affiliate_ref: Optional[str] = Field(default=None, max_length=32)


class AuditUpdateRequest(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    call_scheduled_at: Optional[datetime] = None
    call_completed_at: Optional[datetime] = None
    deal_status: Optional[str] = None
    deal_value_usd: Optional[float] = None
    notes: Optional[str] = None


# =============================================================================
# Public router
# =============================================================================
audit_public_router = APIRouter(prefix="/audits", tags=["audit-public"])


@audit_public_router.get("/options")
async def get_options() -> Dict[str, Any]:
    """Form-field dropdown options. Public — used by /get-audit page."""
    return {
        "industries": INDUSTRIES,
        "company_sizes": COMPANY_SIZES,
        "pain_points": PAIN_POINTS,
        "budgets": BUDGETS,
        "timelines": TIMELINES,
        "roles": ROLES,
    }


@audit_public_router.post("")
async def submit_audit(
    req: AuditCreateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    # Validate enums (loose — we accept "Other" as escape)
    if req.industry not in INDUSTRIES:
        raise HTTPException(422, f"industry must be one of {INDUSTRIES}")
    if req.company_size not in COMPANY_SIZES:
        raise HTTPException(422, "invalid company_size")
    if req.pain_point not in PAIN_POINTS:
        raise HTTPException(422, "invalid pain_point")
    if req.budget_range not in BUDGETS:
        raise HTTPException(422, "invalid budget_range")
    if req.timeline not in TIMELINES:
        raise HTTPException(422, "invalid timeline")

    submission = AuditSubmission(**req.model_dump())
    await db.audit_submissions.insert_one(
        prepare_for_mongo(submission.model_dump())
    )

    # Affiliate attribution — best-effort, never blocks submission
    try:
        from affiliate_routes import attach_referral_from_audit
        await attach_referral_from_audit(db, submission.model_dump(), req.affiliate_ref)
    except Exception as exc:
        log.warning("Affiliate attribution failed: %s", exc)

    # Fire-and-forget: email + slack + claude
    background_tasks.add_task(
        _post_submit_pipeline, request.app, submission.model_dump()
    )

    # Compute "next business day" call window for the UI
    next_business = _now() + timedelta(days=1)
    while next_business.weekday() >= 5:
        next_business += timedelta(days=1)

    return {
        "id": submission.id,
        "ok": True,
        "expected_call_window": next_business.strftime("%A, %B %d"),
        "customer_email": req.customer_email,
        "customer_phone": req.customer_phone,
    }


@audit_public_router.get("/{audit_id}/status")
async def public_status(
    audit_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.audit_submissions.find_one(
        {"id": audit_id},
        {"_id": 0, "status": 1, "customer_name": 1, "id": 1, "company_name": 1},
    )
    if not doc:
        raise HTTPException(404, "Not found")
    return serialize_doc(doc)


# =============================================================================
# Admin router
# =============================================================================
audit_admin_router = APIRouter(
    prefix="/admin/audits",
    tags=["audit-admin"],
    dependencies=[Depends(get_current_user)],
)


@audit_admin_router.get("")
async def admin_list(
    status: Optional[str] = None,
    industry: Optional[str] = None,
    assigned_to: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    if industry:
        q["industry"] = industry
    if assigned_to:
        q["assigned_to"] = assigned_to
    docs = (
        await db.audit_submissions.find(q, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return [serialize_doc(d) for d in docs]


@audit_admin_router.get("/reports/summary")
async def admin_reports(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Top-of-dashboard stats + funnel + by-industry breakdown."""
    now = _now()
    week_ago_iso = (now - timedelta(days=7)).isoformat()
    month_ago_iso = (now - timedelta(days=30)).isoformat()

    total = await db.audit_submissions.count_documents({})
    week = await db.audit_submissions.count_documents({"created_at": {"$gte": week_ago_iso}})
    month = await db.audit_submissions.count_documents({"created_at": {"$gte": month_ago_iso}})
    called = await db.audit_submissions.count_documents(
        {"status": {"$in": ["called", "closed_won", "closed_lost"]}}
    )
    won = await db.audit_submissions.count_documents({"status": "closed_won"})

    # Funnel counts
    status_pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    rows = await db.audit_submissions.aggregate(status_pipeline).to_list(50)
    by_status = {r["_id"]: r["count"] for r in rows}

    # By industry
    ind_rows = await db.audit_submissions.aggregate(
        [{"$group": {"_id": "$industry", "count": {"$sum": 1}}}]
    ).to_list(50)
    by_industry = sorted(
        [{"industry": r["_id"] or "Unknown", "count": r["count"]} for r in ind_rows],
        key=lambda x: -x["count"],
    )

    # By source CTA
    cta_rows = await db.audit_submissions.aggregate(
        [{"$group": {"_id": "$source_cta", "count": {"$sum": 1}}}]
    ).to_list(50)
    by_source_cta = sorted(
        [{"cta": r["_id"] or "(unknown)", "count": r["count"]} for r in cta_rows],
        key=lambda x: -x["count"],
    )

    # Won deal $ — sum
    won_pipeline = [
        {"$match": {"status": "closed_won", "deal_value_usd": {"$ne": None}}},
        {"$group": {"_id": None, "total": {"$sum": "$deal_value_usd"}}},
    ]
    won_rows = await db.audit_submissions.aggregate(won_pipeline).to_list(10)
    deal_value_won = won_rows[0]["total"] if won_rows else 0

    # Avg time-to-call (submitted → call_scheduled)
    ttc_rows = await db.audit_submissions.find(
        {"call_scheduled_at": {"$ne": None}, "submitted_at": {"$ne": None}},
        {"_id": 0, "submitted_at": 1, "call_scheduled_at": 1},
    ).to_list(500)
    ttc_hours: List[float] = []
    for r in ttc_rows:
        try:
            sub = datetime.fromisoformat(str(r["submitted_at"]).replace("Z", "+00:00"))
            sch = datetime.fromisoformat(str(r["call_scheduled_at"]).replace("Z", "+00:00"))
            ttc_hours.append((sch - sub).total_seconds() / 3600.0)
        except Exception:
            continue
    avg_ttc = round(sum(ttc_hours) / len(ttc_hours), 1) if ttc_hours else None

    # Submissions per day (last 14 days) for trend chart — use $substr since dates are ISO strings
    daily_rows = await db.audit_submissions.aggregate(
        [
            {"$match": {"created_at": {"$gte": (now - timedelta(days=14)).isoformat()}}},
            {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]
    ).to_list(50)
    daily = [{"day": r["_id"], "count": r["count"]} for r in daily_rows]

    return {
        "total": total,
        "week": week,
        "month": month,
        "called": called,
        "won": won,
        "call_rate_pct": round(called / total * 100, 1) if total else 0.0,
        "win_rate_pct": round(won / called * 100, 1) if called else 0.0,
        "deal_value_won_usd": deal_value_won,
        "avg_time_to_call_hours": avg_ttc,
        "by_status": by_status,
        "by_industry": by_industry,
        "by_source_cta": by_source_cta,
        "daily": daily,
    }


@audit_admin_router.get("/{audit_id}")
async def admin_get(
    audit_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.audit_submissions.find_one({"id": audit_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return serialize_doc(doc)


@audit_admin_router.patch("/{audit_id}")
async def admin_update(
    audit_id: str,
    req: AuditUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    existing = await db.audit_submissions.find_one({"id": audit_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if "status" in update and update["status"] not in STATUSES:
        raise HTTPException(422, f"status must be one of {STATUSES}")
    update["updated_at"] = _now()
    await db.audit_submissions.update_one(
        {"id": audit_id}, {"$set": prepare_for_mongo(update)}
    )
    fresh = await db.audit_submissions.find_one({"id": audit_id}, {"_id": 0})
    return serialize_doc(fresh)


@audit_admin_router.post("/{audit_id}/reanalyze")
async def admin_reanalyze(
    audit_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await db.audit_submissions.find_one({"id": audit_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    background_tasks.add_task(_run_ai_analysis, request.app, doc)
    return {"ok": True, "message": "Analysis re-queued"}


@audit_admin_router.delete("/{audit_id}")
async def admin_delete(
    audit_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.audit_submissions.delete_one({"id": audit_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# =============================================================================
# Background pipeline — email + slack + AI analysis
# =============================================================================
async def _post_submit_pipeline(app, submission: Dict[str, Any]) -> None:
    """Runs after a new audit lands: confirmation email + Slack ping + Claude analysis + pipeline insert."""
    try:
        await asyncio.gather(
            _send_confirmation_email(app, submission),
            _post_to_slack(app, submission),
            _run_ai_analysis(app, submission),
            _add_to_pipeline(app, submission),
            return_exceptions=True,
        )
    except Exception as exc:
        log.exception("post-submit pipeline failed: %s", exc)


async def _add_to_pipeline(app, submission: Dict[str, Any]) -> None:
    """Auto-create a hot/qualified Prospect row in the admin Pipeline so audits
    appear next to outbound leads in the Kanban. Idempotent on customer_email."""
    db = app.state.db
    email = submission.get("customer_email")
    audit_id = submission.get("id")
    # Idempotent: if a prospect already linked to this audit_id exists, skip.
    if audit_id and await db.prospects.find_one({"audit_id": audit_id}):
        return

    # Budget midpoint for deal_value estimate
    budget_midpoint = {
        "$3K-$7K": 5000,
        "$7K-$12K": 9500,
        "$12K-$20K": 16000,
        "$20K+": 25000,
    }.get(submission.get("budget_range", ""), None)

    # Heat score from budget × urgency (HIGH = "hot" lead)
    budget_score = {"$3K-$7K": 1, "$7K-$12K": 2, "$12K-$20K": 3, "$20K+": 4}.get(
        submission.get("budget_range", ""), 1
    )
    urgency_score = {
        "ASAP (this month)": 3,
        "Next month": 2,
        "Next quarter": 1,
        "Still exploring": 0,
    }.get(submission.get("timeline", ""), 0)
    heat = "hot" if budget_score + urgency_score >= 5 else "warm" if budget_score + urgency_score >= 3 else "cool"

    notes = (
        f"🔥 Audit lead ({heat.upper()}) — auto-created from /get-audit form.\n\n"
        f"Pain point: {submission.get('pain_point')}\n"
        f"Budget: {submission.get('budget_range')} · Timeline: {submission.get('timeline')}\n"
        f"Role: {submission.get('customer_title')} · Size: {submission.get('company_size')}\n"
        f"Phone: {submission.get('customer_phone')}\n\n"
        f"Workflow snippet:\n{(submission.get('workflow_description') or '')[:400]}…\n\n"
        f"Bottleneck:\n{submission.get('bottleneck_description')}\n\n"
        f"Full audit: /admin/audits/{audit_id}"
    )

    next_at = _now() + timedelta(hours=24)

    prospect_doc = {
        "id": _id(),
        "name": submission.get("customer_name"),
        "company": submission.get("company_name"),
        "email": email,
        "industry": submission.get("industry"),
        "source": f"audit-form:{submission.get('source_cta') or 'direct'}",
        # "qualified" puts it in the right Kanban column (past contacted/new)
        "status": "qualified",
        "notes": notes,
        "deal_value": budget_midpoint,
        "next_action": f"Call within 24h ({heat} lead)",
        "next_action_at": next_at,
        "heat": heat,  # extra field stored on doc (Prospect model ignores extras)
        "audit_id": audit_id,
        "created_at": _now(),
        "updated_at": _now(),
    }
    try:
        await db.prospects.insert_one(prepare_for_mongo(prospect_doc))
        log.info(
            "Pipeline: created %s prospect for audit %s (%s @ %s)",
            heat,
            audit_id,
            submission.get("customer_name"),
            submission.get("company_name"),
        )
    except Exception as exc:
        log.warning("Failed to insert audit into pipeline: %s", exc)


async def _send_confirmation_email(app, submission: Dict[str, Any]) -> None:
    emailit: EmailitClient = app.state.emailit
    if not emailit.is_configured:
        log.warning("Emailit not configured — skipping audit confirmation email")
        return
    name = submission["customer_name"].split(" ")[0]
    pain = submission["pain_point"].lower()
    subject = "Your Custom Workflow Audit is Ready · Bloom Labs"
    html = f"""
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:32px 24px;line-height:1.55">
  <div style="border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px">
    <p style="font-size:13px;color:#6b7280;margin:0">Bloom Labs · bybloomlabs.com</p>
    <h1 style="font-size:22px;margin:8px 0 0;font-weight:600">Your audit is in queue, {name}.</h1>
  </div>
  <p>Thanks for sharing your workflow with us. Our AI is analysing your setup right now and our audit team will call you within <strong>24 business hours</strong> at:</p>
  <ul style="background:#f3f4f6;border-radius:8px;padding:14px 20px;list-style:none;margin:18px 0">
    <li><strong>Phone:</strong> {submission["customer_phone"]}</li>
    <li><strong>Email:</strong> {submission["customer_email"]}</li>
  </ul>
  <p><strong>What to expect on the call:</strong></p>
  <ol>
    <li>We&rsquo;ll share <strong>3–5 specific custom-app recommendations</strong> tailored to your {pain} workflow.</li>
    <li>Concrete build timelines (typically 2–4 weeks per app).</li>
    <li>A fixed-price proposal so you know exactly what you&rsquo;re committing to.</li>
  </ol>
  <p style="margin-top:24px">If you don&rsquo;t hear from us, just reply to this email and we&rsquo;ll jump on it.</p>
  <p style="margin-top:32px">— The Audit Team @ Bloom DevLabs</p>
  <div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:16px;font-size:12px;color:#9ca3af">
    <a href="https://bybloomlabs.com/case-studies" style="color:#1E3A8A;text-decoration:none">Browse case studies →</a>
  </div>
</body></html>
""".strip()
    text = (
        f"Hi {name},\n\n"
        f"Thanks for sharing your workflow. Our AI is analysing your setup and our audit team "
        f"will call you within 24 business hours at {submission['customer_phone']} or "
        f"{submission['customer_email']}.\n\n"
        f"On the call we'll share 3-5 custom-app recommendations tailored to your "
        f"{submission['pain_point']} workflow, concrete timelines (2-4 weeks), and a "
        f"fixed-price proposal.\n\n"
        f"— Audit Team @ Bloom DevLabs"
    )
    try:
        await emailit.send_email(
            to=submission["customer_email"],
            subject=subject,
            html=html,
            text=text,
            from_email=AUDIT_FROM_EMAIL,
            from_name=AUDIT_FROM_NAME,
        )
    except Exception as exc:
        log.warning("Audit confirmation email failed for %s: %s", submission["customer_email"], exc)


async def _post_to_slack(app, submission: Dict[str, Any]) -> None:
    db = app.state.db
    # Priority scoring: high budget + ASAP = high
    budget_score = {"$3K-$7K": 1, "$7K-$12K": 2, "$12K-$20K": 3, "$20K+": 4}.get(
        submission["budget_range"], 1
    )
    urgency_score = {"ASAP (this month)": 3, "Next month": 2, "Next quarter": 1, "Still exploring": 0}.get(
        submission["timeline"], 0
    )
    priority = "HIGH" if budget_score + urgency_score >= 5 else "MEDIUM" if budget_score + urgency_score >= 3 else "LOW"

    text = (
        f":rocket: *New audit submitted* — {priority}\n"
        f"*{submission['customer_name']}* @ *{submission['company_name']}* — {submission['industry']}\n"
        f"Pain: {submission['pain_point']} · Budget: {submission['budget_range']} · Timeline: {submission['timeline']}\n"
        f"_Workflow:_ {submission['workflow_description'][:200]}{'…' if len(submission['workflow_description']) > 200 else ''}\n"
        f"<https://bybloomlabs.com/admin/audits/{submission['id']}|Open in dashboard →>"
    )
    res = await slack_post(db, text=text)
    if not res.get("ok"):
        log.info("Slack post skipped/failed: %s", res.get("reason"))


async def _run_ai_analysis(app, submission: Dict[str, Any]) -> None:
    """Call Claude via OpenRouter and store the recommendations."""
    openrouter = getattr(app.state, "openrouter", None)
    if not openrouter:
        log.warning("OpenRouter client not initialised — skipping AI analysis")
        return
    system_prompt = (
        "You are an expert business operations consultant for Bloom Labs, an "
        "AI-native custom web app development agency that ships in 2-4 weeks at "
        "fixed prices ($5,995-$14,995). Analyse the customer's workflow and "
        "recommend 3-5 specific custom apps/systems Bloom should build for them. "
        "Be concrete: name each app, describe key features, quantify expected "
        "impact, and state realistic build timelines.\n\n"
        "Format your response in plain markdown using this exact structure:\n\n"
        "## RECOMMENDATION 1: [App Name]\n"
        "**Problem It Solves:** ...\n"
        "**Key Features:** bullet list of 3-4\n"
        "**Expected Impact:** specific number (hours saved/week or revenue $/mo)\n"
        "**Build Timeline:** X weeks with Bloom\n"
        "**Why It Works For [Company]:** specific to their context\n\n"
        "(Repeat for 3-5 recommendations.)\n\n"
        "## SUMMARY\n"
        "- **Total Build Timeline:** X-Y weeks for all apps\n"
        "- **Est. Investment:** $X,XXX-$Y,YYY (from Bloom's $5,995-$14,995 range)\n"
        "- **Quick Win:** the single recommendation to launch first\n\n"
        "Tone: confident, technical-yet-clear, no fluff, no emoji."
    )
    user_prompt = (
        f"Company: {submission['company_name']}\n"
        f"Customer: {submission['customer_name']} ({submission.get('customer_title','')})\n"
        f"Industry: {submission['industry']} · Size: {submission['company_size']}\n"
        f"Pain point: {submission['pain_point']}\n"
        f"Budget: {submission['budget_range']} · Timeline: {submission['timeline']}\n\n"
        f"Current workflow:\n{submission['workflow_description']}\n\n"
        f"Biggest bottleneck:\n{submission['bottleneck_description']}\n\n"
        f"Based on this, recommend 3-5 specific custom apps Bloom should build for them."
    )
    try:
        text = await openrouter.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2200,
            temperature=0.6,
        )
        if not text:
            log.warning("OpenRouter returned empty audit analysis")
            return
        # Extract recommendation titles
        import re as _re

        titles = _re.findall(r"##\s*RECOMMENDATION\s*\d+:\s*(.+)", text)
        # Extract est investment line
        inv_match = _re.search(r"\*\*Est\.?\s*Investment:\*\*\s*([^\n]+)", text, _re.IGNORECASE)
        # Extract quick win
        qw_match = _re.search(r"\*\*Quick Win:\*\*\s*([^\n]+)", text, _re.IGNORECASE)

        db = app.state.db
        await db.audit_submissions.update_one(
            {"id": submission["id"]},
            {
                "$set": prepare_for_mongo(
                    {
                        "analyzed_recommendations": text,
                        "recommendation_titles": [t.strip() for t in titles[:6]],
                        "estimated_price_tier": (inv_match.group(1).strip() if inv_match else None),
                        "quick_win": (qw_match.group(1).strip() if qw_match else None),
                        "status": "analyzed",
                        "analyzed_at": _now(),
                        "updated_at": _now(),
                    }
                )
            },
        )
        log.info(
            "Audit %s analysed · %d recommendation(s)",
            submission["id"],
            len(titles),
        )
    except Exception as exc:
        log.exception("AI analysis failed for audit %s: %s", submission["id"], exc)


__all__ = ["audit_public_router", "audit_admin_router"]
