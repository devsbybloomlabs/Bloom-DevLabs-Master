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
#   NOTE: The legacy "approve whole brief in one shot" test has been removed
#   because the API now uses a per-phase flow. See test_brief_per_phase.py
#   for full coverage of the new state machine.
# -------------------------------------------------------------------------


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
    """Per-phase send requires the phase to have a saved summary first."""
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"empty-brief-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    # Create a brief
    r = requests.post(
        f"{API_BASE}/admin/briefs",
        json={"client_email": email, "project_name": "Empty Test"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    bid = r.json()["id"]
    try:
        # Cannot send a phase that has no summary yet
        r = requests.post(
            f"{API_BASE}/admin/briefs/{bid}/phase/phase1/send-for-review",
            json={},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 400
        assert "summary" in r.json()["detail"].lower()
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
