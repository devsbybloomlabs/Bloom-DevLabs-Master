"""Phase B — Companies / Contacts / Activity log integration tests."""
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


@pytest.fixture
def fresh_company(admin_token):
    """Create a company, yield it, then clean up via DELETE."""
    base = _base()
    email = f"phase-b-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{base}/api/admin/companies",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "PhaseB Test Co",
            "primary_email": email,
            "primary_contact_name": "Test User",
            "domain": "example.com",
            "phone": "+1 555 0100",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    company = r.json()
    yield company
    requests.delete(
        f"{base}/api/admin/companies/{company['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )


def test_companies_endpoints_require_auth():
    base = _base()
    for method, path in (
        ("GET", "/api/admin/companies"),
        ("POST", "/api/admin/companies"),
        ("GET", "/api/admin/companies/x"),
        ("GET", "/api/admin/companies/x/detail"),
        ("GET", "/api/admin/companies/x/contacts"),
        ("PATCH", "/api/admin/contacts/x"),
        ("DELETE", "/api/admin/contacts/x"),
    ):
        r = requests.request(method, f"{base}{path}", json={}, timeout=10)
        assert r.status_code in (401, 403), f"{method} {path}: {r.status_code}"


def test_list_companies(admin_token):
    r = requests.get(
        f"{_base()}/api/admin/companies",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    # Migration should have populated at least one record
    assert len(arr) > 0


def test_create_get_patch_archive(admin_token, fresh_company):
    base = _base()
    company_id = fresh_company["id"]
    # GET single
    r = requests.get(
        f"{base}/api/admin/companies/{company_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "PhaseB Test Co"
    # PATCH
    r = requests.patch(
        f"{base}/api/admin/companies/{company_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"industry": "SaaS", "size": "11-50"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["industry"] == "SaaS"
    # GET detail (denormalized)
    r = requests.get(
        f"{base}/api/admin/companies/{company_id}/detail",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["company"]["id"] == company_id
    assert "contacts" in body
    assert "stats" in body
    assert len(body["contacts"]) == 1
    assert body["contacts"][0]["is_primary"] is True
    # Activity log seeded with creation event
    r = requests.get(
        f"{base}/api/admin/companies/{company_id}/activity",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    activity = r.json()
    assert any(a["type"] == "company.created" for a in activity)


def test_create_rejects_duplicate(admin_token, fresh_company):
    base = _base()
    r = requests.post(
        f"{base}/api/admin/companies",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Duplicate",
            "primary_email": fresh_company["primary_email"],
        },
        timeout=10,
    )
    assert r.status_code == 409


def test_add_contact_promote_archive(admin_token, fresh_company):
    base = _base()
    company_id = fresh_company["id"]
    # Add a second contact
    r = requests.post(
        f"{base}/api/admin/companies/{company_id}/contacts",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "Secondary Contact",
            "email": f"secondary-{uuid.uuid4().hex[:6]}@example.com",
            "role": "CTO",
        },
        timeout=10,
    )
    assert r.status_code == 200, r.text
    secondary = r.json()
    assert secondary["is_primary"] is False
    # Promote secondary
    r = requests.post(
        f"{base}/api/admin/contacts/{secondary['id']}/promote",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["is_primary"] is True
    # List contacts — verify only one primary
    r = requests.get(
        f"{base}/api/admin/companies/{company_id}/contacts",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    contacts = r.json()
    assert sum(1 for c in contacts if c["is_primary"]) == 1
    # Archive primary should fail
    primary = next(c for c in contacts if c["is_primary"])
    r = requests.delete(
        f"{base}/api/admin/contacts/{primary['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 400
    # Archive non-primary should succeed
    non_primary = next(c for c in contacts if not c["is_primary"])
    r = requests.delete(
        f"{base}/api/admin/contacts/{non_primary['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200


def test_add_note_appears_in_activity(admin_token, fresh_company):
    base = _base()
    company_id = fresh_company["id"]
    r = requests.post(
        f"{base}/api/admin/companies/{company_id}/notes",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"title": "Test note", "description": "Body"},
        timeout=10,
    )
    assert r.status_code == 200
    r = requests.get(
        f"{base}/api/admin/companies/{company_id}/activity",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    arr = r.json()
    assert any(a["title"] == "Test note" and a["type"] == "note.added" for a in arr)


def test_archive_then_search_default_filters_it(admin_token, fresh_company):
    base = _base()
    company_id = fresh_company["id"]
    requests.delete(
        f"{base}/api/admin/companies/{company_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    r = requests.get(
        f"{base}/api/admin/companies",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    ids = [c["id"] for c in r.json()]
    assert company_id not in ids
    # With archived=true it appears
    r = requests.get(
        f"{base}/api/admin/companies?archived=true",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    ids = [c["id"] for c in r.json()]
    assert company_id in ids
