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
from src.utils.cache import get_redis

logger = logging.getLogger(__name__)


def get_limiter() -> Limiter:
    """
    Get rate limiter with Redis storage for distributed rate limiting.

    Returns:
        Limiter instance configured with Redis or in-memory fallback
    """
    redis = get_redis()

    if redis and settings.redis_url:
        # Use Redis for distributed rate limiting (recommended for production)
        return Limiter(
            key_func=get_remote_address,
            storage_uri=settings.redis_url,
            storage_options={"token": settings.get_redis_token()},
            default_limits=["100/minute"],
        )
    else:
        # Fallback to in-memory rate limiting (not recommended for production)
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

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request logging
    app.add_middleware(RequestLoggingMiddleware)
