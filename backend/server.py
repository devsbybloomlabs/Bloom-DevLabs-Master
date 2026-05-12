"""Bloom Labs FastAPI server."""
from __future__ import annotations

import asyncio
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
from paypal_client import PayPalClient  # noqa: E402
from paypal_routes import paypal_admin_router, paypal_router  # noqa: E402
from paypal_webhooks import paypal_webhook_router  # noqa: E402
from nifty_client import NiftyClient  # noqa: E402
from blog_routes import blog_admin_router, blog_public_router  # noqa: E402
from public_routes import public_router  # noqa: E402
from onboarding_routes import (  # noqa: E402
    onboarding_admin_router,
    onboarding_client_router,
    onboarding_public_router,
)
from leads_routes import (  # noqa: E402
    drip_tick,
    leads_admin_router,
    leads_public_router,
)
from milestone_routes import (  # noqa: E402
    milestone_admin_router,
    milestone_client_router,
    nifty_comment_poll,
    nifty_timeline_refresh,
    nifty_webhook_router,
)
from breezedocs_client import BreezeDocsClient  # noqa: E402
from breezedocs_routes import (  # noqa: E402
    breezedocs_admin_router,
    breezedocs_client_router,
    breezedocs_sync_cron,
)
from companies_routes import (  # noqa: E402
    companies_admin_router,
    contacts_admin_router,
    migrate_clients_to_companies,
)
from demo_routes import demo_router  # noqa: E402
from public_tour_routes import public_tour_router  # noqa: E402
from contact_routes import (  # noqa: E402
    client_contact_router,
    contact_admin_router,
)
from ab_test_routes import public_ab_router, ab_admin_router  # noqa: E402
from nifty_workspaces_routes import nifty_workspaces_router  # noqa: E402
from google_calendar_client import GoogleCalendarClient  # noqa: E402
from google_calendar_routes import (  # noqa: E402
    calendar_admin_router,
    calendar_milestones_router,
    calendar_oauth_router,
)
from blog_extras_routes import blog_extras_router  # noqa: E402
from integrations_admin_routes import integrations_admin_router  # noqa: E402
from invoice_routes import (  # noqa: E402
    invoice_admin_router,
    invoice_client_router,
    invoice_public_router,
)
from subscription_routes import (  # noqa: E402
    subscription_admin_router,
    subscription_client_router,
)
from client_routes import (  # noqa: E402
    client_admin_router,
    client_auth_router,
    client_portal_router,
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
    # Aggressive timeouts so a slow/unreachable Mongo doesn't hang K8s readiness.
    # Motor defaults serverSelectionTimeoutMS to 30s which exceeds the readiness probe budget.
    client = AsyncIOMotorClient(
        mongo_url,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=10000,
    )
    db = client[db_name]
    app.state.mongo = client
    app.state.db = db

    # Initialize integration clients
    app.state.openrouter = OpenRouterClient()
    app.state.emailit = EmailitClient()
    app.state.paypal = PayPalClient()
    app.state.nifty = NiftyClient()
    app.state.nifty.bind_db(db)
    app.state.breezedocs = BreezeDocsClient()
    app.state.breezedocs.bind_db(db)
    app.state.google_calendar = GoogleCalendarClient()
    app.state.google_calendar.bind_db(db)

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

    async def drip_cron() -> None:
        try:
            res = await drip_tick(db, app)
            if res.get("sent", 0) > 0 or res.get("failed", 0) > 0:
                log.info("Drip tick: %s", res)
        except Exception as exc:
            log.exception("Drip cron failed: %s", exc)

    async def nifty_comment_cron() -> None:
        try:
            res = await nifty_comment_poll(app)
            if res.get("polled", 0) > 0:
                log.info("Nifty comment poll: %s", res)
        except Exception as exc:
            log.exception("Nifty comment cron failed: %s", exc)

    async def nifty_timeline_cron() -> None:
        try:
            res = await nifty_timeline_refresh(app)
            if res.get("refreshed", 0) > 0:
                log.info("Nifty timeline refresh: %s", res)
        except Exception as exc:
            log.exception("Nifty timeline cron failed: %s", exc)

    async def breezedocs_sync_cron_wrapper() -> None:
        try:
            res = await breezedocs_sync_cron(app.state.db, app.state.breezedocs)
            if res.get("synced", 0) > 0:
                log.info("BreezeDocs sync: %s", res)
        except Exception as exc:
            log.exception("BreezeDocs sync cron failed: %s", exc)

    # Hourly drip ticks
    scheduler.add_job(drip_cron, CronTrigger(minute=15))
    # Every 5 min Nifty comment poll
    scheduler.add_job(nifty_comment_cron, CronTrigger(minute="*/5"))
    # Daily 8am Nifty timeline refresh
    scheduler.add_job(nifty_timeline_cron, CronTrigger(hour=8, minute=0))
    # Every 10 min BreezeDocs status sync (no webhooks in their API)
    scheduler.add_job(breezedocs_sync_cron_wrapper, CronTrigger(minute="*/10"))

    app.state.scheduler = scheduler

    # Defer slow work (DB seeding + scheduler.start) to a background task so
    # uvicorn can bind the port and answer /health immediately. The deployer's
    # supervisor wrapper kills the container if the port isn't bound within 60s,
    # so the lifespan must yield as quickly as possible. Seeding and scheduler
    # init are best-effort and can complete after the app is already serving.
    async def _warmup() -> None:
        try:
            await ensure_seed_user(db)
            await ensure_settings(db)
            await ensure_authority_metric(db)
            # Phase B: seed companies + contacts from legacy clients (idempotent)
            mig_res = await migrate_clients_to_companies(db)
            if mig_res.get("created", 0) > 0:
                log.info("Companies migration: %s", mig_res)
        except Exception as exc:
            log.exception("Startup seed failed: %s", exc)
        try:
            scheduler.start()
        except Exception as exc:
            log.exception("Scheduler start failed: %s", exc)
        log.info("Bloom Labs API warmup complete")

    warmup_task = asyncio.create_task(_warmup())
    log.info("Bloom Labs API ready at /api")

    try:
        yield
    finally:
        if not warmup_task.done():
            warmup_task.cancel()
        try:
            if scheduler.running:
                scheduler.shutdown(wait=False)
        except Exception:
            pass
        client.close()
        log.info("Bloom Labs API shut down")


app = FastAPI(title="Bloom Labs API", version="1.0.0", lifespan=lifespan)


# Root-level health endpoint outside /api — production K8s readiness probes and
# deployer-managed health checks tend to hit /health without the /api prefix.
@app.get("/health", include_in_schema=False)
async def root_health() -> dict:
    return {"status": "healthy"}


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
api.include_router(paypal_router)
api.include_router(paypal_admin_router)
api.include_router(paypal_webhook_router)
api.include_router(client_auth_router)
api.include_router(client_portal_router)
api.include_router(client_admin_router)
api.include_router(public_router)
api.include_router(blog_extras_router)
api.include_router(integrations_admin_router)
api.include_router(invoice_admin_router)
api.include_router(invoice_client_router)
api.include_router(invoice_public_router)
api.include_router(subscription_admin_router)
api.include_router(subscription_client_router)
api.include_router(blog_public_router)
api.include_router(blog_admin_router)
api.include_router(onboarding_public_router)
api.include_router(onboarding_client_router)
api.include_router(onboarding_admin_router)
api.include_router(leads_public_router)
api.include_router(leads_admin_router)
api.include_router(nifty_webhook_router)
api.include_router(milestone_client_router)
api.include_router(milestone_admin_router)
api.include_router(breezedocs_admin_router)
api.include_router(breezedocs_client_router)
api.include_router(companies_admin_router)
api.include_router(contacts_admin_router)
api.include_router(demo_router)
api.include_router(public_tour_router)
api.include_router(client_contact_router)
api.include_router(contact_admin_router)
api.include_router(public_ab_router)
api.include_router(ab_admin_router)
api.include_router(nifty_workspaces_router)
api.include_router(calendar_oauth_router)
api.include_router(calendar_admin_router)
api.include_router(calendar_milestones_router)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
