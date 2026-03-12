"""
Notification Service
=====================
Centralized service for creating in-app notifications (user_notifications table).
Called from career_score.py, referrals.py, coupons.py, and cron routes.

Also triggers emails for inactive users if reengagement preference is enabled.
"""

import logging
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

VALID_TYPES = {
    "job_alert",
    "cv_feedback",
    "referral_bonus",
    "promo_code",
    "career_progress",
    "interview_ready",
    "win_back_7d",
    "support_ticket_received",
    "support_ticket_reply",
}


def create_notification(
    supabase_client,
    user_id: str,
    type: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> Optional[str]:
    """
    Insert a notification into user_notifications table.

    Returns the notification id on success, None on failure.
    Does NOT raise — logs errors and fails silently to avoid
    breaking the caller's main flow.
    """
    if type not in VALID_TYPES:
        logger.warning(f"[notifications] Unknown type '{type}' for user {user_id}")
        return None

    payload = {
        "user_id": user_id,
        "type": type,
        "title": title,
        "body": body,
        "data": data or {},
        "read": False,
    }

    try:
        resp = supabase_client.table("user_notifications").insert(payload).execute()
        if resp.data:
            notif_id = resp.data[0]["id"]
            logger.info(f"[notifications] Created '{type}' for user {user_id} → {notif_id}")
            _maybe_send_email(supabase_client, user_id, type, title, body)
            return notif_id
    except Exception as e:
        logger.error(f"[notifications] Failed to create '{type}' for {user_id}: {e}")

    return None


def _maybe_send_email(
    supabase_client,
    user_id: str,
    notif_type: str,
    title: str,
    body: str,
) -> None:
    """
    If user has reengagement emails enabled, mark the notification with email_sent_at.
    Actual email sending happens in the email service — this just gates it.
    """
    reengagement_types = {"win_back_7d", "promo_code", "job_alert"}
    if notif_type not in reengagement_types:
        return

    try:
        prefs_res = (
            supabase_client.table("user_notification_preferences")
            .select("reengagement")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        reengagement = (prefs_res.data or {}).get("reengagement", True)
        if not reengagement:
            return

        # Mark email as sent on the latest unread notification of this type
        # (avoids double-send if this function is called twice)
        supabase_client.table("user_notifications").update(
            {"email_sent_at": datetime.now(timezone.utc).isoformat()}
        ).eq("user_id", user_id).eq("type", notif_type).is_(
            "email_sent_at", "null"
        ).execute()

    except Exception as e:
        logger.warning(f"[notifications] email gate check failed for {user_id}: {e}")
