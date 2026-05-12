"""Phase C — VIP Support Clearance tests."""
import os
import re
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


@pytest.fixture
def fresh_company(admin_token):
    base = _base()
    email = f"phase-c-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{base}/api/admin/companies",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "PhaseC Test Co", "primary_email": email},
        timeout=15,
    )
    assert r.status_code == 200
    company = r.json()
    yield company
    requests.delete(
        f"{base}/api/admin/companies/{company['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )


def test_admin_clearance_routes_require_auth():
    base = _base()
    for path in (
        "/api/admin/support-clearance/sla",
        "/api/admin/support-clearance/lookup?email=x@x.com",
    ):
        r = requests.get(f"{base}{path}", timeout=10)
        assert r.status_code in (401, 403)


def test_public_verify_returns_minimal_payload(admin_token, fresh_company):
    base = _base()
    uid = fresh_company.get("support_uid")
    assert uid and uid.startswith("BL-SUP-"), uid
    r = requests.get(f"{base}/api/support/clearance/{uid}", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["tier"] == "none"
    assert "company_name" in body
    assert "sla" in body
    # PII fields must NOT leak
    assert "primary_email" not in body
    assert "phone" not in body


def test_public_verify_rejects_malformed():
    base = _base()
    r = requests.get(f"{base}/api/support/clearance/not-a-uid", timeout=10)
    # Malformed → 200 + valid:false (we don't 400 because chat agents call this
    # in a fire-and-forget way and a 4xx makes their logs noisy).
    assert r.status_code == 200
    assert r.json().get("valid") is False


def test_public_verify_unknown_uid_returns_invalid():
    base = _base()
    r = requests.get(f"{base}/api/support/clearance/BL-SUP-ZZZZZZ", timeout=10)
    assert r.status_code == 200
    assert r.json() == {"valid": False}


def test_admin_lookup_by_uid_and_email(admin_token, fresh_company):
    base = _base()
    h = {"Authorization": f"Bearer {admin_token}"}
    # By UID
    r = requests.get(
        f"{base}/api/admin/support-clearance/lookup?uid={fresh_company['support_uid']}",
        headers=h,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["company"]["id"] == fresh_company["id"]
    # By email
    r = requests.get(
        f"{base}/api/admin/support-clearance/lookup?email={fresh_company['primary_email']}",
        headers=h,
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["company"]["id"] == fresh_company["id"]


def test_admin_lookup_404_for_unknown(admin_token):
    base = _base()
    r = requests.get(
        f"{base}/api/admin/support-clearance/lookup?email=nobody-{uuid.uuid4().hex[:8]}@example.com",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 404


def test_manual_tier_override_writes_activity(admin_token, fresh_company):
    base = _base()
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.post(
        f"{base}/api/admin/support-clearance/companies/{fresh_company['id']}/tier",
        headers=h,
        json={"tier": "vip", "reason": "Test override"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["tier"] == "vip"
    # Activity log entry
    r = requests.get(
        f"{base}/api/admin/companies/{fresh_company['id']}/activity",
        headers=h,
        timeout=10,
    )
    arr = r.json()
    assert any(a["type"] == "support.upgraded" for a in arr)


def test_manual_tier_validates_input(admin_token, fresh_company):
    base = _base()
    r = requests.post(
        f"{base}/api/admin/support-clearance/companies/{fresh_company['id']}/tier",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"tier": "bogus"},
        timeout=10,
    )
    assert r.status_code in (400, 422)


def test_regenerate_uid_changes_value(admin_token, fresh_company):
    base = _base()
    h = {"Authorization": f"Bearer {admin_token}"}
    old_uid = fresh_company["support_uid"]
    r = requests.post(
        f"{base}/api/admin/support-clearance/companies/{fresh_company['id']}/regenerate-uid",
        headers=h,
        timeout=10,
    )
    assert r.status_code == 200
    new_uid = r.json()["support_uid"]
    assert new_uid != old_uid
    assert re.match(r"^BL-SUP-[A-Z0-9]{6}$", new_uid)
    # Old UID stops working in public lookup
    r = requests.get(f"{base}/api/support/clearance/{old_uid}", timeout=10)
    assert r.json()["valid"] is False


def test_sla_get_returns_all_tiers(admin_token):
    base = _base()
    r = requests.get(
        f"{base}/api/admin/support-clearance/sla",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    matrix = r.json()["matrix"]
    for tier in ("vip", "premium", "standard", "none"):
        assert tier in matrix
        assert "spiel" in matrix[tier]
        assert "label" in matrix[tier]


def test_sla_update_persists(admin_token):
    base = _base()
    h = {"Authorization": f"Bearer {admin_token}"}
    custom_spiel = f"Custom test spiel {uuid.uuid4().hex[:6]}"
    r = requests.put(
        f"{base}/api/admin/support-clearance/sla/vip",
        headers=h,
        json={"spiel": custom_spiel},
        timeout=10,
    )
    assert r.status_code == 200
    # Verify persisted
    r = requests.get(f"{base}/api/admin/support-clearance/sla", headers=h, timeout=10)
    assert r.json()["matrix"]["vip"]["spiel"] == custom_spiel


def test_client_portal_clearance_endpoint(admin_token):
    """The /clients/me/support/clearance endpoint requires client auth."""
    base = _base()
    r = requests.get(f"{base}/api/clients/me/support/clearance", timeout=10)
    assert r.status_code in (401, 403)
    # With valid client token
    r = requests.post(
        f"{base}/api/clients/login",
        json={"email": "demo@bybloomlabs.com", "password": "BloomDemo2026!"},
        timeout=10,
    )
    if r.status_code != 200:
        pytest.skip("Demo client login failed")
    token = r.json().get("token") or r.json().get("access_token")
    r = requests.get(
        f"{base}/api/clients/me/support/clearance",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert "tier" in body
    assert "sla" in body
