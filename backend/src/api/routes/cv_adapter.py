"""
CV Adapter API Routes
======================
Endpoints for smart CV adaptation to job offers.
"""

import io
import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from src.api.deps import get_cv_adapter_main
from src.services.pdf_generator import get_pdf_generator

logger = logging.getLogger(__name__)

router = APIRouter()


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
    cv_text: str = Form(..., description="Original CV content as text"),
    job_description: str = Form(..., description="Target job description"),
    language: str = Form(default="en", description="Output language (en/fr)"),
    template: str = Form(default="ats", description="Template (ats/modern)"),
):
    """
    Adapt a CV to match a specific job offer.
    
    This endpoint uses AI to:
    1. Analyze job requirements and keywords
    2. Map CV experiences to job needs
    3. Rewrite content using job's vocabulary
    4. Fact-check to ensure no hallucinations
    
    Returns structured CV data with match analysis.
    """
    agent = get_adapter_agent()
    
    # Validate inputs
    if len(cv_text) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CV text too short. Please provide a complete CV.",
        )
    
    if len(job_description) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job description too short. Please provide a complete job posting.",
        )
    
    # Run adaptation
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
    
    return {
        "success": True,
        "cv_data": result.get("cv_data"),
        "match_score": result.get("match_score"),
        "job_analysis": result.get("job_analysis"),
        "fact_check": result.get("fact_check"),
    }


@router.post("/adapt/pdf")
async def adapt_cv_to_pdf(
    cv_text: str = Form(..., description="Original CV content as text"),
    job_description: str = Form(..., description="Target job description"),
    language: str = Form(default="en", description="Output language (en/fr)"),
    template: str = Form(default="ats", description="Template (ats/modern)"),
):
    """
    Adapt CV and generate PDF directly.
    
    Templates:
    - ats: Simple 1-column, ATS-optimized (90%+ score)
    - modern: Beautiful 2-column design (for direct contact)
    
    Returns a downloadable PDF file with the adapted CV.
    """
    agent = get_adapter_agent()
    
    # Validate inputs
    if len(cv_text) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CV text too short",
        )
    
    if len(job_description) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job description too short",
        )
    
    # Run adaptation
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
    from src.api.deps import get_cv_agent
    
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
    
    # Extract text using CV Analyzer agent
    cv_analyzer = get_cv_agent()

    try:
        if filename.endswith(".pdf"):
            cv_text = await cv_analyzer.extract_text_from_pdf(content)
        else:
            from docx import Document
            doc = Document(io.BytesIO(content))
            cv_text = "\n".join([para.text for para in doc.paragraphs])
    except Exception as exc:
        logger.error(f"File text extraction failed for {filename}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from file: {str(exc)}",
        )

    if not cv_text or len(cv_text) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract sufficient text from file",
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
async def generate_cover_letter(request: CoverLetterRequest):
    """
    Generate a personalized cover letter from CV data and job description.
    
    Returns a PDF cover letter tailored to the specific job.
    """
    agent = get_adapter_agent()
    
    result = await agent.generate_cover_letter(
        cv_data=request.cv_data,
        job_description=request.job_description,
        language=request.language,
        company_name=request.company_name or "",
    )
    
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
    
    result = await agent.generate_cover_letter(
        cv_data=request.cv_data,
        job_description=request.job_description,
        language=request.language,
        company_name=request.company_name or "",
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Cover letter generation failed"),
        )
    
    return {
        "success": True,
        "cover_letter": result,
    }


@router.post("/preview")
async def preview_cv(
    cv_data: dict,
    template: str = "ats",
    compact: bool = False,
):
    """
    Generate HTML preview of CV.
    
    Returns HTML string for web display.
    """
    pdf_gen = get_pdf_generator()
    
    html_content = pdf_gen.generate_preview_html(
        cv_data=cv_data,
        template=template,
        compact=compact,
    )
    
    return Response(
        content=html_content,
        media_type="text/html",
    )
