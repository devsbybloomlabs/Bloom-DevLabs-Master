"""Phase C — VIP Support Clearance system.

Concepts:
  • Every company gets a memorable Support UID at creation: `BL-SUP-XXXXXX`
    (6 alpha-numeric chars). Stored on the company, surfaced in the client
    portal as a badge so the client can quote it when contacting support.
  • Companies have a `support_tier`: vip | premium | standard | none.
  • A central SLA matrix (stored in `app_settings.support_sla`) defines the
    response promise + boilerplate ("spiel") per tier — admin can edit.
  • Support agents land on `/admin/support-clearance`, paste a UID or email,
    and get: company name, tier, SLA spiel (1-click copy), recent tickets,
    open subscriptions, contact info, last activity.
  • A public-but-rate-limited `GET /api/support/clearance/{uid}` endpoint
    returns the minimum needed for a chat-bot to make a routing decision.
  • When a client purchases a VIP/Premium support subscription via PayPal,
    a webhook hook (registered with subscription_routes) calls
    `apply_support_subscription_upgrade` and bumps the tier automatically.

Routes mounted from `server.py`:
  • support_admin_router  → `/admin/support-clearance`  (founder JWT)
  • support_public_router → `/support/clearance/{uid}`  (no auth, validate-only)
  • SLA matrix CRUD       → `/admin/support-clearance/sla`
"""
from __future__ import annotations

import logging
import re
import secrets
import string
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from activity_log import log_activity
from auth import get_current_user
from db_utils import prepare_for_mongo

log = logging.getLogger("support_clearance")

UID_ALPHABET = string.ascii_uppercase + string.digits
TIERS = ("none", "standard", "premium", "vip")

# ---- Default SLA matrix (admin can override via the admin UI) ----
DEFAULT_SLA: Dict[str, Dict[str, Any]] = {
    "vip": {
        "label": "VIP Support",
        "response_time": "Live chat · responses in < 30 minutes",
        "channels": ["chat", "email", "slack"],
        "spiel": (
            "Hey there — VIP support here. I'm picking up your message right "
            "now and you'll have a real human reply within 30 minutes (often "
            "much faster). Anything urgent, drop your phone number and I'll "
            "call you back in 10."
        ),
        "color": "amber",
    },
    "premium": {
        "label": "Premium Support",
        "response_time": "Email · responses within 4 business hours",
        "channels": ["email", "chat"],
        "spiel": (
            "Thanks for reaching out — you're on our Premium support plan, "
            "so we'll have a teammate respond within 4 business hours. "
            "Please reply with screenshots or steps to reproduce so we can "
            "fix this in one round trip."
        ),
        "color": "sky",
    },
    "standard": {
        "label": "Standard Support",
        "response_time": "Email · responses within 24–48 business hours",
        "channels": ["email"],
        "spiel": (
            "Hi there — thanks for the message. You're on our Standard "
            "support tier (24–48 business-hour response window). We'll "
            "review and reply via email shortly. Need faster turnaround? "
            "Reply with 'upgrade' and we'll send the VIP support plan."
        ),
        "color": "slate",
    },
    "none": {
        "label": "No active support plan",
        "response_time": "Best-effort, no SLA guarantee",
        "channels": ["email"],
        "spiel": (
            "Thanks for reaching out. We don't currently have an active "
            "support plan on file for you — please check out our Care Plans "
            "page or reply with 'upgrade' and we'll send the options. "
            "For urgent items in the meantime, email founder@thesalvador.group."
        ),
        "color": "slate",
    },
}

