"""
ARQ Worker Settings — HuntZen
Configuration des workers ARQ pour Railway.

Lancement sur Railway (service séparé, même repo) :
    Commande de démarrage : python -m arq src.workers.settings.WorkerSettings
    Répertoire de travail  : backend/
"""
import os
from urllib.parse import unquote, urlparse

from arq import func
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


def _redis_settings_from_url(url: str) -> RedisSettings:
    """Convertit une URL Redis Railway en configuration ARQ."""
    parsed = urlparse(url)
    database = int(parsed.path.lstrip("/") or "0")
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=database,
        username=unquote(parsed.username) if parsed.username else None,
        password=unquote(parsed.password) if parsed.password else None,
        ssl=parsed.scheme == "rediss",
    )


def _get_redis_settings() -> RedisSettings:
    """Parse le Redis ARQ dédié, avec repli local/legacy sur REDIS_URL."""
    url = os.getenv("ARQ_REDIS_URL") or os.getenv(
        "REDIS_URL",
        "redis://localhost:6379",
    )
    return _redis_settings_from_url(url)


class WorkerSettings:
    functions = [
        func(coach_task, max_tries=30),
        func(assistant_task, max_tries=30),
        func(cv_adapt_task, max_tries=30),
        func(cover_letter_task, max_tries=30),
        notify_expiring_plans,
        expat_refresh_task,
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = _get_redis_settings()
    # Les tâches IA sont déjà limitées à cinq appels Groq concurrents dans tasks.py.
    # Réserver davantage de jobs ne crée pas de débit supplémentaire et épuise Redis.
    max_jobs = 5
    job_timeout = 120    # timeout 2 min par job
    keep_result = 3600   # garder résultat 1h dans Redis
    retry_jobs = True
    # Valeur par défaut pour les tâches non enveloppées par func(...).
    max_tries = 3
