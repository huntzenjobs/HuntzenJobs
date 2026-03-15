"""
Utilitaire de retry exponentiel pour les erreurs Groq 429 (Rate Limit).
========================================================================

Circuit breaker partagé via Redis — tous les réplicas Railway voient
le même état des clés Groq et ne les retentent pas inutilement.

Délais : 1s → 2s → 4s (backoff exponentiel, max 3 tentatives).
"""

import asyncio
import logging
from typing import Any, Callable

from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

CIRCUIT_OPEN_THRESHOLD = 5
_CIRCUIT_KEY_PREFIX = "groq:circuit:"   # Redis key prefix
_CIRCUIT_TTL = 60                        # 60s — reset auto si clé se rétablit

# Fallback en mémoire si Redis indisponible
_local_failures: dict[int, int] = {}


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


async def _get_failures(key_idx: int) -> int:
    """Lit le compteur de failures depuis Redis, fallback mémoire."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            val = await redis.get(f"{_CIRCUIT_KEY_PREFIX}{key_idx}")
            return int(val) if val else 0
    except Exception:
        pass
    return _local_failures.get(key_idx, 0)


async def _incr_failures(key_idx: int) -> int:
    """Incrémente le compteur dans Redis (avec TTL), fallback mémoire."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            rkey = f"{_CIRCUIT_KEY_PREFIX}{key_idx}"
            val = await redis.incr(rkey)
            await redis.expire(rkey, _CIRCUIT_TTL)
            return val
    except Exception:
        pass
    _local_failures[key_idx] = _local_failures.get(key_idx, 0) + 1
    return _local_failures[key_idx]


async def _reset_failures(key_idx: int) -> None:
    """Remet le compteur à 0 après un succès."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.delete(f"{_CIRCUIT_KEY_PREFIX}{key_idx}")
    except Exception:
        pass
    _local_failures.pop(key_idx, None)


async def with_groq_key_rotation(
    llms: list,
    messages: list,
    **kwargs: Any,
) -> Any:
    """
    Essaie chaque LLM (clé Groq différente) sur 429.
    Circuit breaker partagé via Redis — tous les réplicas voient le même état.
    """
    last_exc: Exception | None = None
    for i, llm in enumerate(llms):
        failures = await _get_failures(i)
        if failures >= CIRCUIT_OPEN_THRESHOLD:
            logger.warning(
                f"[groq_circuit] Clé {i + 1} circuit OUVERT "
                f"({failures} failures) — skip"
            )
            continue
        try:
            result = await with_groq_retry(llm.ainvoke, messages, **kwargs)
            await _reset_failures(i)
            return result
        except Exception as exc:
            if _is_rate_limit_error(exc):
                count = await _incr_failures(i)
                if i < len(llms) - 1:
                    logger.warning(
                        f"[groq_rotation] Clé {i + 1} épuisée (429, count={count}) "
                        f"— bascule sur clé {i + 2}"
                    )
                    last_exc = exc
                    continue
            raise
    if last_exc:
        raise last_exc


async def with_groq_retry(
    coro_fn: Callable,
    *args: Any,
    max_retries: int = 3,
    base_delay: float = 1.0,
    **kwargs: Any,
) -> Any:
    """
    Exécute une coroutine Groq avec retry exponentiel sur les erreurs 429.

    Délais réels : 1s → 2s → 4s.
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
