"""
Multi-Assistant API Routes
===========================
Unified endpoints for all assistant types (career-coach, job-scout, cv-analyzer, cv-adapter, interview-sim).
Handles routing to the appropriate agent based on assistant_type parameter.
"""

import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager, suppress
from typing import Literal

from arq import create_pool
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field, model_validator

from src.api.deps import (
    BrandingAgentDep,
    CoachAgentDep,
    CurrentUserDep,
    CVAdapterAgentDep,
    CVAgentDep,
    InterviewSimAgentDep,
    ScoutConversationalAgentDep,
    _require_feature_flag_sync,
    check_assistant_quota,
    clear_session,
    get_session_history,
    increment_assistant_messages,
    run_sync_io,
    update_session_history,
)
from src.api.middleware import limiter
from src.services.cv_chat_extractor import extract_cv_structured
from src.services.modal_pdf_extractor import extract_text_via_modal, is_modal_pdf_enabled
from src.services.stripe import invalidate_user_quota_cache
from src.utils.ai_capacity import (
    CV_EXTRACTION_SYNC_LIMIT,
    GLOBAL_AI_SYNC_LIMIT,
)
from src.utils.ai_capacity import (
    decrement_cv_extraction_active as _decr_extraction_active,
)
from src.utils.ai_capacity import (
    decrement_global_ai_active as _decr_active,
)
from src.utils.ai_capacity import (
    increment_cv_extraction_active as _incr_extraction_active,
)
from src.utils.ai_capacity import (
    increment_global_ai_active as _incr_active,
)
from src.utils.ai_capacity import (
    renew_cv_extraction_active as _renew_extraction_active,
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
from src.utils.uploads import read_upload_limited, run_extraction_sync

logger = logging.getLogger(__name__)

# ── ARQ queue — soupape de sécurité anti-429 Groq ────────────────────────────
_arq_pool = None
_arq_pool_lock = asyncio.Lock()
ASSISTANT_SYNC_THRESHOLD = GLOBAL_AI_SYNC_LIMIT
CV_EXTRACTION_SYNC_THRESHOLD = CV_EXTRACTION_SYNC_LIMIT
ASSISTANT_SYNC_TIMEOUT_SECONDS = 110


async def _get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        async with _arq_pool_lock:
            if _arq_pool is None:
                try:
                    from src.workers.settings import _get_redis_settings

                    _arq_pool = await create_pool(_get_redis_settings())
                except Exception as e:
                    logger.warning(f"[assistant] ARQ pool init failed: {e}")
                    _arq_pool = None
    return _arq_pool


def _capacity_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Le service IA est momentanément très sollicité. Réessayez dans quelques secondes.",
        headers={"Retry-After": "5"},
    )


async def _acquire_active_or_503(scope: str) -> int:
    try:
        return await _incr_active()
    except Exception as exc:
        logger.warning("[%s] Compteur de charge indisponible: %s", scope, exc)
        raise _capacity_error() from None


@asynccontextmanager
async def _cv_extraction_slot():
    """Borne la mémoire et les appels Modal/pypdf du partage de CV."""
    try:
        active = await _incr_extraction_active()
    except Exception as exc:
        logger.warning("[attach-cv] Compteur d'extraction indisponible: %s", exc)
        raise _capacity_error() from None

    if active > CV_EXTRACTION_SYNC_THRESHOLD:
        await _decr_extraction_active()
        raise _capacity_error()

    owner_task = asyncio.current_task()
    renewal_errors: list[Exception] = []

    async def keep_lease_alive() -> None:
        try:
            while True:
                await asyncio.sleep(30)
                await _renew_extraction_active()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            renewal_errors.append(exc)
            if owner_task is not None:
                owner_task.cancel()

    heartbeat = asyncio.create_task(keep_lease_alive())
    try:
        yield
        if renewal_errors:
            raise _capacity_error()
    except asyncio.CancelledError:
        if renewal_errors:
            raise _capacity_error() from None
        raise
    finally:
        heartbeat.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat
        await _decr_extraction_active()


