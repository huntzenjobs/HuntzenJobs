"""
Queue Status API — HuntZen
============================
Endpoint universel de polling pour tous les jobs async.
Supporte les jobs ARQ (remplace la queue custom Redis).
"""

import asyncio

from fastapi import APIRouter, HTTPException

from src.api.deps import CurrentUserDep
from src.utils.cache import get_redis
from src.utils.request_dedup import get_job_owner

router = APIRouter()
_arq_pool = None
_arq_pool_lock = asyncio.Lock()


async def _get_arq_pool():
    """Réutilise un pool ARQ unique pour éviter une connexion Redis par polling."""
    global _arq_pool
    if _arq_pool is None:
        async with _arq_pool_lock:
            if _arq_pool is None:
                from arq import create_pool

                from src.workers.settings import _get_redis_settings

                _arq_pool = await create_pool(_get_redis_settings())
    return _arq_pool


@router.get("/status/{job_id}")
async def get_status(
    job_id: str,
    current_user: CurrentUserDep,
):
    """
    Statut d'un job ARQ.

    Réponses possibles :
    - `queued`     → {status}
    - `processing` → {status}
    - `completed`  → {status, result}
    - `failed`     → {status, error}
    """
    owner_id = await get_job_owner(job_id)
    if owner_id is None or owner_id != current_user.get("id"):
        # Même réponse pour un job absent ou appartenant à un autre compte.
        raise HTTPException(status_code=404, detail="Job not found or expired")

    try:
        from arq.jobs import Job, JobStatus

        pool = await _get_arq_pool()
        job = Job(job_id, pool)
        job_status = await job.status()

        if job_status == JobStatus.not_found:
            raise HTTPException(status_code=404, detail="Job not found or expired")
        if job_status in {JobStatus.queued, JobStatus.deferred}:
            return {"status": "queued"}
        if job_status == JobStatus.in_progress:
            return {"status": "processing"}

        info = await job.result_info()
        if info is None:
            return {"status": "processing"}
        if info.success is True:
            return {"status": "completed", "result": info.result}
        return {"status": "failed", "error": str(info.result)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Queue error: {e}") from None


@router.get("/all-stats")
async def all_stats():
    """
    Stats en temps réel des workers actifs (Groq + Modal).
    Utile pour afficher "X personnes en attente" côté frontend.
    """
    try:
        redis = await get_redis()
        if not redis:
            return {"error": "Redis unavailable", "groq_active": {}, "modal_active": {}}

        groq_coach     = await redis.get("groq:active_coach")
        groq_assistant = await redis.get("groq:active_assistant")
        groq_cv_adapt  = await redis.get("groq:active_cv_adapt")
        modal_cv       = await redis.get("modal:active_cv_analysis")

        return {
            "groq_active": {
                "coach":     int(groq_coach) if groq_coach else 0,
                "assistant": int(groq_assistant) if groq_assistant else 0,
                "cv_adapt":  int(groq_cv_adapt) if groq_cv_adapt else 0,
            },
            "modal_active": {
                "cv_analysis": int(modal_cv) if modal_cv else 0,
            },
        }
    except Exception as e:
        return {"error": str(e), "groq_active": {}, "modal_active": {}}
