"""
Recruiter Finder API Routes
============================
Expose recruiter contact discovery via SerpAPI + RapidAPI validation.
"""

import logging
import os
from typing import Any

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from supabase import Client, create_client

from src.api.deps import get_user_id_from_token
from src.services.recruiter_finder import (
    extract_domain,
    find_recruiters_serpapi,
)
from src.services.stripe import invalidate_user_quota_cache

logger = logging.getLogger(__name__)

router = APIRouter()

# ============================================================================
# Supabase client for quota management
# ============================================================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if SUPABASE_URL and SUPABASE_KEY:
    supabase_client: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase_client = None
    logger.warning("Supabase not configured for quota management (recruiter_finder)")


# ============================================================================
# Quota helpers
# ============================================================================


def check_recruiter_search_quota(user_id: str) -> None:
    """
    Vérifie le quota recruiter_search de l'utilisateur.
    Lève HTTP 429 si le quota est dépassé.
    """
    if not supabase_client:
        return  # Dev mode — pas de Supabase configuré
    try:
        result = supabase_client.rpc("get_quota_status", {"p_user_id": user_id}).execute()
        if not result.data:
            return
        for row in result.data:
            if row.get("feature") == "recruiter_search":
                if not row.get("has_access", True):
                    raise HTTPException(
                        status_code=429,
                        detail={
                            "code": "QUOTA_EXCEEDED",
                            "feature": "recruiter_search",
                            "limit": row.get("quota_limit"),
                            "used": row.get("quota_used"),
                            "reset_at": str(row.get("reset_at", "")),
                            "message": "Quota de recherche recruteur atteint (3/jour en version gratuite). Passez à Pro pour un accès illimité.",
                        }
                    )
                return
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[quota] recruiter_search check failed for {user_id}, allowing through: {e}")


def increment_recruiter_search_quota(user_id: str) -> bool:
    """
    Incrémente le quota recruiter_search de l'utilisateur via Supabase RPC.
    """
    if not supabase_client:
        return False
    try:
        response = supabase_client.rpc(
            "increment_usage",
            {
                "p_user_id": user_id,
                "p_feature": "recruiter_search",
                "p_amount": 1,
            }
        ).execute()
        success = bool(response.data) if response.data else False
        if success:
            logger.info(f"[quota] Incremented recruiter_search quota for user {user_id}")
        else:
            logger.warning(f"[quota] Failed to increment recruiter_search quota for user {user_id}")
        return success
    except Exception as e:
        logger.error(f"[quota] Error incrementing recruiter_search quota for {user_id}: {e}")
        return False


# ============================================================================
# Schemas
# ============================================================================


class RecruiterFinderRequest(BaseModel):
    company_name: str
    company_website: str | None = ""
    company_domain: str | None = ""
    job_title: str | None = ""


class ContactItem(BaseModel):
    name: str
    email: str
    position: str | None = None
    department: str | None = None
    seniority: str | None = None
    confidence: int = 0
    linkedin: str | None = None
    role: str = "other"
    source: str = "hunter"
    email_verified: bool = False


class RecruiterFinderResponse(BaseModel):
    company: str
    domain: str
    email_pattern: str | None = None
    recruiters: list[ContactItem]
    tech_team: list[ContactItem]
    all_contacts: list[ContactItem]
    total_found: int
    source: str = "serpapi"
    validation_summary: dict[str, Any] | None = None
    search_strategy: str | None = None
    search_queries: list[dict[str, Any]] | None = None


# ============================================================================
# Routes
# ============================================================================


@router.post("/find", response_model=RecruiterFinderResponse, deprecated=True)
async def find_recruiters(
    body: RecruiterFinderRequest,
    authorization: str | None = Header(default=None),
):
    """
    Discover recruiter contacts at a company using SerpAPI + RapidAPI validation.

    Returns HR/recruiter contacts with LinkedIn URLs (emails suppressed).

    Requires authentication. Subject to daily quota (3/day on free plan).
    """
    # Auth
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to search for recruiter contacts",
        )

    if not body.company_name or not body.company_name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="company_name is required",
        )

    # Quota check — bloque si limite journalière dépassée
    check_recruiter_search_quota(user_id)

    try:
        # Resolve domain from website or domain field
        domain = ""
        if body.company_domain:
            domain = extract_domain(body.company_domain)
        elif body.company_website:
            domain = extract_domain(body.company_website)

        result = await find_recruiters_serpapi(
            company_name=body.company_name,
            company_domain=domain,
            job_title=body.job_title or "",
        )
        result.setdefault("source", "serpapi")

        _enrich_contact_metadata(result)

        # Incrémenter le quota après succès
        increment_recruiter_search_quota(user_id)
        await invalidate_user_quota_cache(user_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RecruiterFinder] Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to search for recruiter contacts",
        ) from None


# ============================================================================
# Helpers
# ============================================================================


def _enrich_contact_metadata(result: dict) -> None:
    """Normalize contact metadata based on source."""
    source = result.get("source", "serpapi")
    contacts = result.get("recruiters", []) + result.get("tech_team", []) + result.get("all_contacts", [])
    for contact in contacts:
        if source == "apollo":
            contact["email_verified"] = contact.get("email_status") == "verified"
        else:
            contact["email"] = ""
            contact["email_verified"] = False
        contact.setdefault("source", source)
