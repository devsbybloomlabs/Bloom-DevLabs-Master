"""Client-side: registration, login, password reset, and self-service portal.

Clients are stored in a separate `clients` collection (NOT `users`) so admin
auth logic remains untouched. Token payloads carry role="client" so the same
JWT primitives can be reused.
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from auth import (
    bearer_scheme,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from db_utils import prepare_for_mongo, serialize_doc

log = logging.getLogger("client_routes")

PASSWORD_RESET_TTL_HOURS = 24


# ---------- DI helpers ----------
def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_current_client(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    request: Request = None,
) -> Dict[str, Any]:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    if payload.get("role") != "client":
        raise HTTPException(status_code=403, detail="Client access required")
    email = payload.get("sub")
    db: AsyncIOMotorDatabase = request.app.state.db
    client = await db.clients.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    if not client:
        raise HTTPException(status_code=401, detail="Client not found")
    return client


# ---------- Models ----------
class ClientRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    company: Optional[str] = None


class ClientLoginRequest(BaseModel):
    email: EmailStr
    password: str


class ClientLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    client: Dict[str, Any]


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ClientUpdateProfile(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None


# ---------- DB shape ----------
def _new_client_doc(
    email: str,
    name: str,
    *,
    password_hash: Optional[str] = None,
    company: Optional[str] = None,
    source: str = "self_register",
    source_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "id": str(uuid4()),
        "email": email.lower().strip(),
        "name": name,
        "company": company,
        "phone": None,
        "password_hash": password_hash,
        "needs_password_setup": password_hash is None,
        "source": source,
        "source_ids": [source_id] if source_id else [],
        "status": "active",
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
        "last_login_at": None,
    }


async def auto_provision_client_from_payment(
    db: AsyncIOMotorDatabase,
    request: Request,
    *,
    email: str,
    name: str,
    source: str,
    source_id: str,
) -> Dict[str, Any]:
    """Idempotent: create-or-update a client triggered by a PayPal payment.

    Generates a password-set token and (best-effort) emails it via Emailit.
    Always creates a NotificationItem so the admin can manually share if email fails.
    """
    from models import NotificationItem  # local import to avoid cycles
    email_lc = email.lower().strip()
    existing = await db.clients.find_one({"email": email_lc})
    if existing:
        # Append source_id, refresh last touch
        source_ids = list(set(existing.get("source_ids", []) + [source_id]))
        await db.clients.update_one(
            {"email": email_lc},
            {
                "$set": {
                    "source_ids": source_ids,
                    "status": "active",
                    "updated_at": _now().isoformat(),
                }
            },
        )
        return existing
    # New client — no password
    doc = _new_client_doc(
        email_lc, name, password_hash=None, source=source, source_id=source_id
    )
    await db.clients.insert_one(prepare_for_mongo(doc))

    # Issue a password-setup token
    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(hours=PASSWORD_RESET_TTL_HOURS)
    await db.client_reset_tokens.insert_one(
        prepare_for_mongo({
            "token": token,
            "email": email_lc,
            "purpose": "setup",
            "expires_at": expires.isoformat(),
            "used": False,
            "created_at": _now().isoformat(),
        })
    )
    setup_url = (
        f"{os.environ.get('APP_BASE_URL', 'https://bybloomlabs.com').rstrip('/')}"
        f"/set-password?token={token}"
    )

    # Best-effort email
    try:
        emailit = getattr(request.app.state, "emailit", None)
        if emailit and getattr(emailit, "is_configured", False):
            await emailit.send_email(
                to=email_lc,
                subject="Welcome to Bloom Labs — set your password",
                html=_password_setup_html(name, setup_url),
                text=f"Welcome! Set your client portal password: {setup_url}",
            )
    except Exception as exc:  # pragma: no cover
        log.warning("Emailit send failed during client provision: %s", exc)

    # Admin notification with the link (so founder can share manually if email fails)
    notif = NotificationItem(
        kind="client",
        title=f"🎉 New client: {email_lc}",
        body=f"Auto-provisioned from {source}. Password-setup link: {setup_url}",
        link="/admin/clients",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    log.info("Auto-provisioned client %s from %s", email_lc, source)
    doc.pop("password_hash", None)
    return doc


def _password_setup_html(name: str, setup_url: str) -> str:
    return f"""
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#0F172A; background:#F8FAFC; padding:32px;">
  <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:14px; padding:32px; box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <h1 style="margin:0 0 16px; font-size:24px; color:#1E3A8A;">Welcome to Bloom Labs, {name}!</h1>
    <p style="line-height:1.6; color:#475569;">Your payment was received and your client portal has been created.</p>
    <p style="line-height:1.6; color:#475569;">Set your password to access your projects, invoices, and proposals:</p>
    <p style="margin:28px 0;"><a href="{setup_url}" style="background:#1E3A8A; color:#fff; padding:14px 28px; border-radius:10px; text-decoration:none; font-weight:600;">Set my password</a></p>
    <p style="color:#94A3B8; font-size:13px;">This link expires in 24 hours.</p>
    <p style="color:#94A3B8; font-size:13px;">— The Bloom Labs Team</p>
  </div>
