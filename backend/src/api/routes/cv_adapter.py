"""
CV Adapter API Routes
======================
Endpoints for smart CV adaptation to job offers.
"""

import io
import json
import logging
import re
from typing import Optional

from arq import create_pool
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from src.api.deps import get_cv_adapter_main, get_user_info_from_token
from src.services.email import send_document_generated
from src.services.pdf_generator import get_pdf_generator

logger = logging.getLogger(__name__)

router = APIRouter()

# ── ARQ queue — soupape de sécurité anti-429 Groq ────────────────────────────
_arq_pool = None
_GROQ_ACTIVE_KEY = "groq:active_cv_adapt"
_GROQ_ACTIVE_TTL = 120
CV_ADAPT_SYNC_THRESHOLD = 12


async def _get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        try:
            from src.workers.settings import _get_redis_settings
            _arq_pool = await create_pool(_get_redis_settings())
        except Exception as e:
            logger.warning(f"[cv_adapter] ARQ pool init failed: {e}")
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


async def _extract_cv_text_from_file(file: UploadFile) -> str:
    """Extract CV text from an uploaded PDF or DOCX via Modal (Docling fallback)."""
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

    content = await file.read()

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
                    )
                except Exception as modal_exc:
                    logger.warning(
                        f"[cv_adapter] Modal extraction failed, falling back to local: {modal_exc}"
                    )
                    cv_analyzer = get_cv_analyzer_main()
                    cv_text = await cv_analyzer.extract_text_from_pdf(content)
            else:
                cv_analyzer = get_cv_analyzer_main()
                cv_text = await cv_analyzer.extract_text_from_pdf(content)
        else:
            from docx import Document
            doc = Document(io.BytesIO(content))
            cv_text = "\n".join([para.text for para in doc.paragraphs])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[cv_adapter] File text extraction failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from file: {str(exc)}",
        )

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
    from src.agents.cv_adapter import CVAdapterAgent  # Import for type hint
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
async def adapt_cv(
    job_description: str = Form(..., description="Target job description"),
    language: str = Form(default="en", description="Output language (en/fr)"),
    template: str = Form(default="ats", description="Template (ats/modern)"),
    cv_text: Optional[str] = Form(default=None, description="Original CV content as text"),
    file: Optional[UploadFile] = File(default=None, description="CV file (PDF or DOCX)"),
    authorization: Optional[str] = Header(default=None),
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

    try:
        active = await _incr_active()
    except Exception:
        active = 0

    if active > CV_ADAPT_SYNC_THRESHOLD:
        await _decr_active()
        pool = await _get_arq_pool()
        if pool:
            try:
                job = await pool.enqueue_job(
                    "cv_adapt_task",
                    cv_text=cv_text,
                    job_description=job_description,
                    language=language,
                )
                logger.info(f"[cv_adapter/adapt] ARQ queued — active={active} job={job.job_id}")
                return {"queued": True, "job_id": job.job_id, "estimated_wait_seconds": active * 8}
            except Exception as e:
                logger.warning(f"[cv_adapter/adapt] ARQ enqueue failed ({e}) — fallback sync")
        await _incr_active()

    # Mode synchrone
    try:
        result = await agent.run(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
            template=template,
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV adaptation failed"),
        )

    user_info = get_user_info_from_token(authorization)
    if user_info and user_info.get("email"):
        try:
            job_title = job_description.split("\n")[0][:60] or "Poste"
            send_document_generated(user_info["email"], "cv", job_title, "")
        except Exception:
            pass

    return {
        "success": True,
        "cv_data": result.get("cv_data"),
        "match_score": result.get("match_score"),
        "job_analysis": result.get("job_analysis"),
        "fact_check": result.get("fact_check"),
    }


@router.post("/adapt/pdf")
async def adapt_cv_to_pdf(
    job_description: str = Form(..., description="Target job description"),
    language: str = Form(default="en", description="Output language (en/fr)"),
    template: str = Form(default="ats", description="Template (ats/modern)"),
    cv_text: Optional[str] = Form(default=None, description="Original CV content as text"),
    file: Optional[UploadFile] = File(default=None, description="CV file (PDF or DOCX)"),
    authorization: Optional[str] = Header(default=None),
):
    """
    Adapt CV and generate PDF directly.

    Accepts either a CV file (PDF/DOCX) or raw cv_text.

    Templates:
    - ats: Simple 1-column, ATS-optimized (90%+ score)
    - modern: Beautiful 2-column design (for direct contact)

    Returns a downloadable PDF file with the adapted CV.
    """
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
    
    # Run adaptation
    try:
        await _incr_active()
    except Exception:
        pass

    try:
        result = await agent.run(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
            template=template,
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV adaptation failed"),
        )

    # Generate PDF
    cv_data = result.get("cv_data", {})
    
    try:
        pdf_bytes = generate_pdf_sync(cv_data=cv_data, template=template, language=language)
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF generation failed: {str(e)}",
        )
    
    # Get candidate name for filename
    name = cv_data.get("personal_info", {}).get("name", "cv")
    safe_name = "".join(c for c in name if c.isalnum() or c in " -_").strip()
    filename = f"{safe_name}_adapted.pdf" if safe_name else "cv_adapted.pdf"

    user_info = get_user_info_from_token(authorization)
    if user_info and user_info.get("email"):
        try:
            job_title = job_description.split("\n")[0][:60] or "Poste"
            send_document_generated(user_info["email"], "cv", job_title, "")
        except Exception:
            pass

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/adapt/upload")
async def adapt_cv_from_file(
    file: UploadFile = File(..., description="CV file (PDF or DOCX)"),
    job_description: str = Form(..., description="Target job description"),
    language: str = Form(default="en"),
    template: str = Form(default="ats"),
    output_format: str = Form(default="json", description="Output: json or pdf"),
):
    """
    Upload CV file and adapt it to a job offer.
    
    Supports PDF and DOCX formats.
    """
    from src.api.deps import get_cv_analyzer_main

    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided",
        )
    
    filename = file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and DOCX files are supported",
        )
    
    # Read file
    content = await file.read()

    # Validate file content
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty (0 bytes). Please upload a valid PDF.",
        )

    # Validate file size (max 10MB)
    MAX_SIZE_BYTES = 10 * 1024 * 1024
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({len(content) // (1024*1024)}MB). Maximum allowed size is 10MB.",
        )

    # Extract text — PDF via Modal (if configured) to avoid Railway OOM from docling
    try:
        if filename.endswith(".pdf"):
            from src.services.modal_pdf_extractor import (
                extract_text_via_modal,
                is_modal_pdf_enabled,
            )

            if is_modal_pdf_enabled():
                try:
                    cv_text = await extract_text_via_modal(content)
                    logger.info(f"[cv_adapter] PDF text extracted via Modal: {len(cv_text)} chars")
                except ValueError as user_err:
                    # PDF invalide/corrompu — erreur utilisateur, pas de fallback
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=str(user_err),
                    )
                except Exception as modal_exc:
                    logger.warning(
                        f"[cv_adapter] Modal extraction failed, falling back to local: {modal_exc}"
                    )
                    cv_analyzer = get_cv_analyzer_main()
                    cv_text = await cv_analyzer.extract_text_from_pdf(content)
                    logger.info(f"[cv_adapter] PDF text extracted via local fallback: {len(cv_text)} chars")
            else:
                cv_analyzer = get_cv_analyzer_main()
                cv_text = await cv_analyzer.extract_text_from_pdf(content)
                logger.info(f"[cv_adapter] PDF text extracted via local: {len(cv_text)} chars")
        else:
            from docx import Document
            doc = Document(io.BytesIO(content))
            cv_text = "\n".join([para.text for para in doc.paragraphs])
            logger.info(f"[cv_adapter] DOCX text extracted: {len(cv_text)} chars")
    except Exception as exc:
        logger.error(f"File text extraction failed for {filename}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from file: {str(exc)}",
        )

    # Normalize PDF extraction artifacts (pypdfium2 spaces, ligatures)
    cv_text = _normalize_pdf_text(cv_text)

    if not cv_text or len(cv_text) < 100:
        logger.warning(
            f"[cv_adapter] Insufficient text from {filename}: {len(cv_text or '')} chars (min 100). "
            "PDF may be image-based (scanned) or have unsupported encoding."
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Impossible d'extraire suffisamment de texte du fichier ({len(cv_text or '')} caractères extraits, "
                "minimum 100 requis). Assurez-vous que votre PDF n'est pas un scan ou une image."
            ),
        )
    
    # Now adapt
    agent = get_adapter_agent()
    result = await agent.run(
        cv_text=cv_text,
        job_description=job_description,
        language=language,
        template=template,
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV adaptation failed"),
        )
    
    # Return based on output format
    if output_format == "pdf":
        pdf_gen = get_pdf_generator()
        pdf_bytes = pdf_gen.generate(
            cv_data=result.get("cv_data", {}),
            template=template,
            language=language,
        )
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=cv_adapted.pdf"},
        )
    
    return {
        "success": True,
        "cv_data": result.get("cv_data"),
        "match_score": result.get("match_score"),
        "job_analysis": result.get("job_analysis"),
    }


