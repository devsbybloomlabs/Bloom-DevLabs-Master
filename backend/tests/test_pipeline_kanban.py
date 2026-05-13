"""Phase G — Pipeline Kanban + activity stream + AI suggestion.
Plus the client-portal Team Activity widget endpoint.
"""
from __future__ import annotations

import asyncio
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
    j = r.json()
    return j.get("access_token") or j.get("token")


def _client_token(email: str, password: str) -> str:
    r = requests.post(
        f"{API_BASE}/clients/register",
        json={"email": email, "password": password, "name": "PMW", "company": "Co"},
        timeout=15,
    )
    if r.status_code in (400, 409):
        r = requests.post(
            f"{API_BASE}/clients/login",
            json={"email": email, "password": password},
            timeout=15,
        )
    r.raise_for_status()
    j = r.json()
    return j.get("access_token") or j.get("token")


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


@pytest.fixture
def prospect(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    r = requests.post(
        f"{API_BASE}/pipeline/prospects",
        json={
            "name": f"PG Test {uuid.uuid4().hex[:6]}",
            "company": "Acme Co",
            "email": f"acme-{uuid.uuid4().hex[:6]}@bybloomlabs.com",
            "linkedin": "https://linkedin.com/in/acme",
            "industry": "SaaS",
            "deal_value": 12000,
            "notes": "Asked about a 12-week sprint engagement.",
            "status": "qualified",
        },
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    p = r.json()
    try:
        yield p
    finally:
        _drop("prospects", {"id": p["id"]})
        _drop("pipeline_activity", {"prospect_id": p["id"]})


def test_board_groups_by_stage(admin_token, prospect):
    A = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{API_BASE}/pipeline/board", headers=A, timeout=15)
    assert r.status_code == 200
    b = r.json()
    assert set(b["stages"]) == {"new", "contacted", "qualified", "proposal", "won", "lost"}
    assert set(b["columns"].keys()) == set(b["stages"])
    # Our seeded prospect should be in qualified
    qualified_ids = [p["id"] for p in b["columns"]["qualified"]]
    assert prospect["id"] in qualified_ids
    # totals shape
    assert "open_value" in b["totals"]
    assert "closed_revenue" in b["totals"]


def test_move_prospect(admin_token, prospect):
    A = {"Authorization": f"Bearer {admin_token}"}
    pid = prospect["id"]
    # Invalid stage
    r = requests.post(
        f"{API_BASE}/pipeline/prospects/{pid}/move",
        json={"status": "frog"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 400
    # Valid move
    r = requests.post(
        f"{API_BASE}/pipeline/prospects/{pid}/move",
        json={"status": "proposal"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    fresh = r.json()
    assert fresh["status"] == "proposal"
    assert fresh.get("last_activity_at")
    # Activity event was logged
    r = requests.get(
        f"{API_BASE}/pipeline/prospects/{pid}/activity", headers=A, timeout=15
    )
    assert r.status_code == 200
    events = r.json()
    stage_changes = [e for e in events if e.get("type") == "stage.changed"]
    assert any(e.get("to") == "proposal" for e in stage_changes)
    # No-op move (same stage) returns 200, no extra event added
    n_before = len(events)
    r = requests.post(
        f"{API_BASE}/pipeline/prospects/{pid}/move",
        json={"status": "proposal"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    r = requests.get(
        f"{API_BASE}/pipeline/prospects/{pid}/activity", headers=A, timeout=15
    )
    assert len(r.json()) == n_before
    # Unknown id 404
    r = requests.post(
        f"{API_BASE}/pipeline/prospects/does-not-exist/move",
        json={"status": "new"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 404


def test_activity_stream(admin_token, prospect):
    A = {"Authorization": f"Bearer {admin_token}"}
    pid = prospect["id"]
    # Post 3 different-type activities
    for body, t in [
        ("Sent intro email", "email"),
        ("Connected on LinkedIn", "linkedin_dm"),
        ("15-min discovery booked for Tuesday", "meeting"),
    ]:
        r = requests.post(
            f"{API_BASE}/pipeline/prospects/{pid}/activity",
            json={"body": body, "type": t},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["type"] == t
        assert r.json()["body"] == body
    # List sorts newest first
    r = requests.get(
        f"{API_BASE}/pipeline/prospects/{pid}/activity", headers=A, timeout=15
    )
    assert r.status_code == 200
    events = r.json()
    # The latest is the meeting
    assert events[0]["type"] == "meeting"
    # prospect last_activity_at is bumped
    r = requests.get(f"{API_BASE}/pipeline/prospects", headers=A, timeout=15)
    fresh = next(p for p in r.json() if p["id"] == pid)
    assert fresh.get("last_activity_at")
    # Unknown id 404
    r = requests.post(
        f"{API_BASE}/pipeline/prospects/does-not-exist/activity",
        json={"body": "x"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 404


def test_ai_suggestion(admin_token, prospect):
    A = {"Authorization": f"Bearer {admin_token}"}
    pid = prospect["id"]
    r = requests.get(
        f"{API_BASE}/pipeline/prospects/{pid}/ai-suggestion", headers=A, timeout=30
    )
    assert r.status_code == 200
    body = r.json()
    assert "action" in body
    assert len(body["action"]) > 5  # we get *something*
    assert body["source"] in ("ai", "fallback")
    # 404 for unknown
    r = requests.get(
        f"{API_BASE}/pipeline/prospects/does-not-exist/ai-suggestion",
        headers=A,
        timeout=15,
    )
    assert r.status_code == 404


def test_auth_guards():
    r = requests.get(f"{API_BASE}/pipeline/board", timeout=15)
    assert r.status_code in (401, 403)
    r = requests.post(
        f"{API_BASE}/pipeline/prospects/x/move",
        json={"status": "new"},
        timeout=15,
    )
    assert r.status_code in (401, 403)
    r = requests.post(
        f"{API_BASE}/pipeline/prospects/x/activity",
        json={"body": "x"},
        timeout=15,
    )
    assert r.status_code in (401, 403)


# -------------------------------------------------------------------------
# Client portal team-activity widget endpoint
# -------------------------------------------------------------------------
def test_team_activity_widget_empty():
    """A fresh client with zero PM projects → has_activity is False."""
    email = f"widget-test-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "Widget2026!"
    token = _client_token(email, password)
    C = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.get(f"{API_BASE}/clients/me/team-activity", headers=C, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["has_activity"] is False
        assert body["projects_count"] == 0
        assert sum(body["counts"].values()) == 0
        assert body["recent"] == []
    finally:
        _drop("clients", {"email": email})


def test_team_activity_widget_with_pm_activity(admin_token):
    """Client with a PM project + tasks → widget returns counts + recent."""
    A = {"Authorization": f"Bearer {admin_token}"}
    email = f"widget-pm-{uuid.uuid4().hex[:8]}@bybloomlabs.com"
    password = "Widget2026!"
    token = _client_token(email, password)
    C = {"Authorization": f"Bearer {token}"}
    pid = None
    task_ids = []
    try:
        # Create a PM project linked to this client
        r = requests.post(
            f"{API_BASE}/admin/pm/projects",
            json={"name": "Widget Test Proj", "client_email": email},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        # Add tasks across statuses
        for title, status in [
            ("Set up design system", "in_progress"),
            ("QA review of hero", "review"),
            ("Auth flow", "in_progress"),
            ("DNS migration", "blocked"),
        ]:
            r = requests.post(
                f"{API_BASE}/admin/pm/tasks",
                json={"project_id": pid, "title": title, "status": status},
                headers=A,
                timeout=15,
            )
            assert r.status_code == 200
            task_ids.append(r.json()["id"])
        # Now query the widget endpoint
        r = requests.get(f"{API_BASE}/clients/me/team-activity", headers=C, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["has_activity"] is True
        assert body["projects_count"] == 1
        assert body["counts"]["in_progress"] == 2
        assert body["counts"]["review"] == 1
        assert body["counts"]["blocked"] == 1
        assert body["active_count"] == 3  # in_progress + review
        # Recent list has projects info
        assert len(body["recent"]) <= 5
        assert all("title" in r and "status" in r and "project_name" in r for r in body["recent"])
    finally:
        if pid:
            _drop("pm_projects", {"id": pid})
            _drop("pm_tasks", {"project_id": pid})
        _drop("clients", {"email": email})


def test_team_activity_widget_auth_guard():
    r = requests.get(f"{API_BASE}/clients/me/team-activity", timeout=15)
    assert r.status_code in (401, 403)
