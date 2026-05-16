"""Verify the prototype → full-build upgrade eligibility logic."""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient


@pytest_asyncio.fixture
async def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    yield client[os.environ["DB_NAME"]]
    client.close()


def _seed_order(**overrides):
    base = {
        "id": f"PP-{uuid.uuid4().hex[:8]}",
        "kind": "order",
        "tier": "gym_prototype",
        "status": "COMPLETED",
        "customer_email": "buyer@example.com",
        "amount": "2995.00",
        "currency": "USD",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_recent_paid_prototype_is_eligible(db):
    from gym_upgrade_routes import _check_eligibility

    order = _seed_order()
    verdict = await _check_eligibility(db, order, "buyer@example.com")
    assert verdict["eligible"] is True, verdict["reasons"]
    assert verdict["discounted_price"] == "7995.00"
    assert verdict["credit_amount"] == 1000.00
    assert verdict["days_remaining"] >= 13


@pytest.mark.asyncio
async def test_expired_window_is_ineligible(db):
    from gym_upgrade_routes import _check_eligibility

    old = (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
    order = _seed_order(created_at=old)
    verdict = await _check_eligibility(db, order, "buyer@example.com")
    assert verdict["eligible"] is False
    assert any("window expired" in r for r in verdict["reasons"])
    assert verdict["days_remaining"] == 0


@pytest.mark.asyncio
async def test_unpaid_order_is_ineligible(db):
    from gym_upgrade_routes import _check_eligibility

    order = _seed_order(status="CREATED")
    verdict = await _check_eligibility(db, order, "buyer@example.com")
    assert verdict["eligible"] is False
    assert any("not paid" in r for r in verdict["reasons"])


@pytest.mark.asyncio
async def test_wrong_email_is_ineligible(db):
    from gym_upgrade_routes import _check_eligibility

    order = _seed_order(customer_email="other@example.com")
    verdict = await _check_eligibility(db, order, "buyer@example.com")
    assert verdict["eligible"] is False
    assert any("does not belong" in r for r in verdict["reasons"])


@pytest.mark.asyncio
async def test_already_upgraded_is_ineligible(db):
    """If a prior upgrade order references this prototype, block double-spend."""
    from gym_upgrade_routes import _check_eligibility

    order = _seed_order()
    upgrade_doc = {
        "id": f"PP-{uuid.uuid4().hex[:8]}",
        "kind": "order",
        "tier": "gym_custom",
        "status": "CREATED",
        "customer_email": "buyer@example.com",
        "metadata": {"upgrade_from": order["id"]},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.paypal.insert_one(upgrade_doc)
    try:
        verdict = await _check_eligibility(db, order, "buyer@example.com")
        assert verdict["eligible"] is False
        assert any("already upgraded" in r for r in verdict["reasons"])
    finally:
        await db.paypal.delete_one({"id": upgrade_doc["id"]})


@pytest.mark.asyncio
async def test_non_prototype_tier_is_ineligible(db):
    from gym_upgrade_routes import _check_eligibility

    order = _seed_order(tier="gym_custom")
    verdict = await _check_eligibility(db, order, "buyer@example.com")
    assert verdict["eligible"] is False
    assert any("not a prototype" in r for r in verdict["reasons"])
