"""Demo Mode — 1-click seeder for sales / Loom demos.

Spawns synthetic data across every Bloom Labs integration so you can show the
full automation flywheel in a 2-minute screen recording:

  • 2 clients with active password-set portals
  • 2 milestones tied to those clients (one in_progress, one complete)
  • 3 Approval Studio approvals (in_review / revision / approved)
  • 4 ThriveDesk escalations (2 urgent + 1 feature + 1 already-resolved)
  • 1 sample Phase 7 onboarding submission
  • 1 lead magnet capture

All seed records carry `demo: True` so they can be wiped via the same endpoint
(DELETE /admin/demo/seed).

Idempotent: calling POST twice does NOT duplicate — the wipe happens first.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from uuid import uuid4

import bcrypt
from fastapi import APIRouter, Depends, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import get_current_user
from db_utils import prepare_for_mongo

log = logging.getLogger("demo")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# Demo personas — kept human-feeling for screenshot quality
DEMO_CLIENTS = [
    {
        "email": "demo.acme@bloomlabs.demo",
        "name": "Sienna at Acme Studios",
        "company": "Acme Studios",
    },
    {
        "email": "demo.northpeak@bloomlabs.demo",
        "name": "Marcus at NorthPeak Outdoor",
        "company": "NorthPeak Outdoor",
    },
]

DEMO_MILESTONES = [
    {
        "client_idx": 0,
        "title": "Brand identity package",
        "project_name": "Acme rebrand",
        "status": "in_progress",
    },
    {
        "client_idx": 1,
        "title": "Landing page redesign",
        "project_name": "NorthPeak DTC launch",
        "status": "complete",
    },
]

DEMO_APPROVALS = [
    {
        "client_idx": 0,
        "project_name": "Acme rebrand",
        "asset_name": "Logo concept v3",
        "design_url": "https://figma.com/file/demo-acme-logo-v3",
        "version": 3,
        "status": "in_review",
    },
    {
        "client_idx": 0,
        "project_name": "Acme rebrand",
        "asset_name": "Hero illustration",
        "design_url": "https://figma.com/file/demo-acme-hero",
        "version": 2,
        "status": "revision",
    },
    {
        "client_idx": 1,
        "project_name": "NorthPeak DTC launch",
        "asset_name": "Landing page hero",
        "design_url": "https://figma.com/file/demo-northpeak-lp",
        "version": 1,
        "status": "approved",
    },
]

DEMO_ESCALATIONS = [
    {
        "client_idx": 0,
        "subject": "URGENT: Checkout broken on Safari mobile",
        "tags": ["High Priority"],
        "classification": "urgent",
        "status": "open",
    },
    {
        "client_idx": 1,
        "subject": "We are blocked — exports failing for our team",
        "tags": [],
        "classification": "urgent",
        "status": "open",
    },
    {
        "client_idx": 0,
        "subject": "Can we add dark mode to the dashboard?",
        "tags": ["Feature Request"],
        "classification": "feature",
        "status": "open",
    },
    {
        "client_idx": 1,
        "subject": "Invoice question — fixed already",
        "tags": [],
        "classification": "urgent",
        "status": "closed",
    },
]


async def _wipe(db: AsyncIOMotorDatabase) -> Dict[str, int]:
    """Remove all records flagged with `demo: True`."""
    deleted: Dict[str, int] = {}
    for coll in (
        "clients",
        "milestones",
        "approvals",
        "support_escalations",
        "onboarding_submissions",
        "leads",
    ):
        r = await db[coll].delete_many({"demo": True})
        deleted[coll] = r.deleted_count
    return deleted


async def _seed(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    now = _now()
    summary: Dict[str, Any] = {}

    # --- Clients (with demo password 'demo1234') ----------------------
    hashed = bcrypt.hashpw(b"demo1234", bcrypt.gensalt(rounds=10)).decode()
    client_ids: List[str] = []
    for c in DEMO_CLIENTS:
        client_id = str(uuid4())
        client_ids.append(client_id)
        await db.clients.insert_one(
            prepare_for_mongo(
                {
                    "id": client_id,
                    "email": c["email"],
                    "name": c["name"],
                    "company": c["company"],
                    "hashed_password": hashed,
                    "role": "client",
                    "status": "active",
                    "needs_password_setup": False,
                    "source": "demo",
                    "demo": True,
                    "created_at": _iso(now - timedelta(days=30)),
                    "last_login_at": _iso(now - timedelta(days=2)),
                }
            )
        )
    summary["clients"] = len(client_ids)

    # --- Milestones ---------------------------------------------------
    milestone_ids: List[str] = []
    for m in DEMO_MILESTONES:
        mid = str(uuid4())
        milestone_ids.append(mid)
        await db.milestones.insert_one(
            prepare_for_mongo(
                {
                    "id": mid,
                    "client_email": DEMO_CLIENTS[m["client_idx"]]["email"],
                    "client_id": client_ids[m["client_idx"]],
                    "project_name": m["project_name"],
                    "title": m["title"],
                    "status": m["status"],
                    "last_updated": _iso(now - timedelta(days=random.randint(1, 7))),
                    "demo": True,
                    "created_at": _iso(now - timedelta(days=20)),
                }
            )
        )
    summary["milestones"] = len(milestone_ids)

    # --- Approvals ----------------------------------------------------
    approval_count = 0
    for a in DEMO_APPROVALS:
        aid = str(uuid4())
        client = DEMO_CLIENTS[a["client_idx"]]
        await db.approvals.insert_one(
            prepare_for_mongo(
                {
                    "id": aid,
                    "client_email": client["email"],
                    "project_name": a["project_name"],
                    "asset_name": a["asset_name"],
                    "design_url": a["design_url"],
                    "review_url": f"https://approval.studio/r/demo_{aid[:8]}",
                    "designer_email": "designer@bloomlabs.demo",
                    "aps_project_id": f"demo_{aid[:12]}",
                    "aps_asset_id": f"demo_asset_{aid[:8]}",
                    "version": a["version"],
                    "status": a["status"],
                    "milestone_id": milestone_ids[0] if a["client_idx"] == 0 else milestone_ids[1],
                    "last_event_at": _iso(now - timedelta(hours=random.randint(2, 48))),
                    "created_at": _iso(now - timedelta(days=random.randint(2, 14))),
                    "demo": True,
                }
            )
        )
        approval_count += 1
    summary["approvals"] = approval_count

    # --- Support escalations -----------------------------------------
    esc_count = 0
    for e in DEMO_ESCALATIONS:
        eid = str(uuid4())
        client = DEMO_CLIENTS[e["client_idx"]]
        ticket_id = f"demo_td_{random.randint(10000, 99999)}"
        await db.support_escalations.insert_one(
            prepare_for_mongo(
                {
                    "id": eid,
                    "ticket_id": ticket_id,
                    "ticket_uuid": str(uuid4()),
                    "ticket_url": f"https://hyperdrivemg.thrivedesk.com/conversation/{ticket_id}",
                    "subject": e["subject"],
                    "client_name": client["name"],
                    "client_email": client["email"],
                    "escalation_type": e["classification"],
                    "nifty_task_id": None,
                    "status": e["status"],
                    "tags": e["tags"],
                    "created_at": _iso(now - timedelta(hours=random.randint(1, 72))),
                    "resolved_at": _iso(now - timedelta(hours=2))
                    if e["status"] in ("resolved", "closed")
                    else None,
                    "resolution_summary": "Fixed the broken receipt template."
                    if e["status"] in ("resolved", "closed")
                    else None,
                    "demo": True,
                }
            )
        )
        esc_count += 1
    summary["support_escalations"] = esc_count

    # --- Onboarding submission ---------------------------------------
    onboarding_id = str(uuid4())
    await db.onboarding_submissions.insert_one(
        prepare_for_mongo(
            {
                "id": onboarding_id,
                "client_email": DEMO_CLIENTS[1]["email"],
                "company_name": "NorthPeak Outdoor",
                "project_type": "Brand identity + website",
                "budget_range": "$15k - $30k",
                "timeline": "6-8 weeks",
                "responses": {
                    "primary_goal": "Launch DTC site within 8 weeks",
                    "audience": "Outdoor enthusiasts 25-45",
                    "competitors": ["YETI", "Patagonia"],
                },
                "submitted_at": _iso(now - timedelta(days=18)),
                "demo": True,
            }
        )
    )
    summary["onboarding"] = 1

    # --- Lead capture -----------------------------------------------
    await db.leads.insert_one(
        prepare_for_mongo(
            {
                "id": str(uuid4()),
                "email": "demo.lead@founderdaily.demo",
                "source": "blog_post",
                "magnet_slug": "agency-pricing-calculator",
                "status": "new",
                "captured_at": _iso(now - timedelta(hours=6)),
                "demo": True,
            }
        )
    )
    summary["leads"] = 1

    return summary


# =========================================================================
# Router
# =========================================================================
demo_router = APIRouter(
    prefix="/admin/demo",
    tags=["demo"],
    dependencies=[Depends(get_current_user)],
)


@demo_router.post("/seed")
async def seed_demo_data(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Idempotent demo seed — wipes existing demo records first."""
    wiped = await _wipe(db)
    seeded = await _seed(db)
    return {
        "ok": True,
        "wiped": wiped,
        "seeded": seeded,
        "demo_clients": [c["email"] for c in DEMO_CLIENTS],
        "demo_password": "demo1234",
    }


@demo_router.delete("/seed")
async def wipe_demo_data(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    wiped = await _wipe(db)
    return {"ok": True, "wiped": wiped}


@demo_router.get("/status")
async def demo_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    counts = {}
    for coll in (
        "clients",
        "milestones",
        "approvals",
        "support_escalations",
        "onboarding_submissions",
        "leads",
    ):
        counts[coll] = await db[coll].count_documents({"demo": True})
    total = sum(counts.values())
    return {"active": total > 0, "counts": counts, "total": total}


__all__ = ["demo_router"]
