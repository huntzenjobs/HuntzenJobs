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

from src.config.settings import settings

logger = logging.getLogger(__name__)


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
