"""Lead magnets — public opt-in + admin CRUD + drip email scheduler.

Flow:
  • Marketer creates a LeadMagnet (title, asset_url, drip sequence).
  • Blog post pages embed `<LeadMagnetForm magnet_slug=… />` (auto-discovers by placement).
  • Visitor submits → POST /api/leads/subscribe → idempotent insert into `leads`
    + immediate step 0 email via Emailit (if configured) + schedule next steps.
  • APScheduler tick (hourly) walks `leads` where `next_send_at <= now` and sends.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from models import (
    Lead,
    LeadMagnet,
    LeadMagnetCreate,
    LeadMagnetUpdate,
    LeadOptInRequest,
)

log = logging.getLogger("leads")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _render_html(subject: str, body_md: str, unsubscribe_url: str) -> str:
    """Render a simple branded HTML wrapper. body_md is plain markdown that we
    line-break for now (keep it dependency-free)."""
    safe = (
        body_md.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
    )
    return f"""
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif; color:#0F172A; background:#F8FAFC; padding:32px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <h1 style="margin:0 0 16px; font-size:22px; color:#1E3A8A;">{subject}</h1>
    <div style="line-height:1.7; color:#334155; font-size:15px;">{safe}</div>
    <hr style="margin:32px 0; border:none; border-top:1px solid #E2E8F0;" />
    <p style="color:#94A3B8; font-size:12px;">
      You're receiving this because you subscribed at bybloomlabs.com.<br/>
      <a href="{unsubscribe_url}" style="color:#94A3B8;">Unsubscribe</a>
    </p>
  </div>
