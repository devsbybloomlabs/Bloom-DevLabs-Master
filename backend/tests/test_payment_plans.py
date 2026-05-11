"""Backend tests for the payment-plan split feature (50/50 vs 100% upfront)."""
import os
import uuid
from pathlib import Path

import pytest
import requests

# Load backend/.env so MONGO_URL/DB_NAME are available in standalone test runs
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    return None

BASE = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()
assert BASE, "REACT_APP_BACKEND_URL not set"
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


class TestPaymentPlanComputation:
    """Pure-Python charge computation."""

    def test_split_50_50_express(self):
        from paypal_routes import compute_charge

        c = compute_charge("express", "split_50_50")
        assert c["base_amount"] == "5995.00"
        assert c["charge_now"] == "2997.50"
        assert c["charge_later"] == "2997.50"
        assert c["discount_applied"] == "0.00"
        assert c["installment_index"] == 1

    def test_full_upfront_custom(self):
        from paypal_routes import compute_charge

        c = compute_charge("custom", "full_upfront")
        assert c["base_amount"] == "8995.00"
        assert c["charge_now"] == "8495.00"
        assert c["charge_later"] == "0.00"
        assert c["discount_applied"] == "500.00"

    def test_full_upfront_enterprise(self):
        from paypal_routes import compute_charge

        c = compute_charge("enterprise", "full_upfront")
        assert c["base_amount"] == "14995.00"
        # 14995 - 500 = 14495
        assert c["charge_now"] == "14495.00"
        assert c["charge_later"] == "0.00"

    def test_split_round_trip_no_drift(self):
        """charge_now + charge_later must equal base_amount for split plans."""
        from paypal_routes import compute_charge

        for tier in ("express", "custom", "enterprise"):
            c = compute_charge(tier, "split_50_50")
            assert (
                round(float(c["charge_now"]) + float(c["charge_later"]), 2)
                == float(c["base_amount"])
            )


class TestCreateOrderPayload:
    """Public /paypal/orders accepts payment_plan and rejects invalid values."""

    def test_create_order_invalid_payment_plan_returns_400(self):
        r = requests.post(
            f"{API}/paypal/orders",
            json={
                "tier": "express",
                "payment_plan": "monthly_subscription",  # invalid
                "customer_email": "e2e-bad-plan@bybloomlabs.com",
                "customer_name": "E2E Bad",
            },
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "payment_plan" in r.text.lower()

    def test_create_order_split_returns_502_due_to_sandbox_creds(self):
        """We expect sandbox to reject the credentials. The route must still
        validate the payload and reach PayPal (returning 502, not 500)."""
        r = requests.post(
            f"{API}/paypal/orders",
            json={
                "tier": "express",
                "payment_plan": "split_50_50",
                "customer_email": "e2e-split@bybloomlabs.com",
                "customer_name": "E2E Split",
            },
            timeout=20,
        )
        assert r.status_code in (200, 502), r.text

    def test_create_order_full_upfront_returns_502_due_to_sandbox_creds(self):
        r = requests.post(
            f"{API}/paypal/orders",
            json={
                "tier": "enterprise",
                "payment_plan": "full_upfront",
                "customer_email": "e2e-upfront@bybloomlabs.com",
                "customer_name": "E2E Upfront",
            },
            timeout=20,
        )
        assert r.status_code in (200, 502), r.text


class TestMarkReadyForLaunch:
    """Admin endpoint for billing the launch balance."""

    def test_requires_auth(self):
        r = requests.post(
            f"{API}/paypal/admin/transactions/FAKE-ID/mark-ready-for-launch",
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_unknown_order_returns_404(self, admin_token):
        r = requests.post(
            f"{API}/paypal/admin/transactions/UNKNOWN-{uuid.uuid4().hex}/mark-ready-for-launch",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_rejects_non_split_orders(self, admin_token):
        """Seed a fake non-split transaction and ensure the endpoint refuses."""
        import asyncio
        import sys

        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            doc_id = f"TEST-NONSPLIT-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": doc_id,
                "kind": "order",
                "status": "COMPLETED",
                "tier": "express",
                "amount": "5995.00",
                "currency": "USD",
                "payment_plan": "full_upfront",
                "installment_index": 1,
            })
            return db, doc_id

        async def cleanup(db, doc_id):
            await db.paypal_transactions.delete_one({"id": doc_id})

        loop = asyncio.new_event_loop()
        db, doc_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{doc_id}/mark-ready-for-launch",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=15,
            )
            assert r.status_code == 400, r.text
            assert "split" in r.text.lower()
        finally:
            loop.run_until_complete(cleanup(db, doc_id))
            loop.close()

    def test_rejects_uncaptured_split(self, admin_token):
        """A split order whose first 50% hasn't captured yet can't be launched."""
        import asyncio
        import sys

        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            doc_id = f"TEST-PENDING-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": doc_id,
                "kind": "order",
                "status": "CREATED",  # not captured
                "tier": "express",
                "amount": "2997.50",
                "currency": "USD",
                "payment_plan": "split_50_50",
                "base_amount": "5995.00",
                "charge_now": "2997.50",
                "charge_later": "2997.50",
                "installment_index": 1,
                "installment_2_status": "pending_capture",
            })
            return db, doc_id

        async def cleanup(db, doc_id):
            await db.paypal_transactions.delete_one({"id": doc_id})

        loop = asyncio.new_event_loop()
        db, doc_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{doc_id}/mark-ready-for-launch",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=15,
            )
            assert r.status_code == 400, r.text
            assert "captured" in r.text.lower()
        finally:
            loop.run_until_complete(cleanup(db, doc_id))
            loop.close()


