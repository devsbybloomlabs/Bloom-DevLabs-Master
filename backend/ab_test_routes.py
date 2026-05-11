"""A/B testing for the /tour CTA position (Phase 15).

Lightweight: store every variant impression + click in `ab_events` collection,
expose aggregate stats to admin. No segmentation, no cookie hashing — the
client passes its own variant assignment (chosen via localStorage on first
visit) so we don't need an admin-side experiment manager.

Variants for the /tour CTA test:
  • `header`  — primary CTA sits in the slim header only (existing)
  • `hero`    — large CTA inside the hero section (existing)
  • `sticky`  — bottom sticky bar that follows the user as they scroll

The frontend picks one variant per visitor and tracks impressions/clicks.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import get_current_user
from db_utils import prepare_for_mongo

log = logging.getLogger("ab")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


VALID_KINDS = {"impression", "cta_click"}
VALID_VARIANTS_BY_EXP = {
    "tour_cta_position": {"header", "hero", "sticky"},
}


class AbTrackRequest(BaseModel):
    experiment: str = Field(..., min_length=1, max_length=64)
    variant: str = Field(..., min_length=1, max_length=32)
    kind: str = Field(..., min_length=1, max_length=32)
    cta_location: Optional[str] = Field(default=None, max_length=64)


# =========================================================================
# Public tracking endpoint
# =========================================================================
public_ab_router = APIRouter(prefix="/public/ab", tags=["ab-public"])


@public_ab_router.post("/track")
async def track_ab_event(
    body: AbTrackRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if body.kind not in VALID_KINDS:
        raise HTTPException(422, "kind must be impression|cta_click")
    allowed = VALID_VARIANTS_BY_EXP.get(body.experiment)
    if allowed is not None and body.variant not in allowed:
        raise HTTPException(422, f"variant must be one of {sorted(allowed)}")
    doc = {
        "experiment": body.experiment,
        "variant": body.variant,
        "kind": body.kind,
        "cta_location": body.cta_location,
        "at": _now(),
        "ua": request.headers.get("user-agent", "")[:200],
        "ip_hash": _hash_ip(request),
    }
    await db.ab_events.insert_one(prepare_for_mongo(doc))
    return {"ok": True}


def _hash_ip(request: Request) -> str:
    """One-way hash of client IP for de-duplication without storing the raw IP."""
    import hashlib
    ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    if not ip:
        return ""
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


# =========================================================================
# Admin stats
# =========================================================================
ab_admin_router = APIRouter(
    prefix="/admin/ab",
    tags=["ab-admin"],
    dependencies=[Depends(get_current_user)],
)


@ab_admin_router.get("/{experiment}/stats")
async def get_experiment_stats(
    experiment: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Aggregate impressions + cta_clicks per variant.

    Returns CTR = clicks / impressions (capped 1.0 for safety). Unique visitors
    are de-duplicated by `ip_hash` per (variant, kind).
    """
    pipeline: List[Dict[str, Any]] = [
        {"$match": {"experiment": experiment}},
        {
            "$group": {
                "_id": {"variant": "$variant", "kind": "$kind"},
                "total": {"$sum": 1},
                "uniques": {"$addToSet": "$ip_hash"},
            }
        },
    ]
    rows = await db.ab_events.aggregate(pipeline).to_list(50)
    by_variant: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        v = r["_id"]["variant"]
        k = r["_id"]["kind"]
        bucket = by_variant.setdefault(
            v, {"impressions": 0, "cta_clicks": 0, "unique_impressions": 0, "unique_clicks": 0}
        )
        if k == "impression":
            bucket["impressions"] = r["total"]
            bucket["unique_impressions"] = len({u for u in r["uniques"] if u})
        elif k == "cta_click":
            bucket["cta_clicks"] = r["total"]
            bucket["unique_clicks"] = len({u for u in r["uniques"] if u})

    # CTR per variant
    out: List[Dict[str, Any]] = []
    for v, m in by_variant.items():
        ui = max(m["unique_impressions"], 1)
        m["ctr"] = round(min(1.0, m["unique_clicks"] / ui), 4)
        m["variant"] = v
        out.append(m)
    out.sort(key=lambda x: x["variant"])

    return {
        "experiment": experiment,
        "variants": out,
        "totals": {
            "impressions": sum(v["impressions"] for v in by_variant.values()),
            "cta_clicks": sum(v["cta_clicks"] for v in by_variant.values()),
            "unique_visitors": sum(v["unique_impressions"] for v in by_variant.values()),
        },
        "checked_at": _now(),
    }


__all__ = ["public_ab_router", "ab_admin_router"]
