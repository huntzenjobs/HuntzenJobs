"""
CV Adapter API Routes
======================
Endpoints for smart CV adaptation to job offers.
"""

import asyncio
import io
import json
import logging
import re
import uuid
import zipfile
from contextlib import asynccontextmanager, suppress
from typing import TYPE_CHECKING, Literal

from arq import create_pool
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator

from src.api.deps import (
    CurrentUserDep,
    _require_feature_flag_sync,
    get_cv_adapter_main,
    get_supabase_client,
    run_sync_io,
)
from src.api.middleware import limiter

if TYPE_CHECKING:
    from src.agents.cv_adapter.main_agent import CVAdapterAgent
from src.services.email import send_document_generated
from src.services.pdf_generator import get_pdf_generator
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
    clear_job_owner,
    estimate_arq_wait_seconds,
    store_job_owner,
)
from src.utils.uploads import (
    await_extraction_cleanup,
    read_upload_limited,
    run_extraction_sync,
)

logger = logging.getLogger(__name__)


async def _execute_quota_rpc(function_name: str, payload: dict) -> object:
    """Exécute une RPC quota synchrone hors event loop avec délai borné."""
    supabase = get_supabase_client()
    result = await asyncio.wait_for(
        asyncio.to_thread(
            lambda: supabase.rpc(function_name, payload).execute()
        ),
        timeout=10,
    )
    return result.data


async def _reserve_quota(user_id: str, feature: str) -> str:
    """Réserve atomiquement une unité avant tout traitement IA payant."""
    request_key = str(uuid.uuid4())
    payload = {
        "p_user_id": user_id,
        "p_feature": feature,
        "p_request_key": request_key,
        "p_amount": 1,
    }
    data: object = None
    for attempt in range(2):
        try:
            data = await _execute_quota_rpc("reserve_ai_quota", payload)
            break
        except Exception as exc:
            if attempt == 1:
                logger.error(
                    "[quota] %s reservation unavailable for %s: %s",
                    feature,
                    user_id,
                    exc,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Le service de quotas est temporairement indisponible.",
                ) from None

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Réponse invalide du service de quotas.",
        )

    if data.get("granted") is not True:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "QUOTA_EXCEEDED",
                "feature": feature,
                "limit": data.get("quota_limit"),
                "used": data.get("quota_used"),
                "reserved": data.get("quota_reserved"),
                "reset_at": str(data.get("reset_at", "")),
                "message": "QUOTA_EXCEEDED",
            },
        )

    reservation_id = data.get("reservation_id")
    if not isinstance(reservation_id, str) or not reservation_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Réservation de quota invalide.",
        )
    return reservation_id


async def _commit_quota_reservation(reservation_id: str, user_id: str) -> None:
    """Débite exactement une fois la réservation après livraison effective."""
    data: object = None
    for attempt in range(2):
        try:
            data = await _execute_quota_rpc(
                "commit_ai_quota_reservation",
                {"p_reservation_id": reservation_id},
            )
            break
        except Exception as exc:
            if attempt == 1:
                logger.error(
                    "[quota] reservation commit unavailable for %s: %s",
                    reservation_id,
                    exc,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Impossible de finaliser le quota du livrable.",
                ) from None

    if data is not True:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La réservation de quota a expiré.",
        )

    from src.services.stripe import invalidate_user_quota_cache

    await invalidate_user_quota_cache(user_id)


async def _release_quota_reservation(reservation_id: str) -> None:
    """Libère sans masquer l'erreur métier une réservation non consommée."""
    try:
        await _execute_quota_rpc(
            "release_ai_quota_reservation",
            {"p_reservation_id": reservation_id},
        )
    except Exception as exc:
        logger.warning(
            "[quota] reservation release failed for %s: %s",
            reservation_id,
            exc,
        )


