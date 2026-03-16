"""
Abuse Detection — Sliding window rate limiting via Redis.
=========================================================
Utilisé par les endpoints heartbeat et tracking pour détecter les abus.
Fail-open : si Redis est down, la requête passe (ne bloque pas l'UX).
"""

import logging
import time

logger = logging.getLogger(__name__)

HEARTBEAT_WINDOW = 60       # fenêtre en secondes
HEARTBEAT_MAX = 10          # max heartbeats par fenêtre (30s = ~2 normaux)
TRACK_WINDOW = 60
TRACK_MAX = 30              # max events de tracking par fenêtre


async def is_rate_limited(
    redis,
    key_prefix: str,
    user_id: str,
    max_events: int,
    window: int,
) -> bool:
    """
    Vérifie si l'utilisateur dépasse la limite dans la fenêtre glissante.
    Retourne True si rate-limitÉ (abus détecté).
    Fail-open si Redis indisponible.
    """
    try:
        now = time.time()
        window_start = now - window
        key = f"{key_prefix}:{user_id}"

        await redis.zadd(key, {str(now): now})
        await redis.zremrangebyscore(key, 0, window_start)
        count = await redis.zcard(key)
        await redis.expire(key, window * 2)

        if count > max_events:
            logger.warning(
                f"[abuse] rate limit: {key_prefix} user={user_id} "
                f"count={count}/{max_events} window={window}s"
            )
            # Marquer le user comme suspect dans Redis (24h)
            await redis.setex(f"suspect:{user_id}", 86400, str(int(now)))
            return True
        return False
    except Exception as e:
        logger.debug(f"[abuse] is_rate_limited error (fail-open): {e}")
        return False


async def is_suspect(redis, user_id: str) -> bool:
    """Retourne True si le user est marqué suspect (abus détecté récemment)."""
    try:
        return await redis.exists(f"suspect:{user_id}") > 0
    except Exception:
        return False
