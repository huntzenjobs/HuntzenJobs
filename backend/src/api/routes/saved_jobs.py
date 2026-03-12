"""
Saved Jobs API Routes
=====================
Manage user's saved/bookmarked jobs.
"""

import logging
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel
from src.config.settings import get_settings
from src.api.deps import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()


class SavedJob(BaseModel):
    """Saved job data."""
    id: str
    job_id: str
    title: str
    company: str
    location: Optional[str] = None
    salary: Optional[str] = None
    saved_at: str


def get_user_id_from_header(authorization: Optional[str]) -> Optional[str]:
    """Extract user ID from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "")

    try:
        supabase_anon = create_client(
            settings.supabase_url,
            settings.get_supabase_key()
        )
        response = supabase_anon.auth.get_user(token)
        if response and response.user:
            return response.user.id
    except Exception as e:
        logger.error(f"Error getting user ID: {e}")

    return None


@router.get("/api/saved-jobs")
async def get_saved_jobs(authorization: Optional[str] = Header(None)):
    """
    Get all saved jobs for the current user.

    Args:
        authorization: Bearer token from header

    Returns:
        List of saved jobs

    Raises:
        HTTPException: If not authenticated
    """
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        # Return empty list if not authenticated (for anonymous users)
        return []

    try:
        # Fetch saved jobs from database
        supabase = get_supabase_client()
        response = supabase.table("saved_jobs")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("saved_at", desc=True)\
            .execute()

        return response.data or []

    except Exception as e:
        logger.error(f"Error fetching saved jobs: {e}")
        # Return empty list on error (graceful degradation)
        return []


@router.post("/api/saved-jobs/{job_id}")
async def save_job(
    job_id: str,
    authorization: Optional[str] = Header(None)
):
    """
    Save a job for the current user.

    Args:
        job_id: Job ID to save
        authorization: Bearer token from header

    Returns:
        Success message

    Raises:
        HTTPException: If not authenticated
    """
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to save jobs"
        )

    try:
        supabase = get_supabase_client()

        # Check if already saved
        existing = supabase.table("saved_jobs")\
            .select("id")\
            .eq("user_id", user_id)\
            .eq("job_id", job_id)\
            .execute()

        if existing.data:
            return {"message": "Job already saved"}

        # Save the job
        supabase.table("saved_jobs")\
            .insert({
                "user_id": user_id,
                "job_id": job_id
            })\
            .execute()

        return {"message": "Job saved successfully"}

    except Exception as e:
        logger.error(f"Error saving job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save job"
        )


@router.post("/api/saved-jobs/apply-click/{external_job_id}")
async def track_apply_click(
    external_job_id: str,
    job_url: str = Query(...),
    job_source: str = Query(default="unknown"),
    authorization: Optional[str] = Header(None),
):
    """
    Track when a user clicks 'Postuler directement'.
    - Updates applied_at on saved_jobs if the job is saved.
    - Returns redirect URL for the client to open in a new tab.
    """
    user_id = get_user_id_from_header(authorization)

    if user_id:
        try:
            supabase = get_supabase_client()
            now = datetime.now(timezone.utc).isoformat()
            # Update applied_at if the job exists in saved_jobs
            supabase.table("saved_jobs") \
                .update({"applied_at": now}) \
                .eq("user_id", user_id) \
                .eq("external_job_id", external_job_id) \
                .execute()
        except Exception as e:
            logger.warning(f"Could not update applied_at for job {external_job_id}: {e}")

    return {"tracked": True, "redirect_url": job_url}


@router.delete("/api/saved-jobs/{job_id}")
async def unsave_job(
    job_id: str,
    authorization: Optional[str] = Header(None)
):
    """
    Remove a saved job for the current user.

    Args:
        job_id: Job ID to remove
        authorization: Bearer token from header

    Returns:
        Success message

    Raises:
        HTTPException: If not authenticated
    """
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )

    try:
        supabase = get_supabase_client()
        supabase.table("saved_jobs")\
            .delete()\
            .eq("user_id", user_id)\
            .eq("job_id", job_id)\
            .execute()

        return {"message": "Job removed from saved"}

    except Exception as e:
        logger.error(f"Error removing saved job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove saved job"
        )
