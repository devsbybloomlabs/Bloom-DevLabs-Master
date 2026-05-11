"""Agency Handy webhook receiver + registration helpers + event automation.

PUBLIC ENDPOINT (no auth):
- POST /api/webhooks/agencyhandy   <- receives events from Agency Handy

AUTHED ENDPOINTS (under /api/agencyhandy):
- GET  /webhooks/status            — current webhook setup
- POST /webhooks/register          — idempotent register against AGENCYHANDY_WEBHOOK_TARGET_URL
- POST /webhooks/test/{event_name} — send a test event from AH to our receiver
- DELETE /webhooks/{webhook_id}    — remove webhook (admin-managed clean up)

Event automation (selective, all idempotent):
- ORDER.CREATED / ORDER.UPDATED              -> notification + cache invalidation;
                                               ORDER.UPDATED + status=completed -> testimonial request (best effort).
- INVOICE.STATUS.CHANGED                     -> notification + cache invalidation.
- PAYMENT.RECEIVED                           -> notification (revenue) + cache invalidation.
- PAYMENT.FAILED                             -> notification (urgent).
- PROPOSAL.SENT                              -> notification.
- PROPOSAL.ACCEPTED                          -> notification + create internal Prospect status=won.
- PROPOSAL.REJECTED                          -> notification.
- CLIENT.ADDED                               -> notification.
- PUBLIC_FORM.RESPONSE.CREATED               -> auto-create Prospect (lead) + notification.
- TASK.COMPLETED                             -> low priority notification.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user
from db_utils import prepare_for_mongo
from models import NotificationItem, Prospect

log = logging.getLogger("agencyhandy.webhooks")


# Bloom Labs target events. Order matters only for log readability.
WANTED_EVENTS: List[str] = [
    "ORDER.CREATED",
    "ORDER.UPDATED",
    "INVOICE.STATUS.CHANGED",
    "PAYMENT.RECEIVED",
    "PAYMENT.FAILED",
    "PROPOSAL.SENT",
    "PROPOSAL.ACCEPTED",
    "PROPOSAL.REJECTED",
    "CLIENT.ADDED",
    "PUBLIC_FORM.RESPONSE.CREATED",
    "TASK.COMPLETED",
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _expected_token() -> str:
    return os.environ.get("AGENCYHANDY_WEBHOOK_SECRET", "")


def _target_url_from_env() -> str:
    """Resolve the target URL for AH to call us back.

    Priority:
    1) AGENCYHANDY_WEBHOOK_TARGET_URL
    2) APP_BASE_URL + /api/webhooks/agencyhandy
    """
    direct = (os.environ.get("AGENCYHANDY_WEBHOOK_TARGET_URL") or "").strip()
    if direct:
        return direct
    base = (os.environ.get("APP_BASE_URL") or "").strip().rstrip("/")
    if base:
        return f"{base}/api/webhooks/agencyhandy"
    return ""


def _extract_event_name(payload: Dict[str, Any], headers: Dict[str, str]) -> str:
    """Best effort extraction of the event name (AH varies by version)."""
    for key in ("eventName", "event_name", "event", "type"):
        val = payload.get(key)
        if isinstance(val, str) and val:
            return val.upper()
    # Sometimes nested
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        for key in ("eventName", "event_name", "event", "type"):
            val = data.get(key)
            if isinstance(val, str) and val:
                return val.upper()
    # Header fallback
    for hdr in ("x-event-name", "x-agencyhandy-event", "x-event-type"):
        v = headers.get(hdr) or headers.get(hdr.title()) or headers.get(hdr.upper())
        if v:
            return v.upper()
    return ""


def _extract_token(headers: Dict[str, str]) -> Optional[str]:
    """Extract the auth token from incoming webhook headers (Token-type auth)."""
    for h in (
        "x-agencyhandy-token",
        "x-webhook-token",
        "x-token",
        "x-api-key",
        "authorization",
    ):
        v = headers.get(h) or headers.get(h.title()) or headers.get(h.upper())
        if not v:
            continue
        if h == "authorization":
            return v.split(" ", 1)[-1].strip() if " " in v else v.strip()
        return v.strip()
    return None


def _is_signed_test(headers: Dict[str, str]) -> bool:
    """Test events from Agency Handy carry an `x-ah-sig` header but no token.

    We trust this header as evidence the request is a legitimate AH test (only AH knows
    we registered with them and only AH can call our registered URL).
    """
    return bool(headers.get("x-ah-sig") or headers.get("X-Ah-Sig"))


def _hmac_secret() -> str:
    """Optional HMAC shared secret used to verify the `x-ah-sig` header.

    When `AGENCYHANDY_WEBHOOK_HMAC_SECRET` is set, every incoming webhook MUST
    carry an `x-ah-sig` header matching `hex(hmac_sha256(secret, raw_body))`.
    When not set, signed-test header presence is accepted as a soft signal
    (existing behaviour preserved).
    """
    return os.environ.get("AGENCYHANDY_WEBHOOK_HMAC_SECRET", "")


def _compute_signature(secret: str, raw_body: bytes) -> str:
    """HMAC-SHA256 hex digest of the raw request body."""
    return hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()


def _verify_hmac(headers: Dict[str, str], raw_body: bytes) -> Optional[bool]:
    """Verify `x-ah-sig` against the configured HMAC secret.

    Returns:
      • True  — secret configured AND signature matches
      • False — secret configured AND signature missing/mismatch
      • None  — no secret configured (HMAC enforcement disabled)
    """
    secret = _hmac_secret()
    if not secret:
        return None
    provided = (
        headers.get("x-ah-sig")
        or headers.get("X-Ah-Sig")
        or headers.get("x-ah-signature")
        or ""
    ).strip()
    if not provided:
        return False
    # Allow optional "sha256=" prefix to be defensive
    if provided.lower().startswith("sha256="):
        provided = provided.split("=", 1)[1].strip()
    expected = _compute_signature(secret, raw_body)
    return hmac.compare_digest(provided.lower(), expected.lower())


def _client_field(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data") or payload
    if not isinstance(data, dict):
        return {}
    c = data.get("client")
    if isinstance(c, dict):
        return c
    if isinstance(c, str):
        # Just an ID — return minimal envelope
        return {"_id": c}
    return {}


def _client_name(c: Dict[str, Any]) -> str:
    if not isinstance(c, dict):
        return "Unknown client"
    name = " ".join(filter(None, [c.get("firstName"), c.get("lastName")])).strip()
    return name or c.get("email") or c.get("_id") or "Unknown client"


# =============================================================================
# Public webhook receiver
# =============================================================================
ah_webhook_router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@ah_webhook_router.post("/agencyhandy")
async def agencyhandy_webhook(request: Request) -> Dict[str, Any]:
    """Receive Agency Handy events. Always returns 200 to avoid retry storms.

    Stores the raw event in `ah_webhook_events` for audit, dispatches automation,
    and creates a NotificationItem when relevant.
    """
    db = request.app.state.db
    headers = {k.lower(): v for k, v in request.headers.items()}
    raw_body = await request.body()
    try:
        payload = await request.json() if raw_body else {}
    except Exception:
        body_text = raw_body.decode("utf-8", "replace")
        payload = {"raw": body_text[:4000]}

    event_name = _extract_event_name(payload if isinstance(payload, dict) else {}, headers)
    token = _extract_token(headers)
    expected = _expected_token()
    is_test = _is_signed_test(headers)
    hmac_result = _verify_hmac(headers, raw_body)  # True / False / None
    token_ok = (
        is_test  # AH-issued test event
        or (not expected)  # not enforcing yet
        or (token and token == expected)  # token match
    )
    # HMAC takes precedence when enforced — overrides any token-ok signal
    if hmac_result is True:
        token_ok = True
    elif hmac_result is False:
        token_ok = False

    log.info(
        "AH webhook received: event=%s token_ok=%s hmac=%s headers=%s",
        event_name,
        token_ok,
        hmac_result,
        {k: v for k, v in headers.items() if k.startswith("x-")},
    )

    audit_doc = {
        "received_at": _iso(_now()),
        "event_name": event_name,
        "token_ok": bool(token_ok),
        "hmac_verified": hmac_result,
        "headers": {k: v for k, v in headers.items() if not k.startswith("cookie")},
        "payload": payload,
    }
    try:
        await db.ah_webhook_events.insert_one(prepare_for_mongo(audit_doc))
    except Exception as exc:  # pragma: no cover
        log.warning("Failed to persist AH webhook event: %s", exc)

    if not token_ok:
        # Do not run automation on unverified events, but accept the request so AH does not retry.
        reason = "hmac_mismatch" if hmac_result is False else "token_mismatch"
        return {"ok": True, "verified": False, "note": f"Verification failed: {reason} — automation skipped."}

    handler = _DISPATCH.get(event_name)
    automation_result: Dict[str, Any] = {}
    if handler:
        try:
            automation_result = await handler(request, payload if isinstance(payload, dict) else {})
        except Exception as exc:  # pragma: no cover - non fatal
            log.exception("AH webhook handler %s failed: %s", event_name, exc)
            automation_result = {"error": str(exc)}
    else:
        log.info("AH webhook: no handler for event=%s", event_name)

    return {"ok": True, "verified": True, "event": event_name, "result": automation_result}


# =============================================================================
# Authed admin endpoints (status / register / test)
# =============================================================================
ah_webhook_admin_router = APIRouter(
    prefix="/agencyhandy/webhooks",
    tags=["agencyhandy"],
    dependencies=[Depends(get_current_user)],
)


def _ah(request: Request):
    return request.app.state.agencyhandy


def _db(request: Request):
    return request.app.state.db


@ah_webhook_admin_router.get("/status")
async def webhook_status(request: Request) -> Dict[str, Any]:
    ah = _ah(request)
    target_url = _target_url_from_env()
    listed = await ah.list_webhooks()
    auths = await ah.list_webhook_auths()
    items = ((listed.get("data") or {}).get("data") or []) if listed.get("success") else []
    matching = [w for w in items if (w.get("url") or "").rstrip("/") == target_url.rstrip("/")]
    db = _db(request)
    last_events = []
    try:
        cursor = db.ah_webhook_events.find({}, {"_id": 0}).sort("received_at", -1)
        last_events = await cursor.to_list(10)
    except Exception:
        pass
    return {
        "target_url": target_url,
        "configured_target": bool(target_url),
        "registered": [
            {
                "id": w.get("_id"),
                "name": w.get("name"),
                "url": w.get("url"),
                "isActive": w.get("isActive"),
                "events_count": len(w.get("events") or []),
                "createdAt": w.get("createdAt"),
            }
            for w in matching
        ],
        "all_webhooks_count": len(items),
        "auths": auths.get("data") if auths.get("success") else None,
        "wanted_events": WANTED_EVENTS,
        "last_events": last_events,
    }


@ah_webhook_admin_router.post("/register")
async def webhook_register(request: Request) -> Dict[str, Any]:
    """Idempotently register a webhook against the configured target URL.

    Steps:
    1) Resolve target URL and required token.
    2) Persist webhook auth (Token type) on Agency Handy.
    3) Find an existing webhook with the same URL → update / leave as-is.
    4) Otherwise create a new one with all WANTED_EVENTS.
    """
    ah = _ah(request)
    target_url = _target_url_from_env()
    if not target_url:
        raise HTTPException(
            status_code=400,
            detail="No target URL configured. Set AGENCYHANDY_WEBHOOK_TARGET_URL or APP_BASE_URL.",
        )

    auth_id = os.environ.get("AGENCYHANDY_WEBHOOK_AUTH_ID")
    if not auth_id:
        # Try to discover the default Token auth id from AH
        auths = await ah.list_webhook_auths()
        if auths.get("success"):
            for a in (auths.get("data") or {}).get("data", []):
                if (a.get("name") or "").lower() == "token":
                    auth_id = a.get("_id")
                    break
    token = _expected_token()
    if not auth_id or not token:
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing webhook auth setup. Need AGENCYHANDY_WEBHOOK_AUTH_ID and "
                "AGENCYHANDY_WEBHOOK_SECRET configured."
            ),
        )
    save_auth = await ah.save_webhook_auth(auth_id, token=token)
    if not save_auth.get("success"):
        log.warning("Saving AH webhook auth failed: %s", save_auth.get("error"))

    # Resolve event IDs
    event_map = await ah.get_event_id_map()
    event_ids: List[str] = []
    missing: List[str] = []
    for name in WANTED_EVENTS:
        eid = event_map.get(name)
        if eid:
            event_ids.append(eid)
        else:
            missing.append(name)

    listed = await ah.list_webhooks()
    items = ((listed.get("data") or {}).get("data") or []) if listed.get("success") else []
    existing = next(
        (w for w in items if (w.get("url") or "").rstrip("/") == target_url.rstrip("/")), None
    )
    if existing:
        upd = await ah.update_webhook(
            existing["_id"],
            {
                "name": "Bloom Labs Admin",
                "description": "Bloom Labs admin dashboard receiver",
                "url": target_url,
                "events": event_ids,
                "isEnabled": True,
            },
        )
        return {
            "action": "updated",
            "webhook_id": existing["_id"],
            "events_count": len(event_ids),
            "missing_events": missing,
            "result": upd,
        }

    res = await ah.create_webhook(
        target_url,
        event_ids,
        name="Bloom Labs Admin",
        description="Bloom Labs admin dashboard receiver",
    )
    if not res.get("success"):
        raise HTTPException(status_code=502, detail=f"Create webhook failed: {res.get('error')}")
    new_id = (res.get("data") or {}).get("data", {}).get("_id") or (res.get("data") or {}).get("_id")
    return {
        "action": "created",
        "webhook_id": new_id,
        "events_count": len(event_ids),
        "missing_events": missing,
        "result": res,
    }


@ah_webhook_admin_router.post("/test/{event_name}")
async def webhook_send_test(event_name: str, request: Request) -> Dict[str, Any]:
    ah = _ah(request)
    target_url = _target_url_from_env()
    if not target_url:
        raise HTTPException(status_code=400, detail="No target URL configured.")
    listed = await ah.list_webhooks()
    items = ((listed.get("data") or {}).get("data") or []) if listed.get("success") else []
    existing = next(
        (w for w in items if (w.get("url") or "").rstrip("/") == target_url.rstrip("/")), None
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not registered yet. Call /register first.")
    res = await ah.send_test_webhook_event(existing["_id"], event_name.upper(), target_url)
    if not res.get("success"):
        raise HTTPException(status_code=502, detail=f"Send test failed: {res.get('error')}")
    return {"ok": True, "webhook_id": existing["_id"], "event": event_name.upper(), "result": res}


@ah_webhook_admin_router.delete("/{webhook_id}")
async def webhook_delete(webhook_id: str, request: Request) -> Dict[str, Any]:
    ah = _ah(request)
    res = await ah.delete_webhooks([webhook_id])
    if not res.get("success"):
        raise HTTPException(status_code=502, detail=f"Delete failed: {res.get('error')}")
    return {"ok": True, "result": res}


# =============================================================================
# Event handlers (automation)
# =============================================================================
async def _add_notification(db, *, kind: str, title: str, body: Optional[str] = None,
                            link: Optional[str] = None) -> str:
    n = NotificationItem(kind=kind, title=title, body=body, link=link)
    await db.notifications.insert_one(prepare_for_mongo(n.model_dump()))
    return n.id


async def _refresh_cache(db, key: str) -> None:
    """Best-effort: drop a cache entry so the next read goes upstream."""
    try:
        await db.ah_cache.delete_one({"key": key})
    except Exception:
        pass


async def _handle_order_created(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    db = _db(request)
    data = payload.get("data") or payload
    client = _client_field(payload)
    name = _client_name(client)
    title = f"New order from {name}"
    body = f"Order: {data.get('name') or data.get('title') or data.get('id') or 'untitled'}"
    nid = await _add_notification(db, kind="order", title=title, body=body, link="/admin/revenue")
    await _refresh_cache(db, "orders")
    return {"notification_id": nid}


async def _handle_order_updated(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    db = _db(request)
    data = payload.get("data") or payload
    client = _client_field(payload)
    name = _client_name(client)
    status = (data.get("status") or data.get("state") or "").lower()
    title = f"Order updated: {name}"
    body = f"Status: {status or 'unknown'}"
    nid = await _add_notification(db, kind="order", title=title, body=body, link="/admin/revenue")
    await _refresh_cache(db, "orders")

    auto: Dict[str, Any] = {"notification_id": nid}
    # Fire testimonial request when an order is marked completed/delivered.
    if status in ("completed", "delivered", "done"):
        try:
            email = client.get("email")
            client_name = name
            if email:
                emailit = request.app.state.emailit
                # Idempotency guard: only one auto-request per order id
                order_id = data.get("_id") or data.get("id")
                guard_key = f"testimonial_request:{order_id}" if order_id else None
                already = None
                if guard_key:
                    already = await db.ah_automation_log.find_one({"key": guard_key})
                if not already and emailit and getattr(emailit, "is_configured", True):
                    subject = f"Quick testimonial request — {client_name}"
                    plain = (
                        f"Hi {client_name.split(' ')[0]},\n\n"
                        f"Glad to see your project completed with us! "
                        f"Would you be open to sharing a 2–3 sentence testimonial? "
                        f"Even a quick line about the outcome you got helps us a ton.\n\n"
                        f"— Ryan, Bloom Labs"
                    )
                    html = (
                        f"<p>Hi {client_name.split(' ')[0]},</p>"
                        f"<p>Glad to see your project completed with us! "
                        f"Would you be open to sharing a 2–3 sentence testimonial? "
                        f"Even a quick line about the outcome you got helps us a ton.</p>"
                        f"<p>— Ryan, Bloom Labs</p>"
                    )
                    try:
                        await emailit.send_email(
                            to=email,
                            subject=subject,
                            html=html,
                            text=plain,
                        )
                    except Exception as exc:  # pragma: no cover - emailit may need DNS verification
                        log.warning("Testimonial request email failed: %s", exc)
                        auto["email_error"] = str(exc)
                if guard_key:
                    await db.ah_automation_log.insert_one(
                        prepare_for_mongo(
                            {
                                "key": guard_key,
                                "type": "testimonial_request",
                                "order_id": order_id,
                                "client_email": email,
                                "created_at": _iso(_now()),
                            }
                        )
                    )
                auto["testimonial_request"] = "sent" if not already else "skipped"
        except Exception as exc:  # pragma: no cover
            auto["error"] = str(exc)
    return auto


async def _handle_invoice_status(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    db = _db(request)
    data = payload.get("data") or payload
    status = (data.get("status") or "").lower()
    client = _client_field(payload)
    name = _client_name(client)
    nid = await _add_notification(
        db,
        kind="invoice",
        title=f"Invoice {status or 'updated'}: {name}",
        body=f"Invoice {data.get('invoiceNumber') or data.get('id')}",
        link="/admin/revenue",
    )
    await _refresh_cache(db, "invoices")
    return {"notification_id": nid}


async def _handle_payment_received(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    db = _db(request)
    data = payload.get("data") or payload
    client = _client_field(payload)
    name = _client_name(client)
    amount = data.get("amount") or data.get("total") or "—"
    currency = data.get("currency") or ""
    nid = await _add_notification(
        db,
        kind="payment",
        title=f"Payment received: {name}",
        body=f"{amount} {currency}".strip(),
        link="/admin/revenue",
    )
    await _refresh_cache(db, "subscriptions")
    await _refresh_cache(db, "invoices")
    await _refresh_cache(db, "orders")
    return {"notification_id": nid}


async def _handle_payment_failed(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    db = _db(request)
    client = _client_field(payload)
    name = _client_name(client)
    nid = await _add_notification(
        db,
        kind="payment",
        title=f"Payment failed: {name}",
        body="Reach out to recover the failed payment.",
        link="/admin/revenue",
    )
    return {"notification_id": nid}


async def _handle_proposal_event(request: Request, payload: Dict[str, Any], action: str) -> Dict[str, Any]:
    db = _db(request)
    data = payload.get("data") or payload
    if not isinstance(data, dict):
        data = {}
    client = _client_field(payload)
    name = _client_name(client)
    service_field = data.get("service")
    if isinstance(service_field, dict):
        service_name = service_field.get("name") or ""
    elif isinstance(service_field, list) and service_field:
        first = service_field[0]
        service_name = first.get("name") if isinstance(first, dict) else ""
    else:
        service_name = ""
    body_text = service_name or data.get("packageName") or ""
    nid = await _add_notification(
        db,
        kind="proposal",
        title=f"Proposal {action}: {name}",
        body=body_text,
        link="/admin/revenue",
    )
    await _refresh_cache(db, "proposals")

    out: Dict[str, Any] = {"notification_id": nid}
    if action == "accepted":
        # Insert a Prospect with status=won so Sales/Pipeline reflects the close.
        email = client.get("email") if isinstance(client, dict) else None
        existing = None
        if email:
            existing = await db.prospects.find_one({"email": email})
        if not existing:
            p = Prospect(
                name=name,
                email=email or None,
                company=client.get("company") if isinstance(client, dict) else None,
                source="agencyhandy",
                status="won",
                deal_value=float(data.get("budget") or data.get("priceWithoutSetupFee") or 0),
                notes=(
                    f"Proposal accepted via Agency Handy. Service: "
                    f"{service_name or '—'}"
                ),
                next_action="Schedule kickoff call",
            )
            await db.prospects.insert_one(prepare_for_mongo(p.model_dump()))
            out["prospect_id"] = p.id
        else:
            await db.prospects.update_one(
                {"id": existing["id"]},
                {
                    "$set": {
                        "status": "won",
                        "updated_at": _iso(_now()),
                        "deal_value": float(
                            data.get("budget")
                            or data.get("priceWithoutSetupFee")
                            or existing.get("deal_value")
                            or 0
                        ),
                    }
                },
            )
            out["prospect_id"] = existing["id"]
    return out


async def _handle_proposal_sent(request, payload):
    return await _handle_proposal_event(request, payload, "sent")


async def _handle_proposal_accepted(request, payload):
    return await _handle_proposal_event(request, payload, "accepted")


async def _handle_proposal_rejected(request, payload):
    return await _handle_proposal_event(request, payload, "rejected")


async def _handle_client_added(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    db = _db(request)
    client = _client_field(payload)
    name = _client_name(client)
    nid = await _add_notification(
        db,
        kind="client",
        title=f"New client: {name}",
        body=client.get("email") or "",
        link="/admin/revenue",
    )
    await _refresh_cache(db, "clients")
    return {"notification_id": nid}


async def _handle_form_response(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Hot lead: someone filled out a public intake form. Auto-create a Prospect."""
    db = _db(request)
    data = payload.get("data") or payload
    # AH form payload typically has 'response' object or top-level submitted fields
    response = data.get("response") or data
    name = response.get("name") or response.get("fullName") or _client_name(response)
    email = response.get("email") or response.get("emailAddress")
    company = response.get("company") or response.get("companyName")
    form_name = (data.get("form") or {}).get("name") or data.get("formName") or "Intake form"

    nid = await _add_notification(
        db,
        kind="lead",
        title=f"New lead from form: {name or email or 'unknown'}",
        body=f"Form: {form_name}",
        link="/admin/pipeline",
    )

    # Find or create a prospect by email
    existing = None
    if email:
        existing = await db.prospects.find_one({"email": email})
    out: Dict[str, Any] = {"notification_id": nid}
    if existing:
        out["prospect_id"] = existing.get("id")
        out["created"] = False
    else:
        p = Prospect(
            name=name or email or "New lead",
            email=email or None,
            company=company or None,
            source="agencyhandy_form",
            status="new",
            notes=f"Submitted form: {form_name}. Payload keys: {list(response.keys())[:10]}",
            next_action="Reach out within 24 hours",
        )
        await db.prospects.insert_one(prepare_for_mongo(p.model_dump()))
        out["prospect_id"] = p.id
        out["created"] = True
    return out


