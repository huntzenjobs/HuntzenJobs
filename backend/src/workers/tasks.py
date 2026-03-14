"""
ARQ Task Functions — HuntZen
Tâches async exécutées par les workers ARQ.
"""
import asyncio
from typing import Any

# Semaphore global partagé par tous les workers ARQ pour contrôler Groq
_groq_semaphore = asyncio.Semaphore(5)  # max 5 appels Groq simultanés par worker


async def coach_task(ctx: dict, message: str, session_id: str, language: str = "fr") -> dict:
    """Traite un message coach via Groq (exécuté par ARQ worker)."""
    from src.api.deps import get_coach_agent, get_session_history, update_session_history

    agent = get_coach_agent()
    history = get_session_history(session_id)

    async with _groq_semaphore:
        result = await agent.run(
            message=message,
            history=history,
            language=language,
            deep_analysis=True,
        )

    if result.get("success"):
        update_session_history(session_id, message, result["response"])

    return result


async def startup(ctx: dict) -> None:
    """Startup du worker ARQ : initialiser le pool DB."""
    from app.database import init_connection_pool_async
    await init_connection_pool_async()


async def shutdown(ctx: dict) -> None:
    """Shutdown du worker ARQ : fermer DB pool et Redis."""
    from app.database import close_connection_pool
    from src.utils.cache import close_redis
    await close_connection_pool()
    await close_redis()