@router.post("/quick-adapt")
async def quick_adapt_cv(
    cv_text: str = Form(...),
    job_description: str = Form(...),
    language: str = Form(default="en"),
):
    """
    Quick CV adaptation without full fact-checking.
    
    Faster but less thorough. Good for previews.
    """
    agent = get_adapter_agent()
    
    result = await agent.quick_adapt(
        cv_text=cv_text,
        job_description=job_description,
        language=language,
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Quick adaptation failed"),
        )
    return result


class PDFRequest(BaseModel):
    """Request model for PDF generation."""
    cv_data: dict
    template: str = "ats"
    language: str = "fr"
    photo: str | None = None  # Base64 encoded photo


@router.post("/generate-pdf")
async def generate_pdf_from_data(request: PDFRequest):
    """
    Generate PDF from structured CV data.
    
    Templates:
    - ats: Simple 1-column, ATS-optimized (no photo)
    - modern: 2-column design with sidebar (with photo)
    - classic: Traditional design (optional photo)
    """
    try:
        logger.info(f"[PDFGenerator] Generating {request.template} PDF...")
        pdf_bytes = generate_pdf_sync(
            cv_data=request.cv_data, 
            template=request.template, 
            language=request.language,
            photo_base64=request.photo
        )
        logger.info(f"[PDFGenerator] PDF generated successfully, size: {len(pdf_bytes)} bytes")
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    
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
    job_description: str
    language: str = "fr"
    company_name: str | None = None