async def _record_quota_usage(user_id: str, feature: str) -> None:
    """Débite le quota uniquement après production effective du livrable."""
    supabase = get_supabase_client()
    try:
        await asyncio.wait_for(
            asyncio.to_thread(
                lambda: supabase.rpc(
                    "increment_usage",
                    {
                        "p_user_id": user_id,
                        "p_feature": feature,
                        "p_amount": 1,
                    },
                ).execute()
            ),
            timeout=10,
        )
        # Invalider le cache Redis pour que /api/auth/me retourne les quotas à jour
        from src.services.stripe import invalidate_user_quota_cache
        await invalidate_user_quota_cache(user_id)
    except Exception as e:
        if hasattr(e, "status_code"):
            raise
        logger.warning(f"[quota] {feature} increment failed for {user_id}: {e}")

router = APIRouter()

# ── ARQ queue — soupape de sécurité anti-429 Groq ────────────────────────────
_arq_pool = None
_arq_pool_lock = asyncio.Lock()
CV_ADAPT_SYNC_THRESHOLD = GLOBAL_AI_SYNC_LIMIT
CV_EXTRACTION_SYNC_THRESHOLD = CV_EXTRACTION_SYNC_LIMIT
CV_ADAPT_SYNC_TIMEOUT_SECONDS = 110
MAX_DOCX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024
MAX_DOCX_ARCHIVE_ENTRIES = 1024
MAX_DOCX_COMPRESSION_RATIO = 200


async def _get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        async with _arq_pool_lock:
            if _arq_pool is None:
                try:
                    from src.workers.settings import _get_redis_settings

                    _arq_pool = await create_pool(_get_redis_settings())
                except Exception as e:
                    logger.warning(f"[cv_adapter] ARQ pool init failed: {e}")
                    _arq_pool = None
    return _arq_pool


def _capacity_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Le service IA est momentanément très sollicité. "
            "Veuillez réessayer dans quelques secondes."
        ),
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
    """Borne lecture, encodage Modal et fallback Docling avant toute allocation lourde."""
    try:
        active = await _incr_extraction_active()
    except Exception as exc:
        logger.warning("[cv_adapter] Compteur d'extraction indisponible: %s", exc)
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


async def _run_cv_adaptation(
    agent: "CVAdapterAgent",
    *,
    cv_text: str,
    job_description: str,
    language: str,
    template: str,
    user_id: str,
    allow_queue: bool,
    quota_reservation_id: str = "",
) -> dict:
    """Exécute l'adaptation sous le plafond global ou la place dans ARQ."""
    active = await _acquire_active_or_503("cv_adapter")
    counted = True

    if active > CV_ADAPT_SYNC_THRESHOLD:
        if counted:
            await _decr_active()
        if allow_queue:
            pool = await _get_arq_pool()
            if pool:
                try:
                    job_id = uuid.uuid4().hex
                    if not await store_job_owner(job_id, user_id):
                        raise RuntimeError(
                            "Impossible d'enregistrer le propriétaire du job ARQ"
                        )
                    job = await pool.enqueue_job(
                        "cv_adapt_task",
                        _job_id=job_id,
                        cv_text=cv_text,
                        job_description=job_description,
                        language=language,
                        template=template,
                        user_id=user_id,
                        quota_reservation_id=quota_reservation_id,
                    )
                    if job is None:
                        raise RuntimeError("ARQ n'a pas accepté le job d'adaptation")
                    logger.info(
                        "[cv_adapter] ARQ queued — active=%s job=%s",
                        active,
                        job.job_id,
                    )
                    return {
                        "queued": True,
                        "job_id": job.job_id,
                        "estimated_wait_seconds": await estimate_arq_wait_seconds(
                            pool,
                            active,
                        ),
                    }
                except Exception as exc:
                    if "job_id" in locals():
                        await clear_job_owner(job_id)
                    logger.warning("[cv_adapter] ARQ enqueue failed: %s", exc)
        raise _capacity_error()

    try:
        try:
            return await asyncio.wait_for(
                agent.run(
                    cv_text=cv_text,
                    job_description=job_description,
                    language=language,
                    template=template,
                ),
                timeout=CV_ADAPT_SYNC_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="L'adaptation du CV a dépassé le délai maximal. Veuillez réessayer.",
            ) from None
    finally:
        if counted:
            await _decr_active()


