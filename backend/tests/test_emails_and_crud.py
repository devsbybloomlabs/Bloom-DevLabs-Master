"""Tests for branded email service + admin client CRUD."""
import os
import uuid
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
def token():
    r = requests.post(
        f"{_base()}/api/auth/login",
        json={"email": "founder@thesalvador.group", "password": "admin123"},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip("Admin login failed")
    return r.json()["access_token"]


# ============================================================
# Branded email templates
# ============================================================

@pytest.mark.asyncio
async def test_phase_received_template_includes_brand():
    """Phase confirmation email must render the Bloom Labs shell + button."""
    import email_service
    from unittest.mock import AsyncMock

    fake_emailit = AsyncMock()
    fake_emailit.is_configured = True
    fake_emailit.send_email = AsyncMock(return_value={"ok": True, "status_code": 200})

    res = await email_service.send_phase_received(
        fake_emailit, to="x@example.com", name="Xavier", phase=1
    )
    assert res["ok"] is True
    fake_emailit.send_email.assert_awaited_once()
    call_kwargs = fake_emailit.send_email.call_args.kwargs
    html = call_kwargs["html"]
    assert "Bloom Labs" in html
    assert "Phase 1 received" in html
    assert "Design Language" in html
    assert "Phase 2" in html  # next-step hint
    assert "Continue onboarding" in html


@pytest.mark.asyncio
async def test_phase_3_uses_kickoff_complete_copy():
    import email_service
    from unittest.mock import AsyncMock

    fake = AsyncMock()
    fake.is_configured = True
    fake.send_email = AsyncMock(return_value={"ok": True, "status_code": 200})
    await email_service.send_phase_received(fake, to="x@example.com", name="X", phase=3)
    html = fake.send_email.call_args.kwargs["html"]
    assert "Phase 3" in html
    assert "Kickoff" in html or "kickoff" in html


@pytest.mark.asyncio
async def test_payment_receipt_template_renders_amount_and_installment():
    import email_service
    from unittest.mock import AsyncMock

    fake = AsyncMock()
    fake.is_configured = True
    fake.send_email = AsyncMock(return_value={"ok": True, "status_code": 200})
    await email_service.send_payment_receipt(
        fake,
        to="x@example.com",
        name="X",
        plan_name="Express Launch",
        amount="2997.50",
        currency="USD",
        order_id="ORDER-ABC",
        invoice_number="INV-ABC",
        payment_plan_label="50% now / 50% at launch",
        charge_later="2997.50",
    )
    html = fake.send_email.call_args.kwargs["html"]
    assert "Payment received" in html
    assert "2997.50" in html
    assert "Express Launch" in html
    assert "ORDER-ABC" in html
    assert "INV-ABC" in html
    assert "Balance at launch" in html


@pytest.mark.asyncio
async def test_email_service_safe_when_unconfigured():
    import email_service
    from unittest.mock import MagicMock

    fake = MagicMock()
    fake.is_configured = False
    res = await email_service.send_phase_received(
        fake, to="x@example.com", name="X", phase=1
    )
    assert res["ok"] is False
    assert res["error"] == "emailit_not_configured"


@pytest.mark.asyncio
async def test_email_service_swallows_emailit_exceptions():
    import email_service
    from unittest.mock import AsyncMock

    fake = AsyncMock()
    fake.is_configured = True
    fake.send_email = AsyncMock(side_effect=RuntimeError("boom"))
    res = await email_service.send_phase_received(
        fake, to="x@example.com", name="X", phase=1
    )
    assert res["ok"] is False
    assert "boom" in res["error"]


# ============================================================
# Admin client CRUD
# ============================================================

def test_admin_can_create_update_archive_client(token):
    base = _base()
    headers = {"Authorization": f"Bearer {token}"}
    test_email = f"crud-{uuid.uuid4().hex[:6]}@bybloomlabs.com"

    # CREATE
    r = requests.post(
        f"{base}/api/admin/clients",
        json={
            "email": test_email,
            "name": "CRUD User",
            "company": "Acme",
            "status": "active",
            "send_setup_email": False,  # avoid spamming real mailbox
        },
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["client"]["email"] == test_email
    assert body["client"]["company"] == "Acme"

    # CREATE duplicate → 409
    r = requests.post(
        f"{base}/api/admin/clients",
        json={"email": test_email, "name": "Dup", "send_setup_email": False},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 409

    # PATCH
    r = requests.patch(
        f"{base}/api/admin/clients/{test_email}",
        json={"name": "Updated Name", "company": "Newco", "status": "paused", "notes": "VIP client"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Updated Name"
    assert body["company"] == "Newco"
    assert body["status"] == "paused"
    assert body["notes"] == "VIP client"

    # PATCH invalid status → 400
    r = requests.patch(
        f"{base}/api/admin/clients/{test_email}",
        json={"status": "lolwut"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 400

    # DELETE (soft → archived)
    r = requests.delete(
        f"{base}/api/admin/clients/{test_email}",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["archived"] is True

    # Verify archived in listing
    r = requests.get(f"{base}/api/admin/clients", headers=headers, timeout=15)
    rows = r.json()
    me = next((c for c in rows if c["email"] == test_email), None)
    assert me is not None
    assert me["status"] == "archived"


def test_admin_crud_requires_auth():
    base = _base()
    test_email = f"noauth-{uuid.uuid4().hex[:6]}@bybloomlabs.com"
    for method, body in (
        ("POST", {"email": test_email, "send_setup_email": False}),
        ("PATCH", {"name": "x"}),
        ("DELETE", None),
    ):
        path = f"/api/admin/clients" if method == "POST" else f"/api/admin/clients/{test_email}"
        r = requests.request(method, f"{base}{path}", json=body, timeout=10)
        assert r.status_code in (401, 403), f"{method} {path}: {r.status_code}"


def test_admin_patch_unknown_email_returns_404(token):
    base = _base()
    r = requests.patch(
        f"{base}/api/admin/clients/unknown-{uuid.uuid4().hex}@example.com",
        json={"name": "x"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert r.status_code == 404