# Maps subscription plan_id substrings → support_tier. Admins manage real
# PayPal plan IDs externally so we keep it loose with substring matching.
TIER_DETECTION_HINTS: Dict[str, str] = {
    "vip": "vip",
    "priority": "vip",
    "premium": "premium",
    "care-plus": "premium",
    "care_plus": "premium",
    "standard": "standard",
    "care": "standard",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _generate_uid() -> str:
    """Memorable 6-char alphanumeric Support UID: `BL-SUP-A4F2X9`."""
    return "BL-SUP-" + "".join(secrets.choice(UID_ALPHABET) for _ in range(6))


async def ensure_support_uid(
    db: AsyncIOMotorDatabase, company: Dict[str, Any]
) -> Dict[str, Any]:
    """If the company has no Support UID, generate one. Idempotent."""
    if company.get("support_uid"):
        return company
    uid = _generate_uid()
    # Collision retry — very low probability but cheap to handle.
    for _ in range(5):
        existing = await db.companies.find_one(
            {"support_uid": uid}, {"_id": 0, "id": 1}
        )
        if not existing:
            break
        uid = _generate_uid()
    await db.companies.update_one(
        {"id": company["id"]},
        {"$set": {"support_uid": uid, "updated_at": _now_iso()}},
    )
    company["support_uid"] = uid
    return company


async def backfill_support_uids(db: AsyncIOMotorDatabase) -> int:
    """Generate Support UIDs for every existing company that lacks one.

    Called once at server warmup after the Companies migration so legacy
    clients also get a UID.
    """
    count = 0
    async for company in db.companies.find({"support_uid": None}, {"_id": 0}):
        await ensure_support_uid(db, company)
        count += 1
    if count:
        log.info("Backfilled %s Support UIDs", count)
    return count


async def get_sla_matrix(db: AsyncIOMotorDatabase) -> Dict[str, Dict[str, Any]]:
    """Return the current SLA matrix, falling back to DEFAULT_SLA."""
    doc = await db.app_settings.find_one(
        {"_id": "support_sla"}, {"_id": 0}
    )
    if doc and doc.get("matrix"):
        # Merge with defaults so missing keys stay populated
        merged: Dict[str, Dict[str, Any]] = {**DEFAULT_SLA}
        for tier, payload in (doc["matrix"] or {}).items():
            merged[tier] = {**DEFAULT_SLA.get(tier, {}), **(payload or {})}
        return merged
    return DEFAULT_SLA


async def detect_support_tier_from_subscription(plan_id: str, plan_name: str = "") -> str:
    """Map a PayPal plan_id / plan_name to a support_tier."""
    haystack = f"{plan_id or ''} {plan_name or ''}".lower()
    for needle, tier in TIER_DETECTION_HINTS.items():
        if needle in haystack:
            return tier
    return "standard"


async def apply_support_subscription_upgrade(
    db: AsyncIOMotorDatabase,
    *,
    client_email: str,
    plan_id: str,
    plan_name: str = "",
) -> Dict[str, Any]:
    """Called when a subscription is activated — bumps the company tier."""
    email = (client_email or "").lower().strip()
    if not email:
        return {"ok": False, "reason": "no_email"}
    company = await db.companies.find_one({"primary_email": email}, {"_id": 0})
    if not company:
        return {"ok": False, "reason": "no_company"}
    new_tier = await detect_support_tier_from_subscription(plan_id, plan_name)
    if company.get("support_tier") == new_tier:
        return {"ok": True, "tier": new_tier, "changed": False}
    company = await ensure_support_uid(db, company)
    await db.companies.update_one(
        {"id": company["id"]},
        {"$set": {"support_tier": new_tier, "updated_at": _now_iso()}},
    )
    await log_activity(
        db,
        company_id=company["id"],
        type="support.upgraded",
        title=f"Support tier set to {new_tier.upper()}",
        description=f"Auto-applied from subscription {plan_name or plan_id}.",
        meta={"plan_id": plan_id, "plan_name": plan_name, "new_tier": new_tier},
    )
    return {"ok": True, "tier": new_tier, "changed": True, "support_uid": company["support_uid"]}


# =========================================================================
# Admin router — support clearance lookup
# =========================================================================
support_admin_router = APIRouter(
    prefix="/admin/support-clearance",
    tags=["support-clearance"],
    dependencies=[Depends(get_current_user)],
)


@support_admin_router.get("/sla")
async def get_sla(db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    return {"matrix": await get_sla_matrix(db)}


class SlaTierUpdate(BaseModel):
    label: Optional[str] = None
    response_time: Optional[str] = None
    spiel: Optional[str] = None
    channels: Optional[List[str]] = None
    color: Optional[str] = None


@support_admin_router.put("/sla/{tier}")
async def update_sla_tier(
    tier: str,
    req: SlaTierUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if tier not in TIERS:
        raise HTTPException(400, f"Tier must be one of {list(TIERS)}")
    update: Dict[str, Any] = {}
    for k in ("label", "response_time", "spiel", "channels", "color"):
        v = getattr(req, k)
        if v is not None:
            update[k] = v
    if not update:
        raise HTTPException(400, "Nothing to update")
    matrix_set = {f"matrix.{tier}.{k}": v for k, v in update.items()}
    await db.app_settings.update_one(
        {"_id": "support_sla"},
        {"$set": {**matrix_set, "updated_at": _now_iso()}},
        upsert=True,
    )
    return {"ok": True, "tier": tier, "matrix": await get_sla_matrix(db)}


@support_admin_router.get("/lookup")
async def lookup_support_clearance(
    db: AsyncIOMotorDatabase = Depends(get_db),
    uid: Optional[str] = None,
    email: Optional[str] = None,
) -> Dict[str, Any]:
    """Search by Support UID OR email. Returns full clearance package."""
    if not uid and not email:
        raise HTTPException(400, "Provide ?uid= or ?email=")
    filt: Dict[str, Any] = {}
    if uid:
        filt["support_uid"] = uid.upper().strip()
    elif email:
        filt["primary_email"] = email.lower().strip()
    company = await db.companies.find_one(filt, {"_id": 0})
    if not company:
        # Email could also live on a non-primary contact
        if email:
            contact = await db.contacts.find_one(
                {"email": email.lower().strip(), "archived": {"$ne": True}},
                {"_id": 0},
            )
            if contact:
                company = await db.companies.find_one(
                    {"id": contact["company_id"]}, {"_id": 0}
                )
        if not company:
            raise HTTPException(404, "No company matches that UID or email")
    # Ensure UID exists (defensive — should always be present after backfill)
    company = await ensure_support_uid(db, company)
    sla = (await get_sla_matrix(db)).get(company.get("support_tier") or "none")
    contacts = await db.contacts.find(
        {"company_id": company["id"], "archived": {"$ne": True}}, {"_id": 0}
    ).to_list(50)
    tickets = await db.client_contacts.find(
        {"client_email": company["primary_email"]}, {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    active_subs = await db.paypal_subscriptions.find(
        {
            "customer_email": company["primary_email"],
            "status": {"$in": ["active", "trialing"]},
        },
        {"_id": 0},
    ).to_list(20)
    return {
        "company": company,
        "sla": sla,
        "contacts": contacts,
        "recent_tickets": tickets,
        "active_subscriptions": active_subs,
        "fetched_at": _now_iso(),
    }


class TierUpdateRequest(BaseModel):
    tier: str = Field(..., pattern="^(none|standard|premium|vip)$")
    reason: Optional[str] = None


@support_admin_router.post("/companies/{company_id}/tier")
async def set_company_tier(
    company_id: str,
    req: TierUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Manual tier override (e.g. complimentary VIP for a referral)."""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")
    company = await ensure_support_uid(db, company)
    prev = company.get("support_tier") or "none"
    if prev == req.tier:
        return {"ok": True, "tier": req.tier, "changed": False}
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"support_tier": req.tier, "updated_at": _now_iso()}},
    )
    await log_activity(
        db,
        company_id=company_id,
        type="support.upgraded" if TIERS.index(req.tier) > TIERS.index(prev) else "support.downgraded",
        title=f"Support tier {prev.upper()} → {req.tier.upper()}",
        description=req.reason,
        meta={"previous": prev, "new": req.tier},
    )
    fresh = await db.companies.find_one({"id": company_id}, {"_id": 0})
    return {"ok": True, "tier": req.tier, "changed": True, "company": fresh}


@support_admin_router.post("/companies/{company_id}/regenerate-uid")
async def regenerate_uid(
    company_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")
    new_uid = _generate_uid()
    for _ in range(5):
        if not await db.companies.find_one({"support_uid": new_uid}, {"_id": 0, "id": 1}):
            break
        new_uid = _generate_uid()
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"support_uid": new_uid, "updated_at": _now_iso()}},
    )
    await log_activity(
        db,
        company_id=company_id,
        type="support.uid_rotated",
        title=f"Support UID rotated → {new_uid}",
    )
    return {"ok": True, "support_uid": new_uid}


# =========================================================================
# Public verify endpoint — no auth, used by chat-bot agents
# =========================================================================
support_public_router = APIRouter(prefix="/support", tags=["support-public"])


@support_public_router.get("/clearance/{uid}")
async def verify_uid_public(
    uid: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Return ONLY the bare minimum needed for routing: tier + label + spiel.
    No PII, no email. Safe to call from a chat widget."""
    if not re.match(r"^BL-SUP-[A-Z0-9]{4,8}$", uid.upper()):
        return {"valid": False, "reason": "malformed"}
    company = await db.companies.find_one(
        {"support_uid": uid.upper()}, {"_id": 0, "name": 1, "support_tier": 1, "support_uid": 1}
    )
    if not company:
        return {"valid": False}
    tier = company.get("support_tier") or "none"
    sla = (await get_sla_matrix(db)).get(tier) or {}
    return {
        "valid": True,
        "company_name": company.get("name"),
        "tier": tier,
        "sla": sla,
    }


# =========================================================================
# Client portal — show the badge to logged-in clients
# =========================================================================
def _client_dep():
    """Lazy import to avoid circular dep with client_routes."""
    from client_routes import get_current_client
    return get_current_client


support_client_router = APIRouter(prefix="/clients/me/support", tags=["support-client"])


@support_client_router.get("/clearance")
async def my_support_clearance(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client=Depends(_client_dep()),
) -> Dict[str, Any]:
    """Returns the current client's support tier + UID for portal display."""
    email = client["email"]
    company = await db.companies.find_one(
        {"primary_email": email}, {"_id": 0}
    )
    if not company:
        return {"tier": "none", "support_uid": None, "sla": (await get_sla_matrix(db))["none"]}
    company = await ensure_support_uid(db, company)
    tier = company.get("support_tier") or "none"
    sla = (await get_sla_matrix(db)).get(tier) or {}
    return {
        "tier": tier,
        "support_uid": company["support_uid"],
        "sla": sla,
        "company_name": company.get("name"),
    }


__all__ = [
    "support_admin_router",
    "support_public_router",
    "support_client_router",
    "backfill_support_uids",
    "apply_support_subscription_upgrade",
    "ensure_support_uid",
    "get_sla_matrix",
]
