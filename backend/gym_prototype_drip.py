"""
Gym Prototype post-purchase 5-step email drip.

Flow:
  • PayPal webhook captures a `gym_prototype` order → call
    `enqueue_prototype_drip(db, order)` which inserts a `gym_prototype_drips`
    row with `next_send_at` = now (step 0 immediate).
  • APScheduler hourly tick → `prototype_drip_tick(db, app)` walks rows
    due for send, fires the email via Emailit, advances the schedule.
  • Steps follow the V3 spec exactly: Day 1, Day 3, Day 5, Day 10, Day 11.

Idempotent: a second capture event on the same order does not double-enqueue.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger("gym_prototype_drip")

COLLECTION = "gym_prototype_drips"

# Day offsets from purchase. Step 0 fires immediately so the buyer gets the
# "welcome / check the prototype" email the moment payment lands.
DRIP_STEPS: List[Dict[str, Any]] = [
    {
        "day_offset": 0,
        "subject": "Your gym prototype is live — first 30 minutes matter",
        "body_markdown": (
            "Hi {name},\n\n"
            "Your gym prototype access is in your inbox. Take 30 minutes to "
            "poke around and answer one question in reply: **what surprised "
            "you most?**\n\n"
            "That's literally the whole onboarding — we use your answer to "
            "tune the full build if you upgrade.\n\n"
            "— Ryan @ Bloom Labs"
        ),
    },
    {
        "day_offset": 3,
        "subject": "How's the prototype holding up?",
        "body_markdown": (
            "Hi {name},\n\n"
            "Quick check-in — how are you finding the prototype after a "
            "couple of days?\n\n"
            "Any feedback on what you'd want different in the full build? "
            "Just hit reply, I read every one.\n\n"
            "— Ryan"
        ),
    },
    {
        "day_offset": 5,
        "subject": "$1,000 upgrade credit — 9 days left",
        "body_markdown": (
            "Hi {name},\n\n"
            "Quick reminder: if you decide to upgrade to the full build in "
            "the next 9 days, we credit **$1,000** — bringing the cost from "
            "$8,995 to **$7,995**.\n\n"
            "You can upgrade with one click from your client portal — "
            "https://bybloomlabs.com/client → Orders → Upgrade.\n\n"
            "Let me know if you've got questions.\n\n"
            "— Ryan"
        ),
    },
    {
        "day_offset": 10,
        "subject": "Upgrade window closes tomorrow",
        "body_markdown": (
            "Hi {name},\n\n"
            "Heads up — the **$1,000 upgrade credit** closes tomorrow. If "
            "you're thinking about going full build, now's the time.\n\n"
            "Any questions I can answer before you decide? Hit reply.\n\n"
            "— Ryan"
        ),
    },
    {
        "day_offset": 11,
        "subject": "Upgrade window closed",
        "body_markdown": (
            "Hi {name},\n\n"
            "The $1,000 upgrade window has closed. You can still upgrade "
            "anytime, just at full $8,995 price.\n\n"
            "If you change your mind in the next 24 hours, reply and we'll "
            "honour the credit one last time. After that we close the door.\n\n"
            "Either way — thanks for trying the prototype.\n\n"
            "— Ryan"
        ),
    },
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _render_html(subject: str, body_md: str) -> str:
    safe = (
        body_md.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br/>")
        .replace("**", "")  # crude bold strip (kept for plaintext)
    )
    return f"""<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0F172A;background:#F8FAFC;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <h1 style="margin:0 0 16px;font-size:22px;color:#1E3A8A;">{subject}</h1>
    <div style="line-height:1.7;color:#334155;font-size:15px;">{safe}</div>
    <hr style="margin:32px 0;border:none;border-top:1px solid #E2E8F0;" />
    <p style="color:#94A3B8;font-size:12px;">
      You're receiving this because you purchased the Gym Prototype at bybloomlabs.com.
    </p>
  </div>
