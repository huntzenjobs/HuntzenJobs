"""
Multi-Assistant API Routes
===========================
Unified endpoints for all assistant types (career-coach, job-scout, cv-analyzer, cv-adapter, interview-sim).
Handles routing to the appropriate agent based on assistant_type parameter.
"""

import logging
import uuid
from typing import Annotated, Literal, Union

from arq import create_pool
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from src.api.deps import (
    BrandingAgentDep,
    CoachAgentDep,
    CVAdapterAgentDep,
    CVAgentDep,
    InterviewSimAgentDep,
    ScoutConversationalAgentDep,
    get_session_history,
    update_session_history,
    CurrentUserDep,
    check_assistant_quota,
    increment_assistant_messages,
)
from src.services.cv_chat_extractor import extract_cv_structured
from src.services.modal_pdf_extractor import extract_text_via_modal, is_modal_pdf_enabled

logger = logging.getLogger(__name__)

# ── ARQ queue — soupape de sécurité anti-429 Groq ────────────────────────────
_arq_pool = None
_GROQ_ACTIVE_KEY = "groq:active_assistant"
_GROQ_ACTIVE_TTL = 120  # expire 2min en cas de crash
ASSISTANT_SYNC_THRESHOLD = 12  # max appels Groq simultanés cross-replicas
_ARQ_QUEUE_KEY = "arq:queue"
_ARQ_QUEUE_MAX_LENGTH = 3000
_RETRY_AFTER_SECONDS = 8


async def _get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        try:
            from src.workers.settings import _get_redis_settings
            _arq_pool = await create_pool(_get_redis_settings())
        except Exception as e:
            logger.warning(f"[assistant] ARQ pool init failed: {e}")
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


async def _queue_assistant_or_reject(
    *,
    route_label: str,
    message: str,
    session_id: str,
    assistant_type: str,
    language: str,
    history: list,
    active: int,
) -> dict:
    queue_depth = await _get_arq_queue_depth()
    if queue_depth >= _ARQ_QUEUE_MAX_LENGTH:
        raise _busy_exception("Service temporairement surchargé. Réessayez dans quelques secondes.")

    pool = await _get_arq_pool()
    if not pool:
        logger.warning(f"[assistant/{route_label}] ARQ pool unavailable — rejecting to protect API")
        raise _busy_exception("File d'attente indisponible. Réessayez dans quelques secondes.")

    try:
        job = await pool.enqueue_job(
            "assistant_task",
            message=message,
            session_id=session_id,
            assistant_type=assistant_type,
            language=language,
            history=history,
        )
        estimated_wait = max(active, queue_depth if queue_depth > 0 else active) * 8
        logger.info(
            f"[assistant/{route_label}] ARQ queued — active={active} "
            f"queue_depth={queue_depth} job={job.job_id}"
        )
        return {"queued": True, "job_id": job.job_id, "estimated_wait_seconds": estimated_wait}
    except Exception as e:
        logger.warning(f"[assistant/{route_label}] ARQ enqueue failed ({e}) — rejecting to protect API")
        raise _busy_exception("Service temporairement surchargé. Réessayez dans quelques secondes.")

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

    # Optional context data for specific assistants
    cv_data: dict | None = Field(default=None, description="CV data for cv-analyzer/cv-adapter")
    job_description: str | None = Field(default=None, description="Job description for cv-adapter")
    job_info: dict | None = Field(default=None, description="Job info for interview-sim")


class AssistantResponse(BaseModel):
    """Response from any assistant type."""
    success: bool
    response: str
    agent: str = Field(description="Which agent handled the request")
    language: str = "fr"
    metadata: dict | None = None


class QueuedResponse(BaseModel):
    queued: bool = True
    job_id: str
    estimated_wait_seconds: int


# ============================================================================
# Routes
# ============================================================================

