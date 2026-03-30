"""
Modal Integration for CV Processing (S6-6)

This module provides async CV processing using Modal Labs serverless functions.
Replaces synchronous processing with non-blocking workflow:

1. Upload PDF to Supabase Storage
2. Create database record with status='pending'
3. Spawn Modal function (non-blocking)
4. Return immediately to frontend
5. Frontend polls status endpoint
6. Modal updates database when complete

Author: HuntZen Team
Date: 2026-01-28
Sprint: 6 - Ticket S6-6
"""

import os
import uuid
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException, UploadFile
from structlog import get_logger
from supabase import Client, create_client

logger = get_logger(__name__)


def _safe_int(value: Any, default: int = 0) -> int:
    """Convert value to int safely with fallback."""
    try:
        if value is None:
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _as_list(value: Any) -> list[str]:
    """Normalize any value to a list of strings for frontend safety."""
    if value is None:
        return []
    # If we receive a dict like {"content_improvements": [...]}, unwrap common key
    if isinstance(value, dict):
        for key in ("content_improvements", "items", "values"):
            if key in value and isinstance(value[key], (list, tuple, set)):
                return [str(v) for v in value[key] if v is not None]
        # Otherwise fall back to stringification
        return [str(value)]
    if isinstance(value, list):
        return [str(v) for v in value if v is not None]
    if isinstance(value, (tuple, set)):
        return [str(v) for v in value if v is not None]
    # If payload accidentally sends a single string/object, wrap it
    return [str(value)]


def _normalize_analysis_result(raw_result: Any) -> dict[str, Any]:
    """
    Normalize CV analysis payload to frontend-compatible schema.

    Handles legacy/new payload variants where:
    - result may be non-dict
    - ats_score may be a number or an object
    - fields can have different names (recommended_job_titles, weaknesses, etc.)
    """
    if not isinstance(raw_result, dict):
        score = _safe_int(raw_result, 0) if isinstance(raw_result, int | float | str) else 0
        return {
            "ats_score": {
                "overall_score": max(0, min(100, score)),
                "formatting_score": 0,
                "keywords_score": 0,
                "structure_score": 0,
                "readability_score": 0,
            },
            "strengths": [],
            "improvements": [],
            "missing_sections": [],
            "keywords_found": [],
            "keywords_missing": [],
            "suggested_job_titles": [],
        }

    ats_raw = raw_result.get("ats_score")
    ats_details = raw_result.get("ats_details") or {}

    if isinstance(ats_raw, dict):
        overall = _safe_int(
            ats_raw.get("overall_score", ats_raw.get("total", 0)),
            0,
        )
        formatting = _safe_int(
            ats_raw.get("formatting_score", ats_raw.get("format_score", 0)),
            0,
        )
        keywords = _safe_int(ats_raw.get("keywords_score", 0), 0)
        structure = _safe_int(ats_raw.get("structure_score", ats_raw.get("experience_score", 0)), 0)
        readability = _safe_int(ats_raw.get("readability_score", ats_raw.get("skills_score", 0)), 0)
    else:
        overall = _safe_int(ats_raw if ats_raw is not None else raw_result.get("overall_score"), 0)
        formatting = _safe_int(ats_details.get("formatting_score", ats_details.get("format_score", 0)), 0)
        keywords = _safe_int(ats_details.get("keywords_score", 0), 0)
        structure = _safe_int(ats_details.get("structure_score", ats_details.get("experience_score", 0)), 0)
        readability = _safe_int(ats_details.get("readability_score", ats_details.get("skills_score", 0)), 0)

    return {
        **raw_result,
        "ats_score": {
            "overall_score": max(0, min(100, overall)),
            "formatting_score": max(0, min(100, formatting)),
            "formatting_explanation": (
                raw_result.get("ats_score", {}).get("formatting_explanation")
                if isinstance(raw_result.get("ats_score"), dict)
                else None
            ),
            "keywords_score": max(0, min(100, keywords)),
            "keywords_explanation": (
                raw_result.get("ats_score", {}).get("keywords_explanation")
                if isinstance(raw_result.get("ats_score"), dict)
                else None
            ),
            "structure_score": max(0, min(100, structure)),
            "structure_explanation": (
                raw_result.get("ats_score", {}).get("structure_explanation")
                if isinstance(raw_result.get("ats_score"), dict)
                else None
            ),
            "readability_score": max(0, min(100, readability)),
            "readability_explanation": (
                raw_result.get("ats_score", {}).get("readability_explanation")
                if isinstance(raw_result.get("ats_score"), dict)
                else None
            ),
        },
        "strengths": _as_list(raw_result.get("strengths")),
        "improvements": _as_list(
            raw_result.get("improvements") or raw_result.get("weaknesses")
        ),
        "missing_sections": _as_list(raw_result.get("missing_sections")),
        "keywords_found": _as_list(raw_result.get("keywords_found")),
        "keywords_missing": _as_list(raw_result.get("keywords_missing")),
        "suggested_job_titles": _as_list(
            raw_result.get("suggested_job_titles")
            or raw_result.get("recommended_job_titles")
        ),
    }