async def _run_cover_letter_generation(
    agent: "CVAdapterAgent",
    *,
    cv_data: dict,
    job_description: str,
    language: str,
    company_name: str,
    user_id: str,
    quota_reservation_id: str,
    allow_queue: bool,
) -> dict:
    """Génère une LM sous le plafond global ou la transmet atomiquement à ARQ."""
    active = await _acquire_active_or_503("cover_letter")
    counted = True

    if active > CV_ADAPT_SYNC_THRESHOLD:
        if counted:
            await _decr_active()
        if allow_queue:
            pool = await _get_arq_pool()
            if pool:
                try:
                    job_id = uuid.uuid4().hex
                    if not await store_job_owner(job_id, user_id):
                        raise RuntimeError(
                            "Impossible d'enregistrer le propriétaire du job ARQ"
                        )
                    job = await pool.enqueue_job(
                        "cover_letter_task",
                        _job_id=job_id,
                        cv_data=cv_data,
                        job_description=job_description,
                        language=language,
                        company_name=company_name,
                        user_id=user_id,
                        quota_reservation_id=quota_reservation_id,
                    )
                    if job is None:
                        raise RuntimeError("ARQ n'a pas accepté le job de lettre")
                    logger.info(
                        "[cv_adapter/cover-letter] ARQ queued — active=%s job=%s",
                        active,
                        job.job_id,
                    )
                    return {
                        "queued": True,
                        "job_id": job.job_id,
                        "estimated_wait_seconds": await estimate_arq_wait_seconds(
                            pool,
                            active,
                        ),
                    }
                except Exception as exc:
                    if "job_id" in locals():
                        await clear_job_owner(job_id)
                    logger.warning(
                        "[cv_adapter/cover-letter] ARQ enqueue failed: %s",
                        exc,
                    )
        raise _capacity_error()

    try:
        try:
            return await asyncio.wait_for(
                agent.generate_cover_letter(
                    cv_data=cv_data,
                    job_description=job_description,
                    language=language,
                    company_name=company_name,
                ),
                timeout=CV_ADAPT_SYNC_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=(
                    "La lettre de motivation a dépassé le délai maximal. "
                    "Veuillez réessayer."
                ),
            ) from None
    finally:
        if counted:
            await _decr_active()


def _normalize_pdf_text(text: str) -> str:
    """Fix common PDF extraction artifacts from both Docling backends.

    DoclingParseV4 (enforce_same_font): "Data2inn ov", "Mod elin g"
    PyPdfiumDocumentBackend:            "gmail . com", "Node . js", "FULL -STACK"
    """
    # Ligatures Unicode → ASCII (Docling < 2.76.0 artifact: ﬁ ﬂ ﬀ)
    for lig, rep in [('\ufb00','ff'),('\ufb01','fi'),('\ufb02','fl'),
                     ('\ufb03','ffi'),('\ufb04','ffl'),('\ufb05','st'),('\ufb06','st')]:
        text = text.replace(lig, rep)
    # "word . word" → "word.word"  (emails, URLs, version numbers, library names)
    text = re.sub(r'(\w) \. (\w)', r'\1.\2', text)
    # "word -word" → "word-word"   (compound words, hyphenated names)
    text = re.sub(r'(\w) -(\w)', r'\1-\2', text)
    # "word ," → "word,"           (space before comma in lists)
    text = re.sub(r'(\w) ,', r'\1,', text)
    return text


