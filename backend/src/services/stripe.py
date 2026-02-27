"""
Stripe Payment Integration Service - SIMPLIFIED VERSION
========================================================

Philosophy: Stripe is the source of truth. We just copy data, no complex logic.

Handles:
1. Create checkout sessions (subscriptions)
2. Process webhooks (copy Stripe data to DB)
3. Update user subscriptions

Author: HuntZen Team
Date: 2026-02-11
Simplified: Removed idempotency tables, webhook_failures logging, complex upgrade logic
"""

import os
import stripe
from typing import Optional, Dict, Any, Literal
from datetime import datetime, timezone
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
        return False

# Import email service for recruiter confirmations
try:
    from src.services.email import send_recruiter_request_confirmation
except ImportError:
    logger.warning("Could not import send_recruiter_request_confirmation - email notifications disabled")
    def send_recruiter_request_confirmation(*args, **kwargs):
        logger.warning("Email notification skipped (service not available)")

# ============================================
# CONFIGURATION
# ============================================

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

if not stripe.api_key:
    logger.warning("Stripe not configured - STRIPE_SECRET_KEY missing")
    STRIPE_ENABLED = False
else:
    STRIPE_ENABLED = True
    logger.info("Stripe payment integration enabled")

# Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("Supabase not configured for Stripe integration")
    supabase_client: Optional[Client] = None
else:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized for Stripe integration")


# ============================================
# HELPER: Get active subscription
# ============================================

