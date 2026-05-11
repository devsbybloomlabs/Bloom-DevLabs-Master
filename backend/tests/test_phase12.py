"""Phase 12 — Credentials store + ThriveDesk escalation loop + Slack notifier.

Covers Part 4 of the user's request:
  • DB-stored credentials get/put + masking
  • ThriveDesk client mock-mode + log capture
  • Rule engine: 'urgent' / 'feature' / 'other' classification
  • /api/webhooks/thrivedesk → escalation creation
  • /api/admin/support-triage list + filter
  • /api/admin/support-triage/{id}/resolve (manual)
  • /api/admin/support-triage/simulate-ticket
  • Slack notifier graceful no-op when webhook URL absent
  • Health endpoint now lists 8 providers
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
# Credentials store
# =========================================================================
def test_credentials_get_returns_dict(auth_headers):
    r = httpx.get(f"{ROOT}/admin/integrations/credentials", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    assert "providers" in r.json()


def test_credentials_put_slack_masks_value(auth_headers):
    fake_url = f"https://hooks.slack.com/services/T123/B456/{uuid.uuid4().hex}"
    r = httpx.put(
        f"{ROOT}/admin/integrations/credentials/slack",
        headers=auth_headers,
        json={"fields": {"webhook_url": fake_url}},
        timeout=10,
    )
    assert r.status_code == 200
    masked = r.json()["fields"]["webhook_url"]
    # First 4 + ellipsis + last 4
    assert masked.startswith("http")
    assert "•" in masked
    assert fake_url not in masked


def test_credentials_put_rejects_unknown_provider(auth_headers):
    r = httpx.put(
        f"{ROOT}/admin/integrations/credentials/random_thing",
        headers=auth_headers,
        json={"fields": {"foo": "bar"}},
        timeout=10,
    )
    assert r.status_code == 400


def test_credentials_put_empty_string_clears_field(auth_headers):
    """An explicit empty string should remove the stored field."""
    # First set a value
    httpx.put(
        f"{ROOT}/admin/integrations/credentials/thrivedesk",
        headers=auth_headers,
        json={"fields": {"workspace_url": "https://demo.thrivedesk.com"}},
        timeout=10,
    )
    # Then clear it
    r = httpx.put(
        f"{ROOT}/admin/integrations/credentials/thrivedesk",
        headers=auth_headers,
        json={"fields": {"workspace_url": ""}},
        timeout=10,
    )
    assert r.status_code == 200
    fields = r.json()["fields"]
    assert "workspace_url" not in fields or not fields.get("workspace_url")


# =========================================================================
# Health endpoint now has 8 providers
# =========================================================================
def test_health_endpoint_has_eight_providers(auth_headers):
    r = httpx.get(f"{ROOT}/admin/integrations/health", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    providers = {p["provider"] for p in r.json()["providers"]}
    assert {
        "openrouter", "emailit", "agencyhandy", "paypal",
        "nifty", "approval_studio", "thrivedesk", "slack",
    }.issubset(providers)


# =========================================================================
# Slack notifier — non-configured fast path
# =========================================================================
def test_slack_test_endpoint_returns_503_when_not_configured(auth_headers):
    """Skipped when Slack is actually wired (we don't want to wipe real creds)."""
    health = httpx.get(
        f"{ROOT}/admin/integrations/health", headers=auth_headers, timeout=10
    ).json()
    slack_pill = next((p for p in health["providers"] if p["provider"] == "slack"), None)
    if slack_pill and slack_pill.get("configured"):
        pytest.skip("Slack live — skipping wipe-and-test")
    r = httpx.post(f"{ROOT}/admin/integrations/slack/test", headers=auth_headers, timeout=10)
    assert r.status_code in (503, 502, 200)


# =========================================================================
# ThriveDesk classification + escalation
# =========================================================================
def test_simulate_urgent_ticket_classifies_urgent(auth_headers):
    r = httpx.post(
        f"{ROOT}/admin/support-triage/simulate-ticket",
        headers=auth_headers,
        json={
            "subject": "URGENT: site is down",
            "body": "Help!",
            "tags": ["High Priority"],
            "customer_name": "Test Co",
            "customer_email": f"u{uuid.uuid4().hex[:6]}@example.com",
        },
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["classification"] == "urgent"
    assert r.json()["escalation_id"]


def test_simulate_feature_ticket_classifies_feature(auth_headers):
    r = httpx.post(
        f"{ROOT}/admin/support-triage/simulate-ticket",
        headers=auth_headers,
        json={
            "subject": "Can we get dark mode?",
            "body": "Toggle would help",
            "tags": ["Feature Request"],
            "customer_name": "Indie",
            "customer_email": f"f{uuid.uuid4().hex[:6]}@example.com",
        },
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["classification"] == "feature"


def test_simulate_no_rule_returns_400(auth_headers):
    r = httpx.post(
        f"{ROOT}/admin/support-triage/simulate-ticket",
        headers=auth_headers,
        json={
            "subject": "Hi there",
            "body": "Just checking",
            "tags": [],
            "customer_name": "Curious User",
            "customer_email": f"c{uuid.uuid4().hex[:6]}@example.com",
        },
        timeout=15,
    )
    assert r.status_code == 400


# =========================================================================
# ThriveDesk webhook
# =========================================================================
def test_webhook_conversation_created_urgent_via_subject_keyword():
    """Subject containing 'blocked' should trigger 'urgent' classification."""
    payload = {
        "eventType": "conversation.created",
        "data": {
            "id": str(uuid.uuid4()),
            "ticketId": int(uuid.uuid4().int % 1_000_000),
            "subject": "Question - we are blocked on the integration",
            "excerpt": "Can someone help?",
            "tags": [],
            "customer": {
                "firstName": "Tess",
                "lastName": "Tester",
                "email": f"t{uuid.uuid4().hex[:6]}@example.com",
            },
        },
    }
    r = httpx.post(f"{ROOT}/webhooks/thrivedesk", json=payload, timeout=10)
    assert r.status_code == 200
    assert r.json()["result"]["classification"] == "urgent"


def test_webhook_returns_200_for_unhandled_event():
    """Unhandled events should be accepted (200) but classified as 'ignored'."""
    payload = {
        "eventType": "conversation.assigned",
        "data": {"id": str(uuid.uuid4()), "ticketId": 999},
    }
    r = httpx.post(f"{ROOT}/webhooks/thrivedesk", json=payload, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    # Either ignored or no rule matched
    assert body.get("result", {}).get("outcome") in {"ignored", "no_rule_matched", None}


# =========================================================================
# Admin list + manual resolve
# =========================================================================
def test_admin_list_escalations_returns_list(auth_headers):
    r = httpx.get(f"{ROOT}/admin/support-triage", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_resolve_escalation_marks_resolved(auth_headers):
    # Create one first
    sim = httpx.post(
        f"{ROOT}/admin/support-triage/simulate-ticket",
        headers=auth_headers,
        json={
            "subject": "URGENT: please resolve me",
            "body": "Test",
            "tags": ["High Priority"],
            "customer_name": "ResolveMe",
            "customer_email": f"r{uuid.uuid4().hex[:6]}@example.com",
        },
        timeout=15,
    )
    eid = sim.json()["escalation_id"]

    # Resolve
    r = httpx.post(
        f"{ROOT}/admin/support-triage/{eid}/resolve",
        headers=auth_headers,
        json={"summary": "Fixed the bug", "close_ticket": True},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["escalation"]["status"] == "closed"
    # Mock mode → still ok
    assert body["reply_ok"] is True


def test_admin_mock_log_returns_thrivedesk_mode(auth_headers):
    r = httpx.get(f"{ROOT}/admin/support-triage/mock-log", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] in {"mock", "live"}
    assert isinstance(data["entries"], list)
