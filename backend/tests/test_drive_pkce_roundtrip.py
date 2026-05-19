"""Verify PKCE code_verifier round-trip across /connect → /callback."""
import os
import sys
import uuid

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient


@pytest_asyncio.fixture
async def db():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    yield client[db_name]
    client.close()


@pytest.mark.asyncio
async def test_pkce_verifier_store_and_consume(db):
    from google_drive_routes import (
        _store_pkce_verifier,
        _consume_pkce_verifier,
    )

    state = f"test-state-{uuid.uuid4().hex[:8]}"
    verifier = "abc-test-verifier-" + uuid.uuid4().hex
    await _store_pkce_verifier(db, state, verifier)
    got = await _consume_pkce_verifier(db, state)
    assert got == verifier, f"expected {verifier!r}, got {got!r}"
    # Second consume returns None (one-shot)
    got2 = await _consume_pkce_verifier(db, state)
    assert got2 is None


@pytest.mark.asyncio
async def test_consume_unknown_state_returns_none(db):
    from google_drive_routes import _consume_pkce_verifier

    assert await _consume_pkce_verifier(db, "definitely-not-a-real-state") is None
    assert await _consume_pkce_verifier(db, "") is None


@pytest.mark.asyncio
async def test_drive_connect_persists_verifier(db):
    """Calling _build_flow + authorization_url should produce a state we
    can later round-trip through _consume_pkce_verifier."""
    from google_drive_routes import _build_flow, _store_pkce_verifier, _consume_pkce_verifier

    # Skip if no OAuth config (env-based test envs may not have one)
    from fastapi import HTTPException

    try:
        flow = await _build_flow(db)
    except HTTPException:
        pytest.skip("Drive OAuth not configured in this env")
    auth_url, state = flow.authorization_url(
        access_type="offline", prompt="consent"
    )
    assert "code_challenge=" in auth_url
    assert "code_challenge_method=S256" in auth_url
    assert flow.code_verifier, "Flow should have auto-generated a code_verifier"
    await _store_pkce_verifier(db, state, flow.code_verifier)
    # Now simulate the callback retrieving it
    retrieved = await _consume_pkce_verifier(db, state)
    assert retrieved == flow.code_verifier
