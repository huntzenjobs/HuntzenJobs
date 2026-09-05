"""
HuntZen CV Processing on Modal Labs (Unified Architect Edition)

Serverless CV processing using the UNIFIED agent from backend/src.
Eliminates code duplication and ensures prompt consistency across environments.
"""

import json
import logging
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote, urlparse
from uuid import UUID

import modal
import sentry_sdk
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

# IMPORTANT: Add /root to sys.path so we can import 'src' from the mounted directory
sys.path.append("/root")

from src.utils.sentry import initialize_sentry

logger = logging.getLogger(__name__)

# ============================================
# MODAL APP CONFIGURATION
# ============================================

app = modal.App("huntzen-cv-processor")
MAX_PRIVATE_CV_BYTES = 10 * 1024 * 1024


def validate_private_cv_object_path(object_path: str, user_id: UUID | str) -> str:
    """Valider un chemin de stockage privé et son propriétaire."""
    owner_id = str(UUID(str(user_id)))
    if (
        not object_path
        or object_path.startswith(("/", "http://", "https://"))
        or "\\" in object_path
        or ".." in object_path
    ):
        raise ValueError("Invalid private CV object path")

    parts = object_path.split("/")
    if len(parts) != 2 or parts[0] != owner_id:
        raise ValueError("Invalid private CV object path owner")

    stem, separator, extension = parts[1].rpartition(".")
    if not separator or extension.lower() not in {"pdf", "doc", "docx"}:
        raise ValueError("Invalid private CV object path extension")
    try:
        UUID(stem)
    except ValueError as exc:
        raise ValueError("Invalid private CV object path identifier") from exc
    return object_path


def extract_private_cv_object_path(signed_url: str, user_id: UUID | str) -> str:
    """Extraire un chemin privé sans télécharger l'URL fournie."""
    candidate = urlparse(signed_url)
    expected_prefix = "/storage/v1/object/sign/cvs/"
    configured_host = urlparse(os.getenv("SUPABASE_URL", "")).hostname
    trusted_hosts = {"auth.huntzenjobs.com"}
    if configured_host:
        trusted_hosts.add(configured_host)
    if (
        candidate.scheme != "https"
        or not candidate.hostname
        or candidate.hostname not in trusted_hosts
        or not candidate.path.startswith(expected_prefix)
    ):
        raise ValueError("Invalid signed private CV URL")

    object_path = unquote(candidate.path[len(expected_prefix):])
    return validate_private_cv_object_path(object_path, user_id)


class CVProcessRequest(BaseModel):
    """Contrat strict du webhook privé de traitement CV."""

    model_config = ConfigDict(extra="forbid")

    cv_id: UUID
    user_id: UUID
    pdf_url: str | None = None
    cv_text: str | None = Field(default=None, max_length=100_000)
    job_description: str | None = Field(default=None, max_length=50_000)
    language: Literal["fr", "en", "es", "pt"] = "fr"

    @model_validator(mode="after")
    def validate_single_source(self) -> "CVProcessRequest":
        if bool(self.pdf_url) == bool(self.cv_text):
            raise ValueError("Exactly one CV source is required")
        if self.pdf_url:
            extract_private_cv_object_path(
                self.pdf_url,
                self.user_id,
            )
        return self

MODULE_DIR = Path(__file__).parent
PROJECT_ROOT = MODULE_DIR.parent.parent

# Docker image with exact dependencies and local sources (V1 Style)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx", "libglib2.0-0", "poppler-utils",
        "tesseract-ocr", "tesseract-ocr-fra", "tesseract-ocr-eng"
    )
    .pip_install(
        "docling==2.70.0",
        "httpx==0.27.0",
        "psycopg[binary]==3.3.2",
        "groq==0.13.1",
        "structlog==24.4.0",
        "pydantic==2.10.4",
        "fastapi[standard]==0.115.6",
        "langchain==0.3.13",
        "langchain-groq==0.2.2",
        "langchain-core==0.3.28",
        "redis==5.0.1",
        "orjson==3.10.12",
        "python-dotenv",
        "pydantic-settings",
        "tenacity",
        "cachetools>=5.3.2",
        "supabase==2.10.0",
        "slowapi==0.1.9",
        "sentry-sdk[fastapi]==2.19.2",
        "stripe>=11.0.0",
        "pycountry==24.6.1",
        "geonamescache>=1.5.0",
        "arq>=0.26.0",
        "aiohttp",
        "beautifulsoup4",
        "resend"
    )
    # Add project sources to the image using absolute local paths
    .add_local_dir(PROJECT_ROOT / "backend" / "src", "/root/src")
    .add_local_dir(PROJECT_ROOT / "backend" / "prompts", "/root/prompts")
)

