"""Phase 18.5 — BreezeDocs completed → auto-invoice tests.

The flow: when a proposal hits `completed` (signed by both parties), we
auto-issue an invoice using the proposal's amount and send it via email
with a 1-click PayPal pay link.
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass


@pytest.fixture
def db():
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    yield client[os.environ["DB_NAME"]]
    client.close()


def _aio(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("loop closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def test_completed_proposal_with_amount_creates_invoice(db):
    """Happy path: completed + amount > 0 → invoice issued + linked."""
    from breezedocs_routes import _maybe_auto_invoice_on_completion

    async def run():
        prop_id = f"test-{uuid.uuid4()}"
        prop = {
            "id": prop_id,
            "breezedocs_id": 99100,
            "title": "Auto-Invoice Test Proposal",
            "client_email": f"phase18-autoinv-{uuid.uuid4().hex[:8]}@example.com",
            "client_name": "Auto Invoice Test",
            "status": "completed",
            "amount": "2500.00",
            "currency": "USD",
        }
        await db.breezedocs_proposals.insert_one({**prop})
        try:
            inv_id = await _maybe_auto_invoice_on_completion(db, None, prop)
            assert inv_id is not None
            inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
            assert inv is not None
            assert inv["total"] == 2500.0
            assert inv["client_email"] == prop["client_email"]
            assert inv["status"] == "issued"
            assert inv["balance_due"] == 2500.0
            assert inv["source"] == "manual"
            assert any("Auto-Invoice Test Proposal" in li["description"] for li in inv["line_items"])
            # Idempotency: second call returns None
            updated_prop = await db.breezedocs_proposals.find_one({"id": prop_id}, {"_id": 0})
            assert updated_prop["linked_invoice_id"] == inv_id
            second = await _maybe_auto_invoice_on_completion(db, None, updated_prop)
            assert second is None
        finally:
            await db.breezedocs_proposals.delete_one({"id": prop_id})
            await db.invoices.delete_many({"client_email": prop["client_email"]})

    _aio(run())


def test_zero_amount_proposal_skipped(db):
    """NDAs and similar zero-amount documents must NOT create an invoice."""
    from breezedocs_routes import _maybe_auto_invoice_on_completion

    async def run():
        prop = {
            "id": f"test-{uuid.uuid4()}",
            "breezedocs_id": 99101,
            "title": "Zero amount",
            "client_email": "phase18-zero@example.com",
            "status": "completed",
            "amount": "0.00",
            "currency": "USD",
        }
        await db.breezedocs_proposals.insert_one({**prop})
        try:
            inv_id = await _maybe_auto_invoice_on_completion(db, None, prop)
            assert inv_id is None
        finally:
            await db.breezedocs_proposals.delete_one({"id": prop["id"]})

    _aio(run())


def test_no_amount_proposal_skipped(db):
    """Proposals without an amount must NOT create an invoice."""
    from breezedocs_routes import _maybe_auto_invoice_on_completion

    async def run():
        prop = {
            "id": f"test-{uuid.uuid4()}",
            "breezedocs_id": 99102,
            "title": "No amount",
            "client_email": "phase18-noamt@example.com",
            "status": "completed",
            "amount": None,
            "currency": "USD",
        }
        await db.breezedocs_proposals.insert_one({**prop})
        try:
            inv_id = await _maybe_auto_invoice_on_completion(db, None, prop)
            assert inv_id is None
        finally:
            await db.breezedocs_proposals.delete_one({"id": prop["id"]})

    _aio(run())


def test_non_completed_status_skipped(db):
    """A proposal in `sent` or `opened` state must NOT trigger invoicing."""
    from breezedocs_routes import _maybe_auto_invoice_on_completion

    async def run():
        for status in ("sent", "opened", "signed", "draft", "declined"):
            prop = {
                "id": f"test-{uuid.uuid4()}",
                "breezedocs_id": 99103,
                "title": "Wrong status",
                "client_email": "phase18-wrongstatus@example.com",
                "status": status,
                "amount": "500.00",
                "currency": "USD",
            }
            inv_id = await _maybe_auto_invoice_on_completion(db, None, prop)
            assert inv_id is None, f"Status {status} should NOT trigger invoicing"

    _aio(run())


def test_missing_client_email_skipped(db):
    """Without a client email we can't bill — must skip."""
    from breezedocs_routes import _maybe_auto_invoice_on_completion

    async def run():
        prop = {
            "id": f"test-{uuid.uuid4()}",
            "breezedocs_id": 99104,
            "title": "No email",
            "client_email": None,
            "status": "completed",
            "amount": "500.00",
            "currency": "USD",
        }
        inv_id = await _maybe_auto_invoice_on_completion(db, None, prop)
        assert inv_id is None

    _aio(run())
