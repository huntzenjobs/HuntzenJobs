"""
Utilitaire de retry exponentiel pour les erreurs Groq 429 (Rate Limit).
========================================================================
Clé payante unique — 14 400 RPM, pas besoin de rotation multi-clés.
Délais : 1s → 2s → 4s (backoff exponentiel, max 3 tentatives).
"""

import asyncio
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


def _is_rate_limit_error(exc: Exception) -> bool:
    """Détecte si l'exception est une erreur 429 / rate limit Groq."""
    err_str = str(exc).lower()
    exc_type = type(exc).__name__
    return (
        "rate limit" in err_str
        or "429" in err_str
        or "ratelimit" in err_str.replace(" ", "")
        or "rate_limit" in err_str
        or "RateLimitError" in exc_type
        or "RateLimitException" in exc_type
    )


async def with_groq_retry(
    coro_fn: Callable,
    *args: Any,
    max_retries: int = 3,
    base_delay: float = 1.0,
    **kwargs: Any,
) -> Any:
    """
    Exécute une coroutine Groq avec retry exponentiel sur les erreurs 429.
    Délais : 1s → 2s → 4s.
    """
    last_exc: Exception | None = None

    for attempt in range(max_retries):
        try:
            return await coro_fn(*args, **kwargs)
        except Exception as exc:
            if _is_rate_limit_error(exc) and attempt < max_retries - 1:
                wait = base_delay * (2 ** attempt)
                logger.warning(
                    f"[groq_retry] Rate limit 429 — tentative {attempt + 1}/{max_retries}, "
                    f"retry dans {wait:.1f}s"
                )
                last_exc = exc
                await asyncio.sleep(wait)
                continue
            raise

    if last_exc is not None:
        raise last_exc
