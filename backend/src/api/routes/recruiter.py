"""
Recruiter Contact API Routes
=============================
Handles recruiter consultation requests and Stripe payment processing.

Sprint 3: 50€ one-time payment for 30-minute consultation with expert recruiter.
"""

import logging
import uuid
from datetime import date

import stripe
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from supabase import Client, create_client

from src.api.deps import get_user_id_from_token
from src.config.settings import get_settings
from src.services.stripe import handle_stripe_webhook

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
    phone: str | None = Field(None, max_length=20)
    sector: str = Field(..., description="Professional sector")
    experience_level: str = Field(..., description="Years of experience level")
    message: str = Field(..., min_length=10, max_length=1000)
    preferred_date: date | None = None


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
    scheduled_at: str | None = None


# ============================================================================
# Helper Functions
# ============================================================================

def get_user_id_from_header(authorization: str | None = Header(None)) -> str | None:
    """
    Extract user ID from Authorization Bearer token via Supabase JWT validation.
    Returns None for anonymous/unauthenticated requests (allowed for recruiter contact).
    """
    return get_user_id_from_token(authorization)


def require_user_id(authorization: str | None) -> str:
    """Refuser toute opération recruteur non authentifiée."""
    user_id = get_user_id_from_header(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user_id


# ============================================================================
# Routes
# ============================================================================

@router.post("/request", response_model=RecruiterRequestResponse)
async def create_recruiter_request(
    request: RecruiterRequestCreate,
    authorization: str | None = Header(None)
):
    """
    Create a new recruiter consultation request.

    This creates a pending request in the database.
    Payment is handled separately via /create-payment endpoint.
    """
    try:
        user_id = require_user_id(authorization)
        request_id = str(uuid.uuid4())

        # Prepare data for insertion
        data = {
            "id": request_id,
            "user_id": user_id,
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
    except Exception as exc:
        logger.error("Recruiter request creation failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create recruiter request",
        ) from None


@router.post("/create-payment", response_model=PaymentSessionResponse)
async def create_payment_session(
    payment: PaymentSessionCreate,
    authorization: str | None = Header(None)
):
    """
    Create a Stripe checkout session for recruiter consultation payment.

    Amount: 50€ (one-time payment)
    """
    try:
        user_id = require_user_id(authorization)

        # Verify request exists
        request_response = supabase.table("recruiter_requests")\
            .select("*")\
            .eq("id", payment.request_id)\
            .eq("user_id", user_id)\
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

        existing_session_id = request_data.get("stripe_checkout_session_id")
        if isinstance(existing_session_id, str) and existing_session_id:
            try:
                existing_session = stripe.checkout.Session.retrieve(
                    existing_session_id
                )
                if (
                    getattr(existing_session, "status", None) == "open"
                    and getattr(existing_session, "url", None)
                ):
                    return PaymentSessionResponse(
                        checkout_url=existing_session.url,
                        session_id=existing_session.id,
                    )
                if getattr(existing_session, "status", None) == "complete":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Payment confirmation is being processed",
                    )
            except HTTPException:
                raise
            except stripe.error.StripeError as exc:
                logger.error(
                    "Stored recruiter Checkout session lookup failed: %s",
                    type(exc).__name__,
                )
                raise

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
                "user_id": user_id,
                "type": "recruiter_consultation",
            },
            idempotency_key=(
                f"recruiter-checkout:{payment.request_id}"
            ),
        )

        # Update request with checkout session ID
        supabase.table("recruiter_requests")\
            .update({"stripe_checkout_session_id": checkout_session.id})\
            .eq("id", payment.request_id)\
            .eq("user_id", user_id)\
            .execute()

        return PaymentSessionResponse(
            checkout_url=checkout_session.url,
            session_id=checkout_session.id,
        )

    except HTTPException:
        raise
    except (
        stripe.error.APIConnectionError,
        stripe.error.APIError,
        stripe.error.AuthenticationError,
        stripe.error.RateLimitError,
    ) as exc:
        logger.error("Recruiter Stripe provider unavailable: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider is temporarily unavailable",
        ) from None
    except stripe.error.StripeError as exc:
        logger.warning("Recruiter Stripe checkout rejected: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment provider rejected the request",
        ) from None
    except Exception as exc:
        logger.error("Recruiter payment creation failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create payment session",
        ) from None


@router.get("/status/{request_id}", response_model=RecruiterRequestStatus)
async def get_request_status(
    request_id: str,
    authorization: str | None = Header(None)
):
    """
    Get status of a recruiter consultation request.

    Returns payment status and request status.
    """
    try:
        user_id = require_user_id(authorization)

        # Fetch from Supabase
        response = supabase.table("recruiter_requests")\
            .select("*")\
            .eq("id", request_id)\
            .eq("user_id", user_id)\
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
    except Exception as exc:
        logger.error("Recruiter status lookup failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch recruiter request status",
        ) from None


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """
    URL Stripe historique, déléguée au dispatcher central idempotent.
    """
    try:
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        if not sig_header:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing Stripe signature",
            )
        return await handle_stripe_webhook(payload, sig_header)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Recruiter webhook failed: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed",
        ) from None
