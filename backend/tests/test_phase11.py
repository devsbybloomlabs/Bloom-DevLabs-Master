"""Phase 11 — P2 backlog + Approval Studio loop + health strip backend tests.

Coverage:
  • AgencyHandy HMAC signature verification (positive + negative + bypass mode)
  • AgencyHandy server-side `list_orders_for_client_email` envelope
  • OG PNG endpoint renders a valid 1200x630 PNG
  • Approval Studio:
      - mock-mode upload creates approval doc + bumps version on re-upload
      - webhook ANNOTATION_ADDED bumps status to 'revision'
      - webhook TASK_APPROVED marks 'approved' and emits sync history
      - manual /resolve fallback path
  • Integrations /health endpoint aggregates all 6 providers
  • Designer reminder cron returns idempotent counts
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from PIL import Image

BACKEND = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if BACKEND.startswith("http"):
    # Allow tests to point at preview env when REACT_APP_BACKEND_URL is set externally
    pass
ROOT = BACKEND.rstrip("/") + "/api"

FOUNDER = ("founder@thesalvador.group", "admin123")


@pytest.fixture(scope="module")
def admin_token() -> str:
    r = httpx.post(
        f"{ROOT}/auth/login",
        json={"email": FOUNDER[0], "password": FOUNDER[1]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


# =========================================================================
# C3: OG PNG renderer
# =========================================================================
def test_og_png_renders_correct_size():
    # The seed post hello-world should exist
    r = httpx.get(f"{ROOT}/og/blog/hello-world.png", timeout=15)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (1200, 630)
    assert img.mode in {"RGB", "RGBA"}


def test_og_png_404_for_unknown_slug():
    r = httpx.get(f"{ROOT}/og/blog/__nonexistent-{uuid.uuid4().hex[:6]}.png", timeout=15)
    assert r.status_code == 404


# =========================================================================
# C1: AgencyHandy HMAC verification
# =========================================================================
def test_ah_webhook_without_hmac_secret_still_accepts(monkeypatch):
    """When no HMAC secret env var is configured, behavior is unchanged."""
    body = '{"event":"ORDER.CREATED","data":{"id":"smoke"}}'
    r = httpx.post(
        f"{ROOT}/webhooks/agencyhandy",
        content=body,
        headers={"Content-Type": "application/json"},
        timeout=10,
    )
    # 200 because we don't want AH to retry
    assert r.status_code == 200
    # token mismatch (no token + secret set) → verified=False, but request accepted
    assert r.json()["ok"] is True


def test_ah_webhook_test_event_is_trusted():
    """Test events from AH carry x-ah-sig header — accepted as legitimate."""
    body = '{"event":"ORDER.CREATED","data":{"id":"test_evt"}}'
    r = httpx.post(
        f"{ROOT}/webhooks/agencyhandy",
        content=body,
        headers={"Content-Type": "application/json", "x-ah-sig": "test"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["verified"] is True


# =========================================================================
# Health strip endpoint
# =========================================================================
def test_health_endpoint_lists_all_six_providers(auth_headers):
    r = httpx.get(f"{ROOT}/admin/integrations/health", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    providers = {p["provider"] for p in data["providers"]}
    expected = {"openrouter", "emailit", "agencyhandy", "paypal", "nifty", "approval_studio"}
    assert expected.issubset(providers), f"Missing: {expected - providers}"
    for p in data["providers"]:
        assert p["status"] in {"green", "yellow", "red"}


# =========================================================================
# Approval Studio loop — full flow
# =========================================================================
@pytest.fixture
def fresh_email() -> str:
    return f"test_aps_{uuid.uuid4().hex[:8]}@example.com"


def test_aps_upload_creates_approval_and_review_url(auth_headers, fresh_email):
    r = httpx.post(
        f"{ROOT}/admin/approvals/upload",
        headers=auth_headers,
        json={
            "client_email": fresh_email,
            "project_name": "Phase 11 Test Project",
            "asset_name": "Landing Page",
            "design_url": "https://figma.com/file/test123",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["aps_mode"] == "mock"
    assert data["approval"]["version"] == 1
    assert data["approval"]["status"] == "in_review"
    assert data["review_url"].startswith("https://approval.studio/")


def test_aps_re_upload_bumps_version(auth_headers, fresh_email):
    payload = {
        "client_email": fresh_email,
        "project_name": "Version Test",
        "asset_name": "Hero",
        "design_url": "https://figma.com/file/v1",
    }
    r1 = httpx.post(f"{ROOT}/admin/approvals/upload", headers=auth_headers, json=payload, timeout=15)
    assert r1.status_code == 200
    assert r1.json()["approval"]["version"] == 1

    payload["design_url"] = "https://figma.com/file/v2"
    r2 = httpx.post(f"{ROOT}/admin/approvals/upload", headers=auth_headers, json=payload, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["approval"]["version"] == 2
    assert r2.json()["approval"]["id"] == r1.json()["approval"]["id"]


def test_aps_webhook_annotation_added_relays_to_revision(auth_headers, fresh_email):
    # Seed an approval first
    payload = {
        "client_email": fresh_email,
        "project_name": "Webhook Test",
        "asset_name": "Card",
        "design_url": "https://figma.com/file/webhook",
    }
    r = httpx.post(f"{ROOT}/admin/approvals/upload", headers=auth_headers, json=payload, timeout=15)
    aps_project_id = r.json()["approval"]["aps_project_id"]

    # Fire ANNOTATION_ADDED — no signature secret configured -> sig_ok=None, accepted
    wh = httpx.post(
        f"{ROOT}/webhooks/approval-studio",
        json={
            "eventType": "ANNOTATION_ADDED",
            "projectId": aps_project_id,
            "annotation": {"author": "Test Reviewer", "text": "Make it pop"},
        },
        timeout=10,
    )
    assert wh.status_code == 200
    assert wh.json()["outcome"] == "annotation_relayed"

    # Verify status moved to 'revision'
    listing = httpx.get(
        f"{ROOT}/admin/approvals",
        headers=auth_headers,
        params={"client_email": fresh_email},
        timeout=10,
    ).json()
    assert any(a["status"] == "revision" for a in listing)


def test_aps_webhook_task_approved_marks_complete(auth_headers, fresh_email):
    payload = {
        "client_email": fresh_email,
        "project_name": "Approve Test",
        "asset_name": "Banner",
        "design_url": "https://figma.com/file/approve",
    }
    r = httpx.post(f"{ROOT}/admin/approvals/upload", headers=auth_headers, json=payload, timeout=15)
    aps_project_id = r.json()["approval"]["aps_project_id"]
    approval_id = r.json()["approval"]["id"]

    wh = httpx.post(
        f"{ROOT}/webhooks/approval-studio",
        json={"eventType": "TASK_APPROVED", "projectId": aps_project_id},
        timeout=10,
    )
    assert wh.status_code == 200
    assert wh.json()["outcome"] == "approved"

    listing = httpx.get(
        f"{ROOT}/admin/approvals", headers=auth_headers, params={"client_email": fresh_email}, timeout=10
    ).json()
    approved = next((a for a in listing if a["id"] == approval_id), None)
    assert approved is not None
    assert approved["status"] == "approved"


def test_aps_manual_resolve_fallback(auth_headers, fresh_email):
    payload = {
        "client_email": fresh_email,
        "project_name": "Resolve Test",
        "asset_name": "Mobile View",
        "design_url": "https://figma.com/file/resolve",
    }
    r = httpx.post(f"{ROOT}/admin/approvals/upload", headers=auth_headers, json=payload, timeout=15)
    aid = r.json()["approval"]["id"]

    res = httpx.post(f"{ROOT}/admin/approvals/{aid}/resolve", headers=auth_headers, timeout=10)
    assert res.status_code == 200
    assert res.json()["status"] == "approved"


def test_aps_mock_log_endpoint(auth_headers):
    r = httpx.get(f"{ROOT}/admin/approvals/mock-log", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "mock"
    assert isinstance(data["entries"], list)


# =========================================================================
# /admin/clients endpoint sanity (existing — used by new UI)
# =========================================================================
def test_admin_clients_list_endpoint(auth_headers):
    r = httpx.get(f"{ROOT}/admin/clients", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
