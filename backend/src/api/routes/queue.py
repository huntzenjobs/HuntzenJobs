"""
Queue Status API — HuntZen
============================
Endpoint universel de polling pour tous les jobs async.
Supporte les jobs ARQ (remplace la queue custom Redis).
"""


from fastapi import APIRouter, Header, HTTPException

from src.utils.cache import get_redis

router = APIRouter()


@router.get("/status/{job_id}")
async def get_status(
    job_id: str,
    authorization: str | None = Header(None),
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
        from arq import create_pool
        from arq.jobs import Job

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