def _extract_docx_text_sync(content: bytes) -> str:
    """Valide l'archive DOCX avant décompression et parsing hors event loop."""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        members = archive.infolist()
        total_size = sum(member.file_size for member in members)
        if len(members) > MAX_DOCX_ARCHIVE_ENTRIES:
            raise ValueError("Archive DOCX trop complexe")
        if total_size > MAX_DOCX_UNCOMPRESSED_BYTES:
            raise ValueError("Archive DOCX décompressée trop volumineuse")
        for member in members:
            compressed_size = max(member.compress_size, 1)
            if member.file_size / compressed_size > MAX_DOCX_COMPRESSION_RATIO:
                raise ValueError("Ratio de compression DOCX dangereux")

    from docx import Document

    document = Document(io.BytesIO(content))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


async def _extract_cv_text_from_file(file: UploadFile) -> str:
    """Extract CV text from an uploaded PDF or DOCX via Modal (Docling fallback)."""
    async with _cv_extraction_slot():
        return await _extract_cv_text_without_capacity(file)


async def _extract_cv_text_without_capacity(file: UploadFile) -> str:
    """Effectue l'extraction après réservation explicite d'une place."""
    from src.api.deps import get_cv_analyzer_main
    from src.services.modal_pdf_extractor import (
        extract_text_via_modal,
        is_modal_pdf_enabled,
    )

    filename = (file.filename or "").lower()
    if not (filename.endswith(".pdf") or filename.endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and DOCX files are supported",
        )

    content = await read_upload_limited(file)

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty (0 bytes). Please upload a valid PDF.",
        )

    try:
        if filename.endswith(".pdf"):
            if is_modal_pdf_enabled():
                try:
                    cv_text = await extract_text_via_modal(content)
                    logger.info("[cv_adapter] PDF text extracted via Modal")
                except ValueError as user_err:
                    # PDF invalide/corrompu — erreur utilisateur, pas de fallback
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=str(user_err),
                    ) from None
                except Exception as modal_exc:
                    logger.warning(
                        f"[cv_adapter] Modal extraction failed, falling back to local: {modal_exc}"
                    )
                    cv_analyzer = get_cv_analyzer_main()
                    cv_text = await await_extraction_cleanup(
                        cv_analyzer.extract_text_from_pdf(content)
                    )
            else:
                cv_analyzer = get_cv_analyzer_main()
                cv_text = await await_extraction_cleanup(
                    cv_analyzer.extract_text_from_pdf(content)
                )
        else:
            cv_text = await run_extraction_sync(_extract_docx_text_sync, content)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[cv_adapter] File text extraction failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from file: {str(exc)}",
        ) from None

    # Normalize PDF extraction artifacts (both Docling backends)
    cv_text = _normalize_pdf_text(cv_text)

    if not cv_text or len(cv_text) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract sufficient text from file",
        )
    return cv_text


def get_adapter_agent() -> "CVAdapterAgent":
    """
    Get CV Adapter agent singleton.

    DEPRECATED: Redirects to deps.get_cv_adapter_main() for thread-safe singleton.
    This function is maintained for backward compatibility with existing routes.
    """
    return get_cv_adapter_main()


def generate_pdf_sync(cv_data: dict, template: str, language: str, photo_base64: str = None) -> bytes:
    """Generate PDF using WeasyPrint."""
    pdf_gen = get_pdf_generator()
    return pdf_gen.generate(
        cv_data=cv_data,
        template=template,
        language=language,
        photo_base64=photo_base64
    )


