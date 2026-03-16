"""
Career Coach API Routes
========================
Endpoints for AI career coaching.

Queue mode : si plus de COACH_SYNC_THRESHOLD requêtes Groq simultanées,
la requête est mise en queue Redis et le client reçoit un job_id pour polling.
En dessous du seuil, traitement synchrone immédiat (UX optimale).
"""

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, status, Request, Depends
from typing import Union

# Seuil global (toutes replicas confondues) → au-dessus : queue Redis
COACH_SYNC_THRESHOLD = 12  # max 12 Groq simultanés TOTAL (cross-replicas via Redis)
_groq_semaphore = asyncio.Semaphore(20)  # garde-fou local par worker

# Clé Redis pour le compteur global cross-replicas
_GROQ_ACTIVE_KEY = "groq:active_coach"
_GROQ_ACTIVE_TTL = 120  # expire 2min (safety en cas de crash)
_ARQ_QUEUE_KEY = "arq:queue"
_ARQ_QUEUE_MAX_LENGTH = 2000
_RETRY_AFTER_SECONDS = 8


async def _incr_active() -> int:
    """Incrémente le compteur Redis, retourne la nouvelle valeur."""
    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        return 0  # Si Redis indisponible → pas de limite
    count = await redis.incr(_GROQ_ACTIVE_KEY)
    await redis.expire(_GROQ_ACTIVE_KEY, _GROQ_ACTIVE_TTL)
    return count


async def _decr_active() -> None:
    """Décrémente le compteur Redis (jamais en dessous de 0)."""
    from src.utils.cache import get_redis
    redis = await get_redis()
    if redis:
        val = await redis.decr(_GROQ_ACTIVE_KEY)
        if val < 0:
            await redis.set(_GROQ_ACTIVE_KEY, 0)


async def _get_arq_queue_depth() -> int:
    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        return -1
    depth = await redis.llen(_ARQ_QUEUE_KEY)
    return int(depth)


def _busy_exception(reason: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=reason,
        headers={"Retry-After": str(_RETRY_AFTER_SECONDS)},
    )

from arq import create_pool

from src.api.deps import (
    CoachAgentDep,
    get_session_history,
    update_session_history,
    clear_session,
    get_current_user,
)
from src.api.middleware import limiter
from src.models.schemas import CoachRequest, CoachResponse
from pydantic import BaseModel, Field
from structlog import get_logger

# Pool ARQ (lazy init, réutilisé entre les requêtes)
_arq_pool = None


async def _get_arq_pool():
    """Retourne le pool ARQ, l'initialise si besoin."""
    global _arq_pool
    if _arq_pool is None:
        try:
            from src.workers.settings import _get_redis_settings
            _arq_pool = await create_pool(_get_redis_settings())
        except Exception as e:
            logger_init = get_logger(__name__)
            logger_init.warning(f"[coach] ARQ pool init failed: {e}")
            _arq_pool = None
    return _arq_pool

logger = get_logger(__name__)

# Pydantic models for sync-time endpoint
class CoachTimeSyncRequest(BaseModel):
    seconds_used: int = Field(..., ge=0, description="Number of seconds used in this sync period")


class CoachTimeSyncResponse(BaseModel):
    success: bool
    coach_quota: dict

router = APIRouter()


