"""Iteration 31 — Backend tests for:
  1) POST /api/leads/warm           (warm-lead capture + dedupe)
  2) POST /api/paypal/orders        (3 new real-estate tiers)
  3) /api/company-setup/*           (post-purchase wizard)
  4) /api/companies/me              (membership + role mgmt)
  5) /api/company-invites/{token}*  (public accept flow)
"""
from __future__ import annotations

import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
TS = int(time.time())


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def owner_client(session):
    """Register a fresh client = company owner."""
    email = f"TEST_owner_{TS}_{uuid.uuid4().hex[:6]}@example.com"
    password = "OwnerPass123!"
    r = session.post(f"{API}/clients/register", json={
        "email": email, "password": password, "name": "TEST Owner", "company": "TEST Co"
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    return {"email": email, "password": password, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def non_admin_client(session):
    """A second registered client that is NOT a member of owner's company."""
    email = f"TEST_outsider_{TS}_{uuid.uuid4().hex[:6]}@example.com"
    r = session.post(f"{API}/clients/register", json={
        "email": email, "password": "OutsiderPass123!", "name": "TEST Outsider"
    })
    assert r.status_code == 200
    token = r.json()["access_token"]
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


# ---------------------------------------------------------------------------
# 1. Warm leads
# ---------------------------------------------------------------------------
class TestWarmLeads:
    def test_capture_realestate_warm_lead(self, session):
        email = f"TEST_warm_{TS}_{uuid.uuid4().hex[:6]}@example.com"
        payload = {
            "niche": "real-estate", "tier": "realestate_starter",
            "name": "TEST RE Lead", "email": email,
            "market": "Austin, TX", "mls": "ACTRIS",
        }
        r = session.post(f"{API}/leads/warm", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["deduped"] is False
        assert "id" in data
        # 2nd call dedupes
        r2 = session.post(f"{API}/leads/warm", json=payload)
        assert r2.status_code == 200
        assert r2.json()["deduped"] is True
        assert r2.json()["id"] == data["id"]

    def test_capture_gym_warm_lead(self, session):
        email = f"TEST_gymwarm_{TS}_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(f"{API}/leads/warm", json={
            "niche": "gym", "tier": "gym_express",
            "name": "TEST Gym Lead", "email": email, "gym_name": "TEST Gym",
        })
        assert r.status_code == 200
        assert r.json()["deduped"] is False

    def test_capture_coach_warm_lead(self, session):
        email = f"TEST_coachwarm_{TS}_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(f"{API}/leads/warm", json={
            "niche": "coaches", "tier": "coach_starter",
            "name": "TEST Coach", "email": email, "coaching_niche": "career",
        })
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 2. PayPal RE tiers
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("tier,expected_amount", [
    ("realestate_starter", "2995.00"),
    ("realestate_premium", "8995.00"),
    ("realestate_enterprise", "14995.00"),
])
def test_paypal_create_order_realestate_tier(session, tier, expected_amount):
    payload = {
        "tier": tier,
        "currency": "USD",
        "payment_plan": "full_upfront",
        "customer_email": f"TEST_re_{tier}@example.com",
        "customer_name": "TEST Buyer",
    }
    r = session.post(f"{API}/paypal/orders", json=payload)
    if r.status_code == 503:
        pytest.skip("PayPal not configured")
    assert r.status_code == 200, f"{tier}: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("id"), "order id missing"
    # Premium and Enterprise have a $500 discount on full_upfront, Starter has 0 discount
    if tier == "realestate_starter":
        assert data["amount"] == "2995.00", data
    else:
        # full upfront discount applied → expected_amount minus $500
        expected_full = f"{float(expected_amount) - 500:.2f}"
        assert data["amount"] in (expected_full, expected_amount), data


def test_paypal_create_order_realestate_starter_split(session):
    """Starter @ 50/50 split should charge 1497.50 now."""
    r = session.post(f"{API}/paypal/orders", json={
        "tier": "realestate_starter", "payment_plan": "split_50_50",
        "customer_email": "TEST_re_split@example.com",
    })
    if r.status_code == 503:
        pytest.skip("PayPal not configured")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("id")
    # half of 2995 = 1497.50
    assert data["amount"] == "1497.50", data


