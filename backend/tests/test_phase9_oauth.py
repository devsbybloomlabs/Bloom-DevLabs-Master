"""Phase 9 backend tests — Nifty OAuth admin integration plumbing.

Run:
  pytest /app/backend/tests/test_phase9_oauth.py -v --tb=short \
    --junitxml=/app/test_reports/pytest/phase9.xml
"""
from __future__ import annotations

import os
from urllib.parse import urlparse, parse_qs

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASSWORD = "clientpass123"

EXPECTED_CLIENT_ID = "YWSnuABjapgejTQFGXse9Xc3LKiQjFqH"
EXPECTED_REDIRECT_URI = "https://bybloomlabs.com/auth/callback"
TIMEOUT = 30


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
def cleanup_state(session: requests.Session, admin_token: str):
    """Ensure no Nifty integration doc is stored before tests run, and clean up after."""
    session.post(
        f"{BASE_URL}/api/admin/integrations/nifty/disconnect",
        headers=admin_headers(admin_token),
        timeout=TIMEOUT,
    )
    yield
    session.post(
        f"{BASE_URL}/api/admin/integrations/nifty/disconnect",
        headers=admin_headers(admin_token),
        timeout=TIMEOUT,
    )


# =====================================================
# Auth gating
# =====================================================
class TestAuthGating:
    def test_status_requires_auth(self, session: requests.Session):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/status", timeout=TIMEOUT
        )
        assert r.status_code in (401, 403), r.text

    def test_authorize_url_requires_auth(self, session: requests.Session):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/authorize-url",
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)

    def test_client_blocked_status(self, session: requests.Session, client_token: str):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/status",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)

    def test_client_blocked_authorize(self, session: requests.Session, client_token: str):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/authorize-url",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)

    def test_client_blocked_exchange(self, session: requests.Session, client_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/exchange",
            json={"code": "x", "state": "y"},
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)

    def test_client_blocked_manual_token(self, session: requests.Session, client_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/manual-token",
            json={"access_token": "x"},
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)

    def test_client_blocked_disconnect(self, session: requests.Session, client_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/disconnect",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)


# =====================================================
# OAuth flow primitives
# =====================================================
class TestNiftyOAuth:
    saved_state: str | None = None

    def test_status_initial_state(self, session: requests.Session, admin_token: str):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/status",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["oauth_configured"] is True
        assert data["client_id_set"] is True
        assert data["redirect_uri"] == EXPECTED_REDIRECT_URI
        assert data["connected"] is False
        assert data["ping_ok"] is False

    def test_authorize_url_shape_and_state_persisted(
        self, session: requests.Session, admin_token: str
    ):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/authorize-url",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and "state" in data
        url = data["url"]
        state = data["state"]
        TestNiftyOAuth.saved_state = state

        assert url.startswith("https://nifty.pm/authorize")
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        assert qs.get("client_id", [""])[0] == EXPECTED_CLIENT_ID
        assert qs.get("response_type", [""])[0] == "code"
        assert qs.get("redirect_uri", [""])[0] == EXPECTED_REDIRECT_URI
        assert qs.get("state", [""])[0] == state
        assert qs.get("scope", [""])[0]  # non-empty scope

    def test_exchange_fake_code_returns_502(
        self, session: requests.Session, admin_token: str
    ):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/exchange",
            json={"code": "fake-code-123", "state": "definitely-not-real-state"},
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        # Should NOT crash. PayPal-pattern: 502 envelope.
        assert r.status_code == 502, r.text
        body = r.json()
        assert "detail" in body
        assert isinstance(body["detail"], str)
        assert len(body["detail"]) > 0

    def test_manual_token_save(self, session: requests.Session, admin_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/manual-token",
            json={"access_token": "fake_token_for_testing"},
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "stored" in data
        # Source must be 'manual'
        assert data["stored"].get("source") == "manual"
        # Ping is expected to fail because token is fake
        assert data["ping_ok"] is False

    def test_manual_token_empty_400(self, session: requests.Session, admin_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/manual-token",
            json={"access_token": "   "},
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 400

    def test_status_after_manual_token(self, session: requests.Session, admin_token: str):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/status",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is True
        assert data["ping_ok"] is False
        assert data.get("stored") is not None
        assert data["stored"].get("source") == "manual"
        # Access/refresh tokens should NOT leak to status response
        assert "access_token" not in (data.get("stored") or {})
        assert "refresh_token" not in (data.get("stored") or {})

    def test_projects_returns_502_with_fake_token(
        self, session: requests.Session, admin_token: str
    ):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/projects",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        # Fake token → upstream 401 → route returns 502 envelope
        assert r.status_code == 502, r.text

    def test_members_returns_502_with_fake_token(
        self, session: requests.Session, admin_token: str
    ):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/members",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 502, r.text

    def test_disconnect(self, session: requests.Session, admin_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/integrations/nifty/disconnect",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_status_after_disconnect(
        self, session: requests.Session, admin_token: str
    ):
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/status",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is False
        assert data["ping_ok"] is False
        assert data.get("stored") is None

    def test_zz_authorize_url_creates_new_state_each_time(
        self, session: requests.Session, admin_token: str
    ):
        r1 = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/authorize-url",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        r2 = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/authorize-url",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["state"] != r2.json()["state"]