@router.post("/chat")
@limiter.limit("30/minute")  # Rate limit: 30 messages per minute per IP
async def coach_chat(
    request: Request,  # Required for rate limiting
    data: CoachRequest,
    agent: CoachAgentDep,
):
    """
    Chat with the Career Coach AI.

    Mode synchrone (UX immédiate) si la charge est faible.
    Mode queue (job_id + polling) si Groq est saturé.

    Réponse synchrone : CoachResponse standard
    Réponse queue     : {"queued": true, "job_id": "...", "position": N, "estimated_wait_seconds": N}
    """
    # Compteur global Redis cross-replicas : INCR atomique
    try:
        active = await _incr_active()
    except Exception:
        active = 0  # Redis down → pas de quota, fallback sync

    if active > COACH_SYNC_THRESHOLD:
        # Trop de Groq simultanés → décrémenter et déléguer à ARQ
        await _decr_active()

        queue_depth = await _get_arq_queue_depth()
        if queue_depth >= _ARQ_QUEUE_MAX_LENGTH:
            raise _busy_exception("Service temporairement surchargé. Réessayez dans quelques secondes.")

        pool = await _get_arq_pool()
        if not pool:
            logger.warning("[coach/chat] ARQ pool unavailable — rejecting to protect API")
            raise _busy_exception("File d'attente indisponible. Réessayez dans quelques secondes.")

        try:
            job = await pool.enqueue_job(
                "coach_task",
                message=data.message,
                session_id=data.session_id,
                language=data.language,
            )
            estimated_wait = max(active, queue_depth if queue_depth > 0 else active) * 8
            logger.info(
                f"[coach/chat] ARQ queued — active_global={active} "
                f"queue_depth={queue_depth} job={job.job_id} eta={estimated_wait}s"
            )
            return {
                "queued": True,
                "job_id": job.job_id,
                "estimated_wait_seconds": estimated_wait,
            }
        except Exception as e:
            logger.warning(f"[coach/chat] ARQ enqueue failed ({e}) — rejecting to protect API")
            raise _busy_exception("Service temporairement surchargé. Réessayez dans quelques secondes.")

    # Mode synchrone
    history = get_session_history(data.session_id)
    try:
        async with _groq_semaphore:
            result = await agent.run(
                message=data.message,
                history=history,
                language=data.language,
                deep_analysis=True,
            )
    except Exception as exc:
        # Groq rate limit épuisé sur toutes les clés → 429 (pas 500)
        exc_str = str(exc).lower()
        if "rate limit" in exc_str or "429" in exc_str or "ratelimit" in exc_str.replace(" ", ""):
            logger.warning("[coach/chat] Groq rate limit global atteint — retourner 429")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Service IA temporairement saturé. Réessayez dans quelques secondes.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur IA inattendue : {str(exc)[:200]}",
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Unknown error"),
        )

    update_session_history(
        data.session_id,
        data.message,
        result["response"],
    )

    return CoachResponse(
        success=True,
        response=result["response"],
        language=result.get("language", data.language),
        training_suggestions=result.get("training_suggestions", []),
        career_insights=result.get("career_insights", {}),
    )


@router.post("/training-recommendations")
async def get_training_recommendations(
    agent: CoachAgentDep,
    domain: str,
    level: str = "intermediate",
    budget: str = "mixed",
):
    """
    Get targeted training recommendations for a domain.
    
    Args:
        domain: Career domain (data, dev, security, cloud, etc.)
        level: Current level (beginner, intermediate, advanced)
        budget: Budget constraint (free, paid, mixed)
    """
    recommendations = await agent.get_training_recommendations(
        domain=domain,
        current_level=level,
        budget=budget,
    )
    
    return {
        "success": True,
        "domain": domain,
        "level": level,
        "recommendations": recommendations,
    }


@router.post("/career-plan")
async def generate_career_plan(
    agent: CoachAgentDep,
    current_role: str,
    target_role: str,
    years: int = 5,
):
    """
    Generate a career progression plan.
    
    Args:
        current_role: Current job title
        target_role: Target job title
        years: Planning horizon in years
    """
    plan = await agent.plan_career_path(
        current_role=current_role,
        target_role=target_role,
        years=years,
    )
    
    return {
        "success": True,
        "current_role": current_role,
        "target_role": target_role,
        "years": years,
        "plan": plan,
    }


@router.post("/new-session")
async def create_session():
    """Create a new chat session."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id}


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Clear a chat session."""
    clear_session(session_id)
    return {"success": True, "message": "Session cleared"}


@router.post("/sync-time", response_model=CoachTimeSyncResponse)
async def sync_coach_time(
    data: CoachTimeSyncRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Sync coach time usage from frontend to backend.

    Called periodically (every 2 minutes) during active coach sessions
    to ensure time usage is tracked even if browser crashes or closes.

    This prevents users from losing quota tracking if their session
    ends unexpectedly.

    Args:
        data: Contains seconds_used in this sync period
        current_user: Authenticated user from JWT token

    Returns:
        Success status and updated coach quota information

    Raises:
        HTTPException: If sync fails or user not authenticated
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        if data.seconds_used < 0:
            raise HTTPException(status_code=400, detail="Invalid time value")

        logger.info(f"Syncing coach time for user {user_id}: {data.seconds_used}s")

        # Import quota functions
        try:
            from app.quota import increment_user_usage, get_user_quota_status
        except ImportError:
            raise HTTPException(status_code=500, detail="Quota module not available")

        # Increment usage in database
        success = await increment_user_usage(user_id, "coach", data.seconds_used)

        if not success:
            logger.error(f"Failed to increment coach usage for user {user_id}")
            raise HTTPException(status_code=500, detail="Failed to sync time")

        # Get updated quota status
        quota_status = await get_user_quota_status(user_id)
        coach_quota = quota_status.get("coach", {})

        logger.info(f"Coach time synced successfully for user {user_id}: {data.seconds_used}s")

        return {
            "success": True,
            "coach_quota": coach_quota
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Coach time sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
