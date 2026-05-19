"""Wave 1 cleanup — hard delete endpoints for companies + contacts."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://lead-pipeline-66.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="module")
def admin_token() -> str:
    r = requests.post(
        f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}
    )
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture
def headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


def test_hard_delete_company_requires_auth() -> None:
    r = requests.delete(f"{API}/admin/companies/some-id/hard")
    assert r.status_code in (401, 403)


def test_hard_delete_contact_requires_auth() -> None:
    r = requests.delete(f"{API}/admin/contacts/some-id/hard")
    assert r.status_code in (401, 403)


def test_hard_delete_company_404_when_missing(headers: dict) -> None:
    r = requests.delete(
        f"{API}/admin/companies/does-not-exist-{uuid.uuid4()}/hard", headers=headers
    )
    assert r.status_code == 404


def test_hard_delete_company_cascades_contacts_and_activity(headers: dict) -> None:
    # Create company
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_HardDel_{suffix}",
        "primary_email": f"hd-{suffix}@example.com",
        "domain": "example.com",
    }
    r = requests.post(f"{API}/admin/companies", json=payload, headers=headers)
    assert r.status_code in (200, 201), r.text
    company = r.json()
    company_id = company["id"]

    # Add a non-primary contact
    r2 = requests.post(
        f"{API}/admin/companies/{company_id}/contacts",
        json={"name": "Side Contact", "email": f"side-{suffix}@example.com"},
        headers=headers,
    )
    assert r2.status_code in (200, 201), r2.text
    contact_id = r2.json()["id"]

    # Add a note → activity log entry
    r3 = requests.post(
        f"{API}/admin/companies/{company_id}/notes",
        json={"title": "test", "body": "Test note for hard delete cascade"},
        headers=headers,
    )
    assert r3.status_code in (200, 201), r3.text

    # Hard delete
    r4 = requests.delete(
        f"{API}/admin/companies/{company_id}/hard", headers=headers
    )
    assert r4.status_code == 200, r4.text
    body = r4.json()
    assert body["ok"] is True
    assert body["deleted"]["company"] == 1
    assert body["deleted"]["contacts"] >= 2  # primary auto-created + side contact
    assert body["deleted"]["activity"] >= 1

    # Company is gone
    r5 = requests.get(f"{API}/admin/companies/{company_id}", headers=headers)
    assert r5.status_code == 404

    # Contact gone (deletion cascaded)
    r6 = requests.delete(
        f"{API}/admin/contacts/{contact_id}/hard", headers=headers
    )
    assert r6.status_code == 404


def test_hard_delete_primary_contact_refused(headers: dict) -> None:
    suffix = uuid.uuid4().hex[:8]
    r = requests.post(
        f"{API}/admin/companies",
        json={"name": f"TEST_PrimGuard_{suffix}", "primary_email": f"pg-{suffix}@example.com"},
        headers=headers,
    )
    assert r.status_code in (200, 201)
    company_id = r.json()["id"]

    # Find primary contact
    r2 = requests.get(
        f"{API}/admin/companies/{company_id}/contacts", headers=headers
    )
    contacts = r2.json()
    primary = next(c for c in contacts if c.get("is_primary"))

    # Try to hard delete primary — should refuse
    r3 = requests.delete(
        f"{API}/admin/contacts/{primary['id']}/hard", headers=headers
    )
    assert r3.status_code == 400
    assert "primary" in r3.json()["detail"].lower()

    # Cleanup
    requests.delete(f"{API}/admin/companies/{company_id}/hard", headers=headers)


def test_hard_delete_non_primary_contact_ok(headers: dict) -> None:
    suffix = uuid.uuid4().hex[:8]
    r = requests.post(
        f"{API}/admin/companies",
        json={"name": f"TEST_NPdel_{suffix}", "primary_email": f"np-{suffix}@example.com"},
        headers=headers,
    )
    company_id = r.json()["id"]

    # Add non-primary contact
    r2 = requests.post(
        f"{API}/admin/companies/{company_id}/contacts",
        json={"name": "Secondary", "email": f"sec-{suffix}@example.com"},
        headers=headers,
    )
    secondary_id = r2.json()["id"]

    # Hard delete that contact
    r3 = requests.delete(
        f"{API}/admin/contacts/{secondary_id}/hard", headers=headers
    )
    assert r3.status_code == 200

    # Cleanup
    requests.delete(f"{API}/admin/companies/{company_id}/hard", headers=headers)


def test_integrations_health_omits_nifty(headers: dict) -> None:
    r = requests.get(f"{API}/admin/integrations/health", headers=headers)
    assert r.status_code == 200
    providers = [p["provider"] for p in r.json()["providers"]]
    assert "nifty" not in providers
    assert "openrouter" in providers
    assert "emailit" in providers
    assert "paypal" in providers
