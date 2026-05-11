"""Slack incoming webhook notifier (simple POST, no SDK).

Reads `SLACK_WEBHOOK_URL` env var first, falls back to
`integration_credentials.slack.webhook_url` stored via the admin UI.

Returns `True` when the message was POSTed successfully, `False` otherwise
(missing URL, network error, non-2xx response). Never raises.

The notifier intentionally does NOT use the official slack-sdk — incoming
webhooks only need a single JSON POST and we want the dependency footprint
to stay tiny.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger("slack")

DEFAULT_TIMEOUT = 8.0


async def _resolve_webhook_url(db: Optional[AsyncIOMotorDatabase]) -> str:
    env_val = os.environ.get("SLACK_WEBHOOK_URL", "").strip()
    if env_val:
        return env_val
    if db is None:
        return ""
    try:
        from integration_credentials import get_credentials
        creds = await get_credentials(db, "slack")
        return (creds.get("webhook_url") or "").strip()
    except Exception:
        return ""


async def is_configured(db: Optional[AsyncIOMotorDatabase]) -> bool:
    return bool(await _resolve_webhook_url(db))


async def post_message(
    db: Optional[AsyncIOMotorDatabase],
    *,
    text: str,
    blocks: Optional[Any] = None,
    channel_hint: Optional[str] = None,
) -> Dict[str, Any]:
    """Send a message to the configured incoming webhook.

    Returns `{ok, status, reason}`. `ok=False, reason='not_configured'` when
    no webhook URL is set — callers can use this to decide whether to fall back
    to an admin notification.
    """
    url = await _resolve_webhook_url(db)
    if not url:
        return {"ok": False, "status": 0, "reason": "not_configured"}
    body: Dict[str, Any] = {"text": text}
    if blocks:
        body["blocks"] = blocks
    if channel_hint:
        body["channel"] = channel_hint
    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            r = await client.post(url, json=body)
        if 200 <= r.status_code < 300:
            return {"ok": True, "status": r.status_code, "reason": None}
        log.warning("Slack webhook returned %s: %s", r.status_code, r.text[:200])
        return {"ok": False, "status": r.status_code, "reason": r.text[:200]}
    except Exception as exc:
        log.warning("Slack webhook POST failed: %s", exc)
        return {"ok": False, "status": 0, "reason": str(exc)}
