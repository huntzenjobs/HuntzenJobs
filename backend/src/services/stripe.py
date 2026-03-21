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
from datetime import UTC, datetime
from typing import Any, Literal

import stripe
from fastapi import HTTPException
from structlog import get_logger
from supabase import Client, create_client

from src.services.admin_alerts import send_admin_alert
from src.services.user_events import log_event

logger = get_logger(__name__)

async def invalidate_user_quota_cache(user_id: str) -> bool:
    """Invalidate Redis auth_me cache for a user so /api/auth/me returns fresh data."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            deleted = await redis.delete(f"auth_me:{user_id}")
            return deleted > 0
    except Exception as e:
        logger.warning(f"[cache] invalidate_user_quota_cache failed for {user_id}: {e}")
    return False

# Import email service for recruiter confirmations and payment emails
try:
    from src.services.email import (
        send_payment_confirmation_email,
        send_payment_failed_email,
        send_recruiter_request_confirmation,
        send_subscription_cancelled_email,
    )
except ImportError:
    logger.warning("Could not import email functions - email notifications disabled")
    def send_recruiter_request_confirmation(*args, **kwargs):
        logger.warning("Email notification skipped (service not available)")
    def send_payment_confirmation_email(*args, **kwargs):
        logger.warning("Email notification skipped (service not available)")
    def send_payment_failed_email(*args, **kwargs):
        logger.warning("Email notification skipped (service not available)")
    def send_subscription_cancelled_email(*args, **kwargs):
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
    supabase_client: Client | None = None
else:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    logger.info("Supabase client initialized for Stripe integration")


# Plan hierarchy for upgrade/downgrade detection
PLAN_HIERARCHY = {"free": 0, "starter": 1, "pro": 2, "premium": 3}


# ============================================
# HELPER: Get active subscription
# ============================================

async def get_active_subscription(user_id: str) -> dict[str, Any] | None:
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


async def _get_billing_period_from_price_id(price_id: str) -> str | None:
    """Look up billing period (monthly/yearly) for a Stripe price ID."""
    if not supabase_client or not price_id:
        return None
    try:
        response = supabase_client.table("stripe_prices")\
            .select("billing_period")\
            .eq("stripe_price_id", price_id)\
            .maybe_single()\
            .execute()
        return response.data["billing_period"] if response.data else None
    except Exception as e:
        logger.warning(f"Could not determine billing period for price {price_id}: {e}")
        return None


async def _get_or_create_stripe_customer(user_email: str) -> str | None:
    """Return existing Stripe customer ID or None (let Stripe create one at checkout)."""
    try:
        customers = stripe.Customer.list(email=user_email, limit=1)
        return customers.data[0].id if customers.data else None
    except Exception as e:
        logger.warning(f"Could not fetch Stripe customer: {e}")
        return None


# ============================================
# CREATE CHECKOUT SESSION — SMART ROUTING
# ============================================

async def create_checkout_session(
    user_id: str,
    user_email: str,
    plan_name: Literal["starter", "pro", "premium"],
    billing_period: Literal["monthly", "yearly"],
    success_url: str,
    cancel_url: str
) -> dict[str, Any]:
    """
    Create or modify a Stripe subscription with smart routing:

    - No existing sub          → New Stripe Checkout (first-time)
    - Upgrade (any → higher)   → stripe.Subscription.modify() + immediate proration
    - Downgrade (any → lower)  → stripe.Subscription.modify() at period end (no charge)
    - Monthly → Annual         → Cancel monthly + new annual Checkout
    - Annual → Monthly         → BLOCKED (only allowed at renewal)
    - Same plan + period       → Return already_subscribed
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        # 1. Verify user exists
        user_check = supabase_client.table("profiles")\
            .select("id")\
            .eq("id", user_id)\
            .execute()
        if not user_check.data:
            raise HTTPException(status_code=400, detail="User not found. Please logout and login again.")

        # 2. Get target price ID
        price_response = supabase_client.rpc("get_stripe_price_id", {
            "p_plan_name": plan_name,
            "p_billing_period": billing_period
        }).execute()
        if not price_response.data:
            raise HTTPException(status_code=404, detail=f"Price not found for {plan_name}/{billing_period}")
        new_price_id = price_response.data

        # 3. Check existing subscription
        existing = await get_active_subscription(user_id)

        # ── No existing subscription → first-time checkout ──────────────────
        if not existing:
            return await _create_new_checkout(
                user_email=user_email,
                price_id=new_price_id,
                user_id=user_id,
                plan_name=plan_name,
                billing_period=billing_period,
                success_url=success_url,
                cancel_url=cancel_url
            )

        # ── Has existing subscription → determine change type ────────────────
        current_plan = (existing.get("subscription_plans") or {}).get("name", "free")
        current_stripe_sub_id = existing.get("stripe_subscription_id", "")
        current_price_id = existing.get("stripe_price_id", "")
        current_billing = await _get_billing_period_from_price_id(current_price_id) or "monthly"

        # Same plan, same billing period → nothing to do
        if current_plan == plan_name and current_billing == billing_period:
            return {"success": True, "already_subscribed": True, "plan_name": plan_name}

        is_real_stripe_sub = (
            current_stripe_sub_id.startswith("sub_") and
            len(current_stripe_sub_id) > 20
        )

        # ── BLOCK: Annual → Monthly (mid-year downgrade of billing period) ──
        if current_billing == "yearly" and billing_period == "monthly":
            # Retrieve actual period end from Stripe for accurate messaging
            period_end_display = existing.get("current_period_end", "")
            raise HTTPException(
                status_code=400,
                detail=f"ANNUAL_TO_MONTHLY_BLOCKED|{period_end_display}"
            )

        current_rank = PLAN_HIERARCHY.get(current_plan, 0)
        target_rank = PLAN_HIERARCHY.get(plan_name, 0)
        is_upgrade = target_rank > current_rank
        is_downgrade = target_rank < current_rank

        # ── Monthly → Annual: schedule end-of-period cancel, then new annual checkout ──────
        # Safe order: schedule cancel BEFORE creating checkout.
        # If user abandons checkout, monthly sub stays active (no loss).
        # When checkout.session.completed fires, webhook creates the annual sub
        # and DB trigger auto-cancels the old monthly.
        if current_billing == "monthly" and billing_period == "yearly":
            if is_real_stripe_sub:
                try:
                    stripe.Subscription.modify(
                        current_stripe_sub_id,
                        cancel_at_period_end=True,
                    )
                    logger.info(f"[CHECKOUT] Scheduled monthly sub {current_stripe_sub_id} for end-of-period cancel (annual upgrade)")
                except Exception as e:
                    logger.warning(f"[CHECKOUT] Could not schedule monthly sub cancellation: {e}")
            return await _create_new_checkout(
                user_email=user_email,
                price_id=new_price_id,
                user_id=user_id,
                plan_name=plan_name,
                billing_period=billing_period,
                success_url=success_url,
                cancel_url=cancel_url
            )

        # ── Same billing period: upgrade or downgrade via Subscription.modify ──
        if not is_real_stripe_sub:
            # Fake/manual subscription — fall back to new checkout
            logger.warning(f"[CHECKOUT] Non-Stripe sub ID {current_stripe_sub_id}, using checkout")
            return await _create_new_checkout(
                user_email=user_email,
                price_id=new_price_id,
                user_id=user_id,
                plan_name=plan_name,
                billing_period=billing_period,
                success_url=success_url,
                cancel_url=cancel_url
            )

        if is_upgrade:
            return await _upgrade_subscription(
                stripe_sub_id=current_stripe_sub_id,
                new_price_id=new_price_id,
                plan_name=plan_name,
                billing_period=billing_period
            )

        if is_downgrade:
            return await _schedule_downgrade(
                stripe_sub_id=current_stripe_sub_id,
                new_price_id=new_price_id,
                plan_name=plan_name,
                billing_period=billing_period
            )

        # Fallback (same rank, different billing — shouldn't reach here)
        return await _create_new_checkout(
            user_email=user_email,
            price_id=new_price_id,
            user_id=user_id,
            plan_name=plan_name,
            billing_period=billing_period,
            success_url=success_url,
            cancel_url=cancel_url
        )

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"[CHECKOUT] Stripe API error: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"[CHECKOUT] Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Checkout failed: {str(e)}")


