"""
Stripe Payment Routes
====================
API endpoints for Stripe payment processing.
"""

from fastapi import APIRouter, HTTPException, Depends, Form, Request, Header
from typing import Optional
from structlog import get_logger

from src.api.deps import get_current_user
from src.services.stripe import create_checkout_session, handle_stripe_webhook
from src.config.settings import settings

logger = get_logger(__name__)

router = APIRouter()


@router.post("/create-checkout-session")
async def create_stripe_checkout(
    plan_name: str = Form(...),
    billing_period: str = Form("monthly"),
    current_user: dict = Depends(get_current_user)
):
    """
    Create Stripe Checkout session for subscription payment.

    Args:
        plan_name: 'starter', 'pro', or 'premium'
        billing_period: 'monthly' or 'yearly'
        current_user: Authenticated user from JWT token

    Returns:
        checkout_url: Stripe Checkout URL to redirect user
    """
    try:
        user_id = current_user.get("id")
        user_email = current_user.get("email")

        if not user_id or not user_email:
            raise HTTPException(status_code=401, detail="Invalid user data")

        # Frontend URLs for redirect
        # Use primary frontend URL (first one if multiple URLs defined)
        frontend_url = settings.get_primary_frontend_url()
        success_url = f"{frontend_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{frontend_url}/pricing"

        logger.info(f"[STRIPE] Creating checkout for user {user_id}: {plan_name} ({billing_period})")

        checkout_data = await create_checkout_session(
            user_id=user_id,
            user_email=user_email,
            plan_name=plan_name,
            billing_period=billing_period,
            success_url=success_url,
            cancel_url=cancel_url
        )

        # Handle both new subscriptions (checkout_url) and modifications (immediate)
        if checkout_data.get("checkout_url"):
            # New subscription - redirect to Stripe Checkout
            return {
                "success": True,
                "checkout_url": checkout_data["checkout_url"],
                "session_id": checkout_data.get("session_id")
            }
        else:
            # Subscription modified (upgrade/downgrade) - no redirect needed
            return {
                "success": True,
                "modified": True,
                "immediate": checkout_data.get("immediate", False),
                "message": checkout_data.get("message", "Subscription updated"),
                "subscription_id": checkout_data.get("subscription_id")
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STRIPE] Checkout creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create checkout: {str(e)}")


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature")
):
    """
    Handle Stripe webhook events.

    This endpoint receives events from Stripe about subscription changes,
    payments, and cancellations.
    """
    try:
        # Get raw body for signature verification
        payload = await request.body()

        if not stripe_signature:
            raise HTTPException(status_code=400, detail="Missing Stripe signature")

        result = await handle_stripe_webhook(payload, stripe_signature)

        logger.info(f"[STRIPE] Webhook processed: {result['event']}")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STRIPE] Webhook processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")
