"""
Cron endpoints — appelés par Vercel Cron via le frontend Next.js.

POST /api/cron/retention-notifications — notifie les users inactifs depuis 7 jours
"""

import logging
import os
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Header, HTTPException

from src.api.deps import get_supabase_client
from src.services.notifications import create_notification
from src.services.user_events import purge_old_user_events

router = APIRouter()
logger = logging.getLogger(__name__)

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _verify_cron_secret(authorization: str | None) -> None:
    if not CRON_SECRET or authorization != f"Bearer {CRON_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


# ---------------------------------------------------------------------------
# POST /api/cron/retention-notifications
# ---------------------------------------------------------------------------

@router.post("/retention-notifications")
async def retention_notifications(authorization: str | None = Header(None)):
    """
    Envoie une notification in-app aux utilisateurs inactifs depuis 7-14 jours.
    Idempotent : ne renvoie pas de notif si une du même type existe dans les 7 derniers jours.
    """
    _verify_cron_secret(authorization)

    supabase = get_supabase_client()
    now = datetime.now(UTC)
    cutoff_7d_date = (now - timedelta(days=7)).date().isoformat()
    cutoff_14d_date = (now - timedelta(days=14)).date().isoformat()
    cutoff_7d_iso = (now - timedelta(days=7)).isoformat()

    # Utilisateurs dont la dernière activité était entre J-14 et J-7
    try:
        res = (
            supabase.table("usage_quotas")
            .select("user_id")
            .lt("quota_date", cutoff_7d_date)
            .gte("quota_date", cutoff_14d_date)
            .execute()
        )
        user_ids = list({r["user_id"] for r in (res.data or [])})
    except Exception as e:
        logger.error(f"[cron] retention: failed to query inactive users: {e}")
        raise HTTPException(status_code=500, detail="DB query failed")

    sent = 0
    for uid in user_ids:
        try:
            # Idempotence : pas de re_engagement dans les 7 derniers jours
            existing = (
                supabase.table("user_notifications")
                .select("id")
                .eq("user_id", uid)
                .eq("type", "re_engagement")
                .gte("created_at", cutoff_7d_iso)
                .execute()
            )
            if existing.data:
                continue

            create_notification(
                supabase,
                uid,
                "re_engagement",
                "Tu nous manques ! 7 jours Pro offerts",
                "Reviens sur HuntZen et profite de 7 jours Pro gratuits. Ton prochain job t'attend.",
                {"trigger_type": "win_back_7d"},
            )
            sent += 1
        except Exception as e:
            logger.warning(f"[cron] retention: failed for user {uid}: {e}")

    logger.info(
        f"[cron] retention-notifications: sent={sent} / total_inactive={len(user_ids)}"
    )
    return {"success": True, "sent": sent, "total_inactive": len(user_ids)}


# ---------------------------------------------------------------------------
# POST /api/cron/purge-events (D6)
# ---------------------------------------------------------------------------

@router.post("/purge-events")
async def purge_events(authorization: str | None = Header(None)):
    """
    Purge les user_events de plus de 30 jours.
    Appelé par cron quotidien (Vercel Cron ou Railway Cron).
    """
    _verify_cron_secret(authorization)
    supabase = get_supabase_client()
    deleted = purge_old_user_events(supabase, days=30)
    logger.info(f"[cron] purge-events: {deleted} événements supprimés")
    return {"success": True, "deleted": deleted}
