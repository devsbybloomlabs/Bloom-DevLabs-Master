"""Branded transactional email service for Bloom Labs.

Single source of truth for every lifecycle email — onboarding, payments,
milestones, support, subscriptions. Each `send_*` function:
  1. Renders the message inside a shared Bloom Labs HTML shell so the
     branding stays consistent across emailit, the in-portal preview,
     and any future channel.
  2. Catches/logs Emailit failures so caller flows never crash on email.
  3. Returns {ok, status_code, error?} for caller-side decisions.

Callers should `await email_service.send_X(...)` — no need to interact
with EmailitClient directly. Templates live here next to the senders so
copy/colors stay in lockstep.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

log = logging.getLogger("emails")

BRAND_NAME = "Bloom Labs"
BRAND_PRIMARY = "#1E3A8A"
BRAND_PRIMARY_DARK = "#1A3278"
BRAND_TEXT = "#0F172A"
BRAND_MUTED = "#475569"
BRAND_BG = "#F8FAFC"
BRAND_BG_CARD = "#FFFFFF"
BRAND_BORDER = "#E2E8F0"
LOGO_URL = (
    # Dark-text "MASTER" variant — readable on the white email card.
    # (The "Light" variant is for dark backgrounds and renders as white-on-white here.)
    "https://customer-assets.emergentagent.com/job_6ae936eb-6f62-4e1a-8f50-8423b436560b/"
    "artifacts/xayvxy1s_Logo%20-%20Full%20-%20MASTER.png"
)
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")


def _frame(*, preheader: str, body_html: str, footer_html: Optional[str] = None) -> str:
    """Wrap message HTML in the Bloom Labs brand shell."""
    safe_pre = preheader.replace("<", "&lt;")[:140]
    footer = footer_html or _default_footer()
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background:{BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{BRAND_TEXT};">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">{safe_pre}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:{BRAND_BG};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:{BRAND_BG_CARD};border-radius:14px;box-shadow:0 4px 14px rgba(15,23,42,0.06);overflow:hidden;">
        <tr><td style="padding:28px 32px 12px;text-align:left;">
          <img src="{LOGO_URL}" alt="{BRAND_NAME}" width="120" style="display:block;height:auto;border:0;outline:none;"/>
        </td></tr>
        <tr><td style="padding:8px 32px 28px;">{body_html}</td></tr>
        <tr><td style="padding:24px 32px;border-top:1px solid {BRAND_BORDER};background:{BRAND_BG};color:#94A3B8;font-size:12px;line-height:1.6;">{footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _default_footer() -> str:
    return f"""
      Sent by <strong style="color:{BRAND_TEXT}">{BRAND_NAME}</strong> · Bloom Development Labs Corp.<br/>
      <a href="{APP_BASE_URL}" style="color:#94A3B8;text-decoration:underline;">{APP_BASE_URL.replace("https://", "")}</a>
      &nbsp;·&nbsp;
      <a href="mailto:founder@thesalvador.group" style="color:#94A3B8;text-decoration:underline;">support</a>
    """


def _button(href: str, label: str) -> str:
    return (
        f'<a href="{href}" style="display:inline-block;background:{BRAND_PRIMARY};'
        f'color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;'
        f'font-weight:600;font-size:14px;">{label}</a>'
    )


def _h1(text: str) -> str:
    return f'<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:{BRAND_PRIMARY};font-weight:700;letter-spacing:-0.01em;">{text}</h1>'


def _p(text: str) -> str:
    return f'<p style="margin:0 0 14px;line-height:1.7;color:{BRAND_MUTED};font-size:15px;">{text}</p>'


def _kv_table(rows: List[Dict[str, str]]) -> str:
    out = [
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        f'style="margin:18px 0;border:1px solid {BRAND_BORDER};border-radius:10px;overflow:hidden;background:{BRAND_BG};">'
    ]
    for r in rows:
        out.append(
            f'<tr><td style="padding:12px 16px;border-bottom:1px solid {BRAND_BORDER};color:#94A3B8;'
            f'font-size:12px;text-transform:uppercase;letter-spacing:0.12em;width:40%;">{r["label"]}</td>'
            f'<td style="padding:12px 16px;border-bottom:1px solid {BRAND_BORDER};color:{BRAND_TEXT};'
            f'font-size:14px;text-align:right;font-weight:500;">{r["value"]}</td></tr>'
        )
    # Remove last bottom-border
    if rows:
        out[-1] = out[-1].replace(f"border-bottom:1px solid {BRAND_BORDER};", "", 2)
    out.append("</table>")
    return "".join(out)


# ============================================================
# Lifecycle senders
# ============================================================

async def _safe_send(emailit, **kwargs) -> Dict[str, Any]:
    """Wrap emailit.send_email — never raise, always return dict."""
    if not emailit or not getattr(emailit, "is_configured", False):
        return {"ok": False, "status_code": 0, "error": "emailit_not_configured"}
    try:
        return await emailit.send_email(**kwargs)
    except Exception as exc:  # pragma: no cover
        log.warning("Emailit send failed (%s → %s): %s", kwargs.get("subject"), kwargs.get("to"), exc)
        return {"ok": False, "status_code": 0, "error": str(exc)}


PHASE_LABELS = {
    1: "Design Language",
    2: "Function References",
    3: "Company Background",
}


PHASE_NEXT_HINT = {
    1: "Up next: Phase 2 — share apps with functions you love and want yours to behave like.",
    2: "Up next: Phase 3 — tell us about your company, audience, and what 'success' looks like.",
    3: "Kickoff complete! Our team will be in touch shortly to schedule the first sprint demo.",
}


async def send_phase_received(emailit, *, to: str, name: str, phase: int) -> Dict[str, Any]:
    """Confirm we received a phase submission + tell client what's next."""
    label = PHASE_LABELS.get(phase, f"Phase {phase}")
    next_hint = PHASE_NEXT_HINT.get(phase, "")
    portal_url = f"{APP_BASE_URL}/portal/onboarding"
    body = (
        _h1(f"Phase {phase} received — {label} ✓")
        + _p(f"Thanks, {name}! We've got your <strong>{label}</strong> submission and the team is already reviewing it.")
        + _p(next_hint)
        + (f'<p style="margin:24px 0;">{_button(portal_url, "Continue onboarding")}</p>' if phase < 3 else "")
        + _p("If anything looks off or you forgot to add something, just reply to this email — we'll fix it.")
    )
    html = _frame(preheader=f"Phase {phase} ({label}) received — kickoff in motion.", body_html=body)
    return await _safe_send(
        emailit,
        to=to,
        subject=f"Phase {phase} received — {label} ✓ · {BRAND_NAME}",
        html=html,
        text=f"Phase {phase} received — {label}. {next_hint} Continue: {portal_url}",
    )


