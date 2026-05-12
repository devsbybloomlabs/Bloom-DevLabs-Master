"""Phase 10 backend tests — Friction-reducer (providers grid + Nifty cache/sync/prefs).

Run:
  pytest /app/backend/tests/test_phase10_integrations.py -v --tb=short \
    --junitxml=/app/test_reports/pytest/phase10.xml
"""
from __future__ import annotations

import os
import asyncio
from typing import Dict, List

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASSWORD = "clientpass123"
TIMEOUT = 60

PROVIDERS = {"openrouter", "emailit", "paypal"}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session: requests.Session) -> str:
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client_token(session: requests.Session) -> str:
    r = session.post(
        f"{BASE_URL}/api/clients/login",
        json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def admin_headers(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(session: requests.Session, admin_token: str):
    """Disconnect Nifty + clear prefs both before and after the suite."""
    def _clear():
        session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/disconnect",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        # Clear preferences
        session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(admin_token),
            json={
                "default_project_id": "",
                "designer_assignees": [],
                "pm_assignees": [],
                "developer_assignees": [],
            },
            timeout=TIMEOUT,
        )
    _clear()
    yield
    _clear()


# =====================================================
# Nifty pagination (unit)
# =====================================================
class TestNiftyPagination:
    """Direct mock of NiftyClient._request to verify pagination aggregates pages."""

    def test_list_projects_aggregates_pages(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from nifty_client import NiftyClient

        client = NiftyClient(access_token="dummy")

        pages = [
            {"success": True, "status": 200, "data": {"projects": [{"id": f"p{i}"} for i in range(100)]}, "error": None},
            {"success": True, "status": 200, "data": {"projects": [{"id": f"p{i}"} for i in range(100, 200)]}, "error": None},
            {"success": True, "status": 200, "data": {"projects": [{"id": f"p{i}"} for i in range(200, 230)]}, "error": None},
        ]
        idx = {"i": 0}

        async def fake_request(method, path, **kw):
            i = idx["i"]
            idx["i"] += 1
            return pages[i]

        client._request = fake_request  # type: ignore
        res = asyncio.run(client.list_projects(page_size=100))
        assert res["success"] is True
        items = res["data"]["projects"]
        assert len(items) == 230, f"expected 230 aggregated, got {len(items)}"
        # First and last sanity
        assert items[0]["id"] == "p0"
        assert items[-1]["id"] == "p229"

    def test_list_members_aggregates_pages(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from nifty_client import NiftyClient

        client = NiftyClient(access_token="dummy")
        pages = [
            {"success": True, "status": 200, "data": {"members": [{"id": f"m{i}"} for i in range(100)]}, "error": None},
            {"success": True, "status": 200, "data": {"members": [{"id": f"m{i}"} for i in range(100, 150)]}, "error": None},
        ]
        idx = {"i": 0}

        async def fake_request(method, path, **kw):
            i = idx["i"]
            idx["i"] += 1
            return pages[i]

        client._request = fake_request  # type: ignore
        res = asyncio.run(client.list_members())
        assert res["success"] is True
        assert len(res["data"]["members"]) == 150


# =====================================================
# Providers grid
# =====================================================
class TestProvidersGrid:
    def test_list_providers_shape(self, session, admin_token):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/providers",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) == 3
        seen = {x["provider"] for x in data}
        assert seen == PROVIDERS
        for p in data:
            assert set(p.keys()) >= {"provider", "configured", "masked_key", "env_var"}
            assert isinstance(p["configured"], bool)
            if p["configured"]:
                # masked format: 4 chars + bullets + 4 chars
                assert "•" in p["masked_key"], p
                # Should look like XXXX•••••YYYY (last 4 visible)
                assert len(p["masked_key"]) >= 9

    def test_list_providers_requires_admin(self, session):
        r = session.get(f"{BASE_URL}/api/admin/integrations/providers", timeout=TIMEOUT)
        assert r.status_code in (401, 403)

    def test_list_providers_blocks_client(self, session, client_token):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/providers",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)


# =====================================================
# Provider test endpoints
# =====================================================
class TestProviderConnections:
    def test_openrouter_ping(self, session, admin_token):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/openrouter/test",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        # Should succeed when key is configured
        assert r.status_code in (200, 502, 503), r.text
        if r.status_code == 200:
            j = r.json()
            assert j.get("ok") is True
            assert "echo" in j

    def test_paypal_ping(self, session, admin_token):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/paypal/test",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("env") in {"sandbox", "live"}

    def test_emailit_ping_no_500(self, session, admin_token):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/emailit/test",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        # 200 (ok) or 502/503 if upstream auth issue — but never 500
        assert r.status_code != 500, r.text
        assert r.status_code in (200, 502, 503), r.text

    def test_openrouter_client_blocked(self, session, client_token):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/openrouter/test",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)


# =====================================================
# Nifty cache + sync + preferences
# =====================================================
class TestNiftyCacheAndPrefs:
    def test_cache_shape(self, session, admin_token):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/cache",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        j = r.json()
        assert "cache" in j and "preferences" in j

    def test_sync_when_not_connected_503(self, session, admin_token):
        # ensure disconnected
        session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/disconnect",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/sync",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 503, r.text
        assert "isn't connected" in (r.json().get("detail") or "").lower()

    def test_preferences_initial_empty(self, session, admin_token):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j, dict)
        # After cleanup we expect empty-ish (no truthy assignee lists)
        assert not j.get("designer_assignees")
        assert not j.get("pm_assignees")
        assert not j.get("developer_assignees")

    def test_put_preferences_full_then_get(self, session, admin_token):
        payload = {
            "default_project_id": "proj-abc",
            "designer_assignees": ["des@x.com"],
            "pm_assignees": ["pm@x.com"],
            "developer_assignees": ["dev@x.com"],
        }
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(admin_token),
            json=payload,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for k, v in payload.items():
            assert body[k] == v, f"{k}: expected {v}, got {body.get(k)}"

        # GET returns same
        r2 = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        body2 = r2.json()
        for k, v in payload.items():
            assert body2[k] == v

    def test_partial_put_merges(self, session, admin_token):
        # First set full
        session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(admin_token),
            json={
                "default_project_id": "proj-old",
                "designer_assignees": ["des-keep@x.com"],
                "pm_assignees": ["pm-keep@x.com"],
                "developer_assignees": ["dev-keep@x.com"],
            },
            timeout=TIMEOUT,
        )
        # Partial update: only default_project_id
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(admin_token),
            json={"default_project_id": "proj-new"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["default_project_id"] == "proj-new"
        # IMPORTANT: other lists must NOT be wiped
        assert body["designer_assignees"] == ["des-keep@x.com"]
        assert body["pm_assignees"] == ["pm-keep@x.com"]
        assert body["developer_assignees"] == ["dev-keep@x.com"]

    def test_prefs_client_blocked(self, session, client_token):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)
        r2 = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(client_token),
            json={"default_project_id": "x"},
            timeout=TIMEOUT,
        )
        assert r2.status_code in (401, 403)

    def test_sync_client_blocked(self, session, client_token):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/sync",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)