class TestCancelInstallment2:
    """Admin cancel endpoint for uncaptured installment-2 orders."""

    def test_requires_auth(self):
        r = requests.post(
            f"{API}/paypal/admin/transactions/FAKE/cancel-installment-2",
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_unknown_order_returns_404(self, admin_token):
        r = requests.post(
            f"{API}/paypal/admin/transactions/UNKNOWN-{uuid.uuid4().hex}/cancel-installment-2",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_rejects_non_split_parent(self, admin_token):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            doc_id = f"TEST-CANCEL-NONSPLIT-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": doc_id,
                "kind": "order",
                "status": "COMPLETED",
                "payment_plan": "full_upfront",
                "installment_index": 1,
            })
            return db, doc_id

        async def cleanup(db, doc_id):
            await db.paypal_transactions.delete_one({"id": doc_id})

        loop = asyncio.new_event_loop()
        db, doc_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{doc_id}/cancel-installment-2",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=15,
            )
            assert r.status_code == 400, r.text
        finally:
            loop.run_until_complete(cleanup(db, doc_id))
            loop.close()

    def test_rejects_when_no_installment_2_billed(self, admin_token):
        """Split parent without an installment_2_order_id can't be cancelled."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            doc_id = f"TEST-CANCEL-NOINS2-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": doc_id,
                "kind": "order",
                "status": "COMPLETED",
                "payment_plan": "split_50_50",
                "installment_index": 1,
                "installment_2_status": "pending_launch",
            })
            return db, doc_id

        async def cleanup(db, doc_id):
            await db.paypal_transactions.delete_one({"id": doc_id})

        loop = asyncio.new_event_loop()
        db, doc_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{doc_id}/cancel-installment-2",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=15,
            )
            assert r.status_code == 400, r.text
            assert "no installment-2" in r.text.lower()
        finally:
            loop.run_until_complete(cleanup(db, doc_id))
            loop.close()

    def test_happy_path_voids_child_resets_parent(self, admin_token):
        """Seed a parent with a fake billed child → cancel → child VOIDED_LOCAL,
        parent reset to pending_launch with installment_2_order_id removed."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            parent_id = f"TEST-CANCEL-PARENT-{uuid.uuid4().hex[:8]}"
            child_id = f"TEST-CANCEL-CHILD-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": parent_id,
                "kind": "order",
                "status": "COMPLETED",
                "payment_plan": "split_50_50",
                "installment_index": 1,
                "installment_2_status": "billed",
                "installment_2_order_id": child_id,
                "installment_2_billed_at": "2026-02-11T00:00:00+00:00",
                "charge_later": "2997.50",
                "currency": "USD",
                "customer_email": "cancel-e2e@bybloomlabs.com",
            })
            await db.paypal_transactions.insert_one({
                "id": child_id,
                "kind": "order",
                "status": "CREATED",
                "payment_plan": "split_50_50",
                "installment_index": 2,
                "parent_order_id": parent_id,
                "amount": "2997.50",
                "currency": "USD",
            })
            return db, parent_id, child_id

        async def cleanup(db, parent_id, child_id):
            await db.paypal_transactions.delete_many(
                {"id": {"$in": [parent_id, child_id]}}
            )

        async def fetch(db, doc_id):
            return await db.paypal_transactions.find_one({"id": doc_id}, {"_id": 0})

        loop = asyncio.new_event_loop()
        db, parent_id, child_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{parent_id}/cancel-installment-2",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"reason": "E2E cancel test"},
                timeout=15,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["ok"] is True
            assert body["cancelled_child_id"] == child_id
            assert body["parent_installment_2_status"] == "pending_launch"

            child = loop.run_until_complete(fetch(db, child_id))
            parent = loop.run_until_complete(fetch(db, parent_id))
            assert child["status"] == "VOIDED_LOCAL"
            assert child["cancel_reason"] == "E2E cancel test"
            assert parent["installment_2_status"] == "pending_launch"
            assert parent.get("installment_2_order_id") is None
            assert parent.get("installment_2_billed_at") is None
        finally:
            loop.run_until_complete(cleanup(db, parent_id, child_id))
            loop.close()

    def test_rejects_when_child_already_captured(self, admin_token):
        """If the child installment-2 has been captured, cancel must fail."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            parent_id = f"TEST-CANCEL-CAP-PARENT-{uuid.uuid4().hex[:8]}"
            child_id = f"TEST-CANCEL-CAP-CHILD-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": parent_id,
                "kind": "order",
                "status": "COMPLETED",
                "payment_plan": "split_50_50",
                "installment_index": 1,
                "installment_2_status": "paid",
                "installment_2_order_id": child_id,
            })
            await db.paypal_transactions.insert_one({
                "id": child_id,
                "kind": "order",
                "status": "COMPLETED",  # already captured
                "payment_plan": "split_50_50",
                "installment_index": 2,
                "parent_order_id": parent_id,
            })
            return db, parent_id, child_id

        async def cleanup(db, parent_id, child_id):
            await db.paypal_transactions.delete_many(
                {"id": {"$in": [parent_id, child_id]}}
            )

        loop = asyncio.new_event_loop()
        db, parent_id, child_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{parent_id}/cancel-installment-2",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=15,
            )
            assert r.status_code == 409, r.text
            assert "refund" in r.text.lower()
        finally:
            loop.run_until_complete(cleanup(db, parent_id, child_id))
            loop.close()


class TestAmountOverride:
    """mark-ready-for-launch accepts an optional amount_override."""

    def test_rejects_negative_amount_override(self, admin_token):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            doc_id = f"TEST-OVERRIDE-NEG-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": doc_id,
                "kind": "order",
                "status": "COMPLETED",
                "tier": "express",
                "payment_plan": "split_50_50",
                "installment_index": 1,
                "installment_2_status": "pending_launch",
                "charge_later": "2997.50",
                "currency": "USD",
            })
            return db, doc_id

        async def cleanup(db, doc_id):
            await db.paypal_transactions.delete_one({"id": doc_id})

        loop = asyncio.new_event_loop()
        db, doc_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{doc_id}/mark-ready-for-launch",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"amount_override": "-50.00"},
                timeout=15,
            )
            assert r.status_code == 400, r.text
            assert "positive" in r.text.lower()
        finally:
            loop.run_until_complete(cleanup(db, doc_id))
            loop.close()

    def test_rejects_non_numeric_amount_override(self, admin_token):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        async def seed():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            doc_id = f"TEST-OVERRIDE-NAN-{uuid.uuid4().hex[:8]}"
            await db.paypal_transactions.insert_one({
                "id": doc_id,
                "kind": "order",
                "status": "COMPLETED",
                "tier": "express",
                "payment_plan": "split_50_50",
                "installment_index": 1,
                "installment_2_status": "pending_launch",
                "charge_later": "2997.50",
                "currency": "USD",
            })
            return db, doc_id

        async def cleanup(db, doc_id):
            await db.paypal_transactions.delete_one({"id": doc_id})

        loop = asyncio.new_event_loop()
        db, doc_id = loop.run_until_complete(seed())
        try:
            r = requests.post(
                f"{API}/paypal/admin/transactions/{doc_id}/mark-ready-for-launch",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"amount_override": "abc"},
                timeout=15,
            )
            assert r.status_code == 400, r.text
            assert "numeric" in r.text.lower()
        finally:
            loop.run_until_complete(cleanup(db, doc_id))
            loop.close()
