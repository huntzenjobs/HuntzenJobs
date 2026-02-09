"""
CV Analysis Async Routes (Modal Integration)
=============================================
Routes for asynchronous CV processing with Modal Labs.

Endpoints:
- POST /async: Upload CV for async processing
- GET /status/{cv_id}: Poll CV analysis status
- GET /list: List user's CV analyses
- POST /callback: Modal webhook for CV processing completion (internal)

Author: HuntZen Team
Date: 2026-02-08
Sprint: 6 - Modal Integration
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Request, Query, Body
from typing import Optional, Dict, Any
import os
from supabase import create_client, Client
from structlog import get_logger

from src.modal_integration import (
    process_cv_async,
    get_cv_analysis_status,
    list_user_cv_analyses
)
from src.api.deps import get_user_id_from_token

logger = get_logger(__name__)
router = APIRouter()

# ============================================
# SUPABASE CLIENT FOR QUOTA MANAGEMENT
# ============================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if SUPABASE_URL and SUPABASE_KEY:
    supabase_client: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase_client = None
    logger.warning("Supabase not configured for quota management")


# ============================================
# QUOTA INCREMENT HELPER
# ============================================

async def increment_user_cv_quota(user_id: str) -> bool:
    """
    Increment cv_analysis usage quota for user via Supabase RPC.

    Calls the increment_usage() PostgreSQL function via Supabase.

    Args:
        user_id: User UUID

    Returns:
        True if incremented successfully, False otherwise
    """
    if not supabase_client:
        logger.error("[QUOTA] Supabase client not configured")
        return False

    try:
        # Call PostgreSQL function via Supabase RPC
        response = supabase_client.rpc(
            "increment_usage",
            {
                "p_user_id": user_id,
                "p_feature": "cv_analysis",
                "p_amount": 1
            }
        ).execute()

        success = response.data if response.data else False

        if success:
            logger.info(f"[QUOTA] ✅ Incremented cv_analysis quota for user {user_id}")
        else:
            logger.warning(f"[QUOTA] ⚠️ Failed to increment quota for user {user_id}")

        return bool(success)

    except Exception as e:
        logger.error(f"[QUOTA] Error incrementing quota for {user_id}: {e}")
        return False


@router.post("/async")
async def analyze_cv_async(
    file: Optional[UploadFile] = File(None),
    cv_text: Optional[str] = Form(None),
    job_description: Optional[str] = Form(None),
    language: str = Form("fr"),
    authorization: Optional[str] = Header(default=None)
):
    """
    Upload CV for async processing with Modal Labs.

    Supports both file upload and text input modes:
    - File mode: Upload PDF file
    - Text mode: Provide CV text directly

    The CV is processed asynchronously by Modal Labs using Docling for extraction
    and Groq LLM for analysis. The frontend should poll the /status endpoint
    for results.

    Args:
        file: PDF file to analyze (optional, mutually exclusive with cv_text)
        cv_text: CV text content (optional, mutually exclusive with file)
        job_description: Optional job description for matching analysis
        language: Response language ('fr' or 'en')
        user_id: Authenticated user ID (from token)

    Returns:
        {
            "success": true,
            "cv_id": "uuid",
            "status": "pending",
            "message": "CV analysis started...",
            "estimated_time_seconds": 15
        }

    Raises:
        401: Authentication required
        400: Neither file nor cv_text provided
        500: Processing failed
    """
    # Get user ID from token
    user_id = get_user_id_from_token(authorization)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required for CV analysis"
        )

    if not file and not cv_text:
        raise HTTPException(
            status_code=400,
            detail="Please provide either a file or cv_text parameter"
        )

    return await process_cv_async(
        user_id=user_id,
        file=file,
        cv_text=cv_text,
        job_description=job_description,
        language=language
    )


@router.get("/status/{cv_id}")
async def get_analysis_status(
    cv_id: str,
    authorization: Optional[str] = Header(default=None),
    anonymous_id: Optional[str] = Query(None)
):
    """
    Poll CV analysis status.

    This endpoint is called repeatedly by the frontend to check processing status.
    When status becomes 'completed', the result field will contain the full analysis.

    Args:
        cv_id: CV analysis UUID
        user_id: Authenticated user ID (from token, optional for anonymous)
        anonymous_id: Anonymous session ID (for anonymous users)

    Returns:
        {
            "cv_id": "uuid",
            "status": "pending" | "processing" | "completed" | "failed",
            "result": {...} (only when status='completed'),
            "error": "..." (only when status='failed'),
            "created_at": "...",
            "completed_at": "...",
            "processing_time_seconds": 12.5
        }

    Raises:
        404: CV analysis not found or unauthorized
        500: Database error
    """
    # Get user ID from token (optional for status polling)
    user_id = get_user_id_from_token(authorization)

    return await get_cv_analysis_status(
        cv_id=cv_id,
        user_id=user_id,
        anonymous_id=anonymous_id
    )


@router.get("/list")
async def list_analyses(
    authorization: Optional[str] = Header(default=None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """
    List user's CV analyses (history).

    Returns a paginated list of all CV analyses for the authenticated user,
    ordered by creation date (most recent first).

    Args:
        user_id: Authenticated user ID (from token)
        limit: Maximum number of results (1-100, default 20)
        offset: Pagination offset (default 0)

    Returns:
        {
            "success": true,
            "total": 15,
            "analyses": [
                {
                    "cv_id": "uuid",
                    "status": "completed",
                    "created_at": "...",
                    "completed_at": "...",
                    "processing_time_seconds": 12.5,
                    "has_result": true
                },
                ...
            ]
        }

    Raises:
        401: Authentication required
        500: Database error
    """
    # Get user ID from token
    user_id = get_user_id_from_token(authorization)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required to view CV history"
        )

    return await list_user_cv_analyses(
        user_id=user_id,
        limit=limit,
        offset=offset
    )


@router.post("/callback")
async def cv_analysis_callback(
    request: Request,
    callback_data: Dict[str, Any] = Body(...)
):
    """
    Callback endpoint for Modal to report CV processing completion.

    Only increment quota if processing succeeded.

    Security: Validates Modal secret token via X-Modal-Secret header.

    Expected payload:
    {
        "cv_id": "uuid",
        "user_id": "uuid" (optional, null for anonymous),
        "status": "completed" | "failed"
    }

    Returns: { "success": true, "quota_incremented": true }

    Raises:
        403: Invalid callback secret
        400: Missing required fields
        500: Configuration error
    """
    try:
        # Validate Modal secret from header
        modal_secret = request.headers.get("X-Modal-Secret")
        expected_secret = os.getenv("MODAL_CALLBACK_SECRET")

        if not expected_secret:
            logger.error("[CALLBACK] MODAL_CALLBACK_SECRET not configured")
            raise HTTPException(status_code=500, detail="Server configuration error")

        if modal_secret != expected_secret:
            logger.warning(
                f"[CALLBACK] Invalid callback secret from IP: {request.client.host if request.client else 'unknown'}"
            )
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
            success = await increment_user_cv_quota(user_id)
            logger.info(
                f"[CALLBACK] ✅ Incremented cv_analysis quota for user {user_id} "
                f"after successful CV processing: {cv_id}"
            )
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
            logger.info(
                f"[CALLBACK] No quota increment needed for cv_id={cv_id} "
                f"(status={status}, user_id={user_id})"
            )
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
