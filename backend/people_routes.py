"""People (HRIS-lite) admin routes — anyone who can be paid commission.

  GET    /admin/people            — list (optional ?status=, ?type=, ?q=)
  POST   /admin/people            — create
  GET    /admin/people/{id}       — single, with assignments
  PATCH  /admin/people/{id}       — update
  DELETE /admin/people/{id}       — deactivate (soft; keeps ledger history)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from db_utils import prepare_for_mongo

PERSON_TYPES = ("employee", "contractor", "partner")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


class PersonCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    type: str = "partner"
    start_date: Optional[str] = None
    default_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    payout_notes: Optional[str] = None
    notes: Optional[str] = None


class PersonUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    type: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[str] = None
    default_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    payout_notes: Optional[str] = None
    notes: Optional[str] = None


people_admin_router = APIRouter(
    prefix="/admin/people",
    tags=["people-admin"],
    dependencies=[Depends(get_current_user)],
)


@people_admin_router.get("")
async def list_people(
    request: Request,
    status: Optional[str] = None,
    type: Optional[str] = None,
    q: Optional[str] = None,
) -> Dict[str, Any]:
    db = get_db(request)
    filt: Dict[str, Any] = {}
    if status:
        filt["status"] = status
    if type:
        filt["type"] = type
    if q:
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    items = await db.people.find(filt, {"_id": 0}).sort("name", 1).to_list(1000)
    return {"items": items, "total": len(items)}


@people_admin_router.post("", status_code=201)
async def create_person(req: PersonCreateRequest, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    if req.type not in PERSON_TYPES:
        raise HTTPException(422, f"type must be one of {PERSON_TYPES}")
    email = req.email.lower().strip()
    if await db.people.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(409, f"A person with email {email} already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "email": email,
        "type": req.type,
        "status": "active",
        "start_date": req.start_date,
        "default_rate_pct": req.default_rate_pct,
        "payout_notes": req.payout_notes,
        "notes": req.notes,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.people.insert_one(prepare_for_mongo(dict(doc)))
    return doc


@people_admin_router.get("/{person_id}")
async def get_person(person_id: str, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    person = await db.people.find_one({"id": person_id}, {"_id": 0})
    if not person:
        raise HTTPException(404, "Person not found")
    assignments = await db.commission_assignments.find({"person_id": person_id}, {"_id": 0}).to_list(500)
    return {**person, "assignments": assignments}


@people_admin_router.patch("/{person_id}")
async def update_person(person_id: str, req: PersonUpdateRequest, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    patch = {k: v for k, v in req.model_dump().items() if v is not None}
    if "type" in patch and patch["type"] not in PERSON_TYPES:
        raise HTTPException(422, f"type must be one of {PERSON_TYPES}")
    if "status" in patch and patch["status"] not in ("active", "inactive"):
        raise HTTPException(422, "status must be active or inactive")
    if "email" in patch:
        patch["email"] = patch["email"].lower().strip()
        clash = await db.people.find_one({"email": patch["email"], "id": {"$ne": person_id}}, {"_id": 1})
        if clash:
            raise HTTPException(409, "Another person already uses that email")
    patch["updated_at"] = _now_iso()
    res = await db.people.update_one({"id": person_id}, {"$set": patch})
    if not res.matched_count:
        raise HTTPException(404, "Person not found")
    return await db.people.find_one({"id": person_id}, {"_id": 0})


@people_admin_router.delete("/{person_id}")
async def deactivate_person(person_id: str, request: Request) -> Dict[str, Any]:
    db = get_db(request)
    res = await db.people.update_one(
        {"id": person_id}, {"$set": {"status": "inactive", "updated_at": _now_iso()}}
    )
    if not res.matched_count:
        raise HTTPException(404, "Person not found")
    return {"ok": True, "status": "inactive"}