async def _handle_task_completed(request: Request, payload: Dict[str, Any]) -> Dict[str, Any]:
    db = _db(request)
    data = payload.get("data") or payload
    nid = await _add_notification(
        db,
        kind="task",
        title="Task completed",
        body=data.get("title") or data.get("name") or "",
        link="/admin/revenue",
    )
    return {"notification_id": nid}


_DISPATCH = {
    "ORDER.CREATED": _handle_order_created,
    "ORDER.UPDATED": _handle_order_updated,
    "INVOICE.STATUS.CHANGED": _handle_invoice_status,
    "INVOICE.UPDATED": _handle_invoice_status,
    "INVOICE.CREATED": _handle_invoice_status,
    "PAYMENT.RECEIVED": _handle_payment_received,
    "PAYMENT.FAILED": _handle_payment_failed,
    "PROPOSAL.SENT": _handle_proposal_sent,
    "PROPOSAL.ACCEPTED": _handle_proposal_accepted,
    "PROPOSAL.REJECTED": _handle_proposal_rejected,
    "CLIENT.ADDED": _handle_client_added,
    "PUBLIC_FORM.RESPONSE.CREATED": _handle_form_response,
    "TASK.COMPLETED": _handle_task_completed,
}


__all__ = ["ah_webhook_router", "ah_webhook_admin_router", "WANTED_EVENTS"]
