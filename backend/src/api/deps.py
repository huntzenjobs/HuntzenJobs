"""
API Dependencies
=================
Dependency injection for FastAPI routes.
"""

from typing import Annotated, Generator

from fastapi import Depends, Header, HTTPException, status

from src.agents.coach import CareerCoachAgent
from src.agents.cv_analyzer import CVAnalyzerAgent
from src.agents.cv_adapter import CVAdapterAgent
from src.agents.job_scout import JobScoutAgent
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
_scout_agent: JobScoutAgent | None = None
_cv_agent: CVAnalyzerAgent | None = None
_cv_adapter_agent: CVAdapterAgent | None = None


def get_coach_agent() -> CareerCoachAgent:
    """Get CareerCoach agent singleton."""
    global _coach_agent
    if _coach_agent is None:
        _coach_agent = CareerCoachAgent()
    return _coach_agent


def get_scout_agent() -> JobScoutAgent:
    """Get JobScout agent singleton."""
    global _scout_agent
    if _scout_agent is None:
        _scout_agent = JobScoutAgent()
    return _scout_agent


def get_cv_agent() -> CVAnalyzerAgent:
    """Get CVAnalyzer agent singleton."""
    global _cv_agent
    if _cv_agent is None:
        _cv_agent = CVAnalyzerAgent()
    return _cv_agent


def get_cv_adapter_agent() -> CVAdapterAgent:
    """Get CV Adapter agent singleton."""
    global _cv_adapter_agent
    if _cv_adapter_agent is None:
        _cv_adapter_agent = CVAdapterAgent()
    return _cv_adapter_agent


CoachAgentDep = Annotated[CareerCoachAgent, Depends(get_coach_agent)]
ScoutAgentDep = Annotated[JobScoutAgent, Depends(get_scout_agent)]
CVAgentDep = Annotated[CVAnalyzerAgent, Depends(get_cv_agent)]
CVAdapterAgentDep = Annotated[CVAdapterAgent, Depends(get_cv_adapter_agent)]
