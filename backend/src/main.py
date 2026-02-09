import os
import json
import uuid
import tempfile
from typing import List, Optional
from contextlib import asynccontextmanager
from functools import lru_cache
from dotenv import load_dotenv
import httpx

# Load environment variables from .env file
load_dotenv()
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form, Header, Depends, Body
from typing import Optional
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
import time
import jwt

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Sentry for error tracking
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

# Structured logging
import structlog

# Configure structlog
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

import logging

# LEGACY MODULES - Commented out (app.graph.builder doesn't exist)
# These were part of old LangGraph system, now replaced by modular routes in src/api/routes
# from app.graph.builder import huntzen_app
# from app.agents import cv_router
# from app.state import HuntZenState
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from app.database import init_db, init_connection_pool_async, close_connection_pool, get_db
from app.cache import init_redis_client, close_redis_client
# from app.geo_api import get_all_countries, get_cities_by_country, get_contract_types
# from job_finder.api_tools import find_recruiter_linkedin, find_multiple_recruiters, search_jobs_aggregated, find_recruiters_by_domain

# Import security validators
from src.utils.validators import (
    validate_user_input,
    validate_email,
    validate_job_title,
    validate_country_code,
    validate_city,
    validate_company_name,
    validate_url
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)
logger = structlog.get_logger(__name__)

# Load environment variables for security
# IMPORTANT: Use SUPABASE JWT_SECRET to verify tokens from Supabase Auth
# You can find this in Supabase Dashboard > Settings > API > JWT Secret
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET") or os.getenv("JWT_SECRET", "")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", os.getenv("SUPABASE_URL", ""))
# Support multiple algorithms: HS256 (symmetric), RS256 (asymmetric), ES256 (elliptic curve)
# ES256 is commonly used by Supabase for better security
JWT_ALGORITHMS = ["HS256", "RS256", "ES256"]
SENTRY_DSN = os.getenv("SENTRY_DSN", "")

# Supabase JWKS configuration for ES256 verification
SUPABASE_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else None

@lru_cache(maxsize=1)
def get_supabase_jwks():
    """
    Fetch and cache Supabase JSON Web Key Set (JWKS) for ES256 verification.
    Cached to avoid repeated HTTP requests.
    """
    if not SUPABASE_JWKS_URL:
        logger.warning("[AUTH] SUPABASE_URL not configured, ES256 verification unavailable")
        return None

    try:
        response = httpx.get(SUPABASE_JWKS_URL, timeout=5.0)
        response.raise_for_status()
        jwks = response.json()
        logger.info(f"[AUTH] Loaded JWKS from Supabase: {len(jwks.get('keys', []))} keys")
        return jwks
    except Exception as e:
        logger.error(f"[AUTH] Failed to fetch JWKS from Supabase: {e}")
        return None

def get_es256_public_key(token_kid: str):
    """
    Get the ES256 public key from Supabase JWKS matching the token's kid.
    """
    jwks = get_supabase_jwks()
    if not jwks:
        return None

    # Find the key with matching kid
    for key_data in jwks.get('keys', []):
        if key_data.get('kid') == token_kid and key_data.get('alg') == 'ES256':
            return jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(key_data))

    logger.warning(f"[AUTH] No matching ES256 key found for kid: {token_kid}")
    return None

# Initialize Sentry for error tracking
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.1,
        integrations=[FastApiIntegration()],
        environment=os.getenv("ENVIRONMENT", "development"),
    )
    logger.info("Sentry initialized for error tracking")
else:
    logger.warning("Sentry DSN not configured - error tracking disabled")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Initialize HTTPBearer for JWT authentication
security = HTTPBearer()

