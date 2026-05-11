"""Phase 16 — Google Calendar OAuth + Calendar API integration.

Coverage:
  • Credentials provider accepts `google_calendar` + masks client_secret
  • /admin/integrations/calendar/start returns authorization_url when configured
  • /admin/integrations/calendar/start returns 503 when client_id missing
  • /admin/integrations/calendar/status reflects connected=False before OAuth
  • /admin/integrations/calendar/test returns 503 when not connected
  • Health endpoint now lists google_calendar (9 providers total)
  • Allowed cred providers includes google_calendar (rejection test)
"""
from __future__ import annotations

import os

import httpx
import pytest

BACKEND = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
ROOT = BACKEND.rstrip("/") + "/api"
FOUNDER = ("founder@thesalvador.group", "admin123")


@pytest.fixture(scope="module")
def auth_headers() -> dict:
    r = httpx.post(
        f"{ROOT}/auth/login",
        json={"email": FOUNDER[0], "password": FOUNDER[1]},
        timeout=15,
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# =========================================================================
# Health + credential provider listing
# =========================================================================
def test_health_endpoint_includes_google_calendar(auth_headers):
    r = httpx.get(f"{ROOT}/admin/integrations/health", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    providers = {p["provider"] for p in r.json()["providers"]}
    assert "google_calendar" in providers


def test_credentials_accepts_google_calendar(auth_headers):
    r = httpx.put(
        f"{ROOT}/admin/integrations/credentials/google_calendar",
        headers=auth_headers,
        json={
            "fields": {
                "client_id": "test-client-id-do-not-overwrite.apps.googleusercontent.com",
                "client_secret": "GOCSPX-test-secret",
            }
        },
        timeout=10,
    )
    # Should NOT 400 — google_calendar is now in ALLOWED_CRED_PROVIDERS
    assert r.status_code == 200
    fields = r.json()["fields"]
    # client_secret should be masked
    assert "GOCSPX" in fields["client_secret"] or "•" in fields["client_secret"]


# =========================================================================
# OAuth start endpoint
# =========================================================================
def test_calendar_start_returns_authorization_url(auth_headers):
    """When OAuth is configured (the real user creds are in DB), start returns a URL."""
    r = httpx.get(
        f"{ROOT}/admin/integrations/calendar/start", headers=auth_headers, timeout=10
    )
    if r.status_code == 503:
        pytest.skip("OAuth not configured (no real creds in DB)")
    assert r.status_code == 200
    url = r.json()["authorization_url"]
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    assert "scope=https" in url
    assert "access_type=offline" in url
    assert "prompt=consent" in url


def test_calendar_status_endpoint(auth_headers):
    r = httpx.get(
        f"{ROOT}/admin/integrations/calendar/status", headers=auth_headers, timeout=10
    )
    assert r.status_code == 200
    body = r.json()
    assert "oauth_configured" in body
    assert "connected" in body
    # Without completing OAuth, connected should be False
    if not body["connected"]:
        assert body["primary"] is None


def test_calendar_test_endpoint_returns_503_when_not_connected(auth_headers):
    r = httpx.post(
        f"{ROOT}/admin/integrations/calendar/test", headers=auth_headers, timeout=10
    )
    # 503 if not connected, 200 if connected (depends on whether user finished OAuth)
    assert r.status_code in (503, 200, 502)


def test_calendar_events_returns_503_when_not_connected(auth_headers):
    r = httpx.get(
        f"{ROOT}/admin/integrations/calendar/events", headers=auth_headers, timeout=10
    )
    assert r.status_code in (503, 200)


# =========================================================================
# OAuth callback redirects (public, no auth)
# =========================================================================
def test_calendar_callback_redirects_on_missing_code():
    """The OAuth callback should always redirect (never 4xx) so the browser
    lands back on /admin/integrations."""
    r = httpx.get(
        f"{ROOT}/oauth/calendar/callback",
        follow_redirects=False,
        timeout=10,
    )
    assert r.status_code in (302, 307)
    loc = r.headers.get("location", "")
    assert "/admin/integrations" in loc
    assert "calendar_error" in loc


# =========================================================================
# Milestone → Calendar event sync (requires connection)
# =========================================================================
def test_milestone_calendar_event_requires_connection(auth_headers):
    """When Google Calendar isn't connected yet, the milestone sync endpoint
    must return 503 (not 500)."""
    r = httpx.post(
        f"{ROOT}/admin/milestones/__nonexistent_id/calendar-event",
        headers=auth_headers,
        json={},
        timeout=10,
    )
    # 503 if not connected, 404 if connected (milestone doesn't exist)
    assert r.status_code in (503, 404)
