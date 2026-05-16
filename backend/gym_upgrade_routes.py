"""
Prototype → Full Build self-serve upgrade flow.

When a client has paid for the $2,995 `gym_prototype` tier and is within
14 days of that purchase, they can one-click upgrade to `gym_custom`
($8,995) with an automatic $1,000 credit (final price $7,995).

The whole eligibility check lives server-side so a client can't forge
the discount by hand-rolling a PayPal order.

Endpoints (all under `/api/clients`):
  GET  /orders/upgrade-eligibility       → list of eligible prototype orders
  POST /orders/{order_id}/upgrade        → mint a discounted PayPal order
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from client_routes import get_current_client
from paypal_client import PayPalClient
from paypal_routes import PACKAGE_TIERS, get_pp


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db

UPGRADE_WINDOW_DAYS = 14
UPGRADE_CREDIT = 1000.00

# Map starter tier → target upgrade tier. Each pair shares the $1,000 credit
# offer + 14-day window.
UPGRADE_PATHS: Dict[str, str] = {
    "gym_prototype": "gym_custom",
    "coach_starter": "coach_premium",
}


def _target_tier_for(starter_tier: str) -> Optional[str]:
    return UPGRADE_PATHS.get(starter_tier)


# ----------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            return None
    return None


def _is_paid(status: str) -> bool:
    return (status or "").upper() in {"COMPLETED", "CAPTURED", "APPROVED", "PAID"}


async def _check_eligibility(
    db: AsyncIOMotorDatabase, order: Dict[str, Any], client_email: str
) -> Dict[str, Any]:
    """Return eligibility verdict for a single starter-tier order."""
    reasons: List[str] = []
    starter_tier = (order.get("tier") or "").lower()
    target_tier = _target_tier_for(starter_tier)

    if target_tier is None:
        reasons.append(f"tier {order.get('tier')!r} is not an upgradeable starter")
    if (order.get("customer_email") or "").lower() != client_email.lower():
        reasons.append("order does not belong to this client")
    if not _is_paid(order.get("status", "")):
        reasons.append(f"order status {order.get('status')!r} is not paid")

    created_dt = _parse_dt(order.get("created_at"))
    if created_dt is None:
        reasons.append("could not parse order created_at")
        days_remaining = 0
    else:
        elapsed = (_now() - created_dt).total_seconds() / 86400.0
        days_remaining = max(0, UPGRADE_WINDOW_DAYS - int(elapsed))
        if elapsed > UPGRADE_WINDOW_DAYS:
            reasons.append(f"upgrade window expired ({elapsed:.1f} days since purchase)")

    # Already-upgraded guard
    existing = await db.paypal.find_one(
        {"metadata.upgrade_from": order["id"]},
        {"_id": 0, "id": 1, "status": 1},
    )
    if existing:
        reasons.append(f"already upgraded via order {existing.get('id')}")

    eligible = len(reasons) == 0
    target_name = PACKAGE_TIERS[target_tier]["name"] if target_tier else None
    target_price = PACKAGE_TIERS[target_tier]["price"] if target_tier else None
    discounted = (
        f"{float(target_price) - UPGRADE_CREDIT:.2f}" if target_price else None
    )
    return {
        "eligible": eligible,
        "reasons": reasons,
        "days_remaining": days_remaining,
        "credit_amount": UPGRADE_CREDIT,
        "discounted_price": discounted or "0.00",
        "target_tier": target_tier,
        "target_tier_name": target_name,
    }


# ----------------------------------------------------------------------------
gym_upgrade_router = APIRouter(prefix="/clients/orders", tags=["client-upgrades"])


@gym_upgrade_router.get("/upgrade-eligibility")
async def list_upgrade_eligible_orders(
    client=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Return every prototype order the client could still upgrade."""
    client_email = (client.get("email") or "").lower()
    cursor = db.paypal.find(
        {
            "kind": "order",
            "tier": {"$in": list(UPGRADE_PATHS.keys())},
            "customer_email": client_email,
        },
        {"_id": 0},
    ).sort("created_at", -1)
    results = []
    async for order in cursor:
        verdict = await _check_eligibility(db, order, client_email)
        results.append(
            {
                "order_id": order["id"],
                "amount": order.get("amount"),
                "created_at": order.get("created_at"),
                **verdict,
            }
        )
    return {"orders": results}


@gym_upgrade_router.post("/{order_id}/upgrade")
async def upgrade_prototype(
    order_id: str,
    request: Request,
    client=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
    pp: PayPalClient = Depends(get_pp),
) -> Dict[str, Any]:
    """Create a discounted PayPal order for the full build upgrade.

    Server-side validates eligibility, then mints a fresh PayPal order at
    $7,995 with full upgrade metadata so admin sees the linkage in
    `/admin/paypal-orders`.
    """
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")

    order = await db.paypal.find_one({"id": order_id, "kind": "order"}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Original order not found")

    client_email = (client.get("email") or "").lower()
    verdict = await _check_eligibility(db, order, client_email)
    if not verdict["eligible"]:
        raise HTTPException(
            400,
            f"Upgrade not eligible: {'; '.join(verdict['reasons'])}",
        )

    discounted = verdict["discounted_price"]
    target_tier = verdict["target_tier"]
    description = (
        f"{verdict['target_tier_name']} — starter upgrade "
        f"(${int(UPGRADE_CREDIT):,} credit applied)"
    )
    metadata = {
        "niche": PACKAGE_TIERS[target_tier].get("niche"),
        "upgrade_from": order_id,
        "upgrade_to": target_tier,
        "credit_applied": str(int(UPGRADE_CREDIT)),
        "original_tier": order.get("tier"),
        "inclusions": PACKAGE_TIERS[target_tier].get("inclusions"),
    }

    pp_order = await pp.create_order(
        amount=discounted,
        currency=order.get("currency") or pp.default_currency,
        description=description,
        custom_id=f"upgrade:{order_id}",
    )

    doc = {
        "id": pp_order["id"],
        "kind": "order",
        "status": pp_order.get("status", "CREATED"),
        "tier": target_tier,
        "niche": PACKAGE_TIERS[target_tier].get("niche"),
        "amount": discounted,
        "currency": order.get("currency") or pp.default_currency,
        "customer_email": client_email,
        "customer_name": order.get("customer_name") or client.get("name"),
        "description": description,
        "metadata": metadata,
        "raw": pp_order,
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.paypal.insert_one(doc)
    # Strip _id mongo inserts onto doc before returning.
    doc.pop("_id", None)
    return {
        "ok": True,
        "paypal_order_id": pp_order["id"],
        "amount": discounted,
        "credit_applied": str(int(UPGRADE_CREDIT)),
        "original_order_id": order_id,
    }


__all__ = ["gym_upgrade_router", "_check_eligibility", "UPGRADE_WINDOW_DAYS", "UPGRADE_PATHS"]
