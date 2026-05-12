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

# Payment plan configuration
PAYMENT_PLANS = ("split_50_50", "full_upfront")
FULL_UPFRONT_DISCOUNT = 500.00


def _money(val: float) -> str:
    """Format a float as a 2-dp money string suitable for PayPal."""
    return f"{round(val + 1e-9, 2):.2f}"


def compute_charge(tier: str, payment_plan: str) -> Dict[str, Any]:
    """Resolve base price + payment plan → charge breakdown.

    Returns:
      base_amount, charge_now, charge_later, discount_applied, plan_label,
      installment_index (1 for the initial charge).
    """
    cfg = PACKAGE_TIERS[tier]
    base = float(cfg["price"])
    if payment_plan == "full_upfront":
        discount = FULL_UPFRONT_DISCOUNT
        charge_now = max(0.0, base - discount)
        return {
            "base_amount": _money(base),
            "charge_now": _money(charge_now),
            "charge_later": "0.00",
            "discount_applied": _money(discount),
            "plan_label": "100% upfront — $500 discount applied",
            "installment_index": 1,
        }
    # default: split_50_50
    half = round(base / 2.0, 2)
    return {
        "base_amount": _money(base),
        "charge_now": _money(half),
        "charge_later": _money(base - half),
        "discount_applied": "0.00",
        "plan_label": "50% now / 50% at launch",
        "installment_index": 1,
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
    payment_plan: Optional[str] = None  # split_50_50 | full_upfront


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

    # Payment plan applies only to tier-based checkout. Custom amounts use req.amount as-is.
    payment_plan = (req.payment_plan or "split_50_50").lower() if tier else None
    if payment_plan and payment_plan not in PAYMENT_PLANS:
        raise HTTPException(400, f"Invalid payment_plan. Use one of: {', '.join(PAYMENT_PLANS)}")

    charge: Optional[Dict[str, Any]] = None
    if tier and tier in PACKAGE_TIERS:
        charge = compute_charge(tier, payment_plan or "split_50_50")
        amount = amount or charge["charge_now"]
        plan_suffix = (
            " — 50% deposit (1 of 2)"
            if payment_plan == "split_50_50"
            else " — full upfront (save $500)"
        )
        description = description or f"{PACKAGE_TIERS[tier]['name']}{plan_suffix}"
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
    if charge:
        doc.update({
            "payment_plan": payment_plan,
            "plan_label": charge["plan_label"],
            "base_amount": charge["base_amount"],
            "charge_now": charge["charge_now"],
            "charge_later": charge["charge_later"],
            "discount_applied": charge["discount_applied"],
            "installment_index": charge["installment_index"],
            "installment_2_status": "pending_capture" if payment_plan == "split_50_50" else "not_applicable",
        })
    await db.paypal_transactions.update_one(
        {"id": order["id"]}, {"$set": prepare_for_mongo(doc)}, upsert=True
    )
    return {
        "id": order["id"],
        "status": order.get("status"),
        "amount": amount,
        "currency": doc["currency"],
        "payment_plan": payment_plan,
        "charge_later": charge["charge_later"] if charge else None,
        "discount_applied": charge["discount_applied"] if charge else None,
    }


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

    # Flag remaining installment for split 50/50 plans so admin can later
    # "Mark Ready for Launch" and bill the balance.
    existing = await db.paypal_transactions.find_one({"id": order_id}, {"_id": 0}) or {}
    if (
        status_str == "COMPLETED"
        and existing.get("payment_plan") == "split_50_50"
        and existing.get("installment_index") == 1
        and existing.get("installment_2_status") in (None, "pending_capture")
    ):
        update["installment_2_status"] = "pending_launch"

    # If this capture is for installment 2 of a split plan, mark parent as paid in full.
    parent_id = existing.get("parent_order_id") if existing else None
    if status_str == "COMPLETED" and parent_id and existing.get("installment_index") == 2:
        await db.paypal_transactions.update_one(
            {"id": parent_id},
            {"$set": {
                "installment_2_status": "paid",
                "installment_2_paid_at": _now().isoformat(),
                "updated_at": _now().isoformat(),
            }},
        )

    await db.paypal_transactions.update_one(
        {"id": order_id}, {"$set": update}, upsert=True
    )

    # Auto-provision client account on COMPLETED. Skip if this is the
    # 2nd installment of a split plan (parent capture already provisioned).
    skip_provision = bool(existing.get("parent_order_id"))
    if status_str == "COMPLETED" and payer_email and not skip_provision:
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
            # Also kick off onboarding flow
            from onboarding_routes import ensure_onboarding_for_payment

            await ensure_onboarding_for_payment(
                db,
                request,
                email=payer_email,
                name=payer_name or payer_email.split("@")[0],
                source="paypal_order",
                source_id=order_id,
            )
        except Exception as exc:
            log.exception("Auto-provision client/onboarding failed: %s", exc)

    # Branded payment receipt email — fires for installment 1, installment 2,
    # and one-shot full-upfront captures.
    if status_str == "COMPLETED" and payer_email:
        try:
            import email_service
            import invoice_service

            emailit = getattr(request.app.state, "emailit", None)
            fresh = await db.paypal_transactions.find_one({"id": order_id}, {"_id": 0}) or {}
            tier = (fresh.get("tier") or "").lower()
            plan_name = PACKAGE_TIERS.get(tier, {}).get("name") or fresh.get("description") or "Bloom Labs Service"
            if fresh.get("installment_index") == 2:
                plan_name = f"{plan_name} — Launch balance"

            # Generate internal invoice (replaces AgencyHandy invoice flow)
            invoice_doc = None
            try:
                invoice_doc = await invoice_service.get_or_create_invoice_for_capture(
                    db, {**fresh, "description": plan_name}
                )
                # Cache PDF in background (don't block receipt email)
                try:
                    await invoice_service.cache_invoice_pdf(db, invoice_doc)
                except Exception as exc:  # pragma: no cover
                    log.warning("Invoice PDF cache failed: %s", exc)
            except Exception as exc:  # pragma: no cover
                log.warning("Invoice generation failed for %s: %s", order_id, exc)

            invoice_number = (
                invoice_doc["number"]
                if invoice_doc
                else f"INV-{order_id[-8:].upper()}"
            )

            await email_service.send_payment_receipt(
                emailit,
                to=payer_email,
                name=payer_name or payer_email.split("@")[0],
                plan_name=plan_name,
                amount=fresh.get("amount") or "0.00",
                currency=fresh.get("currency") or pp.default_currency,
                order_id=order_id,
                invoice_number=invoice_number,
                payment_plan_label=fresh.get("plan_label"),
                charge_later=fresh.get("charge_later"),
            )
        except Exception as exc:  # pragma: no cover
            log.warning("Receipt email failed for %s: %s", order_id, exc)

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


class MarkReadyForLaunchRequest(BaseModel):
    amount_override: Optional[str] = None  # optional re-issue with different balance


@paypal_admin_router.post("/transactions/{order_id}/mark-ready-for-launch")
async def mark_ready_for_launch(
    order_id: str,
    request: Request,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
    req: MarkReadyForLaunchRequest = Body(default=MarkReadyForLaunchRequest()),
) -> Dict[str, Any]:
    """Bill the remaining 50% for a split-payment order.

    Creates a brand-new PayPal order for the `charge_later` balance,
    stores it linked to the parent, emails the client a payment link
    (best-effort) and returns the approval URL so the admin can copy it.

    Optional `amount_override` lets admin re-issue with a different total
    (e.g. after a scope change). Defaults to the originally computed balance.
    """
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    parent = await db.paypal_transactions.find_one({"id": order_id}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Order not found")
    if parent.get("payment_plan") != "split_50_50":
        raise HTTPException(400, "Order is not on a 50/50 split plan")
    if parent.get("installment_index") != 1:
        raise HTTPException(400, "Only the first installment can trigger a launch charge")
    if parent.get("status") != "COMPLETED":
        raise HTTPException(400, "Initial 50% has not been captured yet")
    if parent.get("installment_2_status") == "paid":
        raise HTTPException(409, "Second installment already paid")
    if parent.get("installment_2_order_id"):
        # Idempotent: return existing pending order
        existing = await db.paypal_transactions.find_one(
            {"id": parent["installment_2_order_id"]}, {"_id": 0}
        ) or {}
        return {
            "id": existing.get("id"),
            "status": existing.get("status"),
            "approval_url": existing.get("approval_url"),
            "amount": existing.get("amount"),
            "currency": existing.get("currency"),
            "already_initiated": True,
        }

    # Resolve balance: optional override, else the original charge_later.
    if req.amount_override:
        try:
            override_val = float(req.amount_override)
        except (TypeError, ValueError):
            raise HTTPException(400, "amount_override must be a numeric string")
        if override_val <= 0:
            raise HTTPException(400, "amount_override must be positive")
        balance = _money(override_val)
    else:
        balance = parent.get("charge_later") or "0.00"
    if float(balance) <= 0:
        raise HTTPException(400, "No remaining balance to charge")

    tier = parent.get("tier") or "custom"
    base_url = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    description = f"{PACKAGE_TIERS.get(tier, {}).get('name', 'Bloom Labs Service')} — launch balance (2 of 2)"
    res = await pp.create_order(
        amount=balance,
        currency=parent.get("currency"),
        reference_id=f"{tier}-installment-2",
        description=description,
        custom_id=parent.get("customer_email") or "guest",
        return_url=f"{base_url}/checkout/success?installment=2",
        cancel_url=f"{base_url}/checkout/cancel",
    )
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal create order failed")
    order = res["data"]
    approval_url = next(
        (lk["href"] for lk in (order.get("links") or []) if lk.get("rel") == "approve"),
        None,
    )

    # Persist the new installment-2 order
    child_doc = {
        "id": order["id"],
        "kind": "order",
        "status": order.get("status", "CREATED"),
        "tier": tier,
        "amount": balance,
        "currency": parent.get("currency") or pp.default_currency,
        "customer_email": parent.get("customer_email"),
        "customer_name": parent.get("customer_name"),
        "description": description,
        "metadata": {"installment_of": order_id},
        "raw": order,
        "payment_plan": "split_50_50",
        "plan_label": "Launch balance (2 of 2)",
        "base_amount": parent.get("base_amount"),
        "charge_now": balance,
        "charge_later": "0.00",
        "discount_applied": "0.00",
        "installment_index": 2,
        "parent_order_id": order_id,
        "approval_url": approval_url,
        "amount_overridden": bool(req.amount_override),
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.paypal_transactions.insert_one(prepare_for_mongo(child_doc))
    child_doc.pop("_id", None)

    # Update parent
    await db.paypal_transactions.update_one(
        {"id": order_id},
        {"$set": {
            "installment_2_order_id": order["id"],
            "installment_2_status": "billed",
            "installment_2_billed_at": _now().isoformat(),
            "updated_at": _now().isoformat(),
        }},
    )

    # Best-effort email the client
    payer_email = parent.get("customer_email")
    payer_name = parent.get("customer_name") or (payer_email.split("@")[0] if payer_email else "there")
    if payer_email and approval_url:
        try:
            emailit = getattr(request.app.state, "emailit", None)
            if emailit and getattr(emailit, "is_configured", False):
                html = _launch_balance_email_html(
                    payer_name, balance, approval_url,
                    plan_name=PACKAGE_TIERS.get(tier, {}).get("name", "your project"),
                )
                await emailit.send_email(
                    to=payer_email,
                    subject="Your launch is ready — final 50% invoice",
                    html=html,
                    text=f"Hi {payer_name}, your project is ready for launch. "
                         f"Please complete the final 50% (${balance}): {approval_url}",
                )
        except Exception as exc:  # pragma: no cover
            log.warning("Emailit send failed for launch balance: %s", exc)

    # Notify admin so they have a record + manual fallback
    try:
        from models import NotificationItem

        notif = NotificationItem(
            kind="payment",
            title=f"🚀 Launch balance billed: {payer_email or order_id}",
            body=f"Order {order['id']} for ${balance} — approval URL: {approval_url}",
            link="/admin/paypal-orders",
        )
        await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    except Exception as exc:  # pragma: no cover
        log.warning("Failed to create launch notification: %s", exc)

    return {
        "id": order["id"],
        "status": order.get("status"),
        "approval_url": approval_url,
        "amount": balance,
        "currency": child_doc["currency"],
        "already_initiated": False,
    }


def _launch_balance_email_html(name: str, amount: str, approval_url: str, plan_name: str) -> str:
    return f"""
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;background:#F8FAFC;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <h1 style="margin:0 0 16px;font-size:22px;color:#1E3A8A;">{plan_name} — ready for launch 🚀</h1>
    <p style="line-height:1.6;color:#475569;">Hey {name}, your project has been marked <strong>Ready for Launch</strong>. To go live, please complete the remaining 50% balance below.</p>
    <p style="margin:28px 0;font-size:18px;"><strong>Balance due: ${amount}</strong></p>
    <p style="margin:28px 0;">
      <a href="{approval_url}" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;">Pay launch balance</a>
    </p>
    <p style="color:#94A3B8;font-size:12px;">Or copy this link: {approval_url}</p>
  </div>
</body></html>
""".strip()


class CancelInstallmentRequest(BaseModel):
    reason: Optional[str] = None


@paypal_admin_router.post("/transactions/{order_id}/cancel-installment-2")
async def cancel_installment_2(
    order_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    req: CancelInstallmentRequest = Body(default=CancelInstallmentRequest()),
) -> Dict[str, Any]:
    """Cancel an uncaptured launch-balance order so admin can re-issue or void.

    PayPal Orders v2 has no first-party void endpoint — uncaptured orders
    expire after 21 days. We mark the child VOIDED_LOCAL, clear the parent's
    `installment_2_order_id` and reset its status to `pending_launch` so the
    admin can either re-issue (optionally with a new amount) or simply walk
    away if the client churned.

    Refusing to cancel if the child has already been captured — for that
    case admin must refund through the PayPal dashboard (out of scope).
    """
    parent = await db.paypal_transactions.find_one({"id": order_id}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Order not found")
    if parent.get("payment_plan") != "split_50_50" or parent.get("installment_index") != 1:
        raise HTTPException(400, "Only split 50/50 parent orders support cancellation")
    child_id = parent.get("installment_2_order_id")
    if not child_id:
        raise HTTPException(400, "No installment-2 order to cancel")
    child = await db.paypal_transactions.find_one({"id": child_id}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Installment-2 order record missing")
    if child.get("status") == "COMPLETED":
        raise HTTPException(
            409,
            "Installment-2 already captured — issue a refund from the PayPal dashboard.",
        )

    now_iso = _now().isoformat()
    reason = (req.reason or "Cancelled by admin").strip()

    # Mark child as locally voided
    await db.paypal_transactions.update_one(
        {"id": child_id},
        {"$set": {
            "status": "VOIDED_LOCAL",
            "cancelled_at": now_iso,
            "cancel_reason": reason,
            "updated_at": now_iso,
        }},
    )

    # Reset parent so admin can re-mark Ready for Launch
    await db.paypal_transactions.update_one(
        {"id": order_id},
        {"$set": {
            "installment_2_status": "pending_launch",
            "updated_at": now_iso,
        }, "$unset": {
            "installment_2_order_id": "",
            "installment_2_billed_at": "",
        }},
    )

    return {
        "ok": True,
        "parent_id": order_id,
        "cancelled_child_id": child_id,
        "reason": reason,
        "parent_installment_2_status": "pending_launch",
    }


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
        "PAYMENT.SALE.COMPLETED",
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