# JWT Token Verification Dependency
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify JWT token (required authentication)."""
    return await _verify_token_impl(credentials)

async def verify_token_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))) -> Optional[dict]:
    """Verify JWT token if present, return None if not (optional authentication)."""
    if not credentials:
        return None
    try:
        return await _verify_token_impl(credentials)
    except HTTPException as e:
        # Token invalid/expired - treat as anonymous user
        logger.info(f"[AUTH] Invalid/expired token in optional auth endpoint: {e.detail}")
        return None

async def _verify_token_impl(credentials: HTTPAuthorizationCredentials) -> dict:
    """
    Verify JWT token and return payload.
    Used as a dependency for protected endpoints.
    Supports HS256, RS256, and ES256 algorithms for Supabase compatibility.
    """
    try:
        token = credentials.credentials

        # First, check which algorithm and key ID (kid) are used
        try:
            header = jwt.get_unverified_header(token)
            algorithm = header.get('alg')
            kid = header.get('kid')
        except Exception as e:
            logger.error(f"Failed to parse JWT header: {e}")
            raise HTTPException(status_code=401, detail="Invalid token format")

        # For ES256 (Elliptic Curve), fetch the public key from Supabase JWKS
        if algorithm == "ES256":
            # Get the ES256 public key matching the token's kid
            public_key = get_es256_public_key(kid)

            if not public_key:
                logger.error(f"[AUTH] ES256 public key not found for kid: {kid}")
                raise HTTPException(
                    status_code=401,
                    detail="Unable to verify token signature: public key not found"
                )

            # Decode and verify with the public key
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                audience="authenticated",
                options={"verify_signature": True}
            )
            logger.info(f"[AUTH] ES256 token verified: user {payload.get('sub')}")
        else:
            # For HS256/RS256, use the secret key
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=[algorithm],
                audience="authenticated",
                options={"verify_signature": True}
            )

        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("JWT token expired")
        raise HTTPException(
            status_code=401,
            detail="Token expired. Please refresh your authentication."
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token."
        )
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Authentication failed."
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Sprint 6: Initialize connection pool FIRST (async)
    logger.info("Initializing connection pool...")
    try:
        await init_connection_pool_async()
        logger.info("Connection pool initialized successfully")
    except Exception as e:
        logger.error(f"Connection pool initialization failed: {e}")

    # Sprint 6 (S6-3): Initialize Redis client for quota caching
    logger.info("Initializing Redis client...")
    try:
        await init_redis_client()
        logger.info("Redis client initialized successfully")
    except Exception as e:
        logger.error(f"Redis client initialization failed: {e}")

    # Initialize database tables (legacy - will be deprecated in Sprint 7)
    logger.info("Initializing database...")
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

    yield

    # Cleanup on shutdown: Close connection pool and Redis
    logger.info("Shutting down application...")
    try:
        await close_connection_pool()
        logger.info("Connection pool closed successfully")
    except Exception as e:
        logger.error(f"Connection pool shutdown failed: {e}")

    try:
        await close_redis_client()
        logger.info("Redis client closed successfully")
    except Exception as e:
        logger.error(f"Redis client shutdown failed: {e}")

app = FastAPI(title="HuntZen - AI Career Assistant", lifespan=lifespan)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration - Allow frontend to call API
# Support multiple frontend URLs separated by commas
# Example: FRONTEND_URL=https://prod.vercel.app,https://staging.vercel.app,https://test.vercel.app
frontend_urls_str = os.getenv('FRONTEND_URL', 'http://localhost:3000')
frontend_urls = [url.strip() for url in frontend_urls_str.split(',') if url.strip()]

# Build list of allowed origins (localhost for development)
allowed_origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",  # Vite dev server
    "http://127.0.0.1:5173",
]

# Add all production frontend URLs
for url in frontend_urls:
    if url and not url.startswith('http://localhost') and not url.startswith('http://127.0.0.1'):
        if url not in allowed_origins:
            allowed_origins.append(url)

# Use regex to allow ALL Vercel deployment URLs (production, pre-production, test)
# This covers preview deployments and any new branches
# Pattern matches: https://frontend-next-*.vercel.app or https://*.vercel.app
vercel_pattern = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=vercel_pattern,  # Allows all Vercel URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store primary frontend URL for redirects (OAuth, Stripe)
# Use the first URL in the list as the primary one
PRIMARY_FRONTEND_URL = frontend_urls[0] if frontend_urls else 'http://localhost:3000'

# Security Headers Middleware (Helmet-style protection)
@app.middleware("http")
async def security_headers(request: Request, call_next):
    """
    Add security headers to all responses.
    Protects against common web vulnerabilities (XSS, clickjacking, MIME sniffing).
    Includes HSTS for production HTTPS environments.
    """
    response = await call_next(request)

    # Base security headers
    headers = {
        # Prevent MIME type sniffing
        "X-Content-Type-Options": "nosniff",

        # Prevent clickjacking attacks
        "X-Frame-Options": "DENY",

        # Enable XSS protection (legacy but still useful)
        "X-XSS-Protection": "1; mode=block",

        # Control referrer information
        "Referrer-Policy": "strict-origin-when-cross-origin",

        # Content Security Policy (CSP)
        # Note: Relaxed for development, should be stricter in production
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https://ngiakfikbuyugqfqtfwp.supabase.co;"
        ),

        # Prevent the browser from caching sensitive data
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",

        # Permissions Policy - restrict browser features
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }

    # Add HSTS only in production with HTTPS
    # HSTS tells browsers to only connect via HTTPS for the specified duration
    environment = os.getenv("ENVIRONMENT", "development")
    is_https = request.url.scheme == "https"

    if environment == "production" and is_https:
        # max-age=31536000 (1 year), includeSubDomains, preload
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    elif is_https:
        # Shorter duration for staging/development HTTPS
        headers["Strict-Transport-Security"] = "max-age=86400; includeSubDomains"

    response.headers.update(headers)

    return response

# Global Exception Handler with Sentry Integration
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch all unhandled exceptions and report to Sentry.
    Returns user-friendly error message.
    """
    # Log the error
    logger.error(
        "Unhandled exception",
        exc_info=exc,
        extra={
            "path": request.url.path,
            "method": request.method,
            "client": request.client.host if request.client else "unknown",
        }
    )

    # Capture in Sentry if configured
    if SENTRY_DSN:
        sentry_sdk.capture_exception(exc)

    # Return generic error to client (don't leak stack traces)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error. Our team has been notified.",
            "error_id": str(uuid.uuid4())  # Unique error ID for support
        }
    )

