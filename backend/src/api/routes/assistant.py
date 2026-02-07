"""
Multi-Assistant API Routes
===========================
Unified endpoints for all assistant types (career-coach, job-scout, cv-analyzer, cv-adapter, interview-sim).
Handles routing to the appropriate agent based on assistant_type parameter.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.api.deps import (
    CoachAgentDep,
    ScoutAgentDep,
    CVAgentDep,
    CVAdapterAgentDep,
    InterviewSimAgentDep,
    get_session_history,
    update_session_history,
)

router = APIRouter()

# ============================================================================
# Schemas
# ============================================================================

class AssistantRequest(BaseModel):
    """Request for any assistant type."""
    message: str = Field(..., description="User message")
    session_id: str = Field(..., description="Session ID for conversation history")
    assistant_type: Literal[
        "career-coach",
        "job-scout",
        "cv-analyzer",
        "cv-adapter",
        "interview-sim"
    ] = Field(..., description="Type of assistant to use")
    language: str = Field(default="fr", description="Response language (fr/en)")

    # Optional context data for specific assistants
    cv_data: dict | None = Field(default=None, description="CV data for cv-analyzer/cv-adapter")
    job_description: str | None = Field(default=None, description="Job description for cv-adapter")
    job_info: dict | None = Field(default=None, description="Job info for interview-sim")


class AssistantResponse(BaseModel):
    """Response from any assistant type."""
    success: bool
    response: str
    agent: str = Field(description="Which agent handled the request")
    language: str = "fr"
    metadata: dict | None = None


# ============================================================================
# Routes
# ============================================================================

@router.post("/job-scout", response_model=AssistantResponse)
async def job_scout_chat(
    request: AssistantRequest,
    agent: ScoutAgentDep,
):
    """
    Chat with the Job Search expert.

    Provides conversational guidance on job search strategies,
    market insights, and personalized recommendations.
    """
    # Get conversation history
    history = get_session_history(request.session_id)

    # Run conversational agent
    result = await agent.run(
        message=request.message,
        history=history,
        language=request.language,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Job Scout error"),
        )

    # Update history
    update_session_history(
        request.session_id,
        request.message,
        result["response"],
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="job-scout",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/cv-analyzer", response_model=AssistantResponse)
async def cv_analyzer_chat(
    request: AssistantRequest,
    agent: CVAgentDep,
):
    """
    Chat with the CV Analysis expert.

    Provides conversational CV analysis, scoring, and improvement recommendations.
    Can guide users through the CV optimization process step by step.
    """
    # Get conversation history
    history = get_session_history(request.session_id)

    # Run conversational agent
    result = await agent.run(
        message=request.message,
        history=history,
        language=request.language,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV Analyzer error"),
        )

    # Update history
    update_session_history(
        request.session_id,
        request.message,
        result["response"],
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="cv-analyzer",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/cv-adapter", response_model=AssistantResponse)
async def cv_adapter_chat(
    request: AssistantRequest,
    agent: CVAdapterAgentDep,
):
    """
    Chat with the CV Adaptation specialist.

    Provides conversational guidance for adapting CVs to specific job offers.
    Guides users through the adaptation process with strategic recommendations.
    """
    # Get conversation history
    history = get_session_history(request.session_id)

    # Run conversational agent
    result = await agent.run(
        message=request.message,
        history=history,
        language=request.language,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "CV Adapter error"),
        )

    # Update history
    update_session_history(
        request.session_id,
        request.message,
        result["response"],
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="cv-adapter",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/interview-sim", response_model=AssistantResponse)
async def interview_sim_chat(
    request: AssistantRequest,
    agent: InterviewSimAgentDep,
):
    """
    Chat with the Interview Simulation recruiter.

    [PREMIUM FEATURE]
    Provides realistic interview practice with a professional recruiter simulation.
    Includes behavioral questions, technical questions, and constructive feedback.
    """
    # Get conversation history
    history = get_session_history(request.session_id)

    # Run conversational agent
    result = await agent.run(
        message=request.message,
        history=history,
        language=request.language,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Interview Simulator error"),
        )

    # Update history
    update_session_history(
        request.session_id,
        request.message,
        result["response"],
    )

    return AssistantResponse(
        success=True,
        response=result["response"],
        agent="interview-sim",
        language=result.get("language", request.language),
        metadata=result.get("metadata"),
    )


@router.post("/new-session")
async def create_assistant_session():
    """Create a new assistant chat session."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id, "created_at": "now"}


@router.delete("/session/{session_id}")
async def delete_assistant_session(session_id: str):
    """Clear an assistant chat session."""
    from src.api.deps import clear_session
    clear_session(session_id)
    return {"success": True, "message": f"Session {session_id} cleared"}
