"""
Modal PDF Extractor Client
===========================
Calls the Modal webhook to extract text from PDFs using Docling.

Usage:
    from src.services.modal_pdf_extractor import extract_text_via_modal, is_modal_pdf_enabled

    if is_modal_pdf_enabled():
        cv_text = await extract_text_via_modal(pdf_bytes)
    else:
        cv_text = await local_extraction(pdf_bytes)  # fallback

Configuration:
    Set MODAL_PDF_EXTRACT_URL env var to the deployed Modal webhook URL.
    Example: https://huntzenproject--huntzen-pdf-extractor-extract-pdf-text.modal.run
"""

import base64
import logging
import os

import httpx

logger = logging.getLogger(__name__)

# Modal webhook URL — set in Railway environment variables
MODAL_PDF_EXTRACT_URL = os.getenv("MODAL_PDF_EXTRACT_URL", "")

# Max PDF size to send to Modal (10MB)
MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024

# Timeout for Modal call (2 minutes — docling cold start can take ~30-60s)
MODAL_TIMEOUT_SECONDS = 120.0


def is_modal_pdf_enabled() -> bool:
    """Check if Modal PDF extraction is configured."""
    return bool(MODAL_PDF_EXTRACT_URL)


async def extract_text_via_modal(pdf_bytes: bytes) -> str:
    """
    Extract text from PDF bytes by calling the Modal Docling webhook.

    The PDF bytes are base64-encoded and sent in the JSON body.
    Modal decodes, runs docling, and returns the extracted markdown text.

    Args:
        pdf_bytes: Raw PDF file bytes (max 10MB)

    Returns:
        Extracted text as markdown string

    Raises:
        RuntimeError: If Modal is not configured, call fails, or extraction errors
    """
    if not MODAL_PDF_EXTRACT_URL:
        raise RuntimeError(
            "MODAL_PDF_EXTRACT_URL not configured — cannot use Modal PDF extraction"
        )

    if len(pdf_bytes) > MAX_PDF_SIZE_BYTES:
        raise RuntimeError(
            f"PDF too large for Modal extraction ({len(pdf_bytes) / 1024 / 1024:.1f}MB > 10MB limit)"
        )

    # Encode PDF as base64 for JSON transport
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    payload_size_kb = len(pdf_b64) // 1024

    logger.info(
        f"[ModalPDF] Calling Modal PDF extraction webhook "
        f"(payload: ~{payload_size_kb}KB, timeout: {MODAL_TIMEOUT_SECONDS}s)"
    )

    try:
        async with httpx.AsyncClient(timeout=MODAL_TIMEOUT_SECONDS) as client:
            response = await client.post(
                MODAL_PDF_EXTRACT_URL,
                json={"pdf_bytes": pdf_b64},
            )

        if response.status_code != 200:
            logger.error(
                f"[ModalPDF] Webhook returned HTTP {response.status_code}: {response.text[:200]}"
            )
            raise RuntimeError(
                f"Modal PDF extraction failed (HTTP {response.status_code})"
            )

        data = response.json()

        if not data.get("success"):
            error_msg = data.get("error", "Unknown Modal extraction error")
            logger.error(f"[ModalPDF] Extraction error: {error_msg}")
            raise RuntimeError(f"Modal PDF extraction error: {error_msg}")

        text = data.get("text", "")
        if not text or len(text.strip()) < 20:
            raise RuntimeError("Modal returned empty or near-empty text")

        logger.info(
            f"[ModalPDF] Extraction successful — {len(text)} chars extracted"
        )
        return text

    except httpx.TimeoutException:
        logger.error(
            f"[ModalPDF] Webhook timed out after {MODAL_TIMEOUT_SECONDS}s"
        )
        raise RuntimeError(
            f"Modal PDF extraction timed out after {MODAL_TIMEOUT_SECONDS}s — "
            "try again (cold start) or check Modal deployment"
        )

    except RuntimeError:
        raise

    except Exception as e:
        logger.error(f"[ModalPDF] Unexpected error: {type(e).__name__}: {e}")
        raise RuntimeError(f"Modal PDF extraction failed: {str(e)}")
