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

import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from src.api import router
from src.api.middleware import setup_middleware
from src.config.settings import settings
from src.utils.logger import setup_logging, get_logger

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
        traces_sample_rate=0.1,
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )
    logger.info("sentry_initialized", environment=settings.environment)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    logger.info("=" * 60)
    logger.info(f"{settings.app_name} v{settings.app_version} starting...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"LLM Models: {settings.llm_model_fast} / {settings.llm_model_powerful}")
    
    # Initialize LangSmith Tracing if enabled
    if settings.langchain_tracing_v2:
        import os
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
        os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key.get_secret_value()
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
        logger.info(f"🚀 LangSmith Tracing enabled (Project: {settings.langchain_project})")
    
    logger.info("=" * 60)
    
    yield
    
    # Clean shutdown: close Redis connection pool
    from src.utils.cache import close_redis
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
