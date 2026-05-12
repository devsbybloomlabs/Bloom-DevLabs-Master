"""Integration #5 — Nifty blocker comment → Slack."""
import os
import uuid
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.mark.asyncio
async def test_blocker_keyword_fires_slack_and_records():
    from milestone_routes import _maybe_fire_blocker

    db = _db()
    task_id = f"TASK-BL-{uuid.uuid4().hex[:6]}"
    try:
        with patch("milestone_routes.slack_notifier.post_message", new_callable=AsyncMock) as ps:
            ps.return_value = {"ok": True, "status": 200, "reason": None}
            fired = await _maybe_fire_blocker(
                db,
                task={"id": task_id, "title": "Compile production build", "url": "https://nifty.example/task/123"},
                milestone={"id": "ms-1", "client_email": "acme@bybloomlabs.com", "nifty_task_id": task_id},
                comment="blocker: cannot push to production until env keys arrive. @alice please send keys.",
            )
            assert fired is True
            ps.assert_awaited_once()
            slack_text = ps.call_args.kwargs.get("text") or ps.call_args.args[0]
            assert "blocker" in slack_text.lower() or "🚨" in slack_text
            assert "Compile production build" in slack_text
            assert "@alice" in slack_text

        rec = await db.nifty_blockers.find_one({"task_id": task_id}, {"_id": 0})
        assert rec is not None
        assert rec["kind"] == "blocker"
        assert "alice" in rec["mentions"]
        assert rec["slack_ok"] is True
    finally:
        await db.nifty_blockers.delete_many({"task_id": task_id})
        await db.notifications.delete_many({"kind": "nifty_blocker"})


@pytest.mark.asyncio
async def test_non_blocker_comment_is_ignored():
    from milestone_routes import _maybe_fire_blocker

    db = _db()
    task_id = f"TASK-NORM-{uuid.uuid4().hex[:6]}"
    try:
        with patch("milestone_routes.slack_notifier.post_message", new_callable=AsyncMock) as ps:
            fired = await _maybe_fire_blocker(
                db,
                task={"id": task_id, "title": "Anything"},
                milestone={"id": "ms-1", "nifty_task_id": task_id},
                comment="status update: deployment going well, no issues.",
            )
            assert fired is False
            ps.assert_not_awaited()
        assert await db.nifty_blockers.find_one({"task_id": task_id}) is None
    finally:
        await db.nifty_blockers.delete_many({"task_id": task_id})


@pytest.mark.asyncio
@pytest.mark.parametrize("prefix,kind", [
    ("waiting on:", "waiting on"),
    ("blocked by:", "blocked by"),
])
async def test_alternative_prefixes_are_detected(prefix, kind):
    from milestone_routes import _maybe_fire_blocker

    db = _db()
    task_id = f"TASK-ALT-{uuid.uuid4().hex[:6]}"
    try:
        with patch("milestone_routes.slack_notifier.post_message", new_callable=AsyncMock) as ps:
            ps.return_value = {"ok": True, "status": 200, "reason": None}
            fired = await _maybe_fire_blocker(
                db,
                task={"id": task_id, "title": "Auth flow"},
                milestone={"id": "ms-1", "nifty_task_id": task_id},
                comment=f"{prefix} client feedback on copy",
            )
            assert fired is True
        rec = await db.nifty_blockers.find_one({"task_id": task_id})
        assert rec["kind"] == kind
    finally:
        await db.nifty_blockers.delete_many({"task_id": task_id})
        await db.notifications.delete_many({"kind": "nifty_blocker"})


@pytest.mark.asyncio
async def test_blocker_deduplicates_same_text():
    """Same comment text on same task must not fire twice."""
    from milestone_routes import _maybe_fire_blocker

    db = _db()
    task_id = f"TASK-DEDUPE-{uuid.uuid4().hex[:6]}"
    comment = "blocker: stripe keys missing"
    try:
        with patch("milestone_routes.slack_notifier.post_message", new_callable=AsyncMock) as ps:
            ps.return_value = {"ok": True, "status": 200, "reason": None}
            first = await _maybe_fire_blocker(
                db,
                task={"id": task_id, "title": "Checkout"},
                milestone={"id": "ms-1", "nifty_task_id": task_id},
                comment=comment,
            )
            second = await _maybe_fire_blocker(
                db,
                task={"id": task_id, "title": "Checkout"},
                milestone={"id": "ms-1", "nifty_task_id": task_id},
                comment=comment,
            )
            assert first is True and second is False
            # Slack must only post once for the same blocker
            assert ps.await_count == 1
    finally:
        await db.nifty_blockers.delete_many({"task_id": task_id})
        await db.notifications.delete_many({"kind": "nifty_blocker"})


@pytest.mark.asyncio
async def test_blocker_records_slack_failure_but_still_dedupes():
    """If Slack rejects, we still record the blocker so admin sees it."""
    from milestone_routes import _maybe_fire_blocker

    db = _db()
    task_id = f"TASK-SLACK-FAIL-{uuid.uuid4().hex[:6]}"
    try:
        with patch("milestone_routes.slack_notifier.post_message", new_callable=AsyncMock) as ps:
            ps.return_value = {"ok": False, "status": 0, "reason": "not_configured"}
            fired = await _maybe_fire_blocker(
                db,
                task={"id": task_id, "title": "Onboarding"},
                milestone={"id": "ms-1", "nifty_task_id": task_id},
                comment="blocker: design assets late",
            )
            assert fired is True
        rec = await db.nifty_blockers.find_one({"task_id": task_id})
        assert rec["slack_ok"] is False
        assert rec["slack_reason"] == "not_configured"
        # Admin notification still created
        notif = await db.notifications.find_one({"kind": "nifty_blocker"})
        assert notif is not None
    finally:
        await db.nifty_blockers.delete_many({"task_id": task_id})
        await db.notifications.delete_many({"kind": "nifty_blocker"})


def test_admin_blockers_endpoint_requires_auth():
    """The /admin/milestones/blockers route must be protected."""
    import requests

    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL="):
                    base = line.split("=", 1)[1].strip().strip('"')
                    break
    assert base
    r = requests.get(f"{base.rstrip('/')}/api/admin/milestones/blockers", timeout=10)
    assert r.status_code in (401, 403)


def test_admin_blockers_endpoint_returns_list():
    import requests

    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL="):
                    base = line.split("=", 1)[1].strip().strip('"')
                    break
    base = base.rstrip("/")
    lg = requests.post(
        f"{base}/api/auth/login",
        json={"email": "founder@thesalvador.group", "password": "admin123"},
        timeout=15,
    )
    if lg.status_code != 200:
        pytest.skip("Admin login failed")
    token = lg.json()["access_token"]
    r = requests.get(
        f"{base}/api/admin/milestones/blockers",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)
