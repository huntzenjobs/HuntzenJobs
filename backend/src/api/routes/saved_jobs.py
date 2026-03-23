"""
Saved Jobs API Routes
=====================
Manage user's saved/bookmarked jobs.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from pydantic import BaseModel

from src.api.deps import get_supabase_client
from src.api.middleware import limiter
from src.config.settings import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()


def _get_saved_jobs_limit(user_id: str) -> int:
    """Get saved_jobs limit for user's plan. Returns -1 for unlimited."""
    try:
        supabase = get_supabase_client()
        # Get plan limits via user subscription
        res = supabase.rpc("get_user_plan_limits", {"p_user_id": user_id}).execute()
        if res.data and isinstance(res.data, dict):
            return res.data.get("saved_jobs", -1)
        # Fallback: query subscription_plans directly
        sub = supabase.table("user_subscriptions").select(
            "plan_id, subscription_plans(limits)"
        ).eq("user_id", user_id).eq("status", "active").limit(1).execute()
        if sub.data and sub.data[0].get("subscription_plans"):
            limits = sub.data[0]["subscription_plans"].get("limits") or {}
            return limits.get("saved_jobs", -1)
        # No active sub → free plan limits
        free = supabase.table("subscription_plans").select("limits").eq("name", "free").single().execute()
        if free.data:
            return (free.data.get("limits") or {}).get("saved_jobs", -1)
    except Exception as e:
        logger.warning(f"Could not check saved_jobs limit for {user_id}: {e}")
    return -1  # Allow through on error


def _check_saved_jobs_limit(user_id: str) -> None:
    """Check if user has reached their saved jobs limit. Raises 429 if exceeded."""
    limit = _get_saved_jobs_limit(user_id)
    if limit == -1:
        return  # Unlimited

    try:
        supabase = get_supabase_client()
        count_res = supabase.table("saved_jobs").select(
            "id", count="exact"
        ).eq("user_id", user_id).execute()
        current_count = count_res.count or 0

        if current_count >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "QUOTA_EXCEEDED",
                    "feature": "saved_jobs",
                    "limit": limit,
                    "used": current_count,
                    "message": f"Limite de {limit} offres sauvegardées atteinte. Passez à un plan supérieur.",
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Could not check saved_jobs count for {user_id}: {e}")


class SaveJobRequest(BaseModel):
    """Payload sent by the frontend when saving a job."""
    job_title: str
    company: str
    location: str
    salary: str | None = None
    job_url: str
    description: str | None = None
    external_job_id: str | None = None
    job_source: str = "unknown"


def get_user_id_from_header(authorization: str | None) -> str | None:
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
@limiter.limit("60/minute")
async def get_saved_jobs(request: Request, authorization: str | None = Header(None)):
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
@limiter.limit("30/minute")
async def save_job(
    request: Request,
    body: SaveJobRequest,
    authorization: str | None = Header(None),
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

    # Check saved jobs limit before allowing save
    _check_saved_jobs_limit(user_id)

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
        ) from None


@router.post("/api/saved-jobs/apply-click/{external_job_id}")
@limiter.limit("30/minute")
async def track_apply_click(
    request: Request,
    external_job_id: str,
    job_url: str = Query(...),
    job_source: str = Query(default="unknown"),
    authorization: str | None = Header(None),
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
            now = datetime.now(UTC).isoformat()
            supabase.table("saved_jobs") \
                .update({"applied_at": now}) \
                .eq("user_id", user_id) \
                .eq("external_job_id", external_job_id) \
                .execute()
        except Exception as e:
            logger.warning(f"Could not update applied_at for job {external_job_id}: {e}")

    return {"tracked": True, "redirect_url": job_url}


@router.delete("/api/saved-jobs/{external_job_id}")
@limiter.limit("30/minute")
async def unsave_job(
    request: Request,
    external_job_id: str,
    authorization: str | None = Header(None),
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
        ) from None
