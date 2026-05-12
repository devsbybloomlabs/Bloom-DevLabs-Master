"""Invoice service — number generation, branded PDF rendering, auto-generation.

Replaces AgencyHandy's invoicing surface with a fully in-house alternative
that we own end-to-end and can re-brand without touching a third-party app.

Public API:
    await get_or_create_invoice_for_capture(db, transaction_doc) -> Invoice dict
    await create_manual_invoice(db, req: InvoiceCreateRequest) -> Invoice dict
    await render_invoice_pdf(invoice: dict, business: dict) -> bytes (PDF)
    next_invoice_number(db) -> str (INV-2026-0042)
"""
from __future__ import annotations

import io
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from db_utils import prepare_for_mongo
from models import Invoice, InvoiceCreateRequest, InvoiceLineItem

log = logging.getLogger("invoices")


def _now() -> datetime:
    return datetime.now(timezone.utc)


BUSINESS_DEFAULTS: Dict[str, Any] = {
    "legal_name": "Bloom Development Labs Corp.",
    "trading_name": "Bloom Labs",
    "address_lines": [
        "1209 Mountain Road Pl NE Ste H",
        "Albuquerque, NM 87110",
        "United States",
    ],
    "email": "billing@bybloomlabs.com",
    "website": "bybloomlabs.com",
    "tax_id": "EIN 33-4218790",
    "logo_url": (
        "https://customer-assets.emergentagent.com/job_6ae936eb-6f62-4e1a-8f50-8423b436560b/"
        "artifacts/blmz5br3_Logo%20-%20Full%20-%20Light.png"
    ),
    "primary_color": "#1E3A8A",
    "muted_color": "#475569",
    "border_color": "#E2E8F0",
}

INVOICE_PDF_DIR = Path(os.environ.get("INVOICES_DIR", "/app/backend/uploads/invoices"))


def _ensure_pdf_dir() -> Path:
    """Lazily create the PDF cache dir on first use; tolerant of readonly FS."""
    try:
        INVOICE_PDF_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # pragma: no cover
        log.warning("Could not create INVOICE_PDF_DIR %s: %s", INVOICE_PDF_DIR, exc)
    return INVOICE_PDF_DIR


