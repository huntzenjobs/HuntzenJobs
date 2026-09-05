"""
API Middleware
===============
Custom middleware for logging, CORS, rate limiting.
"""

import logging
import time
from collections.abc import Callable
from functools import lru_cache
from uuid import UUID, uuid4

import jwt
import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from src.config.settings import settings

logger = logging.getLogger(__name__)


def _canonical_request_id(requested_id: str) -> str:
    """N'accepte qu'un UUID afin d'éviter PII et cardinalité arbitraire dans Sentry."""
    try:
        return UUID(requested_id).hex
    except (AttributeError, TypeError, ValueError):
        return uuid4().hex


@lru_cache(maxsize=4)
def _get_supabase_jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    """Cache le jeu de clés Supabase et refuse les rafraîchissements par `kid` arbitraire."""
    return jwt.PyJWKClient(
        jwks_url,
        cache_keys=True,
        cache_jwk_set=True,
        lifespan=300,
        timeout=2,
    )


def get_verified_supabase_user_rate_limit_key(request: Request) -> str:
    """Utilise le `sub` uniquement après vérification locale de la signature Supabase."""
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer ") or not settings.supabase_url:
        return get_remote_address(request)

    token = authorization[7:].strip()
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")
        key_id = header.get("kid")
        if algorithm not in {"ES256", "RS256"} or not key_id:
            raise jwt.InvalidTokenError("Unsupported Supabase signing key")

        issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1"
        jwks_client = _get_supabase_jwks_client(f"{issuer}/.well-known/jwks.json")
        signing_key = next(
            (key for key in jwks_client.get_signing_keys(refresh=False) if key.key_id == key_id),
            None,
        )
        if signing_key is None:
            raise jwt.InvalidTokenError("Unknown Supabase signing key")

        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=issuer,
            options={"require": ["exp", "sub"]},
        )
        user_id = claims.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise jwt.InvalidTokenError("Missing Supabase subject")
        return f"user:{user_id}"
    except (jwt.PyJWTError, StopIteration, ValueError, TypeError):
        return get_remote_address(request)


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


def _get_rate_limit_redis_url() -> str:
    """Retourne le Redis de limitation partagé, puis le cache en repli legacy."""
    return settings.redis_limiter_url or settings.redis_url


def get_limiter() -> Limiter:
    """
    Get rate limiter with Redis storage for distributed rate limiting.

    Returns:
        Limiter instance configured with Redis or in-memory fallback
    """
    # Use standard Redis URL (redis:// or rediss://...) for SlowAPI
    # SlowAPI expects Redis protocol URL with embedded auth, not Upstash REST URL
    # rediss:// is for TLS/SSL connections (required by Upstash)
    redis_url = _get_rate_limit_redis_url()
    if redis_url and redis_url.startswith(("redis://", "rediss://")):
        try:
            logger.info("✅ Initializing distributed rate limiting with Railway Redis")
            return Limiter(
                key_func=get_remote_address,
                storage_uri=redis_url,
                default_limits=["300/minute"],
                swallow_errors=True,
            )
        except Exception as e:
            logger.error(f"❌ Failed to initialize Redis rate limiting: {e}")
            logger.warning("⚠️ Falling back to in-memory rate limiting")
    else:
        if not redis_url:
            logger.warning("⚠️ No REDIS_LIMITER_URL or REDIS_URL configured")
        logger.warning("⚠️ Using in-memory rate limiting (not distributed)")

    return Limiter(
        key_func=get_remote_address,
        default_limits=["300/minute"],
    )


# Global limiter instance
limiter = get_limiter()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all incoming requests."""

    # Paths to ignore in logs (external polling, health checks, etc.)
    IGNORED_PATHS = {
        "/api/health/ping",
        "/api/sms/responses",
        "/api/sms/stats",
        "/favicon.ico",
        "/health",
    }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        request_id = _canonical_request_id(
            request.headers.get("x-request-id", "")
        )
        request.state.request_id = request_id

        # Le scope couvre toute la requête sans extraire d'identité d'un JWT non vérifié.
        with sentry_sdk.isolation_scope() as scope:
            scope.set_tag("request_id", request_id)
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
        response.headers["X-Request-ID"] = request_id

        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject security headers on all responses (SEC-05)."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        return response


class BanIPMiddleware(BaseHTTPMiddleware):
    """Bloque les IPs bannies via Redis (403)."""

    # Chemins exemptés du check (healthcheck infra)
    EXEMPT_PATHS = {"/health"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis and request.client:
                client_ip = request.client.host
                is_banned = await redis.exists(f"banned_ip:{client_ip}")
                if is_banned:
                    return Response(
                        content='{"error": "Access denied"}',
                        status_code=403,
                        media_type="application/json",
                    )
        except Exception:
            pass  # fail-open si Redis down
        return await call_next(request)


def setup_middleware(app: FastAPI) -> None:
    """Configure all middleware for the application."""

    # Rate limiting with custom error handling
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)
    # ConnectionError retiré — trop large, retournait 503 sur TOUTE erreur réseau (Redis, Groq, DB...)
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

    # Security headers (SEC-05)
    app.add_middleware(SecurityHeadersMiddleware)

    # IP ban check (avant le logging)
    app.add_middleware(BanIPMiddleware)

    # Request logging
    app.add_middleware(RequestLoggingMiddleware)

    # GZip compression — outermost (added last = position 0 in Starlette stack)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