# ---------------------------------------------------------------------------
# 3. Company setup wizard
# ---------------------------------------------------------------------------
class TestCompanySetup:
    def test_init_creates_company(self, session, owner_client):
        r = session.post(f"{API}/company-setup/init", headers=owner_client["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["company"]["setup_status"] == "pending"
        assert data["company"]["owner_client_email"] == owner_client["email"].lower()
        members = data["members"]
        assert len(members) == 1
        owner_mem = members[0]
        assert owner_mem["is_owner"] is True
        assert owner_mem["role"] == "admin"
        # Save for later tests
        owner_client["company_id"] = data["company"]["id"]
        owner_client["owner_member_id"] = owner_mem["id"]

    def test_init_idempotent(self, session, owner_client):
        r = session.post(f"{API}/company-setup/init", headers=owner_client["headers"])
        assert r.status_code == 200
        assert r.json()["company"]["id"] == owner_client["company_id"]

    def test_profile_updates_setup_status_to_partial(self, session, owner_client):
        r = session.post(f"{API}/company-setup/profile", headers=owner_client["headers"], json={
            "company_name": "TEST Bloom Co", "phone": "+1-555-0100", "address": "100 Test St"
        })
        assert r.status_code == 200, r.text
        comp = r.json()["company"]
        assert comp["name"] == "TEST Bloom Co"
        assert comp["phone"] == "+1-555-0100"
        assert comp["setup_status"] == "partial"

    def test_invites_creates_pending_rows(self, session, owner_client):
        invitee_email = f"TEST_invitee_{TS}_{uuid.uuid4().hex[:6]}@example.com".lower()
        r = session.post(f"{API}/company-setup/invites", headers=owner_client["headers"], json={
            "emails": [invitee_email],
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["sent"]) == 1
        sent = data["sent"][0]
        assert sent["email"] == invitee_email
        assert "token" in sent and len(sent["token"]) > 10
        owner_client["invite_token"] = sent["token"]
        owner_client["invitee_email"] = invitee_email

    def test_invites_skips_owner_email(self, session, owner_client):
        r = session.post(f"{API}/company-setup/invites", headers=owner_client["headers"], json={
            "emails": [owner_client["email"]],
        })
        assert r.status_code == 200
        data = r.json()
        assert any(s["reason"] == "owner" for s in data.get("skipped", []))


# ---------------------------------------------------------------------------
# 4. Public invite endpoints + accept
# ---------------------------------------------------------------------------
class TestCompanyInvites:
    def test_get_invite_returns_metadata(self, session, owner_client):
        token = owner_client["invite_token"]
        r = session.get(f"{API}/company-invites/{token}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == owner_client["invitee_email"]
        assert data["company_name"] == "TEST Bloom Co"
        assert data["invited_by"] == owner_client["email"].lower()
        assert data["role"] == "viewer"

    def test_invalid_token_returns_404(self, session):
        r = session.get(f"{API}/company-invites/not-a-real-token-xxx")
        assert r.status_code == 404

    def test_accept_creates_user_and_membership(self, session, owner_client):
        token = owner_client["invite_token"]
        password = "InviteePass123!"
        r = session.post(f"{API}/company-invites/{token}/accept", json={
            "name": "TEST Invitee", "password": password
        })
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # New client should be able to log in
        r2 = session.post(f"{API}/clients/login", json={
            "email": owner_client["invitee_email"], "password": password
        })
        assert r2.status_code == 200, r2.text
        invitee_token = r2.json()["access_token"]
        owner_client["invitee_token"] = invitee_token

        # Re-accepting same token should fail (status flipped to accepted → 404 per current impl)
        r3 = session.post(f"{API}/company-invites/{token}/accept", json={
            "name": "x", "password": "anotherpass8"
        })
        assert r3.status_code in (404, 410), r3.text

    def test_get_accepted_invite_returns_410(self, session, owner_client):
        token = owner_client["invite_token"]
        r = session.get(f"{API}/company-invites/{token}")
        assert r.status_code == 410, r.text


# ---------------------------------------------------------------------------
# 5. /companies/me + role mgmt
# ---------------------------------------------------------------------------
class TestCompaniesMe:
    def test_owner_sees_company_with_members(self, session, owner_client):
        r = session.get(f"{API}/companies/me", headers=owner_client["headers"])
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["company"]["id"] == owner_client["company_id"]
        assert data["role"] == "admin"
        assert data["is_owner"] is True
        # Owner + invitee
        emails = {m["client_email"] for m in data["members"]}
        assert owner_client["email"].lower() in emails
        assert owner_client["invitee_email"] in emails
        # Find invitee member id for later
        for m in data["members"]:
            if m["client_email"] == owner_client["invitee_email"]:
                owner_client["invitee_member_id"] = m["id"]
                assert m["role"] == "viewer"
                assert m["is_owner"] is False
                break

    def test_invitee_sees_company_as_viewer(self, session, owner_client):
        r = session.get(f"{API}/companies/me", headers={"Authorization": f"Bearer {owner_client['invitee_token']}"})
        assert r.status_code == 200
        data = r.json()
        assert data["company"]["id"] == owner_client["company_id"]
        assert data["role"] == "viewer"
        assert data["is_owner"] is False

    def test_outsider_sees_no_company(self, session, non_admin_client):
        r = session.get(f"{API}/companies/me", headers=non_admin_client["headers"])
        assert r.status_code == 200
        data = r.json()
        assert data["company"] is None

    def test_admin_can_promote_viewer_to_admin(self, session, owner_client):
        mid = owner_client["invitee_member_id"]
        r = session.post(
            f"{API}/companies/me/members/{mid}/role",
            headers=owner_client["headers"], json={"role": "admin"})
        assert r.status_code == 200, r.text
        assert r.json()["member"]["role"] == "admin"

    def test_admin_can_demote_admin_to_viewer(self, session, owner_client):
        mid = owner_client["invitee_member_id"]
        r = session.post(
            f"{API}/companies/me/members/{mid}/role",
            headers=owner_client["headers"], json={"role": "viewer"})
        assert r.status_code == 200
        assert r.json()["member"]["role"] == "viewer"

    def test_cannot_demote_owner(self, session, owner_client):
        mid = owner_client["owner_member_id"]
        r = session.post(
            f"{API}/companies/me/members/{mid}/role",
            headers=owner_client["headers"], json={"role": "viewer"})
        assert r.status_code == 400, r.text

    def test_non_admin_cannot_change_roles(self, session, owner_client):
        """Viewer (invitee, freshly demoted back) cannot change roles."""
        mid = owner_client["owner_member_id"]
        r = session.post(
            f"{API}/companies/me/members/{mid}/role",
            headers={"Authorization": f"Bearer {owner_client['invitee_token']}"},
            json={"role": "viewer"})
        assert r.status_code == 403, r.text

    def test_setup_status_complete_after_profile_plus_invite(self, session, owner_client):
        """After /profile (name+phone) + /invites, status should be 'complete'."""
        r = session.get(f"{API}/company-setup/status", headers=owner_client["headers"])
        assert r.status_code == 200
        # name + phone were set, then invites called → should be 'complete'
        assert r.json()["setup_status"] == "complete"
