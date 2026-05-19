"""A/B Testing v2 — full admin-managed experiments with AI-generated variations.

Collections:
  • ab_tests       — one document per experiment
  • ab_test_events — page_view / cta_click / conversion / session_end

Each test stores the *element key* on the page that will be swapped client-side
(e.g. `homepage_hero_cta`). The public frontend asks `/api/public/ab/v2/assign`
for an active test+variant at page load; if one is active it injects the
variation copy via the `useAbVariant` React hook.
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc

log = logging.getLogger("ab_v2")

# =============================================================================
# Constants — page registry + element type whitelist
# =============================================================================
# Keys here are stable identifiers stored on the test doc; the React `<AbSlot>`
# component looks up its element_key to find an active variation.
PAGE_REGISTRY: List[Dict[str, str]] = [
    {"slug": "/", "name": "Homepage"},
    {"slug": "/pricing", "name": "Pricing"},
    {"slug": "/gym-owners", "name": "Gym Owners"},
    {"slug": "/clinics-wellness", "name": "Clinics & Wellness"},
    {"slug": "/how-it-works", "name": "How It Works"},
    {"slug": "/platform", "name": "Platform"},
    {"slug": "/case-studies", "name": "Case Studies"},
    {"slug": "/solutions", "name": "Solutions"},
    {"slug": "/blog", "name": "Blog Index"},
]

ELEMENT_TYPES = {
    "headline": "Page Headline / Hero Copy",
    "cta": "CTA Button Text",
    "subheadline": "Sub-headline / Supporting Copy",
    "testimonial": "Testimonial / Trust Section",
    "form_copy": "Form Copy",
}

VALID_STATUS = {"draft", "active", "paused", "completed", "archived"}
VALID_KINDS = {"page_view", "cta_click", "conversion", "session_end"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return str(uuid.uuid4())


def _hash_visitor(visitor_id: str) -> str:
    return hashlib.sha256(visitor_id.encode()).hexdigest()[:24]


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# =============================================================================
# Pydantic models
# =============================================================================
class AbVariant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    key: str = Field(default_factory=lambda: secrets.token_hex(4))  # A/B/C label
    label: str  # "Control" / "Variation A" / etc.
    content: str  # the actual copy / button text / etc.
    reasoning: Optional[str] = None  # why this variation should win
    weight: int = 50  # traffic split percent (sum across variants ≤ 100)


class AbTest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    name: str
    page_slug: str  # e.g. "/" or "/pricing"
    element_type: str  # one of ELEMENT_TYPES keys
    element_key: str  # stable key the frontend looks up (e.g. "homepage_hero_cta")
    hypothesis: Optional[str] = None
    variants: List[AbVariant]  # first variant is implicitly the control
    duration_days: int = 30
    status: str = "draft"  # draft|active|paused|completed|archived
    winner_variant_key: Optional[str] = None
    p_value: Optional[float] = None
    started_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class AbGenerateRequest(BaseModel):
    page_slug: str
    element_type: str
    current_content: str
    context: Optional[str] = None  # surrounding page copy / target audience


class AbCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    page_slug: str
    element_type: str
    element_key: str = Field(min_length=2, max_length=64)
    hypothesis: Optional[str] = None
    variants: List[AbVariant] = Field(min_length=2, max_length=6)
    duration_days: int = Field(default=30, ge=1, le=180)


class AbTrackV2Request(BaseModel):
    test_id: str
    variant_key: str
    kind: str  # page_view|cta_click|conversion|session_end
    visitor_id: str  # client-generated UUID stored in localStorage
    session_id: Optional[str] = None
    duration_ms: Optional[int] = None  # for session_end
    extra: Optional[Dict[str, Any]] = None  # utm, device, geo etc.


# =============================================================================
# Statistics — Chi-square two-proportion test
# =============================================================================
def _erf(x: float) -> float:
    # Abramowitz & Stegun 7.1.26 — accurate to ~1e-7
    a1 = 0.254829592
    a2 = -0.284496736
    a3 = 1.421413741
    a4 = -1.453152027
    a5 = 1.061405429
    p = 0.3275911
    sign = 1 if x >= 0 else -1
    x = abs(x)
    t = 1.0 / (1.0 + p * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x * x)
    return sign * y


def _normal_cdf(z: float) -> float:
    return 0.5 * (1.0 + _erf(z / math.sqrt(2.0)))


def two_proportion_z_test(
    converted_a: int, total_a: int, converted_b: int, total_b: int
) -> Dict[str, float]:
    """Two-tailed z-test. Returns p-value + confidence + lift."""
    if total_a < 1 or total_b < 1:
        return {"p_value": 1.0, "z": 0.0, "confidence": 0.0, "lift_pct": 0.0}
    p1 = converted_a / total_a
    p2 = converted_b / total_b
    p = (converted_a + converted_b) / (total_a + total_b)
    se = math.sqrt(p * (1 - p) * (1 / total_a + 1 / total_b))
    if se == 0:
        return {
            "p_value": 1.0,
            "z": 0.0,
            "confidence": 0.0,
            "lift_pct": ((p2 - p1) / p1 * 100.0) if p1 > 0 else 0.0,
        }
    z = (p2 - p1) / se
    p_value = 2 * (1 - _normal_cdf(abs(z)))
    lift = ((p2 - p1) / p1 * 100.0) if p1 > 0 else 0.0
    return {
        "p_value": round(p_value, 4),
        "z": round(z, 3),
        "confidence": round((1 - p_value) * 100.0, 1),
        "lift_pct": round(lift, 2),
    }


# =============================================================================
# Public router — variant assignment + event tracking
# =============================================================================
public_v2_router = APIRouter(prefix="/public/ab/v2", tags=["ab-v2-public"])


@public_v2_router.get("/assign/{element_key}")
async def assign_variant(
    element_key: str,
    visitor_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Deterministically assign a variant for `element_key` based on visitor hash.
    If no active test exists for this element, returns `{active: False}` so the
    page renders the static control copy."""
    test = await db.ab_tests.find_one(
        {"element_key": element_key, "status": "active"}, {"_id": 0}
    )
    if not test:
        return {"active": False}
    # Hash the visitor → deterministic 0-99 bucket
    bucket = int(_hash_visitor(visitor_id + ":" + test["id"]), 16) % 100
    cumulative = 0
    chosen = None
    for v in test["variants"]:
        cumulative += int(v.get("weight", 0))
        if bucket < cumulative:
            chosen = v
            break
    if not chosen:
        chosen = test["variants"][0]
    return {
        "active": True,
        "test_id": test["id"],
        "variant_key": chosen["key"],
        "label": chosen["label"],
        "content": chosen["content"],
    }


