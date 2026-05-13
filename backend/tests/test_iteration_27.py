"""Iteration 27 — Phase A/B/C/D/E backend smoke tests.

Covers:
- Phase C2: /api/clients/me/uploads/logo (size + type + magic-byte rejections)
- Phase E:  /api/admin/google-drive/status, /connect (503), /projects/{id}/toggle (400)
- Regression: /api/admin/integrations/health (no nifty, drive optional)
"""

import io
import os
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wave1-cleanups.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASSWORD = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASSWORD = "clientpass123"
DEMO_PROJECT_ID = "4639b6c7-b520-4fcf-8be8-9fee600074ad"


def _png_bytes(width: int = 1, height: int = 1) -> bytes:
    """Build a tiny valid PNG."""
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    raw = b"\x00" + b"\x00\x00\x00\x00" * width  # one transparent scanline
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client_token():
    r = requests.post(f"{BASE_URL}/api/clients/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"client login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# ---- Phase C2: Logo upload ----------------------------------------------

class TestLogoUpload:
    def test_logo_upload_success_png(self, client_token):
        png = _png_bytes()
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/clients/me/uploads/logo",
            headers={"Authorization": f"Bearer {client_token}"},
            files=files,
            timeout=60,
        )
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert data.get("url", "").startswith("http")
        assert "public_id" in data

    def test_logo_upload_empty_file(self, client_token):
        files = {"file": ("empty.png", io.BytesIO(b""), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/clients/me/uploads/logo",
            headers={"Authorization": f"Bearer {client_token}"},
            files=files,
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 for empty, got {r.status_code}"

    def test_logo_upload_unsupported_pdf(self, client_token):
        files = {"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")}
        r = requests.post(
            f"{BASE_URL}/api/clients/me/uploads/logo",
            headers={"Authorization": f"Bearer {client_token}"},
            files=files,
            timeout=30,
        )
        assert r.status_code == 415, f"expected 415 for pdf, got {r.status_code} {r.text}"

    def test_logo_upload_oversize_413(self, client_token):
        big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (5 * 1024 * 1024 + 100)
        files = {"file": ("big.png", io.BytesIO(big), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/clients/me/uploads/logo",
            headers={"Authorization": f"Bearer {client_token}"},
            files=files,
            timeout=60,
        )
        assert r.status_code == 413, f"expected 413 for >5MB, got {r.status_code}"

    def test_logo_upload_corrupted_magic_bytes(self, client_token):
        # Declared as image/png but body is not a real PNG
        files = {"file": ("fake.png", io.BytesIO(b"not really a png at all"), "image/png")}
        r = requests.post(
            f"{BASE_URL}/api/clients/me/uploads/logo",
            headers={"Authorization": f"Bearer {client_token}"},
            files=files,
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 for bad magic bytes, got {r.status_code}"

    def test_logo_upload_requires_auth(self):
        files = {"file": ("test.png", io.BytesIO(_png_bytes()), "image/png")}
        r = requests.post(f"{BASE_URL}/api/clients/me/uploads/logo", files=files, timeout=30)
        assert r.status_code in (401, 403)


# ---- Phase E: Google Drive routes ----------------------------------------

class TestGoogleDrive:
    def test_drive_status_unconfigured(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/google-drive/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("configured") is False
        assert d.get("connected") is False

    def test_drive_connect_returns_503_when_not_configured(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/google-drive/connect",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
            allow_redirects=False,
        )
        assert r.status_code == 503, f"expected 503 got {r.status_code} {r.text[:200]}"
        assert "not configured" in r.text.lower()

    def test_drive_toggle_400_when_not_connected(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/google-drive/projects/{DEMO_PROJECT_ID}/toggle?enable=true",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"
        assert "connect" in r.text.lower()


# ---- Regression: integrations health -------------------------------------

class TestIntegrationsHealth:
    def test_health_keeps_expected_providers_no_nifty(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/integrations/health",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        # response could be a list or dict — handle both
        if isinstance(body, dict) and "providers" in body:
            providers = {p.get("provider") or p.get("name") for p in body["providers"]}
        elif isinstance(body, list):
            providers = {p.get("provider") or p.get("name") for p in body}
        else:
            providers = set(body.keys()) if isinstance(body, dict) else set()
        # required set
        expected = {"openrouter", "emailit", "paypal", "slack", "google_calendar", "breezedocs"}
        missing = expected - providers
        assert not missing, f"missing providers: {missing}; got {providers}"
        assert "nifty" not in providers


# ---- Phase A1: Onboarding admin reads correct phase3 fields --------------

class TestOnboardingPhase3Fields:
    def test_admin_onboarding_list_accessible(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/onboarding",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=20,
        )
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
