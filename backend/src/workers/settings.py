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
    coach_task,
    assistant_task,
    cv_adapt_task,
    cover_letter_task,
    branding_task,
    startup,
    shutdown,
)

QUEUE_COACH = "arq:coach"
QUEUE_ASSISTANT = "arq:assistant"
QUEUE_BRANDING = "arq:branding"
QUEUE_CV_ADAPT = "arq:cv_adapt"
QUEUE_COVER_LETTER = "arq:cover_letter"


def _get_redis_settings() -> RedisSettings:
    """Parse Redis URL for ARQ with safe env precedence.

    Precedence:
    1) REDIS_URL (explicit runtime override)
    2) UPSTASH_REDIS_URL (legacy/env compatibility)
    3) Sensible fallback:
       - inside Docker: redis://redis:6379
       - local host: redis://localhost:6379
    """
    from urllib.parse import urlparse

    url = os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL")
    if not url:
        in_docker = os.path.exists("/.dockerenv")
        url = "redis://redis:6379" if in_docker else "redis://localhost:6379"

    parsed = urlparse(url)

    if parsed.scheme not in {"redis", "rediss"}:
        parsed = urlparse(f"redis://{url}")

    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        ssl=parsed.scheme == "rediss",
    )


class _BaseWorkerSettings:
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = _get_redis_settings()
    max_jobs = 150
    job_timeout = 120    # timeout 2 min par job
    keep_result = 3600   # garder résultat 1h dans Redis
    retry_jobs = True
    max_tries = 3        # retry ARQ si crash du worker


class CoachWorkerSettings(_BaseWorkerSettings):
    functions = [coach_task]
    queue_name = QUEUE_COACH
    max_jobs = 120


class AssistantWorkerSettings(_BaseWorkerSettings):
    functions = [assistant_task]
    queue_name = QUEUE_ASSISTANT
    max_jobs = 200


class BrandingWorkerSettings(_BaseWorkerSettings):
    functions = [branding_task]
    queue_name = QUEUE_BRANDING
    max_jobs = 80


class CVAdaptWorkerSettings(_BaseWorkerSettings):
    functions = [cv_adapt_task]
    queue_name = QUEUE_CV_ADAPT
    max_jobs = 100


class CoverLetterWorkerSettings(_BaseWorkerSettings):
    functions = [cover_letter_task]
    queue_name = QUEUE_COVER_LETTER
    max_jobs = 80


# Legacy class name kept for compatibility (uses assistant queue as default)
class WorkerSettings(AssistantWorkerSettings):
    pass
