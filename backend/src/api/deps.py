"""
API Dependencies
=================
Dependency injection for FastAPI routes.
"""

from typing import Annotated, Generator, Optional

from fastapi import Depends, Header, HTTPException, status
from supabase import create_client, Client

from src.agents.coach import CareerCoachAgent
from src.agents.job_scout.main_agent import JobScoutAgent
from src.agents.job_scout.conversational_agent import JobScoutConversationalAgent
from src.agents.cv_analyzer.conversational_agent import CVAnalyzerConversationalAgent
from src.agents.cv_adapter.conversational_agent import CVAdapterConversationalAgent
from src.agents.interview_sim.conversational_agent import InterviewSimAgent
from src.config.settings import Settings, get_settings


def get_settings_dep() -> Settings:
    """Get application settings."""
    return get_settings()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


# Session storage (in-memory for now)
_sessions: dict[str, list[dict]] = {}


def get_session_history(session_id: str) -> list[dict]:
    """Get conversation history for a session."""
    if session_id not in _sessions:
        _sessions[session_id] = []
    return _sessions[session_id]


def update_session_history(
    session_id: str,
    user_message: str,
    assistant_response: str,
) -> None:
    """Update conversation history."""
    history = get_session_history(session_id)
    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": assistant_response})
    
    # Keep only last 10 exchanges
    if len(history) > 20:
        _sessions[session_id] = history[-20:]


def clear_session(session_id: str) -> None:
    """Clear a session's history."""
    if session_id in _sessions:
        del _sessions[session_id]


# Agent singletons
_coach_agent: CareerCoachAgent | None = None
_scout_agent: JobScoutAgent | None = None  # Main agent for direct search
_scout_conversational_agent: JobScoutConversationalAgent | None = None  # Chat agent
_cv_agent: CVAnalyzerConversationalAgent | None = None
_cv_adapter_agent: CVAdapterConversationalAgent | None = None
_interview_sim_agent: InterviewSimAgent | None = None


def get_coach_agent() -> CareerCoachAgent:
    """Get CareerCoach agent singleton."""
    global _coach_agent
    if _coach_agent is None:
        _coach_agent = CareerCoachAgent()
    return _coach_agent


def get_scout_agent() -> JobScoutAgent:
    """Get JobScout main agent singleton (for direct job search)."""
    global _scout_agent
    if _scout_agent is None:
        _scout_agent = JobScoutAgent()
    return _scout_agent


def get_scout_conversational_agent() -> JobScoutConversationalAgent:
    """Get JobScout conversational agent singleton (for chat)."""
    global _scout_conversational_agent
    if _scout_conversational_agent is None:
        _scout_conversational_agent = JobScoutConversationalAgent()
    return _scout_conversational_agent


def get_cv_agent() -> CVAnalyzerConversationalAgent:
    """Get CVAnalyzer conversational agent singleton."""
    global _cv_agent
    if _cv_agent is None:
        _cv_agent = CVAnalyzerConversationalAgent()
    return _cv_agent


def get_cv_adapter_agent() -> CVAdapterConversationalAgent:
    """Get CV Adapter conversational agent singleton."""
    global _cv_adapter_agent
    if _cv_adapter_agent is None:
        _cv_adapter_agent = CVAdapterConversationalAgent()
    return _cv_adapter_agent


def get_interview_sim_agent() -> InterviewSimAgent:
    """Get Interview Simulation agent singleton."""
    global _interview_sim_agent
    if _interview_sim_agent is None:
        _interview_sim_agent = InterviewSimAgent()
    return _interview_sim_agent


CoachAgentDep = Annotated[CareerCoachAgent, Depends(get_coach_agent)]
ScoutAgentDep = Annotated[JobScoutAgent, Depends(get_scout_agent)]
ScoutConversationalAgentDep = Annotated[JobScoutConversationalAgent, Depends(get_scout_conversational_agent)]
CVAgentDep = Annotated[CVAnalyzerConversationalAgent, Depends(get_cv_agent)]
CVAdapterAgentDep = Annotated[CVAdapterConversationalAgent, Depends(get_cv_adapter_agent)]
InterviewSimAgentDep = Annotated[InterviewSimAgent, Depends(get_interview_sim_agent)]


# Supabase Client
_supabase_client: Client | None = None


def get_supabase_client() -> Client:
    """
    Get Supabase client singleton with service role key.

    Uses service role key for full database and storage access.

    Returns:
        Supabase client instance
    """
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        _supabase_client = create_client(
            settings.supabase_url,
            settings.get_supabase_service_role_key()
        )
    return _supabase_client


def get_user_id_from_token(authorization: Optional[str]) -> Optional[str]:
    """
    Extract user ID from Authorization Bearer token.

    Args:
        authorization: Authorization header value (Bearer token)

    Returns:
        User ID if authenticated, None otherwise
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "")

    try:
        settings = get_settings()
        # Use anon key for token verification
        supabase_anon = create_client(
            settings.supabase_url,
            settings.get_supabase_key()
        )
        response = supabase_anon.auth.get_user(token)
        if response and response.user:
            return response.user.id
    except Exception as e:
        # Log error but don't raise (graceful degradation)
        print(f"⚠️ Error extracting user ID from token: {e}")

    return None


SupabaseClientDep = Annotated[Client, Depends(get_supabase_client)]


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Get current authenticated user from JWT token.

    Args:
        authorization: Authorization header value (Bearer token)

    Returns:
        User dict with id and email

    Raises:
        HTTPException: If token is invalid or missing
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header"
        )

    token = authorization.replace("Bearer ", "")

    try:
        settings = get_settings()
        # Use anon key for token verification
        supabase_anon = create_client(
            settings.supabase_url,
            settings.get_supabase_key()
        )
        response = supabase_anon.auth.get_user(token)

        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        return {
            "id": response.user.id,
            "email": response.user.email
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