async def _run_agent_with_timeout(agent, **kwargs):
    try:
        return await asyncio.wait_for(
            agent.run(**kwargs),
            timeout=ASSISTANT_SYNC_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="La réponse IA a dépassé le délai maximal. Veuillez réessayer.",
        ) from None

async def _dedup_or_enqueue(
    pool,
    task_name: str,
    dedup_assistant_type: str,
    dedup_user_id: str,
    request_id: str | None,
    active: int,
    **task_kwargs,
) -> dict | None:
    """Helper mutualisé : déduplication + enqueue ARQ.

    Retourne le dict de réponse queue si dedup hit ou enqueue réussi, None sinon.
    NE touche JAMAIS au quota — c'est la responsabilité de l'appelant UNIQUEMENT
    lors d'un nouveau job (pas sur dedup hit).
    """
    req_id = (
        build_dedup_request_id(
            "assistant",
            dedup_assistant_type,
            dedup_user_id,
            request_id,
        )
        if request_id
        else build_dedup_request_id(
            "assistant",
            dedup_assistant_type,
            dedup_user_id,
            task_kwargs.get("session_id", ""),
            task_kwargs.get("message", ""),
            task_kwargs.get("cv_text", ""),
            task_kwargs.get("job_description", ""),
        )
    )
    existing = await register_request(req_id)
    if existing:
        # Doublon détecté — NE PAS incrémenter le quota (P1-1)
        logger.info(
            f"[assistant/{dedup_assistant_type}] dedup hit — returning existing job={existing}"
        )
        return {
            "queued": True,
            "job_id": existing,
            "estimated_wait_seconds": await estimate_arq_wait_seconds(pool, active),
        }

    job_id = uuid.uuid4().hex
    try:
        if not await store_job_owner(job_id, dedup_user_id):
            raise RuntimeError("Impossible d'enregistrer le propriétaire du job ARQ")
        job = await pool.enqueue_job(task_name, _job_id=job_id, **task_kwargs)
        if job is None:
            raise RuntimeError("ARQ n'a pas accepté le job assistant")
        await store_job_id(req_id, job.job_id)
    except Exception:
        await clear_pending_request(req_id)
        await clear_job_owner(job_id)
        raise
    return {
        "queued": True,
        "job_id": job.job_id,
        "estimated_wait_seconds": await estimate_arq_wait_seconds(pool, active),
        "_new_job": True,
    }


# ── Prompts de réception du CV par assistant ─────────────────────────────────
# Chaque assistant répond différemment à l'upload d'un CV.
CV_RECEPTION_PROMPTS: dict[str, str] = {
    "cv-analyzer": (
        "L'utilisateur vient de partager son CV. "
        "Fais une analyse ATS approfondie : identifie le score estimé, les points forts, "
        "les axes d'amélioration prioritaires, et les mots-clés manquants. "
        "Sois précis, actionnable et bienveillant. Structure ta réponse avec des sections claires."
    ),
    "cv-adapter": (
        "L'utilisateur vient de partager son CV. "
        "Résume brièvement son profil (poste, expérience, compétences clés), "
        "puis demande-lui l'offre d'emploi ou le type de poste visé pour adapter le CV. "
        "Sois enthousiaste et professionnel."
    ),
    "career-coach": (
        "L'utilisateur vient de partager son CV. "
        "Analyse son parcours professionnel, identifie ses forces et les opportunités d'évolution, "
        "puis engage une conversation de coaching personnalisée. "
        "Pose une question clé sur ses objectifs professionnels."
    ),
    "job-scout": (
        "L'utilisateur vient de partager son CV. "
        "Analyse son profil et suggère 3-5 types de postes qui correspondent à son expérience. "
        "Identifie les secteurs porteurs et les mots-clés à utiliser dans sa recherche d'emploi."
    ),
    "branding": (
        "L'utilisateur vient de partager son CV. "
        "Identifie les éléments les plus forts pour construire son personal branding LinkedIn. "
        "Propose un titre LinkedIn percutant et une accroche de profil basés sur son parcours réel."
    ),
    "interview-sim": (
        "L'utilisateur vient de partager son CV. "
        "Présente-toi comme recruteur, confirme avoir pris connaissance de son profil, "
        "et propose de commencer la simulation d'entretien. "
        "Commence par une question d'entretien typique basée sur son expérience réelle."
    ),
}

