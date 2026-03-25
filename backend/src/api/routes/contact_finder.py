"""
Contact Finder API
===================
Unified endpoint combining Apollo, SerpAPI/Groq, and Hunter.io
with Supabase caching and guaranteed LinkedIn fallback.
"""

import logging

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.api.deps import get_user_id_from_token
from src.api.middleware import limiter
from src.api.routes.recruiter_finder import (
    check_recruiter_search_quota,
    increment_recruiter_search_quota,
)
from src.services.recruiter_finder.contact_finder_service import find_contacts
from src.services.stripe import invalidate_user_quota_cache

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================


class ContactFinderRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    company_domain: str | None = None
    company_website: str | None = None
    job_title: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=100)
    country_code: str | None = Field("fr", min_length=2, max_length=3)
    is_alternance: bool = False
    force_refresh: bool = False


class ContactFinderContact(BaseModel):
    name: str
    position: str | None = None
    email: str | None = None
    email_verified: bool = False
    linkedin_url: str | None = None
    confidence: int = 0
    category: str = "other"
    source: str = "apollo"


class ContactFinderResponse(BaseModel):
    company: str
    domain: str | None = None
    email_pattern: str | None = None
    contacts: list[ContactFinderContact]
    total_found: int
    sources_used: list[str]
    linkedin_company_url: str
    strategy: str | None = None
    cached: bool = False
    cached_at: str | None = None


# ============================================================================
# Route
# ============================================================================


@router.post("/find", response_model=ContactFinderResponse)
@limiter.limit("10/minute")
async def find_contacts_endpoint(
    request: Request,
    body: ContactFinderRequest,
    authorization: str | None = Header(default=None),
):
    """
    Unified contact finder: Apollo (primary) -> SerpAPI/Groq -> Hunter (email).
    Cached for 30 days. Includes LinkedIn company page fallback.
    """
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    if not body.company_name or not body.company_name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="company_name is required",
        )

    # Quota check (reuse existing recruiter_search quota)
    check_recruiter_search_quota(user_id)

    try:
        result = await find_contacts(
            company_name=body.company_name.strip(),
            company_domain=body.company_domain,
            company_website=body.company_website,
            job_title=body.job_title,
            city=body.city,
            country_code=body.country_code,
            is_alternance=body.is_alternance,
            force_refresh=body.force_refresh,
        )

        # Don't increment quota if result came from cache
        if not result.get("cached"):
            increment_recruiter_search_quota(user_id)
            await invalidate_user_quota_cache(user_id)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ContactFinder] Unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Contact search failed",
        ) from None
