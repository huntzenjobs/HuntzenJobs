"""
Pages Routes
=============
Legacy placeholder — le frontend est servi par Next.js (Vercel).
Toutes les routes redirigent vers le frontend pour éviter les 500.
"""

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from src.config.settings import get_settings

router = APIRouter()

_FRONTEND = "https://huntzenjobs.com"


def _fe(path: str = "") -> str:
    settings = get_settings()
    base = (settings.frontend_url or _FRONTEND).rstrip("/")
    return f"{base}{path}"


@router.get("/")
async def index():
    return RedirectResponse(url=_fe(), status_code=301)


@router.get("/coach")
async def coach_page():
    return RedirectResponse(url=_fe("/dashboard/coach"), status_code=301)


@router.get("/jobs")
async def jobs_page():
    return RedirectResponse(url=_fe("/dashboard/jobs"), status_code=301)


@router.get("/cv")
async def cv_page():
    return RedirectResponse(url=_fe("/dashboard/cv"), status_code=301)


@router.get("/events")
async def events_page():
    return RedirectResponse(url=_fe("/dashboard"), status_code=301)


@router.get("/cv-adapter")
async def cv_adapter_page():
    return RedirectResponse(url=_fe("/dashboard/cv-adapter"), status_code=301)


@router.get("/health")
async def health_check():
    """Health check léger pour Railway readiness probe."""
    import os
    import time

    from fastapi.responses import JSONResponse

    from src.utils.cache import get_redis

    settings = get_settings()
    details: dict = {}

    try:
        redis = await get_redis()
        if redis:
            await redis.ping()
            details["redis"] = "ok"
        else:
            details["redis"] = "disabled"
    except Exception as e:
        details["redis"] = {"error": str(e)}

    return JSONResponse(content={
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "worker_pid": os.getpid(),
        "timestamp": int(time.time()),
        **details,
    })
