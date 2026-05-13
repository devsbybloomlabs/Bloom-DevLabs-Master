"""Phase D part 2 — full Project Brief E2E.

Covers:
  1. Admin lists / fetches prompts for an onboarding.
  2. Admin creates a brief, updates phase summaries, sends for approval.
  3. Client (token-auth) sees the pending brief.
  4. Client approves → brief flips to approved, founder email + activity log.
  5. Client now sees it inside `/approved` (used by the Orders accordion).
  6. Auth guards on every endpoint.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

# Load backend .env so MONGO_URL/DB_NAME are available even when pytest is
# launched from a clean shell.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

API_BASE = os.environ.get("E2E_API_BASE", "http://localhost:8001/api").rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"


def _pick_token(body: dict) -> str:
    return body.get("access_token") or body.get("token") or ""


# -------------------------------------------------------------------------
# helpers
# -------------------------------------------------------------------------
def _admin_token() -> str:
    r = requests.post(
        f"{API_BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    r.raise_for_status()
    return _pick_token(r.json())


def _register_client(email: str, password: str) -> str:
    r = requests.post(
        f"{API_BASE}/clients/register",
        json={
            "email": email,
            "password": password,
            "name": "Brief Test Client",
            "company": "Brief Co",
        },
        timeout=15,
    )
    if r.status_code in (400, 409):
        r = requests.post(
            f"{API_BASE}/clients/login",
            json={"email": email, "password": password},
            timeout=15,
        )
    r.raise_for_status()
    return _pick_token(r.json())


def _seed_onboarding(email: str) -> dict:
    """Synchronously seed an onboarding via Motor on the default event loop."""
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "client_email": email,
        "client_name": "Brief Test Client",
        "client_id": None,
        "resume_token": str(uuid.uuid4()),
        "current_phase": 4,
        "completed": True,
        "phase1": {
            "design_links": [
                {"url": "https://stripe.com", "why": "clean, modern, trust-building"},
                {"url": "https://linear.app", "why": "minimal, fast, focused"},
            ],
            "color_preferences": "Cool blue + warm cream",
            "mood_keywords": "professional, premium, friendly",
        },
        "phase1_submitted_at": now,
        "phase2": {
            "function_links": [
                {"url": "https://notion.so", "why": "drag-and-drop document editor"},
            ],
            "additional_specs": "Realtime collaboration, comments",
        },
        "phase2_submitted_at": now,
        "phase3": {
            "project_name": "Acme Workspace",
            "company_story": "B2B SaaS for project teams",
            "goals": "Hit $1M ARR in 18 months",
            "timeline_expectation": "Launch in Q3",
            "budget": "$50k",
            "success_scenarios": [
                {"description": "Onboard 100 teams in 90 days", "metric": "Activated teams"},
                {"description": "<5% churn", "metric": "Monthly churn rate"},
            ],
        },
        "phase3_submitted_at": now,
        "created_at": now,
        "updated_at": now,
    }

    async def _insert():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            await client[os.environ["DB_NAME"]].onboardings.insert_one(doc)
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_insert())
    return doc


def _delete_onboarding(onboarding_id: str, email: str) -> None:
    async def _drop():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            db = client[os.environ["DB_NAME"]]
            await db.onboardings.delete_one({"id": onboarding_id})
            await db.project_briefs.delete_many({"client_email": email})
            await db.clients.delete_many({"email": email})
            await db.milestones.delete_many({"client_email": email})
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_drop())


# -------------------------------------------------------------------------
# fixtures
# -------------------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token():
    return _admin_token()


@pytest.fixture
def seeded():
    email = f"brief-e2e-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "BriefTest2026!"
    client_token = _register_client(email, password)
    onboarding = _seed_onboarding(email)
    try:
        yield {
            "email": email,
            "password": password,
            "client_token": client_token,
            "onboarding": onboarding,
        }
    finally:
        _delete_onboarding(onboarding["id"], email)


# -------------------------------------------------------------------------
# tests
# -------------------------------------------------------------------------
def test_full_brief_flow(admin_token, seeded):
    email = seeded["email"]
    client_token = seeded["client_token"]
    onboarding_id = seeded["onboarding"]["id"]
    A = {"Authorization": f"Bearer {admin_token}"}
    C = {"Authorization": f"Bearer {client_token}"}

    # 1. Admin fetches prompts
    r = requests.get(
        f"{API_BASE}/admin/briefs/prompts/{onboarding_id}", headers=A, timeout=15
    )
    assert r.status_code == 200, r.text
    bundle = r.json()
    assert bundle["client_email"] == email
    assert bundle["phases_submitted"] == {"phase1": True, "phase2": True, "phase3": True}
    for k in ("design", "function", "company"):
        assert k in bundle["prompts"]
        assert len(bundle["prompts"][k]) > 100
    # The prompt must contain the client's actual answers
    assert "stripe.com" in bundle["prompts"]["design"]
    assert "Acme Workspace" in bundle["prompts"]["company"]

    # 2. Admin creates the brief
    r = requests.post(
        f"{API_BASE}/admin/briefs",
        json={"client_email": email, "onboarding_id": onboarding_id},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    brief = r.json()
    bid = brief["id"]
    assert brief["status"] == "draft"
    assert brief["project_name"] == "Acme Workspace"

    # 3. Admin updates each phase summary
    for ph, summary in [
        ("phase1", "Your design will lean cool-blue + cream, premium SaaS vibes."),
        ("phase2", "We'll ship: realtime doc editing, comments, drag-and-drop."),
        ("phase3", "Building Acme Workspace to hit $1M ARR. Launch Q3."),
    ]:
        r = requests.patch(
            f"{API_BASE}/admin/briefs/{bid}/phase/{ph}",
            json={"summary": summary},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["phase_summaries"][ph]["summary"] == summary

    # 4. Phase key validation
    r = requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase4",
        json={"summary": "x" * 20},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 400

    # 5. Send for approval (Emailit will best-effort fire; we don't gate on it)
    r = requests.post(
        f"{API_BASE}/admin/briefs/{bid}/send-for-approval",
        json={"note_to_client": "Take your time."},
        headers=A,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "sent_for_approval"

    # 6. Client portal: pending brief is visible
    r = requests.get(f"{API_BASE}/clients/me/briefs/pending", headers=C, timeout=15)
    assert r.status_code == 200, r.text
    pending = r.json()
    assert pending is not None
    assert pending["id"] == bid
    assert pending["status"] == "sent_for_approval"

    # 7. Wrong client cannot approve
    wrong_email = f"wrong-{uuid.uuid4().hex[:6]}@bybloomlabs.com"
    wrong_token = _register_client(wrong_email, "Wrong2026!")
    W = {"Authorization": f"Bearer {wrong_token}"}
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/approve", headers=W, timeout=15
    )
    assert r.status_code == 403, r.text

    # 8. Correct client approves
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/approve", headers=C, timeout=30
    )
    assert r.status_code == 200, r.text
    approved = r.json()
    assert approved["status"] == "approved"
    assert approved["approved_by_email"] == email
    assert approved["approved_at"] is not None

    # 8b. Milestones auto-seeded on approval ("we already started" moment)
    r = requests.get(f"{API_BASE}/clients/me/milestones", headers=C, timeout=15)
    assert r.status_code == 200
    ms = r.json()
    titles = [m.get("title") for m in ms]
    assert "Discovery & Brief Sign-off" in titles
    assert "Launch" in titles
    # First milestone should be in_progress
    first = next(m for m in ms if m["title"] == "Discovery & Brief Sign-off")
    assert first["status"] == "in_progress"
    # Final deliverable flag set on Launch
    launch = next(m for m in ms if m["title"] == "Launch")
    assert launch["is_final_deliverable"] is True

    # 9. Idempotent re-approve
    r = requests.post(
        f"{API_BASE}/clients/me/briefs/{bid}/approve", headers=C, timeout=15
    )
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    # 10. Pending endpoint now returns null
    r = requests.get(f"{API_BASE}/clients/me/briefs/pending", headers=C, timeout=15)
    assert r.status_code == 200
    assert r.json() is None

    # 11. Approved endpoint returns the brief
    r = requests.get(f"{API_BASE}/clients/me/briefs/approved", headers=C, timeout=15)
    assert r.status_code == 200
    approved_list = r.json()
    assert any(b["id"] == bid for b in approved_list)

    # 12. Approved briefs are read-only
    r = requests.patch(
        f"{API_BASE}/admin/briefs/{bid}/phase/phase1",
        json={"summary": "Trying to overwrite"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 409

    # cleanup the wrong-client account
    async def _drop_wrong():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            await client[os.environ["DB_NAME"]].clients.delete_one({"email": wrong_email})
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_drop_wrong())


def test_auth_guards(admin_token):
    # admin routes need admin auth
    for path in [
        "/admin/briefs",
        "/admin/briefs/prompts/some-id",
        "/admin/briefs/some-id",
    ]:
        r = requests.get(f"{API_BASE}{path}", timeout=15)
        assert r.status_code in (401, 403), f"{path} -> {r.status_code}"

    # POST without auth
    r = requests.post(
        f"{API_BASE}/admin/briefs", json={"client_email": "x@x.com"}, timeout=15
    )
    assert r.status_code in (401, 403)

    # client portal routes need client auth
    r = requests.get(f"{API_BASE}/clients/me/briefs/pending", timeout=15)
    assert r.status_code in (401, 403)

    # 404 paths (with auth)
    A = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{API_BASE}/admin/briefs/prompts/nonexistent-id", headers=A, timeout=15)
    assert r.status_code == 404
    r = requests.get(f"{API_BASE}/admin/briefs/nonexistent-brief-id", headers=A, timeout=15)
    assert r.status_code == 404


def test_send_without_content_fails(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"empty-brief-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    # Create a brief without an onboarding
    r = requests.post(
        f"{API_BASE}/admin/briefs",
        json={"client_email": email, "project_name": "Empty Test"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    bid = r.json()["id"]
    try:
        r = requests.post(
            f"{API_BASE}/admin/briefs/{bid}/send-for-approval",
            json={},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 400
        assert "summaries" in r.json()["detail"].lower()
    finally:
        requests.delete(f"{API_BASE}/admin/briefs/{bid}", headers=A, timeout=15)


def test_prompt_generator_handles_missing_phases(admin_token):
    """If client only submitted phase 1, function/company prompts should
    still render with `(no answers)` placeholders — not crash."""
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"partial-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    onboarding_id = str(uuid.uuid4())

    async def _seed():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            await client[os.environ["DB_NAME"]].onboardings.insert_one(
                {
                    "id": onboarding_id,
                    "client_email": email,
                    "client_name": "Partial Test",
                    "current_phase": 2,
                    "completed": False,
                    "phase1": {
                        "design_links": [{"url": "https://figma.com", "why": "clarity"}],
                        "color_preferences": "Dark",
                    },
                    "phase1_submitted_at": datetime.now(timezone.utc).isoformat(),
                    "phase2": None,
                    "phase3": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        finally:
            client.close()

    async def _drop():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            await client[os.environ["DB_NAME"]].onboardings.delete_one(
                {"id": onboarding_id}
            )
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_seed())
    try:
        r = requests.get(
            f"{API_BASE}/admin/briefs/prompts/{onboarding_id}",
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["phases_submitted"] == {"phase1": True, "phase2": False, "phase3": False}
        # All three prompts still rendered
        for k in ("design", "function", "company"):
            assert len(b["prompts"][k]) > 100
        # Function/company use safe fallback because answers are missing
        assert "didn't share any feature references" in b["prompts"]["function"]
    finally:
        asyncio.new_event_loop().run_until_complete(_drop())