async def _create_new_checkout(
    user_email: str,
    price_id: str,
    user_id: str,
    plan_name: str,
    billing_period: str,
    success_url: str,
    cancel_url: str
) -> dict[str, Any]:
    """Create a brand-new Stripe Checkout session."""
    customer_id = await _get_or_create_stripe_customer(user_email)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        customer_email=user_email if not customer_id else None,
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
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
    logger.info(f"[CHECKOUT] New checkout created: {session.id} for {plan_name}/{billing_period}")
    return {"success": True, "checkout_url": session.url, "session_id": session.id}


async def _upgrade_subscription(
    stripe_sub_id: str,
    new_price_id: str,
    plan_name: str,
    billing_period: str
) -> dict[str, Any]:
    """
    Upgrade an existing subscription immediately with Stripe proration.
    - Charges the difference right now
    - Keeps the same billing cycle anchor (renewal date unchanged)
    """
    stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
    item_id = stripe_sub["items"]["data"][0]["id"]

    stripe.Subscription.modify(
        stripe_sub_id,
        items=[{"id": item_id, "price": new_price_id}],
        proration_behavior="always_invoice",   # Charge difference immediately
        billing_cycle_anchor="unchanged",       # Keep same renewal date
    )
    logger.info(f"[CHECKOUT] Upgraded subscription {stripe_sub_id} to {plan_name}/{billing_period} with proration")
    return {
        "success": True,
        "modified": True,
        "immediate": True,
        "plan_name": plan_name,
        "billing_period": billing_period,
        "message": f"Plan upgraded to {plan_name}. The difference has been charged immediately."
    }


