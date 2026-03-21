"""
Admin Alerts Service
====================
Envoi d'alertes email à l'admin HuntZen (conversions, résiliations, erreurs critiques).
Throttle via Redis : max 1 email par type d'alerte par heure.
"""

import hashlib
import logging
import time

logger = logging.getLogger(__name__)

_THROTTLE_TTL = 3600  # 1 heure
# Fallback throttle en mémoire si Redis absent (process-local)
_last_sent_fallback: dict = {}


async def send_admin_alert(
    subject: str,
    body: str,
    severity: str = "info",
    skip_throttle: bool = False,
) -> None:
    """
    Envoie un email d'alerte à l'admin.

    Throttle via Redis : même sujet → max 1 email/heure (sauf si skip_throttle=True).
    Ne lève jamais d'exception (best-effort).

    Args:
        subject:      Sujet de l'email
        body:         Corps de l'email (texte ou HTML simple)
        severity:     "info" | "warning" | "error"
        skip_throttle: True pour envoyer sans throttle (ex: chaque paiement)
    """
    try:
        from src.config.settings import settings
        from src.utils.cache import get_redis

        if not skip_throttle:
            # Clé Redis de throttle basée sur le hash du sujet
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
                # Throttle mémoire (process-local) quand Redis indisponible
                now = time.time()
                if _last_sent_fallback.get(throttle_key, 0) + _THROTTLE_TTL > now:
                    logger.warning(f"[admin_alerts] throttle mémoire actif pour '{subject}'")
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

        logger.info(f"[admin_alerts] Alerte envoyée à {admin_email}: '{subject}'")

    except Exception as e:
        logger.warning(f"[admin_alerts] Échec envoi alerte '{subject}': {e}")
