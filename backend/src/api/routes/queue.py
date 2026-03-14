"""
Queue Status API — HuntZen
============================
Endpoint universel de polling pour tous les jobs async.
Supporte les jobs ARQ (remplace la queue custom Redis).
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Header

from src.utils.queue import get_queue_stats

router = APIRouter()


@router.get("/status/{job_id}")
async def get_status(
    job_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Statut d'un job ARQ.

    Réponses possibles :
    - `queued`     → {status}
    - `processing` → {status}
    - `completed`  → {status, result}
    - `failed`     → {status, error}
    """
    try:
        from arq.jobs import Job
        from arq import create_pool
        from src.workers.settings import _get_redis_settings

        pool = await create_pool(_get_redis_settings())
        job = Job(job_id, pool)
        info = await job.info()

        if info is None:
            raise HTTPException(status_code=404, detail="Job not found or expired")

        if info.success is True:
            return {"status": "completed", "result": info.result}
        elif info.success is False:
            return {"status": "failed", "error": str(info.result)}
        elif info.start_time is not None:
            return {"status": "processing"}
        else:
            return {"status": "queued"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Queue error: {e}")


@router.get("/all-stats")
async def all_stats():
    """
    Stats en temps réel de toutes les queues.

    Utile pour afficher "X personnes en attente" côté frontend.
    """
    from src.utils.cache import get_redis
    stats = await get_queue_stats()

    # Ajouter le compteur global Groq active (debug)
    try:
        redis = await get_redis()
        if redis:
            val = await redis.get("groq:active_coach")
            stats["groq_active_coach"] = int(val) if val else 0
        else:
            stats["groq_active_coach"] = None  # Redis indisponible
    except Exception as e:
        stats["groq_active_coach"] = f"error:{e}"

    return stats