# =====================================================
# _resolve_assignees indirectly via onboarding phase1 submit
# =====================================================
class TestResolveAssigneesFromDB:
    """Set DB prefs, simulate manual token to enable phase processor, submit phase1,
    and verify nifty_errors[0].assignees uses DB designer email (not env)."""

    def test_db_prefs_override_env_for_assignees(self, session, admin_token):
        # 1. Save DB prefs with distinct designer email
        prefs_payload = {
            "default_project_id": "proj-test",
            "designer_assignees": ["db-designer@bloom.test"],
            "pm_assignees": ["db-pm@bloom.test"],
            "developer_assignees": ["db-dev@bloom.test"],
        }
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=admin_headers(admin_token),
            json=prefs_payload,
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text

        # 2. Set a manual token so Nifty is "connected" (ping fails harmlessly)
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/manual-token",
            headers=admin_headers(admin_token),
            json={"access_token": "TEST_FAKE_TOKEN_PHASE10"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text

        # 3. Start an onboarding (admin route)
        ob_email = "test_phase10_resolve@example.com"
        r = session.post(
            f"{BASE_URL}/api/admin/onboarding/start",
            headers=admin_headers(admin_token),
            json={"client_email": ob_email, "client_name": "Phase10 Resolve"},
            timeout=TIMEOUT,
        )
        assert r.status_code in (200, 201), r.text
        ob = r.json()
        token = ob.get("resume_token") or ob.get("token") or (ob.get("onboarding") or {}).get("resume_token")
        ob_id = ob.get("id") or (ob.get("onboarding") or {}).get("id")
        assert token, f"no resume token returned: {ob}"

        # 4. Submit phase1 via public token route
        r = session.post(
            f"{BASE_URL}/api/onboarding/by-token/{token}/submit",
            json={
                "phase": 1,
                "payload": {
                    "design_links": [{"url": "https://example.com", "notes": "test"}],
                    "color_preferences": "blue",
                    "mood_keywords": "calm",
                },
            },
            timeout=TIMEOUT,
        )
        assert r.status_code in (200, 201), r.text
        result = r.json()
        # The processor runs inline; nifty_errors[0] should exist (fake token => task creation fails)
        errors = result.get("nifty_errors") or []
        # Be lenient: fetch directly if not in body
        if not errors and ob_id:
            r2 = session.get(
                f"{BASE_URL}/api/admin/onboarding",
                headers=admin_headers(admin_token),
                timeout=TIMEOUT,
            )
            if r2.status_code == 200:
                arr = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
                for o in arr:
                    if o.get("id") == ob_id:
                        errors = o.get("nifty_errors") or []
                        break

        assert errors, f"expected at least one nifty_errors entry, got: {result}"
        # First error is phase1 design task — assignees should reflect DB designer
        first = errors[0]
        assigns = first.get("assignees") or []
        # Could be a list of strings OR list of dicts
        flat = []
        for a in assigns:
            if isinstance(a, dict):
                flat.append(a.get("email") or a.get("user") or "")
            else:
                flat.append(str(a))
        assert "db-designer@bloom.test" in flat, (
            f"DB preference NOT used. assignees={flat}, expected db-designer@bloom.test"
        )

        # Cleanup: delete onboarding
        if ob_id:
            session.delete(
                f"{BASE_URL}/api/admin/onboarding/{ob_id}",
                headers=admin_headers(admin_token),
                timeout=TIMEOUT,
            )

        # Disconnect Nifty manual token
        session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/disconnect",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
