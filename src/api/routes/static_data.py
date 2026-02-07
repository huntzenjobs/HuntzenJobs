"""
Static Data Routes
==================
Routes for serving static reference data.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def static_data_health():
    """Static data endpoint health check."""
    return {"status": "ok", "service": "static_data"}