@router.post("/adapt")
@limiter.limit("5/minute")
async def adapt_cv(
    request: Request,
    current_user: CurrentUserDep,
    job_description: str = Form(
        ...,
        min_length=50,
        max_length=30_000,
        description="Target job description",
    ),
    language: str = Form(default="en", description="Output language (en/fr)"),
    template: str = Form(default="ats", description="Template (ats/modern)"),
    cv_text: str | None = Form(
        default=None,
        max_length=100_000,
        description="Original CV content as text",
    ),
    file: UploadFile | None = File(default=None, description="CV file (PDF or DOCX)"),
):
    """
    Adapt a CV to match a specific job offer.

    Accepts either a CV file (PDF/DOCX) or raw cv_text.

    This endpoint uses AI to:
    1. Analyze job requirements and keywords
    2. Map CV experiences to job needs
    3. Rewrite content using job's vocabulary
    4. Fact-check to ensure no hallucinations

    Returns structured CV data with match analysis.
    """
    user_id = current_user["id"]

    # Resolve CV text — from file or raw text
    if file and file.filename:
        cv_text = await _extract_cv_text_from_file(file)
    elif not cv_text or len(cv_text) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either a CV file (PDF/DOCX) or cv_text (min 100 chars).",
        )

    agent = get_adapter_agent()

    if len(job_description) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job description too short. Please provide a complete job posting.",
        )

    reservation_id = await _reserve_quota(user_id, "cv_adapt")
    reservation_retained = False
    try:
        result = await _run_cv_adaptation(
            agent,
            cv_text=cv_text,
            job_description=job_description,
            language=language,
            template=template,
            user_id=user_id,
            allow_queue=True,
            quota_reservation_id=reservation_id,
        )
        if result.get("queued"):
            reservation_retained = True
            return result

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "CV adaptation failed"),
            )

        await _commit_quota_reservation(reservation_id, user_id)
        reservation_retained = True

        if current_user.get("email"):
            try:
                job_title = job_description.split("\n")[0][:60] or "Poste"
                await run_sync_io(
                    send_document_generated,
                    current_user["email"],
                    "cv",
                    job_title,
                    "",
                )
            except Exception:
                pass

        return {
            "success": True,
            "cv_data": result.get("cv_data"),
            "match_score": result.get("match_score"),
            "job_analysis": result.get("job_analysis"),
            "fact_check": result.get("fact_check"),
        }
    finally:
        if not reservation_retained:
            await _release_quota_reservation(reservation_id)


@router.post("/adapt/pdf")
@limiter.limit("5/minute")
async def adapt_cv_to_pdf(
    request: Request,
    current_user: CurrentUserDep,
    job_description: str = Form(
        ...,
        min_length=50,
        max_length=30_000,
        description="Target job description",
    ),
    language: str = Form(default="en", description="Output language (en/fr)"),
    template: str = Form(default="ats", description="Template (ats/modern)"),
    cv_text: str | None = Form(
        default=None,
        max_length=100_000,
        description="Original CV content as text",
    ),
    file: UploadFile | None = File(default=None, description="CV file (PDF or DOCX)"),
):
    """
    Adapt CV and generate PDF directly.

    Accepts either a CV file (PDF/DOCX) or raw cv_text.

    Templates:
    - ats: Simple 1-column, ATS-optimized (90%+ score)
    - modern: Beautiful 2-column design (for direct contact)

    Returns a downloadable PDF file with the adapted CV.
    """
    user_id = current_user["id"]

    # Resolve CV text — from file or raw text
    if file and file.filename:
        cv_text = await _extract_cv_text_from_file(file)
    elif not cv_text or len(cv_text) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either a CV file (PDF/DOCX) or cv_text (min 100 chars).",
        )

    agent = get_adapter_agent()

    if len(job_description) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job description too short",
        )

    reservation_id = await _reserve_quota(user_id, "cv_adapt")
    reservation_retained = False
    try:
        # Une réponse PDF ne peut pas être rendue par polling : au pic, demander un retry.
        result = await _run_cv_adaptation(
            agent,
            cv_text=cv_text,
            job_description=job_description,
            language=language,
            template=template,
            user_id=user_id,
            allow_queue=False,
            quota_reservation_id=reservation_id,
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "CV adaptation failed"),
            )

        cv_data = result.get("cv_data", {})
        try:
            pdf_bytes = await run_sync_io(
                generate_pdf_sync,
                cv_data,
                template,
                language,
                timeout_seconds=30,
            )
        except Exception as e:
            logger.error(f"PDF generation failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"PDF generation failed: {str(e)}",
            ) from None

        await _commit_quota_reservation(reservation_id, user_id)
        reservation_retained = True

        name = cv_data.get("personal_info", {}).get("name", "cv")
        safe_name = "".join(c for c in name if c.isalnum() or c in " -_").strip()
        filename = f"{safe_name}_adapted.pdf" if safe_name else "cv_adapted.pdf"

        if current_user.get("email"):
            try:
                job_title = job_description.split("\n")[0][:60] or "Poste"
                await run_sync_io(
                    send_document_generated,
                    current_user["email"],
                    "cv",
                    job_title,
                    "",
                )
            except Exception:
                pass

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    finally:
        if not reservation_retained:
            await _release_quota_reservation(reservation_id)


