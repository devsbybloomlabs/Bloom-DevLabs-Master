"""Public Sandbox Tour — read-only snapshot for /tour.

Surfaces synthetic data so prospects can explore Bloom Labs WITHOUT logging in.
The endpoint is public (no auth) but returns ONLY records flagged `demo: True`
in the support_escalations / approvals / milestones collections — your real
customer data is never exposed.

Auto-seeds the demo dataset on first request so the tour is never empty.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from db_utils import serialize_doc

log = logging.getLogger("tour")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


public_tour_router = APIRouter(prefix="/public/tour", tags=["public-tour"])


async def _ensure_seeded(db: AsyncIOMotorDatabase) -> None:
    """Auto-seed the demo set when the tour has nothing to show."""
    count = await db.support_escalations.count_documents({"demo": True})
    if count >= 4:
        return
    try:
        from demo_routes import _seed  # type: ignore

        await _seed(db)
        log.info("Auto-seeded demo dataset for /public/tour")
    except Exception as exc:  # pragma: no cover
        log.warning("Auto-seed failed for /public/tour: %s", exc)


def _public_safe(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip anything sensitive before returning to the public route."""
    safe = {k: v for k, v in doc.items() if k not in {"hashed_password", "raw_data"}}
    return serialize_doc(safe)


@public_tour_router.get("/snapshot")
async def public_tour_snapshot(request: Request) -> Dict[str, Any]:
    """Read-only curated data for the public /tour experience."""
    db = get_db(request)
    await _ensure_seeded(db)

    # Use demo docs only — real customer data NEVER leaks here
    milestones = await db.milestones.find(
        {"demo": True}, {"_id": 0}
    ).sort("created_at", 1).to_list(20)
    approvals = await db.approvals.find(
        {"demo": True}, {"_id": 0}
    ).sort("created_at", 1).to_list(20)
    escalations = await db.support_escalations.find(
        {"demo": True}, {"_id": 0}
    ).sort("created_at", 1).to_list(20)
    onboarding = await db.onboarding_submissions.find_one(
        {"demo": True}, {"_id": 0}
    )

    # Curate one of each kind for the hero "frame" cards
    featured_urgent = next(
        (e for e in escalations if e.get("escalation_type") == "urgent" and e.get("status") == "open"),
        None,
    )
    featured_approval = next(
        (a for a in approvals if a.get("status") == "in_review"),
        None,
    )
    featured_milestone = next(
        (m for m in milestones if m.get("status") == "complete"),
        None,
    )

    # Stats for the "social proof" card
    stats = {
        "milestones": len(milestones),
        "approvals": len(approvals),
        "open_escalations": len([e for e in escalations if e.get("status") == "open"]),
        "resolved_escalations": len(
            [e for e in escalations if e.get("status") in ("resolved", "closed")]
        ),
    }

    return {
        "milestones": [_public_safe(m) for m in milestones],
        "approvals": [_public_safe(a) for a in approvals],
        "escalations": [_public_safe(e) for e in escalations],
        "onboarding": _public_safe(onboarding) if onboarding else None,
        "featured": {
            "urgent": _public_safe(featured_urgent) if featured_urgent else None,
            "approval": _public_safe(featured_approval) if featured_approval else None,
            "milestone": _public_safe(featured_milestone) if featured_milestone else None,
        },
        "stats": stats,
    }


__all__ = ["public_tour_router"]
