"""
CivicResolve — FastAPI Application Entry Point
"""

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app_performance import ImmutableStaticFiles, install_performance
from app_security import install_security
from database import init_db
from routes.admin import router as admin_router
from routes.admin_auth import router as admin_auth_router
from routes.report_lifecycle import router as lifecycle_router
from routes.reports import router as reports_router
from services.auth import verify_admin_key
from services.gemini_triage import ai_mode, get_embed_model_name, get_model_name
from services.sla_engine import run_sla_check
from services.uploads import UPLOAD_DIR

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup: log AI mode, init DB, seed demo data, start the SLA scheduler."""
    # Startup
    if ai_mode() == "live":
        logger.info("AI MODE: LIVE (model=%s, embeddings=%s)", get_model_name(), get_embed_model_name())
    else:
        logger.warning("AI MODE: MOCK — GEMINI_API_KEY not set; using rule-based triage and hash embeddings")
    logger.info("Initializing database...")
    init_db()

    # Seed demo data if DB is empty
    from seed_data import seed_if_empty

    seed_if_empty()

    # Start SLA scheduler (every 5 minutes)
    scheduler.add_job(run_sla_check, "interval", minutes=5, id="sla_check")
    scheduler.start()
    logger.info("SLA scheduler started (checks every 5 minutes)")

    yield

    # Shutdown
    scheduler.shutdown()
    logger.info("Scheduler shut down")


IS_PRODUCTION = os.getenv("ENV", "development").strip().lower() == "production"

app = FastAPI(
    title="CivicResolve API",
    description="AI-native civic issue reporting and resolution-accountability platform",
    version="1.0.0",
    lifespan=lifespan,
    # Interactive API docs are a reconnaissance aid; keep them off in production.
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

install_performance(app)
install_security(app)

# CORS: Restricted in production, driven by FRONTEND_URL environment variable
frontend_url_env = os.getenv("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [o.strip() for o in frontend_url_env.split(",") if o.strip()]
for default_origin in ["http://localhost:3000", "http://127.0.0.1:3000"]:
    if default_origin not in allowed_origins:
        allowed_origins.append(default_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,  # Required for admin session cookies
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# Static files (uploaded images)
app.mount("/uploads", ImmutableStaticFiles(directory=UPLOAD_DIR), name="uploads")

# Routers
app.include_router(reports_router)
app.include_router(lifecycle_router)
app.include_router(admin_auth_router)
app.include_router(admin_router)


@app.get("/health")
async def health() -> dict:
    """Liveness probe; also reports whether Gemini calls are live or mocked."""
    return {"status": "ok", "service": "CivicResolve API", "ai_mode": ai_mode()}


@app.post("/api/admin/trigger-sla-check", dependencies=[Depends(verify_admin_key)])
async def trigger_sla_check() -> dict:
    """Manual trigger for demo purposes — admin authorized only."""
    run_sla_check()
    return {"message": "SLA check triggered"}
