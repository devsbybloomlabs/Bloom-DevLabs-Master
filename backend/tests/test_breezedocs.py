"""BreezeDocs Phase 18 — proposals & contracts integration tests."""
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
def client_token():
    r = requests.post(
        f"{_base()}/api/clients/login",
        json={"email": "demo@bybloomlabs.com", "password": "BloomDemo2026!"},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip("Client login failed")
    j = r.json()
    return j.get("token") or j.get("access_token")


def test_admin_breezedocs_routes_require_auth():
    base = _base()
    for method, path in (
        ("GET", "/api/admin/breezedocs/templates"),
        ("GET", "/api/admin/breezedocs/proposals"),
        ("GET", "/api/admin/breezedocs/mock-log"),
        ("POST", "/api/admin/breezedocs/proposals"),
    ):
        r = requests.request(method, f"{base}{path}", json={}, timeout=10)
        assert r.status_code in (401, 403), f"{method} {path}: {r.status_code}"


def test_client_breezedocs_endpoint_requires_auth():
    r = requests.get(f"{_base()}/api/clients/me/breezedocs-proposals", timeout=10)
    assert r.status_code in (401, 403)


def test_list_templates_returns_array(admin_token):
    r = requests.get(
        f"{_base()}/api/admin/breezedocs/templates",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert "templates" in body
    assert isinstance(body["templates"], list)


def test_proposals_list_returns_array(admin_token):
    r = requests.get(
        f"{_base()}/api/admin/breezedocs/proposals",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_proposal_validates_required_fields(admin_token):
    r = requests.post(
        f"{_base()}/api/admin/breezedocs/proposals",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"template_id": 1},  # missing client_email + client_name
        timeout=15,
    )
    assert r.status_code in (400, 422)


def test_sync_unknown_proposal_404(admin_token):
    r = requests.post(
        f"{_base()}/api/admin/breezedocs/proposals/does-not-exist-uuid/sync",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 404


def test_archive_unknown_proposal_404(admin_token):
    r = requests.delete(
        f"{_base()}/api/admin/breezedocs/proposals/does-not-exist-uuid",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 404


def test_client_proposals_only_returns_own(client_token):
    r = requests.get(
        f"{_base()}/api/clients/me/breezedocs-proposals",
        headers={"Authorization": f"Bearer {client_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    for p in arr:
        assert p.get("client_email") == "demo@bybloomlabs.com"
        assert not p.get("archived", False)


def test_mock_log_endpoint_returns_mode(admin_token):
    r = requests.get(
        f"{_base()}/api/admin/breezedocs/mock-log",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("mode") in ("live", "mock")
    assert isinstance(body.get("log"), list)


def test_breezedocs_test_endpoint(admin_token):
    """The /breezedocs/test endpoint must respond with `ok` + `mode`."""
    r = requests.post(
        f"{_base()}/api/admin/integrations/breezedocs/test",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert "ok" in body
    assert body.get("mode") in ("live", "mock")
