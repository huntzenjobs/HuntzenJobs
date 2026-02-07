"""
Authentication Routes
====================
Routes for user authentication and authorization.
"""

from fastapi import APIRouter, Header, HTTPException, status
from typing import Optional

router = APIRouter()


@router.get("/me")
async def get_current_user(authorization: Optional[str] = Header(None)):
    """
    Get current authenticated user information.
    
    Stub endpoint - implement actual authentication logic here.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    
    return {
        "user_id": "stub_user",
        "email": "user@example.com",
        "authenticated": True,
    }


@router.get("/health")
async def auth_health():
    """Auth endpoint health check."""
    return {"status": "ok", "service": "auth"}
