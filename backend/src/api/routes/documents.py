"""
Documents API Routes
=====================
CRUD pour les documents générés (CV adaptés + LM).
Les PDFs sont stockés dans Supabase Storage côté frontend.
Ce endpoint gère uniquement les métadonnées en base.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel
from supabase import create_client, Client

from src.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

supabase: Client = create_client(
    settings.supabase_url,
    settings.get_supabase_service_role_key()
)


class DocumentCreate(BaseModel):
    job_title: str
    company: str = ""
    match_score: Optional[int] = None
    cv_data: dict = {}
    cv_pdf_url: Optional[str] = None
    lm_pdf_url: Optional[str] = None
    language: str = "fr"
    saved_job_id: Optional[str] = None
    job_url: Optional[str] = None


class DocumentMarkApplied(BaseModel):
    saved_job_id: str


class DocumentUpdate(BaseModel):
    cv_pdf_url: Optional[str] = None
    cv_data: Optional[dict] = None


def _get_user_id(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.removeprefix("Bearer ")
    try:
        user = supabase.auth.get_user(token)
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("")
async def list_documents(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        response = (
            supabase.table("user_documents")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"documents": response.data}
    except Exception as e:
        logger.error(f"[Documents] List error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch documents")


@router.post("", status_code=201)
async def create_document(
    body: DocumentCreate,
    authorization: Optional[str] = Header(None),
):
    user_id = _get_user_id(authorization)
    try:
        data = {
            "user_id": user_id,
            "job_title": body.job_title,
            "company": body.company,
            "match_score": body.match_score,
            "cv_data": body.cv_data,
            "cv_pdf_url": body.cv_pdf_url,
            "lm_pdf_url": body.lm_pdf_url,
            "language": body.language,
            "saved_job_id": body.saved_job_id,
            "job_url": body.job_url,
        }
        response = supabase.table("user_documents").insert(data).execute()
        if not response.data:
            raise Exception("Insert returned no data")
        doc = response.data[0]
        if body.saved_job_id:
            supabase.table("saved_jobs").update(
                {"cv_document_id": doc["id"]}
            ).eq("id", body.saved_job_id).eq("user_id", user_id).execute()
        return {"document": doc}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Documents] Create error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save document")


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    authorization: Optional[str] = Header(None),
):
    user_id = _get_user_id(authorization)
    try:
        supabase.table("user_documents").delete().eq(
            "id", document_id
        ).eq("user_id", user_id).execute()
    except Exception as e:
        logger.error(f"[Documents] Delete error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete document")


@router.patch("/{document_id}", status_code=200)
async def update_document(
    document_id: str,
    body: DocumentUpdate,
    authorization: Optional[str] = Header(None),
):
    user_id = _get_user_id(authorization)
    try:
        update_data = {k: v for k, v in body.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="Nothing to update")
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        response = (
            supabase.table("user_documents")
            .update(update_data)
            .eq("id", document_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"document": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Documents] Update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update document")


@router.post("/mark-applied")
async def mark_applied(
    body: DocumentMarkApplied,
    authorization: Optional[str] = Header(None),
):
    user_id = _get_user_id(authorization)
    try:
        supabase.table("saved_jobs").update(
            {"applied_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", body.saved_job_id).eq("user_id", user_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"[Documents] Mark applied error: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark as applied")
