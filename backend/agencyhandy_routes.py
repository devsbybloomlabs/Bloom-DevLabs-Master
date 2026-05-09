"""Agency Handy proxy + summary endpoints (Phase 5.1).

All routes are mounted under `/api/agencyhandy` and require auth.
They wrap the AgencyHandyClient and add Bloom-Labs-specific normalisation:
- MRR calculation across active subscriptions.
- Proposals-needing-follow-up filter.
- Light cache (ah_cache_*) for resilience when the upstream is briefly unavailable.
- Stable JSON shapes consumed by the frontend.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc

log = logging.getLogger("agencyhandy.routes")

agencyhandy_router = APIRouter(
    prefix="/agencyhandy",
    tags=["agencyhandy"],
    dependencies=[Depends(get_current_user)],
)


def get_db(request: Request):
    return request.app.state.db


def get_ah(request: Request):
    return request.app.state.agencyhandy


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------
async def _cache_set(db, key: str, value: Any) -> None:
    """Upsert {key,value,updated_at} into ah_cache collection."""
    try:
        await db.ah_cache.update_one(
            {"key": key},
            {"$set": {"key": key, "value": value, "updated_at": _now().isoformat()}},
            upsert=True,
        )
    except Exception as exc:  # pragma: no cover
        log.warning("ah_cache write failed for %s: %s", key, exc)


async def _cache_get(db, key: str) -> Optional[Dict[str, Any]]:
    try:
        doc = await db.ah_cache.find_one({"key": key}, {"_id": 0})
        return doc
    except Exception:  # pragma: no cover
        return None


async def _envelope(
    db,
    cache_key: str,
    api_result: Dict[str, Any],
    *,
    pluck: Optional[str] = None,
) -> Dict[str, Any]:
    """Standard response envelope: {data, source, error?, fetched_at, currency}.

    If the upstream call succeeded, cache it. If it failed, fall back to last cache.
    """
    if api_result.get("success"):
        payload = api_result.get("data") or {}
        value = payload.get(pluck) if pluck and isinstance(payload, dict) else payload
        await _cache_set(db, cache_key, {"value": value, "raw": payload})
        return {
            "data": value,
            "meta": {k: v for k, v in (payload or {}).items() if k != pluck} if isinstance(payload, dict) else {},
            "source": "live",
            "fetched_at": _now().isoformat(),
            "error": None,
        }
    cached = await _cache_get(db, cache_key)
    if cached:
        wrap = cached.get("value") or {}
        return {
            "data": wrap.get("value"),
            "meta": {k: v for k, v in (wrap.get("raw") or {}).items() if k != pluck} if isinstance(wrap.get("raw"), dict) else {},
            "source": "cache",
            "fetched_at": cached.get("updated_at"),
            "error": api_result.get("error"),
        }
    return {
        "data": [] if pluck else None,
        "meta": {},
        "source": "none",
        "fetched_at": _now().isoformat(),
        "error": api_result.get("error") or "Upstream Agency Handy unavailable",
    }


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------
@agencyhandy_router.get("/health")
async def ah_health(ah=Depends(get_ah)) -> Dict[str, Any]:
    """Quick ping that confirms the API key works."""
    res = await ah.get_account()
    if not res.get("success"):
        return {
            "connected": False,
            "configured": ah.is_configured,
            "error": res.get("error"),
        }
    user = (res.get("data") or {}).get("user") or {}
    company = user.get("company") or {}
    return {
        "connected": True,
        "configured": True,
        "user": {
            "id": user.get("_id"),
            "email": user.get("email"),
            "firstName": user.get("firstName"),
            "lastName": user.get("lastName"),
        },
        "company": {
            "id": company.get("_id"),
            "name": company.get("name"),
            "uniqueName": company.get("uniqueName"),
            "currency": company.get("currency"),
            "logo": company.get("logo"),
            "totalProjects": company.get("totalProjects"),
            "totalQuotations": company.get("totalQuotations"),
        },
    }


# ---------------------------------------------------------------------------
# Lists (read-only proxies)
# ---------------------------------------------------------------------------
@agencyhandy_router.get("/services")
async def list_services(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    res = await ah.list_services(service_type="service")
    env = await _envelope(db, "services", res, pluck="data")
    services = env.get("data") or []
    out = []
    for s in services:
        out.append(
            {
                "id": s.get("_id"),
                "name": s.get("name"),
                "slug": s.get("slug"),
                "type": s.get("type"),  # subscription | oneTime
                "isPublished": s.get("isPublished"),
                "position": s.get("position"),
                "intakeForm": (s.get("intakeForm") or {}).get("name"),
                "createdAt": s.get("createdAt"),
            }
        )
    return {**env, "data": out}


@agencyhandy_router.get("/orders")
async def list_orders(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    res = await ah.list_orders()
    env = await _envelope(db, "orders", res, pluck="projects")
    return env


@agencyhandy_router.get("/invoices")
async def list_invoices(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    res = await ah.list_invoices()
    return await _envelope(db, "invoices", res, pluck="data")


@agencyhandy_router.get("/proposals")
async def list_proposals(
    ah=Depends(get_ah),
    db=Depends(get_db),
    needs_followup: bool = Query(False, description="Only return proposals that need follow-up"),
    days_threshold: int = Query(3, ge=1, le=60),
) -> Dict[str, Any]:
    res = await ah.list_quotations()
    env = await _envelope(db, "proposals", res, pluck="data")
    proposals = env.get("data") or []
    normalized = [_normalize_proposal(p) for p in proposals]
    if needs_followup:
        cutoff = _now()
        kept: List[Dict[str, Any]] = []
        for p in normalized:
            sent_at = p.get("sentAtDt")
            if not sent_at:
                continue
            age_days = (cutoff - sent_at).days
            if age_days >= days_threshold and p.get("status") in ("sent", "viewed", "opened"):
                p["age_days"] = age_days
                kept.append(p)
        normalized = kept
    # Strip helper datetimes before returning
    for p in normalized:
        p.pop("sentAtDt", None)
    return {
        **env,
        "data": normalized,
        "counts": {
            "total": len(env.get("data") or []),
            "returned": len(normalized),
        },
    }


@agencyhandy_router.get("/subscriptions")
async def list_subscriptions(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    res = await ah.list_subscriptions()
    env = await _envelope(db, "subscriptions", res, pluck="data")
    subs = env.get("data") or []
    enriched = [_normalize_subscription(s) for s in subs]
    return {**env, "data": enriched}


@agencyhandy_router.get("/clients")
async def list_clients(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    """List clients as best-effort. Falls back to deriving clients from quotations + subscriptions
    when the members endpoint is restricted (404 in some plans)."""
    res = await ah.list_clients()
    if res.get("success"):
        env = await _envelope(db, "clients", res, pluck="data")
        return env

    # Fallback: derive unique clients from quotations + subscriptions
    by_email: Dict[str, Dict[str, Any]] = {}
    for source_call in (ah.list_quotations(), ah.list_subscriptions()):
        sub_res = await source_call
        if not sub_res.get("success"):
            continue
        rows = (sub_res.get("data") or {}).get("data") or []
        for row in rows:
            client = row.get("client") or {}
            email = client.get("email") or client.get("_id")
            if not email:
                continue
            entry = by_email.setdefault(
                email,
                {
                    "id": client.get("_id"),
                    "firstName": client.get("firstName"),
                    "lastName": client.get("lastName"),
                    "email": client.get("email"),
                    "profileImage": client.get("profileImage"),
                    "sources": [],
                },
            )
            entry["sources"].append("quotation" if "isAccepted" in row else "subscription")

    derived = list(by_email.values())
    await _cache_set(db, "clients", {"value": derived, "raw": {"derived": True}})
    return {
        "data": derived,
        "meta": {"derived": True},
        "source": "derived",
        "fetched_at": _now().isoformat(),
        "error": res.get("error"),
    }


# ---------------------------------------------------------------------------
# Summary / KPIs (MRR-first per founder priority)
# ---------------------------------------------------------------------------
@agencyhandy_router.get("/summary")
async def summary(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    """Aggregate KPIs prioritised by stakeholder: MRR + proposals follow-up + invoices.

    Strategy:
    - Pull subscriptions, quotations (proposals), invoices, orders concurrently (sequential here
      to keep error handling simple — small payloads).
    - Fall back to cache for any failed call so the dashboard keeps working.
    - Persist last MRR snapshot in `ah_mrr_snapshots` so we can compute MoM delta later.
    """
    subs_res = await ah.list_subscriptions()
    props_res = await ah.list_quotations()
    inv_res = await ah.list_invoices()
    ord_res = await ah.list_orders()

    subs_env = await _envelope(db, "subscriptions", subs_res, pluck="data")
    props_env = await _envelope(db, "proposals", props_res, pluck="data")
    inv_env = await _envelope(db, "invoices", inv_res, pluck="data")
    ord_env = await _envelope(db, "orders", ord_res, pluck="projects")

    subs = [_normalize_subscription(s) for s in (subs_env.get("data") or [])]
    props = [_normalize_proposal(p) for p in (props_env.get("data") or [])]
    invoices = inv_env.get("data") or []
    orders = ord_env.get("data") or []

    # MRR: sum monthly_value across active subscriptions
    mrr_total = round(sum(float(s.get("monthly_value") or 0) for s in subs if s.get("is_active")), 2)
    arr_total = round(mrr_total * 12, 2)

    # Proposals needing follow-up
    threshold = 3
    cutoff = _now()
    follow_ups: List[Dict[str, Any]] = []
    for p in props:
        sent_at = p.get("sentAtDt")
        if not sent_at:
            continue
        age = (cutoff - sent_at).days
        if age >= threshold and p.get("status") in ("sent", "viewed", "opened"):
            entry = {**p, "age_days": age}
            entry.pop("sentAtDt", None)
            follow_ups.append(entry)

    proposals_total = len(props)
    proposals_pending = sum(
        1 for p in props if p.get("status") in ("sent", "viewed", "opened")
    )
    proposals_accepted = sum(1 for p in props if p.get("status") == "accepted")
    proposals_rejected = sum(1 for p in props if p.get("status") == "rejected")
    acceptance_rate = (
        round(proposals_accepted / proposals_total * 100, 1) if proposals_total else 0.0
    )

    open_invoice_total = 0.0
    overdue_invoice_total = 0.0
    open_invoices_count = 0
    overdue_invoices_count = 0
    for inv in invoices:
        status = (inv.get("status") or "").lower()
        amt = float(inv.get("amount") or inv.get("total") or 0)
        if status in ("draft", "sent", "unpaid", "open", "viewed"):
            open_invoice_total += amt
            open_invoices_count += 1
        if status == "overdue":
            overdue_invoice_total += amt
            overdue_invoices_count += 1

    # Renewal lookahead: subs renewing within 7 days
    renewals_7d: List[Dict[str, Any]] = []
    for s in subs:
        nxt = s.get("next_payment_dt")
        if not nxt or not s.get("is_active"):
            continue
        days = (nxt - cutoff).days
        if 0 <= days <= 7:
            entry = {**s, "days_until_renewal": days}
            entry.pop("next_payment_dt", None)
            entry.pop("last_payment_dt", None)
            renewals_7d.append(entry)

    # Snapshot today's MRR (idempotent per day)
    today = cutoff.date().isoformat()
    try:
        await db.ah_mrr_snapshots.update_one(
            {"date": today},
            {
                "$set": {
                    "date": today,
                    "mrr": mrr_total,
                    "arr": arr_total,
                    "active_subscriptions": sum(1 for s in subs if s.get("is_active")),
                    "updated_at": cutoff.isoformat(),
                }
            },
            upsert=True,
        )
    except Exception as exc:  # pragma: no cover
        log.warning("ah_mrr_snapshots write failed: %s", exc)

    # MoM delta: pick snapshot ~30 days ago (any within window)
    mom_delta_pct = None
    mom_delta_abs = None
    try:
        prior = await db.ah_mrr_snapshots.find(
            {"date": {"$lt": today}}
        ).sort("date", -1).to_list(60)
        target_date = (cutoff - _td(days=28)).date().isoformat()
        prior_snapshot: Optional[Dict[str, Any]] = None
        for snap in prior:
            if snap.get("date") <= target_date:
                prior_snapshot = snap
                break
        if prior_snapshot is None and prior:
            prior_snapshot = prior[-1]
        if prior_snapshot:
            prior_mrr = float(prior_snapshot.get("mrr") or 0)
            mom_delta_abs = round(mrr_total - prior_mrr, 2)
            mom_delta_pct = (
                round((mrr_total - prior_mrr) / prior_mrr * 100, 1) if prior_mrr else None
            )
    except Exception:
        pass

    # Stale flag if any source fell back to cache
    stale_sources = [
        name
        for name, env in (
            ("subscriptions", subs_env),
            ("proposals", props_env),
            ("invoices", inv_env),
            ("orders", ord_env),
        )
        if env.get("source") != "live"
    ]

    # Strip helper fields
    safe_subs = []
    for s in subs:
        e = {**s}
        e.pop("next_payment_dt", None)
        e.pop("last_payment_dt", None)
        safe_subs.append(e)

    return {
        "currency": ah.default_currency,
        "mrr": {
            "total": mrr_total,
            "arr": arr_total,
            "mom_delta_abs": mom_delta_abs,
            "mom_delta_pct": mom_delta_pct,
            "active_subscriptions": sum(1 for s in subs if s.get("is_active")),
        },
        "proposals": {
            "total": proposals_total,
            "pending": proposals_pending,
            "accepted": proposals_accepted,
            "rejected": proposals_rejected,
            "acceptance_rate": acceptance_rate,
            "follow_ups": follow_ups[:20],
        },
        "invoices": {
            "open_total": round(open_invoice_total, 2),
            "open_count": open_invoices_count,
            "overdue_total": round(overdue_invoice_total, 2),
            "overdue_count": overdue_invoices_count,
        },
        "renewals_7d": renewals_7d,
        "orders": {
            "total": ord_env.get("meta", {}).get("totalProjects")
            or len(orders),
            "recent": orders[:10],
        },
        "subscriptions_sample": safe_subs[:20],
        "freshness": {
            "fetched_at": cutoff.isoformat(),
            "stale_sources": stale_sources,
        },
    }


@agencyhandy_router.get("/revenue-actions")
async def revenue_actions(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    """Return today's prioritized revenue-driving actions for the founder.

    Used by the AI routine generator (Phase 5.4) and the Revenue page banner.
    """
    summary_payload = await summary(ah=ah, db=db)  # type: ignore[arg-type]

    actions: List[Dict[str, Any]] = []
    for fu in summary_payload.get("proposals", {}).get("follow_ups", []):
        actions.append(
            {
                "kind": "proposal_follow_up",
                "priority": 1 if fu.get("age_days", 0) >= 5 else 2,
                "title": f"Follow up: {fu.get('client_name')} — {fu.get('service_name')}",
                "detail": (
                    f"Proposal sent {fu.get('age_days')} days ago, status: {fu.get('status')}."
                ),
                "value": fu.get("budget"),
                "currency": fu.get("currency"),
                "link": "/admin/revenue",
            }
        )
    for r in summary_payload.get("renewals_7d", []):
        actions.append(
            {
                "kind": "renewal_check_in",
                "priority": 2,
                "title": f"Renewal in {r.get('days_until_renewal')}d: {r.get('client_name')}",
                "detail": (
                    f"Subscription {r.get('id')} ({r.get('repeat_duration')}) renews soon — "
                    "reach out for upsell or check-in."
                ),
                "value": r.get("monthly_value"),
                "currency": r.get("currency"),
                "link": "/admin/revenue",
            }
        )
    inv = summary_payload.get("invoices", {})
    if inv.get("overdue_count"):
        actions.append(
            {
                "kind": "collect_overdue",
                "priority": 1,
                "title": f"Collect overdue invoices ({inv.get('overdue_count')})",
                "detail": f"Total overdue: {inv.get('overdue_total')} {summary_payload.get('currency')}.",
                "value": inv.get("overdue_total"),
                "currency": summary_payload.get("currency"),
                "link": "/admin/revenue",
            }
        )
    actions.sort(key=lambda x: (x.get("priority", 99), -(x.get("value") or 0)))
    return {
        "actions": actions[:10],
        "generated_at": _now().isoformat(),
        "currency": summary_payload.get("currency"),
        "freshness": summary_payload.get("freshness"),
    }


@agencyhandy_router.post("/refresh")
async def refresh_caches(ah=Depends(get_ah), db=Depends(get_db)) -> Dict[str, Any]:
    """Force-refresh the cache layer by re-fetching upstream data."""
    out: Dict[str, Any] = {}
    for name, fn, pluck in (
        ("services", ah.list_services, "data"),
        ("orders", ah.list_orders, "projects"),
        ("invoices", ah.list_invoices, "data"),
        ("subscriptions", ah.list_subscriptions, "data"),
        ("proposals", ah.list_quotations, "data"),
    ):
        try:
            r = await fn() if name != "services" else await ah.list_services("service")
            env = await _envelope(db, name, r, pluck=pluck)
            out[name] = {"source": env.get("source"), "error": env.get("error")}
        except Exception as exc:  # pragma: no cover
            out[name] = {"source": "error", "error": str(exc)}
    return {"refreshed_at": _now().isoformat(), "results": out}


# ---------------------------------------------------------------------------
# Helpers — normalisation
# ---------------------------------------------------------------------------
from datetime import timedelta as _td  # noqa: E402  (kept here to avoid top of file)


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            v = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(v)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _client_name(c: Optional[Dict[str, Any]]) -> Optional[str]:
    if not c:
        return None
    name = " ".join(filter(None, [c.get("firstName"), c.get("lastName")])).strip()
    return name or c.get("email")


def _normalize_proposal(p: Dict[str, Any]) -> Dict[str, Any]:
    sent_at = _parse_dt(p.get("sentAt") or p.get("createdAt"))
    client = p.get("client") or {}
    service = p.get("service") or {}
    status = p.get("status") or (
        "accepted" if p.get("isAccepted") else "rejected" if p.get("isRejected") else "sent"
    )
    return {
        "id": p.get("_id"),
        "display_id": p.get("id"),
        "client_id": client.get("_id"),
        "client_name": _client_name(client),
        "client_email": client.get("email"),
        "service_id": service.get("_id"),
        "service_name": service.get("name"),
        "package_name": p.get("packageName"),
        "status": status.lower() if isinstance(status, str) else str(status),
        "is_accepted": bool(p.get("isAccepted")),
        "is_rejected": bool(p.get("isRejected")),
        "payment_type": p.get("paymentType"),
        "budget": p.get("budget") or p.get("priceWithoutSetupFee"),
        "currency": p.get("currency"),
        "duration": p.get("duration"),
        "order_brief": p.get("orderBrief"),
        "sentAt": p.get("sentAt") or p.get("createdAt"),
        "sentAtDt": sent_at,
        "created_at": p.get("createdAt"),
        "updated_at": p.get("updatedAt"),
    }


def _normalize_subscription(s: Dict[str, Any]) -> Dict[str, Any]:
    """Compute monthly_value for MRR.

    Strategy: We don't always have a price on the subscription itself. The most reliable
    derivative is the most recent linked invoice amount — but invoices may be empty in some
    plan tiers. Fallback: 0.0 (UI shows "—" so admins can set price manually later).
    """
    invoices = s.get("invoice") or []
    last_amount = None
    if invoices:
        # Most recent invoice amount
        sorted_inv = sorted(
            invoices,
            key=lambda i: i.get("createdAt") or "",
            reverse=True,
        )
        last_amount = (
            sorted_inv[0].get("amount")
            or sorted_inv[0].get("total")
            or sorted_inv[0].get("finalAmount")
        )
    duration = (s.get("repeatDuration") or "month").lower()
    multiplier = {
        "day": 30.0,
        "week": 4.345,
        "month": 1.0,
        "quarter": 1 / 3,
        "year": 1 / 12,
    }.get(duration, 1.0)
    base = float(last_amount or 0)
    monthly = round(base * multiplier, 2) if base else 0.0
    client = s.get("client") or {}
    next_payment = _parse_dt(s.get("nextPayment"))
    last_payment = _parse_dt(s.get("lastPayment"))
    return {
        "id": s.get("id"),
        "object_id": s.get("_id"),
        "client_id": client.get("_id"),
        "client_name": _client_name(client),
        "client_email": client.get("email"),
        "is_active": bool(s.get("isActive")),
        "is_live": bool(s.get("isLive")),
        "has_failed_payment": bool(s.get("hasFailedPayment")),
        "repeat_duration": s.get("repeatDuration"),
        "repeat_count": s.get("repeatCount"),
        "billing_cycle_count": s.get("billingCycleCount"),
        "times_repeated": s.get("timesRepeated"),
        "last_payment": s.get("lastPayment"),
        "next_payment": s.get("nextPayment"),
        "last_payment_dt": last_payment,
        "next_payment_dt": next_payment,
        "monthly_value": monthly,
        "last_invoice_amount": float(last_amount) if last_amount else None,
        "currency": s.get("currency"),
        "create_source": s.get("createSource"),
        "created_at": s.get("createdAt"),
    }


# Re-export for easier imports elsewhere
__all__ = ["agencyhandy_router"]

# Tiny safety: ensure serialize_doc/prepare_for_mongo are imported (used by future webhook glue).
_ = (serialize_doc, prepare_for_mongo, HTTPException)
