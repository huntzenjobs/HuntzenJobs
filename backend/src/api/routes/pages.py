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
    """Health check endpoint for Railway auto-scaling."""
    import os
    import time

    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "worker_pid": os.getpid(),  # Identify worker for Railway
        "timestamp": int(time.time()),
    }