@router.post("/adapt/upload")
@limiter.limit("5/minute")
async def adapt_cv_from_file(
    request: Request,
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="CV file (PDF or DOCX)"),
    job_description: str = Form(
        ...,
        min_length=50,
        max_length=30_000,
        description="Target job description",
    ),
    language: str = Form(default="en"),
    template: str = Form(default="ats"),
    output_format: Literal["json", "pdf"] = Form(
        default="json",
        description="Output: json or pdf",
    ),
):
    """
    Upload CV file and adapt it to a job offer.

    Supports PDF and DOCX formats.
    """
    user_id = current_user["id"]

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided",
        )
    cv_text = await _extract_cv_text_from_file(file)

    reservation_id = await _reserve_quota(user_id, "cv_adapt")
    reservation_retained = False
    try:
        # Le JSON peut être récupéré par polling. Un téléchargement PDF reçoit 503
        # au pic pour éviter de contourner la soupape globale avec un appel sync.
        agent = get_adapter_agent()
        result = await _run_cv_adaptation(
            agent,
            cv_text=cv_text,
            job_description=job_description,
            language=language,
            template=template,
            user_id=user_id,
            allow_queue=output_format == "json",
            quota_reservation_id=reservation_id,
        )
        if result.get("queued"):
            reservation_retained = True
            return result

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "CV adaptation failed"),
            )

        if output_format == "pdf":
            pdf_gen = get_pdf_generator()
            pdf_bytes = await run_sync_io(
                pdf_gen.generate,
                cv_data=result.get("cv_data", {}),
                template=template,
                language=language,
                timeout_seconds=30,
            )

            await _commit_quota_reservation(reservation_id, user_id)
            reservation_retained = True
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=cv_adapted.pdf"},
            )

        await _commit_quota_reservation(reservation_id, user_id)
        reservation_retained = True
        return {
            "success": True,
            "cv_data": result.get("cv_data"),
            "match_score": result.get("match_score"),
            "job_analysis": result.get("job_analysis"),
        }
    finally:
        if not reservation_retained:
            await _release_quota_reservation(reservation_id)


@router.post("/quick-adapt")
@limiter.limit("5/minute")
async def quick_adapt_cv(
    request: Request,
    current_user: CurrentUserDep,
    cv_text: str = Form(..., min_length=100, max_length=100_000),
    job_description: str = Form(..., min_length=50, max_length=30_000),
    language: str = Form(default="en"),
):
    """
    Alias historique vers l'adaptation complète et fact-checkée.

    Le raccourci non vérifié a été supprimé : aucun CV exportable ne doit
    contourner la garantie factuelle du pipeline principal.
    """
    return await adapt_cv.__wrapped__(
        request=request,
        current_user=current_user,
        cv_text=cv_text,
        job_description=job_description,
        language=language,
        template="ats",
        file=None,
    )


