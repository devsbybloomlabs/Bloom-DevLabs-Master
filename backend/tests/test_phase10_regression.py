"""Phase 10 regression — verify the 3 bug fixes from iteration_9.

Run:
  pytest /app/backend/tests/test_phase10_regression.py -v --tb=short \
    --junitxml=/app/test_reports/pytest/phase10_regression.xml
"""
from __future__ import annotations

import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"
TIMEOUT = 60


@pytest.fixture(scope="module")
def session() -> requests.Session:
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(session) -> str:
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(session, admin_token):
    """Reset state before & after."""
    def _clear():
        session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            json={
                "default_project_id": "",
                "designer_assignees": [],
                "pm_assignees": [],
                "developer_assignees": [],
            },
            timeout=TIMEOUT,
        )
    _clear()
    yield
    _clear()


class TestEmptyStringClear:
    """Bug 3: PUT { default_project_id: '' } should CLEAR the field."""

    def test_set_then_clear_default_project(self, session, admin_token):
        # Set
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            json={"default_project_id": "proj-abc"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["default_project_id"] == "proj-abc"

        # GET confirms
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            timeout=TIMEOUT,
        )
        assert r.json()["default_project_id"] == "proj-abc"

        # Clear with empty string
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            json={"default_project_id": ""},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["default_project_id"] in ("", None), (
            f"empty-string clear failed: default_project_id={body['default_project_id']!r}"
        )

        # GET re-verifies persistence
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            timeout=TIMEOUT,
        )
        body = r.json()
        assert body["default_project_id"] in ("", None)


class TestEmptyListClear:
    """Bug 3 variant: empty list should CLEAR assignee fields."""

    def test_set_then_clear_designer_assignees(self, session, admin_token):
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            json={"designer_assignees": ["a@x.com", "b@x.com"]},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["designer_assignees"] == ["a@x.com", "b@x.com"]

        # Clear
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            json={"designer_assignees": []},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        assert r.json()["designer_assignees"] == [], (
            f"empty-list clear failed: {r.json()['designer_assignees']!r}"
        )

        # GET persists
        r = session.get(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            timeout=TIMEOUT,
        )
        assert r.json()["designer_assignees"] == []


class TestPartialUpdatePreserves:
    """Partial PUT must preserve untouched fields (no destructive merge)."""

    def test_partial_update_preserves_other_fields(self, session, admin_token):
        # Seed
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            json={"default_project_id": "p1", "designer_assignees": ["a@x"]},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["default_project_id"] == "p1"
        assert body["designer_assignees"] == ["a@x"]

        # Partial: only change default_project_id
        r = session.put(
            f"{BASE_URL}/api/admin/integrations/nifty/preferences",
            headers=H(admin_token),
            json={"default_project_id": "p2"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["default_project_id"] == "p2"
        assert body["designer_assignees"] == ["a@x"], (
            f"partial update wiped designer_assignees: {body['designer_assignees']!r}"
        )
