"""
API Dependencies
=================
Dependency injection for FastAPI routes.
"""

import logging
import threading
from collections import defaultdict
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, create_client

from src.agents.branding.main_agent import BrandingAgent
from src.agents.coach import CareerCoachAgent
from src.agents.cv_adapter.conversational_agent import CVAdapterConversationalAgent
from src.agents.cv_adapter.main_agent import CVAdapterAgent
from src.agents.cv_analyzer.conversational_agent import CVAnalyzerConversationalAgent
from src.agents.cv_analyzer.main_agent import CVAnalyzerAgent
from src.agents.interview_sim.conversational_agent import InterviewSimAgent
from src.agents.job_scout.conversational_agent import JobScoutConversationalAgent
from src.agents.job_scout.main_agent import JobScoutAgent
from src.config.settings import Settings, get_settings

logger = logging.getLogger(__name__)


def get_settings_dep() -> Settings:
    """Get application settings."""
    return get_settings()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


# Session storage — Supabase-backed with in-memory fallback
# Primary: reads/writes to coach_conversations table
# Fallback: in-memory dict (for tests or when Supabase unavailable)
_sessions_lock = threading.Lock()
_sessions: dict[str, list[dict]] = defaultdict(list)


def get_session_history(session_id: str) -> list[dict]:
    """
    Get conversation history for a session.

    Tries Supabase first (persistent across restarts/workers),
    falls back to in-memory if unavailable.
    """
    # Try Supabase first
    try:
        client = get_supabase_client()
        result = (
            client.table("coach_conversations")
            .select("messages")
            .eq("session_id", session_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data and result.data[0].get("messages"):
            messages = result.data[0]["messages"]
            # Return last 20 messages (10 exchanges)
            return messages[-20:] if len(messages) > 20 else messages
    except Exception as e:
        logger.warning(f"⚠️ Supabase history read failed, using in-memory: {e}")

    # Fallback to in-memory
    with _sessions_lock:
        return _sessions[session_id].copy()


def update_session_history(
    session_id: str,
    user_message: str,
    assistant_response: str,
) -> None:
    """
    Update conversation history (Supabase + in-memory fallback).

    Tries to update the Supabase row matching this session_id.
    Always updates in-memory as hot cache.
    """
    # Always update in-memory (hot cache for same-session follow-ups)
    with _sessions_lock:
        _sessions[session_id].append({"role": "user", "content": user_message})
        _sessions[session_id].append({"role": "assistant", "content": assistant_response})
        if len(_sessions[session_id]) > 20:
            _sessions[session_id] = _sessions[session_id][-20:]

    # Try to update Supabase (best-effort, non-blocking for caller)
    try:
        client = get_supabase_client()
        result = (
            client.table("coach_conversations")
            .select("id, messages")
            .eq("session_id", session_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            # Append to existing conversation
            existing_msgs = result.data[0].get("messages", [])
            existing_msgs.append({"role": "user", "content": user_message})
            existing_msgs.append({"role": "assistant", "content": assistant_response})
            # Cap at 50 messages in DB (more generous than in-memory)
            if len(existing_msgs) > 50:
                existing_msgs = existing_msgs[-50:]
            client.table("coach_conversations").update({
                "messages": existing_msgs,
            }).eq("id", result.data[0]["id"]).execute()
    except Exception as e:
        logger.warning(f"⚠️ Supabase history write failed (in-memory still updated): {e}")


def clear_session(session_id: str) -> None:
    """Clear a session's history (thread-safe)."""
    with _sessions_lock:
        if session_id in _sessions:
            del _sessions[session_id]


# Agent singletons - Thread-safe initialization
_coach_agent: CareerCoachAgent | None = None
_coach_agent_lock = threading.Lock()

_scout_agent: JobScoutAgent | None = None
_scout_agent_lock = threading.Lock()

_scout_conversational_agent: JobScoutConversationalAgent | None = None
_scout_conversational_agent_lock = threading.Lock()

_cv_agent: CVAnalyzerConversationalAgent | None = None
_cv_agent_lock = threading.Lock()

_cv_adapter_agent: CVAdapterConversationalAgent | None = None
_cv_adapter_agent_lock = threading.Lock()

_interview_sim_agent: InterviewSimAgent | None = None
_interview_sim_agent_lock = threading.Lock()

_branding_agent: BrandingAgent | None = None
_branding_agent_lock = threading.Lock()

# Main (non-conversational) agents
_cv_analyzer_main_agent: CVAnalyzerAgent | None = None
_cv_analyzer_main_lock = threading.Lock()

_cv_adapter_main_agent: CVAdapterAgent | None = None
_cv_adapter_main_lock = threading.Lock()


def get_coach_agent() -> CareerCoachAgent:
    """Get CareerCoach agent singleton (thread-safe)."""
    global _coach_agent

    if _coach_agent is None:  # Fast path (no lock)
        with _coach_agent_lock:
            if _coach_agent is None:  # Double-check inside lock
                _coach_agent = CareerCoachAgent()
                logger.info("[deps] CareerCoachAgent singleton created")

    return _coach_agent


def get_scout_agent() -> JobScoutAgent:
    """Get JobScout main agent singleton (for direct job search, thread-safe)."""
    global _scout_agent

    if _scout_agent is None:  # Fast path (no lock)
        with _scout_agent_lock:
            if _scout_agent is None:  # Double-check inside lock
                _scout_agent = JobScoutAgent()
                logger.info("[deps] JobScoutAgent singleton created")

    return _scout_agent


def get_scout_conversational_agent() -> JobScoutConversationalAgent:
    """Get JobScout conversational agent singleton (for chat, thread-safe)."""
    global _scout_conversational_agent

    if _scout_conversational_agent is None:  # Fast path (no lock)
        with _scout_conversational_agent_lock:
            if _scout_conversational_agent is None:  # Double-check inside lock
                _scout_conversational_agent = JobScoutConversationalAgent()
                logger.info("[deps] JobScoutConversationalAgent singleton created")

    return _scout_conversational_agent


def get_cv_agent() -> CVAnalyzerConversationalAgent:
    """Get CVAnalyzer conversational agent singleton (thread-safe)."""
    global _cv_agent

    if _cv_agent is None:  # Fast path (no lock)
        with _cv_agent_lock:
            if _cv_agent is None:  # Double-check inside lock
                _cv_agent = CVAnalyzerConversationalAgent()
                logger.info("[deps] CVAnalyzerConversationalAgent singleton created")

    return _cv_agent


def get_cv_adapter_agent() -> CVAdapterConversationalAgent:
    """Get CV Adapter conversational agent singleton (thread-safe)."""
    global _cv_adapter_agent

    if _cv_adapter_agent is None:  # Fast path (no lock)
        with _cv_adapter_agent_lock:
            if _cv_adapter_agent is None:  # Double-check inside lock
                _cv_adapter_agent = CVAdapterConversationalAgent()
                logger.info("[deps] CVAdapterConversationalAgent singleton created")

    return _cv_adapter_agent


def get_interview_sim_agent() -> InterviewSimAgent:
    """Get Interview Simulation agent singleton (thread-safe)."""
    global _interview_sim_agent

    if _interview_sim_agent is None:  # Fast path (no lock)
        with _interview_sim_agent_lock:
            if _interview_sim_agent is None:  # Double-check inside lock
                _interview_sim_agent = InterviewSimAgent()
                logger.info("[deps] InterviewSimAgent singleton created")

    return _interview_sim_agent


def get_cv_analyzer_main() -> CVAnalyzerAgent:
    """Get CVAnalyzer main agent singleton (thread-safe)."""
    global _cv_analyzer_main_agent

    if _cv_analyzer_main_agent is None:  # Fast path (no lock)
        with _cv_analyzer_main_lock:
            if _cv_analyzer_main_agent is None:  # Double-check inside lock
                _cv_analyzer_main_agent = CVAnalyzerAgent()
                logger.info("[deps] CVAnalyzerAgent (main) singleton created")

    return _cv_analyzer_main_agent


def get_cv_adapter_main() -> CVAdapterAgent:
    """Get CVAdapter main agent singleton (thread-safe)."""
    global _cv_adapter_main_agent

    if _cv_adapter_main_agent is None:  # Fast path (no lock)
        with _cv_adapter_main_lock:
            if _cv_adapter_main_agent is None:  # Double-check inside lock
                _cv_adapter_main_agent = CVAdapterAgent()
                logger.info("[deps] CVAdapterAgent (main) singleton created")

    return _cv_adapter_main_agent


def get_branding_agent() -> BrandingAgent:
    """Get BrandingAgent singleton (thread-safe)."""
    global _branding_agent

    if _branding_agent is None:
        with _branding_agent_lock:
            if _branding_agent is None:
                _branding_agent = BrandingAgent()
                logger.info("[deps] BrandingAgent singleton created")

    return _branding_agent


CoachAgentDep = Annotated[CareerCoachAgent, Depends(get_coach_agent)]
ScoutAgentDep = Annotated[JobScoutAgent, Depends(get_scout_agent)]
ScoutConversationalAgentDep = Annotated[JobScoutConversationalAgent, Depends(get_scout_conversational_agent)]
CVAgentDep = Annotated[CVAnalyzerConversationalAgent, Depends(get_cv_agent)]
CVAdapterAgentDep = Annotated[CVAdapterConversationalAgent, Depends(get_cv_adapter_agent)]
InterviewSimAgentDep = Annotated[InterviewSimAgent, Depends(get_interview_sim_agent)]

# Main (non-conversational) agent dependencies
CVAnalyzerMainDep = Annotated[CVAnalyzerAgent, Depends(get_cv_analyzer_main)]
CVAdapterMainDep = Annotated[CVAdapterAgent, Depends(get_cv_adapter_main)]
BrandingAgentDep = Annotated[BrandingAgent, Depends(get_branding_agent)]


# Supabase Client - Thread-safe
_supabase_client: Client | None = None
_supabase_client_lock = threading.Lock()


def get_supabase_client() -> Client:
    """
    Get Supabase client singleton with service role key (thread-safe).

    Uses service role key for full database and storage access.

    Returns:
        Supabase client instance
    """
    global _supabase_client

    if _supabase_client is None:  # Fast path (no lock)
        with _supabase_client_lock:
            if _supabase_client is None:  # Double-check inside lock
                settings = get_settings()
                _supabase_client = create_client(
                    settings.supabase_url,
                    settings.get_supabase_service_role_key()
                )
                logger.info("[deps] Supabase client singleton created")

    return _supabase_client


_supabase_anon_client: Client | None = None
_supabase_anon_client_lock = threading.Lock()


def get_supabase_anon_client() -> Client:
    """Get Supabase anon client singleton (thread-safe)."""
    global _supabase_anon_client
    if _supabase_anon_client is None:
        with _supabase_anon_client_lock:
            if _supabase_anon_client is None:
                _settings = get_settings()
                _supabase_anon_client = create_client(
                    _settings.supabase_url,
                    _settings.get_supabase_key()
                )
                logger.info("[deps] Supabase anon client singleton created")
    return _supabase_anon_client


def get_user_info_from_token(authorization: str | None) -> dict | None:
    """Return {"id": ..., "email": ...} or None if not authenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    try:
        response = get_supabase_anon_client().auth.get_user(token)
        if response and response.user:
            return {"id": response.user.id, "email": response.user.email}
    except Exception as e:
        logger.warning(f"⚠️ Error extracting user info from token: {e}")
    return None


def get_user_id_from_token(authorization: str | None) -> str | None:
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
        response = get_supabase_anon_client().auth.get_user(token)
        if response and response.user:
            return response.user.id
    except Exception as e:
        # Log error but don't raise (graceful degradation)
        logger.warning(f"⚠️ Error extracting user ID from token: {e}")

    return None


SupabaseClientDep = Annotated[Client, Depends(get_supabase_client)]


async def get_current_user(authorization: str | None = Header(None)) -> dict:
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
        response = get_supabase_anon_client().auth.get_user(token)

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
        ) from None


CurrentUserDep = Annotated[dict, Depends(get_current_user)]


def check_assistant_quota(user_id: str) -> None:
    """
    Check if user has remaining assistant messages quota.
    Raises HTTP 429 if quota exceeded.
    """
    try:
        supabase = get_supabase_client()
        result = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()
        if not result.data:
            return  # No quota data = allow through
        for row in result.data:
            if row.get("feature") == "assistant_messages":
                if not row.get("has_access", True):
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "code": "QUOTA_EXCEEDED",
                            "feature": "assistant_messages",
                            "limit": row.get("quota_limit"),
                            "used": row.get("quota_used"),
                            "reset_at": str(row.get("reset_at", "")),
                            "message": "Quota de messages journalier atteint. Passez à un plan supérieur pour continuer."
                        }
                    )
                return
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[quota] check failed for {user_id}, allowing through: {e}")


def increment_assistant_messages(user_id: str) -> None:
    """
    Increment assistant_messages usage counter for today.
    Best-effort: logs warning on failure, does NOT raise.
    """
    try:
        supabase = get_supabase_client()
        supabase.rpc("increment_usage", {
            "p_user_id": user_id,
            "p_feature": "assistant_messages",
            "p_amount": 1,
        }).execute()
    except Exception as e:
        logger.warning(f"[quota] increment failed for {user_id}: {e}")


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Verify the current user has admin privileges (is_admin = TRUE in profiles).

    Raises:
        HTTPException 403: If user is not an admin
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]

    try:
        result = supabase.table("profiles").select("is_admin").eq("id", user_id).single().execute()
        if not result.data or not result.data.get("is_admin"):
            # Log unauthorized admin access attempt
            try:
                supabase.rpc("log_security_event", {
                    "p_event_type": "api.unauthorized_access",
                    "p_severity": "warning",
                    "p_user_id": user_id,
                    "p_event_data": {"resource": "admin_panel", "user_id": user_id}
                }).execute()
            except Exception:
                pass  # Don't fail the request if logging fails
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin check failed for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access verification failed"
        ) from None

    return {**current_user, "is_admin": True}


AdminUserDep = Annotated[dict, Depends(get_current_admin)]


async def check_feature_flag(user_id: str, feature: str) -> bool:
    """Check if user's plan has a specific feature flag enabled.

    Priority order:
    1. user_feature_overrides (admin per-user override)
    2. subscription_plans.feature_flags (plan-level flags)
    3. Fallback: False (free plan default)
    """
    supabase = get_supabase_client()

    # 1. Check user-specific override first
    try:
        override = (
            supabase.table("user_feature_overrides")
            .select("enabled")
            .eq("user_id", user_id)
            .eq("feature_name", feature)
            .maybe_single()
            .execute()
        )
        if override.data:
            return override.data["enabled"]
    except Exception as e:
        logger.warning(f"[feature_flag] override check failed for {user_id}/{feature}: {e}")

    # 2. Check plan feature flags
    try:
        sub = (
            supabase.table("user_subscriptions")
            .select("subscription_plans(feature_flags)")
            .eq("user_id", user_id)
            .eq("status", "active")
            .maybe_single()
            .execute()
        )
        if sub.data:
            flags = (sub.data.get("subscription_plans") or {}).get("feature_flags", {})
            return flags.get(feature, False)
    except Exception as e:
        logger.warning(f"[feature_flag] plan check failed for {user_id}/{feature}: {e}")

    # 3. Fallback: free plan flags (all false by default)
    return False


def require_feature_flag(user_id: str, feature: str, feature_label: str | None = None) -> None:
    """Check feature flag synchronously (blocking). Raises HTTP 403 if locked.

    Use in sync route handlers. For async handlers, use check_feature_flag() directly.
    """
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We are inside an async context but called synchronously.
        # Use a synchronous Supabase check instead.
        _require_feature_flag_sync(user_id, feature, feature_label)
    else:
        allowed = asyncio.run(check_feature_flag(user_id, feature))
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FEATURE_LOCKED",
                    "feature": feature,
                    "message": feature_label or "Cette fonctionnalite necessite un plan superieur.",
                },
            )


def _require_feature_flag_sync(
    user_id: str, feature: str, feature_label: str | None = None
) -> None:
    """Synchronous feature flag check using direct Supabase calls."""
    supabase = get_supabase_client()
    allowed = False

    # 1. Check user-specific override
    try:
        override = (
            supabase.table("user_feature_overrides")
            .select("enabled")
            .eq("user_id", user_id)
            .eq("feature_name", feature)
            .maybe_single()
            .execute()
        )
        if override.data:
            allowed = override.data["enabled"]
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "FEATURE_LOCKED",
                        "feature": feature,
                        "message": feature_label
                        or "Cette fonctionnalite necessite un plan superieur.",
                    },
                )
            return  # Override says enabled
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[feature_flag] sync override check failed: {e}")

    # 2. Check plan feature flags
    try:
        sub = (
            supabase.table("user_subscriptions")
            .select("subscription_plans(feature_flags)")
            .eq("user_id", user_id)
            .eq("status", "active")
            .maybe_single()
            .execute()
        )
        if sub.data:
            flags = (sub.data.get("subscription_plans") or {}).get("feature_flags", {})
            allowed = flags.get(feature, False)
    except Exception as e:
        logger.warning(f"[feature_flag] sync plan check failed: {e}")

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FEATURE_LOCKED",
                "feature": feature,
                "message": feature_label
                or "Cette fonctionnalite necessite un plan superieur.",
            },
        )
