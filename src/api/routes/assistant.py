"""
Multi-Assistant Routes
======================
Routes for multi-assistant functionality.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def assistant_health():
    """Assistant endpoint health check."""
    return {"status": "ok", "service": "assistant"}
