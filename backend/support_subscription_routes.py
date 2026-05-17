"""
Support Subscriptions — bundled 1-year free + paid upgrade path.

Every paid package (Express Launch / Custom Build / Enterprise) auto-provisions
a 1-year free support entitlement at the matching tier:
  • Express     → Standard (1 yr free)
  • Custom      → Premium  (1 yr free)
  • Enterprise  → VIP      (1 yr free)

After year 1 expires (or to upgrade earlier), the client buys an annual or
quarterly recurring PayPal subscription from the catalog below.

Pricing (per month, billed annually or quarterly):
  • Annual:    Standard $29 · Premium $49 · VIP $89
  • Quarterly: Standard $39 · Premium $59 · VIP $99

Rules:
  • One active support subscription per company at a time (no duplicates).
  • Paid plans REPLACE the free entitlement (the bundled row flips to
    `superseded` when the paid one activates).
  • Upgrade-only: a client cannot subscribe to a plan whose tier is < their
    current tier rank (none < standard < premium < vip).
  • On expiry of the free entitlement → company.support_tier = "none" and
    the row status flips to "expired". Client sees a Purchase-support CTA.

Storage:
  • Catalog rows live in `paypal_plans` with `is_support_plan=True` so they
    appear in the support-plan picker (and NOT in the generic add-on list).
  • Per-company entitlements live in `support_subscriptions` (NEW collection):
      {id, company_id, client_email, tier (standard|premium|vip),
       source ("bundled"|"purchased"), status ("active_free"|"active_paid"|
       "expired"|"superseded"|"cancelled"), started_at, expires_at (UTC iso),
       paypal_subscription_id?, plan_key?, plan_price?, plan_currency?,
       cadence ("annual"|"quarterly"|"bundled"), package_tier? (express|...),
       created_at, updated_at}
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from auth import get_current_user
from client_routes import get_current_client
from db_utils import prepare_for_mongo
from paypal_client import PayPalClient

log = logging.getLogger("support_subscriptions")


# -------------------------------------------------------------------------
# Catalog
# -------------------------------------------------------------------------
SUPPORT_TIERS = ("standard", "premium", "vip")
TIER_RANK: Dict[str, int] = {"none": 0, "standard": 1, "premium": 2, "vip": 3}

# package_tier (set in paypal_routes.PACKAGE_TIERS) → bundled support tier
PACKAGE_TO_SUPPORT_TIER: Dict[str, str] = {
    "express": "standard",
    "custom": "premium",
    "enterprise": "vip",
    # Niche-specific tiers map to the same support level as their generic
    # equivalents — gym owners still get standard/premium/vip support.
    "gym_prototype": "standard",
    "gym_express": "standard",
    "gym_custom": "premium",
    "gym_enterprise": "vip",
    "coach_starter": "standard",
    "coach_premium": "premium",
    "coach_enterprise": "vip",
    "realestate_starter": "standard",
    "realestate_premium": "premium",
    "realestate_enterprise": "vip",
}

# Catalog — 6 SKUs (3 tiers × 2 cadences). Prices below are PER MONTH, but
# PayPal bills the full period (year / quarter) up-front.
SUPPORT_PLAN_CATALOG: List[Dict[str, Any]] = [
    {
        "plan_key": "support_standard_annual",
        "tier": "standard",
        "cadence": "annual",
        "price_per_month": "29.00",
        "total_per_cycle": "348.00",  # 29 × 12
        "currency": "USD",
        "name": "Standard Support — Annual",
        "description": "Standard SLA support, billed annually ($29/mo).",
        "interval_unit": "YEAR",
        "interval_count": 1,
    },
    {
        "plan_key": "support_premium_annual",
        "tier": "premium",
        "cadence": "annual",
        "price_per_month": "49.00",
        "total_per_cycle": "588.00",
        "currency": "USD",
        "name": "Premium Support — Annual",
        "description": "Premium SLA support, billed annually ($49/mo).",
        "interval_unit": "YEAR",
        "interval_count": 1,
    },
    {
        "plan_key": "support_vip_annual",
        "tier": "vip",
        "cadence": "annual",
        "price_per_month": "89.00",
        "total_per_cycle": "1068.00",
        "currency": "USD",
        "name": "VIP Support — Annual",
        "description": "VIP SLA support, billed annually ($89/mo).",
        "interval_unit": "YEAR",
        "interval_count": 1,
    },
    {
        "plan_key": "support_standard_quarterly",
        "tier": "standard",
        "cadence": "quarterly",
        "price_per_month": "39.00",
        "total_per_cycle": "117.00",  # 39 × 3
        "currency": "USD",
        "name": "Standard Support — Quarterly",
        "description": "Standard SLA support, billed quarterly ($39/mo).",
        "interval_unit": "MONTH",
        "interval_count": 3,
    },
    {
        "plan_key": "support_premium_quarterly",
        "tier": "premium",
        "cadence": "quarterly",
        "price_per_month": "59.00",
        "total_per_cycle": "177.00",
        "currency": "USD",
        "name": "Premium Support — Quarterly",
        "description": "Premium SLA support, billed quarterly ($59/mo).",
        "interval_unit": "MONTH",
        "interval_count": 3,
    },
    {
        "plan_key": "support_vip_quarterly",
        "tier": "vip",
        "cadence": "quarterly",
        "price_per_month": "99.00",
        "total_per_cycle": "297.00",
        "currency": "USD",
        "name": "VIP Support — Quarterly",
        "description": "VIP SLA support, billed quarterly ($99/mo).",
        "interval_unit": "MONTH",
        "interval_count": 3,
    },
]

SUPPORT_EXCLUSIONS_LINE = (
    "Note: Support plans do NOT include new feature requests or change requests."
)


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat()


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_pp(request: Request) -> PayPalClient:
    return request.app.state.paypal


async def _company_for_client(
    db: AsyncIOMotorDatabase, client: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    email = (client.get("email") or "").lower()
    if not email:
        return None
    return await db.companies.find_one({"primary_email": email}, {"_id": 0})


async def _active_subscription(
    db: AsyncIOMotorDatabase, company_id: str
) -> Optional[Dict[str, Any]]:
    return await db.support_subscriptions.find_one(
        {
            "company_id": company_id,
            "status": {"$in": ["active_free", "active_paid"]},
        },
        {"_id": 0},
    )


async def _set_company_tier(
    db: AsyncIOMotorDatabase, company_id: str, tier: str
) -> None:
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"support_tier": tier, "updated_at": _iso(_now())}},
    )


# -------------------------------------------------------------------------
# Plan catalog seeding (idempotent)
# -------------------------------------------------------------------------
async def seed_support_plans(
    db: AsyncIOMotorDatabase, pp: Optional[PayPalClient] = None
) -> Dict[str, int]:
    """Ensure the 6 support PayPal plans exist + are flagged as support plans.

    Idempotent — does NOT recreate PayPal products/plans on second run.
    Pricing/labels are upserted so a price change here propagates.
    """
    inserted = 0
    updated = 0
    for spec in SUPPORT_PLAN_CATALOG:
        existing = await db.paypal_plans.find_one(
            {"plan_key": spec["plan_key"]}, {"_id": 0}
        )
        # If the row exists with a LOCAL- placeholder plan_id, try to upgrade
        # it to a real PayPal plan (most likely a previous boot ran before
        # PayPal was healthy).
        needs_paypal_create = (
            not existing
            or str(existing.get("plan_id", "")).startswith("LOCAL-")
            or not existing.get("plan_id")
        )
        doc = {
            "plan_key": spec["plan_key"],
            "name": spec["name"],
            "description": spec["description"],
            "price": spec["total_per_cycle"],
            "currency": spec["currency"],
            "interval_unit": spec["interval_unit"],
            "interval_count": spec["interval_count"],
            "is_support_plan": True,
            "support_tier": spec["tier"],
            "support_cadence": spec["cadence"],
            "price_per_month": spec["price_per_month"],
            "updated_at": _iso(_now()),
        }
        if existing and not needs_paypal_create:
            await db.paypal_plans.update_one(
                {"plan_key": spec["plan_key"]}, {"$set": doc}
            )
            updated += 1
            continue
        # New row OR LOCAL- placeholder — try to create the PayPal Product+Plan.
        plan_id: Optional[str] = existing.get("plan_id") if existing else None
        product_id: Optional[str] = existing.get("product_id") if existing else None
        if pp and pp.is_configured:
            try:
                if not product_id:
                    prod = await pp.create_product(
                        name=spec["name"], description=spec["description"]
                    )
                    if prod.get("success"):
                        product_id = prod["data"]["id"]
                if product_id and (not plan_id or str(plan_id).startswith("LOCAL-")):
                    plan_res = await pp.create_plan(
                        product_id=product_id,
                        name=spec["name"],
                        price=spec["total_per_cycle"],
                        description=spec["description"],
                        currency=spec["currency"],
                        interval_unit=spec["interval_unit"],
                        interval_count=spec["interval_count"],
                    )
                    if plan_res.get("success"):
                        plan_id = plan_res["data"]["id"]
                    else:
                        log.warning(
                            "PayPal plan create failed for %s: %s",
                            spec["plan_key"],
                            plan_res.get("error"),
                        )
            except Exception as exc:  # noqa: BLE001
                log.warning("PayPal plan seed failed for %s: %s", spec["plan_key"], exc)
        doc["plan_id"] = plan_id or f"LOCAL-{spec['plan_key']}"
        doc["product_id"] = product_id
        doc["status"] = "active"
        if existing:
            await db.paypal_plans.update_one(
                {"plan_key": spec["plan_key"]}, {"$set": doc}
            )
            updated += 1
        else:
            doc["created_at"] = _iso(_now())
            await db.paypal_plans.insert_one(doc)
            inserted += 1
    return {"inserted": inserted, "updated": updated}


# -------------------------------------------------------------------------
# Auto-provisioning (called from paypal_routes.capture_order)
# -------------------------------------------------------------------------
async def provision_bundled_support_subscription(
    db: AsyncIOMotorDatabase,
    company: Dict[str, Any],
    package_tier: str,
) -> Optional[Dict[str, Any]]:
    """Create the 1-yr free support entitlement for a freshly purchased package.

    No-op if the company already has an active subscription (free OR paid).
    Returns the created row, or None if nothing was done.
    """
    if not company:
        return None
    tier = PACKAGE_TO_SUPPORT_TIER.get(package_tier)
    if not tier:
        return None
    company_id = company["id"]
    active = await _active_subscription(db, company_id)
    if active:
        return None  # never duplicate
    now = _now()
    doc = {
        "id": f"sub_{company_id[:8]}_{int(now.timestamp())}",
        "company_id": company_id,
        "client_email": (company.get("primary_email") or "").lower(),
        "tier": tier,
        "source": "bundled",
        "status": "active_free",
        "started_at": _iso(now),
        "expires_at": _iso(now + timedelta(days=365)),
        "package_tier": package_tier,
        "cadence": "bundled",
        "created_at": _iso(now),
        "updated_at": _iso(now),
    }
    await db.support_subscriptions.insert_one(doc)
    await _set_company_tier(db, company_id, tier)
    log.info("Provisioned bundled %s support for company %s", tier, company_id)
    return doc


# -------------------------------------------------------------------------
# Cron — flip expired bundled rows
# -------------------------------------------------------------------------
async def expire_overdue_subscriptions(db: AsyncIOMotorDatabase) -> int:
    """Daily cron: find bundled rows past their expires_at → flip to expired."""
    now_iso = _iso(_now())
    cursor = db.support_subscriptions.find(
        {"status": "active_free", "expires_at": {"$lt": now_iso}}, {"_id": 0}
    )
    count = 0
    async for row in cursor:
        await db.support_subscriptions.update_one(
            {"id": row["id"]},
            {"$set": {"status": "expired", "expired_at": now_iso, "updated_at": now_iso}},
        )
        # If the company isn't on a paid plan now, flip support_tier=none.
        paid = await db.support_subscriptions.find_one(
            {"company_id": row["company_id"], "status": "active_paid"}, {"_id": 0}
        )
        if not paid:
            await _set_company_tier(db, row["company_id"], "none")
        count += 1
    if count:
        log.info("Expired %d overdue support subscription(s)", count)
    return count


# -------------------------------------------------------------------------
# Client-facing endpoints
# -------------------------------------------------------------------------
support_sub_client_router = APIRouter(
    prefix="/clients/me/support-subscription", tags=["support-subscriptions"]
)


@support_sub_client_router.get("")
async def my_support_subscription(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> Dict[str, Any]:
    """Return the client's current support entitlement + upgrade catalog."""
    company = await _company_for_client(db, client)
    if not company:
        return {
            "current": None,
            "available_plans": SUPPORT_PLAN_CATALOG,
            "exclusions_note": SUPPORT_EXCLUSIONS_LINE,
            "can_purchase": True,
        }
    company_id = company["id"]
    active = await _active_subscription(db, company_id)
    current_tier = (
        active["tier"] if active else (company.get("support_tier") or "none")
    )
    current_rank = TIER_RANK.get(current_tier, 0)
    # Surface only paid plans with tier > current (upgrade-only). When the
    # active row is bundled-free, also allow same-tier paid to "switch off"
    # the bundled state early (optional). Per user spec: free bundled means
    # the client doesn't see same-tier paid (they already have the tier).
    catalog = await db.paypal_plans.find(
        {"is_support_plan": True, "status": {"$ne": "archived"}}, {"_id": 0}
    ).sort("price", 1).to_list(50)
    if not catalog:
        # fallback to in-code catalog
        catalog = list(SUPPORT_PLAN_CATALOG)
    available = []
    for p in catalog:
        rank = TIER_RANK.get(p.get("support_tier") or "", 0)
        if rank > current_rank:
            available.append(p)
    return {
        "current": active,
        "current_tier": current_tier,
        "days_remaining": _days_remaining(active),
        "available_plans": available,
        "all_plans": catalog,
        "exclusions_note": SUPPORT_EXCLUSIONS_LINE,
        "can_purchase": True,
    }


