"""
Branding Agent API Routes
===========================
Endpoints for AI personal branding assistant (LinkedIn & X).
"""

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from structlog import get_logger

from src.api.deps import (
    BrandingAgentDep,
    clear_session,
    get_session_history,
    update_session_history,
)
from src.api.middleware import limiter

logger = get_logger(__name__)

router = APIRouter()


class BrandingRequest(BaseModel):
    """Request for branding assistant."""
    message: str = Field(..., min_length=1, max_length=3000, description="User message")
    session_id: str = Field(..., pattern=r"^[a-f0-9\-]{36}$", description="Session UUID")
    language: str = Field(default="fr", description="Response language")
    branding_state: dict | None = Field(default=None, description="Current branding profile state")


class BrandingResponse(BaseModel):
    """Response from branding assistant."""
    success: bool
    response: str
    language: str = "fr"
    branding_state: dict | None = None


@router.post("/chat", response_model=BrandingResponse)
@limiter.limit("30/minute")
async def branding_chat(
    request: Request,
    data: BrandingRequest,
    agent: BrandingAgentDep,
):
    """
    Chat with the Personal Branding AI.

    The agent guides users through building their personal brand
    on LinkedIn and X (Twitter) with a conversational state machine:
    1. Onboarding — discover background & goals
    2. Style discovery — find their writing voice
    3. Target audience — who they want to reach
    4. Generation — create personalized content
    """
    # Get conversation history
    history = get_session_history(data.session_id)

    # Run agent with branding state
    result = await agent.run(
        message=data.message,
        history=history,
        language=data.language,
        branding_state=data.branding_state,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Unknown error"),
        )

    # Update history
    update_session_history(
        data.session_id,
        data.message,
        result["response"],
    )

    return BrandingResponse(
        success=True,
        response=result["response"],
        language=result.get("language", data.language),
        branding_state=result.get("branding_state"),
    )


@router.post("/new-session")
async def create_branding_session():
    """Create a new branding session."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id}


@router.delete("/session/{session_id}")
async def delete_branding_session(session_id: str):
    """Clear a branding session."""
    clear_session(session_id)
    return {"success": True, "message": "Session cleared"}
