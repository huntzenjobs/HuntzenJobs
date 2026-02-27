"""
API Middleware
===============
Custom middleware for logging, CORS, rate limiting.
"""

import time
import logging
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.config.settings import settings

logger = logging.getLogger(__name__)


async def custom_rate_limit_handler(request: Request, exc: Exception) -> Response:
    """
    Custom exception handler for rate limiting errors.
    Handles both RateLimitExceeded and ConnectionError gracefully.
    """
    # If it's a ConnectionError, Redis is down - disable rate limiting for this request
    if isinstance(exc, ConnectionError):
        logger.error(f"❌ Redis connection error during rate limiting: {exc}")
        logger.warning("⚠️ Rate limiting bypassed due to Redis unavailability")
        # Return a 503 Service Unavailable with a message
        return Response(
            content='{"error": "Rate limiting service temporarily unavailable"}',
            status_code=503,
            media_type="application/json"
        )

    # Standard rate limit exceeded
    if isinstance(exc, RateLimitExceeded):
        return Response(
            content=f'{{"error": "Rate limit exceeded: {exc.detail}"}}',
            status_code=429,
            media_type="application/json"
        )

    # Unknown error
    logger.error(f"❌ Unexpected error in rate limiting: {type(exc).__name__}: {exc}")
    return Response(
        content='{"error": "Rate limiting error"}',
        status_code=500,
        media_type="application/json"
    )


def get_limiter() -> Limiter:
    """
    Get rate limiter with Redis storage for distributed rate limiting.

    Returns:
        Limiter instance configured with Redis or in-memory fallback
    """
    # Use standard Redis URL (redis:// or rediss://...) for SlowAPI
    # SlowAPI expects Redis protocol URL with embedded auth, not Upstash REST URL
    # rediss:// is for TLS/SSL connections (required by Upstash)
    if settings.redis_limiter_url and (
        settings.redis_limiter_url.startswith("redis://") or
        settings.redis_limiter_url.startswith("rediss://")
    ):
        try:
            # Extract host for logging (hide password)
            redis_host = settings.redis_limiter_url.split('@')[1] if '@' in settings.redis_limiter_url else "configured"
            protocol = "TLS" if settings.redis_limiter_url.startswith("rediss://") else "standard"
            logger.info(f"✅ Initializing distributed rate limiting with Redis ({protocol}): {redis_host}")
            return Limiter(
                key_func=get_remote_address,
                storage_uri=settings.redis_limiter_url,  # Must be redis:// or rediss:// format with auth embedded
                default_limits=["100/minute"],
            )
        except Exception as e:
            logger.error(f"❌ Failed to initialize Redis rate limiting: {e}")
            logger.warning("⚠️ Falling back to in-memory rate limiting")
    else:
        # Fallback to in-memory rate limiting (not recommended for production)
        if settings.redis_limiter_url:
            logger.warning(f"⚠️ Invalid Redis URL format (must start with redis:// or rediss://): {settings.redis_limiter_url[:30]}...")
        else:
            logger.warning("⚠️ No REDIS_LIMITER_URL configured")
        logger.warning("⚠️ Using in-memory rate limiting (not distributed)")

    return Limiter(
        key_func=get_remote_address,
        default_limits=["100/minute"],
    )


# Global limiter instance
limiter = get_limiter()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all incoming requests."""
    
    # Paths to ignore in logs (external polling, health checks, etc.)
    IGNORED_PATHS = {"/api/sms/stats", "/api/sms/responses", "/health", "/favicon.ico"}
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
        # Process request
        response = await call_next(request)
        
        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Skip logging for ignored paths
        if request.url.path not in self.IGNORED_PATHS:
            logger.info(
                f"{request.method} {request.url.path} "
                f"- {response.status_code} "
                f"({duration_ms}ms)"
            )
        
        # Add timing header
        response.headers["X-Response-Time"] = f"{duration_ms}ms"
        
        return response


def setup_middleware(app: FastAPI) -> None:
    """Configure all middleware for the application."""

    # Rate limiting with custom error handling
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)
    app.add_exception_handler(ConnectionError, custom_rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)

    # CORS
    # Note: allow_credentials=True + allow_origins=["*"] is invalid per the
    # CORS spec. When origins are unrestricted use allow_credentials=False;
    # when explicit origins are configured credentials can be enabled.
    allow_all = settings.cors_origins == ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request logging
    app.add_middleware(RequestLoggingMiddleware)