async def next_invoice_number(db: AsyncIOMotorDatabase) -> str:
    """Atomically increment a counter and return INV-{YYYY}-{NNNN}.

    Counter is stored at app_settings.invoice_counter so we never get duplicates
    even under concurrent captures. Resets per calendar year.
    """
    year = _now().year
    res = await db.app_settings.find_one_and_update(
        {"_id": f"invoice_counter:{year}"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    seq = (res or {}).get("value", 1)
    return f"INV-{year}-{seq:04d}"


async def get_or_create_invoice_for_capture(
    db: AsyncIOMotorDatabase, transaction: Dict[str, Any]
) -> Dict[str, Any]:
    """Generate (or fetch) the invoice linked to a captured PayPal order.

    Idempotent — same order_id always returns the same invoice row. Useful
    when the PayPal webhook captures the same event twice.
    """
    order_id = transaction.get("id")
    if not order_id:
        raise ValueError("transaction.id is required")
    existing = await db.invoices.find_one({"paypal_order_id": order_id}, {"_id": 0})
    if existing:
        return existing

    amount = float(transaction.get("amount") or 0)
    currency = transaction.get("currency") or "USD"
    plan_name = transaction.get("description") or "Bloom Labs Service"
    payer_email = transaction.get("customer_email") or ""
    payer_name = transaction.get("customer_name") or (payer_email.split("@")[0] if payer_email else "")
    if not payer_email:
        raise ValueError("Cannot generate invoice without a customer email")

    line = InvoiceLineItem(
        description=plan_name,
        quantity=1.0,
        unit_price=amount,
        amount=amount,
    )

    inv = Invoice(
        number=await next_invoice_number(db),
        client_email=payer_email,
        client_name=payer_name,
        client_company=None,
        issued_at=_now(),
        due_at=None,
        paid_at=_now() if transaction.get("status") == "COMPLETED" else None,
        status="paid" if transaction.get("status") == "COMPLETED" else "issued",
        currency=currency,
        subtotal=amount,
        discount=0.0,
        tax=0.0,
        total=amount,
        amount_paid=amount if transaction.get("status") == "COMPLETED" else 0.0,
        balance_due=0.0 if transaction.get("status") == "COMPLETED" else amount,
        line_items=[line],
        notes=transaction.get("plan_label") or None,
        source="paypal_order",
        paypal_order_id=order_id,
    )
    await db.invoices.insert_one(prepare_for_mongo(inv.model_dump()))
    return inv.model_dump()


async def create_manual_invoice(
    db: AsyncIOMotorDatabase, req: InvoiceCreateRequest
) -> Dict[str, Any]:
    """Admin-driven invoice (e.g. ad-hoc consulting hours, add-on)."""
    subtotal = sum(float(li.quantity) * float(li.unit_price) for li in req.line_items)
    # Normalize each line's `amount` so admins don't have to pre-compute it.
    normalized_items: List[InvoiceLineItem] = []
    for li in req.line_items:
        amt = float(li.quantity) * float(li.unit_price)
        normalized_items.append(
            InvoiceLineItem(
                description=li.description,
                quantity=li.quantity,
                unit_price=li.unit_price,
                amount=round(amt, 2),
            )
        )
    total = round(subtotal - float(req.discount) + float(req.tax), 2)
    inv = Invoice(
        number=await next_invoice_number(db),
        client_email=req.client_email,
        client_name=req.client_name,
        client_company=req.client_company,
        issued_at=_now(),
        due_at=req.due_at,
        status="issued",
        currency=req.currency,
        subtotal=round(subtotal, 2),
        discount=round(float(req.discount), 2),
        tax=round(float(req.tax), 2),
        total=total,
        amount_paid=0.0,
        balance_due=total,
        line_items=normalized_items,
        notes=req.notes,
        source="manual",
    )
    await db.invoices.insert_one(prepare_for_mongo(inv.model_dump()))
    return inv.model_dump()


# ============================================================
# PDF rendering (branded, single-page)
# ============================================================

def _money(amount: float, currency: str = "USD") -> str:
    sym = {"USD": "$", "EUR": "€", "GBP": "£", "CAD": "$"}.get(currency, currency + " ")
    return f"{sym}{amount:,.2f}" if sym.endswith(" ") is False else f"{sym}{amount:,.2f}"


def _fmt_date(dt: Optional[datetime]) -> str:
    if not dt:
        return "—"
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return dt
    return dt.strftime("%b %d, %Y")


def _build_invoice_html(invoice: Dict[str, Any], business: Dict[str, Any]) -> str:
    line_items_html = "".join(
        f"""
        <tr>
          <td>{li['description']}</td>
          <td class="num">{li.get('quantity', 1):g}</td>
          <td class="num">{_money(float(li.get('unit_price') or 0), invoice['currency'])}</td>
          <td class="num strong">{_money(float(li.get('amount') or 0), invoice['currency'])}</td>
        </tr>
        """
        for li in invoice.get("line_items", [])
    )
    address_html = "<br/>".join(business["address_lines"])
    status_label = {
        "paid": "PAID",
        "issued": "DUE",
        "draft": "DRAFT",
        "void": "VOID",
        "overdue": "OVERDUE",
        "partial": "PARTIAL",
    }.get(invoice["status"], invoice["status"].upper())
    status_color = {
        "paid": "#059669",
        "issued": "#1E3A8A",
        "draft": "#64748B",
        "void": "#94A3B8",
        "overdue": "#DC2626",
        "partial": "#D97706",
    }.get(invoice["status"], "#1E3A8A")
    notes_html = (
        f'<div class="notes-block"><div class="muted-label">Notes</div>'
        f'<div class="notes-body">{invoice["notes"]}</div></div>'
        if invoice.get("notes")
        else ""
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Invoice {invoice['number']}</title>
<style>
  @page {{ size: A4; margin: 24mm 20mm; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; font-size: 11pt; line-height: 1.55; margin: 0; }}
  h1 {{ font-family: "Bricolage Grotesque", "Inter", sans-serif; font-size: 28pt; font-weight: 700; color: {business['primary_color']}; margin: 0 0 4px; letter-spacing: -0.02em; }}
  .muted-label {{ text-transform: uppercase; font-size: 8pt; letter-spacing: 0.14em; color: {business['muted_color']}; margin-bottom: 4px; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 24px; border-bottom: 2px solid {business['border_color']}; }}
  .header-left img {{ height: 36px; margin-bottom: 12px; }}
  .header-left .biz-name {{ font-weight: 700; font-size: 12pt; color: #0F172A; }}
  .header-left .biz-meta {{ color: {business['muted_color']}; font-size: 9pt; line-height: 1.6; margin-top: 4px; }}
  .header-right {{ text-align: right; }}
  .invoice-number {{ font-family: "Bricolage Grotesque", monospace; font-size: 14pt; font-weight: 600; color: {business['primary_color']}; margin-bottom: 8px; }}
  .status-pill {{ display: inline-block; padding: 5px 12px; border-radius: 6px; background: {status_color}; color: white; font-weight: 700; font-size: 9pt; letter-spacing: 0.08em; }}
  .meta-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }}
  .meta-block .biz-name {{ font-weight: 600; font-size: 11pt; color: #0F172A; margin-top: 4px; }}
  .meta-block .small {{ color: {business['muted_color']}; font-size: 9pt; margin-top: 2px; }}
  table.items {{ width: 100%; border-collapse: collapse; margin: 12px 0 24px; }}
  table.items thead th {{ text-align: left; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.14em; color: {business['muted_color']}; padding: 10px 8px; border-bottom: 2px solid {business['border_color']}; font-weight: 600; }}
  table.items th.num, table.items td.num {{ text-align: right; }}
  table.items td {{ padding: 12px 8px; border-bottom: 1px solid {business['border_color']}; font-size: 10pt; }}
  table.items td.strong {{ font-weight: 600; }}
  .totals {{ width: 280px; margin-left: auto; margin-top: 8px; }}
  .totals .row {{ display: flex; justify-content: space-between; padding: 6px 0; font-size: 10pt; color: {business['muted_color']}; }}
  .totals .row.total {{ border-top: 2px solid #0F172A; margin-top: 8px; padding-top: 14px; font-size: 13pt; font-weight: 700; color: #0F172A; }}
  .notes-block {{ margin-top: 32px; padding: 16px 18px; border-left: 3px solid {business['primary_color']}; background: #F8FAFC; border-radius: 6px; }}
  .notes-body {{ font-size: 10pt; color: {business['muted_color']}; }}
  .footer {{ margin-top: 48px; padding-top: 18px; border-top: 1px solid {business['border_color']}; font-size: 8pt; color: #94A3B8; text-align: center; }}
</style></head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="{business['logo_url']}" alt="{business['trading_name']}"/>
      <div class="biz-name">{business['trading_name']}</div>
      <div class="biz-meta">{business['legal_name']}<br/>{address_html}<br/>{business['email']} · {business['website']}<br/>{business['tax_id']}</div>
    </div>
    <div class="header-right">
      <h1>INVOICE</h1>
      <div class="invoice-number">{invoice['number']}</div>
      <div class="status-pill">{status_label}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-block">
      <div class="muted-label">Bill to</div>
      <div class="biz-name">{invoice.get('client_name') or invoice['client_email']}</div>
      {f'<div class="small">{invoice["client_company"]}</div>' if invoice.get('client_company') else ''}
      <div class="small">{invoice['client_email']}</div>
    </div>
    <div class="meta-block" style="text-align:right;">
      <div class="muted-label">Issued</div>
      <div class="biz-name">{_fmt_date(invoice.get('issued_at'))}</div>
      <div class="small">{('Due ' + _fmt_date(invoice.get('due_at'))) if invoice.get('due_at') else ('Paid ' + _fmt_date(invoice['paid_at']) if invoice.get('paid_at') else 'Due on receipt')}</div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      {line_items_html}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>{_money(invoice['subtotal'], invoice['currency'])}</span></div>
    {f'<div class="row"><span>Discount</span><span>−{_money(invoice["discount"], invoice["currency"])}</span></div>' if float(invoice.get('discount') or 0) > 0 else ''}
    {f'<div class="row"><span>Tax</span><span>{_money(invoice["tax"], invoice["currency"])}</span></div>' if float(invoice.get('tax') or 0) > 0 else ''}
    <div class="row total"><span>Total</span><span>{_money(invoice['total'], invoice['currency'])}</span></div>
    {f'<div class="row" style="color:#059669;font-weight:600;"><span>Amount paid</span><span>−{_money(invoice["amount_paid"], invoice["currency"])}</span></div>' if float(invoice.get('amount_paid') or 0) > 0 else ''}
    {f'<div class="row total" style="border-top:1px solid {business["border_color"]};font-size:11pt;"><span>Balance due</span><span>{_money(invoice["balance_due"], invoice["currency"])}</span></div>' if float(invoice.get('balance_due') or 0) > 0 else ''}
  </div>

  {notes_html}

  <div class="footer">
    Thank you for your business. Questions? Reply to {business['email']} or visit {business['website']}.
  </div>
</body></html>"""


async def render_invoice_pdf(
    invoice: Dict[str, Any], business: Optional[Dict[str, Any]] = None
) -> bytes:
    """Render the branded invoice HTML to a PDF byte string via WeasyPrint."""
    from weasyprint import HTML  # local import keeps cold-start fast

    html = _build_invoice_html(invoice, business or BUSINESS_DEFAULTS)
    buf = io.BytesIO()
    HTML(string=html, base_url="https://bybloomlabs.com").write_pdf(buf)
    return buf.getvalue()


async def cache_invoice_pdf(db: AsyncIOMotorDatabase, invoice: Dict[str, Any]) -> str:
    """Render + persist the PDF locally and update `pdf_path` on the doc."""
    pdf_bytes = await render_invoice_pdf(invoice)
    out_dir = _ensure_pdf_dir()
    rel_name = f"{invoice['number']}.pdf"
    abs_path = out_dir / rel_name
    try:
        abs_path.write_bytes(pdf_bytes)
        rel_path = str(abs_path)
    except OSError as exc:
        log.warning("Could not write invoice PDF %s: %s", abs_path, exc)
        return ""
    await db.invoices.update_one(
        {"id": invoice["id"]},
        {"$set": {"pdf_path": rel_path, "updated_at": _now().isoformat()}},
    )
    return rel_path
