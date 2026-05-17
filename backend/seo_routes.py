"""SEO Search-Engine Submission + Page-Diff routes.

Capabilities:
  * One-click submit to Bing IndexNow (UUID-keyed, no signup needed)
  * One-click submit to Bing Webmaster API (if user-provided API key in DB)
  * Deep-link URL for Google Search Console sitemap submission
  * Daily cron: diff current sitemap.xml vs last snapshot. New URLs trigger
    a Notification + optionally an OpenRouter-enriched suggestion blob.

State stored under `app_settings.seo_state`:
  {
    "indexnow_key": "<uuid hex>",            # static, generated once
    "snapshot": { url: { first_seen, title? } },
    "last_scan_at": ISO datetime,
    "last_submission": { provider: { ok, at, count, detail } }
  }
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app_settings import get_setting, set_setting
from auth import get_current_user
from integration_credentials import get_credentials
from models import NotificationItem

log = logging.getLogger("seo")

SITE_URL = os.environ.get("APP_BASE_URL", "https://bybloomlabs.com").rstrip("/")
SITEMAP_PATH = Path(__file__).parent.parent / "frontend" / "public" / "sitemap.xml"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow"
BING_WEBMASTER_BASE = "https://ssl.bing.com/webmaster/api.svc/json"
PUBLIC_DIR = Path(__file__).parent.parent / "frontend" / "public"

SEO_STATE_KEY = "seo_state"

seo_router = APIRouter(
    prefix="/admin/seo",
    tags=["seo"],
    dependencies=[Depends(get_current_user)],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _db_from_request(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


async def _get_state(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    return (await get_setting(db, SEO_STATE_KEY)) or {}


async def _save_state(db: AsyncIOMotorDatabase, state: Dict[str, Any]) -> None:
    await set_setting(db, SEO_STATE_KEY, state)


async def _ensure_indexnow_key(db: AsyncIOMotorDatabase) -> str:
    """Return the IndexNow key, generating + persisting + writing the
    ownership .txt file at site root the first time we're called."""
    state = await _get_state(db)
    key = state.get("indexnow_key")
    if key:
        return key
    key = uuid.uuid4().hex
    state["indexnow_key"] = key
    await _save_state(db, state)
    # Write the verification file so Bing can confirm we own the host
    try:
        PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
        (PUBLIC_DIR / f"{key}.txt").write_text(key)
        log.info("IndexNow ownership file written for key %s...", key[:8])
    except Exception as exc:  # pragma: no cover
        log.warning("Could not write IndexNow ownership file: %s", exc)
    return key


def _read_sitemap_urls() -> List[str]:
    """Parse sitemap.xml and return all <loc> entries."""
    if not SITEMAP_PATH.exists():
        return []
    try:
        tree = ET.parse(SITEMAP_PATH)
        ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
        return [
            (el.text or "").strip()
            for el in tree.findall(f"{ns}url/{ns}loc")
            if (el.text or "").strip()
        ]
    except Exception as exc:
        log.warning("Failed to parse sitemap.xml: %s", exc)
        return []


def _diff_urls(current: List[str], snapshot: Dict[str, Any]) -> Dict[str, List[str]]:
    snap_urls = set(snapshot.keys())
    cur = set(current)
    return {
        "new": sorted(cur - snap_urls),
        "removed": sorted(snap_urls - cur),
        "current": sorted(cur),
    }


# ---------------------------------------------------------------------------
# Public state endpoint
# ---------------------------------------------------------------------------
@seo_router.get("/state")
async def seo_state(request: Request) -> Dict[str, Any]:
    db = _db_from_request(request)
    key = await _ensure_indexnow_key(db)
    state = await _get_state(db)
    urls = _read_sitemap_urls()
    diff = _diff_urls(urls, state.get("snapshot") or {})

    # Bing Webmaster key availability
    bw_creds = await get_credentials(db, "bing_webmaster")
    has_bing_api = bool((bw_creds.get("api_key") or "").strip())

    return {
        "site_url": SITE_URL,
        "sitemap_url": f"{SITE_URL}/sitemap.xml",
        "indexnow_key": key,
        "indexnow_key_url": f"{SITE_URL}/{key}.txt",
        "google_submit_url": (
            f"https://search.google.com/search-console/sitemaps?resource_id="
            f"{SITE_URL.replace(':', '%3A').replace('/', '%2F')}"
        ),
        "bing_webmaster_url": "https://www.bing.com/webmasters/sitemaps",
        "bing_webmaster_api_configured": has_bing_api,
        "total_urls": len(urls),
        "new_urls": diff["new"],
        "removed_urls": diff["removed"],
        "last_scan_at": state.get("last_scan_at"),
        "last_submission": state.get("last_submission") or {},
        "ai_suggestions": state.get("ai_suggestions") or {},
    }


