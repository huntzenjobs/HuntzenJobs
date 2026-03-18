"""
Stripe Payment Routes
====================
API endpoints for Stripe payment processing.
"""

from fastapi import APIRouter, HTTPException, Depends, Form, Request, Header
from typing import Optional
from structlog import get_logger

from src.api.deps import get_current_user
from src.services.stripe import create_checkout_session, handle_stripe_webhook, supabase_client
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


@router.post("/cancel-subscription")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user)
):
    """
    Cancel the current user's subscription at end of billing period.
    Uses cancel_at_period_end=True — user keeps access until period ends.
    The webhook customer.subscription.updated will update DB automatically.
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        if not supabase_client:
            raise HTTPException(status_code=500, detail="Database not configured")

        result = (
            supabase_client
            .table("user_subscriptions")
            .select("stripe_subscription_id, status, subscription_plans(name)")
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="No active subscription found")

        subscription = result.data[0]
        stripe_subscription_id = subscription.get("stripe_subscription_id")
        plan_name = (subscription.get("subscription_plans") or {}).get("name", "unknown")

        if not stripe_subscription_id or not stripe_subscription_id.startswith("sub_"):
            raise HTTPException(status_code=400, detail="Invalid subscription ID")

        # GARDE-FOU: cancel_at_period_end=True UNIQUEMENT — jamais stripe.Subscription.delete()
        import stripe as stripe_lib
        updated = stripe_lib.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=True
        )

        logger.info(
            f"[STRIPE] Subscription {stripe_subscription_id} marked for cancellation "
            f"at period end for user {user_id}"
        )

        return {
            "success": True,
            "cancel_at_period_end": True,
            "plan_name": plan_name,
            "current_period_end": updated.get("current_period_end"),
            "message": f"{plan_name} plan will be cancelled at end of billing period"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STRIPE] Cancel subscription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel subscription: {str(e)}")


@router.post("/reactivate-subscription")
async def reactivate_subscription(
    current_user: dict = Depends(get_current_user)
):
    """
    Reactivate a subscription scheduled for cancellation.
    Sets cancel_at_period_end=False — subscription continues as normal.
    Only works while the subscription is still active (not yet expired).
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        if not supabase_client:
            raise HTTPException(status_code=500, detail="Database not configured")

        result = (
            supabase_client
            .table("user_subscriptions")
            .select("stripe_subscription_id, status, subscription_plans(name)")
            .eq("user_id", user_id)
            .in_("status", ["active", "past_due"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="No active subscription found")

        subscription = result.data[0]
        stripe_subscription_id = subscription.get("stripe_subscription_id")
        plan_name = (subscription.get("subscription_plans") or {}).get("name", "unknown")

        if not stripe_subscription_id or not stripe_subscription_id.startswith("sub_"):
            raise HTTPException(status_code=400, detail="Invalid subscription ID")

        import stripe as stripe_lib
        updated = stripe_lib.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=False
        )

        logger.info(
            f"[STRIPE] Subscription {stripe_subscription_id} reactivated for user {user_id}"
        )

        return {
            "success": True,
            "cancel_at_period_end": False,
            "plan_name": plan_name,
            "current_period_end": updated.get("current_period_end"),
            "message": f"{plan_name} subscription has been reactivated"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STRIPE] Reactivate subscription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reactivate subscription: {str(e)}")


@router.post("/create-portal-session")
async def create_portal_session(
    current_user: dict = Depends(get_current_user)
):
    """
    Create a Stripe Billing Portal session.
    Used when the user needs to update their payment method (past_due)
    or manage their subscription outside the app.
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        if not supabase_client:
            raise HTTPException(status_code=500, detail="Database not configured")

        # Get the Stripe customer ID from active (or past_due) subscription
        result = (
            supabase_client
            .table("user_subscriptions")
            .select("stripe_customer_id")
            .eq("user_id", user_id)
            .in_("status", ["active", "past_due", "trialing"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data or not result.data[0].get("stripe_customer_id"):
            raise HTTPException(status_code=404, detail="No Stripe customer found")

        stripe_customer_id = result.data[0]["stripe_customer_id"]

        import stripe as stripe_lib
        frontend_url = settings.get_primary_frontend_url()

        portal_session = stripe_lib.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=f"{frontend_url}/profile",
        )

        logger.info(f"[STRIPE] Portal session created for user {user_id}")
        return {"success": True, "portal_url": portal_session.url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STRIPE] Create portal session failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create portal session: {str(e)}")
