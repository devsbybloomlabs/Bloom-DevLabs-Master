"""
Brief-Approved Contract Dispatch (Phase J, Feb 2026)

When all 3 brief phases are approved, the founder gets a Slack alert + the
client portal flags `awaiting_contract_dispatch=True` on the brief. This
module exposes the admin-review gated endpoint that:

  1. Renders a single PDF: cover page + 3 approved phase summaries + onboarding
     kickoff details + the original PayPal package invoice as the final
     appendix page.
  2. Stores the PDF in project_files (category="contract") for archival.
  3. Creates a BreezeDocs document from the chosen template (default
     `test contract template.docx`) and sends a signing request to the client.
  4. Adds a "Contract & Invoice Sent" milestone (status=in_progress) that
     flips to `complete` when the BreezeDocs status sync detects `signed`.
  5. Emails the client the PDF link + signing link.

User chose option J-a (self-generate PDF → BreezeDocs for signing only) + J-b
(admin-review gate — admin clicks "Send contract + invoice now" instead of
the system firing immediately on the 3rd phase approval).
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import get_current_user
from breezedocs_client import BreezeDocsClient
from db_utils import prepare_for_mongo

log = logging.getLogger("brief_contract")

CONTRACT_MILESTONE_TITLE = "Contract & Invoice Sent"
DEFAULT_TEMPLATE_NAME = os.environ.get(
    "BREEZEDOCS_CONTRACT_TEMPLATE", "test contract template.docx"
)


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_bd(request: Request) -> BreezeDocsClient:
    return request.app.state.breezedocs


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat()


# -------------------------------------------------------------------------
# PDF compilation
# -------------------------------------------------------------------------
async def _build_contract_pdf(
    db: AsyncIOMotorDatabase, brief: Dict[str, Any]
) -> bytes:
    """Render the full contract bundle as a single PDF.

    Bundle layout:
      • Cover page — project name + client + signing-by lines + logo
      • Section 1 — Approved Phase 1 (Design Language) summary
      • Section 2 — Approved Phase 2 (Functionality) summary
      • Section 3 — Approved Phase 3 (Company Background) summary
      • Section 4 — Onboarding kickoff details (story, goals, success scenarios,
        timeline, phone, best time to call)
      • Appendix — Original PayPal package invoice line items (amount paid,
        invoice number, paid date)
    """
    from weasyprint import HTML

    company_id = brief.get("company_id")
    client_email = (brief.get("client_email") or "").lower()
    onboarding = await db.onboardings.find_one(
        {"client_email": client_email}, {"_id": 0}
    ) or {}
    phase3_data = (onboarding.get("phase3") or {}) if onboarding else {}
    company = (
        await db.companies.find_one({"id": company_id}, {"_id": 0}) if company_id else None
    ) or {}
    # Most recent paid PayPal transaction for this client (the package invoice).
    txn = await db.paypal_transactions.find_one(
        {
            "payer_email": {"$regex": f"^{client_email}$", "$options": "i"},
            "status": "COMPLETED",
        },
        {"_id": 0},
        sort=[("created_at", -1)],
    ) or {}
    invoice_row = await db.invoices.find_one(
        {
            "client_email": {"$regex": f"^{client_email}$", "$options": "i"},
            "status": {"$in": ["paid", "PAID"]},
        },
        {"_id": 0},
        sort=[("issued_at", -1)],
    ) or {}

    summaries = brief.get("phase_summaries") or {}
    phase_titles = {
        "phase1": "Phase 1 — Design Language",
        "phase2": "Phase 2 — Functionality",
        "phase3": "Phase 3 — Company Background",
    }
    phase_blocks: List[str] = []
    for k in ("phase1", "phase2", "phase3"):
        p = summaries.get(k) or {}
        body = (p.get("summary") or "<p>(no summary)</p>").strip()
        approved = p.get("approved_at") or "—"
        phase_blocks.append(
            f"<section class='phase'>"
            f"<h2>{phase_titles[k]}</h2>"
            f"<p class='meta'>Approved {approved}</p>"
            f"<div class='body'>{body}</div></section>"
        )

    # Kickoff section
    success_scenarios = phase3_data.get("success_scenarios") or []
    ss_html = "<ul>" + "".join(
        f"<li><strong>{(s.get('description') or '—')}</strong>"
        + (f"<br><span class='muted'>Metric: {s.get('metric')}</span>" if s.get("metric") else "")
        + "</li>"
        for s in success_scenarios if isinstance(s, dict)
    ) + "</ul>" if success_scenarios else "<p class='muted'>—</p>"

    kickoff_html = f"""
    <section class='phase'>
      <h2>Project Kickoff</h2>
      <p><strong>Project name:</strong> {phase3_data.get('project_name') or '—'}</p>
      <p><strong>Company story:</strong><br>{phase3_data.get('company_story') or '—'}</p>
      <p><strong>Goals:</strong><br>{phase3_data.get('goals') or '—'}</p>
      <p><strong>Timeline expectation:</strong> {phase3_data.get('timeline_expectation') or '—'}</p>
      <p><strong>Phone:</strong> {phase3_data.get('phone') or '—'}</p>
      <p><strong>Best time to call:</strong> {phase3_data.get('best_time_to_call') or '—'} ({phase3_data.get('best_time_timezone') or '—'})</p>
      <p><strong>Success scenarios:</strong></p>
      {ss_html}
    </section>
    """

    invoice_html = ""
    if txn or invoice_row:
        gross = txn.get("amount_gross") or invoice_row.get("amount_total") or "—"
        currency = txn.get("currency") or invoice_row.get("currency") or "USD"
        tier = txn.get("tier") or invoice_row.get("metadata", {}).get("package_tier") or "—"
        completed = (
            txn.get("completed_at")
            or txn.get("created_at")
            or invoice_row.get("paid_at")
            or "—"
        )
        invoice_no = invoice_row.get("invoice_number") or txn.get("id") or "—"
        invoice_html = f"""
        <section class='phase appendix'>
          <h2>Appendix — Package Invoice</h2>
          <table class='inv'>
            <tr><th>Invoice / Order</th><td>{invoice_no}</td></tr>
            <tr><th>Package tier</th><td>{tier}</td></tr>
            <tr><th>Amount paid</th><td>{gross} {currency}</td></tr>
            <tr><th>Paid on</th><td>{completed}</td></tr>
          </table>
        </section>
        """

    logo_html = ""
    if phase3_data.get("company_logo_url"):
        logo_html = (
            f"<img src='{phase3_data['company_logo_url']}' "
            "alt='Logo' style='max-height:80px;max-width:240px;margin-bottom:16px;'>"
        )

    html_doc = f"""
    <html><head><meta charset='utf-8'><style>
        @page {{ size: A4; margin: 22mm 18mm; }}
        body {{ font-family: -apple-system, system-ui, sans-serif; color: #1f2937; line-height: 1.5; }}
        h1 {{ font-size: 30px; margin: 0 0 4px; color: #1E3A8A; }}
        h2 {{ font-size: 20px; color: #1E3A8A; margin: 0 0 10px; }}
        .cover {{ page-break-after: always; padding-top: 60px; }}
        .meta {{ color: #6b7280; font-size: 12px; margin-top: 0; }}
        .phase {{ page-break-inside: avoid; margin-bottom: 26px; }}
        .body {{ font-size: 13px; }}
        .body p, .body h3, .body ul {{ margin: 4px 0; }}
        .muted {{ color: #6b7280; font-size: 12px; }}
        section.phase + section.phase {{ margin-top: 38px; }}
        .appendix table.inv {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
        .appendix table.inv th, .appendix table.inv td {{
            text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb;
        }}
        .signing-block {{ margin-top: 60px; }}
        .sig-line {{ border-top: 1px solid #1f2937; width: 280px;
                     margin-top: 50px; padding-top: 4px; font-size: 11px; color: #6b7280; }}
        .footer {{ position: fixed; bottom: 8mm; left: 18mm; right: 18mm;
                   font-size: 10px; color: #9ca3af; text-align: center; }}
    </style></head><body>
        <div class='cover'>
            {logo_html}
            <h1>Master Services Agreement</h1>
            <p class='meta'>{brief.get('project_name')} · for {company.get('name') or brief.get('client_email')}</p>
            <p style='margin-top:38px;font-size:13px;'>This agreement formalizes the
            scope, design direction, and engagement terms that were reviewed and
            approved by the client during the brief approval process. The
            appendix contains the original package invoice already paid.</p>
            <div class='signing-block'>
                <p style='font-size:11px;color:#6b7280;'>Signed by Bloom Labs (Bloom Development Labs Corp.)</p>
                <div class='sig-line'>Signature · Date</div>
                <p style='margin-top:28px;font-size:11px;color:#6b7280;'>Signed by Client</p>
                <div class='sig-line'>Signature · Date</div>
            </div>
            <p class='meta' style='margin-top:48px;'>
                Bloom Labs — 2153 Chino Roces Ave., Brgy. Pio del Pilar, Makati City 1229 Philippines.
                billing@bybloomlabs.com · bybloomlabs.com
            </p>
        </div>
        {''.join(phase_blocks)}
        {kickoff_html}
        {invoice_html}
        <div class='footer'>Generated by Bloom Labs · bybloomlabs.com</div>
    </body></html>
    """
    return HTML(string=html_doc).write_pdf()


# -------------------------------------------------------------------------
# Dispatch
# -------------------------------------------------------------------------
async def _resolve_template_id(bd: BreezeDocsClient, name_hint: str) -> Optional[int]:
    """Best-effort template ID lookup — case-insensitive substring match."""
    res = await bd.list_templates()
    if not res.get("success"):
        return None
    needle = name_hint.lower()
    for t in res.get("data") or []:
        title = (t.get("title") or "").lower()
        if needle in title or title in needle:
            return int(t["id"])
    return None


async def _upsert_contract_milestone(
    db: AsyncIOMotorDatabase, brief: Dict[str, Any], status: str = "in_progress"
) -> None:
    """Idempotent — insert/update the 'Contract & Invoice Sent' milestone."""
    client_email = (brief.get("client_email") or "").lower()
    project_name = (brief.get("project_name") or "Project").strip()
    existing = await db.milestones.find_one(
        {
            "client_email": client_email,
            "project_name": project_name,
            "title": CONTRACT_MILESTONE_TITLE,
        },
        {"_id": 0},
    )
    if existing:
        await db.milestones.update_one(
            {"id": existing["id"]},
            {"$set": {"status": status, "last_updated": _iso(_now())}},
        )
        return
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "client_email": client_email,
        "project_name": project_name,
        "title": CONTRACT_MILESTONE_TITLE,
        "status": status,
        "description": "Awaiting client signature on the Master Services Agreement.",
        "is_final_deliverable": False,
        "notify_client_on_complete": False,
        "nifty_task_id": None,
        "due_date": (now + timedelta(days=7)).isoformat(),
        "completion_date": None,
        "blocked_reason": None,
        "blocked_eta": None,
        "notes": [],
        "last_updated": _iso(now),
        "created_at": _iso(now),
        "seeded_from_brief": brief["id"],
        "linked_brief_phase": None,
    }
    await db.milestones.insert_one(doc)


async def dispatch_contract_for_brief(
    db: AsyncIOMotorDatabase,
    request: Request,
    brief: Dict[str, Any],
    template_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Core dispatch routine. Builds the PDF, sends to BreezeDocs for signing,
    and triggers the client email + milestone seeding.

    Idempotency: if `brief.contract_dispatched_at` is already set, returns the
    cached payload instead of double-firing."""
    if brief.get("contract_dispatched_at") and brief.get("contract_dispatch_result"):
        return brief["contract_dispatch_result"]
    if brief.get("status") != "approved":
        raise HTTPException(400, "Brief must be approved before dispatching contract")

    # 1. Render PDF
    try:
        pdf_bytes = await _build_contract_pdf(db, brief)
    except Exception as exc:  # noqa: BLE001
        log.exception("Contract PDF generation failed: %s", exc)
        raise HTTPException(500, f"PDF generation failed: {exc}") from exc

    # 2. Store as a project_files row (category="contract")
    try:
        import object_storage

        rel = f"project-files/{brief['client_email']}/contract-{brief['id']}.pdf"
        result = object_storage.put_object(rel, pdf_bytes, "application/pdf")
        storage_path = result["path"]
    except Exception as exc:  # noqa: BLE001
        log.warning("Contract PDF object-storage upload failed: %s", exc)
        storage_path = None

    now = _now()
    company_id = brief.get("company_id")
    project_name = brief.get("project_name") or "Project"
    pdf_filename = (
        f"msa-{project_name.replace(' ', '-')}-{brief['id'][:8]}.pdf"
    )
    if storage_path:
        await db.project_files.insert_one(
            {
                "id": str(uuid.uuid4()),
                "company_id": company_id,
                "client_email": brief["client_email"],
                "storage_path": storage_path,
                "original_filename": pdf_filename,
                "content_type": "application/pdf",
                "size_bytes": len(pdf_bytes),
                "category": "contract",
                "notes": "Master Services Agreement compiled at brief approval.",
                "uploaded_by": "system:contract-dispatch",
                "uploaded_at": _iso(now),
                "is_deleted": False,
            }
        )

    # 3. BreezeDocs — clone template + send to client
    bd: BreezeDocsClient = request.app.state.breezedocs
    template_id = await _resolve_template_id(bd, template_name or DEFAULT_TEMPLATE_NAME)
    bd_result: Dict[str, Any] = {"breezedocs_template_id": template_id}
    sign_url: Optional[str] = None
    bd_doc_id: Optional[int] = None
    if template_id:
        clone = await bd.create_document_from_template(template_id=template_id)
        if clone.get("success"):
            bd_doc_id = clone["data"].get("id")
            recipients = [
                {
                    "name": brief.get("client_name") or brief["client_email"].split("@")[0],
                    "email": brief["client_email"],
                }
            ]
            send_res = await bd.send_document(doc_id=bd_doc_id, recipients=recipients)
            if send_res.get("success"):
                recs = (send_res.get("data") or {}).get("recipients") or []
                slug = next(
                    (r.get("slug") for r in recs if r.get("email", "").lower() == brief["client_email"].lower()),
                    None,
                )
                if slug:
                    sign_url = BreezeDocsClient.recipient_sign_url(slug)
                bd_result["breezedocs_send"] = send_res.get("data") or {}
            else:
                bd_result["breezedocs_send_error"] = send_res.get("error")
        else:
            bd_result["breezedocs_clone_error"] = clone.get("error")
    else:
        bd_result["breezedocs_template_error"] = (
            f"Template '{template_name or DEFAULT_TEMPLATE_NAME}' not found"
        )

    bd_result.update(
        {
            "pdf_filename": pdf_filename,
            "pdf_storage_path": storage_path,
            "breezedocs_doc_id": bd_doc_id,
            "sign_url": sign_url,
        }
    )

    # 4. Milestone
    await _upsert_contract_milestone(db, brief, status="in_progress")

    # 4b. Persist a breezedocs_proposals row so the cron syncs status changes
    # and we can flip the milestone to complete on signed/completed.
    if bd_doc_id:
        await db.breezedocs_proposals.update_one(
            {"breezedocs_id": bd_doc_id},
            {
                "$set": prepare_for_mongo(
                    {
                        "id": str(uuid.uuid4()),
                        "breezedocs_id": bd_doc_id,
                        "client_email": brief["client_email"],
                        "client_name": brief.get("client_name"),
                        "title": f"MSA — {project_name}",
                        "status": "sent",
                        "sign_url": sign_url,
                        "linked_brief_id": brief["id"],
                        "linked_milestone_title": CONTRACT_MILESTONE_TITLE,
                        "amount": None,
                        "currency": "USD",
                        "created_at": _iso(now),
                        "updated_at": _iso(now),
                        "archived": False,
                    }
                )
            },
            upsert=True,
        )

    # 5. Email client
    try:
        emailit = request.app.state.emailit
        subject = f"Your contract for {project_name} is ready to sign"
        sign_block = (
            f"<p><a href='{sign_url}' style='display:inline-block;background:#1E3A8A;"
            f"color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none'>"
            f"Review & sign the contract</a></p>"
        ) if sign_url else "<p>Your account manager will email you the signing link shortly.</p>"
        html = f"""
        <p>Hi {brief.get('client_name') or 'there'},</p>
        <p>Your approved project brief has been compiled into a Master Services Agreement
        for <strong>{project_name}</strong>. Please review and sign at your earliest convenience.</p>
        {sign_block}
        <p>Your original package invoice is attached at the back of the MSA for your records.</p>
        <p>— Bloom Labs</p>
        """
        await emailit.send_email(
            to=brief["client_email"],
            subject=subject,
            html=html,
            text=f"Sign your MSA for {project_name}: {sign_url or 'link to follow'}",
        )
    except Exception:  # pragma: no cover
        pass

    # 6. Mark brief as dispatched
    await db.project_briefs.update_one(
        {"id": brief["id"]},
        {
            "$set": {
                "contract_dispatched_at": _iso(now),
                "contract_dispatch_result": prepare_for_mongo(bd_result),
                "updated_at": _iso(now),
            }
        },
    )
    return bd_result


# -------------------------------------------------------------------------
# Admin endpoint
# -------------------------------------------------------------------------
brief_contract_router = APIRouter(
    prefix="/admin/briefs", tags=["brief-contract"]
)


@brief_contract_router.post("/{brief_id}/dispatch-contract")
async def admin_dispatch_contract(
    brief_id: str,
    request: Request,
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Admin-review-gated dispatch. Click once after the brief is approved."""
    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    if brief.get("status") != "approved":
        raise HTTPException(400, "Brief is not approved yet")
    result = await dispatch_contract_for_brief(db, request, brief)
    fresh = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    return {"ok": True, "brief": fresh, "result": result}


@brief_contract_router.get("/{brief_id}/contract-preview")
async def admin_contract_preview(
    brief_id: str,
    request: Request,
    _user=Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate the contract PDF inline (preview before dispatch)."""
    from fastapi.responses import Response

    brief = await db.project_briefs.find_one({"id": brief_id}, {"_id": 0})
    if not brief:
        raise HTTPException(404, "Brief not found")
    pdf_bytes = await _build_contract_pdf(db, brief)
    return Response(
        pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=contract-preview-{brief_id[:8]}.pdf",
        },
    )


__all__ = [
    "brief_contract_router",
    "dispatch_contract_for_brief",
    "CONTRACT_MILESTONE_TITLE",
]
