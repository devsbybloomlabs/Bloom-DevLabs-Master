"""Commission admin routes — assignments, ledger, summary and calculator.

  GET    /admin/commissions/settings
  PUT    /admin/commissions/settings
  GET    /admin/commissions/assignments            — ?person_id=&company_id=
  POST   /admin/commissions/assignments
  PATCH  /admin/commissions/assignments/{id}
  DELETE /admin/commissions/assignments/{id}       — deactivate
  GET    /admin/commissions/ledger                 — ?person_id=&company_id=&status=&date_from=&date_to=
  POST   /admin/commissions/ledger/approve         — {entry_ids?: [], person_id?}  (eligible entries only)
  POST   /admin/commissions/ledger/mark-paid       — {entry_ids: [], reference, paid_at?}
  GET    /admin/commissions/summary                — per person / per company totals
  GET    /admin/commissions/calculator             — what-if for a payee + amount
  POST   /admin/commissions/sync                   — force a ledger sync
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import get_current_user
from commission_service import (
    RATE_TYPES,
    RECURRING_POLICIES,
    calc_commission,
    get_settings,
    parse_dt,
    resolve_rate,
    sync_commissions,
)
from db_utils import prepare_for_mongo


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


commission_admin_router = APIRouter(
    prefix="/admin/commissions",
    tags=["commissions-admin"],
    dependencies=[Depends(get_current_user)],
)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
class SettingsUpdateRequest(BaseModel):
    default_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    hold_days: Optional[int] = Field(None, ge=0, le=365)
    recurring_policy: Optional[str] = None
    recurring_months: Optional[int] = Field(None, ge=1, le=120)


@commission_admin_router.get("/settings")
async def read_settings(request: Request) -> Dict[str, Any]:
    return await get_settings(get_db(request))


@commission_admin_router.put("/settings")
async def update_settings(req: SettingsUpdateRequest, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    patch = {k: v for k, v in req.model_dump().items() if v is not None}
    if "recurring_policy" in patch and patch["recurring_policy"] not in RECURRING_POLICIES:
        raise HTTPException(422, f"recurring_policy must be one of {RECURRING_POLICIES}")
    if patch:
        await db.commission_settings.update_one({"id": "global"}, {"$set": patch}, upsert=True)
    return await get_settings(db)


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------
class AssignmentCreateRequest(BaseModel):
    person_id: str
    company_id: str
    rate_type: str = "percent"
    rate_value: Optional[float] = Field(None, ge=0)  # None -> person default -> global default
    recurring_policy: Optional[str] = None
    recurring_months: Optional[int] = Field(None, ge=1, le=120)
    hold_days: Optional[int] = Field(None, ge=0, le=365)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    notes: Optional[str] = None


class AssignmentUpdateRequest(BaseModel):
    rate_type: Optional[str] = None
    rate_value: Optional[float] = Field(None, ge=0)
    recurring_policy: Optional[str] = None
    recurring_months: Optional[int] = Field(None, ge=1, le=120)
    hold_days: Optional[int] = Field(None, ge=0, le=365)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


def _validate_assignment_fields(rate_type: Optional[str], rate_value: Optional[float],
                                policy: Optional[str]) -> None:
    if rate_type is not None and rate_type not in RATE_TYPES:
        raise HTTPException(422, f"rate_type must be one of {RATE_TYPES}")
    if rate_type == "percent" and rate_value is not None and rate_value > 100:
        raise HTTPException(422, "A percent rate cannot exceed 100")
    if policy is not None and policy not in RECURRING_POLICIES:
        raise HTTPException(422, f"recurring_policy must be one of {RECURRING_POLICIES}")


async def _decorate(db: AsyncIOMotorDatabase, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    settings = await get_settings(db)
    people = {p["id"]: p async for p in db.people.find({}, {"_id": 0})}
    companies = {c["id"]: c async for c in db.companies.find({}, {"_id": 0, "id": 1, "name": 1})}
    for a in items:
        person = people.get(a["person_id"])
        a["person_name"] = (person or {}).get("name")
        a["company_name"] = (companies.get(a["company_id"]) or {}).get("name")
        a["effective_rate_type"], a["effective_rate_value"] = resolve_rate(a, person, settings)
    return items


@commission_admin_router.get("/assignments")
async def list_assignments(
    request: Request, person_id: Optional[str] = None, company_id: Optional[str] = None,
    active: Optional[bool] = None,
) -> Dict[str, Any]:
    db = get_db(request)
    filt: Dict[str, Any] = {}
    if person_id:
        filt["person_id"] = person_id
    if company_id:
        filt["company_id"] = company_id
    if active is not None:
        filt["active"] = active
    items = await db.commission_assignments.find(filt, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"items": await _decorate(db, items), "total": len(items)}


@commission_admin_router.post("/assignments", status_code=201)
async def create_assignment(req: AssignmentCreateRequest, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    _validate_assignment_fields(req.rate_type, req.rate_value, req.recurring_policy)
    if not await db.people.find_one({"id": req.person_id}, {"_id": 1}):
        raise HTTPException(404, "Person not found")
    if not await db.companies.find_one({"id": req.company_id}, {"_id": 1}):
        raise HTTPException(404, "Company not found")
    if await db.commission_assignments.find_one(
        {"person_id": req.person_id, "company_id": req.company_id, "active": True}, {"_id": 1}
    ):
        raise HTTPException(409, "That person already has an active assignment on this company")
    doc = {
        "id": str(uuid.uuid4()),
        **req.model_dump(exclude={"starts_at", "ends_at"}),
        # Default the window start to now so a new assignment never back-pays old invoices.
        "starts_at": req.starts_at or _now(),
        "ends_at": req.ends_at,
        "active": True,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.commission_assignments.insert_one(prepare_for_mongo(dict(doc)))
    await sync_commissions(db)
    stored = await db.commission_assignments.find_one({"id": doc["id"]}, {"_id": 0})
    return (await _decorate(db, [stored]))[0]


@commission_admin_router.patch("/assignments/{assignment_id}")
async def update_assignment(assignment_id: str, req: AssignmentUpdateRequest, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    patch = {k: v for k, v in req.model_dump().items() if v is not None}
    _validate_assignment_fields(patch.get("rate_type"), patch.get("rate_value"), patch.get("recurring_policy"))
    patch["updated_at"] = _now()
    res = await db.commission_assignments.update_one({"id": assignment_id}, {"$set": prepare_for_mongo(patch)})
    if not res.matched_count:
        raise HTTPException(404, "Assignment not found")
    await sync_commissions(db)
    stored = await db.commission_assignments.find_one({"id": assignment_id}, {"_id": 0})
    return (await _decorate(db, [stored]))[0]


@commission_admin_router.delete("/assignments/{assignment_id}")
async def deactivate_assignment(assignment_id: str, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    res = await db.commission_assignments.update_one(
        {"id": assignment_id}, {"$set": {"active": False, "updated_at": _now().isoformat()}}
    )
    if not res.matched_count:
        raise HTTPException(404, "Assignment not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Ledger
# ---------------------------------------------------------------------------
class ApproveRequest(BaseModel):
    entry_ids: Optional[List[str]] = None
    person_id: Optional[str] = None


class MarkPaidRequest(BaseModel):
    entry_ids: List[str] = Field(..., min_length=1)
    reference: str = Field(..., min_length=1, max_length=200)
    paid_at: Optional[datetime] = None


def _ledger_filter(person_id, company_id, status, date_from, date_to) -> Dict[str, Any]:
    filt: Dict[str, Any] = {}
    if person_id:
        filt["person_id"] = person_id
    if company_id:
        filt["company_id"] = company_id
    if status:
        filt["status"] = status
    # invoice_paid_at is stored as an ISO string, which sorts chronologically.
    window: Dict[str, Any] = {}
    if date_from:
        window["$gte"] = date_from
    if date_to:
        window["$lte"] = date_to + "T23:59:59.999999+00:00" if len(date_to) == 10 else date_to
    if window:
        filt["invoice_paid_at"] = window
    return filt


def _is_eligible(entry: Dict[str, Any], now: datetime) -> bool:
    eligible_at = parse_dt(entry.get("eligible_at"))
    return entry.get("status") == "accrued" and (eligible_at is None or eligible_at <= now)


@commission_admin_router.get("/ledger")
async def list_ledger(
    request: Request,
    person_id: Optional[str] = None,
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    db = get_db(request)
    await sync_commissions(db)
    items = await db.commission_ledger.find(
        _ledger_filter(person_id, company_id, status, date_from, date_to), {"_id": 0}
    ).sort("created_at", -1).to_list(5000)
    people = {p["id"]: p["name"] async for p in db.people.find({}, {"_id": 0, "id": 1, "name": 1})}
    companies = {c["id"]: c["name"] async for c in db.companies.find({}, {"_id": 0, "id": 1, "name": 1})}
    now = _now()
    for e in items:
        e["person_name"] = people.get(e["person_id"])
        e["company_name"] = companies.get(e["company_id"])
        e["eligible"] = _is_eligible(e, now)
    return {"items": items, "total": len(items)}


@commission_admin_router.post("/ledger/approve")
async def approve_entries(req: ApproveRequest, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    await sync_commissions(db)
    filt: Dict[str, Any] = {"status": "accrued"}
    if req.entry_ids:
        filt["id"] = {"$in": req.entry_ids}
    if req.person_id:
        filt["person_id"] = req.person_id
    if not req.entry_ids and not req.person_id:
        raise HTTPException(422, "Provide entry_ids or person_id")
    now = _now()
    ids = [
        e["id"] async for e in db.commission_ledger.find(filt, {"_id": 0})
        if _is_eligible(e, now)
    ]
    if ids:
        await db.commission_ledger.update_many(
            {"id": {"$in": ids}}, {"$set": {"status": "approved", "approved_at": now.isoformat()}}
        )
    return {"approved": len(ids)}


@commission_admin_router.post("/ledger/mark-paid")
async def mark_paid(req: MarkPaidRequest, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    paid_at = (req.paid_at or _now()).isoformat()
    entries = await db.commission_ledger.find({"id": {"$in": req.entry_ids}}, {"_id": 0}).to_list(5000)
    not_approved = [e["id"] for e in entries if e.get("status") != "approved"]
    if not_approved or len(entries) != len(set(req.entry_ids)):
        raise HTTPException(409, "Only approved entries can be marked paid")
    # Refuse a payout batch that nets negative: the clawback should roll to the next period.
    total = sum(float(e.get("amount") or 0) for e in entries)
    if total < 0:
        raise HTTPException(409, f"Batch nets to {total:.2f}; add more entries or leave the clawback for next period")
    await db.commission_ledger.update_many(
        {"id": {"$in": req.entry_ids}},
        {"$set": {"status": "paid", "paid_at": paid_at, "payout_ref": req.reference}},
    )
    return {"paid": len(entries), "total": round(total, 2)}


# ---------------------------------------------------------------------------
# Summary + calculator
# ---------------------------------------------------------------------------
@commission_admin_router.get("/summary")
async def summary(
    request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None
) -> Dict[str, Any]:
    db = get_db(request)
    await sync_commissions(db)
    entries = await db.commission_ledger.find(
        _ledger_filter(None, None, None, date_from, date_to), {"_id": 0}
    ).to_list(20000)
    people = {p["id"]: p async for p in db.people.find({}, {"_id": 0})}
    companies = {c["id"]: c["name"] async for c in db.companies.find({}, {"_id": 0, "id": 1, "name": 1})}
    now = _now()

    def bucket(e: Dict[str, Any]) -> str:
        if e["status"] == "void":
            return "void"
        if e["status"] == "accrued":
            return "eligible" if _is_eligible(e, now) else "pending"
        return e["status"]  # approved | paid

    def blank() -> Dict[str, float]:
        return {"pending": 0.0, "eligible": 0.0, "approved": 0.0, "paid": 0.0, "total": 0.0}

    totals = blank()
    by_person: Dict[str, Dict[str, Any]] = {}
    by_company: Dict[str, Dict[str, Any]] = {}
    seen_invoices: Dict[str, float] = {}
    for e in entries:
        b = bucket(e)
        if b == "void":
            continue
        amt = float(e.get("amount") or 0)
        totals[b] += amt
        totals["total"] += amt
        p = by_person.setdefault(e["person_id"], {
            "person_id": e["person_id"], "person_name": (people.get(e["person_id"]) or {}).get("name"),
            "person_type": (people.get(e["person_id"]) or {}).get("type"), **blank(), "companies": {},
        })
        c = by_company.setdefault(e["company_id"], {
            "company_id": e["company_id"], "company_name": companies.get(e["company_id"]), **blank(),
        })
        for row in (p, c):
            row[b] += amt
            row["total"] += amt
        p["companies"][e["company_id"]] = p["companies"].get(e["company_id"], 0.0) + amt
        if e["kind"] == "accrual":
            seen_invoices[e["invoice_id"]] = float(e.get("net_cash") or 0)

    revenue = round(sum(seen_invoices.values()), 2)
    for p in by_person.values():
        p["companies"] = [
            {"company_id": cid, "company_name": companies.get(cid), "total": round(v, 2)}
            for cid, v in p["companies"].items()
        ]
    rnd = lambda d: {k: round(v, 2) if isinstance(v, float) else v for k, v in d.items()}
    return {
        "totals": rnd(totals),
        "revenue_net_cash": revenue,
        "commission_pct_of_revenue": round(totals["total"] / revenue * 100, 1) if revenue else 0.0,
        "by_person": sorted((rnd(p) for p in by_person.values()), key=lambda r: -r["total"]),
        "by_company": sorted((rnd(c) for c in by_company.values()), key=lambda r: -r["total"]),
    }


@commission_admin_router.get("/calculator")
async def calculator(
    request: Request,
    amount: float,
    person_id: Optional[str] = None,
    company_id: Optional[str] = None,
    recurring: bool = False,
) -> Dict[str, Any]:
    """What-if: commission on `amount` of net cash for a payee (and company, if given)."""
    db = get_db(request)
    settings = await get_settings(db)
    person = await db.people.find_one({"id": person_id}, {"_id": 0}) if person_id else None
    if person_id and not person:
        raise HTTPException(404, "Person not found")
    assignment: Dict[str, Any] = {}
    if person_id and company_id:
        assignment = await db.commission_assignments.find_one(
            {"person_id": person_id, "company_id": company_id, "active": True}, {"_id": 0}
        ) or {}
    rate_type, rate_value = resolve_rate(assignment, person, settings)
    policy = assignment.get("recurring_policy") or settings["recurring_policy"]
    applies = not recurring or policy != "one_time"
    commission = calc_commission(rate_type, rate_value, amount) if applies else 0.0
    return {
        "amount": amount,
        "rate_type": rate_type,
        "rate_value": rate_value,
        "recurring": recurring,
        "recurring_policy": policy,
        "commission": commission,
        "bloom_keeps": round(amount - commission, 2),
        "has_assignment": bool(assignment),
    }


@commission_admin_router.post("/sync")
async def force_sync(request: Request) -> Dict[str, int]:
    return await sync_commissions(get_db(request))
