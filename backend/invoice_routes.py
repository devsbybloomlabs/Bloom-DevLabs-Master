"""Invoice routes — admin CRUD + client-facing list + PDF download.

Endpoints:
    Admin (founder-only):
      GET    /api/admin/invoices                 — list all invoices
      POST   /api/admin/invoices                 — create a manual invoice
      GET    /api/admin/invoices/{invoice_id}    — single invoice details
      PATCH  /api/admin/invoices/{invoice_id}    — update status/notes
      POST   /api/admin/invoices/{invoice_id}/send-email — resend invoice email
      DELETE /api/admin/invoices/{invoice_id}    — void invoice

    Client (token-auth via existing get_current_client):
      GET    /api/clients/invoices               — own invoices
      GET    /api/clients/invoices/{invoice_id}/pdf — branded PDF download
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

import email_service
import invoice_service
from auth import get_current_user
from client_routes import get_current_client
from db_utils import prepare_for_mongo
from models import INVOICE_STATUSES, InvoiceCreateRequest, InvoiceUpdateRequest

log = logging.getLogger("invoices.routes")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Routers attached in server.py
invoice_admin_router = APIRouter(prefix="/admin/invoices", tags=["invoices-admin"])
invoice_client_router = APIRouter(prefix="/clients/invoices", tags=["invoices-client"])


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# ============================================================
# Admin
# ============================================================

@invoice_admin_router.get("")
async def admin_list_invoices(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
    limit: int = 200,
    client_email: str | None = None,
) -> List[Dict[str, Any]]:
    filt: Dict[str, Any] = {}
    if client_email:
        filt["client_email"] = client_email.lower().strip()
    docs = (
        await db.invoices.find(filt, {"_id": 0})
        .sort("issued_at", -1)
        .to_list(limit)
    )
    return docs


@invoice_admin_router.post("")
async def admin_create_invoice(
    req: InvoiceCreateRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not req.line_items:
        raise HTTPException(400, "At least one line item is required")
    inv = await invoice_service.create_manual_invoice(db, req)
    # Cache PDF up-front so the download endpoint is fast.
    try:
        await invoice_service.cache_invoice_pdf(db, inv)
    except Exception as exc:  # pragma: no cover
        log.warning("PDF cache failed for %s: %s", inv["number"], exc)
    if req.send_email:
        try:
            emailit = getattr(request.app.state, "emailit", None)
            invoice_url = (
                f"{invoice_service.BUSINESS_DEFAULTS['website']}/portal/invoices/{inv['id']}"
            )
            # Use APP_BASE_URL for the actual link
            import os
            base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
            invoice_url = f"{base}/portal/invoices/{inv['id']}"
            pdf_url = f"{base}/api/clients/invoices/{inv['id']}/pdf"
            await email_service.send_invoice_issued(
                emailit,
                to=inv["client_email"],
                name=inv.get("client_name") or inv["client_email"].split("@")[0],
                invoice_number=inv["number"],
                amount=f"{inv['total']:.2f}",
                currency=inv["currency"],
                due_date=(inv["due_at"][:10] if isinstance(inv.get("due_at"), str) else
                          inv["due_at"].strftime("%Y-%m-%d") if inv.get("due_at") else None),
                invoice_url=invoice_url,
                pdf_url=pdf_url,
                line_items=[
                    {"description": li["description"], "amount": f"{li['amount']:.2f}"}
                    for li in inv["line_items"]
                ],
            )
        except Exception as exc:  # pragma: no cover
            log.warning("Invoice email send failed: %s", exc)
    return inv


@invoice_admin_router.get("/{invoice_id}")
async def admin_get_invoice(
    invoice_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    doc = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    return doc


@invoice_admin_router.patch("/{invoice_id}")
async def admin_update_invoice(
    invoice_id: str,
    req: InvoiceUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    existing = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Invoice not found")
    patch: Dict[str, Any] = {"updated_at": _now().isoformat()}
    if req.status is not None:
        if req.status not in INVOICE_STATUSES:
            raise HTTPException(
                400, f"status must be one of {', '.join(INVOICE_STATUSES)}"
            )
        patch["status"] = req.status
        if req.status == "paid" and not existing.get("paid_at"):
            patch["paid_at"] = _now().isoformat()
            patch["amount_paid"] = existing["total"]
            patch["balance_due"] = 0.0
        elif req.status == "void":
            patch["balance_due"] = 0.0
    if req.notes is not None:
        patch["notes"] = req.notes
    if req.due_at is not None:
        patch["due_at"] = req.due_at.isoformat()
    if req.paid_at is not None:
        patch["paid_at"] = req.paid_at.isoformat()
    await db.invoices.update_one({"id": invoice_id}, {"$set": prepare_for_mongo(patch)})
    # Re-render PDF on status change so the cached file matches.
    fresh = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    try:
        await invoice_service.cache_invoice_pdf(db, fresh)
    except Exception as exc:  # pragma: no cover
        log.warning("PDF re-render failed for %s: %s", invoice_id, exc)
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@invoice_admin_router.post("/{invoice_id}/send-email")
async def admin_resend_invoice_email(
    invoice_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    import os
    base = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
    res = await email_service.send_invoice_issued(
        getattr(request.app.state, "emailit", None),
        to=inv["client_email"],
        name=inv.get("client_name") or inv["client_email"].split("@")[0],
        invoice_number=inv["number"],
        amount=f"{inv['total']:.2f}",
        currency=inv["currency"],
        due_date=(inv["due_at"][:10] if isinstance(inv.get("due_at"), str) and inv.get("due_at") else None),
        invoice_url=f"{base}/portal/invoices/{inv['id']}",
        pdf_url=f"{base}/api/clients/invoices/{inv['id']}/pdf",
        line_items=[
            {"description": li["description"], "amount": f"{li['amount']:.2f}"}
            for li in inv["line_items"]
        ],
    )
    return {"sent": res.get("ok", False), "error": res.get("error")}


@invoice_admin_router.delete("/{invoice_id}")
async def admin_void_invoice(
    invoice_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    existing = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Invoice not found")
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "status": "void",
            "balance_due": 0.0,
            "voided_at": _now().isoformat(),
            "updated_at": _now().isoformat(),
        }},
    )
    return {"ok": True, "id": invoice_id, "status": "void"}


# Admin PDF download (same renderer, just no client auth)
@invoice_admin_router.get("/{invoice_id}/pdf")
async def admin_invoice_pdf(
    invoice_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
) -> Response:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    pdf_bytes = await invoice_service.render_invoice_pdf(inv)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{inv["number"]}.pdf"',
            "Cache-Control": "private, max-age=60",
        },
    )


# ============================================================
# Client portal
# ============================================================

@invoice_client_router.get("")
async def client_list_invoices(
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> List[Dict[str, Any]]:
    docs = (
        await db.invoices.find({"client_email": client["email"]}, {"_id": 0})
        .sort("issued_at", -1)
        .to_list(100)
    )
    return docs


@invoice_client_router.get("/{invoice_id}")
async def client_get_invoice(
    invoice_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> Dict[str, Any]:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["client_email"] != client["email"]:
        raise HTTPException(403, "Forbidden")
    return inv


@invoice_client_router.get("/{invoice_id}/pdf")
async def client_invoice_pdf(
    invoice_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    client: Dict[str, Any] = Depends(get_current_client),
) -> Response:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["client_email"] != client["email"]:
        raise HTTPException(403, "Forbidden")
    pdf_bytes = await invoice_service.render_invoice_pdf(inv)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{inv["number"]}.pdf"',
            "Cache-Control": "private, max-age=60",
        },
    )
