"""
Utilitaire de retry exponentiel pour les erreurs Groq 429 (Rate Limit).
========================================================================

Utilisation :
    from src.utils.groq_retry import with_groq_retry

    result = await with_groq_retry(llm.ainvoke, messages)

Délais : 1s → 2s → 4s (backoff exponentiel, max 3 tentatives).
"""

import asyncio
import logging
from typing import Any, Callable

from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

# Circuit breaker — compteur de failures 429 consécutives par index de clé
_consecutive_failures: dict[int, int] = {}
CIRCUIT_OPEN_THRESHOLD = 5


async def with_groq_key_rotation(
    llms: list,
    messages: list,
    **kwargs: Any,
) -> Any:
    """
    Essaie chaque LLM (clé Groq différente) sur 429.
    llms = liste de ChatGroq, un par clé.
    Circuit breaker : skipppe une clé après 5 failures consécutives.
    """
    last_exc: Exception | None = None
    for i, llm in enumerate(llms):
        # Circuit ouvert sur cette clé → skip sans essayer
        if _consecutive_failures.get(i, 0) >= CIRCUIT_OPEN_THRESHOLD:
            logger.warning(
                f"[groq_circuit] Clé {i + 1} circuit OUVERT "
                f"({_consecutive_failures[i]} failures consécutives) — skip"
            )
            continue
        try:
            result = await with_groq_retry(llm.ainvoke, messages, **kwargs)
            _consecutive_failures[i] = 0  # reset sur succès
            return result
        except Exception as exc:
            if _is_rate_limit_error(exc):
                _consecutive_failures[i] = _consecutive_failures.get(i, 0) + 1
                if i < len(llms) - 1:
                    logger.warning(
                        f"[groq_rotation] Clé {i + 1} épuisée (429) — bascule sur clé {i + 2}"
                    )
                    last_exc = exc
                    continue
            raise
    if last_exc:
        raise last_exc


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

    Args:
        coro_fn:     Callable async à appeler (ex: llm.ainvoke).
        *args:       Arguments positionnels transmis à coro_fn.
        max_retries: Nombre maximum de tentatives (défaut : 3).
        base_delay:  Délai de base en secondes (défaut : 1.0).
                     Délais réels : 1s → 2s → 4s.
        **kwargs:    Arguments nommés transmis à coro_fn.

    Returns:
        Résultat de coro_fn en cas de succès.

    Raises:
        Exception: Dernière exception si toutes les tentatives échouent,
                   ou immédiatement si l'erreur n'est pas un rate limit.
    """
    last_exc: Exception | None = None

    for attempt in range(max_retries):
        try:
            return await coro_fn(*args, **kwargs)
        except Exception as exc:
            if _is_rate_limit_error(exc) and attempt < max_retries - 1:
                wait = base_delay * (2 ** attempt)  # 1s, 2s, 4s
                logger.warning(
                    f"[groq_retry] Rate limit 429 détecté — tentative {attempt + 1}/{max_retries}, "
                    f"retry dans {wait:.1f}s"
                )
                last_exc = exc
                await asyncio.sleep(wait)
                continue
            # Pas un rate limit, ou dernière tentative → propager
            raise

    # Ne devrait jamais arriver, mais par sécurité
    if last_exc is not None:
        raise last_exc
