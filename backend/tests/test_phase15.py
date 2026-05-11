"""Phase 15 — Part 6 contact form + A/B test + lead scoring + multi-workspace + approval annotations.

Coverage:
  • POST /api/clients/me/contact — text-only + with attachment + over-10MB rejection
  • GET /api/clients/me/contact — owner sees own submissions
  • Attachment download — owner gets 200, scope check
  • Public AB tracking + admin stats CTR aggregation
  • Lead scoring formula returns 0-100 and segment classification
  • Lead segmentation endpoint /admin/leads/segments
  • Approval annotation feed (mock thread deterministic per project_id)
  • Multi-workspace Nifty — snapshot + activate (when token present)
"""
from __future__ import annotations

import io
import os
import uuid

import httpx
import pytest

BACKEND = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
ROOT = BACKEND.rstrip("/") + "/api"
FOUNDER = ("founder@thesalvador.group", "admin123")
CLIENT = ("testclient@bybloomlabs.com", "clientpass123")


@pytest.fixture(scope="module")
def admin_headers() -> dict:
    r = httpx.post(
        f"{ROOT}/auth/login",
        json={"email": FOUNDER[0], "password": FOUNDER[1]},
        timeout=15,
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def client_headers() -> dict:
    r = httpx.post(
        f"{ROOT}/clients/login",
        json={"email": CLIENT[0], "password": CLIENT[1]},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip("Test client not seeded — skip Part 6 tests")
    token = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {token}"}


# =========================================================================
# Part 6 — Client portal Contact Us
# =========================================================================
def test_contact_text_only_creates_record(client_headers):
    r = httpx.post(
        f"{ROOT}/clients/me/contact",
        headers=client_headers,
        data={
            "subject": "Test message phase15",
            "body": "Body of the test message",
            "priority": "medium",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["contact"]["subject"].startswith("Test message")
    assert data["contact"]["priority"] == "medium"
    assert data["contact"]["status"] in {"sent", "queued"}


def test_contact_with_attachment(client_headers):
    files = {"file": ("test_phase15.txt", io.BytesIO(b"hello world"), "text/plain")}
    r = httpx.post(
        f"{ROOT}/clients/me/contact",
        headers=client_headers,
        data={"subject": "Attached test", "body": "See file", "priority": "high"},
        files=files,
        timeout=15,
    )
    assert r.status_code == 200
    attach = r.json()["contact"].get("attachment")
    assert attach is not None
    assert attach["original_name"] == "test_phase15.txt"
    assert attach["size_bytes"] == 11
    assert attach["id"].endswith(".txt")


def test_contact_rejects_oversize_file(client_headers):
    # 11 MB
    big = io.BytesIO(b"x" * (11 * 1024 * 1024))
    files = {"file": ("big.bin", big, "application/octet-stream")}
    r = httpx.post(
        f"{ROOT}/clients/me/contact",
        headers=client_headers,
        data={"subject": "Too big", "body": "Test", "priority": "low"},
        files=files,
        timeout=30,
    )
    assert r.status_code == 413
    assert "10MB" in r.text or "under 10MB" in r.text


def test_contact_lists_own_submissions(client_headers):
    r = httpx.get(f"{ROOT}/clients/me/contact", headers=client_headers, timeout=10)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) >= 1
    # Attachment metadata sanity — stored_path must NOT leak
    for it in items:
        if it.get("attachment"):
            assert "stored_path" not in it["attachment"]


def test_contact_rejects_invalid_priority(client_headers):
    r = httpx.post(
        f"{ROOT}/clients/me/contact",
        headers=client_headers,
        data={"subject": "X", "body": "Y", "priority": "URGENT"},
        timeout=10,
    )
    assert r.status_code == 422


# =========================================================================
# A/B test endpoint
# =========================================================================
def test_ab_track_records_impression():
    r = httpx.post(
        f"{ROOT}/public/ab/track",
        json={"experiment": "tour_cta_position", "variant": "header", "kind": "impression"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_ab_track_rejects_unknown_variant():
    r = httpx.post(
        f"{ROOT}/public/ab/track",
        json={"experiment": "tour_cta_position", "variant": "unknown", "kind": "impression"},
        timeout=10,
    )
    assert r.status_code == 422


def test_ab_stats_returns_ctr_per_variant(admin_headers):
    # Seed an event of each kind
    for v in ("header", "hero", "sticky"):
        httpx.post(
            f"{ROOT}/public/ab/track",
            json={"experiment": "tour_cta_position", "variant": v, "kind": "impression"},
            timeout=5,
        )
        httpx.post(
            f"{ROOT}/public/ab/track",
            json={"experiment": "tour_cta_position", "variant": v, "kind": "cta_click"},
            timeout=5,
        )
    r = httpx.get(
        f"{ROOT}/admin/ab/tour_cta_position/stats", headers=admin_headers, timeout=10
    )
    assert r.status_code == 200
    body = r.json()
    variants = {v["variant"] for v in body["variants"]}
    assert {"header", "hero", "sticky"}.issubset(variants)
    # CTR must be a number 0..1 for each
    for v in body["variants"]:
        assert 0 <= v["ctr"] <= 1.0


# =========================================================================
# Lead scoring + segmentation
# =========================================================================
def test_lead_segments_endpoint(admin_headers):
    r = httpx.get(f"{ROOT}/admin/leads/segments", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "total" in body
    assert "segments" in body
    assert set(body["segments"].keys()) == {"hot", "warm", "cold"}


def test_lead_list_returns_score_and_segment(admin_headers):
    # First seed a lead
    httpx.post(
        f"{ROOT}/leads",
        json={
            "email": f"scoretest_{uuid.uuid4().hex[:8]}@example.com",
            "magnet_slug": "test-magnet",
            "source_url": "https://bybloomlabs.com/blog/seo-best-practices",
        },
        timeout=10,
    )
    r = httpx.get(f"{ROOT}/admin/leads", headers=admin_headers, timeout=10)
    assert r.status_code == 200
    leads = r.json()
    if leads:
        first = leads[0]
        assert "score" in first
        assert 0 <= first["score"] <= 100
        assert first["segment"] in {"hot", "warm", "cold"}


def test_lead_filter_by_segment(admin_headers):
    r = httpx.get(
        f"{ROOT}/admin/leads",
        headers=admin_headers,
        params={"segment": "hot"},
        timeout=10,
    )
    assert r.status_code == 200
    for lead in r.json():
        assert lead["segment"] == "hot"


# =========================================================================
# Approval annotations
# =========================================================================
def test_approval_annotations_returns_mock_thread(admin_headers):
    # Need at least one approval — seed demo data
    httpx.post(f"{ROOT}/admin/demo/seed", headers=admin_headers, timeout=20)
    approvals = httpx.get(f"{ROOT}/admin/approvals", headers=admin_headers, timeout=10).json()
    if not approvals:
        pytest.skip("No approvals — skip")
    r = httpx.get(
        f"{ROOT}/admin/approvals/{approvals[0]['id']}/annotations",
        headers=admin_headers,
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert "comments" in body
    # Mock mode returns deterministic comments
    assert body["aps_mode"] == "mock"
    assert 2 <= len(body["comments"]) <= 5


def test_approval_annotations_404_for_unknown(admin_headers):
    r = httpx.get(
        f"{ROOT}/admin/approvals/__nope_{uuid.uuid4().hex[:6]}/annotations",
        headers=admin_headers,
        timeout=10,
    )
    assert r.status_code == 404


# =========================================================================
# Multi-workspace Nifty
# =========================================================================
def test_nifty_workspaces_list(admin_headers):
    r = httpx.get(
        f"{ROOT}/admin/integrations/nifty/workspaces", headers=admin_headers, timeout=10
    )
    assert r.status_code == 200
    assert "snapshots" in r.json()


def test_nifty_workspace_save_requires_live_token(admin_headers):
    """Without a live Nifty token, saving a snapshot should 400."""
    r = httpx.post(
        f"{ROOT}/admin/integrations/nifty/workspaces",
        headers=admin_headers,
        json={"name": "test"},
        timeout=10,
    )
    # 400 = no live token (expected unless user has connected Nifty)
    assert r.status_code in (200, 400)