async def send_onboarding_complete(emailit, *, to: str, name: str, project_name: str = "your project") -> Dict[str, Any]:
    portal_url = f"{APP_BASE_URL}/portal"
    body = (
        _h1(f"🎉 Kickoff complete — welcome to the build, {name}")
        + _p(f"All three onboarding phases are in. We have everything we need to start shipping <strong>{project_name}</strong>.")
        + _p("Here's what happens next:")
        + (
            f'<ul style="padding-left:20px;margin:0 0 14px;color:{BRAND_MUTED};line-height:1.8;font-size:15px;">'
            "<li>You'll get a calendar invite for our weekly demo call within 24h.</li>"
            "<li>The team will post the first design milestones to your client portal.</li>"
            "<li>You'll receive a daily email digest of progress for the next 14 days.</li>"
            "</ul>"
        )
        + f'<p style="margin:24px 0;">{_button(portal_url, "Open your portal")}</p>'
    )
    html = _frame(preheader=f"Onboarding complete — {project_name} is officially building.", body_html=body)
    return await _safe_send(
        emailit,
        to=to,
        subject=f"🎉 Onboarding complete — {project_name} is in motion · {BRAND_NAME}",
        html=html,
        text=f"Onboarding complete! Portal: {portal_url}",
    )


async def send_payment_receipt(
    emailit,
    *,
    to: str,
    name: str,
    plan_name: str,
    amount: str,
    currency: str = "USD",
    order_id: str,
    invoice_number: Optional[str] = None,
    payment_plan_label: Optional[str] = None,
    charge_later: Optional[str] = None,
    captured_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Receipt email with invoice number + downloadable invoice link."""
    portal_url = f"{APP_BASE_URL}/portal?tab=invoices"
    captured_at_str = (captured_at or datetime.utcnow()).strftime("%b %d, %Y · %H:%M UTC")
    rows = [
        {"label": "Plan", "value": plan_name},
        {"label": "Amount paid", "value": f"{currency} {amount}"},
    ]
    if payment_plan_label:
        rows.append({"label": "Payment plan", "value": payment_plan_label})
    if charge_later and float(charge_later) > 0:
        rows.append({"label": "Balance at launch", "value": f"{currency} {charge_later}"})
    rows.append({"label": "Order ID", "value": order_id})
    if invoice_number:
        rows.append({"label": "Invoice #", "value": invoice_number})
    rows.append({"label": "Captured at", "value": captured_at_str})

    body = (
        _h1(f"Payment received — thanks, {name} 💙")
        + _p(f"This is your receipt for <strong>{plan_name}</strong>. Your client portal has been activated and we're getting started on your project.")
        + _kv_table(rows)
        + _p("Your invoice and full payment history are always available in your portal.")
        + f'<p style="margin:24px 0;">{_button(portal_url, "View invoices in portal")}</p>'
        + _p("Need a custom invoice for your records? Just reply and we'll send one.")
    )
    html = _frame(preheader=f"Receipt for {plan_name} — {currency} {amount}.", body_html=body)
    return await _safe_send(
        emailit,
        to=to,
        subject=f"Payment received — {plan_name} · {BRAND_NAME}",
        html=html,
        text=f"Receipt for {plan_name}: {currency} {amount}. Order {order_id}. Invoices: {portal_url}",
    )


async def send_invoice_issued(
    emailit,
    *,
    to: str,
    name: str,
    invoice_number: str,
    amount: str,
    currency: str,
    due_date: Optional[str],
    invoice_url: str,
    pdf_url: Optional[str] = None,
    line_items: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    items_html = ""
    if line_items:
        item_rows = "".join(
            f'<tr><td style="padding:8px 0;color:{BRAND_TEXT};font-size:14px;">{it.get("description","—")}</td>'
            f'<td style="padding:8px 0;color:{BRAND_TEXT};font-size:14px;text-align:right;">{currency} {it.get("amount","0.00")}</td></tr>'
            for it in line_items
        )
        items_html = (
            f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            f'style="margin:14px 0;border-top:1px solid {BRAND_BORDER};border-bottom:1px solid {BRAND_BORDER};">{item_rows}</table>'
        )
    rows = [{"label": "Invoice #", "value": invoice_number}, {"label": "Total due", "value": f"{currency} {amount}"}]
    if due_date:
        rows.append({"label": "Due by", "value": due_date})
    body = (
        _h1(f"Invoice {invoice_number} — {currency} {amount}")
        + _p(f"Hi {name}, your new invoice is ready.")
        + _kv_table(rows)
        + items_html
        + f'<p style="margin:24px 0;">{_button(invoice_url, "Pay invoice")}</p>'
        + (
            f'<p style="margin:0 0 14px;font-size:13px;color:#94A3B8;">'
            f'Download a PDF copy: <a href="{pdf_url}" style="color:{BRAND_PRIMARY};text-decoration:underline;">{invoice_number}.pdf</a></p>'
            if pdf_url
            else ""
        )
    )
    html = _frame(preheader=f"Invoice {invoice_number} — {currency} {amount}.", body_html=body)
    return await _safe_send(
        emailit,
        to=to,
        subject=f"Invoice {invoice_number} · {BRAND_NAME}",
        html=html,
        text=f"Invoice {invoice_number}: {currency} {amount}. Pay: {invoice_url}",
    )


async def send_milestone_complete(
    emailit, *, to: str, name: str, milestone_title: str, project_name: str = ""
) -> Dict[str, Any]:
    portal_url = f"{APP_BASE_URL}/portal?tab=milestones"
    body = (
        _h1(f"✅ Milestone complete — {milestone_title}")
        + _p(f"Great news, {name}! We've just marked <strong>{milestone_title}</strong> as complete.")
        + (_p(f"This brings <strong>{project_name}</strong> one step closer to launch.") if project_name else "")
        + f'<p style="margin:24px 0;">{_button(portal_url, "See progress in portal")}</p>'
    )
    html = _frame(preheader=f"{milestone_title} is complete!", body_html=body)
    return await _safe_send(
        emailit,
        to=to,
        subject=f"✅ {milestone_title} — complete · {BRAND_NAME}",
        html=html,
        text=f"{milestone_title} complete. Portal: {portal_url}",
    )


async def send_support_ack(emailit, *, to: str, name: str, subject_line: str, ticket_id: str = "") -> Dict[str, Any]:
    """Acknowledge a Contact Support form submission."""
    portal_url = f"{APP_BASE_URL}/portal?tab=contact"
    body = (
        _h1("We've got your message 👋")
        + _p(f"Hi {name}, thanks for reaching out. We've logged your request and someone from the team will reply within one business day.")
        + _kv_table([
            {"label": "Subject", "value": subject_line},
            {"label": "Ticket #", "value": ticket_id or "—"},
        ])
        + f'<p style="margin:24px 0;">{_button(portal_url, "View ticket in portal")}</p>'
    )
    html = _frame(preheader="We've received your support request.", body_html=body)
    return await _safe_send(
        emailit,
        to=to,
        subject=f"We've got your message · {BRAND_NAME}",
        html=html,
        text=f"We've received your message. Subject: {subject_line}. Ticket: {ticket_id or '—'}",
    )


async def send_subscription_activated(
    emailit, *, to: str, name: str, plan_name: str, amount: str, currency: str, period: str = "month"
) -> Dict[str, Any]:
    portal_url = f"{APP_BASE_URL}/portal?tab=subscriptions"
    body = (
        _h1(f"Subscription activated — {plan_name}")
        + _p(f"Hi {name}, your <strong>{plan_name}</strong> subscription is now active. We'll bill {currency} {amount} every {period}.")
        + f'<p style="margin:24px 0;">{_button(portal_url, "Manage subscription")}</p>'
        + _p("You can cancel anytime from your portal — no commitments.")
    )
    html = _frame(preheader=f"{plan_name} subscription is live.", body_html=body)
    return await _safe_send(
        emailit,
        to=to,
        subject=f"Subscription activated — {plan_name} · {BRAND_NAME}",
        html=html,
        text=f"Subscription activated: {plan_name} — {currency} {amount}/{period}. Manage: {portal_url}",
    )
