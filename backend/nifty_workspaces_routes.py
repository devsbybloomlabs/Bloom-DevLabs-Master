"""Multi-workspace Nifty support (Phase 15).

The Phase 9 OAuth flow stored exactly one Nifty token in
`integrations.nifty`. This module adds the ability to snapshot the currently
connected workspace under a friendly name, list saved snapshots, and switch
between them with one click — without forcing the user to re-OAuth every time.

Storage layout:
  • `integrations.nifty` — the LIVE token used by NiftyClient (single doc).
  • `nifty_workspaces` collection — saved snapshots:
      {id, name, workspace_user_email, saved_at, last_activated_at,
       access_token, refresh_token, expires_at}

Workflow:
  1. Founder OAuths a Nifty workspace via existing flow (sets `integrations.nifty`).
  2. POST /admin/integrations/nifty/workspaces with {name} → snapshot saved.
  3. To switch: POST /admin/integrations/nifty/workspaces/{id}/activate → snapshot's
     token is copied back into `integrations.nifty`; NiftyClient picks it up
     transparently on next call.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import get_current_user
from db_utils import prepare_for_mongo, serialize_doc

log = logging.getLogger("nifty.workspaces")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


class WorkspaceSnapshotRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


nifty_workspaces_router = APIRouter(
    prefix="/admin/integrations/nifty/workspaces",
    tags=["nifty-workspaces"],
    dependencies=[Depends(get_current_user)],
)


@nifty_workspaces_router.get("")
async def list_workspaces(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """List saved snapshots + indicate the currently-active token's owner."""
    snapshots = (
        await db.nifty_workspaces.find(
            {}, {"_id": 0, "access_token": 0, "refresh_token": 0}
        )
        .sort("last_activated_at", -1)
        .to_list(50)
    )
    # The currently-live token in integrations.nifty — surface its owner for diff
    live = await db.integrations.find_one(
        {"key": "nifty"}, {"_id": 0, "access_token": 0, "refresh_token": 0}
    )
    return {
        "active_workspace_id": (live or {}).get("active_snapshot_id"),
        "live_workspace_email": (live or {}).get("workspace_user_email"),
        "snapshots": [serialize_doc(s) for s in snapshots],
    }


@nifty_workspaces_router.post("")
async def snapshot_current(
    req: WorkspaceSnapshotRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Save the currently-connected Nifty workspace under a friendly name."""
    live = await db.integrations.find_one({"key": "nifty"}, {"_id": 0})
    if not live or not live.get("access_token"):
        raise HTTPException(
            400,
            "No Nifty workspace is currently connected — complete OAuth in /admin/integrations first.",
        )
    snap_id = str(uuid4())
    doc = {
        "id": snap_id,
        "name": req.name,
        "workspace_user_email": live.get("workspace_user_email"),
        "access_token": live.get("access_token"),
        "refresh_token": live.get("refresh_token"),
        "expires_at": live.get("expires_at"),
        "saved_at": _now(),
        "last_activated_at": _now(),
    }
    await db.nifty_workspaces.insert_one(prepare_for_mongo(doc))
    # Tag the live integration with the snapshot id so we can show "active"
    await db.integrations.update_one(
        {"key": "nifty"},
        {"$set": {"active_snapshot_id": snap_id}},
    )
    safe = {k: v for k, v in doc.items() if k not in ("access_token", "refresh_token")}
    return {"ok": True, "snapshot": serialize_doc(safe)}


@nifty_workspaces_router.post("/{snapshot_id}/activate")
async def activate_workspace(
    snapshot_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Copy the snapshot's token into integrations.nifty so it goes live."""
    snap = await db.nifty_workspaces.find_one({"id": snapshot_id}, {"_id": 0})
    if not snap:
        raise HTTPException(404, "Snapshot not found")
    await db.integrations.update_one(
        {"key": "nifty"},
        {
            "$set": {
                "access_token": snap.get("access_token"),
                "refresh_token": snap.get("refresh_token"),
                "expires_at": snap.get("expires_at"),
                "workspace_user_email": snap.get("workspace_user_email"),
                "active_snapshot_id": snapshot_id,
                "activated_at": _now(),
            }
        },
        upsert=True,
    )
    await db.nifty_workspaces.update_one(
        {"id": snapshot_id}, {"$set": {"last_activated_at": _now()}}
    )
    # Force the in-memory client to re-read on next call
    nifty = request.app.state.nifty
    nifty._token_cache = None
    safe = {k: v for k, v in snap.items() if k not in ("access_token", "refresh_token")}
    return {"ok": True, "activated": serialize_doc(safe)}


@nifty_workspaces_router.delete("/{snapshot_id}")
async def delete_workspace(
    snapshot_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> Dict[str, Any]:
    """Remove a saved snapshot. Live integration is untouched."""
    r = await db.nifty_workspaces.delete_one({"id": snapshot_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Snapshot not found")
    return {"ok": True}


__all__ = ["nifty_workspaces_router"]
