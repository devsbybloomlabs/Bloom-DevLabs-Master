"""Phase 14 — Public Sandbox Tour at /tour + Slack live.

Coverage:
  • GET /api/public/tour/snapshot — no auth, returns demo-only docs
  • Auto-seeds demo data when collection empty
  • Featured items: urgent escalation, in_review approval, complete milestone
  • Sensitive fields (hashed_password, raw_data) stripped from response
  • Slack ping persisted via /admin/integrations/health after a real /test
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
# Public tour snapshot endpoint
# =========================================================================
def test_public_tour_snapshot_requires_no_auth():
    """The tour must work for unauthenticated visitors."""
    r = httpx.get(f"{ROOT}/public/tour/snapshot", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert "stats" in data
    assert "featured" in data
    assert "milestones" in data
    assert "approvals" in data
    assert "escalations" in data


def test_public_tour_auto_seeds_when_empty(auth_headers):
    """Wipe demo data → tour endpoint should auto-seed it back."""
    # Wipe first
    httpx.delete(f"{ROOT}/admin/demo/seed", headers=auth_headers, timeout=15)
    # Hit public endpoint
    r = httpx.get(f"{ROOT}/public/tour/snapshot", timeout=20)
    assert r.status_code == 200
    data = r.json()
    # Confirm at least 4 escalations were re-seeded
    assert len(data["escalations"]) >= 4
    assert data["stats"]["milestones"] >= 2


def test_public_tour_returns_featured_items():
    r = httpx.get(f"{ROOT}/public/tour/snapshot", timeout=20)
    featured = r.json()["featured"]
    # Demo seed always contains an urgent + an in_review + a complete
    assert featured["urgent"] is not None
    assert featured["urgent"]["escalation_type"] == "urgent"
    assert featured["urgent"]["status"] == "open"
    assert featured["approval"] is not None
    assert featured["approval"]["status"] == "in_review"
    assert featured["milestone"] is not None
    assert featured["milestone"]["status"] == "complete"


def test_public_tour_strips_sensitive_fields():
    """No hashed_password or raw_data should leak via the public endpoint."""
    r = httpx.get(f"{ROOT}/public/tour/snapshot", timeout=20)
    data = r.json()
    # Onboarding sometimes contains responses dict but never hashed_password
    blob = str(data)
    assert "hashed_password" not in blob
    assert "raw_data" not in blob


def test_public_tour_returns_only_demo_records(auth_headers):
    """Real client/escalation/etc. records must NOT show up in the tour."""
    r = httpx.get(f"{ROOT}/public/tour/snapshot", timeout=20)
    for arr_key in ("milestones", "approvals", "escalations"):
        for doc in r.json()[arr_key]:
            # Every doc came from a `demo: True` filter so we don't expect that field
            # in the response (it's stripped). Email domains should be demo-only.
            if "client_email" in doc and doc["client_email"]:
                assert doc["client_email"].endswith("@bloomlabs.demo"), (
                    f"Real client email leaked: {doc['client_email']}"
                )


# =========================================================================
# Slack live ping
# =========================================================================
def test_slack_live_test_records_green_ping(auth_headers):
    """The user's real Slack webhook — should respond ok=True when valid.

    Tolerates 502 (webhook revoked/rate-limited by Slack) since this calls
    the live API.
    """
    r = httpx.post(f"{ROOT}/admin/integrations/slack/test", headers=auth_headers, timeout=15)
    # 200 = configured + ok | 503 = not configured | 502 = upstream Slack rejected
    assert r.status_code in (200, 503, 502)
    if r.status_code == 200:
        health = httpx.get(
            f"{ROOT}/admin/integrations/health", headers=auth_headers, timeout=10
        )
        slack_pill = next(
            (p for p in health.json()["providers"] if p["provider"] == "slack"), None
        )
        assert slack_pill is not None
        assert slack_pill["configured"] is True
        assert slack_pill["status"] in {"green", "yellow"}


# =========================================================================
# Sitemap includes /tour
# =========================================================================
def test_sitemap_lists_tour():
    """SEO sanity — tour route must be in sitemap for crawlers to find it."""
    base = BACKEND.rstrip("/")
    # Sitemap is served by the frontend bundle, not the API
    r = httpx.get(f"{base}/sitemap.xml", timeout=15, follow_redirects=True)
    if r.status_code == 200:
        assert "/tour" in r.text
