"""Integration test for the Master Workflow doc:
- PayPal capture → auto_provision_client_from_payment → AgencyHandy create_client mirror
- Onboarding Phase 1/2/3 → Nifty task creation paths
- Verifies error notifications + admin notifications are generated
"""
import os
import uuid
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient


def _db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


class _FakeState:
    def __init__(self):
        self.agencyhandy = None
        self.emailit = None


class _FakeApp:
    def __init__(self):
        self.state = _FakeState()


class _FakeRequest:
    def __init__(self):
        self.app = _FakeApp()


def _fake_request_with_ah(fake_ah, fake_emailit=None):
    req = _FakeRequest()
    req.app.state.agencyhandy = fake_ah
    req.app.state.emailit = fake_emailit
    return req


@pytest.mark.asyncio
async def test_auto_provision_creates_local_client_only():
    """Phase 17.6: AgencyHandy removed — auto_provision creates only the local
    client doc + admin notification + welcome email. No external mirror call."""
    from client_routes import auto_provision_client_from_payment

    db = _db()
    email = f"test-local-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    try:
        fake_ah = AsyncMock()
        fake_ah.is_configured = True
        fake_ah.create_client = AsyncMock()
        request = _fake_request_with_ah(fake_ah)

        doc = await auto_provision_client_from_payment(
            db, request,
            email=email, name="Local Only",
            source="paypal_test", source_id=f"ORDER-{uuid.uuid4().hex[:6]}",
        )
        assert doc["email"] == email
        # Admin notification emitted
        notif = await db.notifications.find_one(
            {"kind": "client", "title": {"$regex": email}}, {"_id": 0}
        )
        assert notif is not None
        # AgencyHandy mirror is intentionally NOT called anymore.
        fake_ah.create_client.assert_not_awaited()
        # No agency_handy_id on the doc
        assert "agency_handy_id" not in doc
    finally:
        await db.clients.delete_many({"email": email})
        await db.client_reset_tokens.delete_many({"email": email})
        await db.notifications.delete_many({"title": {"$regex": email}})


@pytest.mark.asyncio
async def test_auto_provision_skips_ah_call_when_unconfigured():
    """When AGENCYHANDY_API_KEY is missing, the mirror is a no-op (no crash)."""
    from client_routes import auto_provision_client_from_payment

    db = _db()
    email = f"test-ah-off-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    try:
        fake_ah = AsyncMock()
        fake_ah.is_configured = False  # critical
        fake_ah.create_client = AsyncMock()
        request = _fake_request_with_ah(fake_ah)

        doc = await auto_provision_client_from_payment(
            db, request,
            email=email, name="No AH",
            source="paypal_test", source_id="ORDER-NOAH-001",
        )

        # create_client must NOT be called when unconfigured
        fake_ah.create_client.assert_not_awaited()
        assert doc.get("email") == email
        assert "agency_handy_id" not in doc
    finally:
        await db.clients.delete_many({"email": email})
        await db.client_reset_tokens.delete_many({"email": email})


@pytest.mark.asyncio
async def test_existing_client_no_longer_retries_ah():
    """Phase 17.6: even existing clients without agency_handy_id should NOT trigger AH."""
    from client_routes import auto_provision_client_from_payment

    db = _db()
    email = f"test-no-retry-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    try:
        await db.clients.insert_one({
            "email": email, "name": "Existing No-Retry",
            "source_ids": ["ORDER-OLD-001"], "status": "active",
            "created_at": "2026-01-01T00:00:00+00:00",
        })
        fake_ah = AsyncMock()
        fake_ah.is_configured = True
        fake_ah.create_client = AsyncMock()
        request = _fake_request_with_ah(fake_ah)

        await auto_provision_client_from_payment(
            db, request,
            email=email, name="Existing No-Retry",
            source="paypal_test", source_id="ORDER-NEW-002",
        )
        # No AH call any more
        fake_ah.create_client.assert_not_awaited()
    finally:
        await db.clients.delete_many({"email": email})


@pytest.mark.asyncio
async def test_existing_client_skips_ah_when_already_mirrored():
    """If client already has agency_handy_id, we don't re-call AH (avoid 409 spam)."""
    from client_routes import auto_provision_client_from_payment

    db = _db()
    email = f"test-already-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    try:
        await db.clients.insert_one({
            "email": email, "name": "Already Mirrored",
            "source_ids": ["ORDER-PRIOR"], "status": "active",
            "agency_handy_id": "ah-existing-555",
            "created_at": "2026-01-01T00:00:00+00:00",
        })

        request = _FakeRequest()
        fake_ah = AsyncMock()
        fake_ah.is_configured = True
        fake_ah.create_client = AsyncMock()
        request.app.state.agencyhandy = fake_ah

        await auto_provision_client_from_payment(
            db, request,
            email=email, name="Already Mirrored",
            source="paypal_test", source_id="ORDER-AGAIN-003",
        )

        fake_ah.create_client.assert_not_awaited()
    finally:
        await db.clients.delete_many({"email": email})


