"""PayPal API routes — public (checkout) + admin (webhook management)."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

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
#
# Niche-specific tiers (e.g. gym_express) carry the same prices as the
# generic packages but a different `description` + `niche` so the captured
# order shows up tagged correctly in /admin/paypal-orders. Each niche tier
# maps back to a generic support tier via PACKAGE_TO_SUPPORT_TIER.
PACKAGE_TIERS: Dict[str, Dict[str, Any]] = {
    "express": {"name": "Express Launch", "price": "5995.00", "kind": "one_time"},
    "custom": {"name": "Custom Build", "price": "8995.00", "kind": "one_time"},
    "enterprise": {"name": "Enterprise", "price": "14995.00", "kind": "one_time"},
    # ---- Gym Owners niche (Feb 2026) ----
    "gym_prototype": {
        "name": "Gym Prototype",
        "price": "2995.00",
        "kind": "one_time",
        "niche": "gym_owners",
        "support_tier": "standard",
        "timeline": "24 hours",
        "full_upfront_discount": 0,
        "inclusions": [
            "Working dashboard (member tracking)",
            "1 automated-email template",
            "Discovery call + demo session",
            "$1,000 credit toward full build (if upgrading within 14 days)",
        ],
    },
    "gym_express": {
        "name": "Gym Express Launch",
        "price": "5995.00",
        "kind": "one_time",
        "niche": "gym_owners",
        "support_tier": "standard",
        "timeline": "10-14 days",
        "inclusions": [
            "Member management dashboard",
            "Automated email sequences",
            "Basic analytics",
            "30-day support",
        ],
    },
    "gym_custom": {
        "name": "Gym Custom Build",
        "price": "8995.00",
        "kind": "one_time",
        "niche": "gym_owners",
        "support_tier": "premium",
        "timeline": "20-28 days",
        "inclusions": [
            "Everything in Gym Express",
            "Lead-capture funnel",
            "Payment integration (Stripe/Square)",
            "Member mobile app",
            "Advanced analytics + churn predictor",
            "60-day support",
        ],
    },
    "gym_enterprise": {
        "name": "Gym Enterprise",
        "price": "14995.00",
        "kind": "one_time",
        "niche": "gym_owners",
        "support_tier": "vip",
        "timeline": "28-35 days",
        "inclusions": [
            "Everything in Gym Custom Build",
            "Multi-location support",
            "Predictive analytics + cohort modelling",
            "White-label option",
            "Additional revenue-stream module",
        ],
    },
    # ---- Coaches & Consultants niche (Feb 2026) ----
    "coach_starter": {
        "name": "Coach Starter Website",
        "price": "2995.00",
        "kind": "one_time",
        "niche": "coaches",
        "support_tier": "standard",
        "timeline": "24 hours",
        "full_upfront_discount": 0,
        "inclusions": [
            "Professional custom website (mobile-optimized)",
            "One-click booking system with calendar sync",
            "Payment processing (Stripe/PayPal)",
            "Basic client dashboard",
            "30-day support + $1,000 credit toward Premium upgrade (14 days)",
        ],
    },
    "coach_premium": {
        "name": "Coach Premium Website",
        "price": "8995.00",
        "kind": "one_time",
        "niche": "coaches",
        "support_tier": "premium",
        "timeline": "4 weeks",
        "inclusions": [
            "Everything in Coach Starter",
            "Advanced customization + video intro section",
            "Resource library + downloadable assets",
            "Advanced analytics dashboard",
            "Email automation (confirmations, reminders, follow-ups)",
            "60-day support",
        ],
    },
    "coach_enterprise": {
        "name": "Coach Enterprise",
        "price": "14995.00",
        "kind": "one_time",
        "niche": "coaches",
        "support_tier": "vip",
        "timeline": "5-6 weeks",
        "inclusions": [
            "Everything in Coach Premium",
            "Multi-service offerings (1-on-1, group, workshops)",
            "Advanced integrations (CRM, marketing automation)",
            "White-label options",
            "Dedicated account manager",
        ],
    },
    # ---- Real Estate Agents niche (Feb 2026) ----
    "realestate_starter": {
        "name": "Real Estate Starter Website",
        "price": "2995.00",
        "kind": "one_time",
        "niche": "real-estate",
        "support_tier": "standard",
        "timeline": "24 hours",
        "full_upfront_discount": 0,
        "inclusions": [
            "Professional MLS-integrated website (mobile-optimized)",
            "Auto-sync listings from your MLS (any MLS with API)",
            "Lead-capture forms on every page",
            "Email lead dashboard",
            "30-day support + $1,000 credit toward Premium upgrade (14 days)",
        ],
    },
    "realestate_premium": {
        "name": "Real Estate Premium Website",
        "price": "8995.00",
        "kind": "one_time",
        "niche": "real-estate",
        "support_tier": "premium",
        "timeline": "4 weeks",
        "inclusions": [
            "Everything in Starter",
            "Advanced CRM + lead-scoring",
            "Drip email campaigns (buyer / seller / inquiry tracks)",
            "SMS follow-up automation",
            "Video hosting + listing video tours",
            "Custom integrations (Zillow, Realtor.com, CRMs)",
            "60-day support",
        ],
    },
    "realestate_enterprise": {
        "name": "Real Estate Enterprise / Team",
        "price": "14995.00",
        "kind": "one_time",
        "niche": "real-estate",
        "support_tier": "vip",
        "timeline": "5-6 weeks",
        "inclusions": [
            "Everything in Premium",
            "Multi-agent / team-routing system",
            "White-label branding for brokerage",
            "Multi-location / multi-market support",
            "Dedicated account manager",
        ],
    },
}

# Niche-tier → generic-tier alias so support-tier provisioning + invoice
# auto-generation work unchanged. Order metadata still preserves the
# niche tier for analytics + admin filtering.
NICHE_TIER_ALIASES: Dict[str, str] = {
    "gym_express": "express",
    "gym_custom": "custom",
    "gym_enterprise": "enterprise",
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
    # Allow tier-specific override of the full-upfront discount. The prototype
    # tier (gym_prototype) sets this to 0 because it's already a low-friction
    # entry price and the 50/50 split doesn't make sense either.
    upfront_discount = float(cfg.get("full_upfront_discount", FULL_UPFRONT_DISCOUNT))
    if payment_plan == "full_upfront":
        discount = upfront_discount
        charge_now = max(0.0, base - discount)
        return {
            "base_amount": _money(base),
            "charge_now": _money(charge_now),
            "charge_later": "0.00",
            "discount_applied": _money(discount),
            "plan_label": (
                "100% upfront"
                if discount == 0
                else f"100% upfront — ${int(discount)} discount applied"
            ),
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
    niche: Optional[str] = None
    if tier and tier in PACKAGE_TIERS:
        cfg = PACKAGE_TIERS[tier]
        niche = cfg.get("niche")
        charge = compute_charge(tier, payment_plan or "split_50_50")
        amount = amount or charge["charge_now"]
        plan_suffix = (
            " — 50% deposit (1 of 2)"
            if payment_plan == "split_50_50"
            else " — full upfront (save $500)"
        )
        description = description or f"{cfg['name']}{plan_suffix}"
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
        "niche": niche,
        "amount": amount,
        "currency": req.currency or pp.default_currency,
        "customer_email": req.customer_email,
        "customer_name": req.customer_name,
        "description": description,
        "metadata": {
            **(req.metadata or {}),
            **({"niche": niche, "inclusions": PACKAGE_TIERS[tier].get("inclusions"), "timeline": PACKAGE_TIERS[tier].get("timeline")} if tier and tier in PACKAGE_TIERS and PACKAGE_TIERS[tier].get("niche") else {}),
        },
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

    # If this capture is paying off a manually-issued invoice (via the public
    # pay-this-invoice link), mark that invoice as paid.
    linked_invoice_id = existing.get("linked_invoice_id") if existing else None
    if status_str == "COMPLETED" and linked_invoice_id:
        try:
            inv = await db.invoices.find_one({"id": linked_invoice_id}, {"_id": 0})
            if inv and inv.get("status") != "paid":
                amount_paid = float(existing.get("amount") or 0)
                new_balance = max(0.0, float(inv.get("total") or 0) - amount_paid)
                inv_update = {
                    "amount_paid": amount_paid,
                    "balance_due": new_balance,
                    "paid_at": _now().isoformat() if new_balance == 0 else inv.get("paid_at"),
                    "status": "paid" if new_balance == 0 else "partial",
                    "paypal_order_id": order_id,
                    "updated_at": _now().isoformat(),
                }
                await db.invoices.update_one(
                    {"id": linked_invoice_id}, {"$set": prepare_for_mongo(inv_update)}
                )
                # Re-render the PDF so the cached file reflects PAID status
                try:
                    import invoice_service

                    fresh = await db.invoices.find_one({"id": linked_invoice_id}, {"_id": 0})
                    await invoice_service.cache_invoice_pdf(db, fresh)
                except Exception as exc:  # pragma: no cover
                    log.warning("Invoice PDF re-cache failed: %s", exc)
        except Exception as exc:  # pragma: no cover
            log.warning("Could not mark invoice %s paid: %s", linked_invoice_id, exc)

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
            # Phase H: auto-provision 1-yr free support subscription based on package tier.
            try:
                from support_subscription_routes import (
                    provision_bundled_support_subscription,
                )

                fresh_txn = await db.paypal_transactions.find_one(
                    {"id": order_id}, {"_id": 0}
                ) or {}
                package_tier = (fresh_txn.get("tier") or "").lower()
                if package_tier:
                    company = await db.companies.find_one(
                        {"primary_email": payer_email.lower()}, {"_id": 0}
                    )
                    if company:
                        await provision_bundled_support_subscription(
                            db, company, package_tier
                        )
            except Exception as exc:
                log.exception("Support subscription auto-provision failed: %s", exc)

            # V3: kick off the 5-step prototype → full-build nurture drip on
            # `gym_prototype` captures. Idempotent.
            try:
                fresh_order = await db.paypal.find_one(
                    {"id": order_id, "kind": "order"}, {"_id": 0}
                )
                if fresh_order and (fresh_order.get("tier") or "").lower() == "gym_prototype":
                    from gym_prototype_drip import enqueue_prototype_drip

                    await enqueue_prototype_drip(db, fresh_order)
            except Exception as exc:
                log.exception("Prototype drip enqueue failed: %s", exc)
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



# =========================================================================
# Phase D — PayPal Refunds (full + partial)
# =========================================================================
class RefundRequest(BaseModel):
    amount: Optional[str] = None  # Omit for full refund; pass to do partial
    reason: str = Field(
        default="client_request",
        pattern="^(client_request|duplicate|mistake|quality_issue|fraud|other)$",
    )
    note: Optional[str] = None  # Internal note (saved on the transaction)
    note_to_payer: Optional[str] = None  # Shown in PayPal receipt email
    notify_client: bool = True  # Send branded refund email


def _find_capture_id(transaction: Dict[str, Any]) -> Optional[str]:
    """Dig into the PayPal Order's payload to find the capture id.

    Capture data is added by PayPal after `capture_order` is called.
    Stored at `raw.purchase_units[*].payments.captures[*].id`.
    """
    raw = transaction.get("raw") or {}
    for unit in raw.get("purchase_units") or []:
        captures = ((unit.get("payments") or {}).get("captures")) or []
        for cap in captures:
            cap_id = cap.get("id")
            if cap_id:
                return cap_id
    # Fallback: if our local row IS a capture (kind=="capture"), id is the capture id
    if (transaction.get("kind") or "") == "capture":
        return transaction.get("id") or transaction.get("capture_id")
    return transaction.get("capture_id")


@paypal_admin_router.post("/transactions/{order_id}/refund")
async def refund_transaction(
    order_id: str,
    req: RefundRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Issue a refund against a captured PayPal order.

    Steps:
      1. Look up our local transaction row.
      2. Find the underlying capture id (returned by PayPal after capture).
      3. Call PayPal `POST /v2/payments/captures/{cap_id}/refund`.
      4. Persist the refund_id + status + reason + amount on the txn.
      5. If linked to an invoice, mark it refunded (or partially_refunded).
      6. activity_log → refund.issued. Slack alert + branded email.
    """
    pp: PayPalClient = request.app.state.paypal
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")

    txn = await db.paypal_transactions.find_one({"id": order_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Transaction not found")

    if txn.get("refund_id"):
        raise HTTPException(409, "This order has already been refunded")

    capture_id = _find_capture_id(txn)
    if not capture_id:
        raise HTTPException(
            400,
            "Could not find a capture id — the order may not have been captured yet.",
        )

    # Optional: pre-validate the capture is in a refundable state via PayPal
    cap_check = await pp.get_capture(capture_id)
    if not cap_check.get("success"):
        raise HTTPException(502, cap_check.get("error") or "PayPal lookup failed")
    cap_status = (cap_check.get("data") or {}).get("status")
    if cap_status and cap_status.upper() not in ("COMPLETED", "PARTIALLY_REFUNDED"):
        raise HTTPException(
            400,
            f"Capture is in status {cap_status!r} — refund not allowed",
        )

    # Validate partial amount
    full_amount = float(txn.get("amount") or 0)
    refund_amount: Optional[float] = None
    is_partial = False
    if req.amount is not None:
        try:
            refund_amount = float(req.amount)
        except (TypeError, ValueError):
            raise HTTPException(422, "Amount must be a number")
        if refund_amount <= 0 or refund_amount > full_amount:
            raise HTTPException(422, "Refund amount must be between 0 and the full order total")
        is_partial = refund_amount < full_amount

    res = await pp.refund_capture(
        capture_id,
        amount=req.amount if req.amount is not None else None,
        currency=txn.get("currency"),
        note_to_payer=req.note_to_payer,
        invoice_id=txn.get("invoice_number"),
    )
    if not res.get("success"):
        raise HTTPException(502, f"PayPal refund failed: {res.get('error')}")
    pp_refund = res.get("data") or {}
    refund_id = pp_refund.get("id")
    refund_status = (pp_refund.get("status") or "").upper()
    refund_value = (pp_refund.get("amount") or {}).get("value") or str(req.amount or full_amount)

    now_iso = _now().isoformat()
    update_payload: Dict[str, Any] = {
        "refund_id": refund_id,
        "refund_status": refund_status,
        "refund_amount": str(refund_value),
        "refund_reason": req.reason,
        "refund_note": req.note,
        "refunded_at": now_iso,
        "status": "PARTIALLY_REFUNDED" if is_partial else "REFUNDED",
        "updated_at": now_iso,
    }
    await db.paypal_transactions.update_one({"id": order_id}, {"$set": update_payload})

    # If linked to an invoice, mark it refunded
    if txn.get("linked_invoice_id"):
        try:
            from invoice_service import mark_invoice_refunded

            await mark_invoice_refunded(
                db,
                invoice_id=txn["linked_invoice_id"],
                amount=float(refund_value),
                refund_id=refund_id,
                is_partial=is_partial,
            )
        except Exception as exc:  # pragma: no cover
            log.warning("Invoice refund-mark failed: %s", exc)

    # Activity log
    try:
        from activity_log import log_activity

        await log_activity(
            db,
            company_email=txn.get("customer_email"),
            type="refund.issued",
            title=f"Refund issued — {txn.get('currency', 'USD')} {refund_value}",
            description=(
                f"Reason: {req.reason}. Note: {req.note or '—'}. "
                f"PayPal refund_id: {refund_id}."
            ),
            meta={
                "order_id": order_id,
                "refund_id": refund_id,
                "amount": refund_value,
                "is_partial": is_partial,
            },
        )
    except Exception:
        pass

    # Slack alert
    try:
        import slack_notifier

        slack_text = (
            f"💸 *Refund issued* `{txn.get('currency', 'USD')} {refund_value}` "
            f"(reason: {req.reason})\n"
            f"Order: `{order_id}` · refund: `{refund_id}`\n"
            f"Client: {txn.get('customer_email', '—')}"
        )
        await slack_notifier.post_message(db, text=slack_text)
    except Exception:  # pragma: no cover
        pass

    # Branded email
    if req.notify_client and txn.get("customer_email"):
        try:
            from email_service import send_refund_issued

            emailit = request.app.state.emailit
            await send_refund_issued(
                emailit,
                to=txn["customer_email"],
                name=txn.get("customer_name") or txn["customer_email"].split("@")[0],
                order_id=order_id,
                amount=f"{float(refund_value):.2f}",
                currency=txn.get("currency", "USD"),
                is_partial=is_partial,
                reason=req.reason,
                paypal_refund_id=refund_id,
            )
        except Exception as exc:  # pragma: no cover
            log.warning("Refund email failed: %s", exc)

    return {
        "ok": True,
        "order_id": order_id,
        "refund_id": refund_id,
        "refund_status": refund_status,
        "amount": refund_value,
        "is_partial": is_partial,
        "paypal_activity_url": (
            f"https://www.{'sandbox.' if pp.env == 'sandbox' else ''}paypal.com/"
            f"activity/payment/{order_id}"
        ),
    }


@paypal_admin_router.get("/transactions/{order_id}/refund-info")
async def get_refund_info(
    order_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Inspect a transaction's refundability — used by the admin UI before
    showing the refund button."""
    txn = await db.paypal_transactions.find_one({"id": order_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Not found")
    capture_id = _find_capture_id(txn)
    already_refunded = bool(txn.get("refund_id"))
    return {
        "order_id": order_id,
        "currency": txn.get("currency"),
        "amount": txn.get("amount"),
        "has_capture": bool(capture_id),
        "capture_id": capture_id,
        "already_refunded": already_refunded,
        "refund_status": txn.get("refund_status"),
        "refund_amount": txn.get("refund_amount"),
        "refundable": bool(capture_id) and not already_refunded,
    }
