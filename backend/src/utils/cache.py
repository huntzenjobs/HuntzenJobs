"""
Distributed Redis Cache Manager (Async)
=========================================
Fully async Redis cache using redis.asyncio for non-blocking I/O.

Fixes applied:
- Uses redis.asyncio instead of upstash_redis (was blocking async event loop)
- Cache keys exclude `self` from instance methods (was including memory address,
     causing cache to break on every restart/across workers)
- Same redis.asyncio client as app/cache.py (unified)

Architecture:
- Shared cache across all workers and instances
- Automatic serialization/deserialization with JSON
- Graceful degradation if Redis unavailable
- TTL-based expiration
- MD5 key hashing for stable, consistent cache keys

Usage:
    from src.utils.cache import redis_cache

    @redis_cache(ttl=300, prefix="jobs")
    async def expensive_operation(param1, param2):
        return result
"""

import hashlib
import inspect
import json
import os

import orjson
from functools import wraps
from typing import Any, Callable

import redis.asyncio as aioredis

from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# ASYNC REDIS CLIENT — Singleton with thread-safe init
# ═══════════════════════════════════════════════════════════════════════════════

_redis_client: aioredis.Redis | None = None
_redis_initialized = False


def _build_redis_url() -> str | None:
    """Retourne l'URL Redis depuis REDIS_URL (Railway Redis interne)."""
    return os.getenv("REDIS_URL") or settings.redis_url or None


async def get_redis() -> aioredis.Redis | None:
    """
    Get or create async Redis client singleton.

    Returns:
        Async Redis client or None if disabled/unavailable.
    """
    global _redis_client, _redis_initialized

    # Fast path
    if _redis_initialized:
        return _redis_client

    if not settings.cache_enabled:
        return None

    if not url:
        logger.warning("⚠️ No Redis URL configured — caching disabled")
        _redis_initialized = True
        return None

    try:
        _redis_client = aioredis.from_url(
                url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=20,
                socket_connect_timeout=5,
                socket_keepalive=True,
            )
            await _redis_client.ping()
            logger.info("✅ Redis client initialized (Railway Redis)")
        except Exception as e:
            logger.error(f"❌ Redis init failed: {e}")
            _redis_client = None

    _redis_initialized = True
    return _redis_client


async def close_redis() -> None:
    """Close the Redis connection pool (call on app shutdown)."""
    global _redis_client, _redis_initialized
    if _redis_client:
        try:
            await _redis_client.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Redis close error: {e}")
        finally:
            _redis_client = None
            _redis_initialized = False


# ═══════════════════════════════════════════════════════════════════════════════
# STABLE CACHE KEY — Excludes `self` from instance methods
# ═══════════════════════════════════════════════════════════════════════════════

def _make_cache_key(func: Callable, args: tuple, kwargs: dict) -> str:
    """
    Generate a stable MD5 cache key from function arguments.

    If func is an instance/class method, the first arg (self/cls) is
    excluded so the key does NOT contain the object's memory address.
    This ensures cache keys survive server restarts and work across workers.
    """
    sig = inspect.signature(func)
    params = list(sig.parameters.keys())
    clean_args = args

    if params and params[0] in ("self", "cls") and len(args) > 0:
        clean_args = args[1:]

    parts = []
    for arg in clean_args:
        try:
            parts.append(json.dumps(arg, sort_keys=True, default=str))
        except (TypeError, ValueError):
            parts.append(str(arg))

    for k, v in sorted(kwargs.items()):
        try:
            parts.append(f"{k}={json.dumps(v, sort_keys=True, default=str)}")
        except (TypeError, ValueError):
            parts.append(f"{k}={v}")

    return hashlib.md5("|".join(parts).encode()).hexdigest()


# ═══════════════════════════════════════════════════════════════════════════════
# CACHE DECORATOR — Fully async, non-blocking
# ═══════════════════════════════════════════════════════════════════════════════

def redis_cache(ttl: int = 300, prefix: str = ""):
    """
    Async decorator for caching function results in Redis.

    Args:
        ttl: Time-to-live in seconds (default: 5 min)
        prefix: Cache key prefix for organization

    Example:
        @redis_cache(ttl=300, prefix="jobs")
        async def search_jobs(title: str, country: str):
            return results
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            redis = await get_redis()

            if not redis:
                return await func(*args, **kwargs)

            # Stable cache key (excludes self)
            key_hash = _make_cache_key(func, args, kwargs)
            key = f"{prefix}:{func.__name__}:{key_hash}" if prefix else f"{func.__name__}:{key_hash}"

            # Try GET (non-blocking)
            try:
                cached = await redis.get(key)
                if cached is not None:
                    logger.debug(f"✅ Cache HIT: {key[:60]}")
                    return orjson.loads(cached)
            except Exception as e:
                logger.warning(f"⚠️ Cache GET error: {e}")

            # MISS → execute function
            logger.debug(f"❌ Cache MISS: {key[:60]}")
            result = await func(*args, **kwargs)

            # SET (non-blocking)
            try:
                serialized = orjson.dumps(result, option=orjson.OPT_NON_STR_KEYS).decode()
                await redis.setex(key, ttl, serialized)
                logger.debug(f"💾 Cached: {key[:60]} (TTL: {ttl}s)")
            except Exception as e:
                logger.warning(f"⚠️ Cache SET error: {e}")

            return result

        return wrapper
    return decorator


# ═══════════════════════════════════════════════════════════════════════════════
# CACHE INVALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

async def invalidate_cache(prefix: str = "", pattern: str = "*") -> int:
    """
    Invalidate cache keys matching a pattern.

    Args:
        prefix: Cache key prefix
        pattern: Key pattern (default: all keys with prefix)

    Returns:
        Number of keys deleted
    """
    redis = await get_redis()
    if not redis:
        return 0

    search_pattern = f"{prefix}:*{pattern}*" if prefix else f"*{pattern}*"

    try:
        keys = []
        async for key in redis.scan_iter(match=search_pattern, count=100):
            keys.append(key)

        if keys:
            deleted = await redis.delete(*keys)
            logger.info(f"🗑️ Invalidated {deleted} keys matching '{search_pattern}'")
            return deleted
        return 0
    except Exception as e:
        logger.error(f"❌ Cache invalidation error: {e}")
        return 0