secrets = [modal.Secret.from_name("huntzen-secrets")]

# ============================================
# DATABASE UTILITIES (Worker Side)
# ============================================

def get_db_connection():
    import psycopg
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL not found in Modal secrets")
    return psycopg.connect(database_url)


def download_private_cv_object(object_path: str) -> bytes:
    """Télécharger un CV depuis le bucket privé sans accepter d'URL externe."""
    from supabase import create_client

    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise ValueError("Supabase storage configuration is incomplete")

    content = create_client(supabase_url, service_role_key).storage.from_("cvs").download(
        object_path
    )
    if not isinstance(content, (bytes, bytearray)):
        raise TypeError("Supabase did not return CV bytes")
    if len(content) > MAX_PRIVATE_CV_BYTES:
        raise ValueError("Private CV exceeds the 10 MiB limit")
    return bytes(content)

async def notify_fastapi_callback(cv_id: str, user_id: str, status: str) -> bool:
    import httpx
    fastapi_url = os.getenv("FASTAPI_CALLBACK_URL")
    modal_secret = os.getenv("MODAL_CALLBACK_SECRET")

    if not fastapi_url or not modal_secret:
        logger.error("modal_callback_configuration_missing")
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            callback_url = f"{fastapi_url}/api/cv-analysis/callback"
            response = await client.post(
                callback_url,
                json={"cv_id": str(cv_id), "user_id": user_id, "status": str(status)},
                headers={"X-Modal-Secret": modal_secret}
            )
            if response.status_code == 200:
                logger.info("modal_callback_succeeded")
            else:
                logger.warning(
                    "modal_callback_failed status_code=%s",
                    response.status_code,
                )
            return response.status_code == 200
    except Exception as e:  # noqa: BLE001 - frontière réseau Modal/FastAPI
        sentry_sdk.capture_exception(e)
        logger.error("modal_callback_exception error_type=%s", type(e).__name__)
        return False

