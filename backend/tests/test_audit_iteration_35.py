"""
Iteration 35 — Audit Submission Engine backend tests.
Covers:
  * GET /api/audits/options
  * POST /api/audits (validation + happy path)
  * Background pipeline (Claude analysis populates fields)
  * GET /api/audits/{id}/status (public)
  * GET /api/admin/audits (list + filters)
  * GET /api/admin/audits/reports/summary
  * GET /api/admin/audits/{id} (detail)
  * PATCH /api/admin/audits/{id}
  * POST /api/admin/audits/{id}/reanalyze
  * DELETE /api/admin/audits/{id}
"""
import os
import time
import uuid
import pytest
import requests

def _load_base_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    # fall back: read frontend/.env directly
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_base_url()
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"

# ----- session-level fixtures -----
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def admin_api(api, admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


# Shared submission id used across tests
SHARED = {"audit_id": None}


VALID_PAYLOAD = {
    "company_name": "TEST_Acme Strength & Performance",
    "customer_name": "TEST Sarah Connor",
    "customer_title": "Founder",
    "customer_email": f"test_audit_{uuid.uuid4().hex[:8]}@example.com",
    "customer_phone": "+1-415-555-2031",
    "industry": "Gym Owners",
    "company_size": "11-50",
    "pain_point": "Member/Patient Retention",
    "budget_range": "$12K-$20K",
    "workflow_description": (
        "We currently use Mindbody for booking + Mailchimp for email + a Google Sheet for retention tracking. "
        "Coaches manually flag at-risk members each Friday and the front desk calls them. It's very brittle."
    ),
    "bottleneck_description": "Coaches forget to flag drop-off members so 18% churn monthly without anyone calling them.",
    "timeline": "ASAP (this month)",
    "source_cta": "homepage_hero_get_my_new_workflow",
    "source_url": "https://bybloomlabs.com/",
}


# ===== Public endpoints =====
class TestAuditOptions:
    def test_options_public_no_auth(self, api):
        r = api.get(f"{BASE_URL}/api/audits/options")
        assert r.status_code == 200
        data = r.json()
        for key in ["industries", "company_sizes", "pain_points", "budgets", "timelines", "roles"]:
            assert key in data, f"missing key {key}"
            assert isinstance(data[key], list) and len(data[key]) > 0
        assert "Gym Owners" in data["industries"]
        assert "Founder" in data["roles"]


class TestAuditSubmit:
    def test_submit_success_returns_id(self, api):
        r = api.post(f"{BASE_URL}/api/audits", json=VALID_PAYLOAD)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "id" in data and isinstance(data["id"], str) and len(data["id"]) > 10
        assert data["customer_email"] == VALID_PAYLOAD["customer_email"]
        assert data["customer_phone"] == VALID_PAYLOAD["customer_phone"]
        assert "expected_call_window" in data and isinstance(data["expected_call_window"], str)
        SHARED["audit_id"] = data["id"]

    def test_submit_invalid_email_returns_422(self, api):
        bad = {**VALID_PAYLOAD, "customer_email": "not-an-email"}
        r = api.post(f"{BASE_URL}/api/audits", json=bad)
        assert r.status_code == 422

    def test_submit_invalid_industry_returns_422(self, api):
        bad = {**VALID_PAYLOAD, "industry": "Nonexistent Industry"}
        r = api.post(f"{BASE_URL}/api/audits", json=bad)
        assert r.status_code == 422

    def test_submit_invalid_company_size_returns_422(self, api):
        bad = {**VALID_PAYLOAD, "company_size": "10000"}
        r = api.post(f"{BASE_URL}/api/audits", json=bad)
        assert r.status_code == 422

    def test_submit_invalid_pain_point_returns_422(self, api):
        bad = {**VALID_PAYLOAD, "pain_point": "Made-up"}
        r = api.post(f"{BASE_URL}/api/audits", json=bad)
        assert r.status_code == 422

    def test_submit_invalid_budget_returns_422(self, api):
        bad = {**VALID_PAYLOAD, "budget_range": "$1B"}
        r = api.post(f"{BASE_URL}/api/audits", json=bad)
        assert r.status_code == 422

    def test_submit_invalid_timeline_returns_422(self, api):
        bad = {**VALID_PAYLOAD, "timeline": "Whenever"}
        r = api.post(f"{BASE_URL}/api/audits", json=bad)
        assert r.status_code == 422

    def test_submit_short_workflow_returns_422(self, api):
        bad = {**VALID_PAYLOAD, "workflow_description": "too short"}
        r = api.post(f"{BASE_URL}/api/audits", json=bad)
        assert r.status_code == 422


# ===== Public status =====
class TestPublicStatus:
    def test_status_returns_minimal_fields(self, api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("no audit id available")
        r = api.get(f"{BASE_URL}/api/audits/{aid}/status")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == aid
        assert data["customer_name"] == VALID_PAYLOAD["customer_name"]
        assert data["company_name"] == VALID_PAYLOAD["company_name"]
        assert "status" in data
        # Should NOT leak sensitive fields
        for forbidden in ["customer_email", "customer_phone", "workflow_description", "analyzed_recommendations"]:
            assert forbidden not in data, f"Status endpoint leaks {forbidden}"

    def test_status_404_for_unknown_id(self, api):
        r = api.get(f"{BASE_URL}/api/audits/does-not-exist-xyz/status")
        assert r.status_code == 404


# ===== Admin =====
class TestAdminList:
    def test_admin_list_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/audits")
        assert r.status_code in (401, 403)

    def test_admin_list_returns_array(self, admin_api):
        r = admin_api.get(f"{BASE_URL}/api/admin/audits")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # our shared audit should be in here
        ids = [d["id"] for d in data]
        assert SHARED["audit_id"] in ids

    def test_admin_list_filter_by_industry(self, admin_api):
        r = admin_api.get(f"{BASE_URL}/api/admin/audits", params={"industry": "Gym Owners"})
        assert r.status_code == 200
        data = r.json()
        assert all(d["industry"] == "Gym Owners" for d in data)


class TestAdminDetail:
    def test_admin_detail_full_fields(self, admin_api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("no audit id")
        r = admin_api.get(f"{BASE_URL}/api/admin/audits/{aid}")
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == aid
        assert d["customer_email"] == VALID_PAYLOAD["customer_email"]
        assert d["workflow_description"] == VALID_PAYLOAD["workflow_description"]
        assert d["source_cta"] == VALID_PAYLOAD["source_cta"]
        assert d["status"] in ("submitted", "analyzed")

    def test_admin_detail_404(self, admin_api):
        r = admin_api.get(f"{BASE_URL}/api/admin/audits/missing-id")
        assert r.status_code == 404


class TestAnalysisPipeline:
    """Polls until Claude analysis populates fields (up to ~75s)."""

    def test_analysis_populates_within_window(self, admin_api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("no audit id")
        deadline = time.time() + 90
        last = None
        while time.time() < deadline:
            r = admin_api.get(f"{BASE_URL}/api/admin/audits/{aid}")
            if r.status_code == 200:
                last = r.json()
                if last.get("status") == "analyzed" and last.get("analyzed_recommendations"):
                    break
            time.sleep(5)
        assert last is not None, "no admin detail response"
        assert last.get("status") == "analyzed", f"status never flipped to analyzed: {last.get('status')}"
        assert last.get("analyzed_recommendations"), "analyzed_recommendations empty"
        titles = last.get("recommendation_titles") or []
        assert 3 <= len(titles) <= 6, f"expected 3-5 titles, got {len(titles)}: {titles}"
        # quick_win + estimated_price_tier are best-effort regex parses; assert at least one present
        assert last.get("quick_win") or last.get("estimated_price_tier"), \
            "neither quick_win nor estimated_price_tier parsed from Claude output"
        assert last.get("analyzed_at"), "analyzed_at timestamp missing"


class TestAdminReports:
    def test_reports_summary_shape(self, admin_api):
        r = admin_api.get(f"{BASE_URL}/api/admin/audits/reports/summary")
        assert r.status_code == 200
        d = r.json()
        for key in ["total", "week", "month", "called", "won", "call_rate_pct",
                    "win_rate_pct", "deal_value_won_usd", "avg_time_to_call_hours",
                    "by_status", "by_industry", "by_source_cta", "daily"]:
            assert key in d, f"missing report key {key}"
        assert isinstance(d["total"], int) and d["total"] >= 1
        assert isinstance(d["by_status"], dict)
        assert isinstance(d["by_industry"], list)
        assert isinstance(d["by_source_cta"], list)
        assert isinstance(d["daily"], list)
        # by_industry items have right shape
        if d["by_industry"]:
            assert "industry" in d["by_industry"][0] and "count" in d["by_industry"][0]
        # source CTA should track our submission
        ctas = [row["cta"] for row in d["by_source_cta"]]
        assert VALID_PAYLOAD["source_cta"] in ctas


class TestAdminUpdate:
    def test_patch_status_and_notes(self, admin_api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("no audit id")
        r = admin_api.patch(
            f"{BASE_URL}/api/admin/audits/{aid}",
            json={"status": "reviewed", "assigned_to": "sarah@bloomlabs.io",
                  "notes": "TEST_first review note"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "reviewed"
        assert d["assigned_to"] == "sarah@bloomlabs.io"
        assert d["notes"] == "TEST_first review note"

        # Verify persisted via GET
        g = admin_api.get(f"{BASE_URL}/api/admin/audits/{aid}")
        assert g.json()["status"] == "reviewed"

    def test_patch_invalid_status_returns_422(self, admin_api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("no audit id")
        r = admin_api.patch(f"{BASE_URL}/api/admin/audits/{aid}", json={"status": "bogus_state"})
        assert r.status_code == 422

    def test_patch_deal_value(self, admin_api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("no audit id")
        r = admin_api.patch(
            f"{BASE_URL}/api/admin/audits/{aid}",
            json={"status": "closed_won", "deal_status": "won", "deal_value_usd": 12500.0},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "closed_won"
        assert d["deal_value_usd"] == 12500.0
        assert d["deal_status"] == "won"

    def test_patch_404_unknown_audit(self, admin_api):
        r = admin_api.patch(f"{BASE_URL}/api/admin/audits/unknown", json={"notes": "x"})
        assert r.status_code == 404


class TestReanalyze:
    def test_reanalyze_returns_ok(self, admin_api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("no audit id")
        r = admin_api.post(f"{BASE_URL}/api/admin/audits/{aid}/reanalyze")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_reanalyze_404(self, admin_api):
        r = admin_api.post(f"{BASE_URL}/api/admin/audits/unknown/reanalyze")
        assert r.status_code == 404


# ===== Cleanup MUST run last =====
class TestZZZCleanup:
    def test_delete_audit(self, admin_api):
        aid = SHARED["audit_id"]
        if not aid:
            pytest.skip("nothing to delete")
        r = admin_api.delete(f"{BASE_URL}/api/admin/audits/{aid}")
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # verify GET 404
        g = admin_api.get(f"{BASE_URL}/api/admin/audits/{aid}")
        assert g.status_code == 404

    def test_delete_404(self, admin_api):
        r = admin_api.delete(f"{BASE_URL}/api/admin/audits/unknown-id-zzz")
        assert r.status_code == 404
