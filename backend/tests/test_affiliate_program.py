"""Affiliate program end-to-end backend tests (Phase: Affiliate)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lead-pipeline-66.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"

CLIENT_ENROLLED_EMAIL = "testclient@bybloomlabs.com"
CLIENT_ENROLLED_PASSWORD = "clientpass123"
CLIENT_ENROLLED_CODE = "1iedova6mz44"

CLIENT_NEW_EMAIL = "demo@bybloomlabs.com"
CLIENT_NEW_PASSWORD = "BloomDemo2026!"


# ------------------- Auth fixtures -------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def enrolled_client_token():
    r = requests.post(f"{API}/clients/login", json={"email": CLIENT_ENROLLED_EMAIL, "password": CLIENT_ENROLLED_PASSWORD}, timeout=30)
    if r.status_code != 200:
        # fallback to /auth/login
        r = requests.post(f"{API}/auth/login", json={"email": CLIENT_ENROLLED_EMAIL, "password": CLIENT_ENROLLED_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"enrolled client login failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def new_client_token():
    r = requests.post(f"{API}/clients/login", json={"email": CLIENT_NEW_EMAIL, "password": CLIENT_NEW_PASSWORD}, timeout=30)
    if r.status_code != 200:
        r = requests.post(f"{API}/auth/login", json={"email": CLIENT_NEW_EMAIL, "password": CLIENT_NEW_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"new client login failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    return j.get("access_token") or j.get("token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"} if tok else {}


# ------------------- Enroll flow tests -------------------
class TestEnrollment:
    def test_enroll_without_auth_returns_401(self):
        r = requests.post(f"{API}/affiliate/enroll", json={
            "full_name": "X",
            "company_name": "Y",
            "relationship": "Current Bloom customer",
            "volume_expectation": "1-2 per year",
            "agreed_to_terms": True,
        }, timeout=30)
        assert r.status_code == 401, f"got {r.status_code} body={r.text[:200]}"

    def test_enroll_requires_terms(self, new_client_token):
        r = requests.post(f"{API}/affiliate/enroll", headers=_h(new_client_token), json={
            "full_name": "Demo",
            "company_name": "Demo Co",
            "relationship": "Current Bloom customer",
            "volume_expectation": "1-2 per year",
            "agreed_to_terms": False,
        }, timeout=30)
        assert r.status_code == 400

    def test_already_active_returns_unique_code(self, enrolled_client_token):
        r = requests.post(f"{API}/affiliate/enroll", headers=_h(enrolled_client_token), json={
            "full_name": "Test Client",
            "company_name": "Test Co",
            "relationship": "Current Bloom customer",
            "volume_expectation": "1-2 per year",
            "agreed_to_terms": True,
        }, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("status") == "already_active"
        assert data.get("unique_code") == CLIENT_ENROLLED_CODE


# ------------------- Verify tests -------------------
class TestVerify:
    def test_verify_invalid_token(self):
        r = requests.post(f"{API}/affiliate/verify", json={"token": "thisisaninvalidtoken1234567890"}, timeout=30)
        assert r.status_code == 400


# ------------------- Click tracking tests -------------------
class TestTrackClick:
    def test_track_invalid_code_no_leak(self):
        ip = f"10.20.{uuid.uuid4().int % 200}.{uuid.uuid4().int % 200}"
        r = requests.post(f"{API}/affiliate/track-click",
                          headers={"X-Forwarded-For": ip},
                          json={"code": "nope-not-real", "landing_path": "/"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("recorded") is False

    def test_track_valid_code_records(self):
        ip = f"10.30.{uuid.uuid4().int % 200}.{uuid.uuid4().int % 200}"
        r = requests.post(f"{API}/affiliate/track-click",
                          headers={"X-Forwarded-For": ip},
                          json={"code": CLIENT_ENROLLED_CODE, "landing_path": "/"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("recorded") is True

    def test_rate_limit_after_10(self):
        ip = f"10.40.{uuid.uuid4().int % 200}.{uuid.uuid4().int % 200}"
        results = []
        for _ in range(12):
            r = requests.post(f"{API}/affiliate/track-click",
                              headers={"X-Forwarded-For": ip},
                              json={"code": CLIENT_ENROLLED_CODE}, timeout=30)
            results.append(r.json())
        # At least one of the last 2 should be rate_limited
        rate_limited = [x for x in results if x.get("reason") == "rate_limited"]
        assert len(rate_limited) >= 1, f"expected rate_limited, got {results[-3:]}"


# ------------------- /me/* tests -------------------
class TestMeEndpoints:
    def test_status_not_enrolled_returns_200(self, new_client_token):
        r = requests.get(f"{API}/affiliate/me/status", headers=_h(new_client_token), timeout=30)
        assert r.status_code == 200
        assert r.json().get("enrolled") is False

    def test_status_enrolled(self, enrolled_client_token):
        r = requests.get(f"{API}/affiliate/me/status", headers=_h(enrolled_client_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("enrolled") is True
        assert data.get("unique_code") == CLIENT_ENROLLED_CODE
        assert data.get("status") == "active"

    def test_dashboard_requires_enrolled(self, new_client_token):
        r = requests.get(f"{API}/affiliate/me/dashboard", headers=_h(new_client_token), timeout=30)
        assert r.status_code == 404

    def test_dashboard_returns_stats(self, enrolled_client_token):
        r = requests.get(f"{API}/affiliate/me/dashboard", headers=_h(enrolled_client_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        stats = data.get("stats") or {}
        for k in ("total_clicks", "pending_referrals", "closed_won_count", "tier_pct"):
            assert k in stats, f"missing stat: {k}"
        assert "referral_url" in data

    def test_referrals_isolated(self, enrolled_client_token):
        r = requests.get(f"{API}/affiliate/me/referrals", headers=_h(enrolled_client_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # Get my id
        st = requests.get(f"{API}/affiliate/me/status", headers=_h(enrolled_client_token), timeout=30).json()
        my_id = st.get("id")
        for ref in rows:
            assert ref.get("affiliate_id") == my_id


# ------------------- Authorisation boundary tests -------------------
class TestAuthBoundaries:
    def test_founder_cannot_access_me_status(self, admin_token):
        r = requests.get(f"{API}/affiliate/me/status", headers=_h(admin_token), timeout=30)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_founder_cannot_access_me_dashboard(self, admin_token):
        r = requests.get(f"{API}/affiliate/me/dashboard", headers=_h(admin_token), timeout=30)
        assert r.status_code in (403, 404)
        # The implementation uses get_current_affiliate which raises 403 for non-client role
        assert r.status_code == 403

    def test_client_cannot_access_admin_affiliates(self, enrolled_client_token):
        r = requests.get(f"{API}/admin/affiliates", headers=_h(enrolled_client_token), timeout=30)
        assert r.status_code == 403

    def test_admin_can_list_affiliates(self, admin_token):
        r = requests.get(f"{API}/admin/affiliates", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ------------------- Self-referral guard -------------------
class TestSelfReferralAndAudits:
    def test_self_referral_blocked(self, enrolled_client_token):
        """Submitting audit with affiliate's own email + their ref code → no referral row."""
        # Count existing first
        before = requests.get(f"{API}/affiliate/me/referrals", headers=_h(enrolled_client_token), timeout=30).json()
        before_count = len(before)

        # Submit an audit with the affiliate's own email
        payload = {
            "customer_email": CLIENT_ENROLLED_EMAIL,
            "customer_name": "Self Referral",
            "customer_phone": "1234567890",
            "company_name": "SelfCo",
            "website_url": "https://example.com",
            "monthly_revenue": "10000",
            "primary_challenge": "test",
            "affiliate_ref": CLIENT_ENROLLED_CODE,
        }
        r = requests.post(f"{API}/audits", json=payload, timeout=30)
        # Audit may succeed or fail with validation; we don't care about audit, only the referral side-effect
        after = requests.get(f"{API}/affiliate/me/referrals", headers=_h(enrolled_client_token), timeout=30).json()
        assert len(after) == before_count, f"self-referral was created: before={before_count}, after={len(after)}"

    def test_bogus_affiliate_ref_does_not_crash(self):
        """Audit with absurd affiliate_ref values should not error out."""
        for bad in ["../etc/passwd", "' OR 1=1 --", "x" * 200, "<script>alert(1)</script>"]:
            payload = {
                "customer_email": f"test-{uuid.uuid4().hex[:8]}@example.com",
                "customer_name": "Bogus Ref",
                "customer_phone": "1234567890",
                "company_name": "BogusCo",
                "website_url": "https://example.com",
                "monthly_revenue": "10000",
                "primary_challenge": "test",
                "affiliate_ref": bad,
            }
            r = requests.post(f"{API}/audits", json=payload, timeout=30)
            # Should not 500
            assert r.status_code < 500, f"crashed on {bad!r}: {r.status_code} {r.text[:200]}"


# ------------------- Forged-role JWT abuse -------------------
class TestForgedTokens:
    def test_random_bearer_rejected(self):
        r = requests.get(f"{API}/affiliate/me/status",
                         headers={"Authorization": "Bearer not.a.real.jwt"}, timeout=30)
        assert r.status_code in (401, 403, 422)

    def test_empty_bearer_rejected(self):
        r = requests.get(f"{API}/affiliate/me/dashboard",
                         headers={"Authorization": "Bearer "}, timeout=30)
        assert r.status_code in (401, 403, 422)
