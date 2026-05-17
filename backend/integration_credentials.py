"""Centralised integration credentials store + helpers.

Credentials are stored under `app_settings.integration_credentials` so admins
can paste API keys via the `/admin/integrations` UI without editing `.env`.

Resolution priority for every key:
  1. process env var (highest — `.env` always wins, supports CI / prod overrides)
  2. DB-stored value from `integration_credentials.<provider>.<field>`

Helpers exposed:
  • get_credentials(db, provider) — returns dict of resolved key/values for one provider
  • get_credential(db, provider, field, env_var) — single-field resolution
  • set_provider_credentials(db, provider, fields) — admin write path
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app_settings import get_setting, set_setting

CREDENTIALS_KEY = "integration_credentials"


async def _all_creds(db: AsyncIOMotorDatabase) -> Dict[str, Dict[str, Any]]:
    return (await get_setting(db, CREDENTIALS_KEY)) or {}


async def get_credentials(db: AsyncIOMotorDatabase, provider: str) -> Dict[str, Any]:
    creds = await _all_creds(db)
    return dict(creds.get(provider) or {})


async def get_credential(
    db: AsyncIOMotorDatabase, provider: str, field: str, env_var: Optional[str] = None
) -> str:
    """Resolve a single credential field. Env wins; DB fills in the rest."""
    if env_var:
        env_val = os.environ.get(env_var, "").strip()
        if env_val:
            return env_val
    creds = await get_credentials(db, provider)
    val = creds.get(field) or ""
    return val.strip() if isinstance(val, str) else val


async def get_credential_db_first(
    db: AsyncIOMotorDatabase, provider: str, field: str, env_var: Optional[str] = None
) -> str:
    """Same as get_credential, but DB wins over env (admin-UI-first).

    Used for credentials the admin manages exclusively from the UI
    (e.g. PayPal, where preview/prod need different values driven from
    each environment's database).
    """
    creds = await get_credentials(db, provider)
    val = creds.get(field) or ""
    if isinstance(val, str):
        val = val.strip()
    if val:
        return val
    if env_var:
        return os.environ.get(env_var, "").strip()
    return ""


async def set_provider_credentials(
    db: AsyncIOMotorDatabase, provider: str, fields: Dict[str, Any]
) -> Dict[str, Any]:
    """Upsert one provider's credential bundle.

    Empty-string values are treated as 'clear this field'. Other empty inputs
    are preserved. Returns the merged provider doc.
    """
    creds = await _all_creds(db)
    existing = dict(creds.get(provider) or {})
    for k, v in fields.items():
        if isinstance(v, str) and v == "":
            existing.pop(k, None)
        elif v is None:
            continue
        else:
            existing[k] = v
    creds[provider] = existing
    await set_setting(db, CREDENTIALS_KEY, creds)
    return existing


async def list_masked_credentials(db: AsyncIOMotorDatabase) -> Dict[str, Dict[str, Any]]:
    """Read all provider creds, masking any value that looks secret."""
    creds = await _all_creds(db)
    out: Dict[str, Dict[str, Any]] = {}
    for provider, fields in creds.items():
        masked: Dict[str, Any] = {}
        for k, v in (fields or {}).items():
            if not isinstance(v, str):
                masked[k] = v
                continue
            if not v:
                masked[k] = ""
                continue
            looks_secret = any(
                kw in k.lower()
                for kw in ("password", "secret", "token", "key", "webhook_url")
            )
            if looks_secret and len(v) > 8:
                masked[k] = f"{v[:4]}•••••{v[-4:]}"
            else:
                masked[k] = v
        out[provider] = masked
    return out