</body></html>"""


async def _send_step(
    app,
    db: AsyncIOMotorDatabase,
    lead: Dict[str, Any],
    magnet: Dict[str, Any],
    step_idx: int,
) -> bool:
    """Send a single drip step. Returns True on success, False otherwise."""
    steps = magnet.get("sequence_steps", []) or []
    if step_idx >= len(steps):
        return False
    step = steps[step_idx]
    subject = step.get("subject") or f"From {magnet.get('title', 'Bloom Labs')}"
    body = step.get("body_markdown", "")
    # personalize {name} {magnet_title} {asset_url}
    body = (
        body.replace("{name}", lead.get("name") or lead["email"].split("@")[0])
        .replace("{magnet_title}", magnet.get("title", ""))
        .replace("{asset_url}", magnet.get("asset_url") or "https://bybloomlabs.com")
    )
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    unsubscribe_url = f"{base}/leads/unsubscribe?id={lead['id']}"
    html = _render_html(subject, body, unsubscribe_url)
    ok = False
    try:
        emailit = app.state.emailit
        if emailit.is_configured:
            res = await emailit.send_email(
                to=lead["email"], subject=subject, html=html, text=body
            )
            ok = bool(res and res.get("ok"))
        else:
            log.warning("Emailit not configured — skipping drip step")
    except Exception as exc:
        log.warning("Drip send failed: %s", exc)
    sent_entry = {
        "step_idx": step_idx,
        "subject": subject,
        "sent_at": _now().isoformat(),
        "ok": ok,
    }
    await db.leads.update_one(
        {"id": lead["id"]}, {"$push": {"sent_log": sent_entry}}
    )
    return ok


async def _advance_lead_schedule(
    db: AsyncIOMotorDatabase, lead: Dict[str, Any], magnet: Dict[str, Any], from_idx: int
) -> None:
    """After sending step `from_idx`, schedule next step or mark complete."""
    steps = magnet.get("sequence_steps", []) or []
    next_idx = from_idx + 1
    if next_idx >= len(steps):
        await db.leads.update_one(
            {"id": lead["id"]},
            {
                "$set": {
                    "completed_sequence": True,
                    "next_step_idx": next_idx,
                    "next_send_at": None,
                }
            },
        )
        return
    next_offset = int(steps[next_idx].get("day_offset", 1))
    # Schedule relative to "now" (sender side) — simpler than start_date arithmetic
    next_send = _now() + timedelta(days=next_offset)
    await db.leads.update_one(
        {"id": lead["id"]},
        {"$set": {"next_step_idx": next_idx, "next_send_at": next_send.isoformat()}},
    )


async def drip_tick(db: AsyncIOMotorDatabase, app) -> Dict[str, int]:
    """APScheduler tick — send all due steps."""
    now = _now()
    cursor = db.leads.find(
        {
            "completed_sequence": False,
            "unsubscribed": False,
            "next_send_at": {"$lte": now.isoformat()},
        },
        {"_id": 0},
    )
    sent = 0
    failed = 0
    async for lead in cursor:
        magnet = await db.lead_magnets.find_one(
            {"id": lead["magnet_id"]}, {"_id": 0}
        )
        if not magnet:
            await db.leads.update_one(
                {"id": lead["id"]}, {"$set": {"completed_sequence": True}}
            )
            continue
        idx = int(lead.get("next_step_idx", 0))
        ok = await _send_step(app, db, lead, magnet, idx)
        if ok:
            sent += 1
        else:
            failed += 1
        await _advance_lead_schedule(db, lead, magnet, idx)
    return {"sent": sent, "failed": failed}


# ============================================================
# PUBLIC: opt-in + unsubscribe
# ============================================================
leads_public_router = APIRouter(prefix="/leads", tags=["leads-public"])


@leads_public_router.get("/magnet/{slug}")
async def public_get_magnet(slug: str, db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    """Used by the inline form to fetch CTA text + active state."""
    doc = await db.lead_magnets.find_one(
        {"slug": slug, "active": True}, {"_id": 0, "sequence_steps": 0}
    )
    if not doc:
        raise HTTPException(404, "Lead magnet not found or inactive")
    return serialize_doc(doc)


@leads_public_router.get("/active")
async def public_list_active(db: AsyncIOMotorDatabase = Depends(get_db)) -> List[Dict[str, Any]]:
    """List all active magnets (for frontend to find a fallback)."""
    docs = await db.lead_magnets.find(
        {"active": True}, {"_id": 0, "sequence_steps": 0}
    ).to_list(50)
    return [serialize_doc(d) for d in docs]


@leads_public_router.post("/subscribe")
async def public_subscribe(
    req: LeadOptInRequest, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    magnet = await db.lead_magnets.find_one(
        {"slug": req.magnet_slug, "active": True}, {"_id": 0}
    )
    if not magnet:
        raise HTTPException(404, "Lead magnet not found or inactive")
    email_lc = req.email.lower().strip()
    # Idempotent: if email+magnet combo exists, return that
    existing = await db.leads.find_one(
        {"email": email_lc, "magnet_id": magnet["id"]}, {"_id": 0}
    )
    if existing:
        return {"ok": True, "already_subscribed": True, "lead_id": existing["id"]}
    lead = Lead(
        email=email_lc,
        name=req.name,
        magnet_id=magnet["id"],
        magnet_slug=magnet["slug"],
        source_url=req.source_url,
        utm=req.utm or {},
        next_step_idx=0,
        next_send_at=_now().isoformat(),
    )
    await db.leads.insert_one(prepare_for_mongo(lead.model_dump()))
    await db.lead_magnets.update_one(
        {"id": magnet["id"]}, {"$inc": {"leads_count": 1}}
    )
    # Send step 0 immediately
    lead_dict = lead.model_dump()
    if magnet.get("sequence_steps"):
        await _send_step(request.app, db, lead_dict, magnet, 0)
        await _advance_lead_schedule(db, lead_dict, magnet, 0)
    # Notify admin
    try:
        from models import NotificationItem
        n = NotificationItem(
            kind="lead",
            title=f"New lead: {email_lc}",
            body=f"Magnet: {magnet.get('title')} (from {req.source_url or 'unknown'})",
            link="/admin/lead-magnets",
        )
        await db.notifications.insert_one(prepare_for_mongo(n.model_dump()))
    except Exception:
        pass
    return {"ok": True, "lead_id": lead.id, "asset_url": magnet.get("asset_url")}


@leads_public_router.get("/unsubscribe")
async def public_unsubscribe(id: str, db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    res = await db.leads.update_one(
        {"id": id}, {"$set": {"unsubscribed": True, "unsubscribed_at": _now().isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Lead not found")
    return {"ok": True}


# ============================================================
# ADMIN: CRUD lead magnets + leads view
# ============================================================
leads_admin_router = APIRouter(
    prefix="/admin",
    tags=["leads-admin"],
    dependencies=[Depends(get_current_user)],
)


@leads_admin_router.get("/lead-magnets")
async def admin_list_magnets(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = await db.lead_magnets.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [serialize_doc(d) for d in docs]


@leads_admin_router.post("/lead-magnets")
async def admin_create_magnet(
    req: LeadMagnetCreate, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    if await db.lead_magnets.find_one({"slug": req.slug}):
        raise HTTPException(409, "Slug already used")
    magnet = LeadMagnet(**req.model_dump())
    await db.lead_magnets.insert_one(prepare_for_mongo(magnet.model_dump()))
    return serialize_doc(magnet.model_dump())


@leads_admin_router.patch("/lead-magnets/{magnet_id}")
async def admin_update_magnet(
    magnet_id: str, req: LeadMagnetUpdate, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = _now().isoformat()
    if "slug" in update:
        clash = await db.lead_magnets.find_one(
            {"slug": update["slug"], "id": {"$ne": magnet_id}}
        )
        if clash:
            raise HTTPException(409, "Slug already used")
    res = await db.lead_magnets.update_one(
        {"id": magnet_id}, {"$set": prepare_for_mongo(update)}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    fresh = await db.lead_magnets.find_one({"id": magnet_id}, {"_id": 0})
    return serialize_doc(fresh)


@leads_admin_router.delete("/lead-magnets/{magnet_id}")
async def admin_delete_magnet(
    magnet_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    res = await db.lead_magnets.delete_one({"id": magnet_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@leads_admin_router.get("/leads")
async def admin_list_leads(
    db: AsyncIOMotorDatabase = Depends(get_db),
    magnet_id: Optional[str] = None,
    magnet_slug: Optional[str] = None,
    source_contains: Optional[str] = None,
    status: Optional[str] = None,
    score_min: Optional[int] = None,
    segment: Optional[str] = None,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    """List leads with optional filters + computed score.

    Filters:
      • magnet_id / magnet_slug — filter by lead magnet
      • source_contains — partial match against source_url (e.g. 'blog')
      • status — `subscribed` | `unsubscribed`
      • score_min — only return leads with score >= N (range 0–100)
      • segment — `hot` (≥70) | `warm` (40–69) | `cold` (<40)
    """
    query: Dict[str, Any] = {}
    if magnet_id:
        query["magnet_id"] = magnet_id
    if magnet_slug:
        query["magnet_slug"] = magnet_slug
    if source_contains:
        query["source_url"] = {"$regex": source_contains, "$options": "i"}
    if status:
        query["status"] = status
    docs = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    enriched: List[Dict[str, Any]] = []
    for d in docs:
        d = serialize_doc(d)
        d["score"] = _score_lead(d)
        d["segment"] = _segment_for_score(d["score"])
        if score_min is not None and d["score"] < score_min:
            continue
        if segment and d["segment"] != segment.lower():
            continue
        enriched.append(d)
    return enriched


@leads_admin_router.get("/leads/segments")
async def admin_lead_segments(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Aggregate counts by segment + by source for the admin dashboard."""
    docs = await db.leads.find({}, {"_id": 0}).to_list(2000)
    seg_counts = {"hot": 0, "warm": 0, "cold": 0}
    src_counts: Dict[str, int] = {}
    magnet_counts: Dict[str, int] = {}
    total_score = 0
    for d in docs:
        score = _score_lead(d)
        total_score += score
        seg_counts[_segment_for_score(score)] += 1
        src = _summarise_source(d.get("source_url") or "")
        src_counts[src] = src_counts.get(src, 0) + 1
        m = d.get("magnet_slug") or "—"
        magnet_counts[m] = magnet_counts.get(m, 0) + 1
    avg = round(total_score / len(docs), 1) if docs else 0
    return {
        "total": len(docs),
        "avg_score": avg,
        "segments": seg_counts,
        "by_source": [
            {"source": k, "count": v}
            for k, v in sorted(src_counts.items(), key=lambda kv: -kv[1])[:10]
        ],
        "by_magnet": [
            {"magnet": k, "count": v}
            for k, v in sorted(magnet_counts.items(), key=lambda kv: -kv[1])[:10]
        ],
    }


