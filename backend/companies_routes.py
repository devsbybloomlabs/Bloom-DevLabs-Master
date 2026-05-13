"""Companies + Contacts admin routes (Phase B).

Companies (the entity that pays us, signs proposals, owns projects):
  GET    /admin/companies                       — list (paginated, searchable)
  POST   /admin/companies                       — create
  GET    /admin/companies/{id}                  — single
  GET    /admin/companies/{id}/detail           — denormalized bird's-eye view
  PATCH  /admin/companies/{id}                  — update
  DELETE /admin/companies/{id}                  — soft archive
  GET    /admin/companies/{id}/activity         — chronological audit log
  POST   /admin/companies/{id}/notes            — append a manual activity note

Contacts (people inside a company):
  GET    /admin/companies/{id}/contacts         — list
  POST   /admin/companies/{id}/contacts         — add
  PATCH  /admin/contacts/{contact_id}           — update
  DELETE /admin/contacts/{contact_id}           — archive
  POST   /admin/contacts/{contact_id}/promote   — make primary

A migration helper seeds `companies` + `contacts` from existing `clients`
rows on first boot — every legacy client becomes a company with itself as
the primary contact.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from activity_log import log_activity
from auth import get_current_user
from db_utils import prepare_for_mongo

log = logging.getLogger("companies")

E2E_PATTERNS = re.compile(r"^(e2e-|test-|phase\d+|smoke-)", re.IGNORECASE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =========================================================================
# Pydantic models
# =========================================================================
class CompanyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    primary_email: EmailStr
    primary_contact_name: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    phone: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_postal: Optional[str] = None
    address_country: Optional[str] = None
    source: Optional[str] = "inbound"
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


class CompanyUpdateRequest(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    phone: Optional[str] = None
    billing_email: Optional[EmailStr] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_postal: Optional[str] = None
    address_country: Optional[str] = None
    logo_url: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    archived: Optional[bool] = None


class ContactCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    role: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    is_primary: bool = False


class ContactUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    archived: Optional[bool] = None


class ActivityNoteRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None


# =========================================================================
# Companies router
# =========================================================================
companies_admin_router = APIRouter(
    prefix="/admin/companies",
    tags=["companies-admin"],
    dependencies=[Depends(get_current_user)],
)


def _make_slug(name: str, email: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (name or email.split("@")[0]).lower()).strip("-")
    return f"{base[:40]}-{uuid.uuid4().hex[:6]}"


@companies_admin_router.get("")
async def list_companies(
    db: AsyncIOMotorDatabase = Depends(get_db),
    q: Optional[str] = None,
    support_tier: Optional[str] = None,
    archived: bool = False,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """List companies. Default: archived=False. `q` matches name/email/domain."""
    filt: Dict[str, Any] = {"archived": {"$ne": True}} if not archived else {}
    if support_tier:
        filt["support_tier"] = support_tier
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        filt["$or"] = [{"name": rx}, {"primary_email": rx}, {"domain": rx}]
    docs = (
        await db.companies.find(filt, {"_id": 0})
        .sort("updated_at", -1)
        .to_list(min(limit, 500))
    )
    return docs


@companies_admin_router.post("")
async def create_company(
    req: CompanyCreateRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    primary_email = req.primary_email.lower().strip()
    existing = await db.companies.find_one(
        {"primary_email": primary_email}, {"_id": 0}
    )
    if existing:
        raise HTTPException(409, f"A company already exists for {primary_email}")
    company_id = str(uuid.uuid4())
    primary_contact_id = str(uuid.uuid4())
    now = _now_iso()
    address = {
        k: v
        for k, v in {
            "street": req.address_street,
            "city": req.address_city,
            "state": req.address_state,
            "postal_code": req.address_postal,
            "country": req.address_country,
        }.items()
        if v
    }
    company_doc = {
        "id": company_id,
        "slug": _make_slug(req.name, primary_email),
        "name": req.name.strip(),
        "primary_email": primary_email,
        "billing_email": primary_email,
        "primary_contact_id": primary_contact_id,
        "domain": req.domain,
        "industry": req.industry,
        "size": req.size,
        "phone": req.phone,
        "address": address or None,
        "logo_url": None,
        "support_tier": "none",
        "support_uid": None,  # set in Phase C
        "source": req.source or "inbound",
        "tags": req.tags or [],
        "notes": req.notes,
        "archived": False,
        "created_at": now,
        "updated_at": now,
    }
    contact_doc = {
        "id": primary_contact_id,
        "company_id": company_id,
        "name": req.primary_contact_name or req.name.strip(),
        "email": primary_email,
        "role": "Primary contact",
        "phone": req.phone,
        "linkedin": None,
        "is_primary": True,
        "archived": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.companies.insert_one(prepare_for_mongo(company_doc))
    await db.contacts.insert_one(prepare_for_mongo(contact_doc))
    # Phase C: every new company gets a Support UID immediately
    try:
        from support_clearance_routes import ensure_support_uid

        company_doc = await ensure_support_uid(db, company_doc)
    except Exception:  # pragma: no cover
        pass
    await log_activity(
        db,
        company_id=company_id,
        type="company.created",
        title=f"Company created — {req.name}",
        actor=f"admin:{(request.state.user or {}).get('email', 'unknown')}"
        if hasattr(request.state, "user")
        else "admin",
    )
    company_doc.pop("_id", None)
    return company_doc


@companies_admin_router.get("/{company_id}")
async def get_company(
    company_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    doc = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Company not found")
    return doc


@companies_admin_router.get("/{company_id}/detail")
async def get_company_detail(
    company_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Denormalized bird's-eye view — powers the Client Detail Drawer."""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")
    email = company["primary_email"]
    contacts = await db.contacts.find(
        {"company_id": company_id, "archived": {"$ne": True}}, {"_id": 0}
    ).sort("is_primary", -1).to_list(100)
    invoices = await db.invoices.find(
        {"client_email": email}, {"_id": 0}
    ).sort("issued_at", -1).limit(10).to_list(10)
    paypal_orders = await db.paypal_transactions.find(
        {"customer_email": email}, {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    subscriptions = await db.paypal_subscriptions.find(
        {"customer_email": email}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    proposals = await db.breezedocs_proposals.find(
        {"client_email": email, "archived": {"$ne": True}},
        {"_id": 0, "raw": 0},
    ).sort("created_at", -1).to_list(20)
    onboarding = await db.onboardings.find_one(
        {"client_email": email}, {"_id": 0}
    )
    milestones = await db.milestones.find(
        {"client_email": email}, {"_id": 0}
    ).sort("order", 1).to_list(50)
    tickets = await db.client_contacts.find(
        {"client_email": email}, {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)

    # Quick stats
    total_paid = sum(
        float(i.get("total") or 0) for i in invoices if i.get("status") == "paid"
    )
    outstanding = sum(
        float(i.get("balance_due") or 0) for i in invoices
        if i.get("status") in ("issued", "overdue", "partial")
    )
    open_tickets = sum(1 for t in tickets if t.get("status") == "open")
    return {
        "company": company,
        "contacts": contacts,
        "invoices": invoices,
        "paypal_orders": paypal_orders,
        "subscriptions": subscriptions,
        "proposals": proposals,
        "onboarding": onboarding,
        "milestones": milestones,
        "tickets": tickets,
        "stats": {
            "lifetime_paid": round(total_paid, 2),
            "outstanding": round(outstanding, 2),
            "open_tickets": open_tickets,
            "active_subscriptions": sum(
                1 for s in subscriptions if s.get("status") in ("active", "trialing")
            ),
            "active_proposals": sum(
                1 for p in proposals if p.get("status") in ("sent", "opened", "signed")
            ),
        },
    }


@companies_admin_router.patch("/{company_id}")
async def update_company(
    company_id: str,
    req: CompanyUpdateRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(404, "Company not found")
    update: Dict[str, Any] = {}
    address_keys_present = any(
        getattr(req, f"address_{k}") is not None
        for k in ("street", "city", "state", "postal", "country")
    )
    if address_keys_present:
        existing_addr = company.get("address") or {}
        update["address"] = {
            "street": req.address_street if req.address_street is not None else existing_addr.get("street"),
            "city": req.address_city if req.address_city is not None else existing_addr.get("city"),
            "state": req.address_state if req.address_state is not None else existing_addr.get("state"),
            "postal_code": req.address_postal if req.address_postal is not None else existing_addr.get("postal_code"),
            "country": req.address_country if req.address_country is not None else existing_addr.get("country"),
        }
    for field in (
        "name",
        "domain",
        "industry",
        "size",
        "phone",
        "billing_email",
        "logo_url",
        "tags",
        "notes",
        "archived",
    ):
        v = getattr(req, field)
        if v is not None:
            update[field] = v
    if not update:
        raise HTTPException(400, "No fields to update")
    update["updated_at"] = _now_iso()
    await db.companies.update_one(
        {"id": company_id}, {"$set": prepare_for_mongo(update)}
    )
    if "archived" in update:
        await log_activity(
            db,
            company_id=company_id,
            type="company.archived" if update["archived"] else "company.restored",
            title=("Archived" if update["archived"] else "Restored"),
        )
    fresh = await db.companies.find_one({"id": company_id}, {"_id": 0})
    return fresh


@companies_admin_router.delete("/{company_id}")
async def archive_company(
    company_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Soft archive."""
    res = await db.companies.update_one(
        {"id": company_id},
        {"$set": {"archived": True, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Company not found")
    await log_activity(db, company_id=company_id, type="company.archived", title="Archived")
    return {"ok": True}


@companies_admin_router.delete("/{company_id}/hard")
async def hard_delete_company(
    company_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Permanent delete — cascades to contacts + activity log. Use sparingly."""
    co = await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1})
    if not co:
        raise HTTPException(404, "Company not found")
    n_contacts = await db.contacts.delete_many({"company_id": company_id})
    n_activity = await db.activity_log.delete_many({"company_id": company_id})
    await db.companies.delete_one({"id": company_id})
    return {
        "ok": True,
        "deleted": {
            "company": 1,
            "contacts": n_contacts.deleted_count,
            "activity": n_activity.deleted_count,
        },
    }


@companies_admin_router.get("/{company_id}/activity")
async def get_company_activity(
    company_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    limit: int = 200,
) -> List[Dict[str, Any]]:
    docs = await db.activity_log.find(
        {"company_id": company_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(min(limit, 500))
    return docs


@companies_admin_router.post("/{company_id}/notes")
async def add_company_note(
    company_id: str,
    req: ActivityNoteRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1})
    if not company:
        raise HTTPException(404, "Company not found")
    actor_email = "admin"
    if hasattr(request.state, "user"):
        actor_email = f"admin:{(request.state.user or {}).get('email', 'unknown')}"
    note_id = await log_activity(
        db,
        company_id=company_id,
        type="note.added",
        title=req.title,
        description=req.description,
        actor=actor_email,
    )
    return {"ok": True, "id": note_id}


# =========================================================================
# Contacts (nested under company in URL for create/list, flat for update/delete)
# =========================================================================
@companies_admin_router.get("/{company_id}/contacts")
async def list_contacts(
    company_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    archived: bool = False,
) -> List[Dict[str, Any]]:
    filt: Dict[str, Any] = {"company_id": company_id}
    if not archived:
        filt["archived"] = {"$ne": True}
    docs = await db.contacts.find(filt, {"_id": 0}).sort("is_primary", -1).to_list(200)
    return docs


@companies_admin_router.post("/{company_id}/contacts")
async def add_contact(
    company_id: str,
    req: ContactCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if not await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Company not found")
    email = req.email.lower().strip()
    if await db.contacts.find_one({"company_id": company_id, "email": email}):
        raise HTTPException(409, f"{email} is already a contact on this company")
    now = _now_iso()
    contact_id = str(uuid.uuid4())
    doc = {
        "id": contact_id,
        "company_id": company_id,
        "name": req.name.strip(),
        "email": email,
        "role": req.role,
        "phone": req.phone,
        "linkedin": req.linkedin,
        "is_primary": False,  # Set via /promote endpoint
        "archived": False,
        "created_at": now,
        "updated_at": now,
    }
    await db.contacts.insert_one(prepare_for_mongo(doc))
    if req.is_primary:
        await _promote_contact(db, company_id, contact_id)
        doc["is_primary"] = True
    await log_activity(
        db,
        company_id=company_id,
        contact_id=contact_id,
        type="contact.added",
        title=f"Contact added — {req.name}",
        meta={"email": email},
    )
    return doc


contacts_admin_router = APIRouter(
    prefix="/admin/contacts",
    tags=["contacts-admin"],
    dependencies=[Depends(get_current_user)],
)


@contacts_admin_router.patch("/{contact_id}")
async def update_contact(
    contact_id: str,
    req: ContactUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    contact = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Contact not found")
    update: Dict[str, Any] = {}
    for field in ("name", "email", "role", "phone", "linkedin", "archived"):
        v = getattr(req, field)
        if v is not None:
            update[field] = v.lower().strip() if field == "email" else v
    if not update:
        raise HTTPException(400, "No fields to update")
    update["updated_at"] = _now_iso()
    await db.contacts.update_one({"id": contact_id}, {"$set": prepare_for_mongo(update)})
    fresh = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    return fresh


@contacts_admin_router.delete("/{contact_id}")
async def archive_contact(
    contact_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    contact = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Contact not found")
    if contact.get("is_primary"):
        raise HTTPException(
            400,
            "Primary contact can't be archived. Promote another contact first.",
        )
    await db.contacts.update_one(
        {"id": contact_id},
        {"$set": {"archived": True, "updated_at": _now_iso()}},
    )
    return {"ok": True}


@contacts_admin_router.delete("/{contact_id}/hard")
async def hard_delete_contact(
    contact_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Permanent delete. Primary contact still can't be removed without promoting another first."""
    contact = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Contact not found")
    if contact.get("is_primary"):
        raise HTTPException(
            400, "Primary contact can't be deleted. Promote another contact first."
        )
    await db.contacts.delete_one({"id": contact_id})
    return {"ok": True}


@contacts_admin_router.post("/{contact_id}/promote")
async def promote_contact(
    contact_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    contact = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Contact not found")
    await _promote_contact(db, contact["company_id"], contact_id)
    fresh = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    return fresh


async def _promote_contact(
    db: AsyncIOMotorDatabase, company_id: str, contact_id: str
) -> None:
    """Atomically demote all other contacts on the company + set this one primary."""
    await db.contacts.update_many(
        {"company_id": company_id},
        {"$set": {"is_primary": False, "updated_at": _now_iso()}},
    )
    await db.contacts.update_one(
        {"id": contact_id},
        {"$set": {"is_primary": True, "updated_at": _now_iso()}},
    )
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"primary_contact_id": contact_id, "updated_at": _now_iso()}},
    )


# =========================================================================
# Migration helper — seed companies from clients on first boot.
# =========================================================================
async def migrate_clients_to_companies(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """Idempotent: every client.email without a matching company gets one."""
    existing_emails = set()
    async for c in db.companies.find({}, {"_id": 0, "primary_email": 1}):
        if c.get("primary_email"):
            existing_emails.add(c["primary_email"])
    created = 0
    skipped_test = 0
    async for client in db.clients.find({}, {"_id": 0}):
        email = (client.get("email") or "").lower().strip()
        if not email or email in existing_emails:
            continue
        # Skip obvious e2e / test fixtures so the Companies list stays clean.
        if E2E_PATTERNS.match(email.split("@")[0]):
            skipped_test += 1
            continue
        company_id = str(uuid.uuid4())
        contact_id = str(uuid.uuid4())
        now = _now_iso()
        name = client.get("name") or email.split("@")[0]
        company_doc = {
            "id": company_id,
            "slug": _make_slug(client.get("company") or name, email),
            "name": client.get("company") or name,
            "primary_email": email,
            "billing_email": email,
            "primary_contact_id": contact_id,
            "domain": email.split("@", 1)[1] if "@" in email else None,
            "industry": None,
            "size": None,
            "phone": client.get("phone"),
            "address": None,
            "logo_url": None,
            "support_tier": "none",
            "support_uid": None,
            "source": client.get("source") or "migration",
            "tags": [],
            "notes": None,
            "archived": False,
            "created_at": client.get("created_at") or now,
            "updated_at": now,
        }
        contact_doc = {
            "id": contact_id,
            "company_id": company_id,
            "name": name,
            "email": email,
            "role": "Primary contact",
            "phone": client.get("phone"),
            "linkedin": None,
            "is_primary": True,
            "archived": False,
            "created_at": client.get("created_at") or now,
            "updated_at": now,
        }
        await db.companies.insert_one(prepare_for_mongo(company_doc))
        await db.contacts.insert_one(prepare_for_mongo(contact_doc))
        await log_activity(
            db,
            company_id=company_id,
            type="company.migrated",
            title="Migrated from legacy client record",
            actor="system:migration",
        )
        existing_emails.add(email)
        created += 1
    log.info(
        "Companies migration: %s created, %s test rows skipped.",
        created,
        skipped_test,
    )
    return {"created": created, "skipped_test": skipped_test}


__all__ = [
    "companies_admin_router",
    "contacts_admin_router",
    "migrate_clients_to_companies",
]