</body></html>"""


async def enqueue_prototype_drip(
    db: AsyncIOMotorDatabase, order: Dict[str, Any]
) -> Optional[str]:
    """Insert a drip row for the prototype buyer. Idempotent on order_id."""
    order_id = order.get("id")
    email = (order.get("customer_email") or "").lower()
    if not order_id or not email:
        return None
    # Skip if already enqueued
    existing = await db[COLLECTION].find_one(
        {"order_id": order_id}, {"_id": 0, "id": 1}
    )
    if existing:
        return existing["id"]
    doc = {
        "id": str(uuid4()),
        "order_id": order_id,
        "email": email,
        "name": order.get("customer_name") or email.split("@")[0],
        "amount": order.get("amount"),
        "currency": order.get("currency") or "USD",
        "purchased_at": (order.get("created_at") or _now().isoformat()),
        "next_step_idx": 0,
        "next_send_at": _now().isoformat(),  # step 0 fires immediately
        "sent_log": [],
        "completed": False,
        "created_at": _now().isoformat(),
    }
    await db[COLLECTION].insert_one(doc)
    return doc["id"]


async def _send_step(
    app,
    db: AsyncIOMotorDatabase,
    drip: Dict[str, Any],
    step_idx: int,
) -> bool:
    if step_idx >= len(DRIP_STEPS):
        return False
    step = DRIP_STEPS[step_idx]
    subject = step["subject"]
    body = step["body_markdown"].replace("{name}", drip.get("name") or "there")
    html = _render_html(subject, body)
    ok = False
    try:
        emailit = app.state.emailit
        if emailit.is_configured:
            res = await emailit.send_email(
                to=drip["email"], subject=subject, html=html, text=body
            )
            ok = bool(res and res.get("ok"))
        else:
            log.warning("Emailit not configured — skipping prototype drip step %d", step_idx)
    except Exception as exc:  # noqa: BLE001
        log.warning("Prototype drip send failed: %s", exc)
    await db[COLLECTION].update_one(
        {"id": drip["id"]},
        {
            "$push": {
                "sent_log": {
                    "step_idx": step_idx,
                    "subject": subject,
                    "sent_at": _now().isoformat(),
                    "ok": ok,
                }
            }
        },
    )
    return ok


async def _advance(
    db: AsyncIOMotorDatabase, drip: Dict[str, Any], from_idx: int
) -> None:
    next_idx = from_idx + 1
    if next_idx >= len(DRIP_STEPS):
        await db[COLLECTION].update_one(
            {"id": drip["id"]},
            {
                "$set": {
                    "completed": True,
                    "next_step_idx": next_idx,
                    "next_send_at": None,
                }
            },
        )
        return
    # next_send_at = purchase_date + day_offset of next step
    purchased = drip.get("purchased_at")
    try:
        purchased_dt = datetime.fromisoformat(str(purchased).replace("Z", "+00:00"))
        if purchased_dt.tzinfo is None:
            purchased_dt = purchased_dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        purchased_dt = _now()
    next_send = purchased_dt + timedelta(days=DRIP_STEPS[next_idx]["day_offset"])
    await db[COLLECTION].update_one(
        {"id": drip["id"]},
        {
            "$set": {
                "next_step_idx": next_idx,
                "next_send_at": next_send.isoformat(),
            }
        },
    )


async def prototype_drip_tick(db: AsyncIOMotorDatabase, app) -> Dict[str, int]:
    """APScheduler tick — fire every due step. Returns counts."""
    now_iso = _now().isoformat()
    cursor = db[COLLECTION].find(
        {"completed": False, "next_send_at": {"$lte": now_iso}},
        {"_id": 0},
    )
    sent = 0
    failed = 0
    skipped = 0
    async for drip in cursor:
        # If the buyer has already paid the upgrade order, short-circuit the
        # whole sequence. We don't want to email a customer about upgrading
        # after they've already done it.
        upgrade = await db.paypal.find_one(
            {"metadata.upgrade_from": drip["order_id"], "status": "COMPLETED"},
            {"_id": 0, "id": 1},
        )
        if upgrade:
            await db[COLLECTION].update_one(
                {"id": drip["id"]},
                {"$set": {"completed": True, "next_send_at": None, "completion_reason": "upgraded"}},
            )
            skipped += 1
            continue
        step_idx = drip.get("next_step_idx", 0)
        ok = await _send_step(app, db, drip, step_idx)
        if ok:
            sent += 1
        else:
            failed += 1
        await _advance(db, drip, step_idx)
    return {"sent": sent, "failed": failed, "skipped": skipped}


__all__ = [
    "enqueue_prototype_drip",
    "prototype_drip_tick",
    "DRIP_STEPS",
    "COLLECTION",
]
