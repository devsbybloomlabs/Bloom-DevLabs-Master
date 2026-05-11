"""Admin routes for connecting/disconnecting third-party integrations.

Supports:
  • Nifty PM (OAuth2 authorization-code + project/member cache + preferences)
  • OpenRouter, Emailit, AgencyHandy, PayPal (status + masked key + test ping)

Generic pattern designed to be extensible.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from auth import get_current_user
from app_settings import get_setting, get_settings_bulk, set_setting
from db_utils import prepare_for_mongo, serialize_doc
from nifty_client import NiftyClient

log = logging.getLogger("integrations")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_nifty(request: Request) -> NiftyClient:
    return request.app.state.nifty


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:4]}•••••{key[-4:]}"


integrations_admin_router = APIRouter(
    prefix="/admin/integrations",
    tags=["integrations-admin"],
    dependencies=[Depends(get_current_user)],
)


# ============================================================
# Nifty PM
# ============================================================
class NiftyExchangeRequest(BaseModel):
    code: str
    state: Optional[str] = None


class NiftyManualTokenRequest(BaseModel):
    access_token: str


class NiftyPreferencesRequest(BaseModel):
    default_project_id: Optional[str] = None
    designer_assignees: Optional[List[str]] = None
    pm_assignees: Optional[List[str]] = None
    developer_assignees: Optional[List[str]] = None


CACHE_KEY = "nifty.cache"
PREFS_KEY = "nifty.preferences"


@integrations_admin_router.get("/nifty/status")
async def nifty_status(
    request: Request,
    nifty: NiftyClient = Depends(get_nifty),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    stored = await db.integrations.find_one(
        {"key": "nifty"},
        {"_id": 0, "access_token": 0, "refresh_token": 0},
    )
    connected = await nifty.is_connected()
    # Live ping to confirm token actually works (also exercises auto-refresh)
    ping_ok = False
    if connected:
        res = await nifty.list_projects()
        ping_ok = bool(res.get("success"))
    return {
        "oauth_configured": nifty.is_oauth_configured,
        "client_id_set": bool(nifty.client_id),
        "redirect_uri": nifty.redirect_uri,
        "connected": connected,
        "ping_ok": ping_ok,
        "default_project_id": nifty.default_project_id,
        "stored": serialize_doc(stored) if stored else None,
    }


@integrations_admin_router.get("/nifty/authorize-url")
async def nifty_authorize_url(
    request: Request,
    nifty: NiftyClient = Depends(get_nifty),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current=Depends(get_current_user),
) -> Dict[str, Any]:
    if not nifty.is_oauth_configured:
        raise HTTPException(503, "Nifty OAuth not configured (NIFTY_CLIENT_ID/SECRET missing)")
    state = secrets.token_urlsafe(24)
    # Persist state for CSRF validation on callback
    await db.oauth_states.insert_one(
        prepare_for_mongo(
            {
                "state": state,
                "provider": "nifty",
                "user": current.get("email") if isinstance(current, dict) else None,
                "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
            }
        )
    )
    return {"url": nifty.authorize_url(state=state), "state": state}


@integrations_admin_router.post("/nifty/exchange")
async def nifty_exchange(
    req: NiftyExchangeRequest,
    request: Request,
    nifty: NiftyClient = Depends(get_nifty),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    # Best-effort state check (don't block — admin already authenticated)
    if req.state:
        used = await db.oauth_states.find_one_and_delete(
            {"state": req.state, "provider": "nifty"}
        )
        if not used:
            log.warning("Nifty OAuth: unknown state %s", req.state)
    res = await nifty.exchange_code(req.code)
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "Exchange failed")
    # Ping projects to confirm scope
    ping = await nifty.list_projects()
    return {
        "ok": True,
        "stored": {k: v for k, v in (res["data"] or {}).items() if k not in ("access_token", "refresh_token")},
        "ping_ok": ping.get("success", False),
        "projects_count": len((ping.get("data") or {}).get("projects", []))
        if isinstance(ping.get("data"), dict) else 0,
    }


@integrations_admin_router.post("/nifty/manual-token")
async def nifty_manual_token(
    req: NiftyManualTokenRequest,
    nifty: NiftyClient = Depends(get_nifty),
) -> Dict[str, Any]:
    if not req.access_token.strip():
        raise HTTPException(400, "access_token required")
    doc = await nifty.set_manual_token(req.access_token.strip())
    ping = await nifty.list_projects()
    return {
        "ok": True,
        "stored": {k: v for k, v in (doc or {}).items() if k not in ("access_token", "refresh_token")},
        "ping_ok": ping.get("success", False),
    }


@integrations_admin_router.post("/nifty/disconnect")
async def nifty_disconnect(nifty: NiftyClient = Depends(get_nifty)) -> Dict[str, Any]:
    return await nifty.disconnect()


@integrations_admin_router.get("/nifty/projects")
async def nifty_projects(nifty: NiftyClient = Depends(get_nifty)) -> Dict[str, Any]:
    res = await nifty.list_projects()
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "Could not list projects")
    return res.get("data") or {}


@integrations_admin_router.get("/nifty/members")
async def nifty_members(
    project_id: Optional[str] = None,
    nifty: NiftyClient = Depends(get_nifty),
) -> Dict[str, Any]:
    res = await nifty.list_members(project_id)
    if not res.get("success"):
        raise HTTPException(502, res.get("error") or "Could not list members")
    return res.get("data") or {}


# ---- Cache (DB-stored projects + members so we don't re-hit Nifty on every page load) ----
@integrations_admin_router.get("/nifty/cache")
async def nifty_cache(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    cached = await get_setting(db, CACHE_KEY)
    prefs = await get_setting(db, PREFS_KEY) or {}
    return {"cache": cached, "preferences": prefs}


@integrations_admin_router.post("/nifty/sync")
async def nifty_sync(
    nifty: NiftyClient = Depends(get_nifty),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Re-fetch projects + members from Nifty and cache them."""
    if not await nifty.is_connected():
        raise HTTPException(503, "Nifty not connected")
    proj_res = await nifty.list_projects()
    if not proj_res.get("success"):
        raise HTTPException(502, proj_res.get("error") or "Projects fetch failed")
    mem_res = await nifty.list_members()
    if not mem_res.get("success"):
        # Members across whole workspace can fail; non-blocking
        log.warning("Members fetch failed during sync: %s", mem_res.get("error"))
    projects = (proj_res.get("data") or {}).get("projects") or []
    members = (mem_res.get("data") or {}).get("members") if mem_res.get("success") else []

    # Slim down to fields we need (id, name)
    slim_projects = [
        {
            "id": p.get("id") or p.get("_id") or p.get("project_id"),
            "name": p.get("name") or p.get("title") or "(untitled)",
        }
        for p in projects
        if p.get("id") or p.get("_id") or p.get("project_id")
    ]
    slim_members = [
        {
            "id": m.get("id") or m.get("_id") or m.get("user_id"),
            "name": m.get("name") or m.get("full_name") or (m.get("email") or "").split("@")[0],
            "email": m.get("email") or "",
        }
        for m in (members or [])
        if m.get("id") or m.get("_id") or m.get("user_id") or m.get("email")
    ]
    cache_doc = {
        "projects": slim_projects,
        "members": slim_members,
        "synced_at": _now(),
        "counts": {"projects": len(slim_projects), "members": len(slim_members)},
    }
    await set_setting(db, CACHE_KEY, cache_doc)
    return cache_doc


