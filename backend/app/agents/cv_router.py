"""
CV Agent Router - Dual System for Safe Migration
=================================================
Allows switching between legacy and new CV analysis systems.

Feature flag controls which system is active:
- "legacy": Original monolithic CV analyzer (Marker PDF)
- "new": New sub-agent architecture (IBM Docling)
"""

import logging
from typing import Any, Literal, Optional

logger = logging.getLogger(__name__)

# Feature flag - Change to switch systems
CV_SYSTEM: Literal["legacy", "new"] = "new"


def get_cv_agent():
    """
    Get the active CV analyzer agent based on feature flag.

    Returns:
        CVAnalyzerAgent: Either legacy or new implementation
    """
    if CV_SYSTEM == "new":
        logger.info("[CV Router] Using NEW CV analysis system (Docling + Sub-agents)")
        from src.agents.cv_analyzer.main_agent import get_cv_analyzer
        return get_cv_analyzer()
    else:
        logger.info("[CV Router] Using LEGACY CV analysis system (Marker PDF)")
        from app.agents.cv_analyzer_agent_legacy import CVAnalyzerAgent
        return CVAnalyzerAgent()


async def analyze_cv(
    cv_text: str,
    job_description: Optional[str] = None,
    language: str = "fr",
) -> dict[str, Any]:
    """
    Unified CV analysis interface.

    Args:
        cv_text: CV content as text
        job_description: Optional job description for matching
        language: Response language ('fr' or 'en')

    Returns:
        Analysis results with ATS score, skills, improvements, etc.
    """
    agent = get_cv_agent()

    if CV_SYSTEM == "new":
        # New system returns dict directly
        return await agent.run(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
        )
    else:
        # Legacy system - adapt response format if needed
        return await agent.analyze(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
        )


async def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract text from PDF using active system.

    Args:
        pdf_bytes: PDF file content

    Returns:
        Extracted text
    """
    agent = get_cv_agent()
    return await agent.extract_text_from_pdf(pdf_bytes)


async def analyze_ats_only(cv_text: str) -> dict:
    """
    Quick ATS-only analysis.

    Args:
        cv_text: CV content

    Returns:
        ATS score breakdown
    """
    agent = get_cv_agent()

    if CV_SYSTEM == "new":
        return await agent.analyze_ats_only(cv_text)
    else:
        # Legacy fallback - extract ATS from full analysis
        result = await agent.analyze(cv_text=cv_text)
        return {
            "total": result.get("ats_score", {}).get("total", 0),
            "breakdown": result.get("ats_score", {}),
        }


async def match_with_job(cv_text: str, job_description: str) -> dict:
    """
    Match CV against specific job description.

    Args:
        cv_text: CV content
        job_description: Job posting content

    Returns:
        Match analysis with score and missing skills
    """
    agent = get_cv_agent()

    if CV_SYSTEM == "new":
        return await agent.match_with_job(cv_text, job_description)
    else:
        # Legacy system includes job matching in full analysis
        result = await agent.analyze(cv_text=cv_text, job_description=job_description)
        return {
            "match_score": result.get("job_match_score", 0),
            "missing_skills": result.get("missing_skills", []),
        }
