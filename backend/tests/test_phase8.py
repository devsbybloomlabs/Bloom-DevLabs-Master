"""Phase 8 backend tests — Lead magnets, blog RSS, OG SVG, Milestones, Nifty webhook.

Run:
  pytest /app/backend/tests/test_phase8.py -v --tb=short \
    --junitxml=/app/test_reports/pytest/phase8.xml
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASSWORD = "clientpass123"

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


# =====================================================
# 1. Lead magnets — admin CRUD + public + opt-in
# =====================================================
class TestLeadMagnets:
    magnet_id: str | None = None
    slug: str | None = None

    def test_admin_create_magnet(self, session: requests.Session, admin_token: str):
        slug = f"test-magnet-{uuid.uuid4().hex[:6]}"
        payload = {
            "title": "TEST Magnet",
            "slug": slug,
            "description": "Phase 8 test magnet",
            "cta_label": "Get it",
            "active": True,
            "asset_url": "https://bybloomlabs.com/test.pdf",
            "sequence_steps": [
                {"day_offset": 0, "subject": "Welcome", "body_markdown": "Hi {name}"},
                {"day_offset": 1, "subject": "Day 1", "body_markdown": "Day 1 body"},
            ],
        }
        r = session.post(
            f"{BASE_URL}/api/admin/lead-magnets",
            json=payload,
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["slug"] == slug
        assert len(data["sequence_steps"]) == 2
        TestLeadMagnets.magnet_id = data["id"]
        TestLeadMagnets.slug = slug

    def test_admin_list_magnets(self, session: requests.Session, admin_token: str):
        r = session.get(
            f"{BASE_URL}/api/admin/lead-magnets",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert any(m["id"] == TestLeadMagnets.magnet_id for m in r.json())

    def test_admin_patch_magnet(self, session: requests.Session, admin_token: str):
        r = session.patch(
            f"{BASE_URL}/api/admin/lead-magnets/{TestLeadMagnets.magnet_id}",
            json={"title": "TEST Magnet (updated)"},
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["title"] == "TEST Magnet (updated)"

    def test_public_get_magnet_hides_sequence(self, session: requests.Session):
        r = session.get(
            f"{BASE_URL}/api/leads/magnet/{TestLeadMagnets.slug}", timeout=TIMEOUT
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["slug"] == TestLeadMagnets.slug
        assert "sequence_steps" not in data

    def test_public_active_list(self, session: requests.Session):
        r = session.get(f"{BASE_URL}/api/leads/active", timeout=TIMEOUT)
        assert r.status_code == 200
        for m in r.json():
            assert "sequence_steps" not in m

    def test_public_get_inactive_404(self, session: requests.Session):
        r = session.get(
            f"{BASE_URL}/api/leads/magnet/nope-{uuid.uuid4().hex[:6]}",
            timeout=TIMEOUT,
        )
        assert r.status_code == 404

    def test_subscribe_founder_playbook(self, session: requests.Session):
        # Test against an existing magnet 'founder-playbook' per task
        email = f"lead-e2e-{uuid.uuid4().hex[:5]}@bybloomlabs.com"
        r = session.post(
            f"{BASE_URL}/api/leads/subscribe",
            json={"email": email, "magnet_slug": "founder-playbook"},
            timeout=TIMEOUT,
        )
        # founder-playbook may or may not exist; tolerate 404 but warn
        if r.status_code == 404:
            pytest.skip("founder-playbook magnet not present in DB")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "lead_id" in body
        # Idempotent on second call
        r2 = session.post(
            f"{BASE_URL}/api/leads/subscribe",
            json={"email": email, "magnet_slug": "founder-playbook"},
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        assert r2.json().get("already_subscribed") is True

    def test_subscribe_to_test_magnet(self, session: requests.Session, admin_token: str):
        email = f"lead-test-{uuid.uuid4().hex[:5]}@bybloomlabs.com"
        r = session.post(
            f"{BASE_URL}/api/leads/subscribe",
            json={"email": email, "magnet_slug": TestLeadMagnets.slug},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # Admin list leads + filter
        r2 = session.get(
            f"{BASE_URL}/api/admin/leads?magnet_id={TestLeadMagnets.magnet_id}",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r2.status_code == 200
        leads = r2.json()
        assert any(l["email"] == email for l in leads)
        # Verify next_step_idx advanced past step 0 (since step 0 fires immediately)
        ours = next(l for l in leads if l["email"] == email)
        assert ours["next_step_idx"] >= 1

    def test_drip_tick(self, session: requests.Session, admin_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/leads/drip-tick",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        body = r.json()
        assert "sent" in body and "failed" in body

    def test_unsubscribe(self, session: requests.Session, admin_token: str):
        email = f"lead-unsub-{uuid.uuid4().hex[:5]}@bybloomlabs.com"
        r = session.post(
            f"{BASE_URL}/api/leads/subscribe",
            json={"email": email, "magnet_slug": TestLeadMagnets.slug},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        lead_id = r.json()["lead_id"]
        r2 = session.get(
            f"{BASE_URL}/api/leads/unsubscribe?id={lead_id}", timeout=TIMEOUT
        )
        assert r2.status_code == 200
        assert r2.json()["ok"] is True

    def test_role_separation_client_blocked_on_admin_magnets(
        self, session: requests.Session, client_token: str
    ):
        r = session.get(
            f"{BASE_URL}/api/admin/lead-magnets",
            headers=admin_headers(client_token),
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)

    def test_zz_cleanup_magnet(self, session: requests.Session, admin_token: str):
        r = session.delete(
            f"{BASE_URL}/api/admin/lead-magnets/{TestLeadMagnets.magnet_id}",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200


# =====================================================
# 2. Blog RSS + OG SVG
# =====================================================
class TestBlogExtras:
    def test_rss_feed(self, session: requests.Session):
        r = session.get(f"{BASE_URL}/api/blog/rss.xml", timeout=TIMEOUT)
        assert r.status_code == 200
        assert "application/rss+xml" in r.headers.get("content-type", "")
        assert "<rss" in r.text
        assert "<item>" in r.text  # at least one published post

    def test_og_svg_existing(self, session: requests.Session):
        r = session.get(f"{BASE_URL}/api/og/blog/hello-world.svg", timeout=TIMEOUT)
        assert r.status_code == 200
        assert "image/svg+xml" in r.headers.get("content-type", "")
        assert "<svg" in r.text
        # Title should appear (case-insensitive — wrap could split)
        assert "hello" in r.text.lower() or "world" in r.text.lower()

    def test_og_svg_404(self, session: requests.Session):
        r = session.get(
            f"{BASE_URL}/api/og/blog/non-existent-{uuid.uuid4().hex[:6]}.svg",
            timeout=TIMEOUT,
        )
        assert r.status_code == 404


# =====================================================
# 3. Milestones — admin CRUD + client read + Nifty webhook
# =====================================================
class TestMilestones:
    ms_id: str | None = None

    def test_admin_create_milestone(self, session: requests.Session, admin_token: str):
        r = session.post(
            f"{BASE_URL}/api/admin/milestones",
            json={
                "client_email": CLIENT_EMAIL,
                "title": "Build Auth",
                "description": "Auth scaffolding",
                "status": "pending",
                "is_final_deliverable": False,
                "notify_client_on_complete": True,
            },
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["client_email"] == CLIENT_EMAIL
        assert data["title"] == "Build Auth"
        TestMilestones.ms_id = data["id"]

    def test_admin_list_milestones(self, session: requests.Session, admin_token: str):
        r = session.get(
            f"{BASE_URL}/api/admin/milestones",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert any(m["id"] == TestMilestones.ms_id for m in r.json())

    def test_client_sees_own_milestones(
        self, session: requests.Session, client_token: str
    ):
        r = session.get(
            f"{BASE_URL}/api/clients/me/milestones",
            headers={"Authorization": f"Bearer {client_token}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        items = r.json()
        assert any(m["id"] == TestMilestones.ms_id for m in items)

    def test_nifty_webhook_match_and_update(self, session: requests.Session, admin_token: str):
        # Send Nifty webhook → should match by Client_ID + title
        payload = {
            "event_type": "task.updated",
            "resource": {
                "id": "nifty-test-1",
                "name": "Build Auth",
                "status": "in_progress",
                "custom_fields": {"Client_ID": CLIENT_EMAIL},
            },
        }
        r = session.post(
            f"{BASE_URL}/api/webhooks/nifty", json=payload, timeout=TIMEOUT
        )
        assert r.status_code == 200, r.text
        assert r.json()["outcome"] == "updated"

        # Verify status updated
        time.sleep(0.5)
        r2 = session.get(
            f"{BASE_URL}/api/admin/milestones",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        ours = next(m for m in r2.json() if m["id"] == TestMilestones.ms_id)
        assert ours["status"] == "in_progress"

    def test_nifty_webhook_client_notes_appended(
        self, session: requests.Session, admin_token: str
    ):
        payload = {
            "event_type": "task.commented",
            "resource": {
                "id": "nifty-test-1",
                "name": "Build Auth",
                "status": "in_progress",
                "custom_fields": {"Client_ID": CLIENT_EMAIL},
                "comment": "Client Notes: please review the wireframes",
            },
        }
        r = session.post(
            f"{BASE_URL}/api/webhooks/nifty", json=payload, timeout=TIMEOUT
        )
        assert r.status_code == 200

        r2 = session.get(
            f"{BASE_URL}/api/admin/milestones",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        ours = next(m for m in r2.json() if m["id"] == TestMilestones.ms_id)
        notes = ours.get("notes") or []
        assert any("wireframes" in (n.get("text") or "") for n in notes)

    def test_nifty_webhook_complete_sets_completion(
        self, session: requests.Session, admin_token: str
    ):
        payload = {
            "event_type": "task.updated",
            "resource": {
                "id": "nifty-test-1",
                "name": "Build Auth",
                "status": "complete",
                "custom_fields": {"Client_ID": CLIENT_EMAIL, "Notify_Client": True},
            },
        }
        r = session.post(
            f"{BASE_URL}/api/webhooks/nifty", json=payload, timeout=TIMEOUT
        )
        assert r.status_code == 200
        assert r.json()["outcome"] == "updated"

        r2 = session.get(
            f"{BASE_URL}/api/admin/milestones",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        ours = next(m for m in r2.json() if m["id"] == TestMilestones.ms_id)
        assert ours["status"] == "complete"
        assert ours.get("completion_date")

    def test_nifty_webhook_no_match(self, session: requests.Session):
        payload = {
            "event_type": "task.updated",
            "resource": {
                "id": f"nifty-nomatch-{uuid.uuid4().hex[:6]}",
                "name": "Nonexistent Task XYZ",
                "status": "in_progress",
                "custom_fields": {"Client_ID": "ghost@example.com"},
            },
        }
        r = session.post(
            f"{BASE_URL}/api/webhooks/nifty", json=payload, timeout=TIMEOUT
        )
        assert r.status_code == 200
        assert r.json()["outcome"] == "no_match"

    def test_sync_history(self, session: requests.Session, admin_token: str):
        r = session.get(
            f"{BASE_URL}/api/admin/milestones/sync-history",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert "outcome" in items[0]

    def test_admin_patch_milestone_status(
        self, session: requests.Session, admin_token: str
    ):
        r = session.patch(
            f"{BASE_URL}/api/admin/milestones/{TestMilestones.ms_id}",
            json={"status": "pending"},
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_role_separation_client_blocked_on_admin_milestones(
        self, session: requests.Session, client_token: str
    ):
        r = session.get(
            f"{BASE_URL}/api/admin/milestones",
            headers={"Authorization": f"Bearer {client_token}"},
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)

    def test_zz_cleanup_milestone(self, session: requests.Session, admin_token: str):
        r = session.delete(
            f"{BASE_URL}/api/admin/milestones/{TestMilestones.ms_id}",
            headers=admin_headers(admin_token),
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
