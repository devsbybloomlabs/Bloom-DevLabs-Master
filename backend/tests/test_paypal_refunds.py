"""Phase D — PayPal Refund tests.

Tests cover the admin refund flow at the route + validation level. We
DON'T actually call PayPal in CI (no sandbox key in test env reliably),
so we use the `/refund-info` and validation paths to confirm the routes
exist, require auth, and validate input.
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


def test_refund_routes_require_auth():
    base = _base()
    r = requests.post(
        f"{base}/api/paypal/admin/transactions/fake/refund",
        json={},
        timeout=10,
    )
    assert r.status_code in (401, 403)
    r = requests.get(
        f"{base}/api/paypal/admin/transactions/fake/refund-info",
        timeout=10,
    )
    assert r.status_code in (401, 403)


def test_refund_info_404_for_unknown(admin_token):
    base = _base()
    r = requests.get(
        f"{base}/api/paypal/admin/transactions/does-not-exist-order/refund-info",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 404


def test_refund_404_for_unknown_order(admin_token):
    base = _base()
    r = requests.post(
        f"{base}/api/paypal/admin/transactions/does-not-exist/refund",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "client_request"},
        timeout=10,
    )
    assert r.status_code == 404


def test_refund_validates_reason(admin_token):
    base = _base()
    r = requests.post(
        f"{base}/api/paypal/admin/transactions/whatever/refund",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "not_a_valid_reason"},
        timeout=10,
    )
    assert r.status_code in (400, 422)


def test_refund_info_shape(admin_token):
    """Pick the first completed transaction and verify the info endpoint."""
    base = _base()
    r = requests.get(
        f"{base}/api/paypal/admin/transactions?limit=10",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if r.status_code != 200:
        pytest.skip("No transactions endpoint available")
    txns = r.json() if isinstance(r.json(), list) else r.json().get("transactions") or r.json().get("data") or []
    if not isinstance(txns, list) or len(txns) == 0:
        pytest.skip("No transactions in DB")
    target = txns[0]
    r = requests.get(
        f"{base}/api/paypal/admin/transactions/{target['id']}/refund-info",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("order_id", "currency", "amount", "has_capture", "already_refunded", "refundable"):
        assert key in body, f"Missing key {key} in refund-info: {body}"


def test_email_service_has_send_refund_issued():
    """Pin the new email helper exists with the expected signature."""
    import email_service
    import inspect

    assert hasattr(email_service, "send_refund_issued")
    sig = inspect.signature(email_service.send_refund_issued)
    params = set(sig.parameters)
    for required in ("to", "name", "order_id", "amount", "currency", "is_partial"):
        assert required in params, f"send_refund_issued missing param: {required}"


def test_paypal_client_has_refund_methods():
    """Pin the PayPal client got the new methods."""
    from paypal_client import PayPalClient

    assert hasattr(PayPalClient, "refund_capture")
    assert hasattr(PayPalClient, "get_capture")
    assert hasattr(PayPalClient, "get_refund")
