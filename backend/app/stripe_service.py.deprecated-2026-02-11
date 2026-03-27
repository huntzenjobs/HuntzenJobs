"""
Stripe Payment Integration Service (Phase 2.3)

Handles subscription payments via Stripe Checkout:
1. Create checkout sessions (monthly/yearly)
2. Process webhooks for payment events
3. Update user subscriptions in database

Author: HuntZen Team
Date: 2026-02-03
Sprint: Phase 2 - Stripe Integration
"""

import os
import stripe
from typing import Optional, Dict, Any, Literal
from datetime import datetime, timedelta
from structlog import get_logger
from fastapi import HTTPException
from supabase import create_client, Client

logger = get_logger(__name__)

# ============================================
# STRIPE CONFIGURATION
# ============================================

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# Price IDs from Stripe Dashboard
STRIPE_PRICE_IDS = {
    "starter": {
        "monthly": "price_1SwkaNF7q8KRoF9a8cVsijpc",
        "yearly": "price_1SwkacF7q8KRoF9aEmn5s5aL"
    },
    "pro": {
        "monthly": "price_1SwkeQF7q8KRoF9azQdPo1o6",
        "yearly": "price_1SwlBkF7q8KRoF9agySwklWJ"
    },
    "premium": {
        "monthly": "price_1SwlC1F7q8KRoF9a8FXeooCj",
        "yearly": "price_1SwlCBF7q8KRoF9aG8uNTsiH"
    }
}

if not stripe.api_key:
    logger.warning("Stripe not configured - STRIPE_SECRET_KEY missing")
    STRIPE_ENABLED = False
else:
    STRIPE_ENABLED = True
    logger.info("Stripe payment integration enabled")


# ============================================
# SUPABASE CLIENT
# ============================================

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("Supabase not configured for Stripe integration")
    supabase_client: Optional[Client] = None
else:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized for Stripe integration")


# ============================================
# CREATE CHECKOUT SESSION
# ============================================

async def create_checkout_session(
    user_id: str,
    user_email: str,
    plan_name: Literal["starter", "pro", "premium"],
    billing_period: Literal["monthly", "yearly"],
    success_url: str,
    cancel_url: str
) -> Dict[str, Any]:
    """
    Create Stripe Checkout session for subscription payment.

    Args:
        user_id: User UUID from Supabase auth
        user_email: User email for Stripe customer
        plan_name: subscription plan ('starter', 'pro', 'premium')
        billing_period: 'monthly' or 'yearly'
        success_url: URL to redirect after successful payment
        cancel_url: URL to redirect if user cancels

    Returns:
        Dict with checkout_url and session_id

    Raises:
        HTTPException: If Stripe API fails
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    if plan_name not in STRIPE_PRICE_IDS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan_name}")

    try:
        price_id = STRIPE_PRICE_IDS[plan_name][billing_period]

        logger.info(f"Creating Stripe checkout for user {user_id}: {plan_name} ({billing_period})")

        # Create Stripe checkout session
        session = stripe.checkout.Session.create(
            customer_email=user_email,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{
                "price": price_id,
                "quantity": 1
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": user_id,
                "plan_name": plan_name,
                "billing_period": billing_period
            },
            subscription_data={
                "metadata": {
                    "user_id": user_id,
                    "plan_name": plan_name
                }
            }
        )

        logger.info(f"Stripe checkout created: {session.id}")

        return {
            "checkout_url": session.url,
            "session_id": session.id
        }

    except stripe.error.StripeError as e:
        logger.error(f"Stripe API error: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to create checkout session: {e}")
        raise HTTPException(status_code=500, detail=f"Checkout creation failed: {str(e)}")


# ============================================
# WEBHOOK HANDLING
# ============================================

async def handle_stripe_webhook(
    payload: bytes,
    signature: str
) -> Dict[str, str]:
    """
    Handle Stripe webhook events.

    Supported events:
    - checkout.session.completed: Subscription created successfully
    - customer.subscription.deleted: Subscription cancelled
    - invoice.payment_failed: Payment failed

    Args:
        payload: Raw webhook payload
        signature: Stripe-Signature header

    Returns:
        Dict with status message

    Raises:
        HTTPException: If webhook verification fails
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    if not STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook secret not configured - skipping verification")
        # In test mode without webhook secret, parse without verification
        import json
        event = json.loads(payload)
    else:
        try:
            event = stripe.Webhook.construct_event(
                payload, signature, STRIPE_WEBHOOK_SECRET
            )
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Webhook signature verification failed: {e}")
            raise HTTPException(status_code=400, detail="Invalid signature")
        except Exception as e:
            logger.error(f"Webhook parsing failed: {e}")
            raise HTTPException(status_code=400, detail="Webhook parsing failed")

    event_type = event["type"]
    logger.info(f"Received Stripe webhook: {event_type}")

    # Handle different event types
    if event_type == "checkout.session.completed":
        await handle_checkout_completed(event["data"]["object"])
    elif event_type == "customer.subscription.deleted":
        await handle_subscription_deleted(event["data"]["object"])
    elif event_type == "invoice.payment_failed":
        await handle_payment_failed(event["data"]["object"])
    else:
        logger.info(f"Unhandled webhook event: {event_type}")

    return {"status": "success", "event": event_type}


