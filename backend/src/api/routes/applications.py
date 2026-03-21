"""
User Applications API Routes
=============================
Track confirmed job applications.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from supabase import create_client

from src.api.deps import get_supabase_client
from src.config.settings import get_settings
from src.services.email import send_application_confirmation, send_application_status_change

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()


def get_user_from_header(authorization: str | None):
    """Return (user_id, user_email) or (None, None) if not authenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None, None
    token = authorization.replace("Bearer ", "")
    try:
        anon = create_client(settings.supabase_url, settings.get_supabase_key())
        resp = anon.auth.get_user(token)
        if resp and resp.user:
            return resp.user.id, resp.user.email
    except Exception as e:
        logger.error(f"Auth error: {e}")
    return None, None


class ApplicationCreate(BaseModel):
    external_job_id: str
    job_title: str
    company: str
    location: str | None = None
    salary: str | None = None
    job_url: str
    job_source: str | None = "unknown"
    confirmed_by_user: bool | None = True
    notes: str | None = None


class ApplicationStatusUpdate(BaseModel):
    status: str  # applied | viewed | interview | rejected | offer


@router.get("/api/applications")
async def get_applications(authorization: str | None = Header(None)):
    """Get all job applications for the current user, newest first."""
    user_id, _ = get_user_from_header(authorization)
    if not user_id:
        return []

    try:
        supabase = get_supabase_client()
        resp = supabase.table("user_applications") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("applied_at", desc=True) \
            .execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Error fetching applications: {e}")
        return []


@router.post("/api/applications", status_code=status.HTTP_201_CREATED)
async def create_application(
    payload: ApplicationCreate,
    authorization: str | None = Header(None),
):
    """
    Create or update a job application entry.
    Triggers an email confirmation if confirmed_by_user is True.
    Uses upsert to avoid duplicates (user_id + external_job_id unique).
    """
    user_id, user_email = get_user_from_header(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        supabase = get_supabase_client()
        now = datetime.now(UTC).isoformat()

        data = {
            "user_id": user_id,
            "external_job_id": payload.external_job_id,
            "job_title": payload.job_title,
            "company": payload.company,
            "location": payload.location,
            "salary": payload.salary,
            "job_url": payload.job_url,
            "job_source": payload.job_source,
            "confirmed_by_user": payload.confirmed_by_user,
            "notes": payload.notes,
            "applied_at": now,
            "updated_at": now,
            "status": "applied",
        }

        # Upsert — update if same user+job already exists
        resp = supabase.table("user_applications") \
            .upsert(data, on_conflict="user_id,external_job_id") \
            .execute()

        # Send confirmation email (fire-and-forget)
        if payload.confirmed_by_user and user_email:
            try:
                send_application_confirmation(
                    to_email=user_email,
                    job_title=payload.job_title,
                    company=payload.company,
                    job_url=payload.job_url,
                )
            except Exception as mail_err:
                logger.warning(f"Email send failed (non-blocking): {mail_err}")

        return {"success": True, "data": resp.data[0] if resp.data else data}

    except Exception as e:
        logger.error(f"Error creating application: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save application",
        ) from None


@router.patch("/api/applications/{application_id}")
async def update_application_status(
    application_id: str,
    payload: ApplicationStatusUpdate,
    authorization: str | None = Header(None),
):
    """Update the status of a job application."""
    valid_statuses = {"applied", "viewed", "interview", "rejected", "offer"}
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Status must be one of: {', '.join(valid_statuses)}",
        )

    user_id, user_email = get_user_from_header(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        supabase = get_supabase_client()
        resp = supabase.table("user_applications") \
            .update({"status": payload.status, "updated_at": datetime.now(UTC).isoformat()}) \
            .eq("id", application_id) \
            .eq("user_id", user_id) \
            .execute()

        if not resp.data:
            raise HTTPException(status_code=404, detail="Application not found")

        if payload.status in {"interview", "offer"} and user_email:
            app = resp.data[0]
            try:
                send_application_status_change(user_email, app["job_title"], app["company"], payload.status)
            except Exception:
                pass

        return {"success": True, "data": resp.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating application {application_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update application",
        ) from None


@router.delete("/api/applications/{application_id}")
async def delete_application(
    application_id: str,
    authorization: str | None = Header(None),
):
    """Delete a job application entry."""
    user_id, _ = get_user_from_header(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        supabase = get_supabase_client()
        supabase.table("user_applications") \
            .delete() \
            .eq("id", application_id) \
            .eq("user_id", user_id) \
            .execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting application {application_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete application",
        ) from None
