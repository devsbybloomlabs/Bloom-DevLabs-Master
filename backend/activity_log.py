"""Activity log helper — unified audit trail per company.

Any code path can call `log_activity(...)` to write a chronological event:
invoice created/paid/refunded, proposal signed, brief approved, support
upgraded, manual note, etc. The Company Detail drawer's Activity tab
reads from this collection.

Schema:
  {
    id: uuid,
    company_id: uuid,            # required
    contact_id: uuid|None,       # optional — which person on the team
    type: str,                   # dotted, e.g. "invoice.paid"
    title: str,                  # short human-readable summary
    description: str|None,       # optional longer body
    meta: dict,                  # arbitrary structured payload
    actor: str,                  # "admin:<email>" | "client:<email>" | "system"
    created_at: iso,
  }
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger("activity_log")


async def log_activity(
    db: AsyncIOMotorDatabase,
    *,
    company_id: Optional[str] = None,
    company_email: Optional[str] = None,
    contact_id: Optional[str] = None,
    type: str,
    title: str,
    description: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    actor: str = "system",
) -> Optional[str]:
    """Insert a row. Resolves `company_id` from `company_email` if needed.

    Returns the activity id, or None when no company could be matched (so
    callers don't crash on rows for unknown emails).
    """
    if not company_id and company_email:
        comp = await db.companies.find_one(
            {"primary_email": (company_email or "").lower().strip()},
            {"_id": 0, "id": 1},
        )
        company_id = (comp or {}).get("id")
    if not company_id:
        return None
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "contact_id": contact_id,
        "type": type,
        "title": title[:200],
        "description": description[:1000] if description else None,
        "meta": meta or {},
        "actor": actor,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.activity_log.insert_one(doc)
    except Exception as exc:  # pragma: no cover
        log.warning("activity_log insert failed: %s", exc)
        return None
    return doc["id"]