</body></html>"""


# =============================================================================
# AUTH router (public)
# =============================================================================
client_auth_router = APIRouter(prefix="/clients", tags=["clients"])


@client_auth_router.post("/register", response_model=ClientLoginResponse)
async def register(
    req: ClientRegisterRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> ClientLoginResponse:
    email_lc = req.email.lower().strip()
    existing = await db.clients.find_one({"email": email_lc})
    if existing and existing.get("password_hash"):
        raise HTTPException(409, "An account with that email already exists. Please log in.")
    if existing:
        # Upgrade an auto-provisioned record (no password yet)
        await db.clients.update_one(
            {"email": email_lc},
            {
                "$set": {
                    "password_hash": hash_password(req.password),
                    "name": req.name,
                    "company": req.company,
                    "needs_password_setup": False,
                    "updated_at": _now().isoformat(),
                }
            },
        )
        client = await db.clients.find_one(
            {"email": email_lc}, {"_id": 0, "password_hash": 0}
        )
    else:
        doc = _new_client_doc(
            email_lc, req.name, password_hash=hash_password(req.password), company=req.company,
            source="self_register",
        )
        doc["needs_password_setup"] = False
        await db.clients.insert_one(prepare_for_mongo(doc))
        client = {k: v for k, v in doc.items() if k != "password_hash"}

    token = create_access_token(
        email_lc,
        extra={"name": client.get("name"), "role": "client"},
    )
    return ClientLoginResponse(access_token=token, client=client)


@client_auth_router.post("/login", response_model=ClientLoginResponse)
async def login(
    req: ClientLoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> ClientLoginResponse:
    email_lc = req.email.lower().strip()
    client = await db.clients.find_one({"email": email_lc})
    if not client or not client.get("password_hash"):
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(req.password, client["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    await db.clients.update_one(
        {"email": email_lc}, {"$set": {"last_login_at": _now().isoformat()}}
    )
    safe = {k: v for k, v in client.items() if k not in ("_id", "password_hash")}
    token = create_access_token(
        email_lc, extra={"name": client.get("name"), "role": "client"}
    )
    return ClientLoginResponse(access_token=token, client=safe)


@client_auth_router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest, request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    email_lc = req.email.lower().strip()
    client = await db.clients.find_one({"email": email_lc}, {"_id": 0})
    # Always return success-ish (don't reveal account existence)
    if not client:
        return {"ok": True}
    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(hours=PASSWORD_RESET_TTL_HOURS)
    await db.client_reset_tokens.insert_one(
        prepare_for_mongo({
            "token": token,
            "email": email_lc,
            "purpose": "reset",
            "expires_at": expires.isoformat(),
            "used": False,
            "created_at": _now().isoformat(),
        })
    )
    reset_url = (
        f"{os.environ.get('APP_BASE_URL', 'https://bybloomlabs.com').rstrip('/')}"
        f"/reset-password?token={token}"
    )
    try:
        emailit = request.app.state.emailit
        if emailit.is_configured:
            await emailit.send_email(
                to=email_lc,
                subject="Reset your Bloom Labs password",
                html=_password_setup_html(client.get("name", ""), reset_url),
                text=f"Reset your password: {reset_url}",
            )
    except Exception as exc:
        log.warning("forgot-password emailit failed: %s", exc)

    # Always log link to admin notifications
    from models import NotificationItem

    notif = NotificationItem(
        kind="client",
        title=f"Password reset requested: {email_lc}",
        body=f"Reset link: {reset_url}",
        link="/admin/revenue",
    )
    await db.notifications.insert_one(prepare_for_mongo(notif.model_dump()))
    return {"ok": True}


@client_auth_router.post("/reset-password")
async def reset_password(
    req: ResetPasswordRequest, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    rec = await db.client_reset_tokens.find_one({"token": req.token}, {"_id": 0})
    if not rec or rec.get("used"):
        raise HTTPException(400, "Invalid or used token")
    try:
        expires = datetime.fromisoformat(rec["expires_at"].replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Invalid token")
    if expires < _now():
        raise HTTPException(400, "Token expired")
    email = rec["email"]
    pw_hash = hash_password(req.password)
    await db.clients.update_one(
        {"email": email},
        {
            "$set": {
                "password_hash": pw_hash,
                "needs_password_setup": False,
                "updated_at": _now().isoformat(),
            }
        },
    )
    await db.client_reset_tokens.update_one(
        {"token": req.token}, {"$set": {"used": True, "used_at": _now().isoformat()}}
    )
    return {"ok": True}


# =============================================================================
# PORTAL router (client auth required)
# =============================================================================
client_portal_router = APIRouter(
    prefix="/clients/me",
    tags=["client-portal"],
)


@client_portal_router.get("")
async def me(current=Depends(get_current_client)) -> Dict[str, Any]:
    return current


@client_portal_router.patch("")
async def update_me(
    req: ClientUpdateProfile,
    request: Request,
    current=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    update: Dict[str, Any] = {"updated_at": _now().isoformat()}
    for k in ("name", "company", "phone"):
        v = getattr(req, k)
        if v is not None:
            update[k] = v
    await db.clients.update_one({"email": current["email"]}, {"$set": update})
    fresh = await db.clients.find_one(
        {"email": current["email"]}, {"_id": 0, "password_hash": 0}
    )
    return fresh


def _filter_by_client_email(items: List[Dict[str, Any]], email: str) -> List[Dict[str, Any]]:
    """Match items where the client email appears in common fields."""
    email_lc = email.lower()
    out: List[Dict[str, Any]] = []
    for it in items:
        candidates = [
            it.get("client_email"),
            it.get("customer_email"),
            it.get("email"),
            (it.get("client") or {}).get("email") if isinstance(it.get("client"), dict) else None,
            (it.get("subscriber") or {}).get("email_address")
            if isinstance(it.get("subscriber"), dict) else None,
            (it.get("buyer") or {}).get("email") if isinstance(it.get("buyer"), dict) else None,
        ]
        if any(c and c.lower() == email_lc for c in candidates if isinstance(c, str)):
            out.append(it)
    return out


@client_portal_router.get("/orders")
async def my_orders(
    request: Request,
    current=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Combines PayPal transactions + AgencyHandy orders for this client."""
    email = current["email"]
    # PayPal transactions
    pp_orders = await db.paypal_transactions.find(
        {"customer_email": email}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    # Agency Handy orders (best-effort, server-side filter when possible)
    ah_orders: List[Dict[str, Any]] = []
    try:
        ah = request.app.state.agencyhandy
        if ah.is_configured:
            # Try server-side filter first — drops payload size from O(all orders) to O(this client's orders)
            res = await ah.list_orders_for_client_email(email)
            if res.get("success") and res.get("client_resolved") is not False:
                ah_orders = (res.get("data") or {}).get("data") or []
            else:
                # Fallback: pull-all then locally filter (preserves prior behavior when company_id missing)
                fallback = await ah.list_orders()
                if fallback.get("success"):
                    ah_orders = _filter_by_client_email(
                        (fallback.get("data") or {}).get("data") or [], email
                    )
    except Exception as exc:
        log.warning("AH orders fetch failed: %s", exc)
    return {
        "paypal": pp_orders,
        "agencyhandy": [serialize_doc(o) for o in ah_orders],
    }


@client_portal_router.get("/subscriptions")
async def my_subscriptions(
    request: Request,
    current=Depends(get_current_client),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    email = current["email"]
    pp_subs = await db.paypal_subscriptions.find(
        {"customer_email": email}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    ah_subs: List[Dict[str, Any]] = []
    try:
        ah = request.app.state.agencyhandy
        if ah.is_configured:
            res = await ah.list_subscriptions()
            if res.get("success"):
                ah_subs = _filter_by_client_email(
                    (res.get("data") or {}).get("data") or [], email
                )
    except Exception as exc:
        log.warning("AH subscriptions fetch failed: %s", exc)
    return {
        "paypal": pp_subs,
        "agencyhandy": [serialize_doc(s) for s in ah_subs],
    }


@client_portal_router.get("/invoices")
async def my_invoices(
    request: Request,
    current=Depends(get_current_client),
) -> Dict[str, Any]:
    email = current["email"]
    ah_invoices: List[Dict[str, Any]] = []
    try:
        ah = request.app.state.agencyhandy
        if ah.is_configured:
            res = await ah.list_invoices()
            if res.get("success"):
                ah_invoices = _filter_by_client_email(
                    (res.get("data") or {}).get("data") or [], email
                )
    except Exception as exc:
        log.warning("AH invoices fetch failed: %s", exc)
    return {"agencyhandy": [serialize_doc(i) for i in ah_invoices]}


@client_portal_router.get("/proposals")
async def my_proposals(
    request: Request,
    current=Depends(get_current_client),
) -> Dict[str, Any]:
    email = current["email"]
    ah_props: List[Dict[str, Any]] = []
    try:
        ah = request.app.state.agencyhandy
        if ah.is_configured:
            res = await ah.list_quotations()
            if res.get("success"):
                ah_props = _filter_by_client_email(
                    (res.get("data") or {}).get("data") or [], email
                )
    except Exception as exc:
        log.warning("AH proposals fetch failed: %s", exc)
    return {"agencyhandy": [serialize_doc(p) for p in ah_props]}


# =============================================================================
# ADMIN router (founder-only) — list/manage clients
# =============================================================================
from auth import get_current_user  # noqa: E402

client_admin_router = APIRouter(
    prefix="/admin/clients",
    tags=["admin-clients"],
    dependencies=[Depends(get_current_user)],
)


@client_admin_router.get("")
async def admin_list_clients(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = (
        await db.clients.find({}, {"_id": 0, "password_hash": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return docs


@client_admin_router.post("/{email}/resend-setup")
async def admin_resend_setup(
    email: str, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    email_lc = email.lower().strip()
    client = await db.clients.find_one({"email": email_lc}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(hours=PASSWORD_RESET_TTL_HOURS)
    await db.client_reset_tokens.insert_one(
        prepare_for_mongo({
            "token": token,
            "email": email_lc,
            "purpose": "setup",
            "expires_at": expires.isoformat(),
            "used": False,
            "created_at": _now().isoformat(),
        })
    )
    setup_url = (
        f"{os.environ.get('APP_BASE_URL', 'https://bybloomlabs.com').rstrip('/')}"
        f"/set-password?token={token}"
    )
    try:
        emailit = request.app.state.emailit
        if emailit.is_configured:
            await emailit.send_email(
                to=email_lc,
                subject="Set your Bloom Labs portal password",
                html=_password_setup_html(client.get("name", ""), setup_url),
                text=setup_url,
            )
    except Exception as exc:
        log.warning("resend-setup emailit failed: %s", exc)
    return {"ok": True, "setup_url": setup_url}



# ---------- Admin CRUD ----------
class AdminCreateClientRequest(BaseModel):
    email: EmailStr
    name: str = ""
    company: Optional[str] = None
    status: str = "active"  # noqa: F811 — Pydantic field, not the fastapi.status import
    send_setup_email: bool = True


class AdminUpdateClientRequest(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = None  # noqa: F811
    notes: Optional[str] = None


@client_admin_router.post("")
async def admin_create_client(
    req: AdminCreateClientRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Admin-side client provisioning. Mirrors the PayPal auto-provision flow
    but triggered by the founder from /admin/clients."""
    email_lc = req.email.lower().strip()
    existing = await db.clients.find_one({"email": email_lc})
    if existing:
        raise HTTPException(409, f"Client {email_lc} already exists")

    doc = _new_client_doc(
        email_lc, req.name, password_hash=None, source="admin", source_id="admin-created"
    )
    if req.company:
        doc["company"] = req.company
    if req.status and req.status in ("active", "paused", "archived"):
        doc["status"] = req.status
    await db.clients.insert_one(prepare_for_mongo(doc))
    doc.pop("password_hash", None)

    setup_url = None
    if req.send_setup_email:
        token = secrets.token_urlsafe(32)
        expires = _now() + timedelta(hours=PASSWORD_RESET_TTL_HOURS)
        await db.client_reset_tokens.insert_one(
            prepare_for_mongo({
                "token": token, "email": email_lc, "purpose": "setup",
                "expires_at": expires.isoformat(), "used": False,
                "created_at": _now().isoformat(),
            })
        )
        setup_url = (
            f"{os.environ.get('APP_BASE_URL', 'https://bybloomlabs.com').rstrip('/')}"
            f"/set-password?token={token}"
        )
        try:
            emailit = request.app.state.emailit
            if getattr(emailit, "is_configured", False):
                await emailit.send_email(
                    to=email_lc,
                    subject="Welcome to Bloom Labs — set your password",
                    html=_password_setup_html(req.name or email_lc, setup_url),
                    text=f"Welcome! Set your client portal password: {setup_url}",
                )
        except Exception as exc:
            log.warning("admin_create_client emailit failed: %s", exc)

    return {"client": doc, "setup_url": setup_url}


@client_admin_router.patch("/{email}")
async def admin_update_client(
    email: str,
    req: AdminUpdateClientRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    email_lc = email.lower().strip()
    existing = await db.clients.find_one({"email": email_lc}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Client not found")
    patch: Dict[str, Any] = {"updated_at": _now().isoformat()}
    if req.name is not None:
        patch["name"] = req.name.strip()
    if req.company is not None:
        patch["company"] = req.company.strip()
    if req.notes is not None:
        patch["notes"] = req.notes.strip()
    if req.status is not None:
        if req.status not in ("active", "paused", "archived"):
            raise HTTPException(400, "status must be active|paused|archived")
        patch["status"] = req.status
    await db.clients.update_one({"email": email_lc}, {"$set": patch})
    fresh = await db.clients.find_one({"email": email_lc}, {"_id": 0, "password_hash": 0})
    return fresh


@client_admin_router.delete("/{email}")
async def admin_delete_client(
    email: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Soft delete — keeps payments/onboardings/milestones intact but
    removes login + portal access by archiving the record."""
    email_lc = email.lower().strip()
    existing = await db.clients.find_one({"email": email_lc}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Client not found")
    await db.clients.update_one(
        {"email": email_lc},
        {"$set": {
            "status": "archived",
            "archived_at": _now().isoformat(),
            "updated_at": _now().isoformat(),
        }},
    )
    # Invalidate any active reset/setup tokens
    await db.client_reset_tokens.update_many(
        {"email": email_lc, "used": False}, {"$set": {"used": True}}
    )
    return {"ok": True, "email": email_lc, "archived": True}