@public_v2_router.post("/track")
async def track_event(
    body: AbTrackV2Request,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if body.kind not in VALID_KINDS:
        raise HTTPException(422, f"kind must be one of {sorted(VALID_KINDS)}")
    # Verify test exists + variant matches
    test = await db.ab_tests.find_one({"id": body.test_id}, {"_id": 0, "variants": 1, "status": 1})
    if not test:
        # Silently accept — page might have been live during a recent archival
        return {"ok": True, "ignored": "test_not_found"}
    if test.get("status") not in ("active", "paused"):
        return {"ok": True, "ignored": f"status={test.get('status')}"}
    valid_keys = {v["key"] for v in test.get("variants", [])}
    if body.variant_key not in valid_keys:
        return {"ok": True, "ignored": "variant_mismatch"}

    doc = {
        "id": _id(),
        "test_id": body.test_id,
        "variant_key": body.variant_key,
        "kind": body.kind,
        "visitor_hash": _hash_visitor(body.visitor_id),
        "session_id": body.session_id,
        "duration_ms": body.duration_ms,
        "extra": body.extra or {},
        "ua": (request.headers.get("user-agent") or "")[:200],
        "at": _now(),
    }
    await db.ab_test_events.insert_one(prepare_for_mongo(doc))
    return {"ok": True}


# =============================================================================
# Admin router
# =============================================================================
admin_v2_router = APIRouter(
    prefix="/admin/ab/v2",
    tags=["ab-v2-admin"],
    dependencies=[Depends(get_current_user)],
)


@admin_v2_router.get("/registry")
async def get_registry() -> Dict[str, Any]:
    """Pages + element types catalogue for the wizard dropdowns."""
    return {
        "pages": PAGE_REGISTRY,
        "element_types": [{"key": k, "label": v} for k, v in ELEMENT_TYPES.items()],
    }


@admin_v2_router.post("/generate")
async def generate_variations(
    req: AbGenerateRequest, request: Request
) -> Dict[str, Any]:
    """Call Claude Sonnet 4.5 (via OpenRouter) to draft 5 variations."""
    if req.element_type not in ELEMENT_TYPES:
        raise HTTPException(422, f"element_type must be one of {list(ELEMENT_TYPES)}")
    openrouter = request.app.state.openrouter
    page_name = next(
        (p["name"] for p in PAGE_REGISTRY if p["slug"] == req.page_slug),
        req.page_slug,
    )
    user_prompt = (
        f"Page: {page_name} ({req.page_slug})\n"
        f"Element type: {ELEMENT_TYPES[req.element_type]}\n"
        f"Current copy: {req.current_content}\n"
        f"Context: {req.context or '(none)'}\n\n"
        "Generate exactly 5 variations of the above element that would likely "
        "outperform the current copy for Bloom Labs (a high-trust AI-native "
        "custom web app development agency).\n\n"
        "Each variation must target a DIFFERENT customer motivation: speed, "
        "cost/ROI, trust/proof, innovation, and risk-reduction (one per "
        "variation).\n\n"
        "Return ONLY a JSON array (no prose, no fences) of objects with shape:\n"
        '[{"label": "Variation A", "content": "copy here", "reasoning": "why this wins", "motivation": "speed"}]'
    )
    try:
        text = await openrouter.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an elite conversion copywriter for B2B SaaS. "
                        "Bloom Labs ships custom web apps in 21 days. Voice: "
                        "direct, trustworthy, concrete, fast. Never use emoji. "
                        "Return only valid JSON arrays."
                    ),
                },
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1400,
            temperature=0.8,
        )
        if not text:
            raise HTTPException(502, "AI returned empty response")
        import json as _json

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.DOTALL)
        try:
            data = _json.loads(cleaned)
        except Exception:
            m = re.search(r"\[[\s\S]*\]", cleaned)
            if not m:
                raise HTTPException(502, "AI did not return JSON array")
            data = _json.loads(m.group(0))
        if not isinstance(data, list):
            raise HTTPException(502, "AI did not return a list")
        # Normalise — keep first 5
        out = []
        for i, v in enumerate(data[:5]):
            if not isinstance(v, dict):
                continue
            out.append(
                {
                    "key": secrets.token_hex(3),
                    "label": v.get("label") or f"Variation {chr(65+i)}",
                    "content": (v.get("content") or "").strip(),
                    "reasoning": (v.get("reasoning") or "").strip(),
                    "motivation": (v.get("motivation") or "").strip(),
                }
            )
        if not out:
            raise HTTPException(502, "No usable variations parsed from AI response")
        return {"variations": out}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("AB generate variations failed")
        raise HTTPException(502, f"Generation failed: {exc}")


