"""
HuntZen - AI Career Platform
=============================
Entry point for the FastAPI application.

Architecture:
- FastAPI with Jinja2 templates
- Deep LangChain agents (no LangGraph)
- Multi-source job aggregation
- AI-powered CV analysis

Author: Abdessamad
Version: 3.0.0
"""

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from src.api import router
from src.api.middleware import setup_middleware
from src.config.settings import settings
from src.utils.logger import get_logger, setup_logging

# Setup logging
setup_logging()
logger = get_logger(__name__)

# Sentry — error tracking (active si SENTRY_DSN configuré sur Railway)
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.3,
        profiles_sample_rate=0.1,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        send_default_pii=False,
    )
    logger.info(f"Sentry initialized (environment={settings.environment})")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    logger.info("=" * 60)
    logger.info(f"{settings.app_name} v{settings.app_version} starting...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"LLM Models: {settings.llm_model_fast} / {settings.llm_model_powerful}")

    # Initialiser le pool DB async
    from app.database import get_pool_stats, init_connection_pool_async
    await init_connection_pool_async()

    # Valider que la DB est accessible avant d'accepter du trafic
    pool_stats = await get_pool_stats()
    if pool_stats.get("status") not in ("active", "disabled"):
        raise RuntimeError(f"Database pool failed to initialize: {pool_stats}")
    logger.info(f"DB pool ready: {pool_stats}")

    # Workers ARQ lancés en service Railway séparé (src.workers.settings.WorkerSettings)
    # Plus de workers asyncio in-process — ARQ gère ça en dehors de l'API

    # Initialize LangSmith Tracing if enabled
    if settings.langchain_tracing_v2:
        import os
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
        os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key.get_secret_value()
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
        logger.info(f"LangSmith Tracing enabled (Project: {settings.langchain_project})")

    logger.info("=" * 60)

    yield

    # Shutdown propre : DB pool → Redis
    from app.database import close_connection_pool
    from src.utils.cache import close_redis
    await close_connection_pool()
    await close_redis()
    logger.info(f"{settings.app_name} shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="""
    HuntZen - AI-Powered Career Platform

    ## Features

    - Career Coach: AI advisor for career guidance and training recommendations
    - Job Scout: Multi-source job search with AI ranking
    - CV Analyzer: ATS scoring and improvement suggestions

    ## Architecture

    Built with:
    - FastAPI + Jinja2 for backend/frontend
    - LangChain with deep sub-agents (no LangGraph)
    - Groq LLMs (Llama 3.3 70B & 8B)
    - Multi-provider job aggregation (Adzuna, Google Jobs, RemoteOK)
    - IBM Docling for PDF processing
    """,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Setup middleware
setup_middleware(app)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global fallback exception handler.

    Ensures CORS headers are present even on unhandled 500 errors so the
    browser can read the error detail instead of seeing a CORS violation.
    """
    origin = request.headers.get("origin", "")
    cors_headers: dict[str, str] = {}
    if origin:
        cors_headers["Access-Control-Allow-Origin"] = origin
        cors_headers["Access-Control-Allow-Credentials"] = "true"
        cors_headers["Vary"] = "Origin"

    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=cors_headers,
    )


# Mount static files (if directory exists)
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
except RuntimeError:
    logger.warning("Static directory not found, skipping static files mount")

# Include routes
app.include_router(router)


def run():
    """Run the application."""
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload and settings.environment == "development",
        workers=settings.workers if settings.environment == "production" else 1,
        log_level="debug" if settings.debug else "info",
    )


if __name__ == "__main__":
    run()
