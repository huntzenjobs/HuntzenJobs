"""
Redis Queue Universel — HuntZen
================================
Gestion centralisée de toutes les tâches async à fort trafic.

Features :
- LPUSH/BRPOP FIFO queue par type de tâche
- Position en queue en temps réel
- ETA estimé basé sur le temps moyen observé
- Résultats stockés dans Redis hash (TTL 1h)
- Workers asyncio multi-queues (lancés au lifespan)
"""

import asyncio
import json
import time
import uuid
from typing import Any, Optional

from src.utils.cache import get_redis
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Configuration des queues : clé Redis, ETA estimé, workers max
QUEUES: dict[str, dict] = {
    "coach":        {"key": "q:coach",        "eta_seconds": 8,  "max_workers": 20},
    "cv_adapt":     {"key": "q:cv_adapt",     "eta_seconds": 15, "max_workers": 10},
    "cover_letter": {"key": "q:cover_letter", "eta_seconds": 10, "max_workers": 10},
    "cv_analysis":  {"key": "q:cv_analysis",  "eta_seconds": 40, "max_workers": 5},
    "assistant":    {"key": "q:assistant",    "eta_seconds": 8,  "max_workers": 15},
}

RESULT_TTL = 3600  # résultats conservés 1h


async def enqueue(queue_name: str, payload: dict) -> dict:
    """
    Ajoute une tâche en queue.
    Retourne {job_id, position, estimated_wait_seconds}.
    """
    redis = await get_redis()
    if not redis:
        raise RuntimeError("Redis unavailable — cannot enqueue")

    job_id = str(uuid.uuid4())
    config = QUEUES[queue_name]
    job_data = {
        "job_id": job_id,
        "queue": queue_name,
        "payload": payload,
        "enqueued_at": time.time(),
    }

    await redis.lpush(config["key"], json.dumps(job_data))
    position = await redis.llen(config["key"])
    eta = position * config["eta_seconds"]

    # Statut initial
    await redis.setex(
        f"job:{job_id}",
        RESULT_TTL,
        json.dumps({"status": "queued", "position": position, "eta_seconds": eta}),
    )

    logger.info(f"[queue] Enqueued {queue_name} job={job_id} pos={position} eta={eta}s")
    return {"job_id": job_id, "position": position, "estimated_wait_seconds": eta}


async def get_job_status(job_id: str) -> Optional[dict]:
    """Retourne le statut (et résultat si completed) d'un job."""
    redis = await get_redis()
    if not redis:
        return None
    data = await redis.get(f"job:{job_id}")
    return json.loads(data) if data else None


async def set_job_result(job_id: str, result: Any, status: str = "completed") -> None:
    """Enregistre le résultat d'un job terminé (success ou failed)."""
    redis = await get_redis()
    if not redis:
        return
    await redis.setex(
        f"job:{job_id}",
        RESULT_TTL,
        json.dumps({"status": status, "result": result, "completed_at": time.time()}),
    )


async def get_queue_lengths() -> dict[str, int]:
    """Retourne la longueur actuelle de chaque queue."""
    redis = await get_redis()
    if not redis:
        return {name: 0 for name in QUEUES}
    result = {}
    for name, config in QUEUES.items():
        try:
            result[name] = await redis.llen(config["key"])
        except Exception:
            result[name] = 0
    return result


async def get_queue_stats() -> dict:
    """Stats complètes pour le endpoint /api/queue/all-stats."""
    lengths = await get_queue_lengths()
    return {
        name: {
            "length": lengths[name],
            "eta_seconds": lengths[name] * QUEUES[name]["eta_seconds"],
            "max_workers": QUEUES[name]["max_workers"],
        }
        for name in QUEUES
    }
