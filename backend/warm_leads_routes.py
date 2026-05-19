"""Warm-lead capture — fires when a visitor fills in name+email inside the
niche checkout dialog BEFORE completing PayPal payment.

Purpose: own the lead even if they abandon checkout. Each warm lead is
stored in the `warm_leads` Mongo collection and (optionally) handed off to
the existing email nurture pipeline so the prospect gets a "you started
checkout, want to talk?" follow-up the next morning.

POST /api/leads/warm  (public, no auth)
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user

logger = logging.getLogger(__name__)

warm_leads_router = APIRouter(prefix="/leads", tags=["warm-leads"])
warm_leads_admin_router = APIRouter(
    prefix="/admin/leads",
    tags=["warm-leads-admin"],
    dependencies=[Depends(get_current_user)],
)


class _LazyDB:
    """Defers Motor client creation until first request handler runs.

    Creating an AsyncIOMotorClient at module-import time is unsafe: it binds
    to whichever event loop happens to be current at import (often none, or
    the wrong one) and can hang on SRV resolution in production K8s when the
    URI is `mongodb+srv://...` (Atlas). Lazy-init guarantees the client is
    born on uvicorn's worker loop with sane timeouts.
    """

    _client = None
    _db = None

    def _ensure(self):
        if self._db is None:
            self._client = AsyncIOMotorClient(
                os.environ["MONGO_URL"],
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=10000,
            )
            self._db = self._client[os.environ["DB_NAME"]]
        return self._db

    def __getattr__(self, name):
        return getattr(self._ensure(), name)


_db = _LazyDB()


class WarmLeadPayload(BaseModel):
    niche: str  # "gym" | "coaches" | "real-estate"
    tier: str  # tier key (e.g. coach_starter)
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    # Niche-specific optional context
    gym_name: Optional[str] = Field(default=None, max_length=200)
    coaching_niche: Optional[str] = Field(default=None, max_length=200)
    market: Optional[str] = Field(default=None, max_length=200)
    mls: Optional[str] = Field(default=None, max_length=200)


class WarmLeadResponse(BaseModel):
    id: str
    deduped: bool


@warm_leads_router.post("/warm", response_model=WarmLeadResponse)
async def capture_warm_lead(payload: WarmLeadPayload) -> WarmLeadResponse:
    """Idempotent warm-lead capture. Dedupes on (niche, tier, email)."""
    email = payload.email.lower().strip()
    existing = await _db.warm_leads.find_one(
        {"niche": payload.niche, "tier": payload.tier, "email": email},
        {"_id": 0, "id": 1},
    )
    if existing:
        # Bump last_seen so we can analytics-track re-visits
        await _db.warm_leads.update_one(
            {"id": existing["id"]},
            {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()},
             "$inc": {"visits": 1}},
        )
        return WarmLeadResponse(id=existing["id"], deduped=True)

    doc: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "niche": payload.niche,
        "tier": payload.tier,
        "name": payload.name.strip(),
        "email": email,
        "phone": (payload.phone or "").strip() or None,
        "gym_name": payload.gym_name,
        "coaching_niche": payload.coaching_niche,
        "market": payload.market,
        "mls": payload.mls,
        "status": "captured",  # captured | nurtured | converted | discarded
        "visits": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_seen": datetime.now(timezone.utc).isoformat(),
    }
    await _db.warm_leads.insert_one(doc)
    logger.info("warm_lead.captured niche=%s tier=%s email=%s", payload.niche, payload.tier, email)
    return WarmLeadResponse(id=doc["id"], deduped=False)


@warm_leads_admin_router.get("/warm")
async def list_warm_leads(niche: Optional[str] = None, limit: int = 100) -> Dict[str, Any]:
    """Admin-only list view of warm leads (checkout abandoners)."""
    query: Dict[str, Any] = {}
    if niche:
        query["niche"] = niche
    cursor = _db.warm_leads.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = [doc async for doc in cursor]
    return {"items": items, "count": len(items)}


@warm_leads_admin_router.get("/warm/revenue-stats")
async def warm_lead_revenue_stats() -> Dict[str, Any]:
    """Roll up captured-but-not-converted warm leads × their tier prices.

    Returns:
      total_pipeline_usd: SUM(tier_price) across all non-converted leads
      total_leads: count of non-converted leads
      by_niche: {niche: {count, pipeline_usd}}
      by_tier: {tier: {count, pipeline_usd, name}}
      top_value_leads: up to 10 newest non-converted leads with tier_price
    """
    # Local import to avoid a circular module-load dependency
    from paypal_routes import PACKAGE_TIERS

    # Aggregate non-converted leads grouped by (niche, tier)
    pipeline = [
        {"$match": {"status": {"$nin": ["converted", "discarded"]}}},
        {
            "$group": {
                "_id": {"niche": "$niche", "tier": "$tier"},
                "count": {"$sum": 1},
            }
        },
    ]
    rows = [r async for r in _db.warm_leads.aggregate(pipeline)]

    by_niche: Dict[str, Dict[str, Any]] = {}
    by_tier: Dict[str, Dict[str, Any]] = {}
    total_pipeline = 0.0
    total_leads = 0

    for row in rows:
        niche = row["_id"].get("niche") or "unknown"
        tier_key = row["_id"].get("tier") or "unknown"
        count = int(row["count"])
        cfg = PACKAGE_TIERS.get(tier_key, {})
        try:
            price = float(cfg.get("price", 0))
        except (TypeError, ValueError):
            price = 0.0
        revenue = price * count
        total_pipeline += revenue
        total_leads += count
        n = by_niche.setdefault(niche, {"count": 0, "pipeline_usd": 0.0})
        n["count"] += count
        n["pipeline_usd"] += revenue
        t = by_tier.setdefault(
            tier_key,
            {"count": 0, "pipeline_usd": 0.0, "name": cfg.get("name", tier_key), "price": price},
        )
        t["count"] += count
        t["pipeline_usd"] += revenue

    # Top value leads (newest first, only non-converted)
    top_cursor = (
        _db.warm_leads.find(
            {"status": {"$nin": ["converted", "discarded"]}},
            {"_id": 0, "id": 1, "niche": 1, "tier": 1, "email": 1, "name": 1, "created_at": 1, "visits": 1},
        )
        .sort("created_at", -1)
        .limit(10)
    )
    top_leads: list = []
    async for d in top_cursor:
        cfg = PACKAGE_TIERS.get(d.get("tier") or "", {})
        try:
            d["tier_price_usd"] = float(cfg.get("price", 0))
        except (TypeError, ValueError):
            d["tier_price_usd"] = 0.0
        d["tier_name"] = cfg.get("name", d.get("tier"))
        top_leads.append(d)

    return {
        "total_pipeline_usd": round(total_pipeline, 2),
        "total_leads": total_leads,
        "by_niche": {k: {**v, "pipeline_usd": round(v["pipeline_usd"], 2)} for k, v in by_niche.items()},
        "by_tier": {k: {**v, "pipeline_usd": round(v["pipeline_usd"], 2)} for k, v in by_tier.items()},
        "top_value_leads": top_leads,
    }


__all__ = ["warm_leads_router", "warm_leads_admin_router"]
