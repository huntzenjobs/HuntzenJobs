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
import traceback
from typing import Optional, Dict, Any, Literal
from datetime import datetime, timedelta
from structlog import get_logger
from fastapi import HTTPException
from supabase import create_client, Client

logger = get_logger(__name__)

# Import quota cache invalidation
try:
    from app.quota import invalidate_user_quota_cache
except ImportError:
    logger.warning("Could not import invalidate_user_quota_cache - cache invalidation disabled")
    async def invalidate_user_quota_cache(user_id: str) -> bool:
        """Fallback stub if quota module not available."""
        return False

# ============================================
# STRIPE CONFIGURATION
# ============================================

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# Price IDs are now stored in database (stripe_prices table)
# Removed hardcoded STRIPE_PRICE_IDS dict - use get_stripe_price_id() RPC instead
# Migration: 20260210000003_stripe_price_config.sql

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

async def get_active_subscription(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get user's active subscription from database.

    Args:
        user_id: User UUID

    Returns:
        Subscription data or None if no active subscription
    """
    if not supabase_client:
        return None

    try:
        response = supabase_client.table("user_subscriptions")\
            .select("*, subscription_plans(name)")\
            .eq("user_id", user_id)\
            .eq("status", "active")\
            .maybe_single()\
            .execute()

        return response.data if response.data else None
    except Exception as e:
        logger.error(f"Failed to get active subscription: {e}")
        return None


async def modify_existing_subscription(
    subscription_id: str,
    current_plan: str,
    new_plan: str,
    new_price_id: str,
    user_id: str
) -> Dict[str, Any]:
    """
    Modify an existing Stripe subscription (upgrade/downgrade).

    Args:
        subscription_id: Stripe subscription ID
        current_plan: Current plan name
        new_plan: New plan name
        new_price_id: Stripe price ID for new plan
        user_id: User UUID for logging

    Returns:
        Dict with success status and redirect URL
    """
    try:
        # Get current subscription from Stripe
        subscription = stripe.Subscription.retrieve(subscription_id)

        # Determine if upgrade or downgrade
        plan_hierarchy = {"starter": 1, "pro": 2, "premium": 3}
        is_upgrade = plan_hierarchy.get(new_plan, 0) > plan_hierarchy.get(current_plan, 0)

        logger.info(f"{'Upgrading' if is_upgrade else 'Downgrading'} subscription for user {user_id}: {current_plan} → {new_plan}")

        # Modify the subscription
        updated_subscription = stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": subscription["items"]["data"][0].id,
                "price": new_price_id,
            }],
            # For upgrades: apply immediately with prorated charge
            # For downgrades: schedule change at period end
            proration_behavior="create_prorations" if is_upgrade else "none",
            billing_cycle_anchor="now" if is_upgrade else "unchanged",
            # For downgrades, update at period end
            cancel_at_period_end=False,
            metadata={
                "user_id": user_id,
                "plan_name": new_plan
            }
        )

        # Update database
        if supabase_client:
            plan_response = supabase_client.table("subscription_plans")\
                .select("id")\
                .eq("name", new_plan)\
                .single()\
                .execute()

            if plan_response.data:
                supabase_client.table("user_subscriptions")\
                    .update({
                        "plan_id": plan_response.data["id"],
                        "current_period_end": datetime.fromtimestamp(
                            updated_subscription.current_period_end
                        ).isoformat(),
                        "updated_at": datetime.utcnow().isoformat()
                    })\
                    .eq("stripe_subscription_id", subscription_id)\
                    .execute()

                # Invalidate quota cache after plan change
                await invalidate_user_quota_cache(user_id)
                logger.info(f"Quota cache invalidated for user {user_id}")

        logger.info(f"Subscription modified successfully for user {user_id}")

        return {
            "success": True,
            "immediate": is_upgrade,
            "message": "Upgrade applied immediately" if is_upgrade else "Downgrade scheduled for end of billing period",
            # Return a success URL without checkout (change was immediate)
            "checkout_url": None,
            "subscription_id": subscription_id
        }

    except stripe.error.StripeError as e:
        logger.error(f"Stripe API error during subscription modification: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to modify subscription: {e}")
        raise HTTPException(status_code=500, detail=f"Subscription modification failed: {str(e)}")


async def create_checkout_session(
    user_id: str,
    user_email: str,
    plan_name: Literal["starter", "pro", "premium"],
    billing_period: Literal["monthly", "yearly"],
    success_url: str,
    cancel_url: str
) -> Dict[str, Any]:
    """
    Create Stripe Checkout session for subscription payment OR modify existing subscription.

    This function intelligently handles both new subscriptions and plan changes:
    - New users: Creates a Checkout session for initial subscription
    - Existing subscribers: Modifies their current subscription with prorated billing

    Upgrade behavior (e.g., Starter → Pro):
    - Applied immediately
    - Prorated charge for the price difference

    Downgrade behavior (e.g., Pro → Starter):
    - Scheduled for end of current billing period
    - No immediate charge, user keeps benefits until period ends

    Args:
        user_id: User UUID from Supabase auth
        user_email: User email for Stripe customer
        plan_name: subscription plan ('starter', 'pro', 'premium')
        billing_period: 'monthly' or 'yearly'
        success_url: URL to redirect after successful payment
        cancel_url: URL to redirect if user cancels

    Returns:
        Dict with checkout_url (for new subscriptions) or success status (for modifications)

    Raises:
        HTTPException: If Stripe API fails
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    try:
        # Get price_id from database (replaces hardcoded STRIPE_PRICE_IDS)
        if not supabase_client:
            raise HTTPException(status_code=500, detail="Database not configured")

        price_response = supabase_client.rpc("get_stripe_price_id", {
            "p_plan_name": plan_name,
            "p_billing_period": billing_period
        }).execute()

        if not price_response.data:
            raise HTTPException(
                status_code=404,
                detail=f"Price not found for {plan_name}/{billing_period}. Contact support."
            )

        price_id = price_response.data
        logger.info(f"Retrieved price ID from DB: {price_id} for {plan_name}/{billing_period}")

        # Check if user already has an active subscription
        existing_subscription = await get_active_subscription(user_id)

        if existing_subscription and existing_subscription.get("stripe_subscription_id"):
            # User has active subscription - modify it instead of creating new one
            current_plan = existing_subscription["subscription_plans"]["name"]

            # Don't allow "upgrading" to the same plan
            if current_plan == plan_name:
                raise HTTPException(status_code=400, detail=f"Already subscribed to {plan_name}")

            return await modify_existing_subscription(
                subscription_id=existing_subscription["stripe_subscription_id"],
                current_plan=current_plan,
                new_plan=plan_name,
                new_price_id=price_id,
                user_id=user_id
            )

        # No existing subscription - create new checkout session
        logger.info(f"Creating new Stripe checkout for user {user_id}: {plan_name} ({billing_period})")

        # Try to find existing Stripe customer by email
        customers = stripe.Customer.list(email=user_email, limit=1)
        customer_id = customers.data[0].id if customers.data else None

        session = stripe.checkout.Session.create(
            customer=customer_id,  # Reuse existing customer if found
            customer_email=user_email if not customer_id else None,
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
            "success": True,
            "checkout_url": session.url,
            "session_id": session.id
        }

    except HTTPException:
        raise
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
    event_id = event.get("id", "unknown")

    logger.info(f"Received Stripe webhook: {event_type} (ID: {event_id})")

    # Check idempotency - has this event already been processed?
    if supabase_client:
        try:
            check_result = supabase_client.rpc("is_webhook_event_processed", {
                "p_event_id": event_id
            }).execute()

            if check_result.data:
                logger.info(f"Event {event_id} already processed, skipping")
                return {"status": "success", "event": event_type, "skipped": True}
        except Exception as e:
            logger.error(f"Failed to check webhook idempotency: {e}")
            # Continue processing (fail-open for safety)

    # Handle different event types with error tracking
    try:
        if event_type == "checkout.session.completed":
            await handle_checkout_completed(event["data"]["object"])
        elif event_type == "customer.subscription.updated":
            await handle_subscription_updated(event["data"]["object"])
        elif event_type == "customer.subscription.deleted":
            await handle_subscription_deleted(event["data"]["object"])
        elif event_type == "invoice.payment_failed":
            await handle_payment_failed(event["data"]["object"])
        else:
            logger.info(f"Unhandled webhook event: {event_type}")

        # Mark event as processed (idempotency)
        if supabase_client:
            try:
                supabase_client.rpc("mark_webhook_event_processed", {
                    "p_event_id": event_id,
                    "p_event_type": event_type,
                    "p_payload": event
                }).execute()
            except Exception as e:
                logger.error(f"Failed to mark webhook as processed: {e}")

        return {"status": "success", "event": event_type}

    except Exception as e:
        # Log webhook failure for monitoring
        error_msg = str(e)
        error_trace = traceback.format_exc()

        logger.error("webhook_failed",
            event_id=event_id,
            event_type=event_type,
            error=error_msg,
            traceback=error_trace
        )

        # Log to database for alerting
        if supabase_client:
            try:
                supabase_client.rpc("log_webhook_failure", {
                    "p_event_id": event_id,
                    "p_event_type": event_type,
                    "p_error_message": error_msg,
                    "p_error_traceback": error_trace
                }).execute()
            except Exception as log_error:
                logger.error(f"Failed to log webhook failure: {log_error}")

        # Re-raise so Stripe knows the webhook failed and will retry
        raise


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

        # Get actual subscription data from Stripe (use real periods, not calculated)
        stripe_subscription = stripe.Subscription.retrieve(stripe_subscription_id)

        # Use Stripe's actual period dates instead of hardcoded calculations
        current_period_start = datetime.fromtimestamp(
            stripe_subscription.current_period_start
        )
        current_period_end = datetime.fromtimestamp(
            stripe_subscription.current_period_end
        )

        logger.info(f"Subscription period from Stripe: {current_period_start} → {current_period_end}")

        # Check if user already has an active subscription
        existing = supabase_client.table("user_subscriptions")\
            .select("*")\
            .eq("user_id", user_id)\
            .eq("status", "active")\
            .execute()

        subscription_data = {
            "user_id": user_id,
            "plan_id": plan_id,
            "status": stripe_subscription.status,  # Use Stripe's actual status
            "stripe_subscription_id": stripe_subscription_id,
            "stripe_customer_id": stripe_customer_id,
            "stripe_price_id": stripe_subscription["items"]["data"][0]["price"]["id"],
            "current_period_start": current_period_start.isoformat(),
            "current_period_end": current_period_end.isoformat(),
            "cancel_at_period_end": stripe_subscription.cancel_at_period_end,
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

        # Invalidate quota cache after subscription creation/update
        await invalidate_user_quota_cache(user_id)
        logger.info(f"Quota cache invalidated for user {user_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription in database: {e}")


async def handle_subscription_updated(subscription: Dict[str, Any]):
    """
    Handle subscription updates (renewals, plan changes, etc.).
    This webhook fires when subscription details change in Stripe.
    """
    stripe_subscription_id = subscription["id"]

    logger.info(f"Subscription updated: {stripe_subscription_id}")

    if not supabase_client:
        logger.error("Supabase client not configured")
        return

    try:
        # Update subscription in database with Stripe's current state
        update_data = {
            "status": subscription["status"],
            "current_period_start": datetime.fromtimestamp(
                subscription["current_period_start"]
            ).isoformat(),
            "current_period_end": datetime.fromtimestamp(
                subscription["current_period_end"]
            ).isoformat(),
            "cancel_at_period_end": subscription.get("cancel_at_period_end", False),
            "updated_at": datetime.utcnow().isoformat()
        }

        supabase_client.table("user_subscriptions")\
            .update(update_data)\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        # Get user_id for cache invalidation
        user_subscription = supabase_client.table("user_subscriptions")\
            .select("user_id")\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .single()\
            .execute()

        if user_subscription.data:
            user_id = user_subscription.data["user_id"]

            # Invalidate quota cache
            await invalidate_user_quota_cache(user_id)
            logger.info(f"Quota cache invalidated for user {user_id}")

        logger.info(f"Subscription updated in database: {stripe_subscription_id}")

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
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "cancelled",
                "cancelled_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        # Get user_id for cache invalidation
        if result.data and len(result.data) > 0:
            user_id = result.data[0].get("user_id")
            if user_id:
                await invalidate_user_quota_cache(user_id)
                logger.info(f"Quota cache invalidated for user {user_id}")

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
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "past_due",
                "updated_at": datetime.utcnow().isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        # Get user_id for cache invalidation
        if result.data and len(result.data) > 0:
            user_id = result.data[0].get("user_id")
            if user_id:
                await invalidate_user_quota_cache(user_id)
                logger.info(f"Quota cache invalidated for user {user_id}")

        logger.info(f"Subscription marked as past_due: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription status: {e}")
