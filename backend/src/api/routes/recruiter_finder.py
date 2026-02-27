"""
Recruiter Finder API Routes
============================
Expose Hunter.io contact discovery via a single POST endpoint.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from src.services.recruiter_finder.hunter import find_recruiters_for_job

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================


class RecruiterFinderRequest(BaseModel):
    company_name: str
    company_website: Optional[str] = ""
    company_domain: Optional[str] = ""
    job_title: Optional[str] = ""


class ContactItem(BaseModel):
    name: str
    email: str
    position: Optional[str] = None
    department: Optional[str] = None
    seniority: Optional[str] = None
    confidence: int = 0
    linkedin: Optional[str] = None
    role: str = "other"


class RecruiterFinderResponse(BaseModel):
    company: str
    domain: str
    email_pattern: Optional[str] = None
    recruiters: list[ContactItem]
    tech_team: list[ContactItem]
    all_contacts: list[ContactItem]
    total_found: int


# ============================================================================
# Routes
# ============================================================================


@router.post("/find", response_model=RecruiterFinderResponse)
async def find_recruiters(body: RecruiterFinderRequest):
    """
    Discover recruiter contacts at a company using Hunter.io.

    Returns HR/recruiter contacts, tech team members, and the email pattern
    for the company domain.
    """
    if not body.company_name or not body.company_name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="company_name is required",
        )

    try:
        result = await find_recruiters_for_job(
            company_name=body.company_name,
            company_domain=body.company_domain or "",
            company_website=body.company_website or "",
            job_title=body.job_title or "",
        )
        return result
    except Exception as e:
        logger.error(f"[RecruiterFinder] Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to search for recruiter contacts",
        )