# ============================================
# SUPABASE CLIENT
# ============================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("Supabase credentials not configured - Modal integration disabled")
    supabase_client: Client | None = None
else:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized for Modal integration")


# ============================================
# MODAL WEBHOOK CONFIGURATION
# ============================================

# Modal web endpoint URL (deployed via modal deploy modal_app.py)
MODAL_WEBHOOK_URL = os.getenv(
    "MODAL_WEBHOOK_URL",
    "https://huntzenproject--huntzen-cv-processor-process-cv-webhook.modal.run"
)

# Check if Modal is enabled (webhook URL is configured)
MODAL_ENABLED = bool(MODAL_WEBHOOK_URL)

if MODAL_ENABLED:
    logger.info(f"Modal integration enabled - webhook URL: {MODAL_WEBHOOK_URL}")
else:
    logger.warning("Modal integration disabled - MODAL_WEBHOOK_URL not configured")


# ============================================
# UPLOAD TO SUPABASE STORAGE
# ============================================

async def upload_cv_to_storage(
    file_content: bytes,
    filename: str,
    user_id: str  # ✅ Maintenant OBLIGATOIRE (pas Optional)
) -> str:
    """
    Upload CV file to Supabase Storage.

    ⚠️ REQUIRES AUTHENTICATION - user_id is mandatory

    Args:
        file_content: PDF file bytes
        filename: Original filename
        user_id: User UUID (REQUIRED - no anonymous support)

    Returns:
        Public URL of uploaded file

    Raises:
        HTTPException: If upload fails
        ValueError: If user_id is not provided
    """
    # ✅ Validation: user_id is required
    if not user_id:
        raise ValueError("user_id is required for CV upload (no anonymous support)")

    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase client not configured")

    try:
        # Generate unique filename
        file_ext = filename.split('.')[-1]

        # ✅ Simplified path: user_id only (no more anonymous folder)
        unique_filename = f"{user_id}/{uuid.uuid4()}.{file_ext}"

        logger.info(f"Uploading CV to Supabase Storage: {unique_filename}")

        # Upload to Supabase Storage bucket 'cvs'
        supabase_client.storage.from_("cvs").upload(
            path=unique_filename,
            file=file_content,
            file_options={"content-type": "application/pdf"}
        )

        # Get public URL
        public_url = supabase_client.storage.from_("cvs").get_public_url(unique_filename)

        logger.info(f"CV uploaded successfully: {public_url}")
        return public_url

    except Exception as e:
        logger.error(f"Failed to upload CV to storage: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload CV: {str(e)}") from None


# ============================================
# CREATE CV ANALYSIS RECORD
# ============================================

