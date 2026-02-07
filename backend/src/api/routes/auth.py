"""
Auth API Routes
===============
User authentication and profile management.
"""

from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status, Request
from supabase import create_client, Client

from src.api.middleware import limiter
from src.config.settings import get_settings

router = APIRouter()
settings = get_settings()


def get_supabase_client() -> Client:
    """Get Supabase client (lazy initialization)."""
    return create_client(
        settings.supabase_url,
        settings.get_supabase_key()
    )


def get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    """
    Extract user from Authorization header.

    Args:
        authorization: Bearer token from header

    Returns:
        User data if valid, None otherwise
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "")

    try:
        # Get user from Supabase using the token
        supabase = get_supabase_client()
        response = supabase.auth.get_user(token)
        if response and response.user:
            return {
                "id": response.user.id,
                "email": response.user.email,
                "user_metadata": response.user.user_metadata,
            }
    except Exception as e:
        print(f"Error getting user from token: {e}")

    return None


@router.get("/api/auth/me")
@limiter.limit("20/minute")  # Rate limit: 20 requests per minute per IP
async def get_current_user(req: Request, authorization: Optional[str] = Header(None)):
    """
    Get current authenticated user information.

    Args:
        authorization: Bearer token from header

    Returns:
        User data if authenticated

    Raises:
        HTTPException: If not authenticated
    """
    user = get_user_from_token(authorization)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    return user
