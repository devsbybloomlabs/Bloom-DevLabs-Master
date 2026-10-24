"""Commission engine — rates, eligibility and an idempotent ledger sync.

Commission basis is net cash collected: ``invoice.amount_paid - invoice.refund_amount``.
Each (invoice, assignment) pair owns one ``accrual`` ledger entry. Later refunds
either rewrite that entry (while it is still ``accrued``) or add a negative
``adjustment`` entry (once it is approved/paid), so ``sync_commissions`` can be
called any number of times and always converges on the same ledger.

Public API:
    await get_settings(db) -> dict
    resolve_rate(assignment, person, settings) -> (rate_type, rate_value)
    calc_commission(rate_type, rate_value, net_cash) -> float
    invoice_in_scope(assignment, invoice, settings) -> bool
    await sync_commissions(db) -> {"created": int, "updated": int, "adjusted": int}
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from db_utils import prepare_for_mongo

log = logging.getLogger("commissions")

# Bloom Connect: 25% commission for anyone.
DEFAULT_SETTINGS: Dict[str, Any] = {
    "default_rate_pct": 25.0,
    "hold_days": 14,
    "recurring_policy": "first_n_months",  # one_time | first_n_months | ongoing
    "recurring_months": 12,
}

RECURRING_POLICIES = ("one_time", "first_n_months", "ongoing")
RATE_TYPES = ("percent", "flat")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def get_settings(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    doc = await db.commission_settings.find_one({"id": "global"}, {"_id": 0}) or {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k in DEFAULT_SETTINGS and v is not None}}


def resolve_rate(
    assignment: Dict[str, Any], person: Optional[Dict[str, Any]], settings: Dict[str, Any]
) -> Tuple[str, float]:
    """Assignment rate wins, then the person's default, then the global default."""
    if assignment.get("rate_value") is not None:
        return assignment.get("rate_type") or "percent", float(assignment["rate_value"])
    if person and person.get("default_rate_pct") is not None:
        return "percent", float(person["default_rate_pct"])
    return "percent", float(settings["default_rate_pct"])


def calc_commission(rate_type: str, rate_value: float, net_cash: float) -> float:
    if net_cash <= 0:
        return 0.0
    if rate_type == "flat":
        return round(rate_value, 2)
    return round(net_cash * rate_value / 100.0, 2)


def is_recurring_invoice(invoice: Dict[str, Any]) -> bool:
    return invoice.get("source") == "subscription_cycle" or bool(invoice.get("subscription_id"))


def net_cash(invoice: Dict[str, Any]) -> float:
    return round(float(invoice.get("amount_paid") or 0) - float(invoice.get("refund_amount") or 0), 2)