class PDFRequest(BaseModel):
    """Request model for PDF generation."""
    cv_data: dict
    template: str = "ats"
    language: str = "fr"
    photo: str | None = Field(default=None, max_length=7_000_000)  # Base64 encoded photo

    @model_validator(mode="after")
    def validate_pdf_payload_size(self) -> "PDFRequest":
        cv_size = len(json.dumps(self.cv_data, ensure_ascii=False, default=str).encode("utf-8"))
        if cv_size > 150_000:
            raise ValueError("cv_data dépasse la taille maximale de 150 Ko")
        return self


@router.post("/generate-pdf")
@limiter.limit("10/minute")
async def generate_pdf_from_data(
    request: Request,
    data: PDFRequest,
    current_user: CurrentUserDep,
):
    """
    Generate PDF from structured CV data.

    [PREMIUM FEATURE]
    Templates:
    - ats: Simple 1-column, ATS-optimized (no photo)
    - modern: 2-column design with sidebar (with photo)
    - classic: Traditional design (optional photo)
    """
    await run_sync_io(
        _require_feature_flag_sync,
        current_user["id"],
        "pdf_export",
        "L'export PDF necessite un plan superieur.",
    )

    try:
        logger.info(f"[PDFGenerator] Generating {data.template} PDF...")
        pdf_bytes = await run_sync_io(
            generate_pdf_sync,
            data.cv_data,
            data.template,
            data.language,
            data.photo,
            timeout_seconds=30,
        )
        logger.info(f"[PDFGenerator] PDF generated successfully, size: {len(pdf_bytes)} bytes")
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        ) from None

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cv.pdf"},
    )


@router.get("/templates")
async def list_templates():
    """List available CV templates."""
    pdf_gen = get_pdf_generator()
    return {
        "templates": pdf_gen.get_available_templates(),
    }


class CoverLetterRequest(BaseModel):
    """Request model for cover letter generation."""
    cv_data: dict
    job_description: str = Field(min_length=50, max_length=30_000)
    language: str = Field(default="fr", pattern="^(fr|en|es|pt)$")
    company_name: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_cv_payload_size(self) -> "CoverLetterRequest":
        payload_size = len(
            json.dumps(self.cv_data, ensure_ascii=False, default=str).encode("utf-8")
        )
        if payload_size > 100_000:
            raise ValueError("cv_data dépasse la taille maximale de 100 Ko")
        return self


@router.post("/generate-cover-letter")
@limiter.limit("5/minute")
async def generate_cover_letter(
    request: Request,
    data: CoverLetterRequest,
    current_user: CurrentUserDep,
):
    """
    Generate a personalized cover letter from CV data and job description.

    [PREMIUM FEATURE]
    Returns a PDF cover letter tailored to the specific job.
    """
    user_id = current_user["id"]
    await run_sync_io(
        _require_feature_flag_sync,
        user_id,
        "cover_letter",
        "La generation de lettre de motivation necessite un plan superieur.",
    )
    reservation_id = await _reserve_quota(user_id, "cover_letter")
    reservation_retained = False
    try:
        agent = get_adapter_agent()
        result = await _run_cover_letter_generation(
            agent,
            cv_data=data.cv_data,
            job_description=data.job_description,
            language=data.language,
            company_name=data.company_name or "",
            user_id=user_id,
            quota_reservation_id=reservation_id,
            allow_queue=False,
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Cover letter generation failed"),
            )

        try:
            pdf_gen = get_pdf_generator()
            pdf_bytes = await run_sync_io(
                pdf_gen.generate_cover_letter,
                letter_data=result,
                language=data.language,
                timeout_seconds=30,
            )
            logger.info(
                "[CoverLetter] PDF generated successfully, size: %s bytes",
                len(pdf_bytes),
            )
        except Exception as e:
            logger.error(f"Cover letter PDF generation failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(e),
            ) from None

        await _commit_quota_reservation(reservation_id, user_id)
        reservation_retained = True

        name = data.cv_data.get("personal_info", {}).get("name", "candidate")
        safe_name = "".join(c for c in name if c.isalnum() or c in " -_").strip()
        filename = (
            f"Lettre_Motivation_{safe_name}.pdf"
            if safe_name
            else "cover_letter.pdf"
        )

        if current_user.get("email"):
            try:
                job_title = (
                    result.get("job_title")
                    or data.job_description.split("\n")[0][:60]
                    or "Poste"
                )
                await run_sync_io(
                    send_document_generated,
                    current_user["email"],
                    "cover_letter",
                    job_title,
                    data.company_name or "",
                )
            except Exception:
                pass

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    finally:
        if not reservation_retained:
            await _release_quota_reservation(reservation_id)


