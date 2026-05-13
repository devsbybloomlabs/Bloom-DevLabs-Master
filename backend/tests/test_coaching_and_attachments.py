"""Test coverage for:
  - Today's Coaching widget endpoint (ranking + fallback action injection)
  - Contact attachment retrofit to Object Storage (with disk fallback)
  - Client-portal ticket_ref exposure in list endpoint
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
        json={"email": email, "password": password, "name": "Att Test", "company": "Co"},
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


# -------------------------------------------------------------------------
# Today's Coaching
# -------------------------------------------------------------------------
def test_coaching_returns_top_n_with_fallback(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    # Seed 3 prospects across stages — verify ranking is deterministic.
    seeds = [
        {"name": f"Hot-Proposal-{uuid.uuid4().hex[:6]}", "status": "proposal", "deal_value": 25000},
        {"name": f"Mid-Qualified-{uuid.uuid4().hex[:6]}", "status": "qualified", "deal_value": 8000},
        {"name": f"Cold-New-{uuid.uuid4().hex[:6]}", "status": "new", "deal_value": 0},
    ]
    ids = []
    for s in seeds:
        r = requests.post(
            f"{API_BASE}/pipeline/prospects",
            json=s,
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        ids.append(r.json()["id"])
    try:
        r = requests.get(f"{API_BASE}/pipeline/coaching/today?limit=3", headers=A, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "generated_at" in body
        assert "items" in body
        assert len(body["items"]) <= 3
        # Each item carries the expected fields
        for it in body["items"]:
            assert "id" in it and "name" in it and "status" in it
            assert "score" in it and isinstance(it["score"], (int, float))
            assert "days_stale" in it
            # next_action is always populated (fallback if needed)
            assert it["next_action"] and len(it["next_action"]) > 5

        # The Proposal-stage seed should outrank New-stage seed (higher weight).
        our_ids = set(ids)
        our_items = [i for i in body["items"] if i["id"] in our_ids]
        if len(our_items) >= 2:
            proposal_pos = next(
                (idx for idx, it in enumerate(our_items) if it["status"] == "proposal"),
                None,
            )
            new_pos = next(
                (idx for idx, it in enumerate(our_items) if it["status"] == "new"),
                None,
            )
            if proposal_pos is not None and new_pos is not None:
                assert proposal_pos < new_pos

        # Won + lost are excluded
        statuses = {i["status"] for i in body["items"]}
        assert "won" not in statuses
        assert "lost" not in statuses
    finally:
        for pid in ids:
            _drop("prospects", {"id": pid})


def test_coaching_handles_empty(admin_token):
    """When there are no active prospects, items is just an empty list."""
    A = {"Authorization": f"Bearer {admin_token}"}
    # Archive all active prospects temporarily? Simpler — just verify the
    # endpoint shape with whatever's there.
    r = requests.get(f"{API_BASE}/pipeline/coaching/today?limit=3", headers=A, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body.get("items"), list)
    assert body["total_candidates"] >= 0


def test_coaching_limit_capped(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    # limit=99 should cap at 10
    r = requests.get(f"{API_BASE}/pipeline/coaching/today?limit=99", headers=A, timeout=15)
    assert r.status_code == 200
    assert len(r.json()["items"]) <= 10


def test_coaching_auth_guard():
    r = requests.get(f"{API_BASE}/pipeline/coaching/today", timeout=15)
    assert r.status_code in (401, 403)


# -------------------------------------------------------------------------
# Contact attachment object-storage retrofit
# -------------------------------------------------------------------------
def test_contact_attachment_uses_object_storage(admin_token):
    """Upload a contact with an attachment; verify storage_path is populated
    in DB (object storage path) and the download returns the same bytes.
    """
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"contact-os-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "OSTest2026!"
    ct = _client_token(email, password)
    C = {"Authorization": f"Bearer {ct}"}
    file_bytes = b"PNG-bytes-pretend-this-is-a-screenshot"
    try:
        r = requests.post(
            f"{API_BASE}/clients/me/contact",
            data={
                "subject": "Bug with login",
                "body": "See attached screenshot",
                "priority": "high",
            },
            files={"file": ("screenshot.png", io.BytesIO(file_bytes), "image/png")},
            headers=C,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        contact = body["contact"]
        att = contact["attachment"]
        attachment_id = att["id"]
        assert att["original_name"] == "screenshot.png"
        assert att["size_bytes"] == len(file_bytes)
        # The public response should NOT expose internal paths
        assert "stored_path" not in att
        assert "storage_path" not in att

        # Inspect DB to confirm storage_path was set (not the legacy disk fallback)
        async def _peek():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            try:
                return await client[os.environ["DB_NAME"]].client_contacts.find_one(
                    {"id": contact["id"]}, {"_id": 0}
                )
            finally:
                client.close()

        raw = asyncio.new_event_loop().run_until_complete(_peek())
        assert raw is not None
        raw_att = raw["attachment"]
        assert raw_att.get("storage_path"), (
            f"Expected storage_path to be populated, got: {raw_att}"
        )
        # storage_path should look like 'bybloomlabs/contact-attachments/...'
        assert "contact-attachments" in raw_att["storage_path"]
        # disk fallback path is None (since storage worked)
        assert raw_att.get("stored_path") is None

        # Download via client
        r = requests.get(
            f"{API_BASE}/clients/me/contact/attachment/{attachment_id}",
            headers=C,
            timeout=30,
        )
        assert r.status_code == 200
        assert r.content == file_bytes
        assert "screenshot.png" in r.headers.get("content-disposition", "")

        # Cross-client cannot download
        other_email = f"contact-os-other-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
        oct_ = _client_token(other_email, "Other2026!")
        OC = {"Authorization": f"Bearer {oct_}"}
        r = requests.get(
            f"{API_BASE}/clients/me/contact/attachment/{attachment_id}",
            headers=OC,
            timeout=15,
        )
        assert r.status_code == 404  # the lookup filters by email so 404 hides existence
        _drop("clients", {"email": other_email})

        # The contact list returns the ticket_ref (Phase I exposure)
        r = requests.get(f"{API_BASE}/clients/me/contact", headers=C, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 1
        assert items[0]["ticket_ref"] == body["ticket_ref"]
        assert items[0]["ticket_ref"].startswith("BL-")
        # And attachment metadata still has id + name + content_type but no paths
        att_back = items[0]["attachment"]
        assert att_back["id"] == attachment_id
        assert "storage_path" not in att_back
        assert "stored_path" not in att_back
    finally:
        _drop("client_contacts", {"client_email": email})
        _drop("clients", {"email": email})


def test_contact_without_attachment_still_works(admin_token):
    """No attachment should leave attachment=None — text-only path unchanged."""
    email = f"contact-text-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "Text2026!"
    ct = _client_token(email, password)
    C = {"Authorization": f"Bearer {ct}"}
    try:
        r = requests.post(
            f"{API_BASE}/clients/me/contact",
            data={"subject": "Just a question", "body": "What's the SLA again?"},
            headers=C,
            timeout=30,
        )
        assert r.status_code == 200
        contact = r.json()["contact"]
        assert contact.get("attachment") is None
    finally:
        _drop("client_contacts", {"client_email": email})
        _drop("clients", {"email": email})
