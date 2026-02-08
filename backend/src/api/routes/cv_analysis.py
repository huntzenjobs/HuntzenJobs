"""
CV Analysis Async Routes (Modal Integration)
=============================================
Routes for asynchronous CV processing with Modal Labs.

Endpoints:
- POST /async: Upload CV for async processing
- GET /status/{cv_id}: Poll CV analysis status
- GET /list: List user's CV analyses

Author: HuntZen Team
Date: 2026-02-08
Sprint: 6 - Modal Integration
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Request, Query
from typing import Optional
from src.modal_integration import (
    process_cv_async,
    get_cv_analysis_status,
    list_user_cv_analyses
)
from src.api.deps import get_user_id_from_token

router = APIRouter()


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