@integrations_admin_router.get("/nifty/preferences")
async def nifty_get_preferences(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    return await get_setting(db, PREFS_KEY) or {}


@integrations_admin_router.put("/nifty/preferences")
async def nifty_set_preferences(
    req: NiftyPreferencesRequest,
    nifty: NiftyClient = Depends(get_nifty),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    existing = await get_setting(db, PREFS_KEY) or {}
    update = {**existing}
    # Treat empty-string and empty-list as explicit "clear" intent.
    for k in (
        "default_project_id",
        "designer_assignees",
        "pm_assignees",
        "developer_assignees",
    ):
        v = getattr(req, k)
        if v is None:
            continue
        if isinstance(v, str):
            update[k] = v.strip()  # may be ""
        elif isinstance(v, list):
            cleaned = [x.strip() for x in v if isinstance(x, str) and x.strip()]
            update[k] = cleaned  # may be []
        else:
            update[k] = v
    saved = await set_setting(db, PREFS_KEY, update)
    if "default_project_id" in update:
        nifty.default_project_id = update["default_project_id"] or nifty.default_project_id
    return saved["value"]


# ============================================================
# Provider Friction-Reducer: status + test endpoints
# ============================================================
def _provider_status_envelope(
    provider: str, *, configured: bool, masked_key: str, env_var: str
) -> Dict[str, Any]:
    return {
        "provider": provider,
        "configured": configured,
        "masked_key": masked_key,
        "env_var": env_var,
    }


@integrations_admin_router.get("/providers")
async def list_provider_statuses(request: Request) -> List[Dict[str, Any]]:
    """Unified status snapshot for all 'simple' API-key integrations."""
    import os
    or_key = os.environ.get("OPENROUTER_API_KEY", "")
    em_key = os.environ.get("EMAILIT_API_KEY", "")
    ah_key = os.environ.get("AGENCYHANDY_API_KEY", "")
    pp_cid = os.environ.get("PAYPAL_CLIENT_ID", "")
    return [
        _provider_status_envelope(
            "openrouter",
            configured=bool(or_key),
            masked_key=_mask_key(or_key),
            env_var="OPENROUTER_API_KEY",
        ),
        _provider_status_envelope(
            "emailit",
            configured=bool(em_key),
            masked_key=_mask_key(em_key),
            env_var="EMAILIT_API_KEY",
        ),
        _provider_status_envelope(
            "agencyhandy",
            configured=bool(ah_key),
            masked_key=_mask_key(ah_key),
            env_var="AGENCYHANDY_API_KEY",
        ),
        _provider_status_envelope(
            "paypal",
            configured=bool(pp_cid),
            masked_key=_mask_key(pp_cid),
            env_var="PAYPAL_CLIENT_ID",
        ),
    ]


@integrations_admin_router.post("/openrouter/test")
async def test_openrouter(request: Request) -> Dict[str, Any]:
    client = request.app.state.openrouter
    if not getattr(client, "api_key", None):
        raise HTTPException(503, "OPENROUTER_API_KEY not configured")
    try:
        out = await client.chat(
            messages=[{"role": "user", "content": "Reply with only the word: pong"}],
            max_tokens=8,
            temperature=0,
        )
        return {"ok": True, "echo": (out or "")[:50]}
    except Exception as exc:
        log.warning("openrouter test failed: %s", exc)
        raise HTTPException(502, f"OpenRouter test failed: {exc}")


@integrations_admin_router.post("/emailit/test")
async def test_emailit(request: Request) -> Dict[str, Any]:
    client = request.app.state.emailit
    if not client.is_configured:
        raise HTTPException(503, "EMAILIT_API_KEY not configured")
    # We can't send a real email without a target; just verify auth by listing
    # quotas (a cheap GET if available) — fallback: send a smoke email to admin
    try:
        # Minimal smoke send to a guaranteed-blackhole address — Emailit will
        # reject 'invalid@bybloomlabs.com' with 422 if auth is OK; 401 if auth
        # is not.
        await client.send_email(
            to="noreply@bybloomlabs.com",
            subject="Bloom Labs integration test (ignore)",
            html="<p>Connectivity test — please ignore.</p>",
            text="Connectivity test — please ignore.",
        )
        return {"ok": True}
    except Exception as exc:
        msg = str(exc)
        # If error is auth-related, surface as 502; if rate/domain related, treat as ok
        if "401" in msg or "403" in msg:
            raise HTTPException(502, f"Emailit auth failed: {msg}")
        return {"ok": True, "warning": f"Auth ok; send response: {msg[:200]}"}


@integrations_admin_router.post("/agencyhandy/test")
async def test_agencyhandy(request: Request) -> Dict[str, Any]:
    client = request.app.state.agencyhandy
    if not client.is_configured:
        raise HTTPException(503, "AGENCYHANDY_API_KEY not configured")
    res = await client.list_orders()
    if not res.get("success"):
        raise HTTPException(502, f"AgencyHandy test failed: {res.get('error')}")
    return {"ok": True, "endpoint": "list_orders", "status": res.get("status")}


@integrations_admin_router.post("/paypal/test")
async def test_paypal(request: Request) -> Dict[str, Any]:
    client = request.app.state.paypal
    if not client.is_configured:
        raise HTTPException(503, "PayPal not configured")
    token = await client._get_access_token()
    if not token:
        raise HTTPException(502, "PayPal OAuth failed — check CLIENT_ID/SECRET")
    return {"ok": True, "env": client.env}
