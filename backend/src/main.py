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
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.api import router
from src.api.middleware import setup_middleware
from src.config.settings import settings
from src.utils.logger import setup_logging, get_logger

# Setup logging
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    logger.info("=" * 60)
    logger.info(f"{settings.app_name} v{settings.app_version} starting...")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"LLM Models: {settings.llm_model_fast} / {settings.llm_model_powerful}")
    logger.info("=" * 60)
    
    yield
    
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
