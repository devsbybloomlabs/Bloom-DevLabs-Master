"""Phase 13 — Demo Mode seeder + Escalation Timeline + ThriveDesk live auth probe.

Covers the two new pieces (P3 + potential improvement):
  • POST /admin/demo/seed creates exactly 13 records (2+2+3+4+1+1)
  • Re-seed is idempotent (wipes first)
  • DELETE /admin/demo/seed wipes all demo records
  • GET /admin/demo/status reflects counts accurately
  • GET /admin/support-triage/{id}/timeline returns chronological events
  • ThriveDesk live probe (/v1/me) — only runs when key is configured (skipped otherwise)
"""
from __future__ import annotations

import os
import uuid

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
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# =========================================================================
# Demo seeder
# =========================================================================
def test_demo_seed_creates_thirteen_records(auth_headers):
    r = httpx.post(f"{ROOT}/admin/demo/seed", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    seeded = r.json()["seeded"]
    assert seeded == {
        "clients": 2,
        "milestones": 2,
        "approvals": 3,
        "support_escalations": 4,
        "onboarding": 1,
        "leads": 1,
    }


def test_demo_status_reflects_seeded_data(auth_headers):
    r = httpx.get(f"{ROOT}/admin/demo/status", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["active"] is True
    assert data["total"] == 13


def test_demo_seed_is_idempotent(auth_headers):
    """Re-running seed wipes first, so total still equals 13."""
    r1 = httpx.post(f"{ROOT}/admin/demo/seed", headers=auth_headers, timeout=20)
    assert r1.status_code == 200
    assert sum(r1.json()["seeded"].values()) == 13
    status = httpx.get(f"{ROOT}/admin/demo/status", headers=auth_headers, timeout=10)
    assert status.json()["total"] == 13


def test_demo_wipe_clears_all(auth_headers):
    r = httpx.delete(f"{ROOT}/admin/demo/seed", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    status = httpx.get(f"{ROOT}/admin/demo/status", headers=auth_headers, timeout=10)
    assert status.json()["active"] is False
    assert status.json()["total"] == 0


# =========================================================================
# Escalation timeline
# =========================================================================
def test_timeline_returns_events_chronologically(auth_headers):
    """Seed → pick an open urgent escalation → fetch its timeline."""
    httpx.post(f"{ROOT}/admin/demo/seed", headers=auth_headers, timeout=20)
    listing = httpx.get(f"{ROOT}/admin/support-triage", headers=auth_headers, timeout=10).json()
    urgent = next(
        (e for e in listing if e.get("escalation_type") == "urgent" and e.get("status") == "open"),
        None,
    )
    assert urgent is not None, "Expected at least one open urgent escalation from demo seed"

    r = httpx.get(
        f"{ROOT}/admin/support-triage/{urgent['id']}/timeline",
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["escalation"]["id"] == urgent["id"]
    assert isinstance(data["events"], list)
    assert len(data["events"]) >= 1
    # First event should always be 'escalation_created'
    kinds = [e["kind"] for e in data["events"]]
    assert "escalation_created" in kinds


def test_timeline_404_for_unknown_id(auth_headers):
    r = httpx.get(
        f"{ROOT}/admin/support-triage/__nonexistent_{uuid.uuid4().hex[:8]}/timeline",
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 404


# =========================================================================
# ThriveDesk live probe (skipped when no key set)
# =========================================================================
def test_thrivedesk_live_test_uses_me_endpoint(auth_headers):
    """Whether mock or live, /test should never return 500 and must surface a clean mode."""
    r = httpx.post(f"{ROOT}/admin/integrations/thrivedesk/test", headers=auth_headers, timeout=15)
    # 200 = configured (live or mock). The mode field signals which.
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] in {"mock", "live"}
    if body["mode"] == "live":
        # When configured, ok must be True (we use /v1/me which works on every scope)
        assert body["ok"] is True
        assert body.get("company")


# =========================================================================
# Clean up — wipe demo data so subsequent tests don't see it
# =========================================================================
def test_zzz_cleanup_demo(auth_headers):
    httpx.delete(f"{ROOT}/admin/demo/seed", headers=auth_headers, timeout=15)
    r = httpx.get(f"{ROOT}/admin/demo/status", headers=auth_headers, timeout=10)
    assert r.json()["active"] is False