@router.post("/generate-cover-letter/json")
@limiter.limit("5/minute")
async def generate_cover_letter_json(
    request: Request,
    data: CoverLetterRequest,
    current_user: CurrentUserDep,
):
    """
    Generate cover letter and return JSON data (for preview).

    [PREMIUM FEATURE]
    """
    user_id = current_user["id"]
    await run_sync_io(
        _require_feature_flag_sync,
        user_id,
        "cover_letter",
        "La generation de lettre de motivation necessite un plan superieur.",
    )
    reservation_id = await _reserve_quota(user_id, "cover_letter")
    reservation_retained = False
    try:
        agent = get_adapter_agent()
        result = await _run_cover_letter_generation(
            agent,
            cv_data=data.cv_data,
            job_description=data.job_description,
            language=data.language,
            company_name=data.company_name or "",
            user_id=user_id,
            quota_reservation_id=reservation_id,
            allow_queue=True,
        )
        if result.get("queued"):
            reservation_retained = True
            return result

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Cover letter generation failed"),
            )

        await _commit_quota_reservation(reservation_id, user_id)
        reservation_retained = True
        return {
            "success": True,
            "cover_letter": result,
        }
    finally:
        if not reservation_retained:
            await _release_quota_reservation(reservation_id)


class CoverLetterFromDataRequest(BaseModel):
    """Request model for generating cover letter PDF from pre-structured data."""
    cover_letter_data: dict
    language: str = "fr"

    @model_validator(mode="after")
    def validate_letter_payload_size(self) -> "CoverLetterFromDataRequest":
        payload_size = len(
            json.dumps(
                self.cover_letter_data,
                ensure_ascii=False,
                default=str,
            ).encode("utf-8")
        )
        if payload_size > 100_000:
            raise ValueError("cover_letter_data dépasse la taille maximale de 100 Ko")
        return self


@router.post("/generate-cover-letter/pdf-from-data")
@limiter.limit("10/minute")
async def generate_cover_letter_pdf_from_data(
    request: Request,
    data: CoverLetterFromDataRequest,
    current_user: CurrentUserDep,
):
    """
    Generate cover letter PDF directly from structured data (no LLM call).
    Used to regenerate PDF after user edits cover letter fields.
    """
    await run_sync_io(
        _require_feature_flag_sync,
        current_user["id"],
        "cover_letter",
        "La generation de lettre de motivation necessite un plan superieur.",
    )
    try:
        pdf_gen = get_pdf_generator()
        pdf_bytes = await run_sync_io(
            pdf_gen.generate_cover_letter,
            letter_data=data.cover_letter_data,
            language=data.language,
            timeout_seconds=30,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=cover_letter.pdf"},
        )
    except Exception as e:
        logger.error(f"Cover letter PDF from data failed: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from None


class PreviewRequest(BaseModel):
    """Request model for CV HTML preview."""
    cv_data: dict
    template: str = "ats"
    compact: bool = False
    language: str = "fr"


@router.post("/preview")
async def preview_cv(request: PreviewRequest):
    """
    Generate HTML preview of CV.

    Returns HTML string for web display.
    """
    pdf_gen = get_pdf_generator()

    html_content = pdf_gen.generate_preview_html(
        cv_data=request.cv_data,
        template=request.template,
        compact=request.compact,
        language=request.language,
    )

    return Response(
        content=html_content,
        media_type="text/html",
    )