def _add_months(dt: datetime, months: int) -> datetime:
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, [31, 29 if year % 4 == 0 and (year % 100 or year % 400 == 0) else 28,
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return dt.replace(year=year, month=month, day=day)


def invoice_in_scope(assignment: Dict[str, Any], invoice: Dict[str, Any], settings: Dict[str, Any]) -> bool:
    """Is this paid invoice commissionable under the assignment's window and recurring policy?"""
    paid_at = parse_dt(invoice.get("paid_at")) or parse_dt(invoice.get("issued_at"))
    if paid_at is None:
        return False
    starts = parse_dt(assignment.get("starts_at"))
    ends = parse_dt(assignment.get("ends_at"))
    if starts and paid_at < starts:
        return False
    if ends and paid_at > ends:
        return False
    if not is_recurring_invoice(invoice):
        return True
    policy = assignment.get("recurring_policy") or settings["recurring_policy"]
    if policy == "ongoing":
        return True
    if policy == "one_time":
        return False
    months = assignment.get("recurring_months")
    if months is None:
        months = settings["recurring_months"]
    anchor = starts or parse_dt(assignment.get("created_at")) or paid_at
    return paid_at <= _add_months(anchor, int(months))


async def _company_email_map(db: AsyncIOMotorDatabase, company_ids: List[str]) -> Dict[str, str]:
    """email -> company_id for the given companies, across both company shapes."""
    out: Dict[str, str] = {}
    async for c in db.companies.find({"id": {"$in": company_ids}}, {"_id": 0}):
        for key in ("primary_email", "billing_email", "owner_client_email"):
            if c.get(key):
                out[str(c[key]).lower()] = c["id"]
    async for m in db.company_members.find({"company_id": {"$in": company_ids}}, {"_id": 0}):
        if m.get("client_email"):
            out.setdefault(str(m["client_email"]).lower(), m["company_id"])
    return out


async def resolve_invoice_company(db: AsyncIOMotorDatabase, invoice: Dict[str, Any]) -> Optional[str]:
    """Company an invoice belongs to (explicit company_id, else by client email)."""
    if invoice.get("company_id"):
        return invoice["company_id"]
    email = str(invoice.get("client_email") or "").lower()
    if not email:
        return None
    c = await db.companies.find_one(
        {"$or": [{"primary_email": email}, {"billing_email": email}, {"owner_client_email": email}]},
        {"_id": 0, "id": 1},
    )
    if c:
        return c["id"]
    m = await db.company_members.find_one({"client_email": email}, {"_id": 0, "company_id": 1})
    return m["company_id"] if m else None


async def sync_commissions(db: AsyncIOMotorDatabase) -> Dict[str, int]:
    """Bring the ledger in line with paid/refunded invoices. Idempotent."""
    stats = {"created": 0, "updated": 0, "adjusted": 0}
    assignments = await db.commission_assignments.find({"active": True}, {"_id": 0}).to_list(5000)
    if not assignments:
        return stats

    settings = await get_settings(db)
    people = {p["id"]: p async for p in db.people.find({}, {"_id": 0})}
    by_company: Dict[str, List[Dict[str, Any]]] = {}
    for a in assignments:
        person = people.get(a["person_id"])
        if person and person.get("status", "active") == "active":
            by_company.setdefault(a["company_id"], []).append(a)
    if not by_company:
        return stats

    email_map = await _company_email_map(db, list(by_company))
    invoice_filter: Dict[str, Any] = {
        "amount_paid": {"$gt": 0},
        "$or": [
            {"company_id": {"$in": list(by_company)}},
            {"client_email": {"$in": list(email_map)}},
        ],
    }
    async for inv in db.invoices.find(invoice_filter, {"_id": 0}):
        company_id = inv.get("company_id") or email_map.get(str(inv.get("client_email") or "").lower())
        for a in by_company.get(company_id, []):
            if not invoice_in_scope(a, inv, settings):
                continue
            person = people[a["person_id"]]
            rate_type, rate_value = resolve_rate(a, person, settings)
            desired = calc_commission(rate_type, rate_value, net_cash(inv))
            await _upsert_entry(db, a, inv, company_id, rate_type, rate_value, desired, settings, stats)
    return stats


async def _upsert_entry(
    db: AsyncIOMotorDatabase,
    assignment: Dict[str, Any],
    invoice: Dict[str, Any],
    company_id: str,
    rate_type: str,
    rate_value: float,
    desired: float,
    settings: Dict[str, Any],
    stats: Dict[str, int],
) -> None:
    key = {"invoice_id": invoice["id"], "assignment_id": assignment["id"]}
    entries = await db.commission_ledger.find(key, {"_id": 0}).to_list(50)
    base = next((e for e in entries if e.get("kind") == "accrual"), None)
    paid_at = parse_dt(invoice.get("paid_at")) or parse_dt(invoice.get("issued_at")) or _now()

    if base is None:
        if desired <= 0:
            return
        hold = assignment.get("hold_days")
        hold = settings["hold_days"] if hold is None else hold
        await db.commission_ledger.insert_one(prepare_for_mongo({
            "id": str(uuid.uuid4()),
            **key,
            "kind": "accrual",
            "person_id": assignment["person_id"],
            "company_id": company_id,
            "invoice_number": invoice.get("number"),
            "invoice_paid_at": paid_at,
            "invoice_source": invoice.get("source"),
            "currency": invoice.get("currency") or "USD",
            "rate_type": rate_type,
            "rate_value": rate_value,
            "net_cash": net_cash(invoice),
            "amount": desired,
            "status": "accrued",
            "eligible_at": paid_at + timedelta(days=int(hold)),
            "created_at": _now(),
        }))
        stats["created"] += 1
        return

    current = round(sum(float(e.get("amount") or 0) for e in entries if e.get("status") != "void"), 2)
    if abs(current - desired) < 0.005:
        return

    if base.get("status") == "accrued" and len(entries) == 1:
        # Not yet approved: rewrite in place (void it if the sale was fully refunded).
        await db.commission_ledger.update_one(
            {"id": base["id"]},
            {"$set": {
                "amount": desired,
                "net_cash": net_cash(invoice),
                "status": "accrued" if desired > 0 else "void",
                "updated_at": _now().isoformat(),
            }},
        )
        stats["updated"] += 1
        return

    # Already approved/paid (or earlier adjustments exist): book the difference.
    delta = round(desired - current, 2)
    await db.commission_ledger.insert_one(prepare_for_mongo({
        "id": str(uuid.uuid4()),
        **key,
        "kind": "adjustment",
        "person_id": assignment["person_id"],
        "company_id": company_id,
        "invoice_number": invoice.get("number"),
        "invoice_paid_at": paid_at,
        "currency": invoice.get("currency") or "USD",
        "net_cash": net_cash(invoice),
        "amount": delta,
        "status": "accrued",
        "eligible_at": _now(),
        "note": "Refund clawback" if delta < 0 else "Adjustment",
        "created_at": _now(),
    }))
    stats["adjusted"] += 1


async def safe_sync(db: AsyncIOMotorDatabase) -> None:
    """Fire-and-forget hook for payment/refund paths; never raises."""
    try:
        await sync_commissions(db)
    except Exception as exc:  # pragma: no cover
        log.warning("Commission sync failed: %s", exc)
