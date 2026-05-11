"""Backend helpers for app-wide settings (singleton-style key/value store in MongoDB)."""
from __future__ import annotations

from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


COLLECTION = "app_settings"


async def get_setting(db: AsyncIOMotorDatabase, key: str) -> Optional[Any]:
    doc = await db[COLLECTION].find_one({"key": key}, {"_id": 0})
    if not doc:
        return None
    return doc.get("value")


async def set_setting(db: AsyncIOMotorDatabase, key: str, value: Any) -> Dict[str, Any]:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    await db[COLLECTION].update_one(
        {"key": key},
        {"$set": {"key": key, "value": value, "updated_at": now}},
        upsert=True,
    )
    return {"key": key, "value": value, "updated_at": now}


async def get_settings_bulk(db: AsyncIOMotorDatabase, *keys: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if not keys:
        return out
    cursor = db[COLLECTION].find({"key": {"$in": list(keys)}}, {"_id": 0})
    async for d in cursor:
        out[d["key"]] = d.get("value")
    return out