router = APIRouter()

# ============================================================================
# Schemas
# ============================================================================

class AssistantRequest(BaseModel):
    """Request for any assistant type."""
    message: str = Field(..., description="User message")
    session_id: str = Field(..., description="Session ID for conversation history")
    assistant_type: Literal[
        "career-coach",
        "job-scout",
        "cv-analyzer",
        "cv-adapter",
        "interview-sim"
    ] = Field(..., description="Type of assistant to use")
    language: str = Field(default="fr", description="Response language (fr/en)")
    request_id: str | None = Field(
        default=None, max_length=128, description="Clé d'idempotence optionnelle pour déduplication ARQ"
    )
    cv_data: dict | None = None
    job_description: str | None = Field(default=None, max_length=30_000)
    job_info: dict | None = None

    @model_validator(mode="after")
    def validate_context_size(self) -> "AssistantRequest":
        for label, payload in (("cv_data", self.cv_data), ("job_info", self.job_info)):
            if payload is None:
                continue
            size = len(json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"))
            if size > 50_000:
                raise ValueError(f"{label} dépasse la taille maximale de 50 Ko")
        return self


def _assistant_context(request: AssistantRequest) -> tuple[str | None, str | None]:
    cv_text = (
        json.dumps(request.cv_data, ensure_ascii=False, default=str)
        if request.cv_data
        else None
    )
    job_parts = [request.job_description] if request.job_description else []
    if request.job_info:
        job_parts.append(json.dumps(request.job_info, ensure_ascii=False, default=str))
    return cv_text, "\n".join(job_parts) or None


def _contextual_message(request: AssistantRequest) -> str:
    cv_text, job_description = _assistant_context(request)
    message = request.message
    if cv_text:
        message += f"\n\n[CV FOURNI]\n{cv_text}\n[FIN DU CV]"
    if job_description:
        message += f"\n\n[OFFRE FOURNIE]\n{job_description}\n[FIN DE L'OFFRE]"
    return message

class AssistantResponse(BaseModel):
    """Response from any assistant type."""
    success: bool
    response: str
    agent: str = Field(description="Which agent handled the request")
    language: str = "fr"
    metadata: dict | None = None


class AssistantQueuedResponse(BaseModel):
    """Réponse différée compatible avec le polling ARQ du frontend."""

    queued: Literal[True]
    job_id: str
    estimated_wait_seconds: int = Field(ge=0)


AssistantRouteResponse = AssistantResponse | AssistantQueuedResponse


# ============================================================================
# Routes
# ============================================================================

@router.post("/job-scout", response_model=AssistantRouteResponse)
async def job_scout_chat(
    request: AssistantRequest,
    agent: ScoutConversationalAgentDep,
    current_user: CurrentUserDep,
):
    """
    Chat with the Job Search expert.

    Provides conversational guidance on job search strategies,
    market insights, and personalized recommendations.
    """
    user_id = current_user["id"]
    await run_sync_io(check_assistant_quota, user_id, "job-scout")

    active = await _acquire_active_or_503("assistant/job-scout")
    counted = True

    if active > ASSISTANT_SYNC_THRESHOLD:
        if counted:
            await _decr_active()
        pool = await _get_arq_pool()
        if pool:
            try:
                result_queue = await _dedup_or_enqueue(
                    pool,
                    "assistant_task",
                    "job-scout",
                    user_id,
                    request.request_id,
                    active,
                    message=request.message,
                    session_id=request.session_id,
                    assistant_type="job-scout",
                    language=request.language,
                    user_id=user_id,
                )
                if result_queue is not None:
                    if result_queue.pop("_new_job", False):
                        # Nouveau job uniquement : incrémenter le quota
                        await run_sync_io(increment_assistant_messages, user_id, "job-scout")
                        await invalidate_user_quota_cache(user_id)
                        logger.info(
                            f"[assistant/job-scout] ARQ queued — active={active} "
                            f"job={result_queue['job_id']}"
                        )
                    return result_queue
            except RequestEnqueuePendingError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Une requête identique est déjà en cours de mise en file.",
                    headers={"Retry-After": "1"},
                ) from exc
            except Exception as e:
                logger.warning(f"[assistant/job-scout] ARQ enqueue failed: {e}")
        raise _capacity_error()

    # Mode synchrone
    history = await run_sync_io(get_session_history, request.session_id, user_id=user_id)
    try:
        result = await _run_agent_with_timeout(
            agent,
            message=request.message,
            history=history,
            language=request.language,
        )
    finally:
        if counted:
            await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Job Scout error"),
        )

    await run_sync_io(increment_assistant_messages, user_id, "job-scout")
    await invalidate_user_quota_cache(user_id)
    await run_sync_io(
        update_session_history,
        request.session_id,
        request.message,
        result["response"],
        user_id=user_id,
        assistant_type="job-scout",
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="job-scout",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/cv-analyzer", response_model=AssistantRouteResponse)
async def cv_analyzer_chat(
    request: AssistantRequest,
    agent: CVAgentDep,
    current_user: CurrentUserDep,
):
    """
    Chat with the CV Analysis expert.

    Provides conversational CV analysis, scoring, and improvement recommendations.
    Can guide users through the CV optimization process step by step.
    """
    user_id = current_user["id"]
    cv_text, _ = _assistant_context(request)
    await run_sync_io(check_assistant_quota, user_id, "cv-analyzer")

    active = await _acquire_active_or_503("assistant/cv-analyzer")
    counted = True

    if active > ASSISTANT_SYNC_THRESHOLD:
        if counted:
            await _decr_active()
        pool = await _get_arq_pool()
        if pool:
            try:
                result_queue = await _dedup_or_enqueue(
                    pool,
                    "assistant_task",
                    "cv-analyzer",
                    user_id,
                    request.request_id,
                    active,
                    message=request.message,
                    session_id=request.session_id,
                    assistant_type="cv-analyzer",
                    language=request.language,
                    user_id=user_id,
                    cv_text=cv_text,
                )
                if result_queue is not None:
                    if result_queue.pop("_new_job", False):
                        await run_sync_io(increment_assistant_messages, user_id, "cv-analyzer")
                        await invalidate_user_quota_cache(user_id)
                        logger.info(
                            f"[assistant/cv-analyzer] ARQ queued — active={active} "
                            f"job={result_queue['job_id']}"
                        )
                    return result_queue
            except RequestEnqueuePendingError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Une requête identique est déjà en cours de mise en file.",
                    headers={"Retry-After": "1"},
                ) from exc
            except Exception as e:
                logger.warning(f"[assistant/cv-analyzer] ARQ enqueue failed: {e}")
        raise _capacity_error()

    # Mode synchrone
    history = await run_sync_io(get_session_history, request.session_id, user_id=user_id)
    try:
        result = await _run_agent_with_timeout(
            agent,
            message=_contextual_message(request),
            history=history,
            language=request.language,
        )
    finally:
        if counted:
            await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV Analyzer error"),
        )

    await run_sync_io(increment_assistant_messages, user_id, "cv-analyzer")
    await invalidate_user_quota_cache(user_id)
    await run_sync_io(
        update_session_history,
        request.session_id,
        request.message,
        result["response"],
        user_id=user_id,
        assistant_type="cv-analyzer",
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="cv-analyzer",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/cv-adapter", response_model=AssistantRouteResponse)
async def cv_adapter_chat(
    request: AssistantRequest,
    agent: CVAdapterAgentDep,
    current_user: CurrentUserDep,
):
    """
    Chat with the CV Adaptation specialist.

    Provides conversational guidance for adapting CVs to specific job offers.
    Guides users through the adaptation process with strategic recommendations.
    """
    user_id = current_user["id"]
    cv_text, contextual_job = _assistant_context(request)
    await run_sync_io(check_assistant_quota, user_id, "cv-adapter")

    active = await _acquire_active_or_503("assistant/cv-adapter")
    counted = True

    if active > ASSISTANT_SYNC_THRESHOLD:
        if counted:
            await _decr_active()
        pool = await _get_arq_pool()
        if pool:
            try:
                result_queue = await _dedup_or_enqueue(
                    pool,
                    "assistant_task",
                    "cv-adapter",
                    user_id,
                    request.request_id,
                    active,
                    message=request.message,
                    session_id=request.session_id,
                    assistant_type="cv-adapter",
                    language=request.language,
                    user_id=user_id,
                    cv_text=cv_text,
                    job_description=contextual_job,
                )
                if result_queue is not None:
                    if result_queue.pop("_new_job", False):
                        await run_sync_io(increment_assistant_messages, user_id, "cv-adapter")
                        await invalidate_user_quota_cache(user_id)
                        logger.info(
                            f"[assistant/cv-adapter] ARQ queued — active={active} "
                            f"job={result_queue['job_id']}"
                        )
                    return result_queue
            except RequestEnqueuePendingError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Une requête identique est déjà en cours de mise en file.",
                    headers={"Retry-After": "1"},
                ) from exc
            except Exception as e:
                logger.warning(f"[assistant/cv-adapter] ARQ enqueue failed: {e}")
        raise _capacity_error()

    # Mode synchrone
    history = await run_sync_io(get_session_history, request.session_id, user_id=user_id)
    try:
        result = await _run_agent_with_timeout(
            agent,
            message=_contextual_message(request),
            history=history,
            language=request.language,
        )
    finally:
        if counted:
            await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV Adapter error"),
        )

    await run_sync_io(increment_assistant_messages, user_id, "cv-adapter")
    await invalidate_user_quota_cache(user_id)
    await run_sync_io(
        update_session_history,
        request.session_id,
        request.message,
        result["response"],
        user_id=user_id,
        assistant_type="cv-adapter",
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="cv-adapter",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/interview-sim", response_model=AssistantRouteResponse)
async def interview_sim_chat(
    request: AssistantRequest,
    agent: InterviewSimAgentDep,
    current_user: CurrentUserDep,
):
    """
    Chat with the Interview Simulation recruiter.

    [PREMIUM FEATURE]
    Provides realistic interview practice with a professional recruiter simulation.
    Includes behavioral questions, technical questions, and constructive feedback.
    """
    user_id = current_user["id"]
    _, contextual_job = _assistant_context(request)
    await run_sync_io(
        _require_feature_flag_sync,
        user_id,
        "interview_sim",
        "Le simulateur d'entretien necessite un plan superieur.",
    )
    await run_sync_io(check_assistant_quota, user_id, "interview-sim")

    active = await _acquire_active_or_503("assistant/interview-sim")
    counted = True

    if active > ASSISTANT_SYNC_THRESHOLD:
        if counted:
            await _decr_active()
        pool = await _get_arq_pool()
        if pool:
            try:
                result_queue = await _dedup_or_enqueue(
                    pool,
                    "assistant_task",
                    "interview-sim",
                    user_id,
                    request.request_id,
                    active,
                    message=request.message,
                    session_id=request.session_id,
                    assistant_type="interview-sim",
                    language=request.language,
                    user_id=user_id,
                    job_description=contextual_job,
                )
                if result_queue is not None:
                    if result_queue.pop("_new_job", False):
                        await run_sync_io(increment_assistant_messages, user_id, "interview-sim")
                        await invalidate_user_quota_cache(user_id)
                        logger.info(
                            f"[assistant/interview-sim] ARQ queued — active={active} "
                            f"job={result_queue['job_id']}"
                        )
                    return result_queue
            except RequestEnqueuePendingError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Une requête identique est déjà en cours de mise en file.",
                    headers={"Retry-After": "1"},
                ) from exc
            except Exception as e:
                logger.warning(f"[assistant/interview-sim] ARQ enqueue failed: {e}")
        raise _capacity_error()

    # Mode synchrone
    history = await run_sync_io(get_session_history, request.session_id, user_id=user_id)
    try:
        result = await _run_agent_with_timeout(
            agent,
            message=_contextual_message(request),
            history=history,
            language=request.language,
        )
    finally:
        if counted:
            await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Interview Simulator error"),
        )

    await run_sync_io(increment_assistant_messages, user_id, "interview-sim")
    await invalidate_user_quota_cache(user_id)
    await run_sync_io(
        update_session_history,
        request.session_id,
        request.message,
        result["response"],
        user_id=user_id,
        assistant_type="interview-sim",
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="interview-sim",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


async def _extract_pdf_text(pdf_bytes: bytes, filename: str) -> str:
    """
    Extrait le texte d'un PDF.
    Essaie Modal/Docling en premier (meilleure qualité), fallback pypdf.
    """
    if is_modal_pdf_enabled():
        try:
            logger.info(f"[attach-cv] Trying Modal extraction for {filename}")
            text = await extract_text_via_modal(pdf_bytes)
            if text and len(text.strip()) >= 100:
                logger.info(f"[attach-cv] Modal OK: {len(text)} chars")
                return text
        except Exception as e:
            logger.warning(f"[attach-cv] Modal failed, fallback to pypdf: {e}")

    try:
        text = await run_extraction_sync(_extract_pdf_text_sync, pdf_bytes)
        if text and len(text) >= 50:
            logger.info(f"[attach-cv] pypdf OK: {len(text)} chars")
            return text
    except Exception as e:
        logger.error(f"[attach-cv] pypdf also failed: {e}")

    raise RuntimeError(
        "Impossible d'extraire le texte du PDF. "
        "Vérifiez que le fichier n'est pas scanné ou protégé par mot de passe."
    )


def _extract_pdf_text_sync(pdf_bytes: bytes) -> str:
    """Parse un PDF borné hors event loop pour le fallback assistant."""
    import io

    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    if len(reader.pages) > 100:
        raise ValueError("Le PDF dépasse la limite de 100 pages")
    chunks: list[str] = []
    total_chars = 0
    for page in reader.pages:
        page_text = page.extract_text() or ""
        chunks.append(page_text)
        total_chars += len(page_text)
        if total_chars > 100_000:
            raise ValueError("Le texte extrait du PDF dépasse 100 000 caractères")
    return "\n".join(chunks).strip()


@router.post("/attach-cv")
@limiter.limit("5/minute")
async def attach_cv_to_chat(
    request: Request,
    coach_agent: CoachAgentDep,
    cv_agent: CVAgentDep,
    cv_adapter_agent: CVAdapterAgentDep,
    scout_agent: ScoutConversationalAgentDep,
    branding_agent: BrandingAgentDep,
    interview_agent: InterviewSimAgentDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="Fichier PDF du CV"),
    assistant_type: Literal[
        "career-coach",
        "job-scout",
        "cv-analyzer",
        "cv-adapter",
        "branding",
        "interview-sim",
    ] = Form(default="career-coach"),
    session_id: str = Form(..., description="Session ID du chat"),
    language: str = Form(default="fr"),
):
    """
    Upload et attache un CV à une session de chat assistant.

    Pipeline:
    1. Validation + extraction texte (Modal/Docling → fallback pypdf)
    2. Extraction structurée rapide via Groq JSON mode (~1s)
    3. Injection du CV dans l'historique de session (Supabase)
    4. Génération d'une première réponse IA contextualisée selon l'assistant actif
    5. Retour: cv_structured + initial_response

    Le CV persiste dans l'historique pour toute la durée de la session —
    les agents le voient naturellement à chaque tour via get_session_history().
    """
    user_id = current_user["id"]

    if assistant_type == "interview-sim":
        await run_sync_io(
            _require_feature_flag_sync,
            user_id,
            "interview_sim",
            "Le simulateur d'entretien necessite un plan superieur.",
        )

    # ── Validation ────────────────────────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les fichiers PDF sont acceptés",
        )

    await run_sync_io(check_assistant_quota, user_id, assistant_type)

    try:
        # ── Étape 1 : Extraction texte ────────────────────────────────────────
        async with _cv_extraction_slot():
            pdf_bytes = await read_upload_limited(file)
            logger.info(
                f"[attach-cv] {file.filename} ({len(pdf_bytes)} bytes), "
                f"assistant={assistant_type}"
            )
            cv_text = await _extract_pdf_text(pdf_bytes, file.filename or "cv.pdf")
        cv_text = cv_text[:100_000]

        # ── Étape 3 : Préparer le message CV pour l'historique ────────────────
        # Formaté pour être lisible par tous les agents dans l'historique.
        cv_message_content = (
            f"[CV PARTAGÉ — {file.filename}]\n\n"
            f"{cv_text}\n\n"
            f"[FIN DU CV]"
        )

        # ── Étape 4 : Générer la première réponse contextuelle ────────────────
        lang_names = {"fr": "French", "en": "English", "es": "Spanish"}
        lang_name = lang_names.get(language, "French")

        reception_context = CV_RECEPTION_PROMPTS.get(
            assistant_type, CV_RECEPTION_PROMPTS["career-coach"]
        )

        # Message synthétique qui déclenche l'analyse du CV par l'agent
        first_message = (
            f"[IMPORTANT: Respond in {lang_name}. {reception_context}]\n\n"
            f"{cv_message_content}"
        )

        # Sélection de l'agent selon l'assistant actif
        agent_map = {
            "cv-analyzer": cv_agent,
            "cv-adapter": cv_adapter_agent,
            "job-scout": scout_agent,
            "branding": branding_agent,
            "interview-sim": interview_agent,
            "career-coach": coach_agent,
        }
        agent = agent_map.get(assistant_type, coach_agent)

        current_history = await run_sync_io(
            get_session_history,
            session_id,
            user_id=user_id,
        )
        active = await _acquire_active_or_503("assistant/attach-cv")
        if active > ASSISTANT_SYNC_THRESHOLD:
            await _decr_active()
            raise _capacity_error()
        try:
            async def run_attach_ai() -> tuple[dict, dict]:
                structured = await extract_cv_structured(cv_text)
                agent_result = await agent.run(
                    message=first_message,
                    history=current_history,
                    language=language,
                )
                return structured, agent_result

            # Le timeout couvre les deux appels Groq et reste inférieur au lease.
            cv_structured, result = await asyncio.wait_for(
                run_attach_ai(),
                timeout=ASSISTANT_SYNC_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="L'analyse du CV a dépassé le délai maximal. Veuillez réessayer.",
            ) from None
        finally:
            await _decr_active()

        if not result.get("success"):
            raise RuntimeError(result.get("error", "Erreur lors de l'analyse du CV"))

        initial_response = result["response"]

        # ── Étape 5 : Persister dans l'historique de session ─────────────────
        # CV (user) + réponse IA (assistant) → stockés ensemble.
        # Tous les tours suivants verront le CV via get_session_history().
        persisted_assistant_type = (
            assistant_type
            if assistant_type in {
                "career-coach",
                "job-scout",
                "cv-analyzer",
                "cv-adapter",
                "interview-sim",
            }
            else "career-coach"
        )
        await run_sync_io(
            update_session_history,
            session_id,
            cv_message_content,
            initial_response,
            user_id=user_id,
            assistant_type=persisted_assistant_type,
        )

        logger.info(
            f"[attach-cv] Done — session={session_id[:8]}... "
            f"cv={len(cv_text)}chars structured={bool(cv_structured)}"
        )

        await run_sync_io(increment_assistant_messages, user_id, assistant_type)
        await invalidate_user_quota_cache(user_id)

        return {
            "success": True,
            "filename": file.filename,
            "char_count": len(cv_text),
            "cv_structured": cv_structured,
            "initial_response": initial_response,
        }

    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from None
    except Exception as e:
        logger.error(f"[attach-cv] Unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du traitement du CV",
        ) from None


@router.post("/new-session")
async def create_assistant_session():
    """Create a new assistant chat session."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id, "created_at": "now"}


@router.delete("/session/{session_id}")
async def delete_assistant_session(session_id: str, current_user: CurrentUserDep):
    """Clear an assistant chat session."""
    await run_sync_io(clear_session, session_id, user_id=current_user["id"])
    return {"success": True, "message": f"Session {session_id} cleared"}
