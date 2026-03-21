"""
Pages Routes
=============
Server-side rendered pages with Jinja2.
"""

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from src.config.settings import settings

router = APIRouter()
templates = Jinja2Templates(directory="templates")


@router.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Landing page / Dashboard."""
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "app_name": settings.app_name,
            "version": settings.app_version,
        }
    )


@router.get("/coach", response_class=HTMLResponse)
async def coach_page(request: Request):
    """Career Coach chat interface."""
    return templates.TemplateResponse(
        "coach.html",
        {
            "request": request,
            "app_name": settings.app_name,
        }
    )


@router.get("/jobs", response_class=HTMLResponse)
async def jobs_page(request: Request):
    """Job search page."""
    return templates.TemplateResponse(
        "jobs.html",
        {
            "request": request,
            "app_name": settings.app_name,
        }
    )


@router.get("/cv", response_class=HTMLResponse)
async def cv_page(request: Request):
    """CV analyzer page."""
    return templates.TemplateResponse(
        "cv.html",
        {
            "request": request,
            "app_name": settings.app_name,
        }
    )


@router.get("/events", response_class=HTMLResponse)
async def events_page(request: Request):
    """Job fairs and professional events page."""
    return templates.TemplateResponse(
        "events.html",
        {
            "request": request,
            "app_name": settings.app_name,
        }
    )


@router.get("/cv-adapter", response_class=HTMLResponse)
async def cv_adapter_page(request: Request):
    """CV Adapter page - adapt CV to job offers."""
    return templates.TemplateResponse(
        "cv_adapter.html",
        {
            "request": request,
            "app_name": settings.app_name,
        }
    )


@router.get("/health")
async def health_check():
    """
    Health check complet pour Railway readiness probe.

    Retourne 200 si healthy/degraded, 503 si unhealthy.
    Railway route le trafic uniquement si ce endpoint retourne 200.
    """
    import os
    import time

    from fastapi.responses import JSONResponse

    from app.database import get_pool_stats
    from src.utils.cache import get_redis

    status = "healthy"
    details = {}

    # Vérifier DB pool
    try:
        pool_stats = await get_pool_stats()
        if pool_stats.get("status") == "error":
            status = "unhealthy"
        elif pool_stats.get("requests_waiting", 0) > 5:
            status = "degraded"
        details["db"] = pool_stats
    except Exception as e:
        status = "unhealthy"
        details["db"] = {"error": str(e)}

    # Vérifier Redis (degraded si down, pas unhealthy — l'app fonctionne sans Redis)
    try:
        redis = await get_redis()
        if redis:
            await redis.ping()
            details["redis"] = "ok"
        else:
            details["redis"] = "disabled"
    except Exception as e:
        if status == "healthy":
            status = "degraded"
        details["redis"] = {"error": str(e)}

    payload = {
        "status": status,
        "app": settings.app_name,
        "version": settings.app_version,
        "worker_pid": os.getpid(),
        "timestamp": int(time.time()),
        **details,
    }

    http_status = 503 if status == "unhealthy" else 200
    return JSONResponse(content=payload, status_code=http_status)
