"""BloomConnect giveaway (/api/win/enter) backend tests."""
import os
import uuid

import pytest
import requests


def _base_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    pytest.skip("REACT_APP_BACKEND_URL not set")


API = f"{_base_url()}/api"


def _payload(**over):
    body = {
        "name": "Test Entrant",
        "business": "Test Co",
        "email": f"win-{uuid.uuid4().hex[:10]}@example.com",
        "phone": "+1 555 010 0000",
        "channel": "WhatsApp",
        "consent": True,
    }
    body.update(over)
    return body


def test_entry_happy_path_then_duplicate():
    body = _payload()
    r = requests.post(f"{API}/win/enter", json=body, timeout=20)
    assert r.status_code == 200
    first = r.json()
    assert first["ok"] is True and first.get("entry_id")
    assert not first.get("already_entered")

    r2 = requests.post(f"{API}/win/enter", json=body, timeout=20)
    assert r2.status_code == 200
    assert r2.json()["already_entered"] is True


def test_invalid_email_rejected():
    r = requests.post(f"{API}/win/enter", json=_payload(email="nope"), timeout=20)
    assert r.status_code == 422


def test_consent_required():
    r = requests.post(f"{API}/win/enter", json=_payload(consent=False), timeout=20)
    assert r.status_code == 422


def test_bad_channel_rejected():
    r = requests.post(f"{API}/win/enter", json=_payload(channel="Carrier pigeon"), timeout=20)
    assert r.status_code == 422


def test_honeypot_stores_nothing():
    body = _payload(website="http://spam.example")
    r = requests.post(f"{API}/win/enter", json=body, timeout=20)
    assert r.status_code == 200
    assert "entry_id" not in r.json()


def test_admin_entries_requires_auth():
    r = requests.get(f"{API}/admin/win/entries", timeout=20)
    assert r.status_code in (401, 403)