async def _schedule_downgrade(
    stripe_sub_id: str,
    new_price_id: str,
    plan_name: str,
    billing_period: str
) -> dict[str, Any]:
    """
    Schedule a downgrade at the end of the current billing period.
    - No immediate charge
    - No credit issued
    - User keeps current plan until renewal, then switches
    """
    stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
    item_id = stripe_sub["items"]["data"][0]["id"]
    period_end = stripe_sub.get("current_period_end", 0)

    stripe.Subscription.modify(
        stripe_sub_id,
        items=[{"id": item_id, "price": new_price_id}],
        proration_behavior="none",            # No proration, no credit
        billing_cycle_anchor="unchanged",     # Keep same renewal date
    )

    period_end_dt = datetime.fromtimestamp(period_end, tz=UTC).isoformat() if period_end else None
    logger.info(f"[CHECKOUT] Downgrade scheduled for {stripe_sub_id} → {plan_name}/{billing_period} at period end")
    return {
        "success": True,
        "modified": True,
        "immediate": False,
        "plan_name": plan_name,
        "billing_period": billing_period,
        "effective_date": period_end_dt,
        "message": f"Plan will switch to {plan_name} at next renewal. You keep your current plan until then."
    }


# ============================================
# WEBHOOK HANDLING - SIMPLE VERSION
# ============================================

async def handle_stripe_webhook(
    payload: bytes,
    signature: str
) -> dict[str, str]:
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
        logger.error("STRIPE_WEBHOOK_SECRET not configured - rejecting webhook to prevent security bypass")
        raise HTTPException(status_code=500, detail="Stripe webhook secret not configured")
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