def _days_remaining(active: Optional[Dict[str, Any]]) -> Optional[int]:
    if not active:
        return None
    raw = active.get("expires_at")
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    delta = dt - _now()
    return max(0, int(delta.total_seconds() // 86400))


class ClientSupportSubscribeRequest(BaseModel):
    plan_key: str


@support_sub_client_router.post("/subscribe")
async def client_subscribe_support(
    req: ClientSupportSubscribeRequest,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> Dict[str, Any]:
    """Create a PayPal subscription for a support plan with upgrade-only guard."""
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    plan = await db.paypal_plans.find_one(
        {"plan_key": req.plan_key, "is_support_plan": True}, {"_id": 0}
    )
    if not plan:
        raise HTTPException(404, "Support plan not found")
    if str(plan.get("plan_id", "")).startswith("LOCAL-"):
        raise HTTPException(
            503,
            "Support plan exists locally but isn't published in PayPal yet — "
            "ask admin to run seed_support_plans.",
        )
    company = await _company_for_client(db, client)
    if not company:
        raise HTTPException(400, "No company on file — complete kickoff first")
    company_id = company["id"]
    active = await _active_subscription(db, company_id)
    new_tier = plan.get("support_tier") or "standard"
    current_rank = (
        TIER_RANK.get(active["tier"], 0) if active else TIER_RANK.get(company.get("support_tier") or "none", 0)
    )
    new_rank = TIER_RANK.get(new_tier, 0)
    if new_rank <= current_rank:
        raise HTTPException(
            400,
            "Upgrade-only — pick a plan with a higher support tier than your current one.",
        )
    # Idempotency note: if a PENDING paypal_subscription doc exists for this
    # plan + client, return its approval URL instead of creating a fresh one.
    pending = await db.paypal_subscriptions.find_one(
        {
            "customer_email": client["email"],
            "plan_key": req.plan_key,
            "status": {"$in": ["APPROVAL_PENDING", "APPROVED"]},
        },
        {"_id": 0},
    )
    if pending and pending.get("approval_url"):
        return {
            "id": pending["id"],
            "status": pending.get("status"),
            "approval_url": pending["approval_url"],
        }
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    name_parts = (client.get("name") or "").split(" ", 1)
    subscriber_name = (
        {"given_name": name_parts[0], "surname": name_parts[1] if len(name_parts) > 1 else ""}
        if name_parts and name_parts[0]
        else None
    )
    res = await pp.create_subscription(
        plan_id=plan["plan_id"],
        subscriber_email=client["email"],
        subscriber_name=subscriber_name,
        custom_id=f"support:{company_id}:{req.plan_key}",
        return_url=f"{base}/portal/subscriptions?support_activated=1",
        cancel_url=f"{base}/portal/subscriptions?support_cancelled=1",
    )
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal subscription create failed")
    sub = res["data"]
    approval_url = next(
        (lk["href"] for lk in (sub.get("links") or []) if lk.get("rel") == "approve"),
        None,
    )
    paypal_doc = {
        "id": sub["id"],
        "plan_id": plan["plan_id"],
        "plan_key": req.plan_key,
        "plan_name": plan.get("name"),
        "plan_price": plan.get("price"),
        "plan_currency": plan.get("currency"),
        "is_support_plan": True,
        "support_tier": new_tier,
        "support_cadence": plan.get("support_cadence"),
        "status": sub.get("status", "APPROVAL_PENDING"),
        "customer_email": client["email"],
        "customer_name": client.get("name"),
        "approval_url": approval_url,
        "source": "client_portal_support",
        "created_at": _iso(_now()),
        "updated_at": _iso(_now()),
    }
    await db.paypal_subscriptions.update_one(
        {"id": sub["id"]}, {"$set": prepare_for_mongo(paypal_doc)}, upsert=True
    )
    return {
        "id": sub["id"],
        "status": sub.get("status"),
        "approval_url": approval_url,
    }


async def activate_paid_support_subscription(
    db: AsyncIOMotorDatabase, paypal_sub_id: str
) -> Optional[Dict[str, Any]]:
    """Called when a support PayPal subscription becomes ACTIVE.

    Marks the bundled free row (if any) as `superseded`, inserts an
    active_paid row, and flips company.support_tier. Idempotent.
    """
    pp_sub = await db.paypal_subscriptions.find_one(
        {"id": paypal_sub_id, "is_support_plan": True}, {"_id": 0}
    )
    if not pp_sub:
        return None
    cust = pp_sub.get("custom_id") or ""
    if not cust.startswith("support:"):
        return None
    _, company_id, plan_key = cust.split(":", 2)
    # Don't double-insert
    existing = await db.support_subscriptions.find_one(
        {"paypal_subscription_id": paypal_sub_id}, {"_id": 0}
    )
    if existing:
        return existing
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        return None
    # Supersede the bundled free row.
    await db.support_subscriptions.update_many(
        {
            "company_id": company_id,
            "status": "active_free",
        },
        {
            "$set": {
                "status": "superseded",
                "superseded_at": _iso(_now()),
                "updated_at": _iso(_now()),
            }
        },
    )
    now = _now()
    cadence = pp_sub.get("support_cadence") or "annual"
    days = 365 if cadence == "annual" else 90
    doc = {
        "id": f"sub_paid_{company_id[:8]}_{int(now.timestamp())}",
        "company_id": company_id,
        "client_email": pp_sub.get("customer_email"),
        "tier": pp_sub.get("support_tier") or "standard",
        "source": "purchased",
        "status": "active_paid",
        "started_at": _iso(now),
        "expires_at": _iso(now + timedelta(days=days)),
        "paypal_subscription_id": paypal_sub_id,
        "plan_key": plan_key,
        "plan_price": pp_sub.get("plan_price"),
        "plan_currency": pp_sub.get("plan_currency"),
        "cadence": cadence,
        "created_at": _iso(now),
        "updated_at": _iso(now),
    }
    await db.support_subscriptions.insert_one(doc)
    await _set_company_tier(db, company_id, doc["tier"])
    log.info(
        "Activated paid %s/%s support for company %s",
        doc["tier"],
        cadence,
        company_id,
    )
    return doc


# -------------------------------------------------------------------------
# Admin
# -------------------------------------------------------------------------
support_sub_admin_router = APIRouter(
    prefix="/admin/support-subscriptions", tags=["support-subscriptions-admin"]
)


@support_sub_admin_router.post("/seed")
async def admin_seed_support_plans(
    request: Request,
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    pp = getattr(request.app.state, "paypal", None)
    return await seed_support_plans(db, pp)


@support_sub_admin_router.get("")
async def admin_list_support_subscriptions(
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
    limit: int = 200,
) -> List[Dict[str, Any]]:
    return await db.support_subscriptions.find({}, {"_id": 0}).sort(
        "created_at", -1
    ).to_list(limit)


__all__ = [
    "support_sub_client_router",
    "support_sub_admin_router",
    "seed_support_plans",
    "provision_bundled_support_subscription",
    "expire_overdue_subscriptions",
    "activate_paid_support_subscription",
    "PACKAGE_TO_SUPPORT_TIER",
    "SUPPORT_PLAN_CATALOG",
    "SUPPORT_TIERS",
    "TIER_RANK",
]
