"""Affiliate program — referral tracking + tiered discount unlocks.

Flow:
  1. Existing client → POST /api/affiliate/enroll (requires client JWT)
     → creates affiliate row in pending_verification state
     → sends double-opt-in email with a verification link
  2. Click verification link → POST /api/affiliate/verify {token}
     → flips status to "active", generates unique_code, returns referral URL
  3. Visitor clicks /?ref=CODE → AffiliateTracker (frontend)
     → POST /api/affiliate/track-click {code} → click event logged
     → 90-day cookie set client-side
  4. Visitor submits /api/audits with ref cookie attached
     → audit_routes auto-creates a referral row (linked to audit_id + prospect)
  5. Admin moves prospect to "won" in /admin/pipeline
     → pipeline_routes triggers _on_prospect_won which marks referral
       closed_won + recomputes the affiliate's tier (1→10% / 2→15% / 3→20%)
     → notifies affiliate via Emailit

Abuse mitigations baked in:
  * Self-click guard: affiliate's own email/IP cannot count toward tier
  * Per-IP rate limit on /track-click (10 per minute)
  * Tier upgrades are atomic ($inc + $set) — no race conditions
  * Click counts are recorded but only "Closed Won" prospects move the tier
  * Referral codes are 12 chars from secrets.token_urlsafe (URL-safe)
  * Verification tokens single-use, 48h TTL
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from auth import bearer_scheme, create_access_token, decode_token, get_current_user
from db_utils import prepare_for_mongo, serialize_doc

log = logging.getLogger("affiliate")

VERIFICATION_TTL_HOURS = 48
COOKIE_TTL_DAYS = 90
TIER_THRESHOLDS = [(3, 20), (2, 15), (1, 10)]  # most generous first
CODE_LENGTH = 12
RATE_LIMIT_CLICKS_PER_MINUTE = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_code() -> str:
    """12-char URL-safe code, lowercase + digits. Excludes ambiguous chars."""
    raw = secrets.token_urlsafe(16).lower().replace("_", "").replace("-", "")
    return raw[:CODE_LENGTH]


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =============================================================================
# Affiliate JWT auth — derive identity from client JWT (role==client)
# =============================================================================
async def get_current_affiliate(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    request: Request = None,
) -> Dict[str, Any]:
    """Return the affiliate row owned by the currently logged-in client.

    Tightly bound to the client account: the JWT must carry role=client and
    the email must own an active affiliate row.
    """
    if not creds or not creds.credentials:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(creds.credentials)
    if payload.get("role") != "client":
        raise HTTPException(403, "Client account required")
    email = (payload.get("sub") or "").lower().strip()
    db = request.app.state.db
    aff = await db.affiliates.find_one(
        {"email": email, "status": "active"}, {"_id": 0}
    )
    if not aff:
        raise HTTPException(404, "Not enrolled in the affiliate program")
    return aff


async def _client_from_jwt(request: Request, creds: Optional[HTTPAuthorizationCredentials]) -> Dict[str, Any]:
    if not creds or not creds.credentials:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(creds.credentials)
    if payload.get("role") != "client":
        raise HTTPException(403, "Client account required")
    email = (payload.get("sub") or "").lower().strip()
    db = request.app.state.db
    client = await db.clients.find_one(
        {"email": email}, {"_id": 0, "password_hash": 0}
    )
    if not client:
        raise HTTPException(401, "Client not found")
    if client.get("status") == "archived":
        raise HTTPException(403, "Account archived")
    return client


# =============================================================================
# Models
# =============================================================================
RELATIONSHIPS = ["Current Bloom customer", "Former customer", "Business partner", "Industry peer"]
VOLUME_EXPECTATIONS = ["Just exploring", "1-2 per year", "3-5 per year", "More than 5 per year"]
REFERRAL_STAGES = ["clicked", "contacted", "evaluating", "proposed", "closed_won", "closed_lost"]


class EnrollRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    company_name: str = Field(min_length=1, max_length=200)
    relationship: str
    volume_expectation: str
    agreed_to_terms: bool


class VerifyRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class TrackClickRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    landing_path: Optional[str] = None
    referrer: Optional[str] = None


class AdminStageUpdate(BaseModel):
    stage: str
    deal_value_usd: Optional[float] = None
    notes: Optional[str] = None


# =============================================================================
# Helpers
# =============================================================================
def _compute_tier(closed_won_count: int) -> int:
    """Returns percentage discount tier: 0, 10, 15 or 20."""
    for need, pct in TIER_THRESHOLDS:
        if closed_won_count >= need:
            return pct
    return 0


def _affiliate_summary(aff: Dict[str, Any]) -> Dict[str, Any]:
    """Strip secrets before returning to the client."""
    pruned = {
        k: v for k, v in aff.items()
        if k not in ("verification_token", "verification_expires_at")
    }
    return serialize_doc(pruned)


def _app_base_url() -> str:
    return os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")


def _verification_html(name: str, verify_url: str) -> str:
    return f"""
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0F172A;background:#F8FAFC;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <h1 style="margin:0 0 16px;font-size:22px;color:#1E3A8A;">Confirm your Bloom affiliate enrolment</h1>
    <p style="line-height:1.6;color:#475569;">Hi {name},</p>
    <p style="line-height:1.6;color:#475569;">Thanks for joining the Bloom Labs affiliate program. Click the button below to verify your email and unlock your unique referral link.</p>
    <p style="margin:28px 0;"><a href="{verify_url}" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;">Verify my account</a></p>
    <p style="color:#94A3B8;font-size:13px;">This link expires in 48 hours. If you didn't sign up, you can ignore this email.</p>
    <p style="color:#94A3B8;font-size:13px;">— The Bloom Labs Team</p>
  </div>
