"""
Saved Recruiter Contacts API Routes
===================================
Allow users to save recruiter contacts found via recruiter finder
and retrieve them later from a dedicated "saved contacts" tab.
"""

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from src.api.deps import get_supabase_client
from src.api.middleware import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


class SaveRecruiterContactRequest(BaseModel):
    """Payload sent by the frontend when saving a recruiter contact."""

    name: str | None = None
    email: str | None = None
    position: str | None = None
    company: str
    linkedin_url: str | None = None
    source: str | None = "recruiter_finder"


def get_user_id_from_header(authorization: str | None) -> str | None:
    """Extract user ID from Authorization header (Supabase JWT)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "")

    try:
        supabase_anon = get_supabase_client()
        response = supabase_anon.auth.get_user(token)
        if response and response.user:
            return response.user.id
    except Exception as e:  # pragma: no cover - defensive
        logger.error(f"[saved_recruiters] Error getting user ID: {e}")

    return None


@router.get("/api/saved-recruiters")
@limiter.limit("60/minute")
async def get_saved_recruiter_contacts(
    request: Request, authorization: str | None = Header(None)
) -> dict[str, Any]:
    """Return all saved recruiter contacts for the authenticated user."""
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        supabase = get_supabase_client()
        response = (
            supabase.table("saved_recruiter_contacts")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"success": True, "contacts": response.data or []}
    except Exception as e:  # pragma: no cover - defensive
        logger.error(f"[saved_recruiters] Error fetching contacts: {e}")
        return {"success": True, "contacts": []}


@router.post("/api/saved-recruiters")
@limiter.limit("30/minute")
async def save_recruiter_contact(
    request: Request,
    body: SaveRecruiterContactRequest,
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    """Save a recruiter contact for the current user.

    If a contact with the same (user_id, email, company) already exists,
    the existing row is returned instead of creating a duplicate.
    """
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        supabase = get_supabase_client()

        # If we have an email, check for an existing saved contact
        existing = None
        if body.email:
            existing_resp = (
                supabase.table("saved_recruiter_contacts")
                .select("*")
                .eq("user_id", user_id)
                .eq("email", body.email)
                .eq("company", body.company)
                .limit(1)
                .execute()
            )
            if existing_resp.data:
                existing = existing_resp.data[0]

        if existing:
            return {"success": True, "contact": existing, "already_saved": True}

        insert_resp = (
            supabase.table("saved_recruiter_contacts")
            .insert(
                {
                    "user_id": user_id,
                    "name": body.name,
                    "email": body.email,
                    "position": body.position,
                    "company": body.company,
                    "linkedin_url": body.linkedin_url,
                    "source": body.source or "recruiter_finder",
                }
            )
            .execute()
        )

        inserted = insert_resp.data[0] if insert_resp.data else None
        return {"success": True, "contact": inserted}
    except Exception as e:  # pragma: no cover - defensive
        logger.error(f"[saved_recruiters] Error saving contact: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save recruiter contact",
        ) from None


@router.delete("/api/saved-recruiters/{contact_id}")
@limiter.limit("30/minute")
async def delete_saved_recruiter_contact(
    request: Request,
    contact_id: str,
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    """Delete a saved recruiter contact for the current user by ID."""
    user_id = get_user_id_from_header(authorization)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    try:
        supabase = get_supabase_client()
        supabase.table("saved_recruiter_contacts").delete().eq("id", contact_id).eq(
            "user_id", user_id
        ).execute()
        return {"success": True}
    except Exception as e:  # pragma: no cover - defensive
        logger.error(f"[saved_recruiters] Error deleting contact {contact_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete recruiter contact",
        ) from None
