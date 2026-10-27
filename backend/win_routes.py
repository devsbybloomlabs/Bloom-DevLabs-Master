"""BloomConnect lifetime-account giveaway (/win).

Flow:
  • Visitor submits the /win form → POST /api/win/enter → idempotent insert into
    `raffle_entries` (keyed on lowercase email), admin notification, then a
    confirmation email + Slack ping in the background.
  • Admin lists / exports entries and draws a winner from the admin routes.
"""
from __future__ import annotations

import csv
import io
import logging
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from emailit_client import EmailitClient
from slack_notifier import post_message as slack_post

log = logging.getLogger("win")

CHANNELS = ("WhatsApp", "Instagram", "Facebook", "Web chat", "Other")
DRAW_DATE_LABEL = "November 30, 2026"
RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW_S = 600
_rate_hits: Dict[str, List[float]] = {}


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client_ip(request: Request) -> str:
    return (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "0.0.0.0")
    )


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    hits = [t for t in _rate_hits.get(ip, []) if now - t < RATE_LIMIT_WINDOW_S]
    limited = len(hits) >= RATE_LIMIT_MAX
    if not limited:
        hits.append(now)
    _rate_hits[ip] = hits
    return limited


class RaffleEntryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    business: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=40)
    channel: str
    consent: bool
    website: Optional[str] = None  # honeypot, real visitors leave it empty
    source_url: Optional[str] = None
    utm: Optional[Dict[str, str]] = None
    affiliate_ref: Optional[str] = None


# ============================================================
# PUBLIC
# ============================================================
win_public_router = APIRouter(prefix="/win", tags=["win"])


@win_public_router.post("/enter")
async def enter_draw(
    req: RaffleEntryRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if req.website:  # bot filled the honeypot: pretend success, store nothing
        return {"ok": True}
    if req.channel not in CHANNELS:
        raise HTTPException(422, f"channel must be one of {', '.join(CHANNELS)}")
    if not req.consent:
        raise HTTPException(422, "Consent is required to enter the draw")
    if _rate_limited(_client_ip(request)):
        raise HTTPException(429, "Too many attempts. Please try again in a few minutes.")

    email_lc = req.email.lower().strip()
    existing = await db.raffle_entries.find_one({"email": email_lc}, {"_id": 0, "id": 1})
    if existing:
        return {"ok": True, "already_entered": True, "entry_id": existing["id"]}

    entry = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "business": req.business.strip(),
        "email": email_lc,
        "phone": req.phone.strip(),
        "channel": req.channel,
        "source_url": req.source_url,
        "utm": req.utm or {},
        "affiliate_ref": req.affiliate_ref,
        "created_at": datetime.now(timezone.utc),
    }
    await db.raffle_entries.insert_one(prepare_for_mongo(dict(entry)))

    try:
        from models import NotificationItem

        n = NotificationItem(
            kind="lead",
            title=f"New giveaway entry: {entry['name']}",
            body=f"{entry['business']} · {entry['channel']} · {email_lc}",
            link="/admin/raffle",
        )
        await db.notifications.insert_one(prepare_for_mongo(n.model_dump()))
    except Exception as exc:
        log.warning("win notification insert failed: %s", exc)

    background.add_task(_after_entry, request.app, entry)
    return {"ok": True, "entry_id": entry["id"]}


async def _after_entry(app, entry: Dict[str, Any]) -> None:
    await _send_confirmation_email(app, entry)
    try:
        res = await slack_post(
            app.state.db,
            text=(
                f":tada: New BloomConnect giveaway entry: {entry['name']} "
                f"({entry['business']}), {entry['channel']}, {entry['email']}"
            ),
        )
        if not res.get("ok"):
            log.info("Slack post skipped/failed: %s", res.get("reason"))
    except Exception as exc:
        log.warning("win slack ping failed: %s", exc)


async def _send_confirmation_email(app, entry: Dict[str, Any]) -> None:
    emailit: EmailitClient = app.state.emailit
    if not emailit.is_configured:
        log.warning("Emailit not configured, skipping giveaway confirmation email")
        return
    first = entry["name"].split(" ")[0]
    html = f"""
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:32px 24px;line-height:1.55">
  <h1 style="font-size:24px;margin:0 0 12px;font-weight:700">You&rsquo;re in, {first}.</h1>
  <p>You&rsquo;re entered to win a <strong>lifetime BloomConnect account</strong>, the AI sales agent that replies, sells and books appointments in your chats, 24/7.</p>
  <p><strong>The draw is on {DRAW_DATE_LABEL}.</strong> If your name comes up, we&rsquo;ll contact you at this email address. The winner completes a Bloom DevLabs systems audit, and then we set BloomConnect up around your systems.</p>
  <p style="margin-top:32px">Bloom Development Labs Corp.<br>bybloomlabs.com</p>
</body></html>
""".strip()
    text = (
        f"You're in, {first}.\n\n"
        f"You're entered to win a lifetime BloomConnect account. The draw is on {DRAW_DATE_LABEL}. "
        f"If your name comes up we'll contact you at this email address. The winner completes a "
        f"Bloom DevLabs systems audit, then we set BloomConnect up around your systems.\n\n"
        f"Bloom Development Labs Corp. · bybloomlabs.com"
    )
    try:
        await emailit.send_email(
            to=entry["email"],
            subject="You're in the BloomConnect giveaway",
            html=html,
            text=text,
        )
    except Exception as exc:
        log.warning("Giveaway confirmation email failed for %s: %s", entry["email"], exc)


# ============================================================
# ADMIN
# ============================================================
win_admin_router = APIRouter(
    prefix="/admin/win", tags=["win-admin"], dependencies=[Depends(get_current_user)]
)


@win_admin_router.get("/entries")
async def list_entries(
    limit: int = 500, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    limit = max(1, min(limit, 5000))
    docs = await db.raffle_entries.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    total = await db.raffle_entries.count_documents({})
    winner = await db.raffle_draws.find_one({}, {"_id": 0}, sort=[("drawn_at", -1)])
    return {
        "total": total,
        "entries": [serialize_doc(d) for d in docs],
        "winner": serialize_doc(winner) if winner else None,
    }


@win_admin_router.get("/entries.csv")
async def export_entries(db: AsyncIOMotorDatabase = Depends(get_db)) -> StreamingResponse:
    docs = await db.raffle_entries.find({}, {"_id": 0}).sort("created_at", 1).to_list(50000)
    buf = io.StringIO()
    cols = ["created_at", "name", "business", "email", "phone", "channel", "source_url", "affiliate_ref"]
    writer = csv.writer(buf)
    writer.writerow(cols)
    for d in docs:
        writer.writerow([str(d.get(c) or "") for c in cols])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="giveaway-entries.csv"'},
    )


@win_admin_router.post("/draw")
async def draw_winner(db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    entries = await db.raffle_entries.find({}, {"_id": 0}).to_list(50000)
    if not entries:
        raise HTTPException(409, "No entries to draw from")
    winner = random.SystemRandom().choice(entries)
    draw = {
        "id": str(uuid.uuid4()),
        "entry_id": winner["id"],
        "name": winner["name"],
        "business": winner["business"],
        "email": winner["email"],
        "phone": winner.get("phone"),
        "entries_total": len(entries),
        "drawn_at": datetime.now(timezone.utc),
    }
    await db.raffle_draws.insert_one(prepare_for_mongo(dict(draw)))
    return serialize_doc(draw)
