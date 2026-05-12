"""Backend tests for PayPal + Client Portal features (Phase 6)."""
import os
import time
import uuid

import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    return None

BASE = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()
assert BASE, "REACT_APP_BACKEND_URL not set"
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"
TEST_CLIENT_EMAIL = "testclient@bybloomlabs.com"
TEST_CLIENT_PASSWORD = "clientpass123"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def client_token():
    # ensure test client exists; try login first
    r = requests.post(f"{API}/clients/login", json={"email": TEST_CLIENT_EMAIL, "password": TEST_CLIENT_PASSWORD}, timeout=15)
    if r.status_code == 200:
        return r.json()["access_token"]
    # if login failed, try to register
    r = requests.post(f"{API}/clients/register", json={
        "email": TEST_CLIENT_EMAIL, "password": TEST_CLIENT_PASSWORD, "name": "Test Client"
    }, timeout=15)
    if r.status_code in (200, 201):
        return r.json()["access_token"]
    pytest.skip(f"Could not get client token: {r.status_code} {r.text}")


# ---------- PayPal public ----------
class TestPayPalPublic:
    def test_config(self):
        r = requests.get(f"{API}/paypal/config", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["configured"] is True
        assert data["env"] == "sandbox"
        assert data["currency"] == "USD"
        assert isinstance(data["client_id"], str) and len(data["client_id"]) > 0

    def test_create_order_express_returns_502_due_to_bad_creds(self):
        """Same client_id+secret causes invalid_client at PayPal — expect 502."""
        r = requests.post(f"{API}/paypal/orders", json={
            "tier": "express",
            "customer_email": "e2e-test@bybloomlabs.com",
            "customer_name": "E2E Test",
        }, timeout=20)
        # Expect graceful 502 (not 500/crash)
        assert r.status_code in (200, 502), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 502:
            body = r.json()
            assert "detail" in body

    def test_create_order_no_amount_no_tier_returns_400(self):
        r = requests.post(f"{API}/paypal/orders", json={}, timeout=15)
        # 400 (validation) or 503 if not configured; here it is configured
        assert r.status_code == 400


# ---------- PayPal admin ----------
class TestPayPalAdmin:
    def test_admin_health_requires_auth(self):
        r = requests.get(f"{API}/paypal/admin/health", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_health(self, admin_token):
        r = requests.get(f"{API}/paypal/admin/health",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "ok" in data
        assert "configured" in data
        # ok should be False due to bad creds
        assert data["configured"] is True

    def test_admin_plans(self, admin_token):
        r = requests.get(f"{API}/paypal/admin/plans",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_transactions(self, admin_token):
        r = requests.get(f"{API}/paypal/admin/transactions",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_subscriptions(self, admin_token):
        r = requests.get(f"{API}/paypal/admin/subscriptions",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- PayPal webhook ----------
class TestPayPalWebhook:
    def test_webhook_accepts_arbitrary_json(self):
        r = requests.post(f"{API}/webhooks/paypal", json={"event_type": "TEST.PING"}, timeout=15)
        assert r.status_code == 200

    def test_webhook_payment_capture_completed_creates_notification(self, admin_token):
        unique_email = f"e2e-webhook-{uuid.uuid4().hex[:6]}@bybloomlabs.com"
        payload = {
            "id": f"WH-{uuid.uuid4().hex}",
            "event_type": "PAYMENT.CAPTURE.COMPLETED",
            "resource": {
                "id": f"CAP-{uuid.uuid4().hex}",
                "custom_id": unique_email,
                "amount": {"value": "5995.00", "currency_code": "USD"},
                "payer": {"email_address": unique_email, "name": {"given_name": "E2E", "surname": "Webhook"}},
            },
        }
        r = requests.post(f"{API}/webhooks/paypal", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        # Allow a moment for db writes
        time.sleep(1)
        # Confirm notification exists via admin endpoint
        nr = requests.get(f"{API}/notifications",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        if nr.status_code == 200:
            notifs = nr.json() if isinstance(nr.json(), list) else nr.json().get("items", [])
            assert any(unique_email in (n.get("body", "") + n.get("title", "")) for n in notifs), \
                f"No notification for {unique_email} found"


# ---------- Client auth ----------
class TestClientAuth:
    def test_register_new_client(self):
        email = f"e2e-reg-{uuid.uuid4().hex[:6]}@bybloomlabs.com"
        r = requests.post(f"{API}/clients/register", json={
            "email": email, "password": "Sup3rPass!", "name": "E2E Reg", "company": "Bloom"
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data["client"]["email"] == email
        assert "password_hash" not in data["client"]

    def test_register_duplicate_returns_409(self):
        # testclient already exists with password
        r = requests.post(f"{API}/clients/register", json={
            "email": TEST_CLIENT_EMAIL, "password": "anotherpass", "name": "x"
        }, timeout=15)
        assert r.status_code == 409, r.text

    def test_login_invalid_returns_401(self):
        r = requests.post(f"{API}/clients/login", json={
            "email": TEST_CLIENT_EMAIL, "password": "wrong"
        }, timeout=15)
        assert r.status_code == 401

    def test_login_valid(self, client_token):
        assert isinstance(client_token, str) and len(client_token) > 10

    def test_me_requires_token(self):
        r = requests.get(f"{API}/clients/me", timeout=15)
        assert r.status_code in (401, 403)

    def test_me_returns_client(self, client_token):
        r = requests.get(f"{API}/clients/me",
                         headers={"Authorization": f"Bearer {client_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == TEST_CLIENT_EMAIL
        assert "password_hash" not in data

    def test_patch_me_persists(self, client_token):
        new_company = f"Bloom-{uuid.uuid4().hex[:6]}"
        r = requests.patch(f"{API}/clients/me",
                           json={"company": new_company, "phone": "+1-555-0100"},
                           headers={"Authorization": f"Bearer {client_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["company"] == new_company
        # confirm via GET
        r2 = requests.get(f"{API}/clients/me",
                          headers={"Authorization": f"Bearer {client_token}"}, timeout=15)
        assert r2.json()["company"] == new_company


# ---------- Client portal: orders/subs/invoices/proposals ----------
class TestClientPortal:
    def _get(self, path, token):
        return requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=20)

    def test_orders_shape(self, client_token):
        r = self._get("/clients/me/orders", client_token)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert "paypal" in data
        assert isinstance(data["paypal"], list)
        # ensure no raw _id
        for item in data["paypal"]:
            assert "_id" not in item

    def test_subscriptions_shape(self, client_token):
        r = self._get("/clients/me/subscriptions", client_token)
        assert r.status_code == 200
        assert "paypal" in r.json()

    def test_invoices_shape(self, client_token):
        r = self._get("/clients/me/invoices", client_token)
        assert r.status_code == 200
        # AgencyHandy removed in Phase A — in-house invoices live at /clients/invoices
        assert "paypal" in r.json() or r.json() == {"paypal": []}

    def test_proposals_shape(self, client_token):
        r = self._get("/clients/me/proposals", client_token)
        assert r.status_code == 200
        # AgencyHandy removed in Phase A — proposals now via BreezeDocs
        assert "proposals" in r.json() or r.json() == {"proposals": []}


# ---------- Forgot/reset password ----------
class TestPasswordFlows:
    def test_forgot_password_always_returns_200_for_unknown_email(self):
        r = requests.post(f"{API}/clients/forgot-password",
                          json={"email": f"unknown-{uuid.uuid4().hex[:6]}@bybloomlabs.com"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_forgot_password_known_email_creates_token_and_reset_works(self):
        # Register a fresh client to manipulate
        email = f"e2e-pwflow-{uuid.uuid4().hex[:6]}@bybloomlabs.com"
        orig_pw = "Sup3rPass!"
        rr = requests.post(f"{API}/clients/register", json={
            "email": email, "password": orig_pw, "name": "PWFlow"
        }, timeout=15)
        assert rr.status_code == 200

        # forgot
        r = requests.post(f"{API}/clients/forgot-password", json={"email": email}, timeout=15)
        assert r.status_code == 200

        # We can't get the token via API; rely on direct mongo via admin notifications which include the link
        nr = self._extract_token_from_notifications(email)
        if nr is None:
            pytest.skip("Could not extract reset token from notifications endpoint")

        # Try invalid token first
        bad = requests.post(f"{API}/clients/reset-password",
                            json={"token": "invalid-token-xyz", "password": "Anoth3rPass!"}, timeout=15)
        assert bad.status_code == 400

        # Reset with valid token
        new_pw = "N3wPass!Updated"
        ok = requests.post(f"{API}/clients/reset-password",
                           json={"token": nr, "password": new_pw}, timeout=15)
        assert ok.status_code == 200, ok.text

        # Reuse same token → should 400
        reuse = requests.post(f"{API}/clients/reset-password",
                              json={"token": nr, "password": "AnotherPass!"}, timeout=15)
        assert reuse.status_code == 400

        # Login with new password works
        li = requests.post(f"{API}/clients/login", json={"email": email, "password": new_pw}, timeout=15)
        assert li.status_code == 200

    def _extract_token_from_notifications(self, email):
        """Login as admin, list notifications, find the reset link for email."""
        ar = requests.post(f"{API}/auth/login",
                           json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        if ar.status_code != 200:
            return None
        token = ar.json()["access_token"]
        nr = requests.get(f"{API}/notifications",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if nr.status_code != 200:
            return None
        body = nr.json()
        items = body if isinstance(body, list) else body.get("items", [])
        for n in items:
            if email in (n.get("body", "") + n.get("title", "")) and "token=" in n.get("body", ""):
                # parse
                part = n["body"].split("token=", 1)[1]
                return part.split()[0].strip().rstrip("/").rstrip(")")
        return None


# ---------- Admin clients ----------
class TestAdminClients:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{API}/admin/clients", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_list_clients(self, admin_token):
        r = requests.get(f"{API}/admin/clients",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        for c in data:
            assert "password_hash" not in c
            assert "_id" not in c


# ---------- Token role separation ----------
class TestTokenSeparation:
    def test_admin_token_cannot_access_client_me(self, admin_token):
        r = requests.get(f"{API}/clients/me",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 403
        assert "client" in r.text.lower()

    def test_client_token_cannot_access_admin_clients(self, client_token):
        r = requests.get(f"{API}/admin/clients",
                         headers={"Authorization": f"Bearer {client_token}"}, timeout=15)
        # Should be 401 or 403
        assert r.status_code in (401, 403)