async def get_active_subscription(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user's active subscription from database."""
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

    Simple logic:
    - If user has active subscription: Cancel it and create new one
    - If no subscription: Create new checkout

    Stripe handles everything, we just create the checkout and let webhooks update DB.
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        # ✅ FIX 1: Vérifier que l'utilisateur existe dans la DB
        logger.info(f"[CHECKOUT] Verifying user {user_id} exists in database")
        user_check = supabase_client.table("profiles")\
            .select("id")\
            .eq("id", user_id)\
            .execute()

        if not user_check.data or len(user_check.data) == 0:
            logger.error(f"[CHECKOUT] User {user_id} not found in database")
            raise HTTPException(
                status_code=400,
                detail="User not found. Please logout and login again."
            )

        logger.info(f"[CHECKOUT] User {user_id} verified successfully")

        # Get price_id from database
        price_response = supabase_client.rpc("get_stripe_price_id", {
            "p_plan_name": plan_name,
            "p_billing_period": billing_period
        }).execute()

        if not price_response.data:
            raise HTTPException(
                status_code=404,
                detail=f"Price not found for {plan_name}/{billing_period}"
            )

        price_id = price_response.data
        logger.info(f"Creating checkout for {plan_name}/{billing_period}: {price_id}")

        # Check if user already has an active subscription
        existing_subscription = await get_active_subscription(user_id)

        # Try to find existing Stripe customer by email
        customers = stripe.Customer.list(email=user_email, limit=1)
        customer_id = customers.data[0].id if customers.data else None

        # If user has active subscription, cancel it first (Stripe will handle via webhook)
        if existing_subscription and existing_subscription.get("stripe_subscription_id"):
            old_subscription_id = existing_subscription["stripe_subscription_id"]

            # CRITICAL FIX: Only cancel if it's a real Stripe subscription ID
            # Ignore fake test subscriptions (e.g., "sub_test_manual_insert")
            if old_subscription_id.startswith("sub_") and len(old_subscription_id) > 20:
                try:
                    stripe.Subscription.delete(old_subscription_id)
                    logger.info(f"Cancelled old subscription: {old_subscription_id}")
                except Exception as e:
                    logger.warning(f"Failed to cancel old subscription: {e}")
            else:
                logger.info(f"Skipping cancel of non-Stripe subscription ID: {old_subscription_id}")

        # Create checkout session (Stripe handles everything)
        session = stripe.checkout.Session.create(
            customer=customer_id,
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
# WEBHOOK HANDLING - SIMPLE VERSION
# ============================================

async def handle_stripe_webhook(
    payload: bytes,
    signature: str
) -> Dict[str, str]:
    """
    Handle Stripe webhook events - SIMPLIFIED.

    No idempotency table, no webhook_failures logging.
    Stripe handles retries if we return non-200.
    We just copy data from Stripe to our DB.
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    # Verify webhook signature
    if not STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook secret not configured - skipping verification")
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

    logger.info(f"[WEBHOOK] Received Stripe webhook: {event_type} (ID: {event_id})")

    # ✅ FIX 3: Vérifier idempotence (évite de traiter 2x le même event)
    if supabase_client:
        try:
            is_processed = supabase_client.rpc(
                "is_webhook_event_processed",
                {"p_event_id": event_id}
            ).execute()

            if is_processed.data:
                logger.info(f"[WEBHOOK] Event {event_id} already processed, skipping")
                return {
                    "status": "success",
                    "event": event_type,
                    "note": "already_processed"
                }
        except Exception as e:
            logger.warning(f"[WEBHOOK] Failed to check idempotence: {e} (continuing anyway)")

    # Handle different event types
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
            logger.info(f"[WEBHOOK] Unhandled webhook event: {event_type}")

        # ✅ FIX 3: Marquer comme traité après succès
        if supabase_client:
            try:
                supabase_client.rpc(
                    "mark_webhook_event_processed",
                    {
                        "p_event_id": event_id,
                        "p_event_type": event_type,
                        "p_payload": event
                    }
                ).execute()
                logger.info(f"[WEBHOOK] Marked event {event_id} as processed")
            except Exception as e:
                logger.warning(f"[WEBHOOK] Failed to mark as processed: {e}")

        return {"status": "success", "event": event_type}

    except Exception as e:
        # Log error and re-raise so Stripe knows it failed
        logger.error(f"Webhook processing failed: {event_type} - {str(e)}")
        raise


# ============================================
# WEBHOOK HANDLERS
# ============================================

async def handle_checkout_completed(session: Dict[str, Any]):
    """Handle successful checkout - create or update subscription."""
    metadata = session.get("metadata", {})

    # Detect type based on metadata
    if "request_id" in metadata:
        await handle_recruiter_checkout(session)
        return

    user_id = metadata.get("user_id")
    plan_name = metadata.get("plan_name")
    session_id = session.get("id", "unknown")

    if not user_id or not plan_name:
        error_msg = f"Missing user_id or plan_name in checkout metadata"
        logger.error(f"[WEBHOOK] {error_msg}")

        # ✅ FIX 2: Logger dans webhook_failures
        if supabase_client:
            try:
                supabase_client.rpc("log_webhook_failure", {
                    "p_event_id": session_id,
                    "p_event_type": "checkout.session.completed",
                    "p_error_message": error_msg
                }).execute()
            except Exception as log_err:
                logger.error(f"Failed to log webhook failure: {log_err}")

        raise HTTPException(status_code=400, detail="Missing metadata")

    stripe_subscription_id = session.get("subscription")
    stripe_customer_id = session.get("customer")

    # 🔧 FIX: Verify subscription ID exists
    if not stripe_subscription_id:
        logger.error(f"No subscription ID in checkout session {session.get('id')}")
        raise HTTPException(
            status_code=400,
            detail="No subscription found in checkout session"
        )

    if not supabase_client:
        logger.error("Supabase client not configured")
        return

    # ✅ FIX 2: Vérifier que l'utilisateur existe AVANT de traiter
    logger.info(f"[WEBHOOK] Verifying user {user_id} exists in database")
    try:
        user_check = supabase_client.table("profiles")\
            .select("id")\
            .eq("id", user_id)\
            .execute()

        if not user_check.data or len(user_check.data) == 0:
            error_msg = f"User {user_id} not found in database (may have been deleted or never existed)"
            logger.error(f"[WEBHOOK] {error_msg}")

            # Logger dans webhook_failures
            try:
                supabase_client.rpc("log_webhook_failure", {
                    "p_event_id": session_id,
                    "p_event_type": "checkout.session.completed",
                    "p_error_message": error_msg
                }).execute()
                logger.info(f"[WEBHOOK] Logged failure for event {session_id}")
            except Exception as log_err:
                logger.error(f"Failed to log webhook failure: {log_err}")

            raise HTTPException(status_code=400, detail="User not found in database")

        logger.info(f"[WEBHOOK] User {user_id} verified successfully")

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to verify user existence: {str(e)}"
        logger.error(f"[WEBHOOK] {error_msg}")
        raise HTTPException(status_code=500, detail="User verification failed")

    try:
        # Get plan_id from database
        plan_response = supabase_client.table("subscription_plans")\
            .select("id")\
            .eq("name", plan_name)\
            .single()\
            .execute()

        if not plan_response.data:
            logger.error(f"Plan not found: {plan_name}")
            return

        plan_id = plan_response.data["id"]

        # Get subscription data from Stripe (source of truth)
        # 🔧 FIX: Add try/except for Stripe API call
        try:
            stripe_subscription = stripe.Subscription.retrieve(stripe_subscription_id)
        except stripe.error.StripeError as e:
            logger.error(f"Failed to retrieve subscription {stripe_subscription_id}: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to retrieve subscription: {str(e)}"
            )

        # 🔧 FIX: Safely extract subscription data with defaults
        subscription_data = {
            "user_id": user_id,
            "plan_id": plan_id,
            "status": stripe_subscription.get("status", "active"),
            "stripe_subscription_id": stripe_subscription_id,
            "stripe_customer_id": stripe_customer_id,
            "stripe_price_id": stripe_subscription["items"]["data"][0]["price"]["id"],
            "current_period_start": datetime.fromtimestamp(
                stripe_subscription.get("current_period_start", int(datetime.now(timezone.utc).timestamp())),
                tz=timezone.utc
            ).isoformat(),
            "current_period_end": datetime.fromtimestamp(
                stripe_subscription.get("current_period_end", int(datetime.now(timezone.utc).timestamp()) + 2592000),  # +30 days
                tz=timezone.utc
            ).isoformat(),
            "cancel_at_period_end": stripe_subscription.get("cancel_at_period_end", False),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        # Check if user already has an active subscription
        existing = supabase_client.table("user_subscriptions")\
            .select("*")\
            .eq("user_id", user_id)\
            .eq("status", "active")\
            .execute()

        if existing.data and len(existing.data) > 0:
            # OPTION B: Preserve history - Cancel old subscription + Insert new
            # Step 1: Archive old subscription (keeps history for analytics/audit)
            supabase_client.table("user_subscriptions")\
                .update({
                    "status": "canceled",
                    "canceled_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                })\
                .eq("user_id", user_id)\
                .eq("status", "active")\
                .execute()

            # Step 2: Create new subscription record
            supabase_client.table("user_subscriptions")\
                .insert(subscription_data)\
                .execute()

            logger.info(f"Subscription upgraded for user {user_id}: {plan_name} (history preserved)")
        else:
            # Insert new subscription (first time)
            supabase_client.table("user_subscriptions")\
                .insert(subscription_data)\
                .execute()
            logger.info(f"Subscription created for user {user_id}: {plan_name}")


        # Trigger referral conversion reward (fire-and-forget)
        try:
            from src.services.referrals import apply_referral_reward
            signup_res = supabase_client.table("referral_signups") \
                .select("id, referral_id, referrals(referrer_id)") \
                .eq("referred_user_id", user_id) \
                .is_("converted_to_paid_at", "null") \
                .maybe_single() \
                .execute()
            if signup_res.data:
                signup = signup_res.data
                referrer_id = signup["referrals"]["referrer_id"]
                supabase_client.table("referral_signups").update({
                    "converted_to_paid_at": datetime.now(timezone.utc).isoformat(),
                    "converted_plan": plan_name,
                }).eq("id", signup["id"]).execute()
                conv_count = supabase_client.table("referrals").select("total_conversions") \
                    .eq("id", signup["referral_id"]).single().execute().data["total_conversions"]
                supabase_client.table("referrals").update({"total_conversions": conv_count + 1}) \
                    .eq("id", signup["referral_id"]).execute()
                await apply_referral_reward(
                    supabase_client,
                    referral_signup_id=signup["id"],
                    referrer_id=referrer_id,
                    plan_name=plan_name,
                )
        except Exception as ref_err:
            logger.error(f"[REFERRAL] Conversion reward failed (non-fatal): {ref_err}")

        # Invalidate quota cache
        await invalidate_user_quota_cache(user_id)

    except Exception as e:
        logger.error(f"Failed to update subscription in database: {e}")
        raise


async def handle_subscription_updated(subscription: Dict[str, Any]):
    """Handle subscription updates (renewals, changes)."""
    stripe_subscription_id = subscription["id"]

    if not supabase_client:
        return

    try:
        update_data = {
            "status": subscription["status"],
            "stripe_price_id": subscription["items"]["data"][0]["price"]["id"],
            "current_period_start": datetime.fromtimestamp(
                subscription.get("current_period_start", int(datetime.now(timezone.utc).timestamp())),
                tz=timezone.utc
            ).isoformat(),
            "current_period_end": datetime.fromtimestamp(
                subscription.get("current_period_end", int(datetime.now(timezone.utc).timestamp())),
                tz=timezone.utc
            ).isoformat(),
            "cancel_at_period_end": subscription.get("cancel_at_period_end", False),
            "updated_at": datetime.now(timezone.utc).isoformat()
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
            await invalidate_user_quota_cache(user_id)

        logger.info(f"Subscription updated: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription: {e}")
        raise


async def handle_subscription_deleted(subscription: Dict[str, Any]):
    """Handle subscription cancellation."""
    stripe_subscription_id = subscription["id"]

    if not supabase_client:
        return

    try:
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        if result.data and len(result.data) > 0:
            user_id = result.data[0].get("user_id")
            if user_id:
                await invalidate_user_quota_cache(user_id)

        logger.info(f"Subscription cancelled: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")


async def handle_payment_failed(invoice: Dict[str, Any]):
    """Handle failed payment."""
    stripe_subscription_id = invoice["subscription"]

    if not supabase_client:
        return

    try:
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "past_due",
                "updated_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        if result.data and len(result.data) > 0:
            user_id = result.data[0].get("user_id")
            if user_id:
                await invalidate_user_quota_cache(user_id)

        logger.info(f"Subscription marked as past_due: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription status: {e}")


async def handle_recruiter_checkout(session: Dict[str, Any]):
    """Handle successful recruiter request payment."""
    request_id = session["metadata"].get("request_id")

    if not request_id:
        logger.warning("Recruiter checkout missing request_id")
        return

    if not supabase_client:
        return

    try:
        supabase_client.table("recruiter_requests")\
            .update({
                "payment_status": "paid",
                "payment_intent_id": session.get("payment_intent"),
            })\
            .eq("id", request_id)\
            .execute()

        logger.info(f"Recruiter request marked as paid: {request_id}")

        # Fetch request details for email
        request_response = supabase_client.table("recruiter_requests")\
            .select("*")\
            .eq("id", request_id)\
            .execute()

        if request_response.data:
            request_data = request_response.data[0]
            send_recruiter_request_confirmation(
                to_email=request_data["email"],
                full_name=request_data["full_name"],
                sector=request_data["sector"],
                experience_level=request_data["experience_level"],
            )
            logger.info(f"Confirmation email sent for request: {request_id}")

    except Exception as e:
        logger.error(f"Failed to process recruiter checkout: {e}")
