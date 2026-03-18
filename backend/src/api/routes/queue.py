"""
Queue Status API — HuntZen
============================
Endpoint universel de polling pour tous les jobs async.
Supporte les jobs ARQ (remplace la queue custom Redis).
"""

import asyncio
import json
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from src.utils.cache import get_redis


router = APIRouter()


async def _queue_length(redis, key: str) -> int:
    key_type = await redis.type(key)
    if isinstance(key_type, bytes):
        key_type = key_type.decode("utf-8")

    if key_type == "zset":
        return int(await redis.zcard(key))
    if key_type == "list":
        return int(await redis.llen(key))
    return 0


async def _get_arq_job_state(pool, job_id: str) -> dict:
    from arq.jobs import Job

    job = Job(job_id, pool)
    info = await job.info()

    if info is None:
        return {"status": "not_found", "error": "Job not found or expired"}
    if info.success is True:
        return {"status": "completed", "result": info.result}
    if info.success is False:
        return {"status": "failed", "error": str(info.result)}
    if info.start_time is not None:
        return {"status": "processing"}
    return {"status": "queued"}


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
        from arq import create_pool
        from src.workers.settings import _get_redis_settings

        pool = await create_pool(_get_redis_settings())
        state = await _get_arq_job_state(pool, job_id)
        if state["status"] == "not_found":
            raise HTTPException(status_code=404, detail="Job not found or expired")
        return state
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Queue error: {e}")
    finally:
        try:
            await pool.close()
        except Exception:
            pass


@router.get("/stream/{job_id}")
async def stream_status(
    job_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    SSE stream for ARQ job status updates.

    Events:
    - `update` (queued/processing)
    - `completed`
    - `failed`
    - `not_found`
    - `timeout`
    - `close`
    """
    del authorization

    try:
        from arq import create_pool
        from src.workers.settings import _get_redis_settings

        pool = await create_pool(_get_redis_settings())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Queue stream init error: {e}")

    async def event_stream():
        deadline = time.monotonic() + 125
        last_status = None

        try:
            while time.monotonic() < deadline:
                state = await _get_arq_job_state(pool, job_id)
                status = state.get("status", "queued")

                if status != last_status or status in ("completed", "failed", "not_found"):
                    event_name = "update" if status in ("queued", "processing") else status
                    payload = json.dumps(state, ensure_ascii=False)
                    yield f"event: {event_name}\ndata: {payload}\n\n"
                    last_status = status

                if status in ("completed", "failed", "not_found"):
                    break

                await asyncio.sleep(2)
            else:
                yield "event: timeout\ndata: {\"status\":\"timeout\"}\n\n"
        except Exception as e:
            payload = json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False)
            yield f"event: failed\ndata: {payload}\n\n"
        finally:
            try:
                await pool.close()
            except Exception:
                pass
            yield "event: close\ndata: {}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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

        queue_lengths = {
            "coach": await _queue_length(redis, "arq:coach"),
            "assistant": await _queue_length(redis, "arq:assistant"),
            "branding": await _queue_length(redis, "arq:branding"),
            "cv_adapt": await _queue_length(redis, "arq:cv_adapt"),
            "cover_letter": await _queue_length(redis, "arq:cover_letter"),
        }

        return {
            "groq_active": {
                "coach":     int(groq_coach) if groq_coach else 0,
                "assistant": int(groq_assistant) if groq_assistant else 0,
                "cv_adapt":  int(groq_cv_adapt) if groq_cv_adapt else 0,
            },
            "queue_lengths": queue_lengths,
            "modal_active": {
                "cv_analysis": int(modal_cv) if modal_cv else 0,
            },
        }
    except Exception as e:
        return {"error": str(e), "groq_active": {}, "modal_active": {}}
