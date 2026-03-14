"""
ARQ Worker Settings — HuntZen
Configuration des workers ARQ pour Railway.

Lancement sur Railway (service séparé, même repo) :
    Commande de démarrage : python -m arq src.workers.settings.WorkerSettings
    Répertoire de travail  : backend/
"""
import os
from arq.connections import RedisSettings

from src.workers.tasks import coach_task, startup, shutdown


def _get_redis_settings() -> RedisSettings:
    """Parse UPSTASH_REDIS_URL pour ARQ (SSL requis sur Upstash)."""
    url = os.getenv("UPSTASH_REDIS_URL", "")
    if url:
        # Upstash expose redis:// sur port 6379 — ARQ nécessite rediss:// sur 6380
        if url.startswith("redis://"):
            url = url.replace("redis://", "rediss://", 1)
        if ":6379" in url:
            url = url.replace(":6379", ":6380")
        # Extraire les composants
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return RedisSettings(
            host=parsed.hostname,
            port=parsed.port or 6380,
            password=parsed.password,
            ssl=True,
        )
    # Fallback localhost (dev sans Upstash)
    return RedisSettings()


class WorkerSettings:
    functions = [coach_task]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = _get_redis_settings()
    max_jobs = 10        # max jobs simultanés par worker
    job_timeout = 120    # timeout 2 min par job
    keep_result = 3600   # garder résultat 1h dans Redis
    retry_jobs = True
    max_tries = 3        # retry ARQ si crash du worker
