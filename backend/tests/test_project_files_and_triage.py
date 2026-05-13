"""Project Files — admin upload, client download, visibility scoping,
soft-delete, auth guards.

Uses real Emergent Object Storage end-to-end (no mocking) since the
EMERGENT_LLM_KEY is now in the pod .env.
"""
from __future__ import annotations

import asyncio
import io
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

API_BASE = os.environ.get("E2E_API_BASE", "http://localhost:8001/api").rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"


def _admin_token() -> str:
    r = requests.post(
        f"{API_BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    r.raise_for_status()
    return r.json().get("access_token")


def _client_token(email: str, password: str) -> str:
    r = requests.post(
        f"{API_BASE}/clients/register",
        json={"email": email, "password": password, "name": "Files Test", "company": "Co"},
        timeout=15,
    )
    if r.status_code in (400, 409):
        r = requests.post(
            f"{API_BASE}/clients/login",
            json={"email": email, "password": password},
            timeout=15,
        )
    r.raise_for_status()
    return r.json().get("access_token")


def _drop(collection: str, query: dict) -> None:
    async def _do():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            await client[os.environ["DB_NAME"]][collection].delete_many(query)
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_do())


@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


def test_upload_admin_download_client_download(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"pf-test-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "PFTest2026!"
    ct = _client_token(email, password)
    C = {"Authorization": f"Bearer {ct}"}

    file_ids = []
    try:
        # Upload a small file
        payload = io.BytesIO(b"Hello deliverable from Bloom Labs!")
        r = requests.post(
            f"{API_BASE}/admin/project-files",
            files={"file": ("welcome.txt", payload, "text/plain")},
            data={
                "client_email": email,
                "category": "deliverable",
                "notes": "Welcome packet",
            },
            headers=A,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        f = r.json()
        file_ids.append(f["id"])
        assert f["original_filename"] == "welcome.txt"
        assert f["size_bytes"] == 34
        assert f["category"] == "deliverable"
        assert f["uploaded_by"] == ADMIN_EMAIL
        # storage_path is NOT exposed
        assert "storage_path" not in f

        # Admin download returns the exact bytes
        r = requests.get(
            f"{API_BASE}/admin/project-files/{f['id']}/download",
            headers=A,
            timeout=30,
        )
        assert r.status_code == 200
        assert r.content == b"Hello deliverable from Bloom Labs!"
        assert "welcome.txt" in r.headers.get("content-disposition", "")

        # Client list shows the file
        r = requests.get(f"{API_BASE}/clients/me/project-files", headers=C, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 1
        assert items[0]["id"] == f["id"]
        assert items[0]["original_filename"] == "welcome.txt"

        # Client download streams the same bytes
        r = requests.get(
            f"{API_BASE}/clients/me/project-files/{f['id']}/download",
            headers=C,
            timeout=30,
        )
        assert r.status_code == 200
        assert r.content == b"Hello deliverable from Bloom Labs!"

        # WRONG client cannot download
        other_email = f"pf-other-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
        other_token = _client_token(other_email, "Other2026!")
        OC = {"Authorization": f"Bearer {other_token}"}
        r = requests.get(
            f"{API_BASE}/clients/me/project-files/{f['id']}/download",
            headers=OC,
            timeout=15,
        )
        assert r.status_code == 403
        # ...and the other client's list is empty
        r = requests.get(f"{API_BASE}/clients/me/project-files", headers=OC, timeout=15)
        assert r.status_code == 200 and r.json() == []
        _drop("clients", {"email": other_email})

        # Bad category fails fast
        payload = io.BytesIO(b"x")
        r = requests.post(
            f"{API_BASE}/admin/project-files",
            files={"file": ("x.bin", payload, "application/octet-stream")},
            data={"client_email": email, "category": "frog"},
            headers=A,
            timeout=30,
        )
        assert r.status_code == 400

        # Soft delete
        r = requests.delete(
            f"{API_BASE}/admin/project-files/{f['id']}", headers=A, timeout=15
        )
        assert r.status_code == 200
        # Now client list is empty again
        r = requests.get(f"{API_BASE}/clients/me/project-files", headers=C, timeout=15)
        assert r.status_code == 200 and r.json() == []
        # Second delete returns 404
        r = requests.delete(
            f"{API_BASE}/admin/project-files/{f['id']}", headers=A, timeout=15
        )
        assert r.status_code == 404
        # Download of soft-deleted file returns 404
        r = requests.get(
            f"{API_BASE}/admin/project-files/{f['id']}/download",
            headers=A,
            timeout=15,
        )
        assert r.status_code == 404
    finally:
        for fid in file_ids:
            _drop("project_files", {"id": fid})
        _drop("clients", {"email": email})


def test_auth_guards():
    r = requests.get(f"{API_BASE}/admin/project-files", timeout=15)
    assert r.status_code in (401, 403)
    r = requests.get(f"{API_BASE}/clients/me/project-files", timeout=15)
    assert r.status_code in (401, 403)
    r = requests.post(f"{API_BASE}/admin/project-files", timeout=15)
    assert r.status_code in (401, 403)


def test_empty_file_rejected(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"pf-empty-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    try:
        payload = io.BytesIO(b"")
        r = requests.post(
            f"{API_BASE}/admin/project-files",
            files={"file": ("empty.txt", payload, "text/plain")},
            data={"client_email": email, "category": "deliverable"},
            headers=A,
            timeout=30,
        )
        assert r.status_code == 400
    finally:
        _drop("clients", {"email": email})


# -------------------------------------------------------------------------
# Phase I — Support Triage admin lookup
# -------------------------------------------------------------------------
def test_support_triage_lookup_by_ref_email_keyword(admin_token):
    """Verify the existing /admin/portal-contacts search by ref, email, keyword.
    Seeds 2 portal contacts then searches three ways.
    """
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"triage-test-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "Triage2026!"
    ct = _client_token(email, password)
    C = {"Authorization": f"Bearer {ct}"}
    created_refs = []
    try:
        # Submit two contacts via the real endpoint so we get realistic data.
        for subject, body in [
            ("Login broken on the portal", "Cannot log in since yesterday morning."),
            ("Quick question on invoice 0042", "Was this auto-charged or manual?"),
        ]:
            r = requests.post(
                f"{API_BASE}/clients/me/contact",
                data={"subject": subject, "body": body, "priority": "medium"},
                headers=C,
                timeout=30,
            )
            assert r.status_code == 200, r.text
            ticket_ref = r.json().get("ticket_ref")
            assert ticket_ref and ticket_ref.startswith("BL-")
            created_refs.append(ticket_ref)

        # Search by exact ticket ref
        r = requests.get(
            f"{API_BASE}/admin/portal-contacts?q={created_refs[0]}",
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        results = r.json()
        assert len(results) == 1
        assert results[0]["ticket_ref"] == created_refs[0]

        # Search by email
        r = requests.get(
            f"{API_BASE}/admin/portal-contacts?q={email}", headers=A, timeout=15
        )
        assert r.status_code == 200
        assert len(r.json()) == 2

        # Search by keyword
        r = requests.get(
            f"{API_BASE}/admin/portal-contacts?q=login broken", headers=A, timeout=15
        )
        assert r.status_code == 200
        hits = r.json()
        assert any("login broken" in (h["subject"] or "").lower() for h in hits)

        # Status filter
        r = requests.get(
            f"{API_BASE}/admin/portal-contacts?status=open&q={email}",
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        for h in r.json():
            assert h["status"] == "open"

        # Resolve one
        target = next(h for h in hits if h["ticket_ref"] == created_refs[0])
        r = requests.post(
            f"{API_BASE}/admin/portal-contacts/{target['id']}/resolve",
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        # Status filter `resolved` now returns it
        r = requests.get(
            f"{API_BASE}/admin/portal-contacts?status=resolved&q={email}",
            headers=A,
            timeout=15,
        )
        assert any(x["ticket_ref"] == created_refs[0] for x in r.json())

        # Unknown id → 404
        r = requests.post(
            f"{API_BASE}/admin/portal-contacts/not-a-real-id/resolve",
            headers=A,
            timeout=15,
        )
        assert r.status_code == 404
    finally:
        _drop("client_contacts", {"client_email": email})
        _drop("clients", {"email": email})


def test_ticket_ref_format(admin_token):
    """The generated ticket ref must match BL-YYYY-#### (4-digit zero-padded)."""
    import re

    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"ref-fmt-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "RefFmt2026!"
    ct = _client_token(email, password)
    C = {"Authorization": f"Bearer {ct}"}
    try:
        r = requests.post(
            f"{API_BASE}/clients/me/contact",
            data={"subject": "Format check", "body": "yes please", "priority": "low"},
            headers=C,
            timeout=30,
        )
        assert r.status_code == 200
        ref = r.json()["ticket_ref"]
        # BL-2025-0001 (or 2026, whatever year the test runs in)
        assert re.match(r"^BL-\d{4}-\d{4}$", ref), f"Bad ref: {ref}"
        # Search must find it
        r = requests.get(
            f"{API_BASE}/admin/portal-contacts?q={ref}", headers=A, timeout=15
        )
        assert r.status_code == 200
        assert any(x["ticket_ref"] == ref for x in r.json())
    finally:
        _drop("client_contacts", {"client_email": email})
        _drop("clients", {"email": email})
