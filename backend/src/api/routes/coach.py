"""
Career Coach API Routes
========================
Endpoints for AI career coaching.
"""

import uuid

from fastapi import APIRouter, HTTPException, status, Request, Depends

from src.api.deps import (
    CoachAgentDep,
    get_session_history,
    update_session_history,
    clear_session,
    get_current_user,
)
from src.api.middleware import limiter
from src.models.schemas import CoachRequest, CoachResponse
from pydantic import BaseModel, Field
from structlog import get_logger

logger = get_logger(__name__)

# Pydantic models for sync-time endpoint
class CoachTimeSyncRequest(BaseModel):
    seconds_used: int = Field(..., ge=0, description="Number of seconds used in this sync period")


class CoachTimeSyncResponse(BaseModel):
    success: bool
    coach_quota: dict

router = APIRouter()


@router.post("/chat", response_model=CoachResponse)
@limiter.limit("30/minute")  # Rate limit: 30 messages per minute per IP
async def coach_chat(
    request: Request,  # Required for rate limiting
    data: CoachRequest,
    agent: CoachAgentDep,
):
    """
    Chat with the Career Coach AI.

    The coach provides personalized career advice, training recommendations,
    and guidance for professional development.
    """
    # Get conversation history
    history = get_session_history(data.session_id)

    # Run agent
    result = await agent.run(
        message=data.message,
        history=history,
        language=data.language,
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


@router.post("/sync-time", response_model=CoachTimeSyncResponse)
async def sync_coach_time(
    data: CoachTimeSyncRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Sync coach time usage from frontend to backend.

    Called periodically (every 2 minutes) during active coach sessions
    to ensure time usage is tracked even if browser crashes or closes.

    This prevents users from losing quota tracking if their session
    ends unexpectedly.

    Args:
        data: Contains seconds_used in this sync period
        current_user: Authenticated user from JWT token

    Returns:
        Success status and updated coach quota information

    Raises:
        HTTPException: If sync fails or user not authenticated
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        if data.seconds_used < 0:
            raise HTTPException(status_code=400, detail="Invalid time value")

        logger.info(f"Syncing coach time for user {user_id}: {data.seconds_used}s")

        # Import quota functions
        try:
            from app.quota import increment_user_usage, get_user_quota_status
        except ImportError:
            raise HTTPException(status_code=500, detail="Quota module not available")

        # Increment usage in database
        success = await increment_user_usage(user_id, "coach", data.seconds_used)

        if not success:
            logger.error(f"Failed to increment coach usage for user {user_id}")
            raise HTTPException(status_code=500, detail="Failed to sync time")

        # Get updated quota status
        quota_status = await get_user_quota_status(user_id)
        coach_quota = quota_status.get("coach", {})

        logger.info(f"Coach time synced successfully for user {user_id}: {data.seconds_used}s")

        return {
            "success": True,
            "coach_quota": coach_quota
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Coach time sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
