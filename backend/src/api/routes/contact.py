"""
Contact Form API
================
POST /api/contact — public contact form submission with Resend emails.
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, EmailStr, Field

from src.api.middleware import limiter
from src.services.email import send_contact_admin_notification, send_contact_confirmation

logger = logging.getLogger(__name__)
router = APIRouter()


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    reason: str | None = Field(default="", max_length=50)
    message: str = Field(..., min_length=10, max_length=5000)


@router.post("/")
@limiter.limit("5/minute")
async def submit_contact(
    request: Request,
    payload: ContactRequest,
):
    """Public contact form — sends confirmation to user + notification to admin."""
    try:
        send_contact_confirmation(
            to_email=payload.email,
            full_name=payload.name,
        )
    except Exception as e:
        logger.error(f"Failed to send contact confirmation to {payload.email}: {e}")

    try:
        send_contact_admin_notification(
            full_name=payload.name,
            email=payload.email,
            reason=payload.reason or "Non précisé",
            message=payload.message,
        )
    except Exception as e:
        logger.error(f"Failed to send contact admin notification: {e}")

    logger.info(f"Contact form submitted by {payload.email} (reason: {payload.reason})")
    return {"ok": True}