@router.post("/job-scout", response_model=Union[AssistantResponse, QueuedResponse])
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
    check_assistant_quota(user_id)

    history = get_session_history(request.session_id)

    try:
        active = await _incr_active()
    except Exception:
        active = 0

    if active > ASSISTANT_SYNC_THRESHOLD:
        await _decr_active()
        return await _queue_assistant_or_reject(
            route_label="job-scout",
            message=request.message,
            session_id=request.session_id,
            assistant_type="job-scout",
            language=request.language,
            history=history,
            active=active,
        )

    # Mode synchrone
    try:
        result = await agent.run(
            message=request.message,
            history=history,
            language=request.language,
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Job Scout error"),
        )

    update_session_history(request.session_id, request.message, result["response"])
    increment_assistant_messages(user_id)

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="job-scout",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/cv-analyzer", response_model=Union[AssistantResponse, QueuedResponse])
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
    check_assistant_quota(user_id)

    history = get_session_history(request.session_id)

    try:
        active = await _incr_active()
    except Exception:
        active = 0

    if active > ASSISTANT_SYNC_THRESHOLD:
        await _decr_active()
        return await _queue_assistant_or_reject(
            route_label="cv-analyzer",
            message=request.message,
            session_id=request.session_id,
            assistant_type="cv-analyzer",
            language=request.language,
            history=history,
            active=active,
        )

    # Mode synchrone
    try:
        result = await agent.run(
            message=request.message,
            history=history,
            language=request.language,
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV Analyzer error"),
        )

    update_session_history(request.session_id, request.message, result["response"])
    increment_assistant_messages(user_id)

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="cv-analyzer",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/cv-adapter", response_model=Union[AssistantResponse, QueuedResponse])
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
    check_assistant_quota(user_id)

    history = get_session_history(request.session_id)

    try:
        active = await _incr_active()
    except Exception:
        active = 0

    if active > ASSISTANT_SYNC_THRESHOLD:
        await _decr_active()
        return await _queue_assistant_or_reject(
            route_label="cv-adapter",
            message=request.message,
            session_id=request.session_id,
            assistant_type="cv-adapter",
            language=request.language,
            history=history,
            active=active,
        )

    # Mode synchrone
    try:
        result = await agent.run(
            message=request.message,
            history=history,
            language=request.language,
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV Adapter error"),
        )

    update_session_history(request.session_id, request.message, result["response"])
    increment_assistant_messages(user_id)

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="cv-adapter",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/interview-sim", response_model=Union[AssistantResponse, QueuedResponse])
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
    check_assistant_quota(user_id)

    history = get_session_history(request.session_id)

    try:
        active = await _incr_active()
    except Exception:
        active = 0

    if active > ASSISTANT_SYNC_THRESHOLD:
        await _decr_active()
        return await _queue_assistant_or_reject(
            route_label="interview-sim",
            message=request.message,
            session_id=request.session_id,
            assistant_type="interview-sim",
            language=request.language,
            history=history,
            active=active,
        )

    # Mode synchrone
    try:
        result = await agent.run(
            message=request.message,
            history=history,
            language=request.language,
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Interview Simulator error"),
        )

    update_session_history(request.session_id, request.message, result["response"])
    increment_assistant_messages(user_id)

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
        import io
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        if text and len(text) >= 50:
            logger.info(f"[attach-cv] pypdf OK: {len(text)} chars")
            return text
    except Exception as e:
        logger.error(f"[attach-cv] pypdf also failed: {e}")

    raise RuntimeError(
        "Impossible d'extraire le texte du PDF. "
        "Vérifiez que le fichier n'est pas scanné ou protégé par mot de passe."
    )


@router.post("/attach-cv")
async def attach_cv_to_chat(
    coach_agent: CoachAgentDep,
    cv_agent: CVAgentDep,
    cv_adapter_agent: CVAdapterAgentDep,
    scout_agent: ScoutConversationalAgentDep,
    branding_agent: BrandingAgentDep,
    interview_agent: InterviewSimAgentDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="Fichier PDF du CV"),
    assistant_type: str = Form(default="career-coach"),
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

    # ── Validation ────────────────────────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les fichiers PDF sont acceptés",
        )

    pdf_bytes = await file.read()

    if len(pdf_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Fichier trop volumineux ({len(pdf_bytes) / 1024 / 1024:.1f}MB, max 10MB)",
        )

    check_assistant_quota(user_id)

    try:
        # ── Étape 1 : Extraction texte ────────────────────────────────────────
        logger.info(f"[attach-cv] {file.filename} ({len(pdf_bytes)} bytes), assistant={assistant_type}")
        cv_text = await _extract_pdf_text(pdf_bytes, file.filename or "cv.pdf")

        # ── Étape 2 : Extraction structurée (Groq JSON mode, ~1s) ────────────
        cv_structured = await extract_cv_structured(cv_text)

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

        current_history = get_session_history(session_id)
        result = await agent.run(
            message=first_message,
            history=current_history,
            language=language,
        )

        if not result.get("success"):
            raise RuntimeError(result.get("error", "Erreur lors de l'analyse du CV"))

        initial_response = result["response"]

        # ── Étape 5 : Persister dans l'historique de session ─────────────────
        # CV (user) + réponse IA (assistant) → stockés ensemble.
        # Tous les tours suivants verront le CV via get_session_history().
        increment_assistant_messages(user_id)
        update_session_history(session_id, cv_message_content, initial_response)

        logger.info(
            f"[attach-cv] Done — session={session_id[:8]}... "
            f"cv={len(cv_text)}chars structured={bool(cv_structured)}"
        )

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
        )
    except Exception as e:
        logger.error(f"[attach-cv] Unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors du traitement du CV",
        )


@router.post("/new-session")
async def create_assistant_session():
    """Create a new assistant chat session."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id, "created_at": "now"}


@router.delete("/session/{session_id}")
async def delete_assistant_session(session_id: str):
    """Clear an assistant chat session."""
    from src.api.deps import clear_session
    clear_session(session_id)
    return {"success": True, "message": f"Session {session_id} cleared"}