def cv_belongs_to_user(cv_id: str, user_id: str) -> bool:
    """Vérifie l'ownership avant tout traitement ou mutation du CV."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM cv_analyses WHERE id = %s AND user_id = %s",
                (str(cv_id), str(user_id)),
            )
            return cur.fetchone() is not None
    finally:
        conn.close()


def claim_cv_analysis(
    cv_id: str,
    user_id: str,
    pdf_object_path: str | None,
    cv_text: str | None,
) -> str | None:
    """Réserver une analyse dont la source correspond exactement à la base."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cv_analyses
                SET status = 'processing', updated_at = NOW()
                WHERE id = %s
                  AND user_id = %s
                  AND pdf_url IS NOT DISTINCT FROM %s
                  AND cv_text IS NOT DISTINCT FROM %s
                  AND status = 'pending'
                RETURNING status
                """,
                (str(cv_id), str(user_id), pdf_object_path, cv_text),
            )
            if cur.fetchone() is not None:
                conn.commit()
                return "claimed"

            cur.execute(
                """
                SELECT status
                FROM cv_analyses
                WHERE id = %s
                  AND user_id = %s
                  AND pdf_url IS NOT DISTINCT FROM %s
                  AND cv_text IS NOT DISTINCT FROM %s
                """,
                (str(cv_id), str(user_id), pdf_object_path, cv_text),
            )
            current = cur.fetchone()
            conn.commit()
            return str(current[0]) if current else None
    finally:
        conn.close()


async def update_cv_status(
    cv_id: str,
    user_id: str,
    status: str,
    result: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> bool:
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            if status == "completed" and result:
                cur.execute(
                    "UPDATE cv_analyses SET status = %s, result = %s, completed_at = NOW(), updated_at = NOW() WHERE id = %s AND user_id = %s RETURNING id",
                    (str(status), json.dumps(result), str(cv_id), str(user_id))
                )
            elif status == "failed" and error_message:
                cur.execute(
                    "UPDATE cv_analyses SET status = %s, error_message = %s, updated_at = NOW() WHERE id = %s AND user_id = %s RETURNING id",
                    (str(status), str(error_message), str(cv_id), str(user_id))
                )
            else:
                cur.execute(
                    "UPDATE cv_analyses SET status = %s, updated_at = NOW() WHERE id = %s AND user_id = %s RETURNING id",
                    (str(status), str(cv_id), str(user_id)),
                )
            updated = cur.fetchone() is not None
            conn.commit()
        conn.close()

        if not updated:
            return False

        if status in ("completed", "failed"):
            await notify_fastapi_callback(cv_id, user_id, status)
        return True
    except Exception as e:  # noqa: BLE001 - frontière base de données Modal
        sentry_sdk.capture_exception(e)
        logger.error("modal_database_update_failed error_type=%s", type(e).__name__)
        return False

# ============================================
# MAIN CV PROCESSING FUNCTION (Unified Agent)
# ============================================

@app.function(
    image=image,
    secrets=secrets,
    memory=4096,
    cpu=2.0,
    timeout=600,
    max_containers=20,
)
async def process_cv_analysis(
    cv_id: str,
    user_id: str,
    pdf_url: str | None = None,
    cv_text: str | None = None,
    job_description: str | None = None,
    language: str = "fr"
) -> dict[str, Any]:
    import tempfile

    from src.agents.cv_analyzer.main_agent import CVAnalyzerAgent

    initialize_sentry("modal-cv")
    logger.info("modal_cv_processing_started")
    start_time = time.time()

    ownership_verified = False
    try:
        pdf_object_path = (
            extract_private_cv_object_path(pdf_url, user_id)
            if pdf_url
            else None
        )
        claim_state = claim_cv_analysis(cv_id, user_id, pdf_object_path, cv_text)
        if claim_state == "completed":
            return {
                "success": True,
                "cv_id": cv_id,
                "already_processed": True,
            }
        if claim_state == "processing":
            return {
                "success": True,
                "cv_id": cv_id,
                "already_processing": True,
            }
        if claim_state == "failed":
            return {
                "success": False,
                "cv_id": cv_id,
                "error": "CV analysis already failed",
            }
        if claim_state != "claimed":
            raise PermissionError("CV analysis ownership mismatch")
        ownership_verified = True

        # Step 1: Processing Status
        if not await update_cv_status(cv_id, user_id, "processing"):
            raise RuntimeError("CV analysis disappeared before processing")

        # Step 2: Extract Text (if needed)
        final_cv_text = cv_text
        if not final_cv_text and pdf_object_path:
            file_content = download_private_cv_object(pdf_object_path)
            suffix = Path(pdf_object_path).suffix
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
                tmp_file.write(file_content)
                tmp_path = tmp_file.name

            # Use unified extraction method if possible, or stay with local Docling
            # For simplicity and perf, we keep the docling logic here or move to agent.
            # Let's use the local docling as it's already configured in Modal image.
            try:
                from docling.document_converter import DocumentConverter

                converter = DocumentConverter()
                extract_res = converter.convert(tmp_path)
                final_cv_text = extract_res.document.export_to_markdown()
            finally:
                os.unlink(tmp_path)

        if not final_cv_text or len(final_cv_text) < 50:
            raise ValueError("CV content extraction failed or empty")

        # Step 3: Run UNIFIED AGENT 🎯
        # This uses the same prompts and logic as your local/railway environment
        agent = CVAnalyzerAgent()
        analysis_result = await agent.run(
            cv_text=final_cv_text,
            job_description=job_description,
            language=language
        )

        if analysis_result.get("success") is False:
            rejection_reason = (
                analysis_result.get("error")
                or analysis_result.get("verdict")
                or "CV analysis rejected the document"
            )
            raise ValueError(str(rejection_reason))

        # Add processing metadata
        analysis_result["processing_time_seconds"] = round(time.time() - start_time, 2)
        analysis_result["processed_at"] = datetime.now(UTC).isoformat()

        # Step 4: Final DB Update
        if not await update_cv_status(
            cv_id,
            user_id,
            "completed",
            result=analysis_result,
        ):
            raise RuntimeError("CV analysis final status persistence failed")

        return {"success": True, "cv_id": cv_id}

    except Exception as e:  # noqa: BLE001 - frontière du traitement asynchrone
        error_msg = f"Unified Processing Failed: {e!s}"
        sentry_sdk.capture_exception(e)
        logger.error("modal_cv_processing_failed error_type=%s", type(e).__name__)
        if ownership_verified:
            await update_cv_status(
                cv_id,
                user_id,
                "failed",
                error_message=error_msg,
            )
        return {"success": False, "error": error_msg}

# ============================================
# WEB ENDPOINT
# ============================================

@app.function(image=image, secrets=secrets)
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
async def process_cv_webhook(request_body: CVProcessRequest) -> dict:
    initialize_sentry("modal-cv")
    try:
        await process_cv_analysis.spawn.aio(
            cv_id=str(request_body.cv_id),
            user_id=str(request_body.user_id),
            pdf_url=request_body.pdf_url,
            cv_text=request_body.cv_text,
            job_description=request_body.job_description,
            language=request_body.language,
        )
        return {"success": True, "cv_id": str(request_body.cv_id)}
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.error("modal_cv_spawn_failed error_type=%s", type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail="Unable to start CV analysis",
        ) from e
