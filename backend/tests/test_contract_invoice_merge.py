"""Verify the brief contract PDF appends the paid invoice as final pages."""
import io
import os
import sys
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient


@pytest_asyncio.fixture
async def db():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    yield client[db_name]
    client.close()


def _iso(d):
    return d.isoformat()


@pytest.mark.asyncio
async def test_contract_pdf_merges_paid_invoice_pages(db):
    """When a paid invoice exists for the client, the contract PDF should
    contain MORE pages than when no invoice exists — the invoice PDF
    pages are appended as the final appendix."""
    from brief_contract_routes import _build_contract_pdf
    from pypdf import PdfReader

    client_email = f"merge-test-{uuid.uuid4().hex[:6]}@example.com"
    brief = {
        "id": str(uuid.uuid4()),
        "client_email": client_email,
        "client_name": "Merge Tester",
        "project_name": "Merge Project",
        "status": "approved",
        "phase_summaries": {
            "phase1": {"summary": "<p>Design summary</p>", "approved_at": _iso(datetime.now(timezone.utc))},
            "phase2": {"summary": "<p>Functionality</p>", "approved_at": _iso(datetime.now(timezone.utc))},
            "phase3": {"summary": "<p>Company background</p>", "approved_at": _iso(datetime.now(timezone.utc))},
        },
    }

    # 1. No invoice — baseline page count
    pdf_no_invoice = await _build_contract_pdf(db, brief)
    pages_no_invoice = len(PdfReader(io.BytesIO(pdf_no_invoice)).pages)
    assert pages_no_invoice >= 1

    # 2. Seed a paid invoice for this client
    invoice_doc = {
        "id": str(uuid.uuid4()),
        "invoice_number": "INV-MERGE-0001",
        "client_email": client_email,
        "client_name": "Merge Tester",
        "client_company": "Merge Inc",
        "currency": "USD",
        "amount_subtotal": 1500.0,
        "amount_discount": 0.0,
        "amount_tax": 0.0,
        "amount_total": 1500.0,
        "amount_paid": 1500.0,
        "balance_due": 0.0,
        "line_items": [
            {"description": "Express Launch Package", "quantity": 1, "unit_price": 1500.0, "amount": 1500.0}
        ],
        "status": "paid",
        "issued_at": _iso(datetime.now(timezone.utc)),
        "paid_at": _iso(datetime.now(timezone.utc)),
        "notes": "",
        "metadata": {"package_tier": "express"},
    }
    await db.invoices.insert_one(invoice_doc)
    try:
        pdf_with_invoice = await _build_contract_pdf(db, brief)
        pages_with_invoice = len(PdfReader(io.BytesIO(pdf_with_invoice)).pages)
        # The invoice PDF should add at least one page
        assert pages_with_invoice > pages_no_invoice, (
            f"Expected invoice merge to add pages — got {pages_no_invoice} vs {pages_with_invoice}"
        )
    finally:
        await db.invoices.delete_one({"id": invoice_doc["id"]})
