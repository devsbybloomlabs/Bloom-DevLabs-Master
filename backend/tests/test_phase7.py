"""Phase 7 backend tests: PayPal real creds, Blog, Onboarding, PayPal Plans, Role separation."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://coach-dashboard-86.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASSWORD = "clientpass123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def client_token():
    r = requests.post(f"{API}/clients/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD}, timeout=20)
    if r.status_code != 200:
        # create the client account
        requests.post(f"{API}/clients/register", json={
            "email": CLIENT_EMAIL,
            "password": CLIENT_PASSWORD,
            "name": "Test Client",
            "company": "Bloom Labs QA"
        }, timeout=20)
        r = requests.post(f"{API}/clients/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"client login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def client_headers(client_token):
    return {"Authorization": f"Bearer {client_token}"}


# ---------------- PayPal ----------------
class TestPayPal:
    def test_admin_health_ok(self, admin_headers):
        r = requests.get(f"{API}/paypal/admin/health", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, f"PayPal health not ok: {data}"

    def test_create_order_express(self):
        r = requests.post(f"{API}/paypal/orders", json={"tier": "express"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert data.get("status") == "CREATED"


# ---------------- Blog ----------------
class TestBlog:
    def test_public_list(self):
        r = requests.get(f"{API}/blog", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_public_hello_world(self):
        r = requests.get(f"{API}/blog/hello-world", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["slug"] == "hello-world"

    def test_admin_crud(self, admin_headers):
        unique = uuid.uuid4().hex[:8]
        slug = f"test-post-{unique}"
        # Create
        r = requests.post(f"{API}/admin/blog", headers=admin_headers, json={
            "title": f"Test Post {unique}",
            "slug": slug,
            "body": "# Hello\n\nThis is a test body.",
            "excerpt": "test excerpt",
            "published": False,
            "tags": ["test"],
        }, timeout=20)
        assert r.status_code == 200, r.text
        post = r.json()
        post_id = post["id"]
        assert post["slug"] == slug
        assert post["published"] is False

        # PATCH publish
        r = requests.patch(f"{API}/admin/blog/{post_id}", headers=admin_headers, json={"published": True}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["published"] is True

        # DELETE
        r = requests.delete(f"{API}/admin/blog/{post_id}", headers=admin_headers, timeout=20)
        assert r.status_code == 200

        # verify gone
        r = requests.get(f"{API}/admin/blog/{post_id}", headers=admin_headers, timeout=20)
        assert r.status_code == 404

    def test_ai_draft(self, admin_headers):
        r = requests.post(f"{API}/admin/blog/ai/draft", headers=admin_headers, json={
            "topic": "Why we ship in 3 weeks not 3 months",
            "target_length": "short",
        }, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("title", "slug", "excerpt", "body"):
            assert k in data, f"missing {k}"
        assert len(data["body"]) > 200


# ---------------- Public case studies ----------------
class TestPublicCaseStudies:
    def test_list(self):
        r = requests.get(f"{API}/public/case-studies", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for cs in data:
            assert cs.get("public") is True


# ---------------- Onboarding ----------------
PHASE1_PAYLOAD = {
    "design_links": [
        {"url": "https://stripe.com", "why": "clean structure"},
        {"url": "https://linear.app", "why": "minimalism"},
        {"url": "https://vercel.com", "why": "premium feel"},
    ],
    "color_preferences": "navy & off-white",
    "mood_keywords": "premium, sharp, calm",
}
PHASE2_PAYLOAD = {
    "function_links": [
        {"url": "https://notion.so", "why": "blocks"},
        {"url": "https://airtable.com", "why": "data grid"},
        {"url": "https://slack.com", "why": "messaging"},
    ],
    "additional_specs": "must support SSO",
}
PHASE3_PAYLOAD = {
    "project_name": "Bloom Test Project",
    "company_story": "We do X for Y customers.",
    "goals": "Increase conversion by 25%",
    "timeline_expectation": "6 weeks",
    "budget": "$50k",
    "success_scenarios": [
        {"description": "Sign-ups doubled", "metric": "1000/mo"},
        {"description": "Activation up", "metric": "60%"},
        {"description": "Churn down", "metric": "<3%"},
    ],
}


class TestOnboarding:
    @pytest.fixture(scope="class")
    def started(self, admin_headers):
        email = f"TEST_ob_{uuid.uuid4().hex[:8]}@bybloomlabs.com"
        r = requests.post(f"{API}/admin/onboarding/start", headers=admin_headers, json={
            "client_email": email,
            "client_name": "TEST Onboarding User",
        }, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "resume_url" in data
        token = data["onboarding"]["resume_token"]
        return {"email": email, "token": token, "id": data["onboarding"]["id"]}

    def test_get_by_token(self, started):
        r = requests.get(f"{API}/onboarding/by-token/{started['token']}", timeout=20)
        assert r.status_code == 200
        assert r.json()["client_email"] == started["email"].lower()

    def test_save_phase1_draft(self, started):
        r = requests.post(f"{API}/onboarding/by-token/{started['token']}/save",
                          json={"phase": 1, "payload": PHASE1_PAYLOAD}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["phase1"]["color_preferences"] == "navy & off-white"

    def test_submit_phase1_advances(self, started):
        r = requests.post(f"{API}/onboarding/by-token/{started['token']}/submit",
                          json={"phase": 1, "payload": PHASE1_PAYLOAD}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["current_phase"] == 2
        assert data.get("phase1_submitted_at") is not None
        # Nifty errors expected since NIFTY_ACCESS_TOKEN empty
        assert len(data.get("nifty_errors", [])) >= 1

    def test_submit_phase2_advances(self, started):
        r = requests.post(f"{API}/onboarding/by-token/{started['token']}/submit",
                          json={"phase": 2, "payload": PHASE2_PAYLOAD}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["current_phase"] == 3

    def test_submit_phase3_completes(self, started):
        r = requests.post(f"{API}/onboarding/by-token/{started['token']}/submit",
                          json={"phase": 3, "payload": PHASE3_PAYLOAD}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["completed"] is True
        # verify GET shows completed
        r2 = requests.get(f"{API}/onboarding/by-token/{started['token']}", timeout=20)
        assert r2.json()["completed"] is True

    def test_client_onboarding_endpoints(self, client_headers):
        r = requests.get(f"{API}/clients/me/onboarding", headers=client_headers, timeout=20)
        assert r.status_code == 200
        # resume_token should not be exposed
        assert "resume_token" not in r.json()

    def test_admin_list(self, admin_headers):
        r = requests.get(f"{API}/admin/onboarding", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_regenerate_link(self, started, admin_headers):
        r = requests.post(f"{API}/admin/onboarding/{started['id']}/regenerate-link",
                          headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert "resume_url" in r.json()
        # Old token should now be invalid
        r2 = requests.get(f"{API}/onboarding/by-token/{started['token']}", timeout=20)
        assert r2.status_code == 404

    def test_admin_replay_phase2(self, started, admin_headers):
        r = requests.post(f"{API}/admin/onboarding/{started['id']}/replay/2",
                          headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_admin_delete(self, started, admin_headers):
        r = requests.delete(f"{API}/admin/onboarding/{started['id']}",
                            headers=admin_headers, timeout=20)
        assert r.status_code == 200


# ---------------- Role separation ----------------
class TestRoleSeparation:
    def test_client_cannot_access_admin_onboarding(self, client_headers):
        r = requests.get(f"{API}/admin/onboarding", headers=client_headers, timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_client_cannot_access_admin_blog(self, client_headers):
        r = requests.get(f"{API}/admin/blog", headers=client_headers, timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ---------------- PayPal Plans ----------------
class TestPayPalPlans:
    def test_create_and_list_plan(self, admin_headers):
        unique = uuid.uuid4().hex[:6]
        r = requests.post(f"{API}/paypal/admin/plans", headers=admin_headers, json={
            "name": f"Server Management Tier 1 {unique}",
            "price": "199",
            "interval_unit": "MONTH",
            "interval_count": 1,
        }, timeout=60)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        plan = r.json()
        assert "id" in plan or "plan_id" in plan or "name" in plan

        r2 = requests.get(f"{API}/paypal/admin/plans", headers=admin_headers, timeout=30)
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)
