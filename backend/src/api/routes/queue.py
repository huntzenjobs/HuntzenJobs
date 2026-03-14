"""
Queue Status API — HuntZen
============================
Endpoint universel de polling pour tous les jobs async.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Header

from src.utils.queue import get_job_status, get_queue_stats

router = APIRouter()


@router.get("/status/{job_id}")
async def get_status(
    job_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Statut d'un job en queue.

    Réponses possibles :
    - `queued`     → {status, position, eta_seconds}
    - `processing` → {status, started_at}
    - `completed`  → {status, result, completed_at}
    - `failed`     → {status, result: {error}, completed_at}
    """
    status = await get_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return status


@router.get("/all-stats")
async def all_stats():
    """
    Stats en temps réel de toutes les queues.

    Utile pour afficher "X personnes en attente" côté frontend.
    """
    return await get_queue_stats()
