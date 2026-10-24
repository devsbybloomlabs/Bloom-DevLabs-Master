"""Commission engine tests — runs the routers in-process against a throwaway Mongo DB.

Needs a reachable MongoDB (set COMMISSION_TEST_MONGO_URL, default localhost:27017);
the tests skip when none is available. Each test gets its own fresh database.
"""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from auth import get_current_user  # noqa: E402
from commission_routes import commission_admin_router  # noqa: E402
from commission_service import invoice_in_scope, sync_commissions  # noqa: E402
from people_routes import people_admin_router  # noqa: E402

MONGO_URL = os.environ.get("COMMISSION_TEST_MONGO_URL", "mongodb://localhost:27017")
pytestmark = pytest.mark.asyncio(loop_scope="function")


def _app(db, authed=True):
    app = FastAPI()
    app.state.db = db
    app.include_router(people_admin_router)
    app.include_router(commission_admin_router)
    if authed:
        app.dependency_overrides[get_current_user] = lambda: {"email": "founder@test", "role": "founder"}
    return app


@pytest_asyncio.fixture
async def db():
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=2000)
    try:
        await client.admin.command("ping")
    except Exception:
        pytest.skip("MongoDB not reachable")
    database = client[f"commission_test_{uuid.uuid4().hex[:8]}"]
    yield database
    await client.drop_database(database.name)
    client.close()


@pytest_asyncio.fixture
async def api(db):
    transport = httpx.ASGITransport(app=_app(db))
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        yield c


def _iso(dt):
    return dt.isoformat()


async def _company(db, name="AFFI", email="ops@affi.example.com"):
    cid = str(uuid.uuid4())
    await db.companies.insert_one({"id": cid, "name": name, "primary_email": email, "billing_email": email})
    return cid


async def _invoice(db, email, amount, *, source="paypal_order", paid_at=None, refund=0.0, **extra):
    inv = {
        "id": str(uuid.uuid4()), "number": f"INV-{uuid.uuid4().hex[:6]}", "client_email": email,
        "status": "paid", "currency": "USD", "total": amount, "amount_paid": amount,
        "refund_amount": refund, "source": source,
        "paid_at": _iso(paid_at or datetime.now(timezone.utc)), "issued_at": _iso(datetime.now(timezone.utc)),
        **extra,
    }
    await db.invoices.insert_one(inv)
    return inv


async def _person(api, name="Roq Cleo", **kw):
    r = await api.post("/admin/people", json={"name": name, "email": f"{name.split()[0].lower()}@bloom.example.com", **kw})
    assert r.status_code == 201, r.text
    return r.json()


async def _assign(api, person_id, company_id, **kw):
    r = await api.post("/admin/commissions/assignments",
                       json={"person_id": person_id, "company_id": company_id, **kw})
    assert r.status_code == 201, r.text
    return r.json()


async def _ledger(api, **params):
    r = await api.get("/admin/commissions/ledger", params=params)
    assert r.status_code == 200, r.text
    return r.json()["items"]


# ---------------------------------------------------------------------------
async def test_requires_admin_auth(db):
    transport = httpx.ASGITransport(app=_app(db, authed=False))
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        for path in ("/admin/people", "/admin/commissions/summary", "/admin/commissions/ledger"):
            assert (await c.get(path)).status_code == 401


async def test_bloom_connect_default_is_25_percent(api, db):
    r = await api.get("/admin/commissions/settings")
    assert r.json()["default_rate_pct"] == 25.0
    company = await _company(db)
    person = await _person(api)
    await _assign(api, person["id"], company)
    await _invoice(db, "ops@affi.example.com", 4000)
    items = await _ledger(api)
    assert len(items) == 1 and items[0]["amount"] == 1000.0 and items[0]["status"] == "accrued"


