
import logging

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.api.deps import get_user_id_from_token
from src.api.middleware import limiter
from src.config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Lazy init: avoid crash at import time if Groq/SerpAPI not configured
_service = None

def _get_service():
    global _service
    if _service is None:
        from src.services.recruiter_finder.insider_service import InsiderFinderService
        _service = InsiderFinderService()
    return _service

# ============================================================================
# Schemas
# ============================================================================

class InsiderSearchRequest(BaseModel):
    job_title: str = Field(..., example="Data Analyst")
    company: str = Field(..., example="La Banque Postale")
    city: str | None = Field("", example="Paris")
    is_alternance: bool = Field(False, description="True if it is a student/work-study job")

# ============================================================================
# Routes
# ============================================================================

@router.post("/find", deprecated=True)
@limiter.limit("5/minute")
async def find_insiders(
    http_request: Request,
    request: InsiderSearchRequest,
    authorization: str | None = Header(None),
):
    """
    Find company insiders (recruiters, colleagues) using AI strategy and Google/LinkedIn search.
    Requires authentication — calls SerpAPI/Google (paid service).
    """
    try:
        user_id = get_user_id_from_token(authorization)
        if not user_id:
            return JSONResponse(
                status_code=401,
                content={"success": False, "detail": "Authentication required", "insiders": [], "total_found": 0},
            )

        # Check SerpAPI key is configured
        serpapi_key = settings.get_serpapi_key()
        if not serpapi_key:
            logger.error("[InsiderFinderAPI] SERPAPI_KEY not configured")
            return JSONResponse(
                status_code=503,
                content={"success": False, "detail": "Insider search is temporarily unavailable (SERPAPI_KEY missing)", "insiders": [], "total_found": 0},
            )

        service = _get_service()
        result = await service.find_insiders(
            job_title=request.job_title,
            company=request.company,
            city=request.city or "",
            is_alternance=request.is_alternance,
        )

        if not result.get("success"):
            logger.warning(f"[InsiderFinderAPI] Search failed: {result.get('error')}")
            return {
                "success": False,
                "strategy": "",
                "insiders": [],
                "total_found": 0,
            }

        return result

    except Exception as e:
        logger.error(f"[InsiderFinderAPI] {type(e).__name__}: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "detail": f"Insider search error: {type(e).__name__}: {str(e)[:200]}", "insiders": [], "total_found": 0},
        )
