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

from arq import create_pool
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from structlog import get_logger

from src.api.deps import (
    CoachAgentDep,
    CurrentUserDep,
    clear_session,
    get_current_user,
    get_session_history,
    get_supabase_client,
    run_sync_io,
    update_session_history,
)
from src.api.middleware import limiter
from src.models.schemas import CoachRequest, CoachResponse
from src.services.stripe import invalidate_user_quota_cache
from src.services.user_events import log_event
from src.utils.ai_capacity import (
    GLOBAL_AI_SYNC_LIMIT,
)
from src.utils.ai_capacity import (
    decrement_global_ai_active as _decr_active,
)
from src.utils.ai_capacity import (
    increment_global_ai_active as _incr_active,
)
from src.utils.request_dedup import (
    RequestEnqueuePendingError,
    build_dedup_request_id,
    clear_job_owner,
    clear_pending_request,
    estimate_arq_wait_seconds,
    register_request,
    store_job_id,
    store_job_owner,
)

# Seuil global (toutes replicas confondues) → au-dessus : queue Redis
COACH_SYNC_THRESHOLD = GLOBAL_AI_SYNC_LIMIT
COACH_SYNC_TIMEOUT_SECONDS = 110
_groq_semaphore = asyncio.Semaphore(20)  # garde-fou local par worker


def _capacity_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Le coach est momentanément très sollicité. Réessayez dans quelques secondes.",
        headers={"Retry-After": "5"},
    )


async def _acquire_active_or_503() -> int:
    try:
        return await _incr_active()
    except Exception as exc:
        get_logger(__name__).warning(
            "[coach] Compteur de charge indisponible",
            error=str(exc),
        )
        raise _capacity_error() from None


def _get_user_cv_context(user_id: str) -> str:
    """Récupère le dernier CV analysé de l'utilisateur pour enrichir le contexte coach."""
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("cv_analyses")
            .select("cv_text, score, recommendations, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )
        if result.data and result.data.get("cv_text"):
            cv_text = result.data["cv_text"][:2000]  # Limiter pour ne pas dépasser le context window
            score = result.data.get("score", "N/A")
            return (
                f"\n\n[CONTEXTE CV DE L'UTILISATEUR — Score ATS: {score}/100]\n"
                f"{cv_text}\n"
                f"[FIN CONTEXTE CV]\n"
            )
    except Exception as e:
        logger.warning(f"[coach] Failed to fetch CV context: {e}")
    return ""


# Pool ARQ (lazy init, réutilisé entre les requêtes)
_arq_pool = None
_arq_pool_lock = asyncio.Lock()


async def _get_arq_pool():
    """Retourne le pool ARQ, l'initialise si besoin."""
    global _arq_pool
    if _arq_pool is None:
        async with _arq_pool_lock:
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


def _check_per_coach_quota(user_id: str, coach_type: str) -> None:
    """Check per-coach message quota. Raises 429 if this coach's messages are exhausted."""
    try:
        supabase = get_supabase_client()
        result = supabase.rpc("check_coach_message_quota", {
            "p_user_id": user_id,
            "p_coach_type": coach_type,
        }).execute()
        if result.data:
            row = result.data[0] if isinstance(result.data, list) else result.data
            if not row.get("has_access", True):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "code": "QUOTA_EXCEEDED",
                        "feature": "assistant_messages",
                        "coach_type": coach_type,
                        "limit": row.get("quota_limit"),
                        "used": row.get("quota_used"),
                        "reset_at": str(row.get("reset_at", "")),
                        "message": "COACH_QUOTA_EXCEEDED"
                    }
                )
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise
        logger.warning(f"[quota] per-coach check failed for {user_id}/{coach_type}, allowing through: {e}")


def _check_coach_quota(user_id: str) -> None:
    """Check coach seconds quota. Raises 429 if exhausted."""
    try:
        supabase = get_supabase_client()
        result = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()
        if not result.data:
            return
        for row in result.data:
            if row.get("feature") == "coach":
                if not row.get("has_access", True):
                    from fastapi import HTTPException, status
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "code": "QUOTA_EXCEEDED",
                            "feature": "coach",
                            "limit": row.get("quota_limit"),
                            "used": row.get("quota_used"),
                            "reset_at": str(row.get("reset_at", "")),
                            "message": "Quota de coaching journalier atteint. Passez à un plan supérieur pour continuer."
                        }
                    )
                return
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise
        logger.warning(f"[quota] coach check failed for {user_id}, allowing through: {e}")


