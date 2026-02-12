"""
CV Analysis API Routes
=======================
Endpoints for AI-powered CV analysis.
"""

import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status, Request, Header
from typing import Optional
import uuid

from src.api.deps import CVAgentDep, SupabaseClientDep, get_user_id_from_token
from src.api.middleware import limiter
from src.models.schemas import CVAnalysisRequest, CVAnalysisResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=CVAnalysisResponse)
@limiter.limit("5/minute")  # Rate limit: 5 analyses per minute per IP
async def analyze_cv(
    request: Request,  # Required for rate limiting
    data: CVAnalysisRequest,
    agent: CVAgentDep,
):
    """
    Analyze a CV with comprehensive AI analysis.
    
    Provides:
    - ATS compatibility score
    - Skill extraction
    - Improvement suggestions
    - Job matching (if job description provided)
    """
    result = await agent.run(
        cv_text=data.cv_text,
        job_description=data.job_description,
        language=data.language,
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Analysis failed"),
        )
    
    # Build improvement suggestions
    improvements = result.get("improvements", {})
    suggestions = (
        improvements.get("quick_wins", []) +
        improvements.get("content_improvements", [])
    )[:5]
    
    # Build training recommendations
    training = []
    for cert in improvements.get("recommended_certifications", [])[:3]:
        training.append({
            "name": cert.get("name", ""),
            "platform": "",
            "reason": cert.get("reason", ""),
            "level": "intermediate",
        })
    
    return CVAnalysisResponse(
        success=True,
        ats_score=result["ats_score"],
        strengths=result.get("strengths", []),
        weaknesses=result.get("weaknesses", []),
        missing_skills=result.get("skills", {}).get("gaps", []),
        improvement_suggestions=suggestions,
        training_recommendations=training,
        job_match_score=result.get("job_match", {}).get("match_score"),
        verdict=result.get("job_match", {}).get("verdict", ""),
    )


@router.post("/upload")
@limiter.limit("5/minute")  # Rate limit: 5 uploads per minute per IP
async def analyze_cv_file(
    request: Request,  # Required for rate limiting
    agent: CVAgentDep,
    supabase: SupabaseClientDep,
    file: UploadFile = File(..., description="CV file (PDF or DOCX)"),
    job_description: Optional[str] = Form(default=None),
    language: str = Form(default="en"),
    authorization: Optional[str] = Header(default=None),
):
    """
    Analyze a CV from an uploaded file with persistent storage.

    Supports PDF and DOCX formats.
    Uses IBM Docling for high-quality PDF extraction.
    Stores file in Supabase Storage for future access.
    """
    # Validate file type
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

    # Read file content
    content = await file.read()

    # Get user ID (optional - graceful for anonymous users)
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        # Generate anonymous user ID for storage organization
        user_id = f"anon_{uuid.uuid4().hex[:12]}"

    # Upload to Supabase Storage
    file_id = str(uuid.uuid4())
    file_ext = file.filename.split(".")[-1]
    storage_path = f"{user_id}/{file_id}_resume.{file_ext}"

    try:
        # Upload file to cv-uploads bucket
        supabase.storage.from_("cv-uploads").upload(
            storage_path,
            content,
            file_options={"content-type": file.content_type}
        )

        # Generate signed URL (1 hour expiration)
        signed_url_response = supabase.storage.from_("cv-uploads").create_signed_url(
            storage_path,
            3600  # 1 hour
        )
        file_url = signed_url_response.get("signedURL", "")
    except Exception as e:
        # Log error but don't fail the request (graceful degradation)
        logger.warning(f"⚠️ Storage upload failed: {e}")
        file_url = None

    # Extract text based on file type
    if filename.endswith(".pdf"):
        cv_text = await agent.extract_text_from_pdf(content)
    else:
        # DOCX handling
        import io
        from docx import Document
        doc = Document(io.BytesIO(content))
        cv_text = "\n".join([para.text for para in doc.paragraphs])

    if not cv_text or len(cv_text) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract sufficient text from file",
        )

    # Run analysis
    result = await agent.run(
        cv_text=cv_text,
        job_description=job_description,
        language=language,
    )

    # Add file URL to response if upload succeeded
    if file_url:
        result["file_url"] = file_url
        result["storage_path"] = storage_path

    return result


@router.post("/ats-score")
async def quick_ats_score(
    agent: CVAgentDep,
    cv_text: str,
):
    """
    Quick ATS score without full analysis.
    
    Returns just the ATS compatibility score and breakdown.
    """
    result = await agent.analyze_ats_only(cv_text)
    
    return {
        "success": True,
        "ats_score": result.get("total", 0),
        "breakdown": {
            "format": result.get("format_score", 0),
            "keywords": result.get("keywords_score", 0),
            "experience": result.get("experience_score", 0),
            "skills": result.get("skills_score", 0),
            "education": result.get("education_score", 0),
        },
        "details": result.get("breakdown", {}),
    }


@router.post("/match-job")
async def match_cv_to_job(
    agent: CVAgentDep,
    cv_text: str,
    job_description: str,
):
    """
    Match a CV against a specific job description.
    
    Returns match score and analysis of fit.
    """
    result = await agent.match_with_job(cv_text, job_description)
    
    return {
        "success": True,
        "match_score": result.get("match_score", 0),
        "skills_match": result.get("skills_match", 0),
        "experience_match": result.get("experience_match", 0),
        "requirements_met": result.get("requirements_met", []),
        "requirements_missing": result.get("requirements_missing", []),
        "verdict": result.get("verdict", ""),
        "recommendation": result.get("recommendation", ""),
    }
