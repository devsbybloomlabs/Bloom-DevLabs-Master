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


__all__ = ["warm_leads_router", "warm_leads_admin_router"]
