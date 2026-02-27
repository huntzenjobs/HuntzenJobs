
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.services.recruiter_finder.insider_service import InsiderFinderService

logger = logging.getLogger(__name__)

router = APIRouter()
service = InsiderFinderService()

# ============================================================================
# Schemas
# ============================================================================

class InsiderContact(BaseModel):
    name: str
    title: str
    link: str
    snippet: str
    category: str
    label: str

class InsiderSearchRequest(BaseModel):
    job_title: str = Field(..., example="Data Analyst")
    company: str = Field(..., example="La Banque Postale")
    city: Optional[str] = Field("", example="Paris")
    is_alternance: bool = Field(False, description="True if it is a student/work-study job")

class InsiderSearchResponse(BaseModel):
    success: bool
    strategy: str
    insiders: List[InsiderContact]
    total_found: int

# ============================================================================
# Routes
# ============================================================================

@router.post("/find", response_model=InsiderSearchResponse)
async def find_insiders(request: InsiderSearchRequest):
    """
    Find company insiders (recruiters, colleagues) using AI strategy and Google/LinkedIn search.
    """
    try:
        result = await service.find_insiders(
            job_title=request.job_title,
            company=request.company,
            city=request.city or "",
            is_alternance=request.is_alternance
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Failed to find insiders")
            )
            
        return result
        
    except Exception as e:
        logger.error(f"[InsiderFinderAPI] Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
