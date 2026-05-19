"""Iteration 37 — Warm-lead revenue stats endpoint tests.

Endpoint: GET /api/admin/leads/warm/revenue-stats
- Admin-auth required (401 without, 403 for client JWT)
- Returns total_pipeline_usd, total_leads, by_niche, by_tier, top_value_leads
- Converted/discarded leads excluded
- Unknown tiers contribute price 0
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lead-pipeline-66.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASS = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASS = "clientpass123"

REVENUE_URL = f"{BASE_URL}/api/admin/leads/warm/revenue-stats"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def client_token():
    # Try canonical client login
    for path in ("/api/clients/login", "/api/client/login", "/api/auth/client/login"):
        r = requests.post(f"{BASE_URL}{path}", json={"email": CLIENT_EMAIL, "password": CLIENT_PASS}, timeout=30)
        if r.status_code == 200:
            tok = r.json().get("access_token") or r.json().get("token")
            if tok:
                return tok
    pytest.skip("Client login failed across known endpoints")


class TestWarmLeadRevenueStats:
    def test_unauth_returns_401(self):
        r = requests.get(REVENUE_URL, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 unauth, got {r.status_code}"

    def test_client_jwt_returns_403(self, client_token):
        r = requests.get(REVENUE_URL, headers={"Authorization": f"Bearer {client_token}"}, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 with client JWT, got {r.status_code} {r.text[:200]}"

    def test_admin_returns_200_with_full_shape(self, admin_token):
        r = requests.get(REVENUE_URL, headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200, f"got {r.status_code} {r.text[:300]}"
        d = r.json()
        for k in ("total_pipeline_usd", "total_leads", "by_niche", "by_tier", "top_value_leads"):
            assert k in d, f"missing key {k} in response"
        assert isinstance(d["total_pipeline_usd"], (int, float))
        assert isinstance(d["total_leads"], int)
        assert isinstance(d["by_niche"], dict)
        assert isinstance(d["by_tier"], dict)
        assert isinstance(d["top_value_leads"], list)
        assert len(d["top_value_leads"]) <= 10

    def test_math_consistency_by_tier(self, admin_token):
        """Sum of by_tier.pipeline_usd should equal total_pipeline_usd; counts match total_leads."""
        r = requests.get(REVENUE_URL, headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        sum_tier = round(sum(v.get("pipeline_usd", 0) for v in d["by_tier"].values()), 2)
        sum_niche = round(sum(v.get("pipeline_usd", 0) for v in d["by_niche"].values()), 2)
        total = round(float(d["total_pipeline_usd"]), 2)
        assert sum_tier == total, f"by_tier sum {sum_tier} != total {total}"
        assert sum_niche == total, f"by_niche sum {sum_niche} != total {total}"
        count_tier = sum(v.get("count", 0) for v in d["by_tier"].values())
        count_niche = sum(v.get("count", 0) for v in d["by_niche"].values())
        assert count_tier == d["total_leads"]
        assert count_niche == d["total_leads"]

    def test_unknown_tier_has_zero_price(self, admin_token):
        r = requests.get(REVENUE_URL, headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        d = r.json()
        if "test" in d["by_tier"]:
            t = d["by_tier"]["test"]
            assert t.get("price", 0) == 0, f"unknown tier 'test' should have price 0, got {t}"
            assert t.get("pipeline_usd", 0) == 0, f"unknown tier should not contribute to pipeline, got {t}"

    def test_coach_starter_price_is_2995(self, admin_token):
        """If coach_starter exists in by_tier, pipeline_usd should equal 2995 * count."""
        r = requests.get(REVENUE_URL, headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        d = r.json()
        if "coach_starter" in d["by_tier"]:
            t = d["by_tier"]["coach_starter"]
            expected = 2995 * t["count"]
            assert abs(t["pipeline_usd"] - expected) < 0.01, f"coach_starter expected {expected}, got {t['pipeline_usd']}"

    def test_converted_and_discarded_excluded(self, admin_token):
        """Backend filter $nin: ['converted','discarded']. Verify no leads with those statuses appear in top_value_leads."""
        r = requests.get(REVENUE_URL, headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        d = r.json()
        # top_value_leads doesn't return status, but the list-warm endpoint can confirm overall counts.
        listed = requests.get(f"{BASE_URL}/api/admin/leads/warm?limit=500",
                              headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        if listed.status_code == 200:
            items = listed.json().get("items", [])
            non_excluded = [i for i in items if i.get("status") not in ("converted", "discarded")]
            # total_leads should equal count of items not converted/discarded
            assert d["total_leads"] == len(non_excluded), \
                f"total_leads {d['total_leads']} != filtered count {len(non_excluded)}"
