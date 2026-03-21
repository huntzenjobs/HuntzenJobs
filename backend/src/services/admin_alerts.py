"""
Admin Alerts Service
====================
Envoi d'alertes email a l'admin HuntZen (conversions, resiliations, erreurs critiques).
Throttle via Redis : max 1 email par type d'alerte par heure.
Preferences admin stockees dans Redis (activable/desactivable depuis le panel admin).
"""

import hashlib
import logging
import time

logger = logging.getLogger(__name__)

_THROTTLE_TTL = 3600  # 1 heure
_last_sent_fallback: dict = {}

# Categories de notifications admin
ALERT_CATEGORIES = {
    "payment_received": {
        "label": "Paiement recu",
        "description": "Email a chaque paiement (nouvel abonnement, renouvellement, changement plan)",
        "default": True,
    },
    "payment_failed": {
        "label": "Paiement echoue",
        "description": "Email quand un paiement echoue",
        "default": True,
    },
    "new_subscription": {
        "label": "Nouvelle souscription",
        "description": "Email quand un utilisateur s'abonne",
        "default": True,
    },
    "cancellation": {
        "label": "Annulation",
        "description": "Email quand un utilisateur annule son abonnement",
        "default": True,
    },
    "new_user": {
        "label": "Nouvel utilisateur",
        "description": "Email quand un nouvel utilisateur s'inscrit",
        "default": False,
    },
    "new_contact": {
        "label": "Nouveau message contact",
        "description": "Email quand un visiteur envoie un message via le formulaire de contact",
        "default": True,
    },
    "new_support_ticket": {
        "label": "Nouveau ticket support",
        "description": "Email quand un utilisateur cree un ticket de support",
        "default": True,
    },
    "new_recruiter_request": {
        "label": "Demande consultation recruteur",
        "description": "Email quand un utilisateur demande une consultation recruteur (50 EUR)",
        "default": True,
    },
    "cv_analysis_completed": {
        "label": "Analyse CV terminee",
        "description": "Email quand une analyse CV est terminee (Modal Labs callback)",
        "default": False,
    },
    "error": {
        "label": "Erreurs critiques",
        "description": "Email pour les erreurs systeme critiques",
        "default": True,
    },
}

REDIS_PREFS_KEY = "admin:alert_preferences"


async def get_alert_preferences() -> dict[str, bool]:
    """Get admin alert preferences from Redis (or defaults)."""
    try:
        import json

        from src.utils.cache import get_redis

        redis = await get_redis()
        if redis:
            stored = await redis.get(REDIS_PREFS_KEY)
            if stored:
                return json.loads(stored)
    except Exception as e:
        logger.warning(f"[admin_alerts] Failed to read preferences: {e}")

    return {k: v["default"] for k, v in ALERT_CATEGORIES.items()}


async def set_alert_preferences(prefs: dict[str, bool]) -> dict[str, bool]:
    """Save admin alert preferences to Redis."""
    try:
        import json

        from src.utils.cache import get_redis

        redis = await get_redis()
        if redis:
            await redis.set(REDIS_PREFS_KEY, json.dumps(prefs))
            logger.info(f"[admin_alerts] Preferences updated: {prefs}")
    except Exception as e:
        logger.warning(f"[admin_alerts] Failed to save preferences: {e}")

    return prefs


async def is_alert_enabled(category: str) -> bool:
    """Check if a specific alert category is enabled."""
    prefs = await get_alert_preferences()
    default = ALERT_CATEGORIES.get(category, {}).get("default", True)
    return prefs.get(category, default)


async def send_admin_alert(
    subject: str,
    body: str,
    severity: str = "info",
    skip_throttle: bool = False,
    category: str = "",
) -> None:
    """
    Envoie un email d'alerte a l'admin.

    Throttle via Redis : meme sujet -> max 1 email/heure (sauf si skip_throttle=True).
    Respecte les preferences admin (category peut etre desactivee).
    Ne leve jamais d'exception (best-effort).
    """
    try:
        from src.config.settings import settings
        from src.utils.cache import get_redis

        # Check if this category is enabled
        if category and not await is_alert_enabled(category):
            logger.debug(f"[admin_alerts] Category '{category}' disabled, skipping: '{subject}'")
            return

        if not skip_throttle:
            subject_hash = hashlib.md5(subject.encode()).hexdigest()[:12]
            throttle_key = f"alert:{subject_hash}:last_sent"

            redis = await get_redis()
            if redis:
                already_sent = await redis.get(throttle_key)
                if already_sent:
                    logger.debug(f"[admin_alerts] Throttled: '{subject}'")
                    return
                await redis.set(throttle_key, "1", ex=_THROTTLE_TTL)
            else:
                now = time.time()
                if _last_sent_fallback.get(throttle_key, 0) + _THROTTLE_TTL > now:
                    logger.warning(f"[admin_alerts] throttle memoire actif pour '{subject}'")
                    return
                _last_sent_fallback[throttle_key] = now

        # Envoi via Resend
        import resend
        resend.api_key = settings.get_resend_api_key()
        admin_email = settings.admin_email

        severity_emoji = {"info": "ℹ️", "warning": "⚠️", "error": "🔴"}.get(severity, "ℹ️")

        resend.Emails.send({
            "from": settings.from_email,
            "to": [admin_email],
            "subject": f"{severity_emoji} HuntZen Admin — {subject}",
            "html": f"<pre style='font-family:sans-serif'>{body}</pre>",
        })

        logger.info(f"[admin_alerts] Alerte envoyee a {admin_email}: '{subject}'")

    except Exception as e:
        logger.warning(f"[admin_alerts] Echec envoi alerte '{subject}': {e}")
