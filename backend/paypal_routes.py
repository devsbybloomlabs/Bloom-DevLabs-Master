"""PayPal API routes — public (checkout) + admin (webhook management)."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from auth import get_current_user
from db_utils import prepare_for_mongo
from paypal_client import PayPalClient

log = logging.getLogger("paypal_routes")


# ---------- Helpers ----------
def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_pp(request: Request) -> PayPalClient:
    return request.app.state.paypal


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Plan tier configuration. Prices in USD by default.
PACKAGE_TIERS: Dict[str, Dict[str, Any]] = {
    "express": {"name": "Express Launch", "price": "5995.00", "kind": "one_time"},
    "custom": {"name": "Custom Build", "price": "8995.00", "kind": "one_time"},
    "enterprise": {"name": "Enterprise", "price": "14995.00", "kind": "one_time"},
}


# ---------- Request/response shapes ----------
class CreateOrderRequest(BaseModel):
    tier: Optional[str] = None  # express|custom|enterprise OR custom amount
    amount: Optional[str] = None  # required if tier == None
    currency: Optional[str] = None
    description: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    customer_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class CreateSubscriptionRequest(BaseModel):
    plan_key: str  # e.g., "server_management_basic" — admin pre-creates plans
    customer_email: Optional[EmailStr] = None
    customer_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class CreateRecurringPlanRequest(BaseModel):
    """Admin: spin up a new subscription plan (e.g. Server Management Tier 2)."""
    name: str  # "Server Management — Tier 2"
    description: Optional[str] = None
    price: str  # "299.00"
    currency: Optional[str] = None
    interval_unit: str = "MONTH"
    interval_count: int = 1
    plan_key: Optional[str] = None  # human-readable slug to reference later


# =============================================================================
# PUBLIC checkout router (no auth) — used by landing page Smart Buttons
# =============================================================================
paypal_router = APIRouter(prefix="/paypal", tags=["paypal"])


@paypal_router.get("/config")
async def paypal_config(pp: PayPalClient = Depends(get_pp)) -> Dict[str, Any]:
    """Public config so frontend can init JS SDK with the right client_id + env."""
    return {
        "configured": pp.is_configured,
        "client_id": pp.client_id if pp.is_configured else "",
        "env": pp.env,
        "currency": pp.default_currency,
    }


@paypal_router.post("/orders")
async def create_order(
    req: CreateOrderRequest,
    request: Request,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")

    # Resolve amount
    amount = req.amount
    tier = (req.tier or "").lower() if req.tier else None
    description = req.description
    if tier and tier in PACKAGE_TIERS:
        amount = amount or PACKAGE_TIERS[tier]["price"]
        description = description or PACKAGE_TIERS[tier]["name"]
    if not amount:
        raise HTTPException(400, "amount or valid tier required")

    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    res = await pp.create_order(
        amount=amount,
        currency=req.currency,
        reference_id=tier or "custom",
        description=description or "Bloom Labs Service",
        custom_id=req.customer_email or "guest",
        return_url=f"{base}/checkout/success",
        cancel_url=f"{base}/checkout/cancel",
    )
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal create order failed")

    order = res["data"]
    # Persist a "pending" record
    doc = {
        "id": order["id"],
        "kind": "order",
        "status": order.get("status", "CREATED"),
        "tier": tier,
        "amount": amount,
        "currency": req.currency or pp.default_currency,
        "customer_email": req.customer_email,
        "customer_name": req.customer_name,
        "description": description,
        "metadata": req.metadata or {},
        "raw": order,
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.paypal_transactions.update_one(
        {"id": order["id"]}, {"$set": prepare_for_mongo(doc)}, upsert=True
    )
    return {"id": order["id"], "status": order.get("status")}


@paypal_router.post("/orders/{order_id}/capture")
async def capture_order(
    order_id: str,
    request: Request,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    res = await pp.capture_order(order_id)
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal capture failed")
    capture = res["data"]
    status_str = capture.get("status", "")
    # Extract payer info
    payer = capture.get("payer", {}) or {}
    payer_email = payer.get("email_address")
    payer_name = " ".join(
        filter(None, [
            (payer.get("name") or {}).get("given_name"),
            (payer.get("name") or {}).get("surname"),
        ])
    ).strip() or None

    update = {
        "status": status_str,
        "captured_at": _now().isoformat(),
        "raw_capture": capture,
        "updated_at": _now().isoformat(),
    }
    if payer_email:
        update["customer_email"] = payer_email
    if payer_name:
        update["customer_name"] = payer_name
    await db.paypal_transactions.update_one(
        {"id": order_id}, {"$set": update}, upsert=True
    )

    # Auto-provision client account on COMPLETED
    if status_str == "COMPLETED" and payer_email:
        try:
            from client_routes import auto_provision_client_from_payment

            await auto_provision_client_from_payment(
                db,
                request,
                email=payer_email,
                name=payer_name or payer_email.split("@")[0],
                source="paypal_order",
                source_id=order_id,
            )
        except Exception as exc:
            log.exception("Auto-provision client failed: %s", exc)

    return {"id": order_id, "status": status_str, "payer_email": payer_email}


@paypal_router.post("/subscriptions")
async def create_subscription(
    req: CreateSubscriptionRequest,
    request: Request,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")

    # Look up plan by key
    plan_doc = await db.paypal_plans.find_one({"plan_key": req.plan_key}, {"_id": 0})
    if not plan_doc:
        raise HTTPException(404, f"Plan '{req.plan_key}' not found. Admin must create it first.")

    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    name_parts = (req.customer_name or "").split(" ", 1)
    subscriber_name: Optional[Dict[str, str]] = None
    if name_parts and name_parts[0]:
        subscriber_name = {
            "given_name": name_parts[0],
            "surname": name_parts[1] if len(name_parts) > 1 else "",
        }
    res = await pp.create_subscription(
        plan_id=plan_doc["plan_id"],
        subscriber_email=req.customer_email,
        subscriber_name=subscriber_name,
        custom_id=req.customer_email or "guest",
        return_url=f"{base}/checkout/success?type=subscription",
        cancel_url=f"{base}/checkout/cancel",
    )
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal subscription create failed")
    sub = res["data"]
    approval_link = next(
        (lk["href"] for lk in (sub.get("links") or []) if lk.get("rel") == "approve"),
        None,
    )

    doc = {
        "id": sub["id"],
        "plan_id": plan_doc["plan_id"],
        "plan_key": req.plan_key,
        "status": sub.get("status", "APPROVAL_PENDING"),
        "customer_email": req.customer_email,
        "customer_name": req.customer_name,
        "metadata": req.metadata or {},
        "raw": sub,
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.paypal_subscriptions.update_one(
        {"id": sub["id"]}, {"$set": prepare_for_mongo(doc)}, upsert=True
    )
    return {
        "id": sub["id"],
        "status": sub.get("status"),
        "approval_url": approval_link,
    }


@paypal_router.get("/subscriptions/{sub_id}")
async def get_subscription_status(
    sub_id: str,
    pp: PayPalClient = Depends(get_pp),
) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    res = await pp.get_subscription(sub_id)
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal subscription lookup failed")
    return res["data"]


# =============================================================================
# ADMIN router (auth required) — plan creation + transaction listing
# =============================================================================
paypal_admin_router = APIRouter(
    prefix="/paypal/admin",
    tags=["paypal-admin"],
    dependencies=[Depends(get_current_user)],
)


@paypal_admin_router.get("/health")
async def health(pp: PayPalClient = Depends(get_pp)) -> Dict[str, Any]:
    if not pp.is_configured:
        return {"configured": False, "env": pp.env, "ok": False}
    token = await pp._get_access_token()
    return {"configured": True, "env": pp.env, "ok": bool(token)}


@paypal_admin_router.get("/plans")
async def list_plans(db: AsyncIOMotorDatabase = Depends(get_db)) -> List[Dict[str, Any]]:
    docs = await db.paypal_plans.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@paypal_admin_router.post("/plans")
async def create_recurring_plan(
    req: CreateRecurringPlanRequest,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")

    # 1) Create or reuse the product
    product_doc = await db.paypal_products.find_one({"name": req.name}, {"_id": 0})
    if not product_doc:
        prod_res = await pp.create_product(name=req.name, description=req.description)
        if not prod_res.get("success"):
            raise HTTPException(502, prod_res.get("error") or "create product failed")
        prod = prod_res["data"]
        product_doc = {
            "product_id": prod["id"],
            "name": prod.get("name") or req.name,
            "description": prod.get("description") or req.description,
            "created_at": _now().isoformat(),
        }
        await db.paypal_products.insert_one(prepare_for_mongo(product_doc))
        product_doc.pop("_id", None)

    # 2) Create the plan
    plan_res = await pp.create_plan(
        product_id=product_doc["product_id"],
        name=req.name,
        price=req.price,
        description=req.description,
        currency=req.currency,
        interval_unit=req.interval_unit,
        interval_count=req.interval_count,
    )
    if not plan_res.get("success"):
        raise HTTPException(502, plan_res.get("error") or "create plan failed")
    plan = plan_res["data"]

    plan_key = req.plan_key or req.name.lower().replace(" ", "_").replace("—", "-")
    doc = {
        "plan_id": plan["id"],
        "plan_key": plan_key,
        "product_id": product_doc["product_id"],
        "name": req.name,
        "description": req.description,
        "price": req.price,
        "currency": req.currency or pp.default_currency,
        "interval_unit": req.interval_unit,
        "interval_count": req.interval_count,
        "status": plan.get("status", "ACTIVE"),
        "created_at": _now().isoformat(),
    }
    await db.paypal_plans.insert_one(prepare_for_mongo(doc))
    doc.pop("_id", None)
    return doc


@paypal_admin_router.get("/transactions")
async def list_transactions(
    db: AsyncIOMotorDatabase = Depends(get_db),
    limit: int = 100,
) -> List[Dict[str, Any]]:
    docs = await db.paypal_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@paypal_admin_router.get("/subscriptions")
async def list_subscriptions(
    db: AsyncIOMotorDatabase = Depends(get_db),
    limit: int = 100,
) -> List[Dict[str, Any]]:
    docs = await db.paypal_subscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@paypal_admin_router.post("/webhooks/register")
async def register_webhook(
    pp: PayPalClient = Depends(get_pp),
) -> Dict[str, Any]:
    """Register Bloom Labs webhook URL with PayPal."""
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    target = os.environ.get(
        "PAYPAL_WEBHOOK_TARGET_URL",
        f"{os.environ.get('APP_BASE_URL', 'https://bybloomlabs.com').rstrip('/')}/api/webhooks/paypal",
    )
    events = [
        "PAYMENT.CAPTURE.COMPLETED",
        "PAYMENT.CAPTURE.DENIED",
        "PAYMENT.CAPTURE.REFUNDED",
        "CHECKOUT.ORDER.APPROVED",
        "BILLING.SUBSCRIPTION.ACTIVATED",
        "BILLING.SUBSCRIPTION.CANCELLED",
        "BILLING.SUBSCRIPTION.EXPIRED",
        "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
        "BILLING.SUBSCRIPTION.SUSPENDED",
    ]
    res = await pp.create_webhook(target, events)
    if not res.get("success"):
        # If already exists, list webhooks
        list_res = await pp.list_webhooks()
        return {
            "ok": False,
            "error": res.get("error"),
            "existing": (list_res.get("data") or {}).get("webhooks", []),
        }
    return {"ok": True, "webhook": res["data"], "target": target}


@paypal_admin_router.get("/webhooks")
async def list_pp_webhooks(pp: PayPalClient = Depends(get_pp)) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    res = await pp.list_webhooks()
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "list webhooks failed")
    return res["data"]