@admin_v2_router.get("")
async def list_tests(
    status: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if status:
        if status not in VALID_STATUS:
            raise HTTPException(422, "invalid status")
        q["status"] = status
    docs = await db.ab_tests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [serialize_doc(d) for d in docs]


@admin_v2_router.get("/summary")
async def dashboard_summary(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Header stats for the dashboard."""
    now = _now()
    month_ago_iso = (now - timedelta(days=30)).isoformat()
    active_count = await db.ab_tests.count_documents({"status": "active"})
    month_count = await db.ab_tests.count_documents({"created_at": {"$gte": month_ago_iso}})
    completed = await db.ab_tests.find(
        {"status": "completed", "p_value": {"$lte": 0.05}},
        {"_id": 0, "name": 1, "winner_variant_key": 1, "variants": 1, "p_value": 1, "id": 1},
    ).to_list(500)
    lifts: List[float] = []
    best = None
    for t in completed:
        # Look up the winner's actual lift from the latest stats snapshot if any
        snap = await _compute_stats(db, t["id"])
        winner_row = next(
            (v for v in snap["per_variant"] if v["variant_key"] == t.get("winner_variant_key")),
            None,
        )
        if winner_row and winner_row.get("lift_pct") is not None:
            lifts.append(winner_row["lift_pct"])
            if not best or winner_row["lift_pct"] > best["lift_pct"]:
                best = {
                    "test_name": t["name"],
                    "test_id": t["id"],
                    "lift_pct": winner_row["lift_pct"],
                }
    avg_lift = round(sum(lifts) / len(lifts), 2) if lifts else 0.0
    return {
        "active_tests": active_count,
        "tests_this_month": month_count,
        "avg_conversion_lift_pct": avg_lift,
        "best_test": best,
    }


@admin_v2_router.get("/{test_id}")
async def get_test(
    test_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.ab_tests.find_one({"id": test_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return serialize_doc(doc)


@admin_v2_router.get("/{test_id}/stats")
async def get_test_stats(
    test_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    test = await db.ab_tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(404, "Not found")
    return await _compute_stats(db, test_id, test=test)


@admin_v2_router.post("")
async def create_test(
    req: AbCreateRequest,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    if req.element_type not in ELEMENT_TYPES:
        raise HTTPException(422, "invalid element_type")
    if not any(p["slug"] == req.page_slug for p in PAGE_REGISTRY):
        # Allow custom slugs — frontend may register a new page
        log.info("Creating test for unregistered page slug %s", req.page_slug)
    # Enforce element_key uniqueness among active tests
    clash = await db.ab_tests.find_one(
        {"element_key": req.element_key, "status": "active"}
    )
    if clash:
        raise HTTPException(
            409,
            f"Another active test already targets element_key '{req.element_key}'. "
            "Pause/complete it first.",
        )
    # Ensure variant labels & weights are sensible
    variants = req.variants
    total_w = sum(v.weight for v in variants)
    if total_w == 0:
        # default to even split
        even = max(1, 100 // len(variants))
        for v in variants:
            v.weight = even
    user = getattr(request.state, "user", None)
    test = AbTest(
        name=req.name,
        page_slug=req.page_slug,
        element_type=req.element_type,
        element_key=req.element_key,
        hypothesis=req.hypothesis,
        variants=variants,
        duration_days=req.duration_days,
        status="draft",
        created_by=(user or {}).get("email") if isinstance(user, dict) else None,
    )
    await db.ab_tests.insert_one(prepare_for_mongo(test.model_dump()))
    return serialize_doc(test.model_dump())


@admin_v2_router.post("/{test_id}/launch")
async def launch_test(
    test_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    test = await db.ab_tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(404, "Not found")
    if test["status"] == "active":
        return {"ok": True, "already_active": True}
    started = _now()
    ends = started + timedelta(days=int(test.get("duration_days", 30)))
    await db.ab_tests.update_one(
        {"id": test_id},
        {
            "$set": prepare_for_mongo(
                {
                    "status": "active",
                    "started_at": started,
                    "ends_at": ends,
                    "updated_at": started,
                }
            )
        },
    )
    return {"ok": True, "started_at": started.isoformat(), "ends_at": ends.isoformat()}


@admin_v2_router.post("/{test_id}/pause")
async def pause_test(
    test_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    await db.ab_tests.update_one(
        {"id": test_id},
        {"$set": prepare_for_mongo({"status": "paused", "updated_at": _now()})},
    )
    return {"ok": True}


@admin_v2_router.post("/{test_id}/complete")
async def complete_test(
    test_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    """Finalise a test: compute winner, freeze stats, mark completed."""
    test = await db.ab_tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(404, "Not found")
    stats = await _compute_stats(db, test_id, test=test)
    winner_key = None
    p_value = None
    # Pick variant with highest conversion rate IF significant vs control
    rows = stats["per_variant"]
    if rows:
        control = rows[0]
        best = max(rows[1:], key=lambda r: r.get("conversion_rate", 0), default=None)
        if best and best.get("p_value") is not None and best["p_value"] <= 0.05 and best.get(
            "conversion_rate", 0
        ) > control.get("conversion_rate", 0):
            winner_key = best["variant_key"]
            p_value = best["p_value"]
    await db.ab_tests.update_one(
        {"id": test_id},
        {
            "$set": prepare_for_mongo(
                {
                    "status": "completed",
                    "completed_at": _now(),
                    "updated_at": _now(),
                    "winner_variant_key": winner_key,
                    "p_value": p_value,
                }
            )
        },
    )
    return {"ok": True, "winner_variant_key": winner_key, "p_value": p_value}


@admin_v2_router.post("/{test_id}/apply-winner")
async def apply_winner(
    test_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    """Mark the winning variant as the new control by archiving the test and
    storing the winning copy in `ab_applied_winners` for record-keeping.
    The frontend hook will fall back to the static control copy once the test
    is archived — so the implementer should update the static page copy to the
    winning content."""
    test = await db.ab_tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        raise HTTPException(404, "Not found")
    winner_key = test.get("winner_variant_key")
    if not winner_key:
        raise HTTPException(409, "Test has no winner declared yet")
    winner = next(
        (v for v in test.get("variants", []) if v.get("key") == winner_key), None
    )
    if not winner:
        raise HTTPException(409, "Winner variant content missing")
    await db.ab_applied_winners.insert_one(
        prepare_for_mongo(
            {
                "id": _id(),
                "test_id": test_id,
                "element_key": test.get("element_key"),
                "winning_content": winner.get("content"),
                "applied_at": _now(),
            }
        )
    )
    await db.ab_tests.update_one(
        {"id": test_id},
        {"$set": prepare_for_mongo({"status": "archived", "updated_at": _now()})},
    )
    return {
        "ok": True,
        "element_key": test.get("element_key"),
        "winning_content": winner.get("content"),
        "instructions": (
            "Winner has been recorded. The test is now archived. Update the "
            "static page copy for this element to the winning content above to "
            "make it permanent."
        ),
    }


@admin_v2_router.delete("/{test_id}")
async def delete_test(
    test_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    await db.ab_tests.delete_one({"id": test_id})
    await db.ab_test_events.delete_many({"test_id": test_id})
    return {"ok": True}


# =============================================================================
# Stats helper
# =============================================================================
async def _compute_stats(
    db: AsyncIOMotorDatabase,
    test_id: str,
    test: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if test is None:
        test = await db.ab_tests.find_one({"id": test_id}, {"_id": 0})
    if not test:
        return {"per_variant": [], "daily": []}

    # Aggregate event counts per variant per kind
    pipeline: List[Dict[str, Any]] = [
        {"$match": {"test_id": test_id}},
        {
            "$group": {
                "_id": {"variant": "$variant_key", "kind": "$kind"},
                "total": {"$sum": 1},
                "visitors": {"$addToSet": "$visitor_hash"},
                "total_duration_ms": {"$sum": {"$ifNull": ["$duration_ms", 0]}},
            }
        },
    ]
    rows = await db.ab_test_events.aggregate(pipeline).to_list(500)
    per_var: Dict[str, Dict[str, Any]] = {}
    for v in test.get("variants", []):
        per_var[v["key"]] = {
            "variant_key": v["key"],
            "label": v["label"],
            "content": v["content"],
            "page_views": 0,
            "cta_clicks": 0,
            "conversions": 0,
            "unique_visitors": 0,
            "avg_session_seconds": 0.0,
            "_visitors": set(),
            "_total_duration": 0,
            "_session_count": 0,
        }
    for r in rows:
        vkey = r["_id"]["variant"]
        if vkey not in per_var:
            continue  # ignore stale events
        kind = r["_id"]["kind"]
        bucket = per_var[vkey]
        if kind == "page_view":
            bucket["page_views"] = r["total"]
            bucket["_visitors"] = set(v for v in r.get("visitors") or [] if v)
        elif kind == "cta_click":
            bucket["cta_clicks"] = r["total"]
        elif kind == "conversion":
            bucket["conversions"] = r["total"]
        elif kind == "session_end":
            bucket["_total_duration"] = r.get("total_duration_ms") or 0
            bucket["_session_count"] = r["total"]

    # Compute derived metrics
    variant_keys = [v["key"] for v in test.get("variants", [])]
    control_key = variant_keys[0] if variant_keys else None
    out_rows: List[Dict[str, Any]] = []
    control_bucket = per_var.get(control_key) if control_key else None
    for vkey in variant_keys:
        b = per_var[vkey]
        pv = b["page_views"]
        b["unique_visitors"] = len(b.pop("_visitors", set()) or set())
        b["ctr"] = round(b["cta_clicks"] / pv, 4) if pv else 0.0
        b["conversion_rate"] = round(b["conversions"] / pv, 4) if pv else 0.0
        sess_count = b.pop("_session_count", 0)
        total_dur = b.pop("_total_duration", 0)
        b["avg_session_seconds"] = round(total_dur / sess_count / 1000, 1) if sess_count else 0.0
        # Significance vs control
        if control_bucket and vkey != control_key:
            stats = two_proportion_z_test(
                control_bucket["conversions"],
                control_bucket["page_views"],
                b["conversions"],
                pv,
            )
            b["p_value"] = stats["p_value"]
            b["confidence_pct"] = stats["confidence"]
            b["lift_pct"] = stats["lift_pct"]
        else:
            b["p_value"] = None
            b["confidence_pct"] = None
            b["lift_pct"] = 0.0
        out_rows.append(b)

    # Daily trend — conversion rate per variant per day (last 30 days)
    # Note: `at` is stored as ISO string by prepare_for_mongo, so substring it.
    daily_pipeline: List[Dict[str, Any]] = [
        {"$match": {"test_id": test_id, "kind": {"$in": ["page_view", "conversion"]}}},
        {
            "$group": {
                "_id": {
                    "variant": "$variant_key",
                    "kind": "$kind",
                    "day": {"$substr": ["$at", 0, 10]},
                },
                "total": {"$sum": 1},
            }
        },
        {"$sort": {"_id.day": 1}},
    ]
    daily_rows = await db.ab_test_events.aggregate(daily_pipeline).to_list(5000)
    daily_map: Dict[str, Dict[str, Dict[str, int]]] = {}  # day → variant → {pv, conv}
    for r in daily_rows:
        day = r["_id"]["day"]
        v = r["_id"]["variant"]
        kind = r["_id"]["kind"]
        daily_map.setdefault(day, {}).setdefault(v, {"pv": 0, "conv": 0})
        if kind == "page_view":
            daily_map[day][v]["pv"] = r["total"]
        else:
            daily_map[day][v]["conv"] = r["total"]
    daily_series: List[Dict[str, Any]] = []
    for day in sorted(daily_map.keys()):
        row = {"day": day}
        for vkey in variant_keys:
            cell = daily_map[day].get(vkey, {"pv": 0, "conv": 0})
            row[vkey] = round(cell["conv"] / cell["pv"] * 100, 2) if cell["pv"] else 0.0
        daily_series.append(row)

    # Progress
    started = test.get("started_at")
    ends = test.get("ends_at")
    pct_complete = 0
    days_remaining = test.get("duration_days", 0)
    if started and ends:
        if isinstance(started, str):
            started = datetime.fromisoformat(started.replace("Z", "+00:00"))
        if isinstance(ends, str):
            ends = datetime.fromisoformat(ends.replace("Z", "+00:00"))
        total_seconds = (ends - started).total_seconds()
        elapsed = (_now() - started).total_seconds()
        pct_complete = max(0, min(100, round(elapsed / total_seconds * 100))) if total_seconds else 0
        days_remaining = max(0, (ends - _now()).days)

    return {
        "test_id": test_id,
        "per_variant": out_rows,
        "daily": daily_series,
        "pct_complete": pct_complete,
        "days_remaining": days_remaining,
        "control_key": control_key,
        "computed_at": _now().isoformat(),
    }


# =============================================================================
# Cron — auto-complete tests that have reached their end date
# =============================================================================
async def auto_complete_expired_tests(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """Called daily by the scheduler — flips expired active tests to completed."""
    # `ends_at` is stored as an ISO string (prepare_for_mongo) so we compare
    # against a string representation of "now" for a correct lexicographic match.
    now_iso = _now().isoformat()
    expired = await db.ab_tests.find(
        {"status": "active", "ends_at": {"$lte": now_iso}}, {"_id": 0, "id": 1}
    ).to_list(500)
    completed = 0
    for t in expired:
        try:
            stats = await _compute_stats(db, t["id"])
            rows = stats["per_variant"]
            winner_key = None
            p_value = None
            if rows:
                control = rows[0]
                best = max(
                    rows[1:], key=lambda r: r.get("conversion_rate", 0), default=None
                )
                if (
                    best
                    and best.get("p_value") is not None
                    and best["p_value"] <= 0.05
                    and best.get("conversion_rate", 0) > control.get("conversion_rate", 0)
                ):
                    winner_key = best["variant_key"]
                    p_value = best["p_value"]
            await db.ab_tests.update_one(
                {"id": t["id"]},
                {
                    "$set": prepare_for_mongo(
                        {
                            "status": "completed",
                            "completed_at": _now(),
                            "updated_at": _now(),
                            "winner_variant_key": winner_key,
                            "p_value": p_value,
                        }
                    )
                },
            )
            # Notification row for the admin bell
            await db.notifications.insert_one(
                prepare_for_mongo(
                    {
                        "id": _id(),
                        "kind": "system",
                        "title": "A/B test completed",
                        "body": f"Test '{t['id']}' has ended. Winner: {winner_key or 'inconclusive'}",
                        "at": _now(),
                        "read": False,
                    }
                )
            )
            completed += 1
        except Exception as exc:
            log.exception("Auto-complete failed for test %s: %s", t.get("id"), exc)
    return {"completed": completed}


__all__ = [
    "public_v2_router",
    "admin_v2_router",
    "auto_complete_expired_tests",
]