async def test_rate_precedence_assignment_over_person_over_global(api, db):
    company = await _company(db)
    c2 = await _company(db, "Luxury Real Estate", "hello@luxury.example.com")
    person = await _person(api, default_rate_pct=10)
    await _assign(api, person["id"], company)  # person default 10%
    await _assign(api, person["id"], c2, rate_value=40)  # override 40%
    await _invoice(db, "ops@affi.example.com", 1000)
    await _invoice(db, "hello@luxury.example.com", 1000)
    by_company = {i["company_name"]: i["amount"] for i in await _ledger(api)}
    assert by_company == {"AFFI": 100.0, "Luxury Real Estate": 400.0}


async def test_sync_is_idempotent_and_ignores_pre_assignment_invoices(api, db):
    company = await _company(db)
    person = await _person(api)
    await _invoice(db, "ops@affi.example.com", 5000, paid_at=datetime.now(timezone.utc) - timedelta(days=30))
    await _assign(api, person["id"], company)  # starts_at defaults to now
    await _invoice(db, "ops@affi.example.com", 2000)
    for _ in range(3):
        await api.post("/admin/commissions/sync")
    items = await _ledger(api)
    assert [i["amount"] for i in items] == [500.0]


async def test_split_payees_on_one_company(api, db):
    company = await _company(db)
    closer = await _person(api, "Roq Cleo")
    referrer = await _person(api, "Ana Ref")
    await _assign(api, closer["id"], company, rate_value=15)
    await _assign(api, referrer["id"], company, rate_value=10)
    await _invoice(db, "ops@affi.example.com", 1000)
    r = (await api.get("/admin/commissions/summary")).json()
    assert r["totals"]["total"] == 250.0
    assert r["revenue_net_cash"] == 1000.0
    assert r["commission_pct_of_revenue"] == 25.0
    assert {p["person_name"]: p["total"] for p in r["by_person"]} == {"Roq Cleo": 150.0, "Ana Ref": 100.0}


async def test_flat_rate_pays_per_paid_invoice(api, db):
    company = await _company(db)
    person = await _person(api)
    await _assign(api, person["id"], company, rate_type="flat", rate_value=200)
    await _invoice(db, "ops@affi.example.com", 1000)
    await _invoice(db, "ops@affi.example.com", 50)
    assert sorted(i["amount"] for i in await _ledger(api)) == [200.0, 200.0]


async def test_company_resolved_through_member_email(api, db):
    company = await _company(db)
    await db.company_members.insert_one({"id": "m1", "company_id": company, "client_email": "cfo@affi.example.com"})
    person = await _person(api)
    await _assign(api, person["id"], company)
    await _invoice(db, "cfo@affi.example.com", 400)
    assert [i["amount"] for i in await _ledger(api)] == [100.0]


async def test_refund_inside_hold_window_rewrites_then_voids(api, db):
    company = await _company(db)
    person = await _person(api)
    await _assign(api, person["id"], company)
    inv = await _invoice(db, "ops@affi.example.com", 1000)
    assert (await _ledger(api))[0]["amount"] == 250.0
    await db.invoices.update_one({"id": inv["id"]}, {"$set": {"refund_amount": 400.0, "status": "partially_refunded"}})
    items = await _ledger(api)
    assert len(items) == 1 and items[0]["amount"] == 150.0
    await db.invoices.update_one({"id": inv["id"]}, {"$set": {"refund_amount": 1000.0, "status": "refunded"}})
    items = await _ledger(api)
    assert len(items) == 1 and items[0]["status"] == "void" and items[0]["amount"] == 0.0