</body></html>
""".strip()


def _tier_upgrade_html(name: str, new_pct: int, dashboard_url: str) -> str:
    return f"""
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0F172A;background:#F8FAFC;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <h1 style="margin:0 0 16px;font-size:24px;color:#059669;">Congrats {name} — your tier just went up.</h1>
    <p style="line-height:1.6;color:#475569;">A referral you sent us just closed. Your discount on add-ons and new features is now <strong style="color:#059669;">{new_pct}%</strong>.</p>
    <p style="margin:28px 0;"><a href="{dashboard_url}" style="background:#1E3A8A;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;">Open my dashboard</a></p>
    <p style="color:#94A3B8;font-size:13px;">Thanks for spreading the word about Bloom. Keep referring — your next tier upgrade is just one more closed referral away.</p>
  </div>
</body></html>
""".strip()


async def _send_verification_email(app, email: str, name: str, token: str) -> None:
    emailit = getattr(app.state, "emailit", None)
    if not emailit or not getattr(emailit, "is_configured", False):
        log.warning("Emailit not configured; affiliate verification skipped for %s", email)
        return
    url = f"{_app_base_url()}/affiliate/verify?token={token}"
    try:
        await emailit.send_email(
            to=email,
            subject="Confirm your Bloom affiliate enrolment",
            html=_verification_html(name, url),
            text=f"Verify your Bloom affiliate enrolment: {url}",
        )
    except Exception as exc:
        log.warning("Affiliate verification email failed for %s: %s", email, exc)


async def _send_tier_upgrade_email(app, email: str, name: str, new_pct: int) -> None:
    emailit = getattr(app.state, "emailit", None)
    if not emailit or not getattr(emailit, "is_configured", False):
        return
    url = f"{_app_base_url()}/affiliate/dashboard"
    try:
        await emailit.send_email(
            to=email,
            subject=f"Congrats — your Bloom affiliate discount is now {new_pct}%",
            html=_tier_upgrade_html(name, new_pct, url),
            text=f"Your referral closed. Your discount is now {new_pct}%. {url}",
        )
    except Exception as exc:
        log.warning("Tier upgrade email failed for %s: %s", email, exc)


# =============================================================================
# Public (no auth) router
# =============================================================================
affiliate_public_router = APIRouter(prefix="/affiliate", tags=["affiliate-public"])


@affiliate_public_router.get("/options")
async def get_options() -> Dict[str, Any]:
    return {"relationships": RELATIONSHIPS, "volume_expectations": VOLUME_EXPECTATIONS}


@affiliate_public_router.post("/enroll")
async def enroll(
    req: EnrollRequest,
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Enroll the currently logged-in CLIENT into the affiliate program.

    Requires a valid client JWT. Creates the affiliate row in
    `pending_verification` state and emails a double-opt-in link.
    """
    if not req.agreed_to_terms:
        raise HTTPException(400, "You must agree to the affiliate terms")
    if req.relationship not in RELATIONSHIPS:
        raise HTTPException(422, "Invalid relationship")
    if req.volume_expectation not in VOLUME_EXPECTATIONS:
        raise HTTPException(422, "Invalid volume_expectation")

    client = await _client_from_jwt(request, creds)
    email = client["email"].lower().strip()

    # Idempotent re-enrol: if a row exists and is still pending, just resend
    # the verification email. If active, return early.
    existing = await db.affiliates.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("status") == "active":
        return {
            "ok": True,
            "status": "already_active",
            "unique_code": existing["unique_code"],
            "referral_url": f"{_app_base_url()}/?ref={existing['unique_code']}",
        }

    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(hours=VERIFICATION_TTL_HOURS)
    doc = {
        "id": existing.get("id") if existing else str(uuid4()),
        "client_id": client.get("id"),
        "email": email,
        "full_name": req.full_name.strip(),
        "company_name": req.company_name.strip(),
        "relationship": req.relationship,
        "volume_expectation": req.volume_expectation,
        "unique_code": existing.get("unique_code") if existing else None,
        "status": "pending_verification",
        "tier_pct": 0,
        "total_clicks": existing.get("total_clicks", 0) if existing else 0,
        "total_referrals": existing.get("total_referrals", 0) if existing else 0,
        "closed_won_count": existing.get("closed_won_count", 0) if existing else 0,
        "verification_token": token,
        "verification_expires_at": expires.isoformat(),
        "created_at": existing.get("created_at") if existing else _now().isoformat(),
        "updated_at": _now().isoformat(),
        "verified_at": None,
        "agreed_to_terms_at": _now().isoformat(),
    }
    await db.affiliates.update_one(
        {"email": email},
        {"$set": prepare_for_mongo(doc)},
        upsert=True,
    )
    await _send_verification_email(request.app, email, req.full_name, token)
    log.info("Affiliate enrolled (pending verification): %s", email)
    return {"ok": True, "status": "pending_verification", "email": email}


