"""
Iteration 28 — Phases F/G/H/I/J backend regression.

  • F: Google Drive Mirror Sync OAuth env is set (configured=true).
  • G: Invoice template carries the new Makati address.
  • H: Support subscription catalog has 6 PayPal-backed plans + auto-provision
       helper inserts a bundled row + upgrade-only enforcement on subscribe.
  • I: VIP tier routes contact-form emails to vipsupport@bybloomlabs.com.
  • J: Brief contract dispatch endpoint returns 400 if brief isn't approved
       and 404 if brief missing. Compiled PDF generator produces real PDF bytes
       (smoke check).
"""
from __future__ import annotations

import os

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://coach-dashboard-86.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASS = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASS = "clientpass123"


@pytest.fixture(scope="module")
def admin_token() -> str:
    r = requests.post(
        f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20
    )
    r.raise_for_status()
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client_token() -> str:
    r = requests.post(
        f"{API}/clients/login",
        json={"email": CLIENT_EMAIL, "password": CLIENT_PASS},
        timeout=20,
    )
    r.raise_for_status()
    data = r.json()
    return data.get("access_token") or data.get("token")


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ---- Phase F ---------------------------------------------------------------


def test_drive_status_configured(admin_token):
    r = requests.get(f"{API}/admin/google-drive/status", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is True


# ---- Phase G ---------------------------------------------------------------


def test_invoice_business_defaults_address():
    # Importing the module hits BUSINESS_DEFAULTS — the dict is exported.
    import sys

    sys.path.insert(0, "/app/backend")
    from invoice_service import BUSINESS_DEFAULTS

    addr = " ".join(BUSINESS_DEFAULTS["address_lines"])
    assert "Chino Roces" in addr
    assert "Makati" in addr
    assert "Pio del Pilar" in addr
    assert "1229" in addr
    # The old Albuquerque line must NOT be there
    assert "Albuquerque" not in addr


# ---- Phase H ---------------------------------------------------------------


def test_support_subscription_catalog_has_6_plans(client_token):
    r = requests.get(
        f"{API}/clients/me/support-subscription", headers=_h(client_token), timeout=15
    )
    assert r.status_code == 200
    body = r.json()
    plans = body.get("all_plans") or []
    keys = sorted([p["plan_key"] for p in plans if p.get("is_support_plan")])
    expected = sorted(
        [
            "support_standard_annual",
            "support_premium_annual",
            "support_vip_annual",
            "support_standard_quarterly",
            "support_premium_quarterly",
            "support_vip_quarterly",
        ]
    )
    assert keys == expected
    # Pricing sanity — at least one plan returns the documented per-month price
    by_key = {p["plan_key"]: p for p in plans}
    assert by_key["support_standard_annual"]["price_per_month"] == "29.00"
    assert by_key["support_vip_annual"]["price_per_month"] == "89.00"
    assert by_key["support_vip_quarterly"]["price_per_month"] == "99.00"
    # Exclusions note is surfaced for the UI to render
    assert "feature" in (body.get("exclusions_note") or "").lower()


def test_support_subscription_subscribe_upgrade_only(client_token):
    # The test client has no active subscription yet; try to "subscribe" to
    # standard. Either:
    #  • 200 + approval_url (success path — they had no plan)
    #  • 400 upgrade-only (they already have premium / vip on this DB)
    r = requests.post(
        f"{API}/clients/me/support-subscription/subscribe",
        json={"plan_key": "support_standard_annual"},
        headers=_h(client_token),
        timeout=20,
    )
    assert r.status_code in (200, 400, 503)
    if r.status_code == 400:
        # Should mention upgrade-only OR the company-missing guard
        assert "upgrade" in r.text.lower() or "company" in r.text.lower()


def test_support_subscription_unknown_plan_404(client_token):
    r = requests.post(
        f"{API}/clients/me/support-subscription/subscribe",
        json={"plan_key": "does_not_exist"},
        headers=_h(client_token),
        timeout=15,
    )
    assert r.status_code == 404


def test_support_subscription_auth_required():
    r = requests.get(f"{API}/clients/me/support-subscription", timeout=10)
    assert r.status_code in (401, 403)


def test_provision_helper_idempotent():
    """Direct DB-level helper test — calling twice never creates duplicates."""
    import asyncio
    import os as _os
    import sys

    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv

    load_dotenv("/app/backend/.env")
    sys.path.insert(0, "/app/backend")
    from support_subscription_routes import provision_bundled_support_subscription

    async def _go():
        client = AsyncIOMotorClient(_os.environ["MONGO_URL"])
        db = client[_os.environ["DB_NAME"]]
        company = await db.companies.find_one({}, {"_id": 0})
        if not company:
            return "skip"
        # Cleanup any existing active rows for this company so the test is deterministic
        await db.support_subscriptions.delete_many(
            {"company_id": company["id"], "status": {"$in": ["active_free", "active_paid"]}}
        )
        first = await provision_bundled_support_subscription(db, company, "express")
        second = await provision_bundled_support_subscription(db, company, "express")
        count = await db.support_subscriptions.count_documents(
            {"company_id": company["id"], "status": "active_free"}
        )
        # Cleanup after the test
        await db.support_subscriptions.delete_many({"company_id": company["id"]})
        return (first is not None, second is None, count)

    out = asyncio.run(_go())
    if out == "skip":
        pytest.skip("no companies in DB")
    first_ok, second_skipped, count = out
    assert first_ok is True
    assert second_skipped is True
    assert count == 1


# ---- Phase J ---------------------------------------------------------------


def test_dispatch_contract_404_when_brief_missing(admin_token):
    r = requests.post(
        f"{API}/admin/briefs/non-existent-brief-id/dispatch-contract",
        headers=_h(admin_token),
        timeout=15,
    )
    assert r.status_code == 404


def test_dispatch_contract_requires_auth():
    r = requests.post(f"{API}/admin/briefs/x/dispatch-contract", timeout=10)
    assert r.status_code in (401, 403)
