"""Phase 18 — Public 1-click invoice pay link tests.

The public pay flow lets a client click a link inside their invoice email
and land on `/pay/invoice/{id}` (frontend) → press a button → get 302'd
to PayPal. The backend exposes two no-auth endpoints:

  • GET /api/public/invoices/{id}/summary   — landing page data
  • GET /api/public/invoices/{id}/pay       — create order + 302 to PayPal

Both must NOT require auth (invoice id is the bearer of authorization).
"""
import os
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


@pytest.fixture(scope="module")
def fresh_invoice(admin_token):
    """Create a test invoice; clean up after."""
    base = _base()
    r = requests.post(
        f"{base}/api/admin/invoices",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "client_email": "phase18-paylink@example.com",
            "client_name": "Phase 18 Paylink Test",
            "line_items": [
                {
                    "description": "1-click pay smoke test",
                    "quantity": 1,
                    "unit_price": 100.0,
                    "amount": 100.0,
                }
            ],
            "send_email": False,
            "notes": "Test invoice for Phase 18 — public pay endpoint",
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    inv = r.json()
    yield inv
    # Cleanup
    try:
        requests.delete(
            f"{base}/api/admin/invoices/{inv['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
    except Exception:
        pass


def test_summary_returns_invoice_no_auth(fresh_invoice):
    r = requests.get(f"{_base()}/api/public/invoices/{fresh_invoice['id']}/summary", timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == fresh_invoice["id"]
    assert body["number"] == fresh_invoice["number"]
    assert body["client_email"] == "phase18-paylink@example.com"
    assert body["total"] == 100.0
    assert body["balance_due"] == 100.0
    # _id from mongo must NOT leak
    assert "_id" not in body


def test_summary_returns_404_for_unknown_invoice():
    r = requests.get(
        f"{_base()}/api/public/invoices/00000000-0000-0000-0000-000000000000/summary",
        timeout=10,
    )
    assert r.status_code == 404


def test_pay_endpoint_redirects_to_paypal(fresh_invoice):
    """The public /pay endpoint must 302 to a PayPal approval URL."""
    r = requests.get(
        f"{_base()}/api/public/invoices/{fresh_invoice['id']}/pay",
        allow_redirects=False,
        timeout=20,
    )
    # Either 302 to paypal OR 503 if PayPal not configured in env
    assert r.status_code in (302, 503), r.text
    if r.status_code == 302:
        loc = r.headers.get("Location") or ""
        assert "paypal.com" in loc.lower()


def test_pay_endpoint_404_for_unknown_invoice():
    r = requests.get(
        f"{_base()}/api/public/invoices/00000000-0000-0000-0000-000000000000/pay",
        allow_redirects=False,
        timeout=10,
    )
    assert r.status_code == 404


def test_pay_endpoint_blocks_paid_invoice(admin_token, fresh_invoice):
    """Once an invoice is marked paid, /pay must reject (409)."""
    base = _base()
    requests.patch(
        f"{base}/api/admin/invoices/{fresh_invoice['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "paid"},
        timeout=10,
    )
    r = requests.get(
        f"{base}/api/public/invoices/{fresh_invoice['id']}/pay",
        allow_redirects=False,
        timeout=10,
    )
    assert r.status_code == 409