# ============================================
# API ROUTES - New Architecture
# ============================================
# Import and include API routers from src/api/routes
try:
    from src.api.routes import job_fairs as job_fairs_routes
    app.include_router(job_fairs_routes.router, prefix="/api/job-fairs", tags=["job-fairs"])
    logger.info("[ROUTES] Job Fairs routes registered at /api/job-fairs")
except Exception as e:
    logger.warning(f"[ROUTES] Could not load job-fairs routes: {e}")

# Assistant routes (job-scout, cv-analyzer, cv-adapter, interview-sim)
try:
    from src.api.routes import assistant as assistant_routes
    app.include_router(assistant_routes.router, prefix="/api/assistant", tags=["Multi-Assistant"])
    logger.info("[ROUTES] Assistant routes registered at /api/assistant")
except Exception as e:
    logger.warning(f"[ROUTES] Could not load assistant routes: {e}")

# Interview Simulator (ElevenLabs) - BETA Feature
ENABLE_INTERVIEW_SIMULATOR = os.getenv("ENABLE_INTERVIEW_SIMULATOR", "false").lower() == "true"

if ENABLE_INTERVIEW_SIMULATOR:
    try:
        from src.api.routes import interview as interview_routes
        app.include_router(interview_routes.router, prefix="/api/interview", tags=["Interview"])
        logger.info("✅ [ROUTES] Interview Simulator (ElevenLabs) activated at /api/interview")
    except Exception as e:
        logger.warning(f"⚠️  [ROUTES] Could not load interview routes: {e}")
else:
    logger.info("⏸️  [ROUTES] Interview Simulator disabled (set ENABLE_INTERVIEW_SIMULATOR=true to enable)")

# Templates setup
templates = Jinja2Templates(directory="templates")

# Store session states in memory (Pro tip: use Supabase for persistent memory)
sessions = {}
# Session cleanup tracking
SESSION_TTL = 3600  # 1 hour in seconds
session_timestamps = {}