async def create_cv_analysis_record(
    user_id: str,  # ✅ Maintenant OBLIGATOIRE (pas Optional)
    pdf_url: str | None = None,
    cv_text: str | None = None,
    filename: str | None = None,
    job_description: str | None = None,
    language: str = "fr"
) -> str:
    """
    Create CV analysis record in database with status='pending'.

    ⚠️ REQUIRES AUTHENTICATION - user_id is mandatory

    Args:
        user_id: User UUID (REQUIRED - no anonymous support)
        pdf_url: Supabase Storage URL (if PDF mode)
        cv_text: CV text content (if text mode)
        filename: Original filename (if PDF mode)
        job_description: Optional job description for matching
        language: Response language

    Returns:
        CV analysis UUID

    Raises:
        HTTPException: If database insert fails
        ValueError: If user_id is not provided
    """
    # ✅ Validation: user_id is required
    if not user_id:
        raise ValueError("user_id is required for CV analysis record (no anonymous support)")

    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase client not configured")

    try:
        cv_id = str(uuid.uuid4())

        # ✅ Simplified data: no more anonymous_id or client_ip
        data = {
            "id": cv_id,
            "user_id": user_id,  # ✅ Toujours présent maintenant
            "pdf_url": pdf_url,
            "cv_text": cv_text,
            "status": "pending",
            "job_description": job_description,
            "language": language,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        logger.info(f"Creating CV analysis record: {cv_id} (mode: {'text' if cv_text else 'file'}, user_id: {user_id})")

        supabase_client.table("cv_analyses").insert(data).execute()

        logger.info(f"CV analysis record created successfully: {cv_id}")
        return cv_id

    except Exception as e:
        logger.error(f"Failed to create CV analysis record: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create analysis record: {str(e)}") from None


# ============================================
# SPAWN MODAL FUNCTION
# ============================================

async def spawn_modal_cv_processing(
    cv_id: str,
    user_id: str | None = None,
    pdf_url: str | None = None,
    cv_text: str | None = None,
    job_description: str | None = None,
    language: str = "fr"
) -> bool:
    """
    Trigger Modal webhook to process CV asynchronously via HTTP.

    This is a non-blocking call. The Modal function will update the database
    when processing is complete.

    Args:
        cv_id: CV analysis UUID
        user_id: User UUID (None for anonymous users)
        pdf_url: Supabase Storage URL (if PDF mode)
        cv_text: CV text content (if text mode)
        job_description: Optional job description for matching
        language: Response language

    Returns:
        True if Modal webhook triggered successfully

    Raises:
        HTTPException: If Modal webhook call fails
    """
    if not MODAL_ENABLED:
        logger.warning("Modal integration disabled - falling back to synchronous processing")
        return False

    try:
        is_anonymous = user_id is None
        logger.info(f"Triggering Modal webhook for CV: {cv_id} (mode: {'text' if cv_text else 'file'}, anonymous: {is_anonymous})")

        # Prepare request payload
        payload = {
            "cv_id": cv_id,
            "user_id": user_id,
            "pdf_url": pdf_url,
            "cv_text": cv_text,
            "job_description": job_description,
            "language": language
        }

        # Call Modal webhook (extended timeout for cold starts)
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Wait for Modal to process (webhook is synchronous)
            # Modal processes and returns results directly
            response = await client.post(
                MODAL_WEBHOOK_URL,
                json=payload
            )

            # Check if webhook accepted the request
            if response.status_code == 200:
                logger.info(f"Modal webhook triggered successfully for CV: {cv_id}")
                return True
            else:
                logger.error(f"Modal webhook returned status {response.status_code}: {response.text}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Modal webhook failed: {response.status_code}"
                )

    except httpx.TimeoutException:
        logger.error(f"Modal webhook timeout for CV: {cv_id}")
        # Update database with error
        try:
            supabase_client.table("cv_analyses").update({
                "status": "failed",
                "error_message": "Modal webhook timeout",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", cv_id).execute()
            logger.info(f"Updated CV {cv_id} status to failed (timeout)")
        except Exception as e:
            logger.error(f"Failed to update CV {cv_id} after timeout: {e}")
        return False

    except Exception as e:
        logger.error(f"Failed to trigger Modal webhook: {e}")
        # Update database with error
        try:
            supabase_client.table("cv_analyses").update({
                "status": "failed",
                "error_message": f"Failed to trigger Modal webhook: {str(e)}",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", cv_id).execute()
            logger.info(f"Updated CV {cv_id} status to failed (webhook error)")
        except Exception as e:
            logger.error(f"Failed to update CV {cv_id} after error: {e}")
        return False


# ============================================
# MAIN WORKFLOW: ASYNC CV PROCESSING
# ============================================

async def process_cv_async(
    user_id: str,  # ✅ Maintenant OBLIGATOIRE (pas Optional)
    file: UploadFile | None = None,
    cv_text: str | None = None,
    job_description: str | None = None,
    language: str = "fr"
) -> dict[str, Any]:
    """
    Main workflow for async CV processing with Modal.

    ⚠️ REQUIRES AUTHENTICATION - user_id is mandatory

    Supports both PDF and text modes:
    - PDF mode: Upload to Supabase Storage, extract with Docling
    - Text mode: Store text in DB, skip Docling extraction

    Steps:
    1. Upload PDF to Supabase Storage OR store text in DB
    2. Create database record (status='pending')
    3. Spawn Modal function (non-blocking)
    4. Return immediately with cv_id

    Frontend will poll GET /api/cv-analysis/status/{cv_id} for updates.

    Args:
        user_id: User UUID (REQUIRED - no anonymous support)
        file: Uploaded PDF file (if PDF mode)
        cv_text: CV text content (if text mode)
        job_description: Optional job description for matching
        language: Response language

    Returns:
        Dict with cv_id and status='pending'
    """
    try:
        # ✅ Validation: user_id is required
        if not user_id:
            raise ValueError("user_id is required for CV analysis (no anonymous support)")
        pdf_url = None

        # Step 1: Handle file or text
        if file:
            # PDF mode: Upload to Supabase Storage
            file_content = await file.read()
            pdf_url = await upload_cv_to_storage(
                file_content=file_content,
                filename=file.filename,
                user_id=user_id  # ✅ Seulement user_id (plus d'anonymous_id)
            )

        # Step 2: Create database record
        cv_id = await create_cv_analysis_record(
            user_id=user_id,  # ✅ Seulement user_id (plus d'anonymous_id ni client_ip)
            pdf_url=pdf_url,
            cv_text=cv_text,
            filename=file.filename if file else None,
            job_description=job_description,
            language=language
        )

        # Step 3: Spawn Modal function (non-blocking)
        modal_spawned = await spawn_modal_cv_processing(
            cv_id=cv_id,
            user_id=user_id,
            pdf_url=pdf_url,
            cv_text=cv_text,
            job_description=job_description,
            language=language
        )

        if not modal_spawned:
            # Fallback: Modal failed, mark as failed in DB
            raise HTTPException(status_code=500, detail="Failed to spawn CV processing")

        # Return immediately (non-blocking)
        return {
            "success": True,
            "cv_id": cv_id,
            "status": "pending",
            "message": "CV analysis started. Poll /api/cv-analysis/status/{cv_id} for updates.",
            "estimated_time_seconds": 15 if file else 8  # Text mode faster (no Docling)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CV async processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"CV processing failed: {str(e)}") from None


# ============================================
# GET CV ANALYSIS STATUS
# ============================================

async def get_cv_analysis_status(
    cv_id: str,
    user_id: str | None = None,
    anonymous_id: str | None = None
) -> dict[str, Any]:
    """
    Get CV analysis status for polling.

    Supports both authenticated and anonymous users:
    - Authenticated: Requires user_id to match
    - Anonymous: Requires anonymous_id to match (no user_id needed)

    Args:
        cv_id: CV analysis UUID
        user_id: User UUID (for authenticated users)
        anonymous_id: Anonymous session ID (for anonymous users)

    Returns:
        Status dict with result if completed

    Raises:
        HTTPException: If CV not found or unauthorized
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase client not configured")

    try:
        # Build query based on authentication type
        query = supabase_client.table("cv_analyses").select("*").eq("id", cv_id)

        # Add authorization filter
        if user_id:
            # Authenticated user - must match user_id
            query = query.eq("user_id", user_id)
        elif anonymous_id:
            # Anonymous user - must match anonymous_id
            query = query.eq("anonymous_id", anonymous_id).is_("user_id", "null")
        else:
            # No authentication provided - allow access by cv_id only
            # This is for backwards compatibility and public access
            pass

        # Use maybeSingle() instead of single() to handle "not found" gracefully
        response = query.maybe_single().execute()

        if response is None or not response.data:
            raise HTTPException(status_code=404, detail="CV analysis not found")

        data = response.data

        normalized_result = _normalize_analysis_result(data.get("result")) if data.get("result") else None

        # Calculate processing time if completed
        processing_time = None
        if data.get("completed_at") and data.get("created_at"):
            created = datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
            completed = datetime.fromisoformat(data["completed_at"].replace("Z", "+00:00"))
            processing_time = (completed - created).total_seconds()

        return {
            "cv_id": cv_id,
            "status": data["status"],
            "result": normalized_result,
            "error": data.get("error_message"),
            "created_at": data["created_at"],
            "completed_at": data.get("completed_at"),
            "processing_time_seconds": processing_time
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get CV status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}") from None


# ============================================
# LIST USER CV ANALYSES
# ============================================

async def list_user_cv_analyses(
    user_id: str,
    limit: int = 20,
    offset: int = 0
) -> dict[str, Any]:
    """
    List all CV analyses for a user.

    Args:
        user_id: User UUID
        limit: Max number of results
        offset: Pagination offset

    Returns:
        List of CV analyses with status
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase client not configured")

    try:
        response = supabase_client.table("cv_analyses")\
            .select("id, status, created_at, completed_at, result")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .range(offset, offset + limit - 1)\
            .execute()

        analyses = []
        for row in response.data:
            # Calculate processing time
            processing_time = None
            if row.get("completed_at") and row.get("created_at"):
                created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
                completed = datetime.fromisoformat(row["completed_at"].replace("Z", "+00:00"))
                processing_time = (completed - created).total_seconds()

            # Extract summary fields from result JSON for history display
            result_data = _normalize_analysis_result(row.get("result"))
            
            # Defensive score extraction (handles both old dict and new int formats)
            ats_score_raw = result_data.get("ats_score")
            if isinstance(ats_score_raw, dict):
                score_val = ats_score_raw.get("total") or ats_score_raw.get("overall_score")
            else:
                score_val = ats_score_raw

            analyses.append({
                "cv_id": row["id"],
                "status": row["status"],
                "created_at": row["created_at"],
                "completed_at": row.get("completed_at"),
                "processing_time_seconds": processing_time,
                "has_result": bool(result_data),
                # Summary fields for history drawer display
                "score": score_val,
                "strengths": result_data.get("strengths", []),
                "weaknesses": result_data.get("improvements", result_data.get("weaknesses", [])),
                "suggestions": [],
            })

        return {
            "success": True,
            "total": len(analyses),
            "analyses": analyses
        }

    except Exception as e:
        logger.error(f"Failed to list CV analyses: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list analyses: {str(e)}") from None
