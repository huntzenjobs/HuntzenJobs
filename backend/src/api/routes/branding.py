"""
Branding Agent API Routes
===========================
Endpoints for AI personal branding assistant (LinkedIn & X).
"""

from typing import Union
import hashlib
import uuid

from arq import create_pool
from fastapi import APIRouter, HTTPException, status, Request

from src.api.deps import (
    BrandingAgentDep,
    get_session_history,
    update_session_history,
    clear_session,
)
from src.api.middleware import limiter
from pydantic import BaseModel, Field
from structlog import get_logger

logger = get_logger(__name__)

router = APIRouter()

_GROQ_ACTIVE_KEY = "groq:active_branding"
_GROQ_ACTIVE_TTL = 120
BRANDING_SYNC_THRESHOLD = 8
_ARQ_QUEUE_KEY = "arq:branding"
_ARQ_QUEUE_MAX_LENGTH = 1500
_RETRY_AFTER_SECONDS = 8
_arq_pool = None


async def _get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        try:
            from src.workers.settings import _get_redis_settings
            _arq_pool = await create_pool(_get_redis_settings())
        except Exception as e:
            logger.warning(f"[branding] ARQ pool init failed: {e}")
            _arq_pool = None
    return _arq_pool


async def _incr_active() -> int:
    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        return 0
    count = await redis.incr(_GROQ_ACTIVE_KEY)
    await redis.expire(_GROQ_ACTIVE_KEY, _GROQ_ACTIVE_TTL)
    return count


async def _decr_active() -> None:
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


class BrandingRequest(BaseModel):
    """Request for branding assistant."""
    message: str = Field(..., min_length=1, max_length=3000, description="User message")
    session_id: str = Field(..., pattern=r"^[a-f0-9\-]{36}$", description="Session UUID")
    language: str = Field(default="fr", description="Response language")
    request_id: str | None = Field(default=None, description="Optional idempotency key for queue deduplication")
    branding_state: dict | None = Field(default=None, description="Current branding profile state")


class BrandingResponse(BaseModel):
    """Response from branding assistant."""
    success: bool
    response: str
    language: str = "fr"
    branding_state: dict | None = None


class QueuedResponse(BaseModel):
    queued: bool = True
    job_id: str
    estimated_wait_seconds: int


@router.post("/chat", response_model=Union[BrandingResponse, QueuedResponse])
@limiter.limit("30/minute")
async def branding_chat(
    request: Request,
    data: BrandingRequest,
    agent: BrandingAgentDep,
):
    """
    Chat with the Personal Branding AI.

    The agent guides users through building their personal brand
    on LinkedIn and X (Twitter) with a conversational state machine:
    1. Onboarding — discover background & goals
    2. Style discovery — find their writing voice
    3. Target audience — who they want to reach
    4. Generation — create personalized content
    """
    try:
        active = await _incr_active()
    except Exception:
        active = 0

    if active > BRANDING_SYNC_THRESHOLD:
        await _decr_active()

        queue_depth = await _get_arq_queue_depth()
        if queue_depth >= _ARQ_QUEUE_MAX_LENGTH:
            raise _busy_exception("Service temporairement surchargé. Réessayez dans quelques secondes.")

        pool = await _get_arq_pool()
        if not pool:
            logger.warning("[branding/chat] ARQ pool unavailable — rejecting to protect API")
            raise _busy_exception("File d'attente indisponible. Réessayez dans quelques secondes.")

        try:
            dedupe_job_id = None
            if data.request_id:
                digest = hashlib.sha1(
                    f"branding:{data.session_id}:{data.request_id}".encode("utf-8")
                ).hexdigest()[:24]
                dedupe_job_id = f"branding:{digest}"

            job = await pool.enqueue_job(
                "branding_task",
                message=data.message,
                session_id=data.session_id,
                language=data.language,
                branding_state=data.branding_state,
                _queue_name=_ARQ_QUEUE_KEY,
                _job_id=dedupe_job_id,
            )
            estimated_wait = max(active, queue_depth if queue_depth > 0 else active) * 8
            final_job_id = job.job_id if job else dedupe_job_id
            logger.info(
                f"[branding/chat] ARQ queued — active={active} "
                f"queue_depth={queue_depth} job={final_job_id}"
            )
            return {
                "queued": True,
                "job_id": final_job_id,
                "estimated_wait_seconds": estimated_wait,
            }
        except Exception as e:
            logger.warning(f"[branding/chat] ARQ enqueue failed ({e}) — rejecting to protect API")
            raise _busy_exception("Service temporairement surchargé. Réessayez dans quelques secondes.")

    # Get conversation history
    history = get_session_history(data.session_id)

    # Run agent with branding state
    try:
        result = await agent.run(
            message=data.message,
            history=history,
            language=data.language,
            branding_state=data.branding_state,
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Unknown error"),
        )

    # Update history
    update_session_history(
        data.session_id,
        data.message,
        result["response"],
    )

    return BrandingResponse(
        success=True,
        response=result["response"],
        language=result.get("language", data.language),
        branding_state=result.get("branding_state"),
    )


@router.post("/new-session")
async def create_branding_session():
    """Create a new branding session."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id}


@router.delete("/session/{session_id}")
async def delete_branding_session(session_id: str):
    """Clear a branding session."""
    clear_session(session_id)
    return {"success": True, "message": "Session cleared"}