def _score_lead(lead: Dict[str, Any]) -> int:
    """Heuristic lead score 0–100.

    Signals:
      • Magnet weight (premium magnets score higher) — 0–30
      • Source weight (blog organic > paid > unknown) — 0–25
      • Recency (newer = hotter) — 0–25
      • Engagement (next_step_idx, has utm campaign tag) — 0–20
    """
    score = 0

    # Magnet weight — give known magnet slugs +30; default to +15
    if lead.get("magnet_slug"):
        score += 30
    else:
        score += 15

    # Source weight
    src = (lead.get("source_url") or "").lower()
    if "blog" in src or "/case-studies" in src:
        score += 25
    elif "utm_source" in src or src.startswith("http"):
        score += 18
    elif src:
        score += 10

    # Recency — based on created_at age in days
    created_at = lead.get("created_at") or ""
    try:
        ts = datetime.fromisoformat((created_at or "").replace("Z", "+00:00"))
        age_days = max(0, (_now() - ts).days)
        if age_days <= 1:
            score += 25
        elif age_days <= 7:
            score += 18
        elif age_days <= 30:
            score += 10
        else:
            score += 3
    except Exception:
        score += 10

    # Engagement — has at least progressed past step 0 AND has utm
    if lead.get("next_step_idx", 0) > 0:
        score += 12
    if lead.get("utm") and any((lead.get("utm") or {}).values()):
        score += 8

    return min(100, max(0, score))


def _segment_for_score(score: int) -> str:
    if score >= 70:
        return "hot"
    if score >= 40:
        return "warm"
    return "cold"


def _summarise_source(url: str) -> str:
    """Bucket a URL into a small set of human-readable sources."""
    if not url:
        return "direct"
    u = url.lower()
    if "blog/" in u or u.endswith("/blog"):
        return "blog"
    if "case-studies" in u:
        return "case_studies"
    if "tour" in u:
        return "tour"
    if "twitter.com" in u or "t.co" in u:
        return "twitter"
    if "linkedin.com" in u:
        return "linkedin"
    if "google.com" in u:
        return "google"
    return "other"


@leads_admin_router.post("/leads/drip-tick")
async def admin_force_drip_tick(
    request: Request, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, int]:
    """Manually trigger a drip tick — useful for testing."""
    return await drip_tick(db, request.app)
