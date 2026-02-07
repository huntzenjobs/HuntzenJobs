"""
Recruiter Contact Routes
=========================
Routes for recruiter contact requests.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def recruiter_health():
    """Recruiter endpoint health check."""
    return {"status": "ok", "service": "recruiter"}
