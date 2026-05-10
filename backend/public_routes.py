"""Public (no-auth) read-only marketing routes — case studies & similar."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from db_utils import serialize_doc


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


public_router = APIRouter(prefix="/public", tags=["public"])


@public_router.get("/case-studies")
async def public_case_studies(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> List[Dict[str, Any]]:
    docs = (
        await db.case_studies.find({"public": True}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return [serialize_doc(d) for d in docs]


@public_router.get("/case-studies/{cs_id}")
async def public_case_study(
    cs_id: str, db: AsyncIOMotorDatabase = Depends(get_db)
) -> Dict[str, Any]:
    doc = await db.case_studies.find_one(
        {"id": cs_id, "public": True}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(404, "Case study not found")
    return serialize_doc(doc)
