"""
Saved Jobs API Routes
=====================
Manage user's saved/bookmarked jobs.
"""

import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel
from src.config.settings import get_settings
from src.api.deps import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()


class SaveJobRequest(BaseModel):
    """Payload sent by the frontend when saving a job."""
    job_title: str
    company: str
    location: str
    salary: Optional[str] = None
    job_url: str
    description: Optional[str] = None
    external_job_id: Optional[str] = None
    job_source: str = "unknown"


def get_user_id_from_header(authorization: Optional[str]) -> Optional[str]:
    """Extract user ID from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "")

    try:
        supabase_anon = get_supabase_client()
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

    Returns:
        { success: true, jobs: [...] }
    """
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant ou invalide",
        )

    try:
        supabase = get_supabase_client()
        response = supabase.table("saved_jobs")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("saved_at", desc=True)\
            .execute()

        return {"success": True, "jobs": response.data or []}

    except Exception as e:
        logger.error(f"Error fetching saved jobs: {e}")
        return {"success": True, "jobs": []}


@router.post("/api/saved-jobs")
async def save_job(
    body: SaveJobRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Save a job for the current user.

    Accepts full job data in request body.
    Returns { success: true, job_id: str }
    """
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to save jobs",
        )

    try:
        supabase = get_supabase_client()

        # Duplicate check (same user + external_job_id + source)
        if body.external_job_id:
            existing = supabase.table("saved_jobs")\
                .select("id")\
                .eq("user_id", user_id)\
                .eq("external_job_id", body.external_job_id)\
                .eq("job_source", body.job_source)\
                .execute()

            if existing.data:
                return {"success": True, "job_id": existing.data[0]["id"], "already_saved": True}

        result = supabase.table("saved_jobs")\
            .insert({
                "user_id": user_id,
                "job_title": body.job_title,
                "company": body.company,
                "location": body.location,
                "salary": body.salary,
                "job_url": body.job_url,
                "description": body.description,
                "external_job_id": body.external_job_id,
                "job_source": body.job_source,
            })\
            .execute()

        inserted_id = result.data[0]["id"] if result.data else None
        return {"success": True, "job_id": inserted_id}

    except Exception as e:
        logger.error(f"Error saving job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save job",
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
    Updates applied_at on saved_jobs if the job is saved.
    Returns redirect URL for the client to open in a new tab.
    """
    user_id = get_user_id_from_header(authorization)

    if user_id:
        try:
            supabase = get_supabase_client()
            now = datetime.now(timezone.utc).isoformat()
            supabase.table("saved_jobs") \
                .update({"applied_at": now}) \
                .eq("user_id", user_id) \
                .eq("external_job_id", external_job_id) \
                .execute()
        except Exception as e:
            logger.warning(f"Could not update applied_at for job {external_job_id}: {e}")

    return {"tracked": True, "redirect_url": job_url}


@router.delete("/api/saved-jobs/{external_job_id}")
async def unsave_job(
    external_job_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Remove a saved job for the current user by external_job_id.
    """
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        supabase = get_supabase_client()
        supabase.table("saved_jobs")\
            .delete()\
            .eq("user_id", user_id)\
            .eq("external_job_id", external_job_id)\
            .execute()

        return {"message": "Job removed from saved"}

    except Exception as e:
        logger.error(f"Error removing saved job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove saved job",
        )
