"""
Distributed Redis Cache Manager
=================================
Replaces in-memory TTLCache with distributed Upstash Redis for production scalability.

Architecture:
- Shared cache across all workers and instances
- Automatic serialization/deserialization with JSON
- Graceful degradation if Redis unavailable
- TTL-based expiration
- MD5 key hashing for consistent cache keys

Usage:
    from src.utils.cache import redis_cache

    @redis_cache(ttl=300, prefix="jobs")
    async def expensive_operation(param1, param2):
        # Your expensive operation
        return result
"""

from functools import wraps
from typing import Any, Callable
import json
import hashlib
import threading

from upstash_redis import Redis

from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Singleton Redis client - Thread-safe
_redis_client: Redis | None = None
_redis_client_lock = threading.Lock()


def get_redis() -> Redis | None:
    """
    Get or create Redis client singleton (thread-safe).

    Returns:
        Redis client instance or None if disabled/unavailable
    """
    global _redis_client

    # Fast path: return if already initialized or cache disabled
    if _redis_client is not None:
        return _redis_client

    if not settings.cache_enabled or not settings.redis_url:
        return None

    # Slow path: thread-safe initialization
    with _redis_client_lock:
        if _redis_client is None:  # Double-check inside lock
            try:
                _redis_client = Redis(
                    url=settings.redis_url,
                    token=settings.get_redis_token()
                )
                logger.info("✅ Redis client singleton created (thread-safe)")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Redis client: {e}")
                return None

    return _redis_client


def cache_key(*args, **kwargs) -> str:
    """
    Generate MD5 cache key from function arguments.

    Args:
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        MD5 hash of serialized arguments
    """
    key_str = f"{args}:{sorted(kwargs.items())}"
    return hashlib.md5(key_str.encode()).hexdigest()


def redis_cache(ttl: int = 300, prefix: str = ""):
    """
    Decorator for caching function results in Redis.

    Args:
        ttl: Time-to-live in seconds (default: 5min)
        prefix: Cache key prefix for organization

    Returns:
        Decorated function with caching

    Example:
        @redis_cache(ttl=300, prefix="jobs")
        async def search_jobs(title: str, country: str):
            # Expensive API call
            return results
    """
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            redis = get_redis()

            # Fallback to direct execution if Redis unavailable
            if not redis or not settings.cache_enabled:
                logger.debug(f"⚠️ Cache disabled, executing {func.__name__} directly")
                return await func(*args, **kwargs)

            # Generate cache key
            key = f"{prefix}:{func.__name__}:{cache_key(args, kwargs)}"

            # Try to get from cache
            try:
                cached = redis.get(key)
                if cached:
                    logger.debug(f"✅ Cache HIT: {key}")
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"⚠️ Cache GET error for {key}: {e}")

            # Execute function if cache miss
            logger.debug(f"❌ Cache MISS: {key}")
            result = await func(*args, **kwargs)

            # Store in cache
            try:
                serialized = json.dumps(result)
                redis.setex(key, ttl, serialized)
                logger.debug(f"💾 Cached {key} (TTL: {ttl}s)")
            except Exception as e:
                logger.warning(f"⚠️ Cache SET error for {key}: {e}")

            return result

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            redis = get_redis()

            if not redis or not settings.cache_enabled:
                logger.debug(f"⚠️ Cache disabled, executing {func.__name__} directly")
                return func(*args, **kwargs)

            key = f"{prefix}:{func.__name__}:{cache_key(args, kwargs)}"

            try:
                cached = redis.get(key)
                if cached:
                    logger.debug(f"✅ Cache HIT: {key}")
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"⚠️ Cache GET error for {key}: {e}")

            logger.debug(f"❌ Cache MISS: {key}")
            result = func(*args, **kwargs)

            try:
                serialized = json.dumps(result)
                redis.setex(key, ttl, serialized)
                logger.debug(f"💾 Cached {key} (TTL: {ttl}s)")
            except Exception as e:
                logger.warning(f"⚠️ Cache SET error for {key}: {e}")

            return result

        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def invalidate_cache(prefix: str = "", pattern: str = "*") -> int:
    """
    Invalidate cache keys matching pattern.

    Args:
        prefix: Cache key prefix
        pattern: Redis key pattern (default: all keys with prefix)

    Returns:
        Number of keys deleted

    Example:
        invalidate_cache(prefix="jobs", pattern="*paris*")
    """
    redis = get_redis()
    if not redis:
        logger.warning("⚠️ Redis unavailable, cannot invalidate cache")
        return 0

    search_pattern = f"{prefix}:*{pattern}*" if prefix else pattern

    try:
        # Note: Upstash Redis doesn't support SCAN, using KEYS (acceptable for small caches)
        keys = redis.keys(search_pattern)
        if keys:
            deleted = redis.delete(*keys)
            logger.info(f"🗑️  Invalidated {deleted} cache keys matching {search_pattern}")
            return deleted
        return 0
    except Exception as e:
        logger.error(f"❌ Cache invalidation error: {e}")
        return 0
