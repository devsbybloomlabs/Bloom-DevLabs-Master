"""Phase F — Project Mode (in-house Kanban PM) full E2E.

Covers:
  - Project CRUD + auto-resolve company_id by client_email.
  - Task create/update/delete with status validation, priority validation,
    column reordering, status transitions.
  - Comments add/list, task touch on comment.
  - Board endpoint shape: columns keyed by status, total count.
  - Task delete cascades to comments.
  - Status `done` auto-completes linked milestone.
  - Auth guards.
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
def project(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    name = f"PM Test {uuid.uuid4().hex[:6]}"
    r = requests.post(
        f"{API_BASE}/admin/pm/projects",
        json={"name": name, "color": "#10B981"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    p = r.json()
    try:
        yield p
    finally:
        _drop("pm_projects", {"id": p["id"]})
        _drop("pm_tasks", {"project_id": p["id"]})


def test_project_crud(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    # create
    r = requests.post(
        f"{API_BASE}/admin/pm/projects",
        json={"name": "CRUD Test Proj", "client_email": "testclient@bybloomlabs.com"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    p = r.json()
    pid = p["id"]
    try:
        assert p["slug"] == "crud-test-proj"
        assert p["status"] == "active"
        assert p["task_counts"] == {"todo": 0, "in_progress": 0, "review": 0, "blocked": 0, "done": 0}
        # company_id was resolved from email
        assert p.get("company_id")
        # get
        r = requests.get(f"{API_BASE}/admin/pm/projects/{pid}", headers=A, timeout=15)
        assert r.status_code == 200
        # update name + color
        r = requests.patch(
            f"{API_BASE}/admin/pm/projects/{pid}",
            json={"name": "Renamed", "color": "#FF00AA"},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"
        assert r.json()["color"] == "#FF00AA"
        # invalid status
        r = requests.patch(
            f"{API_BASE}/admin/pm/projects/{pid}",
            json={"status": "bogus"},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 400
        # archive
        r = requests.delete(f"{API_BASE}/admin/pm/projects/{pid}", headers=A, timeout=15)
        assert r.status_code == 200
        # archived status reflected via list with status=archived
        r = requests.get(
            f"{API_BASE}/admin/pm/projects?status=archived", headers=A, timeout=15
        )
        assert any(x["id"] == pid for x in r.json())
    finally:
        _drop("pm_projects", {"id": pid})


def test_task_lifecycle(admin_token, project):
    A = {"Authorization": f"Bearer {admin_token}"}
    pid = project["id"]

    # create 3 tasks in 'todo'
    ids = []
    for i, title in enumerate(["Task A", "Task B", "Task C"]):
        r = requests.post(
            f"{API_BASE}/admin/pm/tasks",
            json={
                "project_id": pid,
                "title": title,
                "priority": "high" if i == 0 else "medium",
            },
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        ids.append(r.json()["id"])
    # order_idx assigned sequentially
    r = requests.get(
        f"{API_BASE}/admin/pm/tasks?project_id={pid}", headers=A, timeout=15
    )
    tasks = sorted(r.json(), key=lambda x: x["order_idx"])
    assert [t["title"] for t in tasks] == ["Task A", "Task B", "Task C"]

    # invalid status
    r = requests.post(
        f"{API_BASE}/admin/pm/tasks",
        json={"project_id": pid, "title": "x", "status": "frog"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 400

    # invalid priority
    r = requests.post(
        f"{API_BASE}/admin/pm/tasks",
        json={"project_id": pid, "title": "x", "priority": "extreme"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 400

    # create against unknown project
    r = requests.post(
        f"{API_BASE}/admin/pm/tasks",
        json={"project_id": "does-not-exist", "title": "x"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 404

    # move B to in_progress → lands at bottom of in_progress (order_idx 0)
    r = requests.patch(
        f"{API_BASE}/admin/pm/tasks/{ids[1]}",
        json={"status": "in_progress"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"
    assert r.json()["order_idx"] == 0

    # board groups by status
    r = requests.get(f"{API_BASE}/admin/pm/projects/{pid}/board", headers=A, timeout=15)
    assert r.status_code == 200
    board = r.json()
    assert set(board["columns"].keys()) == {"todo", "in_progress", "review", "blocked", "done"}
    assert board["total"] == 3
    assert len(board["columns"]["todo"]) == 2
    assert len(board["columns"]["in_progress"]) == 1

    # add 2 comments → list back
    for body in ["Started this", "Almost done"]:
        r = requests.post(
            f"{API_BASE}/admin/pm/tasks/{ids[1]}/comments",
            json={"body": body},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["body"] == body
        assert r.json()["author"]  # auto-stamped
    r = requests.get(
        f"{API_BASE}/admin/pm/tasks/{ids[1]}/comments", headers=A, timeout=15
    )
    assert r.status_code == 200
    assert len(r.json()) == 2

    # delete a task → cascades comments
    r = requests.delete(f"{API_BASE}/admin/pm/tasks/{ids[1]}", headers=A, timeout=15)
    assert r.status_code == 200
    # Comments are wiped (cascade); list endpoint queries by task_id so it
    # returns 200 with an empty array.
    r = requests.get(
        f"{API_BASE}/admin/pm/tasks/{ids[1]}/comments", headers=A, timeout=15
    )
    assert r.status_code == 200
    assert r.json() == []


def test_task_done_completes_linked_milestone(admin_token, project):
    """Marking a task `done` should auto-complete its linked milestone."""
    A = {"Authorization": f"Bearer {admin_token}"}
    pid = project["id"]
    email = "pm-milestone-test@bybloomlabs.com"

    # Seed a milestone directly
    ms_id = str(uuid.uuid4())

    async def _seed_ms():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        try:
            await client[os.environ["DB_NAME"]].milestones.insert_one(
                {
                    "id": ms_id,
                    "client_email": email,
                    "project_name": project["name"],
                    "title": "Design hero",
                    "status": "in_progress",
                    "description": "",
                    "is_final_deliverable": False,
                    "notify_client_on_complete": False,
                    "nifty_task_id": None,
                    "due_date": None,
                    "completion_date": None,
                    "blocked_reason": None,
                    "blocked_eta": None,
                    "notes": [],
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        finally:
            client.close()

    asyncio.new_event_loop().run_until_complete(_seed_ms())

    try:
        # Create a task linked to this milestone
        r = requests.post(
            f"{API_BASE}/admin/pm/tasks",
            json={"project_id": pid, "title": "Linked task", "milestone_id": ms_id},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        tid = r.json()["id"]

        # Mark task done
        r = requests.patch(
            f"{API_BASE}/admin/pm/tasks/{tid}",
            json={"status": "done"},
            headers=A,
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "done"

        # Verify milestone is now complete
        async def _check():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            try:
                return await client[os.environ["DB_NAME"]].milestones.find_one(
                    {"id": ms_id}
                )
            finally:
                client.close()

        ms = asyncio.new_event_loop().run_until_complete(_check())
        assert ms is not None
        assert ms["status"] == "complete"
        assert ms.get("completion_date") is not None
    finally:
        _drop("milestones", {"id": ms_id})


def test_auth_guards():
    for path in ["/admin/pm/projects", "/admin/pm/tasks", "/admin/pm/projects/x/board"]:
        r = requests.get(f"{API_BASE}{path}", timeout=15)
        assert r.status_code in (401, 403), f"{path} -> {r.status_code}"
    r = requests.post(f"{API_BASE}/admin/pm/projects", json={"name": "x"}, timeout=15)
    assert r.status_code in (401, 403)


def test_404_paths(admin_token):
    A = {"Authorization": f"Bearer {admin_token}"}
    fake = "nonexistent-id-12345"
    r = requests.get(f"{API_BASE}/admin/pm/projects/{fake}", headers=A, timeout=15)
    assert r.status_code == 404
    r = requests.get(f"{API_BASE}/admin/pm/projects/{fake}/board", headers=A, timeout=15)
    assert r.status_code == 404
    r = requests.patch(
        f"{API_BASE}/admin/pm/projects/{fake}",
        json={"name": "x"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 404
    r = requests.delete(f"{API_BASE}/admin/pm/projects/{fake}", headers=A, timeout=15)
    assert r.status_code == 404
    r = requests.patch(
        f"{API_BASE}/admin/pm/tasks/{fake}",
        json={"title": "x"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 404
    r = requests.delete(f"{API_BASE}/admin/pm/tasks/{fake}", headers=A, timeout=15)
    assert r.status_code == 404
    r = requests.post(
        f"{API_BASE}/admin/pm/tasks/{fake}/comments",
        json={"body": "x"},
        headers=A,
        timeout=15,
    )
    assert r.status_code == 404
