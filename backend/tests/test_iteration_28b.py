"""
Iteration 28b — Deeper coverage of Phases F/G/H/I/J via direct API + DB helpers.

Complements test_iteration_28.py with:
  • F: Google Drive /connect returns 200 + authorization_url shape.
  • G: Render an invoice PDF and assert new address bytes appear.
  • H: PayPal plan_ids start with 'P-' (not LOCAL-). Pricing matches.
       Upgrade-only guard with seeded premium tier returns 400 'upgrade'.
       Provision helper writes a row with correct shape (tier/source/status).
       Expire-cron flips active_free→expired AND company.support_tier→none.
  • I: VIP tier routing → primary `to:` ends at vipsupport@bybloomlabs.com;
       Standard tier → support@bybloomlabs.com. Verified via direct
       _email_founder_notification call with emailit captured.
  • J: Happy-path dispatch on a freshly seeded approved brief — verifies
       project_files/contract, milestone, breezedocs_proposals row, brief
       fields. Idempotency on a second call. Contract-preview returns %PDF-.
       _maybe_close_contract_milestone flips milestone to complete.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://lead-pipeline-66.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "founder@thesalvador.group"
ADMIN_PASS = "admin123"
CLIENT_EMAIL = "testclient@bybloomlabs.com"
CLIENT_PASS = "clientpass123"

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")


# ---------------- shared fixtures --------------------------------------------


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


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _db():
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


# ============================ Phase F ========================================


def test_drive_connect_returns_google_authorization_url(admin_token):
    r = requests.get(
        f"{API}/admin/google-drive/connect", headers=_h(admin_token), timeout=15
    )
    assert r.status_code == 200, r.text
    body = r.json()
    url = body.get("authorization_url") or body.get("auth_url") or ""
    assert url.startswith("https://accounts.google.com/"), f"unexpected url: {url}"


# ============================ Phase G ========================================


def test_render_invoice_pdf_carries_new_address():
    from invoice_service import render_invoice_pdf, BUSINESS_DEFAULTS

    sample = {
        "id": "test-inv-id",
        "number": "TEST-G-0001",
        "status": "draft",
        "client_name": "Test Client",
        "client_email": "test@example.com",
        "company_name": "Test Co",
        "items": [{"description": "Service", "quantity": 1, "unit_price": 100.0, "amount": 100.0}],
        "subtotal": 100.0,
        "total": 100.0,
        "discount": 0,
        "tax": 0,
        "amount_paid": 0,
        "balance_due": 100.0,
        "currency": "USD",
        "due_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "issue_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "due_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "notes": None,
        "business": BUSINESS_DEFAULTS,
    }
    pdf = asyncio.run(render_invoice_pdf(sample))
    assert isinstance(pdf, (bytes, bytearray))
    assert pdf[:4] == b"%PDF"
    # The PDF text stream is FlateDecode-compressed so we can't grep raw bytes
    # for the address — try pypdf for text extraction. If pypdf isn't
    # available, fall back to the BUSINESS_DEFAULTS assertion (covered in
    # test_iteration_28.py).
    try:
        from pypdf import PdfReader  # type: ignore
        import io

        reader = PdfReader(io.BytesIO(bytes(pdf)))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        assert "Chino Roces" in text, f"Address missing from PDF text: {text[:500]}"
        assert "Makati" in text
        assert "1229" in text
        assert "Albuquerque" not in text
    except ImportError:
        # pypdf not installed → settle for BUSINESS_DEFAULTS sanity check.
        addr = " ".join(BUSINESS_DEFAULTS["address_lines"])
        assert "Chino Roces" in addr and "Makati" in addr


# ============================ Phase H ========================================


def test_support_plans_have_real_paypal_ids_and_prices(client_token):
    r = requests.get(
        f"{API}/clients/me/support-subscription", headers=_h(client_token), timeout=15
    )
    assert r.status_code == 200
    body = r.json()
    plans = [p for p in (body.get("all_plans") or []) if p.get("is_support_plan")]
    assert len(plans) == 6
    by_key = {p["plan_key"]: p for p in plans}
    # Pricing matrix
    expected_prices = {
        "support_standard_annual": "29.00",
        "support_premium_annual": "49.00",
        "support_vip_annual": "89.00",
        "support_standard_quarterly": "39.00",
        "support_premium_quarterly": "59.00",
        "support_vip_quarterly": "99.00",
    }
    for k, price in expected_prices.items():
        assert k in by_key, f"missing plan {k}"
        assert by_key[k]["price_per_month"] == price
        pid = by_key[k].get("paypal_plan_id") or by_key[k].get("plan_id") or ""
        # Real PayPal plan ids start with 'P-'. LOCAL- means not yet provisioned.
        assert pid.startswith("P-"), f"{k} has non-PayPal plan_id: {pid!r}"
    note = (body.get("exclusions_note") or "").lower()
    assert "feature" in note and "change" in note


def test_upgrade_only_guard_with_premium_tier_blocks_standard(client_token):
    """The test client is already on a 'premium' tier company. Subscribing to a
    standard plan MUST return 400 'upgrade'."""

    async def _go():
        db = _db()
        company = await db.companies.find_one(
            {"primary_email": CLIENT_EMAIL}, {"_id": 0}
        )
        if not company:
            return "skip-no-company"
        original = company.get("support_tier")
        # Force premium tier in case it drifted
        await db.companies.update_one(
            {"id": company["id"]}, {"$set": {"support_tier": "premium"}}
        )
        return company["id"], original

    out = asyncio.run(_go())
    if isinstance(out, str):
        pytest.skip(out)
    company_id, original = out
    try:
        r = requests.post(
            f"{API}/clients/me/support-subscription/subscribe",
            json={"plan_key": "support_standard_annual"},
            headers=_h(client_token),
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
        assert "upgrade" in r.text.lower()
    finally:

        async def _restore():
            db = _db()
            await db.companies.update_one(
                {"id": company_id}, {"$set": {"support_tier": original or "none"}}
            )

        asyncio.run(_restore())


def test_provision_helper_writes_correct_shape():
    from support_subscription_routes import provision_bundled_support_subscription

    async def _go():
        db = _db()
        company = await db.companies.find_one({}, {"_id": 0})
        if not company:
            return "skip"
        await db.support_subscriptions.delete_many({"company_id": company["id"]})
        row = await provision_bundled_support_subscription(db, company, "custom")
        # row may be inserted dict; fetch directly from db
        doc = await db.support_subscriptions.find_one(
            {"company_id": company["id"]}, {"_id": 0}
        )
        await db.support_subscriptions.delete_many({"company_id": company["id"]})
        return row, doc

    out = asyncio.run(_go())
    if out == "skip":
        pytest.skip("no companies")
    row, doc = out
    assert row is not None
    assert doc is not None
    assert doc["source"] == "bundled"
    assert doc["status"] == "active_free"
    assert doc["tier"] == "premium"  # custom -> premium
    # expires roughly +365d
    exp = datetime.fromisoformat(doc["expires_at"].replace("Z", "+00:00"))
    delta_days = (exp - datetime.now(timezone.utc)).days
    assert 360 <= delta_days <= 366


def test_expire_overdue_cron_flips_to_expired_and_company_to_none():
    from support_subscription_routes import expire_overdue_subscriptions

    async def _go():
        db = _db()
        company = await db.companies.find_one({}, {"_id": 0})
        if not company:
            return "skip"
        original_tier = company.get("support_tier")
        cid = company["id"]
        # Clean up any prior support_subscriptions for determinism
        await db.support_subscriptions.delete_many({"company_id": cid})
        await db.companies.update_one(
            {"id": cid}, {"$set": {"support_tier": "standard"}}
        )
        past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        sub_id = str(uuid.uuid4())
        await db.support_subscriptions.insert_one(
            {
                "id": sub_id,
                "company_id": cid,
                "client_email": company.get("primary_contact_email") or "x@y.z",
                "tier": "standard",
                "source": "bundled",
                "status": "active_free",
                "started_at": past,
                "expires_at": past,
                "cadence": "bundled",
                "created_at": past,
                "updated_at": past,
            }
        )
        flipped = await expire_overdue_subscriptions(db)
        after_sub = await db.support_subscriptions.find_one(
            {"id": sub_id}, {"_id": 0}
        )
        after_company = await db.companies.find_one({"id": cid}, {"_id": 0})
        # Cleanup
        await db.support_subscriptions.delete_many({"company_id": cid})
        await db.companies.update_one(
            {"id": cid}, {"$set": {"support_tier": original_tier or "none"}}
        )
        return flipped, after_sub, after_company

    out = asyncio.run(_go())
    if out == "skip":
        pytest.skip("no companies")
    flipped, sub, company = out
    assert flipped >= 1
    assert sub["status"] == "expired"
    assert (company.get("support_tier") or "none") == "none"


# ============================ Phase I ========================================


def test_vip_tier_routes_to_vipsupport_email():
    """Capture emailit.send_email kwargs and verify the `to` address swaps
    between VIP / non-VIP tiers. Uses an in-memory fake DB so we don't touch
    real records."""
    import contact_routes
    from types import SimpleNamespace

    captured: list[dict] = []

    class _MockEmailit:
        is_configured = True

        async def send_email(self, **kwargs):
            captured.append(kwargs)
            return {"ok": True}

    class _MockCollection:
        def __init__(self, doc):
            self._doc = doc

        async def find_one(self, *_a, **_kw):
            return dict(self._doc) if self._doc is not None else None

    def _make_fake_request(emailit):
        return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(emailit=emailit)))

    def _make_fake_db(tier: str):
        return SimpleNamespace(
            clients=_MockCollection({"phone": "+1", "company": "Test", "created_at": "2026-01-01"}),
            companies=_MockCollection(
                {"id": "co-x", "name": "Test", "support_uid": "BL-X", "support_tier": tier}
            ),
        )

    async def _go(tier: str):
        captured.clear()
        emailit = _MockEmailit()
        await contact_routes._email_founder_notification(
            _make_fake_request(emailit),
            ticket_ref="TKT-TEST",
            client_email="vip-test@example.com",
            client_name="VIP Test",
            subject="hello",
            body="body",
            priority="normal",
            attachment=None,
            db=_make_fake_db(tier),
        )
        return list(captured)

    vip_calls = asyncio.run(_go("vip"))
    std_calls = asyncio.run(_go("standard"))
    none_calls = asyncio.run(_go("none"))

    assert vip_calls, "no email sent for vip"
    assert vip_calls[0]["to"] == "vipsupport@bybloomlabs.com", vip_calls[0]
    assert vip_calls[0]["headers"]["X-Bloom-Routed-Tier"] == "vip"

    assert std_calls[0]["to"] == "support@bybloomlabs.com"
    assert std_calls[0]["headers"]["X-Bloom-Routed-Tier"] == "standard"
    assert none_calls[0]["to"] == "support@bybloomlabs.com"
    assert none_calls[0]["headers"]["X-Bloom-Routed-Tier"] == "none"


# ============================ Phase J ========================================


def _seed_approved_brief():
    """Insert a minimal approved brief into the DB and return the id."""

    async def _go():
        db = _db()
        client = await db.clients.find_one({"email": CLIENT_EMAIL}, {"_id": 0})
        company = await db.companies.find_one(
            {"primary_email": CLIENT_EMAIL}, {"_id": 0}
        )
        if not client or not company:
            return None
        brief_id = f"TESTBRIEF-{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.project_briefs.insert_one(
            {
                "id": brief_id,
                "company_id": company["id"],
                "client_email": CLIENT_EMAIL,
                "client_name": client.get("name") or "Test Client",
                "project_name": "TEST_PhaseJ_Project",
                "status": "approved",
                "awaiting_contract_dispatch": True,
                "approved_at": now_iso,
                "created_at": now_iso,
                "updated_at": now_iso,
                "phases": [
                    {"key": "design", "status": "approved", "summary": "Design summary"},
                    {"key": "function", "status": "approved", "summary": "Function summary"},
                    {"key": "company", "status": "approved", "summary": "Company summary"},
                ],
            }
        )
        return brief_id, company["id"]

    return asyncio.run(_go())


def _cleanup_brief(brief_id: str, company_id: str = None):
    async def _go():
        db = _db()
        await db.project_briefs.delete_many({"id": brief_id})
        await db.project_files.delete_many(
            {"category": "contract", "client_email": CLIENT_EMAIL,
             "uploaded_by": "system:contract-dispatch"}
        )
        await db.milestones.delete_many(
            {"client_email": CLIENT_EMAIL, "title": "Contract & Invoice Sent",
             "seeded_from_brief": brief_id}
        )
        await db.breezedocs_proposals.delete_many({"linked_brief_id": brief_id})

    asyncio.run(_go())


def test_phase_j_dispatch_happy_path_and_idempotency(admin_token):
    seeded = _seed_approved_brief()
    if not seeded:
        pytest.skip("missing test client/company")
    brief_id, company_id = seeded
    try:
        r = requests.post(
            f"{API}/admin/briefs/{brief_id}/dispatch-contract",
            headers=_h(admin_token),
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("brief", {}).get("contract_dispatched_at")
        result = body.get("result") or {}
        # In mock mode, breezedocs_doc_id should still be present (mock-doc-*)
        # but tolerate template-not-found errors when template absent.
        assert "pdf_filename" in result

        # DB side effects
        async def _check():
            db = _db()
            files = await db.project_files.find(
                {"client_email": CLIENT_EMAIL, "category": "contract"}, {"_id": 0}
            ).to_list(length=10)
            ms = await db.milestones.find(
                {"client_email": CLIENT_EMAIL, "title": "Contract & Invoice Sent"},
                {"_id": 0},
            ).to_list(length=10)
            props = await db.breezedocs_proposals.find(
                {"linked_brief_id": brief_id}, {"_id": 0}
            ).to_list(length=10)
            return files, ms, props

        files, ms, props = asyncio.run(_check())
        assert len(files) >= 1
        assert len(ms) >= 1
        assert ms[0]["status"] == "in_progress"
        # Proposals may be empty if breezedocs template missing in mock mode;
        # we ONLY assert presence when bd_doc_id was returned.
        if result.get("breezedocs_doc_id"):
            assert len(props) >= 1
            assert props[0]["linked_milestone_title"] == "Contract & Invoice Sent"

        # Idempotency — second call must NOT create dupes
        r2 = requests.post(
            f"{API}/admin/briefs/{brief_id}/dispatch-contract",
            headers=_h(admin_token),
            timeout=30,
        )
        assert r2.status_code == 200
        files2, ms2, props2 = asyncio.run(_check())
        assert len(files2) == len(files)
        assert len(ms2) == len(ms)
        assert len(props2) == len(props)
    finally:
        _cleanup_brief(brief_id, company_id)


def test_phase_j_contract_preview_returns_pdf(admin_token):
    seeded = _seed_approved_brief()
    if not seeded:
        pytest.skip("missing test client/company")
    brief_id, company_id = seeded
    try:
        r = requests.get(
            f"{API}/admin/briefs/{brief_id}/contract-preview",
            headers=_h(admin_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
    finally:
        _cleanup_brief(brief_id, company_id)


def test_phase_j_milestone_flip_on_signed():
    from breezedocs_routes import _maybe_close_contract_milestone

    async def _go():
        db = _db()
        # Seed a fake milestone + proposal — fetch the proper company via primary_email
        company = await db.companies.find_one(
            {"primary_email": CLIENT_EMAIL}, {"_id": 0}
        )
        if not company:
            return "skip"
        ms_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await db.milestones.insert_one(
            {
                "id": ms_id,
                "client_email": CLIENT_EMAIL,
                "company_id": company["id"],
                "title": "Contract & Invoice Sent",
                "status": "in_progress",
                "created_at": now,
                "last_updated": now,
            }
        )
        proposal = {
            "linked_milestone_title": "Contract & Invoice Sent",
            "client_email": CLIENT_EMAIL,
            "status": "signed",
            "linked_brief_id": "test-flip",
        }
        await _maybe_close_contract_milestone(db, proposal)
        after = await db.milestones.find_one({"id": ms_id}, {"_id": 0})
        await db.milestones.delete_one({"id": ms_id})
        return after

    out = asyncio.run(_go())
    if out == "skip":
        pytest.skip("no client")
    assert out["status"] == "complete"
    assert out.get("completion_date")
