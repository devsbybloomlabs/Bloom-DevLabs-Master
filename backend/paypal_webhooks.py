"""PayPal webhook receiver — public endpoint, verifies signature, processes events.

Always returns 200 to prevent PayPal retries. Audit trail stored in
`paypal_webhook_events`. On payment success, provisions client account.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Header, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from db_utils import prepare_for_mongo
from paypal_client import PayPalClient

log = logging.getLogger("paypal_webhooks")

paypal_webhook_router = APIRouter(prefix="/webhooks", tags=["paypal-webhooks"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@paypal_webhook_router.post("/paypal")
async def paypal_webhook(
    request: Request,
    paypal_transmission_id: str = Header(None, alias="paypal-transmission-id"),
    paypal_transmission_time: str = Header(None, alias="paypal-transmission-time"),
    paypal_transmission_sig: str = Header(None, alias="paypal-transmission-sig"),
    paypal_cert_url: str = Header(None, alias="paypal-cert-url"),
    paypal_auth_algo: str = Header(None, alias="paypal-auth-algo"),
) -> Dict[str, Any]:
    """Receive PayPal webhooks. Always returns 200 to avoid retry storms."""
    db: AsyncIOMotorDatabase = request.app.state.db
    pp: PayPalClient = request.app.state.paypal

    try:
        event = await request.json()
    except Exception:
        log.warning("PayPal webhook received non-JSON body")
        return {"ok": False, "reason": "invalid_json"}

    event_type = event.get("event_type", "")
    event_id = event.get("id")

    # Persist audit trail
    audit = {
        "event_id": event_id,
        "event_type": event_type,
        "resource_type": event.get("resource_type"),
        "summary": event.get("summary"),
        "received_at": _now().isoformat(),
        "verified": False,
        "raw": event,
    }

    # Verify signature (best-effort; accept if env disabled OR webhook id not set)
    verified = False
    if pp.is_configured and pp.webhook_id and paypal_transmission_id:
        try:
            verified = await pp.verify_webhook_signature(
                transmission_id=paypal_transmission_id,
                transmission_time=paypal_transmission_time or "",
                cert_url=paypal_cert_url or "",
                auth_algo=paypal_auth_algo or "",
                transmission_sig=paypal_transmission_sig or "",
                webhook_event=event,
            )
        except Exception as exc:
            log.exception("verify_webhook_signature crashed: %s", exc)
            verified = False
    else:
        # In sandbox/dev with no webhook_id, accept all but log
        verified = os.environ.get("PAYPAL_ACCEPT_UNVERIFIED", "true").lower() == "true"

    audit["verified"] = verified
    await db.paypal_webhook_events.insert_one(prepare_for_mongo(audit))

    if not verified:
        log.warning("PayPal webhook NOT verified: %s", event_type)
        return {"ok": True, "verified": False}

    # Route the event
    try:
        await _process_paypal_event(db, request, event)
    except Exception as exc:
        log.exception("Failed to process PayPal event %s: %s", event_type, exc)

    return {"ok": True, "verified": verified}


async def _process_paypal_event(
    db: AsyncIOMotorDatabase, request: Request, event: Dict[str, Any]
) -> None:
    event_type = event.get("event_type", "")
    resource = event.get("resource") or {}

    # Notification creation helper
    async def notify(title: str, body: str = "", link: str = "") -> None:
        from models import NotificationItem  # local import
        item = NotificationItem(kind="payment", title=title, body=body, link=link or None)
        await db.notifications.insert_one(prepare_for_mongo(item.model_dump()))

    # --- One-time payment captured ---
    if event_type == "PAYMENT.CAPTURE.COMPLETED":
        amount = (resource.get("amount") or {}).get("value") or "?"
        currency = (resource.get("amount") or {}).get("currency_code") or ""
        custom_id = resource.get("custom_id") or ""
        payer_email = (
            ((resource.get("payer") or {}).get("email_address"))
            or custom_id
            or None
        )
        order_id = (
            resource.get("supplementary_data", {})
            .get("related_ids", {})
            .get("order_id")
            or resource.get("id")
        )
        # Update local txn record
        if order_id:
            await db.paypal_transactions.update_one(
                {"id": order_id},
                {
                    "$set": {
                        "status": "COMPLETED",
                        "captured_at": _now().isoformat(),
                        "webhook_event_id": event.get("id"),
                        "updated_at": _now().isoformat(),
                    }
                },
                upsert=True,
            )
        await notify(
            "Payment received",
            f"PayPal captured {currency} {amount}" + (f" from {payer_email}" if payer_email else ""),
            link="/admin/revenue",
        )
        # Auto-provision client
        if payer_email and "@" in payer_email:
            from client_routes import auto_provision_client_from_payment
            from onboarding_routes import ensure_onboarding_for_payment

            await auto_provision_client_from_payment(
                db,
                request,
                email=payer_email,
                name=payer_email.split("@")[0],
                source="paypal_webhook",
                source_id=order_id or event.get("id") or "",
            )
            await ensure_onboarding_for_payment(
                db,
                request,
                email=payer_email,
                name=payer_email.split("@")[0],
                source="paypal_webhook",
                source_id=order_id or event.get("id") or "",
            )
        return

    # --- Subscription lifecycle ---
    if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
        sub_id = resource.get("id")
        subscriber = resource.get("subscriber") or {}
        sub_email = subscriber.get("email_address")
        # Look up plan info for the email
        sub_record = await db.paypal_subscriptions.find_one({"id": sub_id}, {"_id": 0}) or {}
        plan_name = sub_record.get("plan_name") or "Subscription"
        plan_price = sub_record.get("plan_price") or "0.00"
        plan_currency = sub_record.get("plan_currency") or "USD"
        plan_interval = (sub_record.get("plan_interval") or "month").split(" ")[-1]
        if sub_id:
            await db.paypal_subscriptions.update_one(
                {"id": sub_id},
                {
                    "$set": {
                        "status": "ACTIVE",
                        "customer_email": sub_email,
                        "activated_at": _now().isoformat(),
                        "updated_at": _now().isoformat(),
                    }
                },
                upsert=True,
            )
        await notify(
            "Subscription activated",
            f"New subscription {sub_id}" + (f" — {sub_email}" if sub_email else ""),
            link="/admin/subscriptions",
        )
        if sub_email:
            from client_routes import auto_provision_client_from_payment

            await auto_provision_client_from_payment(
                db, request, email=sub_email, name=sub_email.split("@")[0],
                source="paypal_subscription", source_id=sub_id or "",
            )
            # Branded "subscription activated" email
            try:
                import email_service

                emailit = getattr(request.app.state, "emailit", None)
                await email_service.send_subscription_activated(
                    emailit,
                    to=sub_email,
                    name=(sub_record.get("customer_name") or sub_email.split("@")[0]),
                    plan_name=plan_name,
                    amount=str(plan_price),
                    currency=plan_currency,
                    period=plan_interval,
                )
            except Exception as exc:  # pragma: no cover
                log.warning("Subscription activation email failed: %s", exc)
            # Phase C: auto-upgrade support tier if this plan is a support plan
            try:
                from support_clearance_routes import apply_support_subscription_upgrade

                upgrade_res = await apply_support_subscription_upgrade(
                    db,
                    client_email=sub_email,
                    plan_id=sub_record.get("plan_id") or "",
                    plan_name=plan_name,
                )
                if upgrade_res.get("changed"):
                    log.info(
                        "Support tier auto-upgraded for %s → %s",
                        sub_email,
                        upgrade_res.get("tier"),
                    )
            except Exception as exc:  # pragma: no cover
                log.warning("Support tier auto-upgrade failed: %s", exc)
            # Phase H (Feb 2026): if this is a support subscription, supersede
            # the bundled free row + insert an active_paid record.
            try:
                from support_subscription_routes import (
                    activate_paid_support_subscription,
                )

                if sub_id and sub_record.get("is_support_plan"):
                    await activate_paid_support_subscription(db, sub_id)
            except Exception as exc:  # pragma: no cover
                log.warning("Paid support subscription activation failed: %s", exc)
        return

    if event_type == "PAYMENT.SALE.COMPLETED" and resource.get("billing_agreement_id"):
        # Recurring subscription renewal payment — auto-invoice.
        sub_id = resource.get("billing_agreement_id")
        amount_info = resource.get("amount") or {}
        gross = amount_info.get("total") or "0.00"
        currency = amount_info.get("currency") or "USD"
        sub_record = await db.paypal_subscriptions.find_one({"id": sub_id}, {"_id": 0}) or {}
        sub_email = sub_record.get("customer_email")
        plan_name = sub_record.get("plan_name") or "Subscription cycle"
        sale_id = resource.get("id")
        if sale_id and await db.invoices.find_one({"paypal_sale_id": sale_id}, {"_id": 1}):
            return  # webhook retry: this renewal already has an invoice
        if sub_email:
            try:
                import invoice_service
                from models import InvoiceLineItem, Invoice

                inv = Invoice(
                    number=await invoice_service.next_invoice_number(db),
                    client_email=sub_email,
                    client_name=sub_record.get("customer_name") or sub_email.split("@")[0],
                    issued_at=_now(),
                    paid_at=_now(),
                    status="paid",
                    currency=currency,
                    subtotal=float(gross),
                    total=float(gross),
                    amount_paid=float(gross),
                    balance_due=0.0,
                    line_items=[
                        InvoiceLineItem(
                            description=f"{plan_name} — recurring",
                            quantity=1,
                            unit_price=float(gross),
                            amount=float(gross),
                        )
                    ],
                    notes="Recurring subscription cycle.",
                    source="subscription_cycle",
                    subscription_id=sub_id,
                    paypal_sale_id=sale_id,
                )
                await db.invoices.insert_one(prepare_for_mongo(inv.model_dump()))
                from commission_service import safe_sync

                await safe_sync(db)
                inv_dict = inv.model_dump()
                try:
                    await invoice_service.cache_invoice_pdf(db, inv_dict)
                except Exception as exc:  # pragma: no cover
                    log.warning("Renewal invoice PDF cache failed: %s", exc)

                # Email a receipt
                import email_service

                emailit = getattr(request.app.state, "emailit", None)
                await email_service.send_payment_receipt(
                    emailit,
                    to=sub_email,
                    name=sub_record.get("customer_name") or sub_email.split("@")[0],
                    plan_name=plan_name,
                    amount=f"{float(gross):.2f}",
                    currency=currency,
                    order_id=sub_id,
                    invoice_number=inv.number,
                )
            except Exception as exc:  # pragma: no cover
                log.warning("Renewal invoice generation failed for %s: %s", sub_id, exc)
        await notify(
            "Subscription renewal received",
            f"{plan_name} — {currency} {gross}",
            link="/admin/invoices",
        )
        return

    if event_type in ("BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED"):
        sub_id = resource.get("id")
        new_status = "CANCELLED" if "CANCEL" in event_type else "EXPIRED"
        if sub_id:
            await db.paypal_subscriptions.update_one(
                {"id": sub_id},
                {"$set": {"status": new_status, "updated_at": _now().isoformat()}},
            )
        await notify(f"Subscription {new_status.lower()}", f"{sub_id}", link="/admin/revenue")
        return

    if event_type == "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        sub_id = resource.get("id")
        await notify("⚠️ Subscription payment failed", f"{sub_id}", link="/admin/revenue")
        return

    # Catch-all
    log.info("Unhandled PayPal event: %s", event_type)