async def handle_checkout_completed(session: Dict[str, Any]):
    """Handle successful checkout - create/update subscription."""
    user_id = session["metadata"]["user_id"]
    plan_name = session["metadata"]["plan_name"]
    stripe_subscription_id = session["subscription"]
    stripe_customer_id = session["customer"]

    logger.info(f"Checkout completed for user {user_id}: {plan_name}")

    if not supabase_client:
        logger.error("Supabase client not configured")
        return

    try:
        # Get subscription plan ID from database
        plan_response = supabase_client.table("subscription_plans")\
            .select("id")\
            .eq("name", plan_name)\
            .single()\
            .execute()

        if not plan_response.data:
            logger.error(f"Plan not found in database: {plan_name}")
            return

        plan_id = plan_response.data["id"]

        # Calculate subscription period
        # Stripe subscriptions start immediately and renew monthly/yearly
        current_period_start = datetime.utcnow()
        billing_period = session["metadata"].get("billing_period", "monthly")
        if billing_period == "yearly":
            current_period_end = current_period_start + timedelta(days=365)
        else:
            current_period_end = current_period_start + timedelta(days=30)

        # Check if user already has an active subscription
        existing = supabase_client.table("user_subscriptions")\
            .select("*")\
            .eq("user_id", user_id)\
            .eq("status", "active")\
            .execute()

        subscription_data = {
            "user_id": user_id,
            "plan_id": plan_id,
            "status": "active",
            "stripe_subscription_id": stripe_subscription_id,
            "stripe_customer_id": stripe_customer_id,
            "current_period_start": current_period_start.isoformat(),
            "current_period_end": current_period_end.isoformat(),
            "cancel_at_period_end": False,
            "updated_at": datetime.utcnow().isoformat()
        }

        if existing.data and len(existing.data) > 0:
            # Update existing subscription
            supabase_client.table("user_subscriptions")\
                .update(subscription_data)\
                .eq("user_id", user_id)\
                .eq("status", "active")\
                .execute()
            logger.info(f"Subscription updated for user {user_id}: {plan_name}")
        else:
            # Create new subscription
            supabase_client.table("user_subscriptions")\
                .insert(subscription_data)\
                .execute()
            logger.info(f"Subscription created for user {user_id}: {plan_name}")

    except Exception as e:
        logger.error(f"Failed to update subscription in database: {e}")


async def handle_subscription_deleted(subscription: Dict[str, Any]):
    """Handle subscription cancellation."""
    stripe_subscription_id = subscription["id"]

    logger.info(f"Subscription deleted: {stripe_subscription_id}")

    if not supabase_client:
        logger.error("Supabase client not configured")
        return

    try:
        # Update subscription status to cancelled
        supabase_client.table("user_subscriptions")\
            .update({
                "status": "cancelled",
                "cancelled_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        logger.info(f"Subscription cancelled in database: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to cancel subscription in database: {e}")


async def handle_payment_failed(invoice: Dict[str, Any]):
    """Handle failed payment."""
    stripe_subscription_id = invoice["subscription"]

    logger.warning(f"Payment failed for subscription: {stripe_subscription_id}")

    if not supabase_client:
        logger.error("Supabase client not configured")
        return

    try:
        # Update subscription status to past_due
        supabase_client.table("user_subscriptions")\
            .update({
                "status": "past_due",
                "updated_at": datetime.utcnow().isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        logger.info(f"Subscription marked as past_due: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription status: {e}")
