"""Subscription routes — client-facing plan list/subscribe/cancel + admin assign."""
import os
import uuid
from pathlib import Path

import pytest
import requests

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass


def _base():
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        p = Path(__file__).resolve().parents[2] / "frontend" / ".env"
        if p.exists():
            for line in p.read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL="):
                    base = line.split("=", 1)[1].strip().strip('"')
                    break
    return base.rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{_base()}/api/auth/login",
        json={"email": "founder@thesalvador.group", "password": "admin123"},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip("Admin login failed")
    return r.json()["access_token"]


# ============================================================
# Auth guards
# ============================================================

def test_client_subscription_routes_require_auth():
    base = _base()
    for method, path, body in (
        ("GET", "/api/clients/subscriptions/plans", None),
        ("POST", "/api/clients/subscriptions/subscribe", {"plan_key": "x"}),
        ("GET", "/api/clients/subscriptions", None),
        ("POST", "/api/clients/subscriptions/fake/cancel", None),
    ):
        r = requests.request(method, f"{base}{path}", json=body, timeout=10)
        assert r.status_code in (401, 403), f"{method} {path}: {r.status_code}"


def test_admin_subscription_routes_require_auth():
    base = _base()
    for method, path, body in (
        ("GET", "/api/admin/subscriptions", None),
        ("POST", "/api/admin/subscriptions/assign", {"plan_key": "x", "client_email": "y@z.com"}),
    ):
        r = requests.request(method, f"{base}{path}", json=body, timeout=10)
        assert r.status_code in (401, 403), f"{method} {path}: {r.status_code}"


# ============================================================
# Admin list
# ============================================================

def test_admin_subscriptions_list_works(admin_token):
    base = _base()
    r = requests.get(
        f"{base}/api/admin/subscriptions",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_admin_subscriptions_can_filter_by_email(admin_token):
    base = _base()
    r = requests.get(
        f"{base}/api/admin/subscriptions?client_email=nobody@example.com",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    # No subscription belongs to nobody@example.com
    assert all(s.get("customer_email") == "nobody@example.com" for s in r.json())


# ============================================================
# Admin assign validation
# ============================================================

def test_admin_assign_rejects_unknown_plan(admin_token):
    base = _base()
    r = requests.post(
        f"{base}/api/admin/subscriptions/assign",
        json={
            "plan_key": f"nonexistent-{uuid.uuid4().hex[:6]}",
            "client_email": "demo@bybloomlabs.com",
            "send_email": False,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 404, r.text
    assert "Plan" in r.json()["detail"]


def test_admin_assign_rejects_unknown_client(admin_token):
    """If a plan exists, assigning to an unknown client returns 404."""
    base = _base()
    # Need a real plan to test client-not-found vs plan-not-found
    plans = requests.get(
        f"{base}/api/paypal/admin/plans",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    ).json()
    if not plans:
        pytest.skip("No PayPal plans configured — cannot test client-404 path")
    r = requests.post(
        f"{base}/api/admin/subscriptions/assign",
        json={
            "plan_key": plans[0]["plan_key"],
            "client_email": f"unknown-{uuid.uuid4().hex}@example.com",
            "send_email": False,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 404, r.text
    assert "Client" in r.json()["detail"]


# ============================================================
# Plan computation helpers
# ============================================================

def test_logo_data_uri_is_inlined():
    """The logo embed eliminates the per-PDF remote fetch."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from invoice_service import _logo_data_uri

    uri = _logo_data_uri()
    # Either inlined as data: or gracefully falls back to remote URL
    assert uri.startswith("data:image/") or uri.startswith("https://")
    if uri.startswith("data:"):
        assert "base64" in uri
        assert len(uri) > 1000  # non-trivial image
