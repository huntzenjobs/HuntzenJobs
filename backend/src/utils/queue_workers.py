"""
Queue Workers asyncio — HuntZen
================================
Workers de fond qui consomment les Redis queues et appellent
les agents appropriés (Groq / Modal / etc.).

Lancés au startup FastAPI via lifespan.
"""

import asyncio
import json
import time
from typing import Callable

from src.utils.queue import QUEUES, get_redis, set_job_result
from src.utils.logger import get_logger

logger = get_logger(__name__)


# ─── Processors par type de queue ────────────────────────────────────────────


async def _process_coach(payload: dict) -> dict:
    """Appelle CareerCoachAgent depuis le worker."""
    from src.api.deps import get_coach_agent, get_session_history, update_session_history

    agent = get_coach_agent()
    history = get_session_history(payload.get("session_id", "queue-worker"))

    result = await agent.run(
        message=payload["message"],
        history=history,
        language=payload.get("language", "fr"),
        deep_analysis=True,
    )

    if result.get("success"):
        update_session_history(
            payload.get("session_id", "queue-worker"),
            payload["message"],
            result["response"],
        )

    return result


_PROCESSORS: dict[str, Callable] = {
    "coach": _process_coach,
    # assistant, cv_adapt, cover_letter, cv_analysis : à ajouter progressivement
}


# ─── Worker loop ──────────────────────────────────────────────────────────────


async def _worker(queue_name: str, worker_id: int) -> None:
    """
    Worker infini qui BRPOP depuis une Redis queue.
    S'arrête proprement si la tâche est annulée (shutdown).
    """
    redis = await get_redis()
    if not redis:
        logger.warning(f"[worker:{queue_name}:{worker_id}] Redis unavailable — worker exiting")
        return

    q_key = QUEUES[queue_name]["key"]
    process_fn = _PROCESSORS.get(queue_name)
    if not process_fn:
        logger.warning(f"[worker:{queue_name}:{worker_id}] No processor defined — exiting")
        return

    logger.info(f"[worker:{queue_name}:{worker_id}] Started")

    while True:
        job_id = None
        try:
            # BRPOP avec timeout=2s pour rester non-bloquant (asyncio-friendly)
            item = await redis.brpop(q_key, timeout=2)
            if not item:
                continue  # timeout → retry

            _, raw = item
            job = json.loads(raw)
            job_id = job["job_id"]

            # Marquer en cours
            await redis.setex(
                f"job:{job_id}",
                3600,
                json.dumps({"status": "processing", "started_at": time.time()}),
            )

            # Exécuter la tâche
            result = await process_fn(job["payload"])
            await set_job_result(job_id, result, "completed")
            logger.debug(f"[worker:{queue_name}:{worker_id}] job={job_id} completed")

        except asyncio.CancelledError:
            logger.info(f"[worker:{queue_name}:{worker_id}] Cancelled — shutting down")
            return

        except Exception as e:
            logger.error(f"[worker:{queue_name}:{worker_id}] job={job_id} failed: {e}")
            if job_id:
                await set_job_result(job_id, {"error": str(e)}, "failed")
            await asyncio.sleep(1)


# ─── Startup / Shutdown ───────────────────────────────────────────────────────

# Workers par queue : limité à 5 par process (Railway = 1 process multi-worker uvicorn)
WORKERS_PER_QUEUE = {
    "coach": 5,
}

_worker_tasks: list[asyncio.Task] = []


async def start_workers(_app=None) -> None:
    """
    Démarre tous les workers asyncio au startup FastAPI.
    Appeler depuis le lifespan (l'argument app est optionnel).
    """
    global _worker_tasks

    redis = await get_redis()
    if not redis:
        logger.warning("[queue_workers] Redis unavailable — workers not started")
        return

    for queue_name, n_workers in WORKERS_PER_QUEUE.items():
        if queue_name not in _PROCESSORS:
            continue
        for i in range(n_workers):
            task = asyncio.create_task(_worker(queue_name, i + 1))
            _worker_tasks.append(task)

    logger.info(f"[queue_workers] Started {len(_worker_tasks)} workers")


async def stop_workers() -> None:
    """Annule proprement tous les workers au shutdown."""
    global _worker_tasks
    for task in _worker_tasks:
        task.cancel()
    if _worker_tasks:
        await asyncio.gather(*_worker_tasks, return_exceptions=True)
    _worker_tasks.clear()
    logger.info("[queue_workers] All workers stopped")
