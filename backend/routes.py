"""Routes module: importable APIRouters wired in server.py."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from ai_prompts import (
    fallback_routine,
    generate_content_post,
    generate_discovery_brief,
    generate_outreach_openers,
    generate_routine,
)
from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from db_utils import prepare_for_mongo, serialize_doc
from emailit_client import EmailitClient, EmailitError
from models import (
    AuthorityMetric,
    AuthorityMetricUpdate,
    Block,
    CaseStudy,
    CaseStudyCreate,
    CaseStudyUpdate,
    ChecklistItem,
    ContentPiece,
    ContentPieceCreate,
    ContentPieceUpdate,
    ContentPromptRequest,
    DailyMetric,
    DailyMetricUpdate,
    DiscoveryPromptRequest,
    LoginRequest,
    LoginResponse,
    OutreachPromptRequest,
    Prospect,
    ProspectCreate,
    ProspectUpdate,
    Routine,
    RoutineGenerateRequest,
    Settings,
    SettingsUpdate,
    Testimonial,
    TestimonialCreate,
    TestimonialRequestSend,
    TestimonialUpdate,
    ThoughtLeadership,
    ThoughtLeadershipCreate,
    ThoughtLeadershipUpdate,
    UpdateChecklistItem,
    User,
)
from openrouter_client import OpenRouterClient, OpenRouterError

log = logging.getLogger("routes")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today_str() -> str:
    return _now().strftime("%Y-%m-%d")


def _yesterday_str() -> str:
    return (_now() - timedelta(days=1)).strftime("%Y-%m-%d")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_or_client(request: Request) -> OpenRouterClient:
    return request.app.state.openrouter


def get_emailit(request: Request) -> EmailitClient:
    return request.app.state.emailit


# ============================================================
# SEED HELPERS
# ============================================================
async def ensure_seed_user(db: AsyncIOMotorDatabase) -> None:
    email = os.environ.get("FOUNDER_EMAIL", "founder@thesalvador.group")
    password = os.environ.get("FOUNDER_PASSWORD", "admin123")
    name = os.environ.get("FOUNDER_NAME", "Ryan Salvador")
    existing = await db.users.find_one({"email": email})
    user = User(
        email=email, name=name, role="founder", password_hash=hash_password(password)
    )
    if existing:
        # Always ensure password works for our seed user. If hash differs, update
        # in place (idempotent recovery). Other fields kept.
        if not verify_password(password, existing.get("password_hash", "")):
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"password_hash": user.password_hash, "name": name}},
            )
            log.info("Refreshed founder password hash")
        return
    await db.users.insert_one(user.model_dump())
    log.info("Seeded founder user %s", email)


async def ensure_settings(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    doc = await db.settings.find_one({"id": "singleton"}, {"_id": 0})
    if doc:
        return doc
    s = Settings().model_dump()
    s = prepare_for_mongo(s)
    await db.settings.insert_one(s)
    return s


async def ensure_authority_metric(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    doc = await db.authority_metrics.find_one({"id": "singleton"}, {"_id": 0})
    if doc:
        return doc
    a = AuthorityMetric().model_dump()
    a = prepare_for_mongo(a)
    await db.authority_metrics.insert_one(a)
    return a


# ============================================================
# AUTH ROUTER
# ============================================================
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)) -> LoginResponse:
    user = await db.users.find_one({"email": req.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(
        user["email"],
        extra={"name": user.get("name"), "role": user.get("role", "founder")},
    )
    return LoginResponse(
        access_token=token,
        user={
            "email": user["email"],
            "name": user.get("name"),
            "role": user.get("role", "founder"),
        },
    )


@auth_router.get("/me")
async def me(current=Depends(get_current_user)) -> Dict[str, Any]:
    return current


# ============================================================
# ROUTINE ROUTER
# ============================================================
routine_router = APIRouter(prefix="/routine", tags=["routine"], dependencies=[Depends(get_current_user)])


async def _build_pipeline_summary(db) -> str:
    docs = await db.prospects.find({}, {"_id": 0}).to_list(500)
    if not docs:
        return "No prospects logged yet."
    counts: Dict[str, int] = {}
    revenue = 0.0
    for d in docs:
        counts[d.get("status", "new")] = counts.get(d.get("status", "new"), 0) + 1
        if d.get("status") == "won" and d.get("deal_value"):
            revenue += float(d["deal_value"])
    return (
        f"Prospects total {len(docs)}; statuses {counts}; closed revenue ${revenue:,.0f} "
        f"toward $90K target."
    )


async def _build_yesterday_summary(db) -> str:
    y = _yesterday_str()
    metric = await db.daily_metrics.find_one({"date": y}, {"_id": 0})
    if not metric:
        return "No data for yesterday."
    return (
        f"Yesterday outreach {metric.get('outreach_done',0)}/{metric.get('outreach_target',25)}, "
        f"calls scheduled {metric.get('calls_scheduled',0)}, completed {metric.get('calls_completed',0)}, "
        f"closes {metric.get('closes',0)}, revenue ${metric.get('revenue_generated',0):,.0f}."
    )


async def _build_revenue_context(request: Request) -> str:
    """Revenue context for AI routine prompts.

    The legacy Agency Handy integration was removed in Phase A.
    We now derive context from in-house data: PayPal transactions +
    internal invoices + BreezeDocs proposals. Returns empty string when
    there's nothing useful to inject.
    """
    return ""


async def _generate_and_save_routine(
    db, or_client, *, target_date: str, force: bool, extra_context: str = "",
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    if not force:
        existing = await db.routines.find_one({"date": target_date}, {"_id": 0})
        if existing:
            return existing
    pipeline = await _build_pipeline_summary(db)
    yest = await _build_yesterday_summary(db)
    revenue_ctx = ""
    if request is not None:
        revenue_ctx = await _build_revenue_context(request)
    full_extra = "\n\n".join(filter(None, [extra_context, revenue_ctx]))
    used_ai = True
    try:
        ai_data = await generate_routine(
            or_client,
            target_date=target_date,
            pipeline_summary=pipeline,
            yesterday_summary=yest,
            extra_context=full_extra,
        )
        log.info("Routine generated by AI for %s", target_date)
    except Exception as e:
        log.warning("Routine AI generation failed (%s) — falling back to static.", e)
        ai_data = fallback_routine(target_date)
        ai_data["summary"] = (
            f"AI fallback used (reason: {type(e).__name__}). "
            "Customize blocks as needed or click 'Regenerate' to retry."
        )
        used_ai = False

    blocks_in: List[Dict[str, Any]] = ai_data.get("blocks", [])
    blocks_out: List[Block] = []
    for b in blocks_in:
        cl = b.get("checklist") or []
        if isinstance(cl, list) and cl and isinstance(cl[0], str):
            cl = [ChecklistItem(text=str(t)).model_dump() for t in cl]
        elif isinstance(cl, list) and cl and isinstance(cl[0], dict):
            cl = [ChecklistItem(**c).model_dump() for c in cl]
        else:
            cl = []
        try:
            blocks_out.append(
                Block(
                    start=str(b.get("start", "10:00")),
                    end=str(b.get("end", "11:00")),
                    type=str(b.get("type", "CUSTOM")).upper(),
                    title=str(b.get("title", "Block")),
                    description=b.get("description"),
                    checklist=[ChecklistItem(**c) for c in cl],
                    ai_prompt=b.get("ai_prompt"),
                    estimate_minutes=b.get("estimate_minutes"),
                )
            )
        except Exception as ex:  # pragma: no cover
            log.warning("Skipping bad block payload %s: %s", b, ex)

    routine = Routine(
        date=target_date,
        blocks=blocks_out,
        notes=ai_data.get("summary"),
        generated_by_ai=used_ai,
    )
    payload = prepare_for_mongo(routine.model_dump())
    await db.routines.delete_many({"date": target_date})
    await db.routines.insert_one(payload)
    return payload


@routine_router.post("/generate")
async def generate_today_routine(
    req: RoutineGenerateRequest,
    request: Request,
    db=Depends(get_db),
    or_client=Depends(get_or_client),
):
    target_date = req.date or _today_str()
    return serialize_doc(
        await _generate_and_save_routine(
            db, or_client, target_date=target_date, force=req.force,
            extra_context=req.extra_context or "", request=request,
        )
    )


@routine_router.get("/today")
async def get_today(
    request: Request, db=Depends(get_db), or_client=Depends(get_or_client)
):
    date = _today_str()
    doc = await db.routines.find_one({"date": date}, {"_id": 0})
    if doc:
        return serialize_doc(doc)
    # Auto-generate if missing
    return serialize_doc(
        await _generate_and_save_routine(
            db, or_client, target_date=date, force=False, request=request
        )
    )


@routine_router.get("/by-date/{date_str}")
async def get_by_date(date_str: str, db=Depends(get_db)):
    doc = await db.routines.find_one({"date": date_str}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No routine for that date")
    return serialize_doc(doc)


@routine_router.post("/checklist/toggle")
async def toggle_checklist(req: UpdateChecklistItem, db=Depends(get_db)):
    today = _today_str()
    routine = await db.routines.find_one({"date": today})
    if not routine:
        raise HTTPException(status_code=404, detail="No routine for today")
    changed = False
    for b in routine.get("blocks", []):
        if b.get("id") == req.block_id:
            for c in b.get("checklist", []):
                if c.get("id") == req.item_id:
                    c["done"] = req.done
                    changed = True
                    break
            # Auto-mark block complete if all checklist done
            if b.get("checklist"):
                b["completed"] = all(c.get("done") for c in b["checklist"])
            break
    if not changed:
        raise HTTPException(status_code=404, detail="Block or item not found")
    routine["updated_at"] = _now().isoformat()
    await db.routines.update_one({"_id": routine["_id"]}, {"$set": routine})
    return {"ok": True}


@routine_router.post("/block/{block_id}/complete")
async def complete_block(block_id: str, completed: bool = True, db=Depends(get_db)):
    today = _today_str()
    routine = await db.routines.find_one({"date": today})
    if not routine:
        raise HTTPException(status_code=404, detail="No routine for today")
    for b in routine.get("blocks", []):
        if b.get("id") == block_id:
            b["completed"] = completed
            break
    routine["updated_at"] = _now().isoformat()
    await db.routines.update_one({"_id": routine["_id"]}, {"$set": routine})
    return {"ok": True}


# ============================================================
# AI PROMPT ROUTER
# ============================================================
ai_router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(get_current_user)])


@ai_router.post("/outreach")
async def ai_outreach(
    req: OutreachPromptRequest, or_client=Depends(get_or_client)
) -> Dict[str, Any]:
    try:
        return await generate_outreach_openers(
            or_client,
            niche=req.niche,
            pain_point=req.pain_point,
            angle=req.angle,
            count=req.count,
        )
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")


@ai_router.post("/content")
async def ai_content(
    req: ContentPromptRequest, or_client=Depends(get_or_client)
) -> Dict[str, Any]:
    try:
        return await generate_content_post(
            or_client,
            topic=req.topic,
            type_=req.type,
            format_=req.format,
            length=req.length,
        )
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")


@ai_router.post("/discovery")
async def ai_discovery(
    req: DiscoveryPromptRequest, or_client=Depends(get_or_client)
) -> Dict[str, Any]:
    try:
        return await generate_discovery_brief(
            or_client,
            industry=req.industry,
            pain_point=req.pain_point,
            timeline=req.timeline or "",
            budget=req.budget or "",
        )
    except OpenRouterError as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")


# ============================================================
# PROSPECTS / PIPELINE
# ============================================================
pipeline_router = APIRouter(prefix="/pipeline", tags=["pipeline"], dependencies=[Depends(get_current_user)])


@pipeline_router.get("/prospects")
async def list_prospects(db=Depends(get_db), status: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    docs = await db.prospects.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(d) for d in docs]


@pipeline_router.post("/prospects")
async def create_prospect(req: ProspectCreate, db=Depends(get_db)) -> Dict[str, Any]:
    p = Prospect(**req.model_dump())
    await db.prospects.insert_one(prepare_for_mongo(p.model_dump()))
    return serialize_doc(p.model_dump())


@pipeline_router.patch("/prospects/{prospect_id}")
async def update_prospect(
    prospect_id: str, req: ProspectUpdate, db=Depends(get_db)
) -> Dict[str, Any]:
    update = prepare_for_mongo({k: v for k, v in req.model_dump().items() if v is not None})
    update["updated_at"] = _now().isoformat()
    res = await db.prospects.update_one({"id": prospect_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Prospect not found")
    doc = await db.prospects.find_one({"id": prospect_id}, {"_id": 0})
    return serialize_doc(doc)


@pipeline_router.delete("/prospects/{prospect_id}")
async def delete_prospect(prospect_id: str, db=Depends(get_db)) -> Dict[str, Any]:
    res = await db.prospects.delete_one({"id": prospect_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return {"ok": True}


@pipeline_router.get("/summary")
async def pipeline_summary(db=Depends(get_db)) -> Dict[str, Any]:
    docs = await db.prospects.find({}, {"_id": 0}).to_list(2000)
    statuses = {}
    revenue = 0.0
    pipeline_value = 0.0
    for d in docs:
        statuses[d.get("status", "new")] = statuses.get(d.get("status", "new"), 0) + 1
        if d.get("status") == "won" and d.get("deal_value"):
            revenue += float(d["deal_value"])
        elif d.get("deal_value"):
            pipeline_value += float(d["deal_value"])
    target = float(os.environ.get("REVENUE_TARGET", "90000"))
    return {
        "total_prospects": len(docs),
        "by_status": statuses,
        "closed_revenue": revenue,
        "pipeline_value": pipeline_value,
        "target": target,
        "progress_pct": round((revenue / target) * 100, 1) if target else 0,
    }


# ============================================================
# Phase G — Breakcold-style Kanban board + activity stream
# ============================================================
PIPELINE_STAGES = ("new", "contacted", "qualified", "proposal", "won", "lost")


@pipeline_router.get("/board")
async def pipeline_board(db=Depends(get_db)) -> Dict[str, Any]:
    """Kanban-grouped view of all prospects. One source of truth for the new admin UI."""
    docs = await db.prospects.find({}, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    columns: Dict[str, List[Dict[str, Any]]] = {s: [] for s in PIPELINE_STAGES}
    revenue = 0.0
    open_value = 0.0
    for d in docs:
        s = d.get("status") if d.get("status") in PIPELINE_STAGES else "new"
        columns[s].append(serialize_doc(d))
        if s == "won" and d.get("deal_value"):
            revenue += float(d["deal_value"])
        elif s not in ("won", "lost") and d.get("deal_value"):
            open_value += float(d["deal_value"])
    return {
        "stages": list(PIPELINE_STAGES),
        "columns": columns,
        "totals": {
            "prospects": len(docs),
            "closed_revenue": round(revenue, 2),
            "open_value": round(open_value, 2),
            "by_stage": {s: len(columns[s]) for s in PIPELINE_STAGES},
        },
    }


class StageMoveRequest(BaseModel):
    status: str


@pipeline_router.post("/prospects/{prospect_id}/move")
async def move_prospect(
    prospect_id: str,
    req: StageMoveRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    """Drag-and-drop transition. Logs an activity event."""
    if req.status not in PIPELINE_STAGES:
        raise HTTPException(400, f"status must be one of {PIPELINE_STAGES}")
    prospect = await db.prospects.find_one({"id": prospect_id}, {"_id": 0})
    if not prospect:
        raise HTTPException(404, "Prospect not found")
    if prospect.get("status") == req.status:
        return serialize_doc(prospect)  # no-op
    await db.prospects.update_one(
        {"id": prospect_id},
        {
            "$set": {
                "status": req.status,
                "updated_at": _now().isoformat(),
                "last_activity_at": _now().isoformat(),
            }
        },
    )
    await db.pipeline_activity.insert_one(
        prepare_for_mongo(
            {
                "id": str(uuid.uuid4()),
                "prospect_id": prospect_id,
                "type": "stage.changed",
                "from": prospect.get("status"),
                "to": req.status,
                "actor": (user.get("email") if isinstance(user, dict) else None),
                "created_at": _now().isoformat(),
            }
        )
    )
    fresh = await db.prospects.find_one({"id": prospect_id}, {"_id": 0})
    return serialize_doc(fresh)


class ActivityNoteRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    type: str = "note"  # note | call | email | linkedin_dm | meeting


@pipeline_router.post("/prospects/{prospect_id}/activity")
async def add_activity(
    prospect_id: str,
    req: ActivityNoteRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
) -> Dict[str, Any]:
    prospect = await db.prospects.find_one({"id": prospect_id}, {"_id": 0})
    if not prospect:
        raise HTTPException(404, "Prospect not found")
    doc = {
        "id": str(uuid.uuid4()),
        "prospect_id": prospect_id,
        "type": req.type,
        "body": req.body.strip(),
        "actor": (user.get("email") if isinstance(user, dict) else None),
        "created_at": _now().isoformat(),
    }
    await db.pipeline_activity.insert_one(prepare_for_mongo(doc))
    await db.prospects.update_one(
        {"id": prospect_id},
        {"$set": {"last_activity_at": doc["created_at"], "updated_at": doc["created_at"]}},
    )
    return doc


@pipeline_router.get("/prospects/{prospect_id}/activity")
async def list_activity(
    prospect_id: str, db=Depends(get_db)
) -> List[Dict[str, Any]]:
    prospect = await db.prospects.find_one({"id": prospect_id}, {"_id": 0, "id": 1})
    if not prospect:
        raise HTTPException(404, "Prospect not found")
    rows = await db.pipeline_activity.find(
        {"prospect_id": prospect_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return rows


@pipeline_router.get("/prospects/{prospect_id}/ai-suggestion")
async def ai_next_action(
    prospect_id: str,
    request: Request,
    db=Depends(get_db),
) -> Dict[str, Any]:
    """Single AI-suggested next action for a prospect — uses the existing
    OpenRouter client + emergent LLM key. Falls back to a deterministic
    suggestion when the LLM is unreachable so the UI always has something."""
    prospect = await db.prospects.find_one({"id": prospect_id}, {"_id": 0})
    if not prospect:
        raise HTTPException(404, "Prospect not found")
    recent = (
        await db.pipeline_activity.find(
            {"prospect_id": prospect_id}, {"_id": 0, "type": 1, "body": 1, "created_at": 1}
        )
        .sort("created_at", -1)
        .limit(5)
        .to_list(5)
    )
    activity_block = "\n".join(
        f"- [{a.get('type')}] {a.get('body','')[:200]}" for a in recent
    ) or "(no logged activity yet)"
    prompt = (
        "You are a B2B sales coach. Suggest ONE concrete next action (≤22 words, action verb first) "
        "for this prospect. Output ONLY the action, no preamble.\n\n"
        f"Name: {prospect.get('name')}\n"
        f"Company: {prospect.get('company') or '—'}\n"
        f"Stage: {prospect.get('status')}\n"
        f"Deal value: ${prospect.get('deal_value') or 'unknown'}\n"
        f"Notes: {(prospect.get('notes') or '')[:400]}\n"
        f"Recent activity:\n{activity_block}\n\n"
        "Suggested next action:"
    )
    # Stage-aware deterministic fallback so the UI never shows "—".
    fallbacks = {
        "new": "Send a 90-second intro Loom outlining how Bloom solves their #1 pain.",
        "contacted": "DM on LinkedIn referencing their most recent post, then book a 15-min slot.",
        "qualified": "Schedule a 30-min discovery call this week and pre-share the agenda.",
        "proposal": "Send a follow-up checking what's missing from the proposal to close it.",
        "won": "Kick off onboarding — share the welcome packet and lock in the design call.",
        "lost": "Send a respectful 'door-open' note plus an asset they'd find useful.",
    }
    fallback = fallbacks.get(prospect.get("status", "new"), fallbacks["new"])
    try:
        openrouter = getattr(request.app.state, "openrouter", None)
        if openrouter is not None:
            res = await openrouter.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.6,
                max_tokens=80,
            )
            text = (res or "").strip().split("\n")[0]
            if text:
                return {"action": text[:240], "source": "ai"}
    except Exception as exc:  # pragma: no cover
        log.warning("AI next-action failed: %s", exc)
    return {"action": fallback, "source": "fallback"}


# ============================================================
# DAILY METRICS
# ============================================================
metrics_router = APIRouter(prefix="/metrics", tags=["metrics"], dependencies=[Depends(get_current_user)])


@metrics_router.get("/today")
async def get_today_metric(db=Depends(get_db)) -> Dict[str, Any]:
    date = _today_str()
    doc = await db.daily_metrics.find_one({"date": date}, {"_id": 0})
    if doc:
        return serialize_doc(doc)
    m = DailyMetric(date=date)
    await db.daily_metrics.insert_one(prepare_for_mongo(m.model_dump()))
    return serialize_doc(m.model_dump())


@metrics_router.patch("/today")
async def update_today_metric(req: DailyMetricUpdate, db=Depends(get_db)) -> Dict[str, Any]:
    date = _today_str()
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    update = prepare_for_mongo(update)
    await db.daily_metrics.update_one({"date": date}, {"$set": update}, upsert=True)
    doc = await db.daily_metrics.find_one({"date": date}, {"_id": 0})
    return serialize_doc(doc)


@metrics_router.get("/week")
async def get_week_metrics(db=Depends(get_db)) -> Dict[str, Any]:
    start = (_now() - timedelta(days=6)).strftime("%Y-%m-%d")
    docs = await db.daily_metrics.find({"date": {"$gte": start}}, {"_id": 0}).sort("date", 1).to_list(20)
    docs = [serialize_doc(d) for d in docs]
    total_outreach = sum(d.get("outreach_done", 0) for d in docs)
    total_calls_completed = sum(d.get("calls_completed", 0) for d in docs)
    total_closes = sum(d.get("closes", 0) for d in docs)
    total_revenue = sum(d.get("revenue_generated", 0.0) for d in docs)
    total_content = sum(d.get("content_pieces_published", 0) for d in docs)
    return {
        "days": docs,
        "totals": {
            "outreach": total_outreach,
            "calls_completed": total_calls_completed,
            "closes": total_closes,
            "revenue": total_revenue,
            "content_pieces": total_content,
        },
    }


# ============================================================
# CONTENT PIECES
# ============================================================
content_router = APIRouter(prefix="/content", tags=["content"], dependencies=[Depends(get_current_user)])


@content_router.get("")
async def list_content(
    db=Depends(get_db),
    status: Optional[str] = None,
    type_: Optional[str] = None,
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    if type_:
        q["type"] = type_
    docs = await db.content_pieces.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(d) for d in docs]


@content_router.post("")
async def create_content(req: ContentPieceCreate, db=Depends(get_db)) -> Dict[str, Any]:
    cp = ContentPiece(**req.model_dump())
    await db.content_pieces.insert_one(prepare_for_mongo(cp.model_dump()))
    return serialize_doc(cp.model_dump())


@content_router.patch("/{content_id}")
async def update_content(
    content_id: str, req: ContentPieceUpdate, db=Depends(get_db)
) -> Dict[str, Any]:
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    update = prepare_for_mongo(update)
    res = await db.content_pieces.update_one({"id": content_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Content not found")
    doc = await db.content_pieces.find_one({"id": content_id}, {"_id": 0})
    return serialize_doc(doc)


@content_router.delete("/{content_id}")
async def delete_content(content_id: str, db=Depends(get_db)) -> Dict[str, Any]:
    res = await db.content_pieces.delete_one({"id": content_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Content not found")
    return {"ok": True}


@content_router.get("/themes/performance")
async def themes_performance(db=Depends(get_db)) -> List[Dict[str, Any]]:
    docs = await db.content_pieces.find({}, {"_id": 0}).to_list(2000)
    by_type: Dict[str, Dict[str, Any]] = {}
    for d in docs:
        t = d.get("type", "other")
        e = d.get("engagement", {}) or {}
        engagement = (
            float(e.get("impressions", 0))
            + 5 * float(e.get("clicks", 0))
            + 8 * float(e.get("comments", 0))
            + 6 * float(e.get("shares", 0))
            + 10 * float(e.get("saves", 0))
        )
        if t not in by_type:
            by_type[t] = {"type": t, "count": 0, "engagement_score": 0.0}
        by_type[t]["count"] += 1
        by_type[t]["engagement_score"] += engagement
    out = []
    for t, v in by_type.items():
        v["avg_engagement"] = round(v["engagement_score"] / v["count"], 1) if v["count"] else 0
        out.append(v)
    out.sort(key=lambda x: x["avg_engagement"], reverse=True)
    return out


# ============================================================
# CASE STUDIES
# ============================================================
casestudy_router = APIRouter(prefix="/case-studies", tags=["case-studies"], dependencies=[Depends(get_current_user)])


@casestudy_router.get("")
async def list_case_studies(db=Depends(get_db)) -> List[Dict[str, Any]]:
    docs = await db.case_studies.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [serialize_doc(d) for d in docs]


@casestudy_router.post("")
async def create_case_study(req: CaseStudyCreate, db=Depends(get_db)) -> Dict[str, Any]:
    cs = CaseStudy(**req.model_dump())
    await db.case_studies.insert_one(prepare_for_mongo(cs.model_dump()))
    return serialize_doc(cs.model_dump())


@casestudy_router.patch("/{cs_id}")
async def update_case_study(
    cs_id: str, req: CaseStudyUpdate, db=Depends(get_db)
) -> Dict[str, Any]:
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    update = prepare_for_mongo(update)
    res = await db.case_studies.update_one({"id": cs_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Case study not found")
    doc = await db.case_studies.find_one({"id": cs_id}, {"_id": 0})
    return serialize_doc(doc)


@casestudy_router.delete("/{cs_id}")
async def delete_case_study(cs_id: str, db=Depends(get_db)) -> Dict[str, Any]:
    res = await db.case_studies.delete_one({"id": cs_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Case study not found")
    return {"ok": True}


# ============================================================
# TESTIMONIALS
# ============================================================
testimonial_router = APIRouter(prefix="/testimonials", tags=["testimonials"], dependencies=[Depends(get_current_user)])


@testimonial_router.get("")
async def list_testimonials(db=Depends(get_db)) -> List[Dict[str, Any]]:
    docs = await db.testimonials.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(d) for d in docs]


@testimonial_router.post("")
async def create_testimonial(req: TestimonialCreate, db=Depends(get_db)) -> Dict[str, Any]:
    t = Testimonial(**req.model_dump())
    await db.testimonials.insert_one(prepare_for_mongo(t.model_dump()))
    return serialize_doc(t.model_dump())


@testimonial_router.patch("/{t_id}")
async def update_testimonial(
    t_id: str, req: TestimonialUpdate, db=Depends(get_db)
) -> Dict[str, Any]:
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    update = prepare_for_mongo(update)
    res = await db.testimonials.update_one({"id": t_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    doc = await db.testimonials.find_one({"id": t_id}, {"_id": 0})
    return serialize_doc(doc)


@testimonial_router.delete("/{t_id}")
async def delete_testimonial(t_id: str, db=Depends(get_db)) -> Dict[str, Any]:
    res = await db.testimonials.delete_one({"id": t_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    return {"ok": True}


@testimonial_router.post("/send-request")
async def send_testimonial_request(
    req: TestimonialRequestSend,
    db=Depends(get_db),
    emailit=Depends(get_emailit),
) -> Dict[str, Any]:
    """Send a testimonial request email via Emailit.
    Requires the testimonial record (or inline client_email/name)."""
    target_email = req.client_email
    target_name = req.client_name or "there"
    project = req.project or ""
    testimonial_id = req.testimonial_id
    if testimonial_id:
        t = await db.testimonials.find_one({"id": testimonial_id})
        if not t:
            raise HTTPException(status_code=404, detail="Testimonial not found")
        target_email = target_email or t.get("client_email")
        target_name = req.client_name or t.get("client_name") or target_name
        project = project or t.get("project") or ""
    if not target_email:
        raise HTTPException(status_code=400, detail="Recipient email required")

    body_text = req.custom_message or (
        f"Hi {target_name},\n\nI hope you're enjoying {project or 'the system we built together'}. "
        "If you have a moment, I'd love a short testimonial about our work — even 1-2 sentences "
        "would mean a lot. A quick 30-second video would be amazing too. "
        "Reply to this email or send anything you can, and let me know if I can feature it.\n\n"
        "Thank you so much,\nRyan @ Bloom Labs"
    )
    html = (
        f"<p>Hi {target_name},</p>"
        f"<p>I hope you're enjoying <b>{project or 'the system we built together'}</b>. "
        "If you have a moment, I'd love a short testimonial about our work — even 1–2 sentences "
        "would mean a lot. A quick 30-second video would be amazing too.</p>"
        "<p>Reply to this email with anything you can, and let me know if I can feature it on "
        "<a href='https://bybloomlabs.com'>bybloomlabs.com</a>.</p>"
        "<p>Thank you so much,<br/>Ryan @ Bloom Labs</p>"
    )
    try:
        result = await emailit.send_email(
            to=target_email,
            subject=f"Quick favor — testimonial for Bloom Labs?",
            html=html,
            text=body_text,
        )
        # Mark testimonial request_sent_at
        if testimonial_id:
            await db.testimonials.update_one(
                {"id": testimonial_id},
                {
                    "$set": {
                        "request_sent_at": _now().isoformat(),
                        "status": "requested",
                        "updated_at": _now().isoformat(),
                    }
                },
            )
        return {"ok": True, "emailit": result}
    except EmailitError as e:
        log.warning("Emailit send failed: %s", e)
        return {
            "ok": False,
            "emailit_status": e.status_code,
            "emailit_body": e.body,
            "hint": (
                "If you see 'Domain not verified', add the SPF/DKIM DNS records "
                "shown in your Emailit dashboard for bybloomlabs.com. The integration "
                "will start working automatically once DNS is verified."
            ),
        }


# ============================================================
# THOUGHT LEADERSHIP
# ============================================================
tl_router = APIRouter(prefix="/thought-leadership", tags=["thought-leadership"], dependencies=[Depends(get_current_user)])


@tl_router.get("")
async def list_tl(db=Depends(get_db)) -> List[Dict[str, Any]]:
    docs = await db.thought_leadership.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(d) for d in docs]


@tl_router.post("")
async def create_tl(req: ThoughtLeadershipCreate, db=Depends(get_db)) -> Dict[str, Any]:
    item = ThoughtLeadership(**req.model_dump())
    await db.thought_leadership.insert_one(prepare_for_mongo(item.model_dump()))
    return serialize_doc(item.model_dump())


@tl_router.patch("/{item_id}")
async def update_tl(
    item_id: str, req: ThoughtLeadershipUpdate, db=Depends(get_db)
) -> Dict[str, Any]:
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    update = prepare_for_mongo(update)
    res = await db.thought_leadership.update_one({"id": item_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    doc = await db.thought_leadership.find_one({"id": item_id}, {"_id": 0})
    return serialize_doc(doc)


@tl_router.delete("/{item_id}")
async def delete_tl(item_id: str, db=Depends(get_db)) -> Dict[str, Any]:
    res = await db.thought_leadership.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# ============================================================
# AUTHORITY METRICS
# ============================================================
authority_router = APIRouter(prefix="/authority", tags=["authority"], dependencies=[Depends(get_current_user)])


@authority_router.get("")
async def get_authority(db=Depends(get_db)) -> Dict[str, Any]:
    return serialize_doc(await ensure_authority_metric(db))


@authority_router.patch("")
async def update_authority(req: AuthorityMetricUpdate, db=Depends(get_db)) -> Dict[str, Any]:
    await ensure_authority_metric(db)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    update = prepare_for_mongo(update)
    # also append history snapshot
    snapshot = {
        "at": _now().isoformat(),
        "data": update,
    }
    await db.authority_metrics.update_one(
        {"id": "singleton"},
        {"$set": update, "$push": {"history": snapshot}},
    )
    doc = await db.authority_metrics.find_one({"id": "singleton"}, {"_id": 0})
    return serialize_doc(doc)


@authority_router.get("/score")
async def authority_score(db=Depends(get_db)) -> Dict[str, Any]:
    a = await ensure_authority_metric(db)
    cs_count = await db.case_studies.count_documents({})
    t_count = await db.testimonials.count_documents({"status": {"$in": ["received", "featured"]}})
    tl_count = await db.thought_leadership.count_documents({})
    fl = a.get("linkedin_followers", 0)
    eng = a.get("linkedin_engagement_rate", 0.0)
    visitors = a.get("monthly_website_visitors", 0)

    # Simple weighted scoring
    score = (
        min(cs_count, 10) * 8
        + min(t_count, 10) * 6
        + min(tl_count, 20) * 3
        + min(fl // 100, 10) * 4
        + min(int(eng * 100), 30)
        + min(visitors // 500, 10) * 2
    )
    score = min(score, 100)
    milestones = {
        "linkedin_followers_100": fl >= 100,
        "case_studies_3": cs_count >= 3,
        "testimonials_5": t_count >= 5,
        "thought_leadership_10": tl_count >= 10,
        "speaking_2": (await db.thought_leadership.count_documents({"type": "speaking"})) >= 2,
        "guest_post_1": (await db.thought_leadership.count_documents({"type": "guest_post"})) >= 1,
    }
    return {
        "score": score,
        "max_score": 100,
        "breakdown": {
            "case_studies": cs_count,
            "testimonials": t_count,
            "thought_leadership": tl_count,
            "linkedin_followers": fl,
            "linkedin_engagement_rate": eng,
            "monthly_website_visitors": visitors,
        },
        "milestones": milestones,
    }


@authority_router.get("/positioning-check")
async def positioning_check(db=Depends(get_db)) -> Dict[str, Any]:
    """Quick checklist for AI-native positioning consistency."""
    cs_docs = await db.case_studies.find({}, {"_id": 0}).to_list(500)
    cp_docs = await db.content_pieces.find({}, {"_id": 0}).to_list(500)
    cs_with_ai_native = sum(
        1 for d in cs_docs if "ai-native" in (d.get("solution", "") + d.get("challenge", "")).lower()
    )
    cp_with_ai_native = sum(
        1 for d in cp_docs if "ai-native" in (d.get("body", "") + d.get("title", "")).lower()
    )
    return {
        "checklist": {
            "website_mentions_ai_native": True,  # landing page contains it
            "case_studies_mention_ai_native": cs_with_ai_native > 0,
            "posts_mention_ai_native": cp_with_ai_native > 0,
            "linkedin_headline_ai_native": False,  # manual flag
            "sales_script_ai_native": False,  # manual flag
            "email_signature_ai_native": False,  # manual flag
        },
        "counts": {
            "case_studies_total": len(cs_docs),
            "case_studies_with_ai_native": cs_with_ai_native,
            "posts_total": len(cp_docs),
            "posts_with_ai_native": cp_with_ai_native,
        },
        "recommendation": (
            "Aim for 'AI-native' to appear in at least 70% of case studies and 50% of posts to "
            "reinforce positioning across all channels."
        ),
    }


# ============================================================
# SETTINGS
# ============================================================
settings_router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(get_current_user)])


@settings_router.get("")
async def get_settings(db=Depends(get_db)) -> Dict[str, Any]:
    return serialize_doc(await ensure_settings(db))


@settings_router.patch("")
async def update_settings(req: SettingsUpdate, db=Depends(get_db)) -> Dict[str, Any]:
    await ensure_settings(db)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    update = prepare_for_mongo(update)
    await db.settings.update_one({"id": "singleton"}, {"$set": update})
    return serialize_doc(await db.settings.find_one({"id": "singleton"}, {"_id": 0}))


# ============================================================
# DASHBOARD AGGREGATE
# ============================================================
dashboard_router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


@dashboard_router.get("/home")
async def dashboard_home(request: Request, db=Depends(get_db), or_client=Depends(get_or_client)) -> Dict[str, Any]:
    today = _today_str()
    routine = await db.routines.find_one({"date": today}, {"_id": 0})
    if not routine:
        routine = await _generate_and_save_routine(
            db, or_client, target_date=today, force=False, request=request
        )

    metric = await db.daily_metrics.find_one({"date": today}, {"_id": 0})
    if not metric:
        m = DailyMetric(date=today)
        await db.daily_metrics.insert_one(prepare_for_mongo(m.model_dump()))
        metric = m.model_dump()

    # Pipeline summary
    prospects = await db.prospects.find({}, {"_id": 0}).to_list(2000)
    statuses = {}
    revenue = 0.0
    pipeline_value = 0.0
    for d in prospects:
        statuses[d.get("status", "new")] = statuses.get(d.get("status", "new"), 0) + 1
        if d.get("status") == "won" and d.get("deal_value"):
            revenue += float(d["deal_value"])
        elif d.get("deal_value"):
            pipeline_value += float(d["deal_value"])
    target = float(os.environ.get("REVENUE_TARGET", "90000"))

    # Upcoming calls today (prospects with next_action_at today)
    upcoming_calls: List[Dict[str, Any]] = []
    for p in prospects:
        nat = p.get("next_action_at")
        if isinstance(nat, str) and nat.startswith(today):
            upcoming_calls.append(p)
    upcoming_calls.sort(key=lambda x: x.get("next_action_at", ""))

    cs_count = await db.case_studies.count_documents({})
    t_count = await db.testimonials.count_documents({"status": {"$in": ["received", "featured"]}})

    # On track / behind logic
    days_into_year = (_now() - datetime(_now().year, 1, 1, tzinfo=timezone.utc)).days + 1
    expected = (days_into_year / 365.0) * target
    if revenue >= expected:
        track_status = "ahead"
    elif revenue >= expected * 0.8:
        track_status = "on_track"
    else:
        track_status = "behind"

    return {
        "date": today,
        "routine": serialize_doc(routine),
        "metric": serialize_doc(metric),
        "pipeline": {
            "by_status": statuses,
            "closed_revenue": revenue,
            "pipeline_value": pipeline_value,
            "target": target,
            "progress_pct": round((revenue / target) * 100, 1) if target else 0,
            "track_status": track_status,
        },
        "upcoming_calls": [serialize_doc(c) for c in upcoming_calls],
        "credibility": {
            "case_studies": cs_count,
            "testimonials": t_count,
        },
    }
