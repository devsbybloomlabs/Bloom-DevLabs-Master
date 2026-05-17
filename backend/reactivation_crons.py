"""Two reactivation crons for funnel hygiene:

1. **company_setup_reminder_tick** — once a day, email purchasers whose
   company `setup_status != complete` 24+ hours after init. Soft nudge to
   finish the wizard.

2. **warm_lead_reengagement_tick** — once a day, email warm leads who
   captured 24-72 hours ago and never came back. Targets the
   "abandoned-checkout" cohort.

Both jobs are idempotent — each row carries a `*_sent_at` watermark so we
never spam the same recipient twice.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from emailit_client import EmailitClient

logger = logging.getLogger(__name__)
_emailit = EmailitClient()

PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") or "https://bybloomlabs.com"

# --------------------------------------------------------------------------
# Cron 1 — Company setup reminder (fallback C from iter 31)
# --------------------------------------------------------------------------
async def company_setup_reminder_tick(db) -> Dict[str, Any]:
    """Find companies whose owner hasn't finished the welcome wizard within
    24h of their `created_at` timestamp. Send one reminder, mark them so we
    don't email again."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    cutoff_iso = cutoff.isoformat()

    cursor = db.companies.find(
        {
            "setup_status": {"$ne": "complete"},
            "created_at": {"$lt": cutoff_iso},
            "$or": [
                {"setup_reminder_sent_at": {"$exists": False}},
                {"setup_reminder_sent_at": None},
            ],
        },
        {"_id": 0, "id": 1, "owner_client_email": 1, "name": 1, "setup_status": 1},
    ).limit(50)
    companies: List[Dict[str, Any]] = [c async for c in cursor]

    sent, failed = 0, 0
    for c in companies:
        owner = c.get("owner_client_email")
        if not owner:
            continue
        try:
            await _emailit.send_email(
                to=owner,
                subject="Quick setup — invite your team to Bloom DevLabs",
                html=f"""
                    <p>Hi,</p>
                    <p>You purchased your Bloom DevLabs site yesterday — and we noticed
                    you haven't finished setting up your team yet.</p>
                    <p>It takes about 2 minutes:</p>
                    <ol>
                      <li>Add your company name + phone</li>
                      <li>Invite teammates so they share your view of the project</li>
                      <li>Done</li>
                    </ol>
                    <p><a href="{PUBLIC_APP_URL}/portal/welcome" style="display:inline-block;background:#1E3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Finish setup &amp; invite your team</a></p>
                    <p style="font-size:12px;color:#64748B;">If you've already set up your account, you can ignore this email.</p>
                """,
            )
            await db.companies.update_one(
                {"id": c["id"]},
                {"$set": {"setup_reminder_sent_at": datetime.now(timezone.utc).isoformat()}},
            )
            sent += 1
            logger.info("company_setup.reminder_sent owner=%s company_id=%s", owner, c["id"])
        except Exception as exc:  # noqa: BLE001
            failed += 1
            logger.warning("company_setup.reminder_failed owner=%s err=%s", owner, exc)

    return {"matched": len(companies), "sent": sent, "failed": failed}


# --------------------------------------------------------------------------
# Cron 2 — Warm-lead 48h re-engagement
# --------------------------------------------------------------------------
TIER_TO_NICHE_COPY = {
    "gym_prototype": ("gym prototype", "/gym-owners"),
    "gym_custom": ("custom gym software build", "/gym-owners"),
    "coach_starter": ("24-hour coaching website", "/coaches"),
    "coach_premium": ("premium coaching website", "/coaches"),
    "coach_enterprise": ("enterprise coaching package", "/coaches"),
    "realestate_starter": ("24-hour MLS-integrated real-estate site", "/real-estate"),
    "realestate_premium": ("premium real-estate package", "/real-estate"),
    "realestate_enterprise": ("real-estate enterprise / team package", "/real-estate"),
}


async def warm_lead_reengagement_tick(db) -> Dict[str, Any]:
    """Find warm leads captured 24–72h ago who never converted to a real
    PayPal order. Send a soft 'did you change your mind?' email."""
    now = datetime.now(timezone.utc)
    earliest = (now - timedelta(hours=72)).isoformat()
    latest = (now - timedelta(hours=24)).isoformat()

    cursor = db.warm_leads.find(
        {
            "status": "captured",
            "created_at": {"$gte": earliest, "$lte": latest},
            "$or": [
                {"reengagement_sent_at": {"$exists": False}},
                {"reengagement_sent_at": None},
            ],
        },
        {"_id": 0},
    ).limit(50)
    leads: List[Dict[str, Any]] = [lead async for lead in cursor]

    sent, failed, skipped = 0, 0, 0
    for lead in leads:
        email = lead.get("email")
        if not email:
            continue
        # Skip if they completed PayPal under the same email + tier (rare race)
        existing_order = await db.paypal_transactions.find_one(
            {"customer_email": email, "tier": lead.get("tier"), "status": {"$in": ["completed", "captured", "approved"]}},
            {"_id": 0, "id": 1},
        )
        if existing_order:
            await db.warm_leads.update_one(
                {"id": lead["id"]},
                {"$set": {"status": "converted", "reengagement_sent_at": now.isoformat()}},
            )
            skipped += 1
            continue

        offering, page = TIER_TO_NICHE_COPY.get(
            lead.get("tier") or "", ("Bloom DevLabs build", "/")
        )
        try:
            await _emailit.send_email(
                to=email,
                subject="Still interested? — a quick nudge from Bloom DevLabs",
                html=f"""
                    <p>Hi {lead.get('name', 'there')},</p>
                    <p>You started looking at the <strong>{offering}</strong> a couple of days ago
                    but didn't finish checkout. No judgement — just checking in.</p>
                    <p>If there's a question we can answer, hit reply and we'll get back to you
                    same day. Or if you're still thinking, here's the page again:</p>
                    <p><a href="{PUBLIC_APP_URL}{page}" style="display:inline-block;background:#F59E0B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Continue where you left off →</a></p>
                    <p>If this isn't the right fit, no hard feelings —{' '}
                    <a href="{PUBLIC_APP_URL}/leads/unsubscribe?email={email}">unsubscribe here</a>.</p>
                """,
            )
            await db.warm_leads.update_one(
                {"id": lead["id"]},
                {"$set": {"status": "nurtured", "reengagement_sent_at": now.isoformat()}},
            )
            sent += 1
            logger.info("warm_lead.reengagement_sent email=%s tier=%s", email, lead.get("tier"))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            logger.warning("warm_lead.reengagement_failed email=%s err=%s", email, exc)

    return {"matched": len(leads), "sent": sent, "failed": failed, "converted_skipped": skipped}


__all__ = ["company_setup_reminder_tick", "warm_lead_reengagement_tick"]
