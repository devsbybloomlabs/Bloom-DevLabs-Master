"""Subscriptions — client-facing plan browser, subscribe flow, and
admin "assign add-on" surface.

The product/plan/subscription infrastructure (create_product, create_plan,
create_subscription, cancel) already lives in `paypal_client.py` and admin
plan creation is wired in `paypal_routes.paypal_admin_router.create_recurring_plan`.

This module adds:
  • GET   /api/clients/subscriptions/plans          — public-to-client plan catalog
  • POST  /api/clients/subscriptions/subscribe      — start subscription flow
  • GET   /api/clients/subscriptions                — list own subscriptions
  • POST  /api/clients/subscriptions/{id}/cancel    — cancel my subscription
  • POST  /api/admin/subscriptions/assign           — admin: generate a
        one-click subscribe link for any client (add-on attribution).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from auth import get_current_user
from client_routes import get_current_client
from db_utils import prepare_for_mongo
from paypal_client import PayPalClient

log = logging.getLogger("subscriptions")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_pp(request: Request) -> PayPalClient:
    return request.app.state.paypal


# Routers
subscription_client_router = APIRouter(
    prefix="/clients/subscriptions", tags=["subscriptions-client"]
)
subscription_admin_router = APIRouter(
    prefix="/admin/subscriptions", tags=["subscriptions-admin"]
)


# ============================================================
# Client-facing
# ============================================================

@subscription_client_router.get("/plans")
async def list_plans_for_client(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_client),
) -> List[Dict[str, Any]]:
    """List active subscription plan templates (add-ons) clients can purchase."""
    docs = (
        await db.paypal_plans.find(
            {"status": {"$in": ["ACTIVE", "active"]}}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(50)
    )
    return docs


class ClientSubscribeRequest(BaseModel):
    plan_key: str
    metadata: Optional[Dict[str, Any]] = None


@subscription_client_router.post("/subscribe")
async def client_subscribe(
    req: ClientSubscribeRequest,
    request: Request,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    plan = await db.paypal_plans.find_one({"plan_key": req.plan_key}, {"_id": 0})
    if not plan:
        raise HTTPException(404, f"Plan '{req.plan_key}' not found")

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
        custom_id=client["email"],
        return_url=f"{base}/portal/subscriptions?activated=1",
        cancel_url=f"{base}/portal/subscriptions?cancelled=1",
    )
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal subscription create failed")
    sub = res["data"]
    approval_url = next(
        (lk["href"] for lk in (sub.get("links") or []) if lk.get("rel") == "approve"),
        None,
    )
    doc = {
        "id": sub["id"],
        "plan_id": plan["plan_id"],
        "plan_key": req.plan_key,
        "plan_name": plan.get("name"),
        "plan_price": plan.get("price"),
        "plan_currency": plan.get("currency"),
        "plan_interval": f"{plan.get('interval_count', 1)} {plan.get('interval_unit', 'MONTH').lower()}",
        "status": sub.get("status", "APPROVAL_PENDING"),
        "customer_email": client["email"],
        "customer_name": client.get("name"),
        "approval_url": approval_url,
        "source": "client_portal",
        "metadata": req.metadata or {},
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.paypal_subscriptions.update_one(
        {"id": sub["id"]}, {"$set": prepare_for_mongo(doc)}, upsert=True
    )
    return {"id": sub["id"], "status": sub.get("status"), "approval_url": approval_url}


@subscription_client_router.get("")
async def list_my_subscriptions(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> List[Dict[str, Any]]:
    docs = (
        await db.paypal_subscriptions.find(
            {"customer_email": client["email"]}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(50)
    )
    return docs


@subscription_client_router.post("/{sub_id}/cancel")
async def cancel_my_subscription(
    sub_id: str,
    request: Request,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> Dict[str, Any]:
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    sub = await db.paypal_subscriptions.find_one({"id": sub_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if sub.get("customer_email") != client["email"]:
        raise HTTPException(403, "Forbidden")
    if sub.get("status") in ("CANCELLED", "EXPIRED"):
        return {"id": sub_id, "status": sub["status"], "already_cancelled": True}
    res = await pp.cancel_subscription(sub_id, reason="Client cancelled from portal")
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "Could not cancel")
    await db.paypal_subscriptions.update_one(
        {"id": sub_id},
        {"$set": {
            "status": "CANCELLED",
            "cancelled_at": _now().isoformat(),
            "updated_at": _now().isoformat(),
        }},
    )
    return {"id": sub_id, "status": "CANCELLED"}


# ============================================================
# Admin
# ============================================================

class AdminAssignSubscriptionRequest(BaseModel):
    plan_key: str
    client_email: EmailStr
    send_email: bool = True


@subscription_admin_router.get("")
async def admin_list_subscriptions(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
    limit: int = 200,
    client_email: Optional[str] = None,
) -> List[Dict[str, Any]]:
    filt: Dict[str, Any] = {}
    if client_email:
        filt["customer_email"] = client_email.lower().strip()
    docs = (
        await db.paypal_subscriptions.find(filt, {"_id": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )
    return docs


@subscription_admin_router.post("/assign")
async def admin_assign_subscription(
    req: AdminAssignSubscriptionRequest,
    request: Request,
    pp: PayPalClient = Depends(get_pp),
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Admin assigns an add-on subscription to a client. We create the
    PayPal subscription (status APPROVAL_PENDING) and email the client a
    one-click approval link. Once they approve, the BILLING.SUBSCRIPTION.ACTIVATED
    webhook fires the usual activation email + first invoice."""
    if not pp.is_configured:
        raise HTTPException(503, "PayPal not configured")
    plan = await db.paypal_plans.find_one({"plan_key": req.plan_key}, {"_id": 0})
    if not plan:
        raise HTTPException(404, f"Plan '{req.plan_key}' not found")
    client = await db.clients.find_one(
        {"email": req.client_email.lower().strip()}, {"_id": 0}
    )
    if not client:
        raise HTTPException(404, f"Client {req.client_email} not found")

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
        custom_id=client["email"],
        return_url=f"{base}/portal/subscriptions?activated=1",
        cancel_url=f"{base}/portal/subscriptions?cancelled=1",
    )
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "PayPal subscription create failed")
    sub = res["data"]
    approval_url = next(
        (lk["href"] for lk in (sub.get("links") or []) if lk.get("rel") == "approve"),
        None,
    )

    doc = {
        "id": sub["id"],
        "plan_id": plan["plan_id"],
        "plan_key": req.plan_key,
        "plan_name": plan.get("name"),
        "plan_price": plan.get("price"),
        "plan_currency": plan.get("currency"),
        "status": sub.get("status", "APPROVAL_PENDING"),
        "customer_email": client["email"],
        "customer_name": client.get("name"),
        "approval_url": approval_url,
        "source": "admin_assigned",
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.paypal_subscriptions.update_one(
        {"id": sub["id"]}, {"$set": prepare_for_mongo(doc)}, upsert=True
    )

    # Send branded "you've been added to a plan" email
    if req.send_email and approval_url:
        try:
            import email_service
            from email_service import _frame, _h1, _p, _button, _kv_table

            emailit = getattr(request.app.state, "emailit", None)
            body = (
                _h1("A new add-on is waiting for you")
                + _p(
                    f"Hi {client.get('name') or client['email'].split('@')[0]}, we've added "
                    f"<strong>{plan['name']}</strong> to your account. One click and you're set:"
                )
                + _kv_table([
                    {"label": "Plan", "value": plan["name"]},
                    {"label": "Price", "value": f"{plan.get('currency','USD')} {plan.get('price','—')}"},
                    {"label": "Billing", "value": f"every {plan.get('interval_count',1)} {plan.get('interval_unit','MONTH').lower()}"},
                ])
                + f'<p style="margin:24px 0;">{_button(approval_url, "Activate add-on")}</p>'
                + _p("You can cancel anytime from your client portal — no commitment.")
            )
            html = _frame(preheader=f"{plan['name']} — one click to activate.", body_html=body)
            await email_service._safe_send(
                emailit,
                to=client["email"],
                subject=f"New add-on: {plan['name']} — one-click activate",
                html=html,
                text=f"Activate {plan['name']}: {approval_url}",
            )
        except Exception as exc:  # pragma: no cover
            log.warning("Add-on email failed: %s", exc)

    return {
        "id": sub["id"],
        "status": sub.get("status"),
        "approval_url": approval_url,
        "client_email": client["email"],
        "plan_name": plan["name"],
    }
