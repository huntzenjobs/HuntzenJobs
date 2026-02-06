"""
CV Analysis API Routes
=======================
Endpoints for AI-powered CV analysis.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status
from typing import Optional

from src.api.deps import CVAgentDep
from src.models.schemas import CVAnalysisRequest, CVAnalysisResponse, ATSScore

router = APIRouter()


@router.post("/analyze", response_model=CVAnalysisResponse)
async def analyze_cv(
    request: CVAnalysisRequest,
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
        cv_text=request.cv_text,
        job_description=request.job_description,
        language=request.language,
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
async def analyze_cv_file(
    agent: CVAgentDep,
    file: UploadFile = File(..., description="CV file (PDF or DOCX)"),
    job_description: Optional[str] = Form(default=None),
    language: str = Form(default="en"),
):
    """
    Analyze a CV from an uploaded file.
    
    Supports PDF and DOCX formats.
    Uses IBM Docling for high-quality PDF extraction.
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
