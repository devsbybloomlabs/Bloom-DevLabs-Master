"""Admin routes for connecting/disconnecting third-party integrations.

Currently supports:
  • Nifty PM (OAuth2 authorization-code)

Generic pattern designed to be extensible — add new providers as separate
section blocks below.
"""
from __future__ import annotations

import logging
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc
from nifty_client import NiftyClient

log = logging.getLogger("integrations")


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_nifty(request: Request) -> NiftyClient:
    return request.app.state.nifty


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
                "user": (request.scope.get("user") or {}).get("email") if hasattr(request, "scope") else None,
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
