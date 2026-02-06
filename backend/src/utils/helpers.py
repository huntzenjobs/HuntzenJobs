"""
Utility Helpers
================
Common utility functions and decorators.
"""

import asyncio
import hashlib
import time
from functools import wraps
from typing import Any, Callable, Optional, TypeVar

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


def clean_text(text: str) -> str:
    """
    Clean and normalize text for processing.
    
    Args:
        text: Input text
        
    Returns:
        Cleaned text
    """
    if not text:
        return ""
    
    # Remove excessive whitespace
    lines = text.strip().split("\n")
    cleaned_lines = [" ".join(line.split()) for line in lines if line.strip()]
    return "\n".join(cleaned_lines)


def truncate_text(text: str, max_length: int = 1000, suffix: str = "...") -> str:
    """
    Truncate text to maximum length.
    
    Args:
        text: Input text
        max_length: Maximum allowed length
        suffix: Suffix to append if truncated
        
    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)] + suffix


def normalize_job_title(title: str) -> str:
    """
    Normalize job title for better matching.
    
    Args:
        title: Raw job title
        
    Returns:
        Normalized title
    """
    # Common replacements
    replacements = {
        "sr.": "senior",
        "jr.": "junior",
        "dev": "developer",
        "eng": "engineer",
        "mgr": "manager",
        "assoc": "associate",
    }
    
    title = title.lower().strip()
    for old, new in replacements.items():
        title = title.replace(old, new)
    
    return title


def calculate_similarity(text1: str, text2: str) -> float:
    """
    Calculate simple similarity ratio between two texts.
    
    Args:
        text1: First text
        text2: Second text
        
    Returns:
        Similarity ratio (0.0 to 1.0)
    """
    if not text1 or not text2:
        return 0.0
    
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    
    intersection = words1 & words2
    union = words1 | words2
    
    return len(intersection) / len(union) if union else 0.0
