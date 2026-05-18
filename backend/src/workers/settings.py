"""
ARQ Worker Settings — HuntZen
Configuration des workers ARQ pour Railway.

Lancement sur Railway (service séparé, même repo) :
    Commande de démarrage : python -m arq src.workers.settings.WorkerSettings
    Répertoire de travail  : backend/
"""
import os

from arq.connections import RedisSettings

from src.workers.tasks import (
    assistant_task,
    coach_task,
    cover_letter_task,
    cv_adapt_task,
    expat_refresh_task,
    notify_expiring_plans,
    shutdown,
    startup,
)


def _get_redis_settings() -> RedisSettings:
    """Parse REDIS_URL pour ARQ (Railway Redis réseau interne)."""
    from urllib.parse import urlparse
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
    )


class WorkerSettings:
    functions = [coach_task, assistant_task, cv_adapt_task, cover_letter_task, notify_expiring_plans, expat_refresh_task]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = _get_redis_settings()
    max_jobs = 750       # sweet spot Groq payant : 240 req/sec × 3s = 720 max absorbables
    job_timeout = 120    # timeout 2 min par job
    keep_result = 3600   # garder résultat 1h dans Redis
    retry_jobs = True
    max_tries = 3        # retry ARQ si crash du worker
