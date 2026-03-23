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
        raise HTTPException(status_code=500, detail="DB query failed") from None

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

# ---------------------------------------------------------------------------
# POST /api/cron/daily-admin-digest
# ---------------------------------------------------------------------------

@router.post("/daily-admin-digest")
async def daily_admin_digest(authorization: str | None = Header(None)):
    """
    Resume quotidien envoye a l'admin : inscrits, paiements, usage, MRR.
    Envoye meme si 0 activite (heartbeat).
    """
    _verify_cron_secret(authorization)

    supabase = get_supabase_client()
    today = datetime.now(UTC).date().isoformat()

    try:
        # Nouveaux inscrits aujourd'hui
        signups = supabase.table("profiles").select(
            "email, full_name"
        ).gte("created_at", f"{today}T00:00:00Z").execute()
        signup_list = signups.data or []

        # Paiements recus (nouvelles souscriptions aujourd'hui, hors plan free)
        new_subs = supabase.table("user_subscriptions").select(
            "user_id, plan_id, status, subscription_plans(name, display_name, price_monthly)"
        ).in_("status", ["active", "trialing"]).gte("created_at", f"{today}T00:00:00Z").execute()
        new_sub_list = [
            s for s in (new_subs.data or [])
            if (s.get("subscription_plans") or {}).get("price_monthly", 0) > 0
        ]
        revenue_today = sum(
            (s.get("subscription_plans") or {}).get("price_monthly", 0)
            for s in new_sub_list
        )

        # Usage agrege du jour
        usage = supabase.table("usage_quotas").select(
            "cv_analyses_used, assistant_messages_used, job_searches_used"
        ).eq("quota_date", today).execute()
        total_cv = sum(r.get("cv_analyses_used", 0) for r in (usage.data or []))
        total_msgs = sum(r.get("assistant_messages_used", 0) for r in (usage.data or []))
        total_searches = sum(r.get("job_searches_used", 0) for r in (usage.data or []))
        active_users = len(usage.data or [])

        # MRR snapshot (toutes les souscriptions payantes actives)
        all_active = supabase.table("user_subscriptions").select(
            "user_id, plan_id, subscription_plans(name, display_name, price_monthly)"
        ).in_("status", ["active", "trialing"]).execute()
        mrr = sum(
            (s.get("subscription_plans") or {}).get("price_monthly", 0)
            for s in (all_active.data or [])
            if (s.get("subscription_plans") or {}).get("price_monthly", 0) > 0
        )

        # Construire l'email
        signup_lines = ""
        if signup_list:
            for s in signup_list:
                signup_lines += f"  - {s.get('email', '?')} ({s.get('full_name') or 'pas de nom'})\n"
        else:
            signup_lines = "  Aucun\n"

        # Enrichir les souscriptions avec l'email du user
        sub_lines = ""
        if new_sub_list:
            for s in new_sub_list:
                plan = (s.get("subscription_plans") or {})
                uid = s.get("user_id", "")
                # Chercher l'email dans la liste des inscrits ou en DB
                user_email = "?"
                for sg in signup_list:
                    if sg.get("id") == uid:
                        user_email = sg.get("email", "?")
                        break
                if user_email == "?":
                    try:
                        p = supabase.table("profiles").select("email").eq("id", uid).maybe_single().execute()
                        user_email = (p.data or {}).get("email", uid[:8])
                    except Exception:
                        user_email = uid[:8]
                sub_lines += f"  - {user_email} → {plan.get('display_name', '?')} ({plan.get('price_monthly', 0)}EUR/mois)\n"
        else:
            sub_lines = "  Aucun\n"

        body = (
            f"=== RESUME QUOTIDIEN HUNTZEN — {today} ===\n\n"
            f"INSCRIPTIONS ({len(signup_list)})\n{signup_lines}\n"
            f"PAIEMENTS ({len(new_sub_list)}) — {revenue_today:.2f}EUR\n{sub_lines}\n"
            f"USAGE DU JOUR\n"
            f"  Utilisateurs actifs : {active_users}\n"
            f"  CV analyses : {total_cv}\n"
            f"  Messages coach : {total_msgs}\n"
            f"  Recherches emploi : {total_searches}\n\n"
            f"MRR ACTUEL : {mrr:.2f}EUR/mois\n\n"
        )

        if not signup_list and not new_sub_list and active_users == 0:
            body += "Aucune activite aujourd'hui. Le systeme fonctionne normalement.\n"

        from src.services.admin_alerts import send_admin_alert
        await send_admin_alert(
            subject=f"Resume quotidien — {len(signup_list)} inscrits, {len(new_sub_list)} paiements, MRR {mrr:.2f}EUR",
            body=body,
            severity="info",
            skip_throttle=True,
            category="",
        )

        logger.info(f"[cron] daily-admin-digest sent: {len(signup_list)} signups, {len(new_sub_list)} subs, MRR={mrr}")
        return {
            "success": True,
            "signups": len(signup_list),
            "new_subscriptions": len(new_sub_list),
            "revenue_today": revenue_today,
            "mrr": mrr,
            "active_users": active_users,
        }

    except Exception as e:
        logger.error(f"[cron] daily-admin-digest failed: {e}")
        raise HTTPException(status_code=500, detail="Digest failed") from None


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


@router.post("/notify-expiring-plans")
async def notify_expiring_plans_cron(authorization: str | None = Header(None)):
    """
    Envoie un email J-7 aux users dont le plan admin_granted expire dans 7 jours.
    Appeler quotidiennement via cron (08:00 UTC).
    """
    _verify_cron_secret(authorization)
    from src.workers.tasks import notify_expiring_plans
    result = await notify_expiring_plans({})
    logger.info(f"[cron] notify-expiring-plans: {result}")
    return result