# ---------------------------------------------------------------------------
# Submission endpoints
# ---------------------------------------------------------------------------
class SubmitPayload(BaseModel):
    urls: Optional[List[str]] = None  # if None, submit ALL sitemap URLs


@seo_router.post("/submit/indexnow")
async def submit_indexnow(
    request: Request, payload: SubmitPayload
) -> Dict[str, Any]:
    """Submit URLs via IndexNow. Covers Bing + Yandex + Naver in one shot."""
    db = _db_from_request(request)
    key = await _ensure_indexnow_key(db)
    urls = payload.urls or _read_sitemap_urls()
    # Strip anchor URLs — IndexNow rejects fragment identifiers
    urls = [u for u in urls if "#" not in u]
    if not urls:
        raise HTTPException(400, "No URLs to submit")

    host = re.sub(r"^https?://", "", SITE_URL).rstrip("/")
    body = {
        "host": host,
        "key": key,
        "keyLocation": f"{SITE_URL}/{key}.txt",
        "urlList": urls,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(INDEXNOW_ENDPOINT, json=body)
        ok = 200 <= r.status_code < 300
        detail = f"HTTP {r.status_code}" if not ok else f"submitted {len(urls)} URL(s)"
        result = {
            "ok": ok,
            "provider": "indexnow",
            "status": r.status_code,
            "count": len(urls),
            "detail": detail,
            "response": (r.text or "")[:200],
        }
    except Exception as exc:
        result = {
            "ok": False,
            "provider": "indexnow",
            "status": 0,
            "count": 0,
            "detail": f"network error: {exc}",
        }

    await _record_submission(db, "indexnow", result)
    return result


@seo_router.post("/submit/bing-webmaster")
async def submit_bing_webmaster(
    request: Request, payload: SubmitPayload
) -> Dict[str, Any]:
    """Submit via Bing Webmaster `SubmitUrlbatch` endpoint. Requires the
    `bing_webmaster.api_key` credential to be set in admin → integrations."""
    db = _db_from_request(request)
    creds = await get_credentials(db, "bing_webmaster")
    api_key = (creds.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(
            400,
            "Bing Webmaster API key not configured. Add it under "
            "Admin → Integrations → Credentials.",
        )
    urls = payload.urls or _read_sitemap_urls()
    urls = [u for u in urls if "#" not in u]
    if not urls:
        raise HTTPException(400, "No URLs to submit")

    body = {"siteUrl": SITE_URL, "urlList": urls}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{BING_WEBMASTER_BASE}/SubmitUrlbatch?apikey={api_key}",
                json=body,
            )
        ok = 200 <= r.status_code < 300
        result = {
            "ok": ok,
            "provider": "bing_webmaster",
            "status": r.status_code,
            "count": len(urls),
            "detail": f"submitted {len(urls)} URL(s)"
            if ok
            else f"HTTP {r.status_code}: {(r.text or '')[:120]}",
        }
    except Exception as exc:
        result = {
            "ok": False,
            "provider": "bing_webmaster",
            "status": 0,
            "count": 0,
            "detail": f"network error: {exc}",
        }

    await _record_submission(db, "bing_webmaster", result)
    return result


async def _record_submission(
    db: AsyncIOMotorDatabase, provider: str, result: Dict[str, Any]
) -> None:
    state = await _get_state(db)
    submissions = state.get("last_submission") or {}
    submissions[provider] = {
        "ok": result.get("ok"),
        "at": datetime.now(timezone.utc).isoformat(),
        "count": result.get("count"),
        "detail": result.get("detail"),
    }
    state["last_submission"] = submissions
    await _save_state(db, state)


# ---------------------------------------------------------------------------
# Page-diff scan (cron + manual trigger)
# ---------------------------------------------------------------------------
@seo_router.post("/scan")
async def scan_pages(request: Request) -> Dict[str, Any]:
    """Re-scan sitemap, diff against snapshot, optionally enrich new URLs
    with OpenRouter SEO suggestions, and create a notification when new
    pages are detected."""
    db = _db_from_request(request)
    or_client = getattr(request.app.state, "openrouter", None)
    result = await run_seo_scan(db, or_client)
    return result


async def run_seo_scan(
    db: AsyncIOMotorDatabase, or_client: Any = None
) -> Dict[str, Any]:
    """Used both by the manual scan endpoint and the daily cron."""
    state = await _get_state(db)
    snapshot: Dict[str, Any] = state.get("snapshot") or {}
    urls = _read_sitemap_urls()
    diff = _diff_urls(urls, snapshot)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Update snapshot — mark new URLs with first_seen
    new_snapshot: Dict[str, Any] = {}
    for u in urls:
        existing = snapshot.get(u)
        if existing:
            new_snapshot[u] = existing
        else:
            new_snapshot[u] = {"first_seen": now_iso}

    # AI enrichment — only if we have new URLs AND an OpenRouter client
    ai_suggestions: Dict[str, str] = state.get("ai_suggestions") or {}
    if diff["new"] and or_client is not None:
        try:
            summary = await _enrich_with_openrouter(or_client, diff["new"])
            ai_suggestions[now_iso] = summary
            # Keep the most recent 5 enrichments
            keys = sorted(ai_suggestions.keys(), reverse=True)[:5]
            ai_suggestions = {k: ai_suggestions[k] for k in keys}
        except Exception as exc:
            log.warning("OpenRouter SEO enrichment failed: %s", exc)

    state["snapshot"] = new_snapshot
    state["last_scan_at"] = now_iso
    state["ai_suggestions"] = ai_suggestions
    await _save_state(db, state)

    # Fire admin notification when there's something new to act on
    if diff["new"]:
        ai_blurb = ai_suggestions.get(now_iso, "")
        body_lines = [
            f"{len(diff['new'])} new public URL(s) detected in sitemap.xml:",
            *[f"• {u}" for u in diff["new"][:8]],
        ]
        if len(diff["new"]) > 8:
            body_lines.append(f"…and {len(diff['new']) - 8} more")
        if ai_blurb:
            body_lines.append("")
            body_lines.append("AI SEO check:")
            body_lines.append(ai_blurb[:600])
        notif = NotificationItem(
            kind="system",
            title="New pages — re-submit to search engines",
            body="\n".join(body_lines),
            link="/admin/seo",
        )
        try:
            await db.notifications.insert_one(notif.model_dump())
        except Exception as exc:
            log.warning("Failed to create SEO notification: %s", exc)

    return {
        "ok": True,
        "scanned_at": now_iso,
        "total_urls": len(urls),
        "new_urls": diff["new"],
        "removed_urls": diff["removed"],
        "ai_suggestion": ai_suggestions.get(now_iso),
    }


async def _enrich_with_openrouter(or_client: Any, new_urls: List[str]) -> str:
    """Ask OpenRouter to write a short SEO action-note for the new URLs."""
    if not new_urls:
        return ""
    prompt = (
        "You are an SEO advisor for Bloom Labs (bybloomlabs.com), an AI-native "
        "custom web app development agency. The team just shipped these new "
        "public URLs:\n\n"
        + "\n".join(f"- {u}" for u in new_urls[:12])
        + "\n\nIn at most 4 sentences (plain text, no markdown, no bullet lists), "
        "tell the founder: (1) whether these look like SEO-friendly slugs, "
        "(2) any obvious meta/copy risks based on the slug alone, (3) whether "
        "they should be re-submitted to Google Search Console and Bing right "
        "now. Be direct and skimmable."
    )
    try:
        # OpenRouter `chat()` accepts messages list, returns string directly.
        text = await or_client.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=320,
        )
        return (text or "").strip()
    except Exception as exc:
        log.warning("OpenRouter call failed: %s", exc)
        return ""
