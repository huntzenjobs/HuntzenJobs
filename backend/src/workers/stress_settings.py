"""
Stress Test Worker Settings — HuntZen
Worker ARQ dédié, queue isolée pour ne pas impacter les jobs users.

Lancement :
    python -m arq src.workers.stress_settings.StressWorkerSettings
"""
import os

from arq.connections import RedisSettings

from src.workers.stress_worker import stress_test_task


def _get_redis_settings() -> RedisSettings:
    from urllib.parse import urlparse
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
    )


class StressWorkerSettings:
    functions = [stress_test_task]
    redis_settings = _get_redis_settings()
    queue_name = "stress_test"
    max_jobs = 1           # 1 seul stress test à la fois
    job_timeout = 600      # max 10 min
    keep_result = 7200     # garder résultat 2h
    retry_jobs = False     # pas de retry automatique pour les stress tests
