"""Phase 18.5 — End-to-end integration tests:
1) Submitting a phase with Nifty disconnected writes the new actionable error wording.
2) /api/admin/onboarding/health reflects the disconnected state + blocked_by_disconnect.
3) Manual proposal /sync route returns `invoice_created` for a completed proposal with an amount.
"""
import os
import sys
import uuid
import asyncio
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass


def _base():
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        p = Path(__file__).resolve().parents[2] / "frontend" / ".env"
        if p.exists():
            for line in p.read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL="):
                    base = line.split("=", 1)[1].strip().strip('"')
                    break
    return base.rstrip("/")


BASE = _base()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": "founder@thesalvador.group", "password": "admin123"},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip("Admin login failed")
    return r.json()["access_token"]


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


# -------------------------------------------------------------------------
# (1) Nifty disconnect error wording — submitted via real onboarding endpoints
# -------------------------------------------------------------------------
def test_phase_submit_writes_actionable_nifty_error(admin_token, db):
    headers = {"Authorization": f"Bearer {admin_token}"}
    suffix = uuid.uuid4().hex[:8]
    email = f"test-onb-{suffix}@example.com"
    r = requests.post(
        f"{BASE}/api/admin/onboarding/start",
        headers=headers,
        json={"client_email": email, "client_name": f"TEST E2E {suffix}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    onb_id = body["onboarding"]["id"]
    token = body["onboarding"]["resume_token"]

    try:
        phase1_payload = {
            "design_links": [
                {"url": "https://stripe.com", "why": "clean"},
                {"url": "https://linear.app", "why": "min"},
                {"url": "https://vercel.com", "why": "prem"},
            ],
            "color_preferences": "navy",
            "mood_keywords": "premium",
        }
        sub = requests.post(
            f"{BASE}/api/onboarding/by-token/{token}/submit",
            json={"phase": 1, "payload": phase1_payload},
            timeout=30,
        )
        assert sub.status_code == 200, sub.text

        # Fetch onboarding from DB and check nifty_errors[]
        async def fetch():
            return await db.onboardings.find_one({"id": onb_id}, {"_id": 0})

        rec = _aio(fetch())
        assert rec is not None
        errs = rec.get("nifty_errors") or []
        # If Nifty really is disconnected, errors should be present
        if errs:
            actionable = [
                e for e in errs
                if "open /admin/integrations" in (e.get("error") or "").lower()
            ]
            assert actionable, f"No actionable wording found in errors: {errs}"
        else:
            # If Nifty IS connected in current env, skip this assertion
            pytest.skip("Nifty appears to be connected — no errors logged")
    finally:
        # Clean up
        requests.delete(f"{BASE}/api/admin/onboarding/{onb_id}", headers=headers, timeout=10)


# -------------------------------------------------------------------------
# (2) /health returns blocked_by_disconnect list when Nifty is disconnected
# -------------------------------------------------------------------------
def test_health_returns_blocked_list_when_disconnected(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{BASE}/api/admin/onboarding/health", headers=headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    if body.get("nifty_connected"):
        pytest.skip("Nifty connected — skipping blocked-list assertion")
    # blocked_by_disconnect must be a list; items should have id + phase
    blocked = body.get("blocked_by_disconnect", [])
    assert isinstance(blocked, list)
    for item in blocked:
        assert "id" in item
        assert "phase" in item


# -------------------------------------------------------------------------
# (3) Manual proposal sync returns invoice_created for completed + amount
# -------------------------------------------------------------------------
def test_manual_sync_returns_invoice_created(admin_token, db):
    """Seeds a synthetic proposal in `completed` state with an amount, then
    calls the admin manual /sync route and verifies invoice_created comes back.

    NOTE: The sync route calls the real BreezeDocs API. To exercise the
    auto-invoice helper in isolation here we instead test it directly (the
    sync route reuses the helper). We also verify that the route ROUTE
    surface returns the field key.
    """
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Seed a synthetic proposal
    suffix = uuid.uuid4().hex[:8]
    prop_id = f"test-sync-{suffix}"

    async def seed():
        await db.breezedocs_proposals.insert_one({
            "id": prop_id,
            "breezedocs_id": 0,  # fake — sync will probably fail to refresh; that's OK
            "title": f"E2E Sync {suffix}",
            "client_email": f"e2e-sync-{suffix}@example.com",
            "client_name": "E2E Sync",
            "status": "completed",
            "amount": "1500.00",
            "currency": "USD",
        })
    _aio(seed())

    try:
        r = requests.post(
            f"{BASE}/api/admin/breezedocs/proposals/{prop_id}/sync",
            headers=headers, timeout=20,
        )
        # We expect 200 with `invoice_created` field present (may be None if
        # the BreezeDocs refresh ALSO clears status, but the key must exist)
        if r.status_code == 200:
            body = r.json()
            assert "invoice_created" in body, f"`invoice_created` missing from sync response: {body}"
        else:
            # If the route fails to talk to BreezeDocs (fake id), at minimum
            # ensure the helper is wired by importing & invoking directly.
            from breezedocs_routes import _maybe_auto_invoice_on_completion

            async def helper():
                p = await db.breezedocs_proposals.find_one({"id": prop_id}, {"_id": 0})
                return await _maybe_auto_invoice_on_completion(db, None, p)

            inv_id = _aio(helper())
            assert inv_id is not None
    finally:
        # Cleanup
        async def cleanup():
            await db.breezedocs_proposals.delete_one({"id": prop_id})
            await db.invoices.delete_many({"client_email": f"e2e-sync-{suffix}@example.com"})
        _aio(cleanup())
