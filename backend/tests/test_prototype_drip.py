"""Verify the prototype → upgrade 5-step email drip."""
import os
import sys
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

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


def _make_app():
    """Tiny mock app with an emailit client that records sends."""
    app = MagicMock()
    app.state.emailit.is_configured = True
    app.state.emailit.send_email = AsyncMock(return_value={"ok": True})
    return app


def test_drip_steps_match_v3_spec():
    from gym_prototype_drip import DRIP_STEPS

    assert len(DRIP_STEPS) == 5
    offsets = [s["day_offset"] for s in DRIP_STEPS]
    assert offsets == [0, 3, 5, 10, 11], f"V3 spec: 0/3/5/10/11 — got {offsets}"
    # Step 0 should mention the prototype, step 2 the credit
    assert "prototype" in DRIP_STEPS[0]["subject"].lower() or "prototype" in DRIP_STEPS[0]["body_markdown"].lower()
    assert "$1,000" in DRIP_STEPS[2]["body_markdown"] or "1,000" in DRIP_STEPS[2]["subject"]


@pytest.mark.asyncio
async def test_enqueue_is_idempotent(db):
    from gym_prototype_drip import enqueue_prototype_drip, COLLECTION

    order = {
        "id": f"PP-{uuid.uuid4().hex[:8]}",
        "customer_email": "buyer@example.com",
        "customer_name": "Buyer",
        "amount": "2995.00",
        "currency": "USD",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        id1 = await enqueue_prototype_drip(db, order)
        id2 = await enqueue_prototype_drip(db, order)
        assert id1 and id1 == id2
        rows = await db[COLLECTION].count_documents({"order_id": order["id"]})
        assert rows == 1
    finally:
        await db[COLLECTION].delete_many({"order_id": order["id"]})


@pytest.mark.asyncio
async def test_tick_sends_step_zero_immediately(db):
    from gym_prototype_drip import enqueue_prototype_drip, prototype_drip_tick, COLLECTION

    order = {
        "id": f"PP-{uuid.uuid4().hex[:8]}",
        "customer_email": "buyer@example.com",
        "customer_name": "Buyer",
        "amount": "2995.00",
        "currency": "USD",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    app = _make_app()
    try:
        await enqueue_prototype_drip(db, order)
        result = await prototype_drip_tick(db, app)
        assert result["sent"] == 1, result
        app.state.emailit.send_email.assert_called_once()
        # After tick, next_step_idx should advance to 1 with a future send time
        row = await db[COLLECTION].find_one({"order_id": order["id"]}, {"_id": 0})
        assert row["next_step_idx"] == 1
        assert row["next_send_at"] is not None
        # Step 0 should be logged
        log_entries = row.get("sent_log", [])
        assert len(log_entries) == 1
        assert log_entries[0]["step_idx"] == 0
        assert log_entries[0]["ok"] is True
    finally:
        await db[COLLECTION].delete_many({"order_id": order["id"]})


@pytest.mark.asyncio
async def test_tick_skips_when_buyer_already_upgraded(db):
    """If the buyer paid the upgrade order, the drip should stop firing."""
    from gym_prototype_drip import enqueue_prototype_drip, prototype_drip_tick, COLLECTION

    order_id = f"PP-{uuid.uuid4().hex[:8]}"
    order = {
        "id": order_id,
        "customer_email": "buyer@example.com",
        "customer_name": "Buyer",
        "amount": "2995.00",
        "currency": "USD",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    upgrade_doc = {
        "id": f"PP-{uuid.uuid4().hex[:8]}",
        "kind": "order",
        "tier": "gym_custom",
        "status": "COMPLETED",
        "customer_email": "buyer@example.com",
        "metadata": {"upgrade_from": order_id},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.paypal.insert_one(upgrade_doc)
    app = _make_app()
    try:
        await enqueue_prototype_drip(db, order)
        result = await prototype_drip_tick(db, app)
        assert result["sent"] == 0
        assert result["skipped"] == 1
        app.state.emailit.send_email.assert_not_called()
        row = await db[COLLECTION].find_one({"order_id": order_id}, {"_id": 0})
        assert row["completed"] is True
        assert row.get("completion_reason") == "upgraded"
    finally:
        await db.paypal.delete_one({"id": upgrade_doc["id"]})
        await db[COLLECTION].delete_many({"order_id": order_id})


@pytest.mark.asyncio
async def test_tick_does_not_fire_steps_before_their_day_offset(db):
    """Step 1 should not fire until day 3 after purchase."""
    from gym_prototype_drip import enqueue_prototype_drip, prototype_drip_tick, COLLECTION

    order = {
        "id": f"PP-{uuid.uuid4().hex[:8]}",
        "customer_email": "buyer@example.com",
        "customer_name": "Buyer",
        "amount": "2995.00",
        "currency": "USD",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    app = _make_app()
    try:
        await enqueue_prototype_drip(db, order)
        # First tick fires step 0 (immediate)
        r1 = await prototype_drip_tick(db, app)
        assert r1["sent"] == 1
        # Second tick a minute later should not fire step 1 (it's day-3)
        r2 = await prototype_drip_tick(db, app)
        assert r2["sent"] == 0, "Step 1 should not fire on the same day as step 0"
        # Emailit should still only have been called once total
        assert app.state.emailit.send_email.call_count == 1
    finally:
        await db[COLLECTION].delete_many({"order_id": order["id"]})