class ChatMessage(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    session_id: str = Field(..., pattern=r'^[a-f0-9-]{36}$', description="Valid UUID session ID")

# ============================================
# IMPORT ALL API ROUTERS FROM src/api/routes
# ============================================
from src.api.routes import router as api_router

# Include all API routers (auth, coach, jobs, cv, etc.)
app.include_router(api_router)
logger.info("[ROUTES] ✅ All API routes registered via src.api.routes")

# ============================================
# LEGACY / UNIQUE ROUTES (Not in modules)
# ============================================


@app.get("/old", response_class=HTMLResponse)
async def get_old_index(request: Request):
    """Ancienne interface chat (conservée pour référence)"""
    session_id = str(uuid.uuid4())
    return templates.TemplateResponse("index.html", {"request": request, "session_id": session_id})




@app.get("/cv-tester", response_class=HTMLResponse)
async def get_cv_tester(request: Request):
    """Interface minimale pour tester l'analyse de CV"""
    return templates.TemplateResponse("cv_tester.html", {"request": request})



# LEGACY ENDPOINT - Commented out (uses huntzen_app which doesn\'t exist)
# @app.post("/chat")
@limiter.limit("30/minute")
async def chat_endpoint(request: Request, data: ChatMessage):
    try:
        session_id = data.session_id
        user_msg = data.message.strip()

        # Clean up expired sessions periodically
        cleanup_expired_sessions()

        # Validate and sanitize input
        try:
            user_msg = validate_user_input(user_msg, max_length=2000)
        except ValueError as e:
            logger.warning(f"Invalid chat input: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        
        # Initialize state if new session
        if session_id not in sessions:
            sessions[session_id] = {
                "messages": [],
                "user_language": "fr",
                "next_agent": "",
                "search_results": []
            }
            logger.info(f"New session created: {session_id}")
        
        # Update session timestamp
        session_timestamps[session_id] = time.time()
        
        state = sessions[session_id]
        state["messages"].append(HumanMessage(content=user_msg))
        
        # Execute the graph with error handling
        try:
            final_state = await huntzen_app.ainvoke(state)
        except Exception as e:
            logger.error(f"Graph execution error for session {session_id}: {e}")
            # Return a fallback response
            from langchain_core.messages import AIMessage
            error_message = {
                "messages": state["messages"] + [AIMessage(content="Désolé, je rencontre une erreur temporaire. Pouvez-vous reformuler votre demande ?")],
                "user_language": state.get("user_language", "fr"),
                "next_agent": "CareerCoach",
                "search_results": []
            }
            sessions[session_id] = error_message
            return {
                "response": "Désolé, je rencontre une erreur temporaire. Pouvez-vous reformuler votre demande ?",
                "agent": "CareerCoach",
                "jobs": [],
                "recruiter": None,
                "error": "temporary_error"
            }
        
        # Update the session
        sessions[session_id] = final_state
        
        # Format response for UI
        if final_state.get("messages"):
            last_message = final_state["messages"][-1].content
        else:
            last_message = "Je n'ai pas pu traiter votre demande."
        
        response = {
            "response": last_message,
            "agent": final_state.get("next_agent", "Assistant"),
            "jobs": final_state.get("search_results", [])[:5],  # Send top 5 to UI
            "recruiter": final_state.get("recruiter_info")
        }
        
        logger.info(f"Response sent for session {session_id}: agent={response['agent']}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in chat endpoint: {e}")
        return {
            "response": "Une erreur inattendue s'est produite. Veuillez réessayer.",
            "agent": "ErrorHandler",
            "jobs": [],
            "recruiter": None,
            "error": str(e)
        }

class ResetRequest(BaseModel):
    session_id: str = Field(..., pattern=r'^[a-f0-9-]{36}$')



# LEGACY ENDPOINT - Commented out
# @app.post("/reset")
@limiter.limit("30/minute")  # Prevent abuse of session resets
async def reset_session(request: Request, data: ResetRequest):
    try:
        session_id = data.session_id
        if session_id in sessions:
            del sessions[session_id]
            logger.info(f"Session reset: {session_id}")
        if session_id in session_timestamps:
            del session_timestamps[session_id]
        return {"status": "success", "message": "Session reset successfully"}
    except Exception as e:
        logger.error(f"Error resetting session: {e}")
        return {"status": "error", "message": "Failed to reset session"}


# ============================================
# NOUVEAUX ENDPOINTS - RECHERCHE DIRECTE (SANS IA)
# ============================================

class JobSearchRequest(BaseModel):
    job_title: str = Field(..., min_length=1, max_length=200, description="Intitulé du poste")
    country_code: str = Field(..., min_length=2, max_length=3, description="Code pays ISO")
    city: str = Field(default="", max_length=100, description="Ville (optionnel)")
    contract_type: str = Field(default="", max_length=50, description="Type de contrat")

class RecruiterSearchRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200, description="Nom de l'entreprise")
    location: str = Field(default="", max_length=100, description="Lieu (optionnel)")

class RecruiterByDomainRequest(BaseModel):
    domain: str = Field(..., min_length=1, max_length=100, description="Domaine/secteur (ex: Data, Dev, Marketing)")
    country: str = Field(default="France", max_length=50, description="Pays")
    city: str = Field(default="", max_length=100, description="Ville (optionnel)")




# LEGACY ENDPOINT - Uses job_finder which should be in modular routes
# @app.post("/api/search/recruiter")
@limiter.limit("10/minute")
async def search_recruiter_direct(request: Request, data: RecruiterSearchRequest):
    """
    Recherche directe de PLUSIEURS recruteurs via LinkedIn/SerpApi.
    Retourne jusqu'à 5 recruteurs avec leurs emails si disponibles.
    """
    try:
        # Validate inputs
        try:
            company = validate_company_name(data.company_name)
            location = validate_city(data.location) if data.location else ""
        except ValueError as e:
            logger.warning(f"Invalid recruiter search input: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        
        logger.info(f"[SEARCH] Recruiters at '{company}' in {location}")
        
        # Chercher plusieurs recruteurs
        recruiters = find_multiple_recruiters(company, location, limit=5)
        
        if recruiters:
            return {
                "success": True,
                "recruiters": recruiters,  # Liste de recruteurs
                "recruiter": recruiters[0],  # Premier pour compatibilité
                "count": len(recruiters),
                "company": company
            }
        else:
            return {
                "success": False,
                "message": f"Aucun recruteur trouvé pour {company}",
                "recruiters": [],
                "recruiter": None,
                "count": 0
            }
    except Exception as e:
        logger.error(f"[SEARCH] Recruiter error: {e}")
        return {"success": False, "error": str(e), "recruiters": [], "recruiter": None}




# LEGACY ENDPOINT - Uses job_finder
# @app.post("/api/search/recruiters-by-domain")
@limiter.limit("10/minute")
async def search_recruiters_by_domain(request: Request, data: RecruiterByDomainRequest):
    """
    Recherche de recruteurs par DOMAINE (ex: Data, Dev, Marketing).
    Trouve des Talent Acquisition / Recruiters qui recrutent dans ce secteur.
    """
    try:
        # Validate inputs
        try:
            domain = validate_user_input(data.domain, max_length=100)
            country = validate_user_input(data.country, max_length=50) if data.country else "France"
            city = validate_city(data.city) if data.city else ""
        except ValueError as e:
            logger.warning(f"Invalid domain search input: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        
        logger.info(f"[SEARCH] Recruiters in domain '{domain}' in {city} {country}")
        
        # Chercher des recruteurs par domaine
        recruiters = find_recruiters_by_domain(domain, country, city, limit=10)
        
        if recruiters:
            return {
                "success": True,
                "recruiters": recruiters,
                "count": len(recruiters),
                "domain": domain,
                "country": country
            }
        else:
            return {
                "success": False,
                "message": f"Aucun recruteur trouvé pour le domaine {domain} en {country}",
                "recruiters": [],
                "count": 0
            }
    except Exception as e:
        logger.error(f"[SEARCH] Recruiter by domain error: {e}")
        return {"success": False, "error": str(e), "recruiters": [], "count": 0}


class JobDescriptionRequest(BaseModel):
    url: str = Field(..., description="URL de l'offre d'emploi")
    source: str = Field(default="", description="Source de l'offre (adzuna, google_jobs, etc.)")




# LEGACY ENDPOINT - Commented out (uses huntzen_app)
# @app.post("/api/coach/generate-title")
@limiter.limit("30/minute")
async def generate_conversation_title(request: Request, data: GenerateTitleRequest):
    """
    Generate intelligent conversation title using existing coach agent.
    Sprint 5: Coach History feature - Backend LLM title generation.
    """
    try:
        # Validate input
        if not data.messages or len(data.messages) < 1:
            raise HTTPException(status_code=400, detail="At least 1 message required")

        # Take first 2-3 messages for context
        first_messages = data.messages[:3]

        # Build context string
        context = "\n".join([
            f"{msg.get('role', 'user')}: {msg.get('content', '')[:150]}"
            for msg in first_messages
        ])

        # Optimized prompt for title generation
        prompt = f"""Génère un titre court (MAX 50 caractères) pour cette conversation de coaching carrière.

Conversation:
{context}

Instructions:
- Maximum 50 caractères
- En français
- Commence par un verbe d'action ou sujet principal
- Pas de guillemets
- Exemples: "Optimiser mon CV tech", "Négocier salaire senior", "Reconversion data analyst"

Titre:"""

        # Create a temporary session for title generation
        title_session_id = f"title_gen_{uuid.uuid4()}"
        sessions[title_session_id] = {
            "messages": [],
            "user_language": "fr",
            "next_agent": "CareerCoach",
            "search_results": []
        }

        # Execute coach agent
        session_timestamps[title_session_id] = time.time()
        state = sessions[title_session_id]
        state["messages"].append(HumanMessage(content=prompt))
        state["next_agent"] = "CareerCoach"

        final_state = await huntzen_app.ainvoke(state)

        # Extract title from response
        title_response = final_state["messages"][-1].content if final_state.get("messages") else ""
        title = title_response.strip().strip('"\'')

        # Validate title length
        if not title or len(title) > 60:
            raise ValueError("Invalid title generated")

        # Cleanup temporary session
        if title_session_id in sessions:
            del sessions[title_session_id]
        if title_session_id in session_timestamps:
            del session_timestamps[title_session_id]

        return GenerateTitleResponse(
            title=title[:60],
            fallback_used=False
        )

    except Exception as e:
        logger.warning(f"[TITLE_GEN] LLM generation failed: {e}")

        # FALLBACK: Extract from first user message
        first_user_msg = next(
            (msg for msg in data.messages if msg.get('role') == 'user'),
            None
        )

        if first_user_msg:
            content = first_user_msg.get('content', 'Nouvelle conversation')
            title = content[:50] + ("..." if len(content) > 50 else "")
        else:
            title = "Nouvelle conversation"

        return GenerateTitleResponse(
            title=title,
            fallback_used=True
        )


# ============================================
# ENDPOINT ANALYSE CV (ATS Score + Matching)
# ============================================

class CVAnalysisRequest(BaseModel):
    cv_text: str = Field(..., min_length=50, max_length=50000, description="Contenu du CV")
    job_description: Optional[str] = Field(None, description="Description du poste (optionnel)")
    language: str = Field(default="fr", description="Langue de réponse (fr/en)")



# LEGACY ENDPOINT - Replaced by /api/cv/analyze in src/api/routes/cv.py
# @app.post("/api/analyze-cv")
@limiter.limit("5/minute")
async def analyze_cv(
    request: Request,
    data: CVAnalysisRequest,
    token_payload: dict = Depends(verify_token)
):
    """
    Analyse un CV avec score ATS et compatibilité job.
    - Sans job_description: Score ATS + recommandations générales
    - Avec job_description: Score compatibilité + gap analysis

    Uses CV Router for dual system support (legacy/new).
    Sprint 6 (S6-3): Now includes quota checking.
    """
    from app.quota import check_and_enforce_quota, increment_user_usage

    try:
        # Get user_id from JWT token
        user_id = token_payload.get("sub") or token_payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing user_id")

        # Sprint 6 (S6-3): Check quota before processing
        await check_and_enforce_quota(user_id, "cv_analysis")

        # Validate inputs
        try:
            cv_text = validate_user_input(data.cv_text, max_length=50000)
            job_description = validate_user_input(data.job_description, max_length=10000) if data.job_description else None
            language = data.language if data.language in ["fr", "en"] else "fr"
        except ValueError as e:
            logger.warning(f"Invalid CV analysis input: {e}")
            raise HTTPException(status_code=400, detail=str(e))

        # Use new router system
        result = await cv_router.analyze_cv(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
        )

        logger.info(f"[CV_ANALYSIS] Completed via {cv_router.CV_SYSTEM} system")

        # Sprint 6 (S6-3): Increment usage after successful analysis
        await increment_user_usage(user_id, "cv_analysis", 1)

        # Ensure JSON-serializable
        from fastapi.encoders import jsonable_encoder
        return jsonable_encoder(result)

    except Exception as e:
        logger.error(f"[CV_ANALYSIS] Error: {e}")
        return {
            "success": False,
            "error": str(e),
            "analysis": "Erreur lors de l'analyse du CV."
        }


# ============================================
# ENDPOINT UPLOAD CV (PDF, DOCX, DOC) + ANALYSE
# ============================================



# LEGACY ENDPOINT - Replaced by /api/cv/upload in src/api/routes/cv.py
# @app.post("/api/analyze-cv-pdf")
@limiter.limit("3/minute")
async def analyze_cv_file(
    request: Request,
    file: UploadFile = File(...),
    job_description: Optional[str] = Form(None),
    language: str = Form("fr"),
    token_payload: dict = Depends(verify_token)
):
    """
    Upload un CV au format PDF ou DOCX et l'analyse avec:
    - IBM Docling pour extraction haute qualité PDF → Markdown
    - python-docx pour extraction DOCX
    - Groq llama-3.3-70b pour l'analyse approfondie via sub-agents

    Modes:
    - Sans job_description: Score ATS + recommandations
    - Avec job_description: Score compatibilité + gap analysis

    Uses CV Router for dual system support (legacy/new).
    Sprint 6 (S6-3): Now includes quota checking.
    """
    from app.quota import check_and_enforce_quota, increment_user_usage

    try:
        # Get user_id from JWT token
        user_id = token_payload.get("sub") or token_payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing user_id")

        # Sprint 6 (S6-3): Check quota before processing
        await check_and_enforce_quota(user_id, "cv_analysis")

        filename_lower = file.filename.lower()

        # Vérifier le type de fichier - PDF et DOCX supportés
        if not (filename_lower.endswith('.pdf') or filename_lower.endswith('.docx')):
            return {
                "success": False,
                "error": "Format non supporté. Veuillez utiliser un fichier PDF ou DOCX."
            }

        # Lire le contenu du fichier
        content = await file.read()

        logger.info(f"[CV_FILE] Processing {file.filename} ({len(content)} bytes)")

        # Extraire le texte selon le format
        if filename_lower.endswith('.pdf'):
            cv_text = await cv_router.extract_text_from_pdf(content)
        else:  # .docx
            # Extract from DOCX using python-docx
            from docx import Document
            import io
            doc = Document(io.BytesIO(content))
            cv_text = "\n".join([para.text for para in doc.paragraphs])

        if not cv_text.strip() or len(cv_text.strip()) < 100:
            return {
                "success": False,
                "error": "Impossible d'extraire le texte du fichier. Le fichier est peut-être vide, scanné ou protégé."
            }

        logger.info(f"[CV_FILE] Extracted {len(cv_text)} chars from {file.filename}")

        # Analyser avec le router
        logger.info(f"[CV_FILE] Starting analysis via {cv_router.CV_SYSTEM} system...")
        result = await cv_router.analyze_cv(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
        )
        logger.info(f"[CV_FILE] Analysis completed successfully")

        # Sprint 6 (S6-3): Increment usage after successful analysis
        await increment_user_usage(user_id, "cv_analysis", 1)

        # Ajouter metadata
        result["filename"] = file.filename
        result["text_length"] = len(cv_text)

        # S'assurer que tout est JSON-serializable
        from fastapi.encoders import jsonable_encoder
        return jsonable_encoder(result)

    except ValueError as e:
        logger.error(f"[CV_FILE] Validation error: {e}")
        return {
            "success": False,
            "error": str(e)
        }
    except Exception as e:
        import traceback
        logger.error(f"[CV_FILE] Error: {e}")
        logger.error(f"[CV_FILE] Traceback: {traceback.format_exc()}")
        return {
            "success": False,
            "error": str(e)
        }


# ============================================
# MODAL CV PROCESSING (S6-6)
# ============================================
# Async CV processing with Modal Labs serverless functions
# - Non-blocking workflow: Upload → Spawn Modal → Poll status
# - Auto-scaling: 0 → 1000 workers in <30s
# - Cost-effective: $48/month @ 1000 CV/day vs $200+ Railway



@app.post("/api/cv-analysis/callback")
@limiter.limit("1000/hour")
async def cv_analysis_callback(
    request: Request,
    callback_data: dict = Body(...)
):
    """
    Callback endpoint for Modal to report CV processing completion (Issue 2 Fix).

    Only increment quota if processing succeeded.

    Security: Validates Modal secret token via X-Modal-Secret header.

    Expected payload:
    {
        "cv_id": "uuid",
        "user_id": "uuid" (optional, null for anonymous),
        "status": "completed" | "failed"
    }

    Returns: { "success": true, "quota_incremented": true }
    """
    from app.quota import increment_user_usage
    import os

    try:
        # Validate Modal secret from header
        modal_secret = request.headers.get("X-Modal-Secret")
        expected_secret = os.getenv("MODAL_CALLBACK_SECRET")

        if not expected_secret:
            logger.error("[CALLBACK] MODAL_CALLBACK_SECRET not configured")
            raise HTTPException(status_code=500, detail="Server configuration error")

        if modal_secret != expected_secret:
            logger.warning(f"[CALLBACK] Invalid callback secret from IP: {request.client.host if request.client else 'unknown'}")
            raise HTTPException(status_code=403, detail="Invalid callback secret")

        # Extract payload
        cv_id = callback_data.get("cv_id")
        user_id = callback_data.get("user_id")
        status = callback_data.get("status")

        if not cv_id or not status:
            raise HTTPException(status_code=400, detail="Missing cv_id or status")

        logger.info(f"[CALLBACK] Received: cv_id={cv_id}, user_id={user_id}, status={status}")

        # Only increment quota if processing succeeded AND user is authenticated
        if status == "completed" and user_id:
            success = await increment_user_usage(user_id, "cv_analysis", 1)
            logger.info(f"[CALLBACK] ✅ Incremented cv_analysis quota for user {user_id} after successful CV processing: {cv_id}")
            return {
                "success": True,
                "quota_incremented": success,
                "cv_id": cv_id
            }
        elif status == "failed":
            logger.warning(f"[CALLBACK] ❌ CV processing failed for {cv_id}, quota NOT incremented")
            return {
                "success": True,
                "quota_incremented": False,
                "cv_id": cv_id,
                "reason": "processing_failed"
            }
        else:
            # Anonymous user or other status
            logger.info(f"[CALLBACK] No quota increment needed for cv_id={cv_id} (status={status}, user_id={user_id})")
            return {
                "success": True,
                "quota_incremented": False,
                "cv_id": cv_id,
                "reason": "anonymous_or_other_status"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CALLBACK] Error processing callback: {e}")
        raise HTTPException(status_code=500, detail=f"Callback processing failed: {str(e)}")




@app.get("/api/usage-stats")
@limiter.limit("60/minute")  # Moderate limit for stats retrieval
async def get_usage_stats(
    request: Request,
    token_payload: dict = Depends(verify_token)
):
    """
    Get usage statistics for authenticated user.
    Sprint 6 (S6-3): Now uses database-backed quota system with Redis caching.

    NOTE: This endpoint is deprecated in favor of /api/auth/me which returns more complete info.
    """
    from app.quota import get_user_quota_status

    try:
        # Get user_id from JWT token
        user_id = token_payload.get("sub") or token_payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing user_id")

        # Get quota status from database (with Redis caching)
        quota_status = await get_user_quota_status(user_id)

        if not quota_status:
            return {
                "success": False,
                "error": "No active subscription found",
                "stats": {}
            }

        # Transform to match frontend expectations
        stats = {}
        for feature, data in quota_status.items():
            stats[feature] = {
                "current": data["used"],
                "limit": data["limit"],
                "remaining": data["remaining"],
                "percentage": data["percentage"]
            }

        # Get reset time from first feature
        reset_at = next(iter(quota_status.values()))["reset_at"] if quota_status else None

        return {
            "success": True,
            "stats": stats,
            "reset_at": reset_at
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[USAGE] Stats error: {e}")
        return {"success": False, "error": str(e)}


# ============================================
# SAVED JOBS ENDPOINTS (Sprint 7)
# ============================================

class SaveJobRequest(BaseModel):
    job_title: str = Field(..., min_length=1, max_length=500)  # Increased for long job titles
    company: str = Field(..., min_length=1, max_length=200)
    location: str = Field(..., max_length=200)
    salary: Optional[str] = Field(None, max_length=100)
    job_url: str = Field(..., min_length=1, max_length=3000)  # Increased for long URLs with tracking params
    description: Optional[str] = Field(None, max_length=10000)  # Increased for full descriptions
    external_job_id: Optional[str] = Field(None, max_length=500)  # Increased for complex IDs
    job_source: str = Field(default="adzuna", max_length=50)




if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
