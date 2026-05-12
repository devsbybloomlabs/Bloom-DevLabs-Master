"""Phase 18.5 — Onboarding admin health + retry-failed endpoint tests."""
import os
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


def test_onboarding_health_requires_auth():
    r = requests.get(f"{_base()}/api/admin/onboarding/health", timeout=10)
    assert r.status_code in (401, 403)


def test_onboarding_health_returns_snapshot(admin_token):
    r = requests.get(
        f"{_base()}/api/admin/onboarding/health",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert "nifty_connected" in body
    assert isinstance(body["nifty_connected"], bool)
    assert isinstance(body.get("onboardings_with_errors"), int)
    assert isinstance(body.get("blocked_by_disconnect"), list)


def test_replay_failed_requires_auth():
    r = requests.post(f"{_base()}/api/admin/onboarding/replay-failed", timeout=10)
    assert r.status_code in (401, 403)


def test_replay_failed_rejects_when_nifty_disconnected(admin_token):
    """If Nifty isn't connected, the endpoint must refuse with a clear message."""
    health_r = requests.get(
        f"{_base()}/api/admin/onboarding/health",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    if health_r.json().get("nifty_connected"):
        pytest.skip("Nifty is connected — this test requires a disconnected state")
    r = requests.post(
        f"{_base()}/api/admin/onboarding/replay-failed",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=10,
    )
    assert r.status_code == 400
    detail = (r.json().get("detail") or "").lower()
    assert "nifty" in detail
    assert "integrations" in detail or "connect" in detail
