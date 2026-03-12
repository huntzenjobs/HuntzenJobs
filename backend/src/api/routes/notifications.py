"""
Notifications API Routes
========================
Handles sending job alerts, weekly summaries, and managing
user notification preferences.
"""

import logging
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from supabase import create_client
import httpx

from src.config.settings import get_settings
from src.api.deps import get_supabase_client
from src.services.email import send_job_alerts, send_weekly_summary

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()


def get_user_id_and_email_from_header(authorization: Optional[str]):
    """Return (user_id, email) from Bearer token, or (None, None)."""
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


def _get_user_email_by_id(user_id: str) -> Optional[str]:
    """
    Fetch user email via Supabase Admin REST API (service role key required).
    supabase-py sync client doesn't expose auth.admin — we call the HTTP endpoint directly.
    """
    try:
        url = f"{settings.supabase_url}/auth/v1/admin/users/{user_id}"
        service_key = settings.get_supabase_service_role_key()
        headers = {
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
        }
        resp = httpx.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("email")
        logger.warning(f"Admin user fetch returned {resp.status_code} for {user_id}")
    except Exception as e:
        logger.error(f"Failed to fetch user email for {user_id}: {e}")
    return None


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SendJobAlertsRequest(BaseModel):
    user_id: str


class SendWeeklySummaryRequest(BaseModel):
    user_id: str


class NotificationPreferences(BaseModel):
    job_alerts: Optional[bool] = None
    application_confirmation: Optional[bool] = None
    weekly_summary: Optional[bool] = None
    reengagement: Optional[bool] = None
    followup_reminder: Optional[bool] = None
    alert_frequency: Optional[str] = None  # 'instant' | 'daily' | 'weekly'


# ---------------------------------------------------------------------------
# POST /api/notifications/send-job-alerts
# Called by Vercel cron (no user JWT — server-to-server)
# ---------------------------------------------------------------------------

@router.post("/api/notifications/send-job-alerts")
async def send_job_alerts_route(payload: SendJobAlertsRequest):
    """
    Fetch user's recently saved (but not yet applied) jobs from the last 24h
    and send them as a job alert digest email.
    Called by the Vercel cron job at 08:00 daily.
    """
    supabase = get_supabase_client()
    user_id = payload.user_id

    email = _get_user_email_by_id(user_id)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Get saved jobs from the last 24h that haven't been applied to yet
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        resp = supabase.table("saved_jobs") \
            .select("external_job_id, job_title, company, location, salary, job_url") \
            .eq("user_id", user_id) \
            .gte("saved_at", since) \
            .is_("applied_at", "null") \
            .order("saved_at", desc=True) \
            .limit(5) \
            .execute()
    except Exception as e:
        logger.error(f"Error fetching saved jobs for {user_id}: {e}")
        return {"success": False, "error": "Failed to fetch jobs"}

    jobs = resp.data or []
    if not jobs:
        logger.info(f"[send-job-alerts] No new saved jobs for {user_id}, skipping")
        return {"success": True, "sent": False, "reason": "no_new_jobs"}

    # Map saved_jobs fields to what send_job_alerts() expects
    formatted = [
        {
            "id": j.get("external_job_id", ""),
            "title": j.get("job_title", ""),
            "company": j.get("company", ""),
            "location": j.get("location", ""),
            "salary": j.get("salary"),
        }
        for j in jobs
    ]

    ok = send_job_alerts(to_email=email, jobs=formatted)
    return {"success": ok, "sent": ok, "jobs_count": len(formatted)}


# ---------------------------------------------------------------------------
# POST /api/notifications/send-weekly-summary
# Called by Vercel cron (no user JWT — server-to-server)
# ---------------------------------------------------------------------------

@router.post("/api/notifications/send-weekly-summary")
async def send_weekly_summary_route(payload: SendWeeklySummaryRequest):
    """
    Compute last-7-day activity stats for a user and send a weekly summary email.
    Called by the Vercel cron job every Monday at 09:00.
    """
    supabase = get_supabase_client()
    user_id = payload.user_id

    email = _get_user_email_by_id(user_id)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    try:
        # Count applications confirmed this week
        apps_resp = supabase.table("user_applications") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .gte("applied_at", since) \
            .execute()
        applications = apps_resp.count or 0

        # Count saved jobs this week
        saved_resp = supabase.table("saved_jobs") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .gte("saved_at", since) \
            .execute()
        saved = saved_resp.count or 0

        # Count documents generated this week
        docs_resp = supabase.table("user_documents") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .gte("created_at", since) \
            .execute()
        documents = docs_resp.count or 0

        # Sum job views from usage_quotas over last 7 days
        quota_since = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
        views_resp = supabase.table("usage_quotas") \
            .select("job_views_used") \
            .eq("user_id", user_id) \
            .gte("quota_date", quota_since) \
            .execute()
        views = sum(r.get("job_views_used", 0) or 0 for r in (views_resp.data or []))

    except Exception as e:
        logger.error(f"Error fetching weekly stats for {user_id}: {e}")
        return {"success": False, "error": "Failed to fetch stats"}

    stats = {
        "applications": applications,
        "saved": saved,
        "documents": documents,
        "views": views,
    }

    ok = send_weekly_summary(to_email=email, stats=stats)
    return {"success": ok, "stats": stats}


# ---------------------------------------------------------------------------
# GET /api/notifications/preferences  (authenticated)
# ---------------------------------------------------------------------------

@router.get("/api/notifications/preferences")
async def get_notification_preferences(authorization: Optional[str] = Header(None)):
    """Return the current user's notification preferences."""
    user_id, _ = get_user_id_and_email_from_header(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    supabase = get_supabase_client()
    try:
        resp = supabase.table("user_notification_preferences") \
            .select("*") \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        if resp.data:
            return resp.data
    except Exception:
        pass  # Row doesn't exist yet — return defaults below

    # Return sensible defaults if no row exists
    return {
        "user_id": user_id,
        "job_alerts": True,
        "application_confirmation": True,
        "weekly_summary": True,
        "reengagement": True,
        "followup_reminder": True,
        "alert_frequency": "daily",
    }


# ---------------------------------------------------------------------------
# PATCH /api/notifications/preferences  (authenticated)
# ---------------------------------------------------------------------------

@router.patch("/api/notifications/preferences")
async def update_notification_preferences(
    payload: NotificationPreferences,
    authorization: Optional[str] = Header(None),
):
    """Upsert the current user's notification preferences."""
    user_id, _ = get_user_id_and_email_from_header(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    valid_frequencies = {"instant", "daily", "weekly"}
    if payload.alert_frequency and payload.alert_frequency not in valid_frequencies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"alert_frequency must be one of: {', '.join(valid_frequencies)}",
        )

    # Build update dict from non-None fields only
    update_data: dict = {
        k: v for k, v in payload.model_dump().items() if v is not None
    }
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    update_data["user_id"] = user_id
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    supabase = get_supabase_client()
    try:
        resp = supabase.table("user_notification_preferences") \
            .upsert(update_data, on_conflict="user_id") \
            .execute()
        return {"success": True, "data": resp.data[0] if resp.data else update_data}
    except Exception as e:
        logger.error(f"Error updating notification preferences for {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update preferences",
        )