async def _record_coach_message_usage(user_id: str, assistant_type: str) -> None:
    """Incrémente une fois le quota après acceptation effective d'un message coach."""
    try:
        supabase = get_supabase_client()
        await run_sync_io(
            lambda: supabase.rpc("increment_coach_message", {
                "p_user_id": user_id,
                "p_coach_type": assistant_type,
                "p_amount": 1,
            }).execute()
        )
    except Exception as e:
        logger.warning(
            f"[coach/chat] increment_coach_message failed for {user_id}/{assistant_type}: {e}"
        )

    try:
        await invalidate_user_quota_cache(user_id)
    except Exception as e:
        logger.warning(f"[coach/chat] quota cache invalidation failed for {user_id}: {e}")


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
    current_user: CurrentUserDep,
):
    """
    Chat with the Career Coach AI.

    Mode synchrone (UX immédiate) si la charge est faible.
    Mode queue (job_id + polling) si Groq est saturé.

    Réponse synchrone : CoachResponse standard
    Réponse queue     : {"queued": true, "job_id": "...", "position": N, "estimated_wait_seconds": N}
    """
    # ✅ CHECK QUOTA COACH AVANT TRAITEMENT (per-coach)
    user_id_for_quota = current_user.get("id")
    if user_id_for_quota:
        await run_sync_io(
            _check_per_coach_quota,
            user_id_for_quota,
            data.assistant_type,
        )

    # Compteur global Redis cross-replicas : INCR atomique
    active = await _acquire_active_or_503()
    counted = True

    if active > COACH_SYNC_THRESHOLD:
        # Trop de Groq simultanés → décrémenter et déléguer à ARQ
        if counted:
            await _decr_active()
        pool = await _get_arq_pool()
        if pool:
            try:
                req_id = (
                    build_dedup_request_id(
                        "coach",
                        data.assistant_type,
                        user_id_for_quota or "",
                        data.request_id,
                    )
                    if data.request_id
                    else build_dedup_request_id(
                        "coach",
                        data.assistant_type,
                        user_id_for_quota or "",
                        data.session_id,
                        data.message,
                    )
                )
                existing = await register_request(req_id)
                if existing:
                    # Doublon détecté — NE PAS incrémenter le quota (P1-1)
                    estimated_wait = await estimate_arq_wait_seconds(pool, active)
                    logger.info(f"[coach/chat] dedup hit — returning existing job={existing}")
                    return {"queued": True, "job_id": existing, "estimated_wait_seconds": estimated_wait}
                cv_context = await run_sync_io(
                    _get_user_cv_context,
                    user_id_for_quota,
                )
                if not user_id_for_quota:
                    raise RuntimeError("Utilisateur absent pour le job coach")
                job_id = uuid.uuid4().hex
                try:
                    if not await store_job_owner(job_id, user_id_for_quota):
                        raise RuntimeError(
                            "Impossible d'enregistrer le propriétaire du job ARQ"
                        )
                    job = await pool.enqueue_job(
                        "coach_task",
                        _job_id=job_id,
                        message=data.message,
                        session_id=data.session_id,
                        language=data.language,
                        user_id=user_id_for_quota,
                        assistant_type=data.assistant_type,
                        cv_context=cv_context,
                    )
                    if job is None:
                        raise RuntimeError("ARQ n'a pas accepté le job coach")
                    await store_job_id(req_id, job.job_id)
                except Exception:
                    await clear_pending_request(req_id)
                    await clear_job_owner(job_id)
                    raise
                if user_id_for_quota:
                    await _record_coach_message_usage(
                        user_id_for_quota,
                        data.assistant_type,
                    )
                estimated_wait = await estimate_arq_wait_seconds(pool, active)
                logger.info(
                    f"[coach/chat] ARQ queued — active_global={active} "
                    f"job={job.job_id} eta={estimated_wait}s"
                )
                return {
                    "queued": True,
                    "job_id": job.job_id,
                    "estimated_wait_seconds": estimated_wait,
                }
            except RequestEnqueuePendingError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Une requête identique est déjà en cours de mise en file.",
                    headers={"Retry-After": "1"},
                ) from exc
            except Exception as e:
                logger.warning(f"[coach/chat] ARQ enqueue failed: {e}")
        else:
            logger.warning("[coach/chat] ARQ pool unavailable")
        raise _capacity_error()

    # Mode synchrone
    history = await run_sync_io(
        get_session_history,
        data.session_id,
        user_id=user_id_for_quota,
    )

    # Enrichir le message avec le contexte CV de l'utilisateur
    user_id = current_user.get("id")
    cv_context = await run_sync_io(_get_user_cv_context, user_id) if user_id else ""
    enriched_message = f"{data.message}{cv_context}" if cv_context else data.message

    try:
        async with _groq_semaphore:
            result = await asyncio.wait_for(
                agent.run(
                    message=enriched_message,
                    history=history,
                    language=data.language,
                    deep_analysis=True,
                ),
                timeout=COACH_SYNC_TIMEOUT_SECONDS,
            )
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="La réponse du coach a dépassé le délai maximal. Veuillez réessayer.",
        ) from None
    except Exception as exc:
        # Groq rate limit épuisé sur toutes les clés → 429 (pas 500)
        exc_str = str(exc).lower()
        if "rate limit" in exc_str or "429" in exc_str or "ratelimit" in exc_str.replace(" ", ""):
            logger.warning("[coach/chat] Groq rate limit global atteint — retourner 429")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Service IA temporairement saturé. Réessayez dans quelques secondes.",
            ) from None
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur IA inattendue : {str(exc)[:200]}",
        ) from None
    finally:
        if counted:
            await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Unknown error"),
        )

    await run_sync_io(
        update_session_history,
        data.session_id,
        data.message,
        result["response"],
        user_id=user_id,
        assistant_type=data.assistant_type,
    )

    # Incrémenter quota assistant_messages par coach après message réussi
    user_id = current_user.get("id")
    if user_id:
        await _record_coach_message_usage(user_id, data.assistant_type)

    # Tracking événement coach (best-effort)
    prenom = (current_user.get("email", "") or "").split("@")[0].capitalize() or "Un utilisateur"
    user_email = current_user.get("email", "inconnu")
    history = await run_sync_io(get_session_history, data.session_id, user_id=user_id)
    questions_count = len([m for m in history if m.get("role") == "user"])
    await run_sync_io(
        log_event,
        get_supabase_client(),
        event_name="coach_used",
        event_label=f"{prenom} a utilisé le Coach — {questions_count} question(s)",
        category="action",
        user_id=user_id,
        feature="coach",
        severity="info",
        properties={"assistant_type": "coach", "questions_count": questions_count},
    )

    # Notifier l'admin au premier message coach de cet utilisateur
    if questions_count == 1:
        try:
            from src.services.admin_alerts import send_admin_alert
            await send_admin_alert(
                subject=f"Premier message coach : {user_email}",
                body=(
                    f"Utilisateur : {prenom} ({user_email})\n"
                    f"Coach : {data.assistant_type}\n"
                    f"Date : maintenant"
                ),
                severity="info",
                skip_throttle=True,
                category="coach_used",
            )
        except Exception as e:
            logger.warning(f"Admin alert coach_used failed: {e}")

    return CoachResponse(
        success=True,
        response=result["response"],
        language=result.get("language", data.language),
        training_suggestions=result.get("training_suggestions", []),
        career_insights=result.get("career_insights", {}),
    )