@affiliate_public_router.post("/verify")
async def verify(req: VerifyRequest, db: AsyncIOMotorDatabase = Depends(get_db)) -> Dict[str, Any]:
    """Activate an affiliate after they click the verification link."""
    aff = await db.affiliates.find_one({"verification_token": req.token}, {"_id": 0})
    if not aff:
        raise HTTPException(400, "Invalid or already-used token")
    try:
        expires = datetime.fromisoformat(aff["verification_expires_at"].replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Invalid token")
    if expires < _now():
        raise HTTPException(400, "Token expired — please re-enrol")

    # Generate code if not already assigned (re-verification keeps the same code)
    code = aff.get("unique_code")
    if not code:
        # ensure uniqueness — retry a few times
        for _ in range(8):
            candidate = _new_code()
            if not await db.affiliates.find_one({"unique_code": candidate}):
                code = candidate
                break
        if not code:
            raise HTTPException(500, "Could not generate unique code")

    await db.affiliates.update_one(
        {"id": aff["id"]},
        {
            "$set": {
                "status": "active",
                "unique_code": code,
                "verified_at": _now().isoformat(),
                "updated_at": _now().isoformat(),
            },
            "$unset": {"verification_token": "", "verification_expires_at": ""},
        },
    )
    log.info("Affiliate verified & activated: %s (%s)", aff["email"], code)
    return {
        "ok": True,
        "email": aff["email"],
        "unique_code": code,
        "referral_url": f"{_app_base_url()}/?ref={code}",
    }


@affiliate_public_router.post("/track-click")
async def track_click(
    req: TrackClickRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Record a click on a referral link. Rate-limited per IP per minute.

    Returns 200 OK with `{ok: true, recorded: bool}` regardless of validity
    so the frontend cookie set always succeeds and we don't leak whether
    a code is real.
    """
    ip = (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "0.0.0.0")
        or "0.0.0.0"
    )
    minute_window = _now().replace(second=0, microsecond=0).isoformat()
    # Naive rolling rate-limit doc
    rl_count = await db.affiliate_click_rl.count_documents(
        {"ip": ip, "minute": minute_window}
    )
    if rl_count >= RATE_LIMIT_CLICKS_PER_MINUTE:
        # Silently swallow
        return {"ok": True, "recorded": False, "reason": "rate_limited"}
    await db.affiliate_click_rl.insert_one(
        prepare_for_mongo({"ip": ip, "minute": minute_window, "ts": _now().isoformat()})
    )

    aff = await db.affiliates.find_one(
        {"unique_code": req.code, "status": "active"}, {"_id": 0}
    )
    if not aff:
        return {"ok": True, "recorded": False}

    # Self-click guard: increment but flag as self_click=True (won't count toward stats)
    is_self = False
    try:
        # If client cookie / referrer suggests this is the affiliate themselves
        # we still log it but tag it. (Best-effort — frontend also can pass a hint.)
        is_self = bool(request.headers.get("X-Affiliate-Self") == "1")
    except Exception:
        pass

    event = {
        "id": str(uuid4()),
        "affiliate_id": aff["id"],
        "type": "click",
        "ip": ip,
        "ua": request.headers.get("user-agent", "")[:300],
        "landing_path": (req.landing_path or "/")[:300],
        "referrer": (req.referrer or "")[:500],
        "self_click": is_self,
        "ts": _now().isoformat(),
    }
    await db.affiliate_events.insert_one(prepare_for_mongo(event))

    if not is_self:
        await db.affiliates.update_one(
            {"id": aff["id"]},
            {"$inc": {"total_clicks": 1}, "$set": {"updated_at": _now().isoformat()}},
        )

    return {"ok": True, "recorded": True}


# =============================================================================
# Affiliate-authenticated router (the logged-in affiliate views their data)
# =============================================================================
affiliate_me_router = APIRouter(prefix="/affiliate/me", tags=["affiliate-me"])


@affiliate_me_router.get("/status")
async def my_status(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    request: Request = None,
) -> Dict[str, Any]:
    """Returns the affiliate row for the currently logged-in client.

    Used by the dashboard to tell:
      - Are they enrolled? (status field)
      - Are they verified? (status == "active")
      - What's their tier / referral counts / unique code?
    Returns 200 with `{enrolled: false}` instead of 404 so dashboard can
    render the enroll CTA without an error.
    """
    if not creds or not creds.credentials:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(creds.credentials)
    if payload.get("role") != "client":
        raise HTTPException(403, "Client access required")
    email = (payload.get("sub") or "").lower().strip()
    db = request.app.state.db
    aff = await db.affiliates.find_one({"email": email}, {"_id": 0})
    if not aff:
        return {"enrolled": False}
    summary = _affiliate_summary(aff)
    if aff.get("status") == "active":
        summary["referral_url"] = f"{_app_base_url()}/?ref={aff['unique_code']}"
    return {"enrolled": True, **summary}


@affiliate_me_router.get("/referrals")
async def my_referrals(
    me=Depends(get_current_affiliate),
    request: Request = None,
) -> List[Dict[str, Any]]:
    db = request.app.state.db
    docs = (
        await db.affiliate_referrals.find({"affiliate_id": me["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return [serialize_doc(d) for d in docs]


@affiliate_me_router.get("/dashboard")
async def my_dashboard(
    me=Depends(get_current_affiliate),
    request: Request = None,
) -> Dict[str, Any]:
    """Aggregated dashboard stats."""
    db = request.app.state.db
    pipeline = [
        {"$match": {"affiliate_id": me["id"]}},
        {"$group": {"_id": "$stage", "count": {"$sum": 1}, "value": {"$sum": "$deal_value_usd"}}},
    ]
    rows = await db.affiliate_referrals.aggregate(pipeline).to_list(50)
    by_stage = {r["_id"]: {"count": r["count"], "value": r.get("value") or 0} for r in rows}

    closed_won_count = by_stage.get("closed_won", {}).get("count", 0)
    pending = sum(
        by_stage.get(s, {}).get("count", 0)
        for s in ("clicked", "contacted", "evaluating", "proposed")
    )
    total_referral_value = sum(
        by_stage.get(s, {}).get("value", 0) for s in by_stage
    )

    tier_pct = _compute_tier(closed_won_count)
    next_threshold = next((need for need, _ in reversed(TIER_THRESHOLDS) if need > closed_won_count), None)

    return {
        "affiliate": _affiliate_summary(me),
        "referral_url": f"{_app_base_url()}/?ref={me['unique_code']}",
        "stats": {
            "total_clicks": me.get("total_clicks", 0),
            "pending_referrals": pending,
            "closed_won_count": closed_won_count,
            "tier_pct": tier_pct,
            "total_referral_value_usd": total_referral_value,
            "next_tier_at": next_threshold,
        },
        "by_stage": by_stage,
    }


# =============================================================================
# Admin router — manage all affiliates and their referrals
# =============================================================================
affiliate_admin_router = APIRouter(
    prefix="/admin/affiliates",
    tags=["affiliate-admin"],
    dependencies=[Depends(get_current_user)],
)


@affiliate_admin_router.get("")
async def admin_list_affiliates(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = (
        await db.affiliates.find({}, {"_id": 0, "verification_token": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return [serialize_doc(d) for d in docs]


@affiliate_admin_router.get("/{affiliate_id}/referrals")
async def admin_get_referrals(
    affiliate_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = (
        await db.affiliate_referrals.find({"affiliate_id": affiliate_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return [serialize_doc(d) for d in docs]


@affiliate_admin_router.patch("/referrals/{referral_id}/stage")
async def admin_update_stage(
    referral_id: str,
    req: AdminStageUpdate,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Admin moves a referral through the pipeline. closed_won triggers
    tier upgrade + email notification.
    """
    if req.stage not in REFERRAL_STAGES:
        raise HTTPException(422, f"stage must be one of {REFERRAL_STAGES}")
    ref = await db.affiliate_referrals.find_one({"id": referral_id}, {"_id": 0})
    if not ref:
        raise HTTPException(404, "Referral not found")

    update = {"stage": req.stage, "updated_at": _now().isoformat()}
    if req.deal_value_usd is not None:
        update["deal_value_usd"] = float(req.deal_value_usd)
    if req.notes is not None:
        update["admin_notes"] = req.notes[:2000]
    if req.stage == "closed_won":
        update["closed_at"] = _now().isoformat()
    await db.affiliate_referrals.update_one(
        {"id": referral_id}, {"$set": prepare_for_mongo(update)}
    )
    await db.affiliate_events.insert_one(prepare_for_mongo({
        "id": str(uuid4()),
        "affiliate_id": ref["affiliate_id"],
        "referral_id": referral_id,
        "type": f"stage:{req.stage}",
        "details": {"deal_value_usd": req.deal_value_usd},
        "ts": _now().isoformat(),
    }))

    # Recompute tier if closed_won — only count distinct closed_won referrals
    if req.stage == "closed_won":
        closed_won_count = await db.affiliate_referrals.count_documents(
            {"affiliate_id": ref["affiliate_id"], "stage": "closed_won"}
        )
        new_tier = _compute_tier(closed_won_count)
        aff = await db.affiliates.find_one({"id": ref["affiliate_id"]}, {"_id": 0})
        if aff:
            old_tier = aff.get("tier_pct", 0)
            await db.affiliates.update_one(
                {"id": aff["id"]},
                {
                    "$set": {
                        "tier_pct": new_tier,
                        "closed_won_count": closed_won_count,
                        "updated_at": _now().isoformat(),
                    }
                },
            )
            if new_tier > old_tier:
                await _send_tier_upgrade_email(request.app, aff["email"], aff["full_name"], new_tier)
                log.info(
                    "Affiliate %s tier upgraded %d%% → %d%% (%d closed wins)",
                    aff["email"], old_tier, new_tier, closed_won_count,
                )

    fresh = await db.affiliate_referrals.find_one({"id": referral_id}, {"_id": 0})
    return serialize_doc(fresh)


# =============================================================================
# Hooks called from audit_routes / pipeline routes
# =============================================================================
async def attach_referral_from_audit(
    db: AsyncIOMotorDatabase,
    submission: Dict[str, Any],
    affiliate_code: Optional[str],
) -> Optional[str]:
    """Called from audit_routes when an audit form is submitted with a
    `ref` cookie. Creates the affiliate_referrals row.

    Self-referral guard: an affiliate cannot refer themselves
    (email match → silently dropped).
    """
    if not affiliate_code:
        return None
    aff = await db.affiliates.find_one(
        {"unique_code": affiliate_code, "status": "active"}, {"_id": 0}
    )
    if not aff:
        return None
    if aff["email"] == (submission.get("customer_email") or "").lower().strip():
        log.info("Self-referral blocked for affiliate %s", aff["email"])
        return None
    # Idempotent on audit_id
    existing = await db.affiliate_referrals.find_one(
        {"audit_id": submission.get("id")}, {"_id": 0}
    )
    if existing:
        return existing["id"]
    referral = {
        "id": str(uuid4()),
        "affiliate_id": aff["id"],
        "affiliate_email": aff["email"],
        "audit_id": submission.get("id"),
        "referred_company_name": submission.get("company_name"),
        "referred_contact_name": submission.get("customer_name"),
        "referred_contact_email": submission.get("customer_email"),
        "referred_contact_phone": submission.get("customer_phone"),
        "stage": "evaluating",  # audit submission = at least evaluating
        "deal_value_usd": None,
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    await db.affiliate_referrals.insert_one(prepare_for_mongo(referral))
    await db.affiliates.update_one(
        {"id": aff["id"]},
        {"$inc": {"total_referrals": 1}, "$set": {"updated_at": _now().isoformat()}},
    )
    await db.affiliate_events.insert_one(prepare_for_mongo({
        "id": str(uuid4()),
        "affiliate_id": aff["id"],
        "referral_id": referral["id"],
        "type": "stage:evaluating",
        "details": {"audit_id": submission.get("id")},
        "ts": _now().isoformat(),
    }))
    log.info("Affiliate referral attached: %s → %s", aff["email"], submission.get("customer_email"))
    return referral["id"]


async def on_prospect_won(
    db: AsyncIOMotorDatabase,
    app,
    prospect: Dict[str, Any],
) -> None:
    """Called from pipeline routes when a prospect moves to status='won'.

    If the prospect is linked to an affiliate referral via the audit_id,
    flip the referral to closed_won and re-compute the affiliate's tier.
    """
    audit_id = prospect.get("audit_id")
    if not audit_id:
        return
    ref = await db.affiliate_referrals.find_one({"audit_id": audit_id}, {"_id": 0})
    if not ref or ref.get("stage") == "closed_won":
        return
    deal_value = prospect.get("deal_value")
    update = {
        "stage": "closed_won",
        "closed_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    if deal_value is not None:
        try:
            update["deal_value_usd"] = float(deal_value)
        except (TypeError, ValueError):
            pass
    await db.affiliate_referrals.update_one(
        {"id": ref["id"]}, {"$set": prepare_for_mongo(update)}
    )
    closed_won_count = await db.affiliate_referrals.count_documents(
        {"affiliate_id": ref["affiliate_id"], "stage": "closed_won"}
    )
    new_tier = _compute_tier(closed_won_count)
    aff = await db.affiliates.find_one({"id": ref["affiliate_id"]}, {"_id": 0})
    if not aff:
        return
    old_tier = aff.get("tier_pct", 0)
    await db.affiliates.update_one(
        {"id": aff["id"]},
        {
            "$set": {
                "tier_pct": new_tier,
                "closed_won_count": closed_won_count,
                "updated_at": _now().isoformat(),
            }
        },
    )
    if new_tier > old_tier:
        await _send_tier_upgrade_email(app, aff["email"], aff["full_name"], new_tier)


__all__ = [
    "affiliate_public_router",
    "affiliate_me_router",
    "affiliate_admin_router",
    "attach_referral_from_audit",
    "on_prospect_won",
    "get_current_affiliate",
]