async def handle_checkout_completed(session: dict[str, Any]):
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
        error_msg = "Missing user_id or plan_name in checkout metadata"
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
                stripe_subscription.get("current_period_start", int(datetime.now(UTC).timestamp())),
                tz=UTC
            ).isoformat(),
            "current_period_end": datetime.fromtimestamp(
                stripe_subscription.get("current_period_end", int(datetime.now(UTC).timestamp()) + 2592000),  # +30 days
                tz=UTC
            ).isoformat(),
            "cancel_at_period_end": stripe_subscription.get("cancel_at_period_end", False),
            "updated_at": datetime.now(UTC).isoformat()
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
                    "canceled_at": datetime.now(UTC).isoformat(),
                    "updated_at": datetime.now(UTC).isoformat()
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


        # Email de confirmation de paiement
        amount_str = ""
        try:
            amount_cents = stripe_subscription["items"]["data"][0]["price"].get("unit_amount", 0)
            amount_str = f" ({amount_cents // 100}€/mois)" if amount_cents else ""
            if amount_cents:
                user_email = session.get("customer_email") or ""
                if not user_email:
                    try:
                        cust = stripe.Customer.retrieve(stripe_customer_id)
                        user_email = cust.get("email", "")
                    except Exception:
                        pass
                if user_email:
                    amount_display = f"{amount_cents / 100:.2f} EUR"
                    send_payment_confirmation_email(
                        user_email=user_email,
                        plan_name=plan_name,
                        amount=amount_display,
                    )
        except Exception as email_err:
            logger.warning(f"[WEBHOOK] Payment confirmation email failed (non-fatal): {email_err}")
        log_event(
            supabase_client,
            event_name="subscription_created",
            event_label=f"Un utilisateur vient de passer au plan {plan_name}{amount_str} 🎉",
            category="payment",
            user_id=user_id,
            feature="stripe",
            severity="success",
            properties={"plan_name": plan_name, "stripe_subscription_id": stripe_subscription_id},
        )

        # Alerte admin conversion (best-effort)
        await send_admin_alert(
            subject=f"Nouvelle conversion — {plan_name}",
            body=f"User {user_id} vient de passer au plan {plan_name}.\nStripe sub: {stripe_subscription_id}",
            severity="info",
        )

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
                    "converted_to_paid_at": datetime.now(UTC).isoformat(),
                    "converted_plan": plan_name,
                }).eq("id", signup["id"]).execute()
                supabase_client.rpc(
                    "increment_referral_conversions",
                    {"p_referral_id": str(signup["referral_id"])}
                ).execute()
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


