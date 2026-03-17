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
    """Parse REDIS_URL pour ARQ (Railway Redis réseau interne)."""
    from urllib.parse import urlparse
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
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
