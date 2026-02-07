"""
Saved Jobs Routes
=================
Routes for managing saved jobs.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def saved_jobs_health():
    """Saved jobs endpoint health check."""
    return {"status": "ok", "service": "saved_jobs"}
