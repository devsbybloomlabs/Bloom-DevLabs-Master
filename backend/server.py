"""Bloom Labs FastAPI server."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from emailit_client import EmailitClient  # noqa: E402
from openrouter_client import OpenRouterClient  # noqa: E402
from agencyhandy_client import AgencyHandyClient  # noqa: E402
from agencyhandy_routes import agencyhandy_router  # noqa: E402
from agencyhandy_webhooks import (  # noqa: E402
    ah_webhook_admin_router,
    ah_webhook_router,
)
from integrations import (  # noqa: E402
    notification_router,
    sync_router,
    webhook_router,
)
from routes import (  # noqa: E402
    _generate_and_save_routine,
    _today_str,
    ai_router,
    auth_router,
    authority_router,
    casestudy_router,
    content_router,
    dashboard_router,
    ensure_authority_metric,
    ensure_seed_user,
    ensure_settings,
    metrics_router,
    pipeline_router,
    routine_router,
    settings_router,
    testimonial_router,
    tl_router,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
log = logging.getLogger("server")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "bloom_labs")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    app.state.mongo = client
    app.state.db = db

    # Initialize integration clients
    app.state.openrouter = OpenRouterClient()
    app.state.emailit = EmailitClient()
    app.state.agencyhandy = AgencyHandyClient()

    # Seed founder + settings + authority metric
    try:
        await ensure_seed_user(db)
        await ensure_settings(db)
        await ensure_authority_metric(db)
    except Exception as e:  # pragma: no cover
        log.exception("Startup seed failed: %s", e)

    # Background scheduler — daily 5am routine generation
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def auto_generate_routine() -> None:
        try:
            target_date = _today_str()
            existing = await db.routines.find_one({"date": target_date})
            if existing:
                return
            log.info("5am cron: generating routine for %s", target_date)
            await _generate_and_save_routine(
                db, app.state.openrouter, target_date=target_date, force=False
            )
        except Exception as exc:
            log.exception("Auto-routine cron failed: %s", exc)

    scheduler.add_job(auto_generate_routine, CronTrigger(hour=5, minute=0))
    scheduler.start()
    app.state.scheduler = scheduler
    log.info("Bloom Labs API ready at /api")

    try:
        yield
    finally:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass
        client.close()
        log.info("Bloom Labs API shut down")


app = FastAPI(title="Bloom Labs API", version="1.0.0", lifespan=lifespan)

# Top-level /api router
api = APIRouter(prefix="/api")


@api.get("/")
async def root() -> dict:
    return {
        "name": "Bloom Labs API",
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@api.get("/health")
async def health() -> dict:
    return {"status": "healthy"}


# Mount sub-routers under /api
api.include_router(auth_router)
api.include_router(routine_router)
api.include_router(ai_router)
api.include_router(pipeline_router)
api.include_router(metrics_router)
api.include_router(content_router)
api.include_router(casestudy_router)
api.include_router(testimonial_router)
api.include_router(tl_router)
api.include_router(authority_router)
api.include_router(settings_router)
api.include_router(dashboard_router)
api.include_router(webhook_router)
api.include_router(notification_router)
api.include_router(sync_router)
api.include_router(agencyhandy_router)
api.include_router(ah_webhook_router)
api.include_router(ah_webhook_admin_router)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