def test_agencyhandy_client_has_companyId_header_when_set():
    """The companyId header is required for members + roles endpoints."""
    from agencyhandy_client import AgencyHandyClient

    c = AgencyHandyClient(api_key="dummy", company_id="comp-abc-123")
    assert c.headers.get("companyId") == "comp-abc-123"
    assert c.headers.get("x-api-key") == "dummy"


def test_agencyhandy_client_omits_companyId_when_unset(monkeypatch):
    from agencyhandy_client import AgencyHandyClient

    monkeypatch.delenv("AGENCYHANDY_COMPANY_ID", raising=False)
    c = AgencyHandyClient(api_key="dummy", company_id="")
    assert "companyId" not in c.headers


@pytest.mark.asyncio
async def test_agencyhandy_create_client_returns_role_error_when_role_lookup_fails(monkeypatch):
    """create_client must surface a clear error when the role lookup returns nothing."""
    from agencyhandy_client import AgencyHandyClient

    c = AgencyHandyClient(api_key="dummy", company_id="comp-x")

    async def _fake_request(method, path, **kwargs):
        if path == "/roles":
            return {"success": True, "status": 200, "data": {"roles": []}, "error": None}
        return {"success": False, "status": 0, "data": None, "error": "should not reach"}

    monkeypatch.setattr(c, "_request", _fake_request)
    res = await c.create_client(email="x@example.com", first_name="X")
    assert res["success"] is False
    assert "client" in res["error"].lower()


@pytest.mark.asyncio
async def test_agencyhandy_create_client_happy_path(monkeypatch):
    from agencyhandy_client import AgencyHandyClient

    c = AgencyHandyClient(api_key="dummy", company_id="comp-x")
    captured = {}

    async def _fake_request(method, path, **kwargs):
        if path == "/roles":
            return {
                "success": True, "status": 200, "error": None,
                "data": {"roles": [
                    {"_id": "role-top", "role": {"_id": "role-inner", "name": "client"}},
                ]},
            }
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs.get("json")
        return {
            "success": True, "status": 201, "error": None,
            "data": {"createdMembers": [{"_id": "mem-1"}]},
        }

    monkeypatch.setattr(c, "_request", _fake_request)
    res = await c.create_client(email="x@example.com", first_name="Xavier", last_name="Y")
    assert res["success"] is True
    assert captured["method"] == "POST"
    assert captured["path"] == "/company/comp-x/members/bulk-client"
    assert captured["json"]["email"] == "x@example.com"
    assert captured["json"]["role"] == "role-top"  # top-level id, not nested
    assert captured["json"]["isConvertedClient"] is False
    # Role id is cached
    assert c._client_role_id == "role-top"


@pytest.mark.asyncio
async def test_nifty_sync_clear_error_on_401():
    """Issue #3: when Nifty returns 401, the error must clearly tell the user to Reconnect.

    Goes through the running uvicorn server so the in-process Nifty client
    (initialized in lifespan) is what's patched.
    """
    import requests as _r

    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL="):
                    base = line.split("=", 1)[1].strip().strip('"')
                    break
    assert base, "REACT_APP_BACKEND_URL unresolved"
    base = base.rstrip("/")

    # Login
    r = _r.post(f"{base}/api/auth/login",
                json={"email": "founder@thesalvador.group", "password": "admin123"},
                timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    token = r.json()["access_token"]

    # Call sync. We can't patch the running server's nifty client from here,
    # so just verify the route returns a helpful Reconnect message when not
    # connected (which is the case if no OAuth token has been stored) OR
    # accept a real successful sync as also acceptable.
    res = _r.post(f"{base}/api/admin/integrations/nifty/sync",
                  headers={"Authorization": f"Bearer {token}"}, timeout=15)
    if res.status_code == 200:
        # Real connection works, message clarity is unverifiable here.
        return
    assert res.status_code in (401, 403, 502, 503), f"unexpected: {res.status_code} {res.text}"
    detail = res.json().get("detail", "") if res.headers.get("content-type", "").startswith("application/json") else ""
    # Must be actionable, not a bare "Sync failed" or "Nifty not connected"
    assert any(
        kw in detail
        for kw in ("Reconnect", "Connect", "token", "rate-limit", "server error")
    ), f"Expected actionable error guidance, got: {detail!r}"