@router.post("/training-recommendations")
@limiter.limit("10/minute")
async def get_training_recommendations(
    request: Request,
    agent: CoachAgentDep,
    current_user: CurrentUserDep,
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
@limiter.limit("10/minute")
async def generate_career_plan(
    request: Request,
    agent: CoachAgentDep,
    current_user: CurrentUserDep,
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
async def delete_session(session_id: str, current_user: CurrentUserDep):
    """Clear a chat session."""
    await run_sync_io(clear_session, session_id, user_id=current_user["id"])
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

        # Increment usage via Supabase RPC (source de vérité)
        supabase = get_supabase_client()
        inc_result = supabase.rpc("increment_usage", {
            "p_user_id": user_id,
            "p_feature": "coach",
            "p_amount": data.seconds_used,
        }).execute()

        if not inc_result.data:
            logger.error(f"Failed to increment coach usage for user {user_id}")
            raise HTTPException(status_code=500, detail="Failed to sync time")

        # Get updated quota status
        quota_result = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()
        coach_quota = {}
        for row in (quota_result.data or []):
            if row.get("feature") == "coach":
                coach_quota = {
                    "limit": row.get("quota_limit"),
                    "used": row.get("quota_used"),
                    "remaining": row.get("quota_remaining"),
                    "has_access": row.get("has_access"),
                }
                break

        logger.info(f"Coach time synced successfully for user {user_id}: {data.seconds_used}s")

        # Invalider le cache Redis pour que /api/auth/me retourne les quotas à jour
        await invalidate_user_quota_cache(user_id)

        return {
            "success": True,
            "coach_quota": coach_quota
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Coach time sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}") from None