@router.post("/generate-cover-letter")
async def generate_cover_letter(request: CoverLetterRequest, authorization: Optional[str] = Header(default=None)):
    """
    Generate a personalized cover letter from CV data and job description.
    
    Returns a PDF cover letter tailored to the specific job.
    """
    agent = get_adapter_agent()

    try:
        await _incr_active()
    except Exception:
        pass

    try:
        result = await agent.generate_cover_letter(
            cv_data=request.cv_data,
            job_description=request.job_description,
            language=request.language,
            company_name=request.company_name or "",
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Cover letter generation failed"),
        )

    # Generate PDF from cover letter content
    try:
        pdf_gen = get_pdf_generator()
        pdf_bytes = pdf_gen.generate_cover_letter(
            letter_data=result,
            language=request.language,
        )
        logger.info(f"[CoverLetter] PDF generated successfully, size: {len(pdf_bytes)} bytes")
    except Exception as e:
        logger.error(f"Cover letter PDF generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    
    # Get candidate name for filename
    name = request.cv_data.get("personal_info", {}).get("name", "candidate")
    safe_name = "".join(c for c in name if c.isalnum() or c in " -_").strip()
    filename = f"Lettre_Motivation_{safe_name}.pdf" if safe_name else "cover_letter.pdf"

    user_info = get_user_info_from_token(authorization)
    if user_info and user_info.get("email"):
        try:
            job_title = result.get("job_title") or request.job_description.split("\n")[0][:60] or "Poste"
            send_document_generated(user_info["email"], "cover_letter", job_title, request.company_name or "")
        except Exception:
            pass

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/generate-cover-letter/json")
async def generate_cover_letter_json(request: CoverLetterRequest):
    """
    Generate cover letter and return JSON data (for preview).
    """
    agent = get_adapter_agent()

    try:
        active = await _incr_active()
    except Exception:
        active = 0

    if active > CV_ADAPT_SYNC_THRESHOLD:
        await _decr_active()
        pool = await _get_arq_pool()
        if pool:
            try:
                job_title = request.job_description.split("\n")[0][:60] if request.job_description else None
                job = await pool.enqueue_job(
                    "cover_letter_task",
                    cv_text=json.dumps(request.cv_data, ensure_ascii=False),
                    job_description=request.job_description,
                    language=request.language,
                    company_name=request.company_name,
                    job_title=job_title,
                )
                logger.info(f"[cv_adapter/cover-letter-json] ARQ queued — active={active} job={job.job_id}")
                return {"queued": True, "job_id": job.job_id, "estimated_wait_seconds": active * 8}
            except Exception as e:
                logger.warning(f"[cv_adapter/cover-letter-json] ARQ enqueue failed ({e}) — fallback sync")
        await _incr_active()

    # Mode synchrone
    try:
        result = await agent.generate_cover_letter(
            cv_data=request.cv_data,
            job_description=request.job_description,
            language=request.language,
            company_name=request.company_name or "",
        )
    finally:
        await _decr_active()

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Cover letter generation failed"),
        )

    return {
        "success": True,
        "cover_letter": result,
    }


class CoverLetterFromDataRequest(BaseModel):
    """Request model for generating cover letter PDF from pre-structured data."""
    cover_letter_data: dict
    language: str = "fr"


@router.post("/generate-cover-letter/pdf-from-data")
async def generate_cover_letter_pdf_from_data(request: CoverLetterFromDataRequest):
    """
    Generate cover letter PDF directly from structured data (no LLM call).
    Used to regenerate PDF after user edits cover letter fields.
    """
    try:
        pdf_gen = get_pdf_generator()
        pdf_bytes = pdf_gen.generate_cover_letter(
            letter_data=request.cover_letter_data,
            language=request.language,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=cover_letter.pdf"},
        )
    except Exception as e:
        logger.error(f"Cover letter PDF from data failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
