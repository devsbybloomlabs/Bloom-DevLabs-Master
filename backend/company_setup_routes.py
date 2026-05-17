"""Post-purchase company setup + team invite flow.

Flow:
  1. Client completes PayPal checkout → frontend redirects to /portal/welcome
  2. Welcome wizard calls POST /company-setup/init  (auto-creates a company
     bound to the purchaser, with `setup_status=pending`).
  3. Wizard collects:
       - company name, phone, address (POST /company-setup/profile)
       - team-member emails to invite (POST /company-setup/invites)
  4. Each invited teammate gets an email with a `/join/{token}` link.
  5. On accept (POST /company-invites/{token}/accept): creates a new client
     user (or links existing), records membership with default `role=viewer`.
  6. Any company admin can promote a viewer to admin
     (POST /companies/me/members/{user_id}/role).

Roles:
  - owner   : the original purchaser. Always admin. Cannot be demoted.
  - admin   : full purchaser-level access.
  - viewer  : read-only access to the same portal views.
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from client_routes import get_current_client
from emailit_client import EmailitClient

logger = logging.getLogger(__name__)

_mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]
_emailit = EmailitClient()

INVITE_TTL_DAYS = 14

company_setup_router = APIRouter(prefix="/company-setup", tags=["company-setup"])
companies_me_router = APIRouter(prefix="/companies/me", tags=["companies-me"])
company_invites_router = APIRouter(prefix="/company-invites", tags=["company-invites"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class CompanyProfilePayload(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=40)
    address: Optional[str] = Field(default=None, max_length=400)


class InvitePayload(BaseModel):
    emails: List[EmailStr] = Field(default_factory=list, max_items=20)


class RoleUpdatePayload(BaseModel):
    role: str  # "admin" | "viewer"


class AcceptInvitePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=8, max_length=200)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_or_create_company_for_client(client_email: str, client_name: str) -> Dict[str, Any]:
    """Find or create the company this client is the owner of."""
    existing = await _db.companies.find_one(
        {"owner_client_email": client_email.lower()},
        {"_id": 0},
    )
    if existing:
        return existing
    company_id = str(uuid.uuid4())
    doc = {
        "id": company_id,
        "name": client_name or client_email,
        "owner_client_email": client_email.lower(),
        "phone": None,
        "address": None,
        "setup_status": "pending",  # pending | partial | complete
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db.companies.insert_one(doc)
    # Insert owner as the first member with role=admin
    await _db.company_members.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "client_email": client_email.lower(),
        "role": "admin",
        "is_owner": True,
        "invited_by": None,
        "invited_at": None,
        "accepted_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
    })
    logger.info("company.created id=%s owner=%s", company_id, client_email)
    return {**doc, "_id": None}


async def _get_member(company_id: str, client_email: str) -> Optional[Dict[str, Any]]:
    return await _db.company_members.find_one(
        {"company_id": company_id, "client_email": client_email.lower()},
        {"_id": 0},
    )


async def _require_company_admin(company_id: str, client_email: str) -> Dict[str, Any]:
    mem = await _get_member(company_id, client_email)
    if not mem or mem.get("role") != "admin" or mem.get("status") != "active":
        raise HTTPException(status_code=403, detail="Company-admin role required")
    return mem


async def _members_for(company_id: str) -> List[Dict[str, Any]]:
    cursor = _db.company_members.find({"company_id": company_id}, {"_id": 0})
    return [m async for m in cursor]


# ---------------------------------------------------------------------------
# /company-setup
# ---------------------------------------------------------------------------
@company_setup_router.post("/init")
async def init_setup(current=Depends(get_current_client)) -> Dict[str, Any]:
    """Idempotent — called by the post-purchase wizard on first load."""
    company = await _get_or_create_company_for_client(current["email"], current.get("name", ""))
    members = await _members_for(company["id"])
    return {"company": company, "members": members}


@company_setup_router.get("/status")
async def get_setup_status(current=Depends(get_current_client)) -> Dict[str, Any]:
    """Used by the portal banner fallback to know if wizard is complete."""
    company = await _db.companies.find_one(
        {"owner_client_email": current["email"].lower()}, {"_id": 0}
    )
    if not company:
        return {"company": None, "setup_status": "none"}
    return {"company": company, "setup_status": company.get("setup_status", "pending")}


@company_setup_router.post("/profile")
async def save_company_profile(
    payload: CompanyProfilePayload,
    current=Depends(get_current_client),
) -> Dict[str, Any]:
    company = await _get_or_create_company_for_client(current["email"], current.get("name", ""))
    await _db.companies.update_one(
        {"id": company["id"]},
        {"$set": {
            "name": payload.company_name.strip(),
            "phone": (payload.phone or "").strip() or None,
            "address": (payload.address or "").strip() or None,
            "setup_status": "partial",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    refreshed = await _db.companies.find_one({"id": company["id"]}, {"_id": 0})
    return {"company": refreshed}


@company_setup_router.post("/invites")
async def send_team_invites(
    payload: InvitePayload,
    current=Depends(get_current_client),
) -> Dict[str, Any]:
    company = await _get_or_create_company_for_client(current["email"], current.get("name", ""))
    sent: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") or "https://bybloomlabs.com"

    for email in payload.emails:
        email_lc = email.lower().strip()
        if email_lc == current["email"].lower():
            skipped.append({"email": email_lc, "reason": "owner"})
            continue
        existing_member = await _get_member(company["id"], email_lc)
        if existing_member:
            skipped.append({"email": email_lc, "reason": "already-member"})
            continue
        existing_invite = await _db.company_invites.find_one(
            {"company_id": company["id"], "email": email_lc, "status": "pending"}
        )
        if existing_invite:
            skipped.append({"email": email_lc, "reason": "already-invited"})
            continue
        token = secrets.token_urlsafe(32)
        invite_doc = {
            "id": str(uuid.uuid4()),
            "token": token,
            "company_id": company["id"],
            "email": email_lc,
            "role": "viewer",
            "invited_by": current["email"].lower(),
            "invited_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)).isoformat(),
            "status": "pending",  # pending | accepted | revoked | expired
        }
        await _db.company_invites.insert_one(invite_doc)
        join_url = f"{base}/join/{token}"
        try:
            await _emailit.send_email(
                to=email_lc,
                subject=f"You're invited to join {company['name']} on Bloom DevLabs",
                html=f"""
                    <p>Hi,</p>
                    <p><strong>{current.get('name') or current['email']}</strong> has invited you to join
                    <strong>{company['name']}</strong> on Bloom DevLabs.</p>
                    <p>You'll have view-only access to the company's projects, invoices, and
                    documents inside the client portal.</p>
                    <p><a href="{join_url}" style="display:inline-block;background:#1E3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Accept invitation &amp; create account</a></p>
                    <p style="font-size:12px;color:#64748B;">This invite expires in {INVITE_TTL_DAYS} days.<br>
                    If the button doesn't work, paste this link into your browser:<br>{join_url}</p>
                """,
            )
            sent.append({"email": email_lc, "token": token})
        except Exception as exc:  # noqa: BLE001
            logger.warning("company_invite.email_failed email=%s err=%s", email_lc, exc)
            sent.append({"email": email_lc, "token": token, "email_failed": True})

    # Mark company setup as complete if at least name + phone were collected
    refreshed = await _db.companies.find_one({"id": company["id"]}, {"_id": 0})
    if refreshed and refreshed.get("name") and refreshed.get("phone"):
        await _db.companies.update_one(
            {"id": company["id"]},
            {"$set": {"setup_status": "complete", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"sent": sent, "skipped": skipped}


@company_setup_router.post("/complete")
async def mark_complete(current=Depends(get_current_client)) -> Dict[str, Any]:
    """Wizard 'Done' — even if the user invited 0 teammates, mark complete so
    we don't show the banner forever."""
    company = await _get_or_create_company_for_client(current["email"], current.get("name", ""))
    await _db.companies.update_one(
        {"id": company["id"]},
        {"$set": {"setup_status": "complete", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# /companies/me
# ---------------------------------------------------------------------------
@companies_me_router.get("")
async def get_my_company(current=Depends(get_current_client)) -> Dict[str, Any]:
    """Return the company current user belongs to (owner OR member) + role."""
    email_lc = current["email"].lower()
    mem = await _db.company_members.find_one({"client_email": email_lc, "status": "active"}, {"_id": 0})
    if not mem:
        return {"company": None, "role": None, "members": []}
    company = await _db.companies.find_one({"id": mem["company_id"]}, {"_id": 0})
    members = await _members_for(mem["company_id"])
    return {"company": company, "role": mem.get("role"), "members": members, "is_owner": mem.get("is_owner", False)}


@companies_me_router.post("/members/{member_id}/role")
async def update_member_role(
    member_id: str,
    payload: RoleUpdatePayload,
    current=Depends(get_current_client),
) -> Dict[str, Any]:
    if payload.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="role must be admin or viewer")
    # Resolve current user's company + require admin
    me = await _db.company_members.find_one({"client_email": current["email"].lower(), "status": "active"}, {"_id": 0})
    if not me:
        raise HTTPException(status_code=404, detail="not in any company")
    await _require_company_admin(me["company_id"], current["email"])
    target = await _db.company_members.find_one({"id": member_id, "company_id": me["company_id"]}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="member not found")
    if target.get("is_owner") and payload.role != "admin":
        raise HTTPException(status_code=400, detail="cannot demote the company owner")
    await _db.company_members.update_one({"id": member_id}, {"$set": {"role": payload.role}})
    refreshed = await _db.company_members.find_one({"id": member_id}, {"_id": 0})
    return {"member": refreshed}


# ---------------------------------------------------------------------------
# /company-invites
# ---------------------------------------------------------------------------
@company_invites_router.get("/{token}")
async def get_invite(token: str) -> Dict[str, Any]:
    invite = await _db.company_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="invite not found")
    if invite.get("status") != "pending":
        raise HTTPException(status_code=410, detail=f"invite is {invite.get('status')}")
    if datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        await _db.company_invites.update_one({"token": token}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=410, detail="invite expired")
    company = await _db.companies.find_one({"id": invite["company_id"]}, {"_id": 0, "owner_client_email": 0})
    return {
        "email": invite["email"],
        "company_name": company["name"] if company else None,
        "invited_by": invite.get("invited_by"),
        "role": invite["role"],
    }


@company_invites_router.post("/{token}/accept")
async def accept_invite(token: str, payload: AcceptInvitePayload) -> Dict[str, Any]:
    from auth import hash_password  # local import to avoid cycle
    invite = await _db.company_invites.find_one({"token": token}, {"_id": 0})
    if not invite or invite.get("status") != "pending":
        raise HTTPException(status_code=404, detail="invite not found or already used")
    if datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        await _db.company_invites.update_one({"token": token}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=410, detail="invite expired")

    email_lc = invite["email"].lower()
    # Either create the client user or, if one already exists, link them.
    existing = await _db.clients.find_one({"email": email_lc}, {"_id": 0})
    if existing:
        # Don't overwrite password if they already have one
        if not existing.get("password_hash"):
            await _db.clients.update_one(
                {"email": email_lc},
                {"$set": {
                    "password_hash": hash_password(payload.password),
                    "name": payload.name.strip(),
                    "needs_password_setup": False,
                }},
            )
    else:
        await _db.clients.insert_one({
            "id": str(uuid.uuid4()),
            "email": email_lc,
            "name": payload.name.strip(),
            "password_hash": hash_password(payload.password),
            "needs_password_setup": False,
            "source": "company_invite",
            "source_id": invite["company_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Register membership
    await _db.company_members.insert_one({
        "id": str(uuid.uuid4()),
        "company_id": invite["company_id"],
        "client_email": email_lc,
        "role": invite["role"],
        "is_owner": False,
        "invited_by": invite.get("invited_by"),
        "invited_at": invite.get("invited_at"),
        "accepted_at": datetime.now(timezone.utc).isoformat(),
        "status": "active",
    })
    await _db.company_invites.update_one(
        {"token": token},
        {"$set": {"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "email": email_lc}


__all__ = ["company_setup_router", "companies_me_router", "company_invites_router"]
