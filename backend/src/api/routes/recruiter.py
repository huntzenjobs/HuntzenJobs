"""
Recruiter Contact API Routes
=============================
Handles recruiter consultation requests and Stripe payment processing.

Sprint 3: 50€ one-time payment for 30-minute consultation with expert recruiter.
"""

import logging
import uuid
from typing import Optional
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, status, Request, Header
from pydantic import BaseModel, EmailStr, Field
import stripe
from supabase import create_client, Client

from src.config.settings import get_settings
from src.api.deps import get_user_id_from_token
from src.services.email import (
    send_recruiter_request_confirmation,
    send_recruiter_request_notification,
)

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()

# Initialize Stripe
stripe.api_key = settings.get_stripe_secret_key()

# Initialize Supabase client
supabase: Client = create_client(
    settings.supabase_url,
    settings.get_supabase_service_role_key()  # Use service role for backend operations
)


# ============================================================================
# Schemas
# ============================================================================

class RecruiterRequestCreate(BaseModel):
    """Create a new recruiter consultation request."""
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    sector: str = Field(..., description="Professional sector")
    experience_level: str = Field(..., description="Years of experience level")
    message: str = Field(..., min_length=10, max_length=1000)
    preferred_date: Optional[date] = None


class RecruiterRequestResponse(BaseModel):
    """Response after creating a request."""
    request_id: str
    status: str = "pending"
    message: str


class PaymentSessionCreate(BaseModel):
    """Create Stripe checkout session."""
    request_id: str


class PaymentSessionResponse(BaseModel):
    """Response with Stripe checkout URL."""
    checkout_url: str
    session_id: str


class RecruiterRequestStatus(BaseModel):
    """Status of a recruiter request."""
    request_id: str
    payment_status: str
    request_status: str
    created_at: str
    scheduled_at: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================

def get_user_id_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Extract user ID from Authorization Bearer token via Supabase JWT validation.
    Returns None for anonymous/unauthenticated requests (allowed for recruiter contact).
    """
    return get_user_id_from_token(authorization)


# ============================================================================
# Routes
# ============================================================================

@router.post("/request", response_model=RecruiterRequestResponse)
async def create_recruiter_request(
    request: RecruiterRequestCreate,
    authorization: Optional[str] = Header(None)
):
    """
    Create a new recruiter consultation request.

    This creates a pending request in the database.
    Payment is handled separately via /create-payment endpoint.
    """
    try:
        user_id = get_user_id_from_header(authorization)
        request_id = str(uuid.uuid4())

        # Prepare data for insertion
        data = {
            "id": request_id,
            "user_id": user_id,  # Can be None for anonymous requests
            "full_name": request.full_name,
            "email": request.email,
            "phone": request.phone,
            "sector": request.sector,
            "experience_level": request.experience_level,
            "message": request.message,
            "preferred_date": request.preferred_date.isoformat() if request.preferred_date else None,
            "payment_status": "pending",
            "status": "new",
        }

        # Insert into Supabase
        response = supabase.table("recruiter_requests").insert(data).execute()

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create request"
            )

        return RecruiterRequestResponse(
            request_id=request_id,
            status="pending",
            message="Votre demande a été enregistrée. Procédez au paiement pour confirmer.",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating request: {str(e)}",
        )


@router.post("/create-payment", response_model=PaymentSessionResponse)
async def create_payment_session(
    payment: PaymentSessionCreate,
    authorization: Optional[str] = Header(None)
):
    """
    Create a Stripe checkout session for recruiter consultation payment.

    Amount: 50€ (one-time payment)
    """
    try:
        user_id = get_user_id_from_header(authorization)

        # Verify request exists
        request_response = supabase.table("recruiter_requests")\
            .select("*")\
            .eq("id", payment.request_id)\
            .execute()

        if not request_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Request not found"
            )

        request_data = request_response.data[0]

        # Check if already paid
        if request_data.get("payment_status") == "paid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This request has already been paid"
            )

        # Create Stripe checkout session
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price": settings.recruiter_contact_price_id,
                    "quantity": 1,
                },
            ],
            mode="payment",
            success_url=f"{settings.get_primary_frontend_url()}/recruiter-contact/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.get_primary_frontend_url()}/recruiter-contact?cancelled=true",
            customer_email=request_data.get("email"),
            metadata={
                "request_id": payment.request_id,
                "user_id": user_id or "anonymous",
                "type": "recruiter_consultation",
            },
        )

        # Update request with checkout session ID
        supabase.table("recruiter_requests")\
            .update({"stripe_checkout_session_id": checkout_session.id})\
            .eq("id", payment.request_id)\
            .execute()

        return PaymentSessionResponse(
            checkout_url=checkout_session.url,
            session_id=checkout_session.id,
        )

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating payment session: {str(e)}",
        )


@router.get("/status/{request_id}", response_model=RecruiterRequestStatus)
async def get_request_status(
    request_id: str,
    authorization: Optional[str] = Header(None)
):
    """
    Get status of a recruiter consultation request.

    Returns payment status and request status.
    """
    try:
        # Fetch from Supabase
        response = supabase.table("recruiter_requests")\
            .select("*")\
            .eq("id", request_id)\
            .execute()

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Request not found"
            )

        request_data = response.data[0]

        return RecruiterRequestStatus(
            request_id=request_id,
            payment_status=request_data["payment_status"],
            request_status=request_data["status"],
            created_at=request_data["created_at"],
            scheduled_at=request_data.get("scheduled_at"),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching status: {str(e)}",
        )


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook for payment confirmations.

    Handles checkout.session.completed events to mark requests as paid.
    """
    try:
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")

        # Verify webhook signature
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.get_stripe_webhook_secret()
        )

        # Handle the event
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            request_id = session["metadata"].get("request_id")

            if request_id:
                # Update request status to paid
                supabase.table("recruiter_requests")\
                    .update({
                        "payment_status": "paid",
                        "payment_intent_id": session.get("payment_intent"),
                    })\
                    .eq("id", request_id)\
                    .execute()

                # Fetch request details for email
                request_response = supabase.table("recruiter_requests")\
                    .select("*")\
                    .eq("id", request_id)\
                    .execute()

                if request_response.data:
                    request_data = request_response.data[0]

                    # Send confirmation email to user
                    send_recruiter_request_confirmation(
                        to_email=request_data["email"],
                        full_name=request_data["full_name"],
                        sector=request_data["sector"],
                        experience_level=request_data["experience_level"],
                        preferred_date=request_data.get("preferred_date"),
                    )

                    # Send notification email to admin
                    send_recruiter_request_notification(
                        request_id=request_id,
                        full_name=request_data["full_name"],
                        email=request_data["email"],
                        phone=request_data.get("phone"),
                        sector=request_data["sector"],
                        experience_level=request_data["experience_level"],
                        message=request_data["message"],
                        preferred_date=request_data.get("preferred_date"),
                    )

                    logger.info(f"✅ Payment confirmed for request {request_id} - Emails sent")

        return {"status": "success"}

    except stripe.error.SignatureVerificationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid signature: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Webhook error: {str(e)}",
        )