async def handle_subscription_updated(subscription: dict[str, Any]):
    """Handle subscription updates (renewals, plan changes via modify)."""
    stripe_subscription_id = subscription["id"]

    if not supabase_client:
        return

    try:
        new_price_id = subscription["items"]["data"][0]["price"]["id"]

        update_data = {
            "status": subscription["status"],
            "stripe_price_id": new_price_id,
            "current_period_start": datetime.fromtimestamp(
                subscription.get("current_period_start", int(datetime.now(UTC).timestamp())),
                tz=UTC
            ).isoformat(),
            "current_period_end": datetime.fromtimestamp(
                subscription.get("current_period_end", int(datetime.now(UTC).timestamp())),
                tz=UTC
            ).isoformat(),
            "cancel_at_period_end": subscription.get("cancel_at_period_end", False),
            "updated_at": datetime.now(UTC).isoformat()
        }

        # Resolve plan_id from the new price ID (handles upgrades/downgrades via Subscription.modify)
        price_row = None
        try:
            price_row = supabase_client.table("stripe_prices")\
                .select("plan_id")\
                .eq("stripe_price_id", new_price_id)\
                .maybe_single()\
                .execute()
            if price_row.data and price_row.data.get("plan_id"):
                update_data["plan_id"] = price_row.data["plan_id"]
                logger.info(f"[WEBHOOK] Resolved plan_id for price {new_price_id}")
        except Exception as e:
            logger.warning(f"[WEBHOOK] Could not resolve plan_id from price {new_price_id}: {e}")

        supabase_client.table("user_subscriptions")\
            .update(update_data)\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        # Get user_id for cache invalidation
        user_subscription = supabase_client.table("user_subscriptions")\
            .select("user_id")\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .maybe_single()\
            .execute()

        if user_subscription.data:
            user_id = user_subscription.data["user_id"]
            await invalidate_user_quota_cache(user_id)

            # Email d'annulation si cancel_at_period_end vient de passer a True
            if subscription.get("cancel_at_period_end", False):
                try:
                    customer_id = subscription.get("customer")
                    if customer_id:
                        cust = stripe.Customer.retrieve(customer_id)
                        user_email = cust.get("email", "")
                        if user_email:
                            # Resoudre le nom du plan
                            plan_display = "Pro"
                            if price_row and price_row.data and price_row.data.get("plan_id"):
                                plan_row = supabase_client.table("subscription_plans") \
                                    .select("display_name") \
                                    .eq("id", price_row.data["plan_id"]) \
                                    .maybe_single() \
                                    .execute()
                                if plan_row.data:
                                    plan_display = plan_row.data.get("display_name", plan_display)
                            period_end = subscription.get("current_period_end", 0)
                            end_date = datetime.fromtimestamp(
                                period_end, tz=UTC
                            ).strftime("%d/%m/%Y") if period_end else ""
                            send_subscription_cancelled_email(
                                user_email=user_email,
                                plan_name=plan_display,
                                end_date=end_date,
                            )
                except Exception as email_err:
                    logger.warning(f"[WEBHOOK] Cancellation email error (non-fatal): {email_err}")

        logger.info(f"Subscription updated: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription: {e}")
        raise


async def handle_subscription_deleted(subscription: dict[str, Any]):
    """Handle subscription cancellation."""
    stripe_subscription_id = subscription["id"]

    if not supabase_client:
        return

    try:
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "canceled",
                "canceled_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        if result.data and len(result.data) > 0:
            user_id = result.data[0].get("user_id")
            if user_id:
                await invalidate_user_quota_cache(user_id)
                log_event(
                    supabase_client,
                    event_name="subscription_cancelled",
                    event_label="Un utilisateur a annulé son abonnement",
                    category="payment",
                    user_id=user_id,
                    feature="stripe",
                    severity="warning",
                    properties={"stripe_subscription_id": stripe_subscription_id},
                )
                await send_admin_alert(
                    subject="Résiliation abonnement",
                    body=f"User {user_id} a annulé.\nStripe sub: {stripe_subscription_id}",
                    severity="warning",
                )

        logger.info(f"Subscription cancelled: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise


async def handle_payment_failed(invoice: dict[str, Any]):
    """Handle failed payment."""
    stripe_subscription_id = invoice["subscription"]

    if not supabase_client:
        return

    try:
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "past_due",
                "updated_at": datetime.now(UTC).isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        if result.data and len(result.data) > 0:
            user_id = result.data[0].get("user_id")
            if user_id:
                await invalidate_user_quota_cache(user_id)

                # Notification in-app (synchrone)
                from src.services.notifications import create_notification
                create_notification(
                    supabase_client,
                    user_id=user_id,
                    type="payment_failed",
                    title="Paiement échoué",
                    body="Votre paiement a échoué. Veuillez mettre à jour votre moyen de paiement pour conserver votre abonnement.",
                )

                # Email de paiement echoue
                try:
                    customer_id = invoice.get("customer")
                    if customer_id:
                        cust = stripe.Customer.retrieve(customer_id)
                        user_email = cust.get("email", "")
                        if user_email:
                            send_payment_failed_email(user_email=user_email)
                except Exception as email_err:
                    logger.warning(f"[WEBHOOK] Payment failed email error (non-fatal): {email_err}")

        logger.info(f"Subscription marked as past_due: {stripe_subscription_id}")

    except Exception as e:
        logger.error(f"Failed to update subscription status: {e}")
        raise


async def handle_recruiter_checkout(session: dict[str, Any]):
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
