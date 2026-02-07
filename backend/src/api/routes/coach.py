"""
Career Coach API Routes
========================
Endpoints for AI career coaching.
"""

import uuid

from fastapi import APIRouter, HTTPException, status, Request

from src.api.deps import (
    CoachAgentDep,
    get_session_history,
    update_session_history,
    clear_session,
)
from src.api.middleware import limiter
from src.models.schemas import CoachRequest, CoachResponse

router = APIRouter()


@router.post("/chat", response_model=CoachResponse)
@limiter.limit("30/minute")  # Rate limit: 30 messages per minute per IP
async def coach_chat(
    req: Request,  # Required for rate limiting
    request: CoachRequest,
    agent: CoachAgentDep,
):
    """
    Chat with the Career Coach AI.
    
    The coach provides personalized career advice, training recommendations,
    and guidance for professional development.
    """
    # Get conversation history
    history = get_session_history(request.session_id)
    
    # Run agent
    result = await agent.run(
        message=request.message,
        history=history,
        language=request.language,
        deep_analysis=True,
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Unknown error"),
        )
    
    # Update history
    update_session_history(
        request.session_id,
        request.message,
        result["response"],
    )
    
    return CoachResponse(
        success=True,
        response=result["response"],
        language=result.get("language", request.language),
        training_suggestions=result.get("training_suggestions", []),
        career_insights=result.get("career_insights", {}),
    )


@router.post("/training-recommendations")
async def get_training_recommendations(
    agent: CoachAgentDep,
    domain: str,
    level: str = "intermediate",
    budget: str = "mixed",
):
    """
    Get targeted training recommendations for a domain.
    
    Args:
        domain: Career domain (data, dev, security, cloud, etc.)
        level: Current level (beginner, intermediate, advanced)
        budget: Budget constraint (free, paid, mixed)
    """
    recommendations = await agent.get_training_recommendations(
        domain=domain,
        current_level=level,
        budget=budget,
    )
    
    return {
        "success": True,
        "domain": domain,
        "level": level,
        "recommendations": recommendations,
    }


@router.post("/career-plan")
async def generate_career_plan(
    agent: CoachAgentDep,
    current_role: str,
    target_role: str,
    years: int = 5,
):
    """
    Generate a career progression plan.
    
    Args:
        current_role: Current job title
        target_role: Target job title
        years: Planning horizon in years
    """
    plan = await agent.plan_career_path(
        current_role=current_role,
        target_role=target_role,
        years=years,
    )
    
    return {
        "success": True,
        "current_role": current_role,
        "target_role": target_role,
        "years": years,
        "plan": plan,
    }


@router.post("/new-session")
async def create_session():
    """Create a new chat session."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id}


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Clear a chat session."""
    clear_session(session_id)
    return {"success": True, "message": "Session cleared"}
