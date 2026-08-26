"""Compteurs Redis atomiques pour borner les traitements IA coûteux."""

import logging
import uuid
from contextvars import ContextVar

from src.utils.cache import get_redis

logger = logging.getLogger(__name__)

GLOBAL_AI_ACTIVE_KEY = "groq:active_global"
GLOBAL_AI_ACTIVE_TTL_SECONDS = 130
GLOBAL_AI_SYNC_LIMIT = 12

CV_EXTRACTION_ACTIVE_KEY = "cv:active_extraction"
CV_EXTRACTION_ACTIVE_TTL_SECONDS = 130
CV_EXTRACTION_SYNC_LIMIT = 3

_ACQUIRE_LEASE_SCRIPT = """
local redis_time = redis.call('TIME')
local now_ms = (redis_time[1] * 1000) + math.floor(redis_time[2] / 1000)
local ttl_ms = tonumber(ARGV[2]) * 1000
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now_ms)
redis.call('ZADD', KEYS[1], now_ms + ttl_ms, ARGV[1])
redis.call('PEXPIRE', KEYS[1], ttl_ms + 1000)
return redis.call('ZCARD', KEYS[1])
"""

_RELEASE_LEASE_SCRIPT = """
redis.call('ZREM', KEYS[1], ARGV[1])
local current = redis.call('ZCARD', KEYS[1])
if current == 0 then
  redis.call('DEL', KEYS[1])
end
return current
"""

_RENEW_LEASE_SCRIPT = """
if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  return 0
end
local redis_time = redis.call('TIME')
local now_ms = (redis_time[1] * 1000) + math.floor(redis_time[2] / 1000)
local ttl_ms = tonumber(ARGV[2]) * 1000
redis.call('ZADD', KEYS[1], 'XX', now_ms + ttl_ms, ARGV[1])
redis.call('PEXPIRE', KEYS[1], ttl_ms + 1000)
return 1
"""

_global_ai_tokens: ContextVar[tuple[str, ...]] = ContextVar(
    "global_ai_capacity_tokens",
    default=(),
)
_cv_extraction_tokens: ContextVar[tuple[str, ...]] = ContextVar(
    "cv_extraction_capacity_tokens",
    default=(),
)


class CapacityStoreUnavailable(RuntimeError):
    """Redis est indisponible : aucune nouvelle dépense IA ne doit démarrer."""


async def _increment_lease(
    key: str,
    ttl_seconds: int,
    token_stack: ContextVar[tuple[str, ...]],
) -> int:
    redis = await get_redis()
    if redis is None:
        raise CapacityStoreUnavailable("Redis capacity store unavailable")
    token = uuid.uuid4().hex
    count = int(
        await redis.eval(
            _ACQUIRE_LEASE_SCRIPT,
            1,
            key,
            token,
            ttl_seconds,
        )
    )
    token_stack.set((*token_stack.get(), token))
    return count


async def _release_lease(
    key: str,
    token_stack: ContextVar[tuple[str, ...]],
) -> None:
    """Libère une place sans masquer le résultat si Redis tombe en cours d'appel."""
    tokens = token_stack.get()
    if not tokens:
        return
    token = tokens[-1]
    token_stack.set(tokens[:-1])
    try:
        redis = await get_redis()
        if redis is None:
            raise CapacityStoreUnavailable("Redis capacity store unavailable")
        await redis.eval(_RELEASE_LEASE_SCRIPT, 1, key, token)
    except Exception as exc:
        logger.error("Capacity lease release failed for %s: %s", key, exc)


async def _renew_lease(
    key: str,
    ttl_seconds: int,
    token_stack: ContextVar[tuple[str, ...]],
) -> None:
    tokens = token_stack.get()
    if not tokens:
        raise CapacityStoreUnavailable("Capacity lease token unavailable")
    redis = await get_redis()
    if redis is None:
        raise CapacityStoreUnavailable("Redis capacity store unavailable")
    renewed = await redis.eval(
        _RENEW_LEASE_SCRIPT,
        1,
        key,
        tokens[-1],
        ttl_seconds,
    )
    if int(renewed) != 1:
        raise CapacityStoreUnavailable("Capacity lease expired before renewal")


async def increment_global_ai_active() -> int:
    """Réserve atomiquement un workflow IA, toutes fonctionnalités confondues."""
    return await _increment_lease(
        GLOBAL_AI_ACTIVE_KEY,
        GLOBAL_AI_ACTIVE_TTL_SECONDS,
        _global_ai_tokens,
    )


async def decrement_global_ai_active() -> None:
    await _release_lease(GLOBAL_AI_ACTIVE_KEY, _global_ai_tokens)


async def increment_cv_extraction_active() -> int:
    """Réserve atomiquement une extraction PDF/DOCX coûteuse."""
    return await _increment_lease(
        CV_EXTRACTION_ACTIVE_KEY,
        CV_EXTRACTION_ACTIVE_TTL_SECONDS,
        _cv_extraction_tokens,
    )


async def decrement_cv_extraction_active() -> None:
    await _release_lease(CV_EXTRACTION_ACTIVE_KEY, _cv_extraction_tokens)


async def renew_cv_extraction_active() -> None:
    """Prolonge uniquement le token vivant du traitement courant."""
    await _renew_lease(
        CV_EXTRACTION_ACTIVE_KEY,
        CV_EXTRACTION_ACTIVE_TTL_SECONDS,
        _cv_extraction_tokens,
    )
