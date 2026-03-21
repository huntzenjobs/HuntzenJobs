"""
Utility Helpers
================
Common utility functions and decorators.
"""

import asyncio
import hashlib
from collections.abc import Callable
from functools import wraps
from typing import Any, TypeVar

from cachetools import TTLCache
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

T = TypeVar("T")


def async_retry(
    max_attempts: int = 3,
    min_wait: float = 1.0,
    max_wait: float = 10.0,
    exceptions: tuple = (Exception,),
) -> Callable:
    """
    Decorator for async functions with exponential backoff retry.
    
    Args:
        max_attempts: Maximum number of retry attempts
        min_wait: Minimum wait time between retries (seconds)
        max_wait: Maximum wait time between retries (seconds)
        exceptions: Tuple of exceptions to catch and retry
        
    Returns:
        Decorated function
    """
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=min_wait, max=max_wait),
        retry=retry_if_exception_type(exceptions),
        reraise=True,
    )


def timed_lru_cache(seconds: int = 3600, maxsize: int = 128) -> Callable:
    """
    LRU cache with TTL expiration.
    
    Args:
        seconds: Time-to-live in seconds
        maxsize: Maximum cache size
        
    Returns:
        Decorated function with caching
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        cache: TTLCache = TTLCache(maxsize=maxsize, ttl=seconds)

        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            key = _make_cache_key(args, kwargs)
            if key in cache:
                return cache[key]
            result = await func(*args, **kwargs)
            cache[key] = result
            return result

        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> T:
            key = _make_cache_key(args, kwargs)
            if key in cache:
                return cache[key]
            result = func(*args, **kwargs)
            cache[key] = result
            return result

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


def _make_cache_key(args: tuple, kwargs: dict) -> str:
    """Create a cache key from function arguments."""
    key_str = f"{args}:{sorted(kwargs.items())}"
    return hashlib.md5(key_str.encode()).hexdigest()