async def test_approve_respects_hold_and_refund_after_payout_becomes_clawback(api, db):
    company = await _company(db)
    person = await _person(api)
    await _assign(api, person["id"], company)
    inv = await _invoice(db, "ops@affi.example.com", 1000)
    entry = (await _ledger(api))[0]
    assert entry["eligible"] is False

    r = await api.post("/admin/commissions/ledger/approve", json={"person_id": person["id"]})
    assert r.json()["approved"] == 0  # still inside the 14-day hold

    await db.commission_ledger.update_one({"id": entry["id"]}, {"$set": {"eligible_at": _iso(datetime.now(timezone.utc) - timedelta(days=1))}})
    assert (await api.post("/admin/commissions/ledger/approve", json={"entry_ids": [entry["id"]]})).json()["approved"] == 1
    r = await api.post("/admin/commissions/ledger/mark-paid", json={"entry_ids": [entry["id"]], "reference": "PP-123"})
    assert r.status_code == 200 and r.json()["total"] == 250.0

    await db.invoices.update_one({"id": inv["id"]}, {"$set": {"refund_amount": 400.0, "status": "partially_refunded"}})
    items = await _ledger(api)
    claw = [i for i in items if i["kind"] == "adjustment"]
    assert len(claw) == 1 and claw[0]["amount"] == -100.0 and claw[0]["status"] == "accrued"
    assert [i for i in items if i["kind"] == "accrual"][0]["status"] == "paid"
    await api.post("/admin/commissions/sync")
    assert len(await _ledger(api)) == 2  # idempotent: no second clawback

    # A batch that nets negative is refused so the clawback rolls forward.
    await api.post("/admin/commissions/ledger/approve", json={"entry_ids": [claw[0]["id"]]})
    r = await api.post("/admin/commissions/ledger/mark-paid", json={"entry_ids": [claw[0]["id"]], "reference": "x"})
    assert r.status_code == 409


async def test_mark_paid_requires_approved(api, db):
    company = await _company(db)
    person = await _person(api)
    await _assign(api, person["id"], company)
    await _invoice(db, "ops@affi.example.com", 1000)
    entry = (await _ledger(api))[0]
    r = await api.post("/admin/commissions/ledger/mark-paid", json={"entry_ids": [entry["id"]], "reference": "x"})
    assert r.status_code == 409


async def test_recurring_policies(db):
    settings = {"recurring_policy": "first_n_months", "recurring_months": 12}
    start = datetime(2026, 1, 15, tzinfo=timezone.utc)
    base = {"starts_at": _iso(start), "created_at": _iso(start)}

    def sub(months_after):
        return {"source": "subscription_cycle", "paid_at": _iso(start + timedelta(days=30.5 * months_after))}

    assert invoice_in_scope(base, sub(3), settings)
    assert not invoice_in_scope(base, sub(14), settings)  # past the 12-month window
    assert invoice_in_scope({**base, "recurring_policy": "ongoing"}, sub(30), settings)
    assert not invoice_in_scope({**base, "recurring_policy": "one_time"}, sub(1), settings)
    assert invoice_in_scope({**base, "recurring_policy": "one_time"}, {"source": "paypal_order", "paid_at": sub(1)["paid_at"]}, settings)
    assert invoice_in_scope({**base, "recurring_policy": "first_n_months", "recurring_months": 3}, sub(2), settings)
    assert not invoice_in_scope({**base, "recurring_policy": "first_n_months", "recurring_months": 3}, sub(4), settings)


async def test_calculator_and_validation(api, db):
    company = await _company(db)
    person = await _person(api)
    await _assign(api, person["id"], company, rate_value=30)
    r = (await api.get("/admin/commissions/calculator", params={"amount": 1000, "person_id": person["id"], "company_id": company})).json()
    assert r["commission"] == 300.0 and r["bloom_keeps"] == 700.0 and r["has_assignment"]
    r = (await api.get("/admin/commissions/calculator", params={"amount": 1000})).json()
    assert r["commission"] == 250.0 and not r["has_assignment"]

    dup = await api.post("/admin/commissions/assignments", json={"person_id": person["id"], "company_id": company})
    assert dup.status_code == 409
    bad = await api.post("/admin/commissions/assignments", json={"person_id": person["id"], "company_id": company, "rate_value": 150})
    assert bad.status_code == 422
    assert (await api.post("/admin/people", json={"name": "X", "email": "x@x.example.com", "type": "boss"})).status_code == 422


async def test_inactive_person_stops_accruing(api, db):
    company = await _company(db)
    person = await _person(api)
    await _assign(api, person["id"], company)
    await api.delete(f"/admin/people/{person['id']}")
    await _invoice(db, "ops@affi.example.com", 1000)
    assert await _ledger(api) == []
