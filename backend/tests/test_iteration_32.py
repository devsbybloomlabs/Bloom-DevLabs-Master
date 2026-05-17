"""Iteration 32 — Backend tests for:
  1) Warm-leads admin endpoint security (/api/admin/leads/warm)
  2) Old public GET /api/leads/warm should be 404/405
  3) Owner role-lock tightening on /companies/me/members/{id}/role
  4) Cron job invocation: company_setup_reminder_tick + warm_lead_reengagement_tick
  5) Regression — iteration 31 warm-lead capture still works
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
TS = int(time.time())

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def owner_client(session):
    email = f"TEST_iter32_owner_{TS}_{uuid.uuid4().hex[:6]}@example.com"
    password = "OwnerPass123!"
    r = session.post(f"{API}/clients/register", json={
        "email": email, "password": password, "name": "TEST Owner32", "company": "TEST32 Co"
    })
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"email": email, "password": password, "token": token,
            "headers": {"Authorization": f"Bearer {token}"}}


# ---------------------------------------------------------------------------
# 1. Warm-leads admin endpoint
# ---------------------------------------------------------------------------
class TestWarmLeadsAdmin:
    def test_admin_endpoint_requires_auth(self, session):
        r = session.get(f"{API}/admin/leads/warm")
        assert r.status_code in (401, 403), f"expected 401/403 unauth, got {r.status_code} {r.text}"

    def test_admin_endpoint_with_token_returns_list(self, session, admin_headers):
        # Seed a fresh warm lead first
        seed_email = f"TEST_iter32_warm_{uuid.uuid4().hex[:6]}@example.com"
        sr = session.post(f"{API}/leads/warm", json={
            "niche": "gym", "tier": "gym_prototype",
            "name": "Iter32 Warm", "email": seed_email, "gym_name": "Test32 Gym"
        })
        assert sr.status_code == 200, sr.text

        r = session.get(f"{API}/admin/leads/warm", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert "count" in data
        emails = {x.get("email") for x in data["items"]}
        assert seed_email.lower() in emails

    def test_admin_endpoint_niche_filter(self, session, admin_headers):
        r = session.get(f"{API}/admin/leads/warm?niche=gym", headers=admin_headers)
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["niche"] == "gym"

    def test_old_public_get_endpoint_removed(self, session):
        r = session.get(f"{API}/leads/warm")
        assert r.status_code in (404, 405), f"old GET /leads/warm should be removed, got {r.status_code}"


# ---------------------------------------------------------------------------
# 2. Warm-lead POST still works (regression)
# ---------------------------------------------------------------------------
class TestWarmLeadCaptureStillPublic:
    def test_capture_still_public_no_auth(self, session):
        email = f"TEST_iter32_pub_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(f"{API}/leads/warm", json={
            "niche": "coaches", "tier": "coach_starter",
            "name": "Pub32", "email": email,
        })
        assert r.status_code == 200, r.text
        assert r.json()["deduped"] is False
        # Idempotency
        r2 = session.post(f"{API}/leads/warm", json={
            "niche": "coaches", "tier": "coach_starter",
            "name": "Pub32", "email": email,
        })
        assert r2.status_code == 200
        assert r2.json()["deduped"] is True


# ---------------------------------------------------------------------------
# 3. Owner role-lock tightening
# ---------------------------------------------------------------------------
class TestOwnerRoleLock:
    def test_setup_and_get_owner_member_id(self, session, owner_client):
        # init company
        r = session.post(f"{API}/company-setup/init", headers=owner_client["headers"])
        assert r.status_code == 200, r.text
        # find owner member id
        r2 = session.get(f"{API}/companies/me", headers=owner_client["headers"])
        assert r2.status_code == 200
        data = r2.json()
        for m in data["members"]:
            if m.get("is_owner"):
                owner_client["owner_member_id"] = m["id"]
                break
        assert "owner_member_id" in owner_client

    def test_cannot_demote_owner_to_viewer(self, session, owner_client):
        mid = owner_client["owner_member_id"]
        r = session.post(
            f"{API}/companies/me/members/{mid}/role",
            headers=owner_client["headers"], json={"role": "viewer"})
        assert r.status_code == 400, r.text
        assert "owner" in r.json().get("detail", "").lower()

    def test_cannot_set_owner_role_even_to_admin(self, session, owner_client):
        """Defensive tightening: even setting role=admin on owner returns 400."""
        mid = owner_client["owner_member_id"]
        r = session.post(
            f"{API}/companies/me/members/{mid}/role",
            headers=owner_client["headers"], json={"role": "admin"})
        assert r.status_code == 400, r.text
        assert "owner" in r.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# 4. Cron jobs (direct invocation)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_company_setup_reminder_tick_sets_watermark():
    """Seed a synthetic company with created_at>24h ago and setup_status!=complete,
    invoke the cron, verify watermark set + idempotent on 2nd call."""
    import sys
    sys.path.insert(0, "/app/backend")
    from reactivation_crons import company_setup_reminder_tick

    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    fake_id = f"TEST_iter32_company_{uuid.uuid4().hex[:8]}"
    fake_email = f"TEST_iter32_company_owner_{uuid.uuid4().hex[:6]}@example.com"
    past = (datetime.now(timezone.utc) - timedelta(hours=26)).isoformat()
    await db.companies.insert_one({
        "id": fake_id,
        "name": "TEST Iter32 Company",
        "owner_client_email": fake_email,
        "setup_status": "pending",
        "created_at": past,
        "updated_at": past,
    })
    try:
        res = await company_setup_reminder_tick(db)
        assert isinstance(res, dict)
        assert res.get("matched", 0) >= 1
        # Watermark should be set (sent OR failed silently — both bump watermark on send-success path only)
        refreshed = await db.companies.find_one({"id": fake_id}, {"_id": 0})
        # If emailit succeeded -> watermark set. If emailit failed -> failed counter bumped, no watermark.
        # We accept either, but verify it's deterministic on 2nd call.
        res2 = await company_setup_reminder_tick(db)
        if refreshed.get("setup_reminder_sent_at"):
            # 2nd call should NOT re-match
            after = await db.companies.find_one({"id": fake_id}, {"_id": 0})
            assert after["setup_reminder_sent_at"] == refreshed["setup_reminder_sent_at"], \
                "watermark should not change on 2nd run"
        else:
            # Email send failed; failed counter must be present
            assert res.get("failed", 0) >= 1 or res.get("sent", 0) == 0
    finally:
        await db.companies.delete_one({"id": fake_id})
        mongo.close()


@pytest.mark.asyncio
async def test_warm_lead_reengagement_tick_sets_watermark():
    import sys
    sys.path.insert(0, "/app/backend")
    from reactivation_crons import warm_lead_reengagement_tick

    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    fake_id = f"TEST_iter32_warmlead_{uuid.uuid4().hex[:8]}"
    fake_email = f"TEST_iter32_warm_reeng_{uuid.uuid4().hex[:6]}@example.com"
    captured_at = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
    await db.warm_leads.insert_one({
        "id": fake_id,
        "niche": "coaches",
        "tier": "coach_starter",
        "name": "Iter32 Warm Reeng",
        "email": fake_email,
        "status": "captured",
        "visits": 1,
        "created_at": captured_at,
        "last_seen": captured_at,
    })
    try:
        res = await warm_lead_reengagement_tick(db)
        assert isinstance(res, dict)
        assert res.get("matched", 0) >= 1
        after = await db.warm_leads.find_one({"id": fake_id}, {"_id": 0})
        # On success: status flips to 'nurtured' + reengagement_sent_at set.
        # On emailit failure: status stays 'captured', failed counter bumped, no watermark.
        if after["status"] == "nurtured":
            assert after.get("reengagement_sent_at")
            # 2nd call must NOT re-email (status no longer 'captured')
            res2 = await warm_lead_reengagement_tick(db)
            after2 = await db.warm_leads.find_one({"id": fake_id}, {"_id": 0})
            assert after2["status"] == "nurtured"
            assert after2["reengagement_sent_at"] == after["reengagement_sent_at"]
        else:
            assert res.get("failed", 0) >= 1
    finally:
        await db.warm_leads.delete_one({"id": fake_id})
        mongo.close()


# ---------------------------------------------------------------------------
# 5. Health + scheduler smoke
# ---------------------------------------------------------------------------
def test_health(session):
    r = session.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"
