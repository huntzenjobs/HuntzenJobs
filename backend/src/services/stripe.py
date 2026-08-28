"""
Stripe Payment Integration Service
==================================

Stripe reste la source de vérité et Supabase en conserve une projection.

Handles:
1. Create checkout sessions (subscriptions)
2. Process webhooks (copy Stripe data to DB)
3. Update user subscriptions

Author: HuntZen Team
Date: 2026-02-11
Les webhooks utilisent un verrou d'idempotence atomique dans Supabase.
"""

import os
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import stripe
from fastapi import HTTPException, status
from structlog import get_logger
from supabase import Client, create_client

from src.services.admin_alerts import send_admin_alert
from src.services.email import (
    send_payment_confirmation_email,
    send_payment_failed_email,
    send_recruiter_request_confirmation,
    send_recruiter_request_notification,
    send_subscription_cancelled_email,
)
from src.services.user_events import log_event

logger = get_logger(__name__)


def _stripe_value(payload: Any, key: str, default: Any = None) -> Any:
    """Lire un champ depuis un dictionnaire ou un objet Stripe."""
    if isinstance(payload, dict):
        return payload.get(key, default)
    return getattr(payload, key, default)


def _valid_stripe_timestamp(value: Any) -> int | None:
    """Normaliser un timestamp Stripe positif, sinon signaler une valeur absente."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return None
    return int(value)


def extract_subscription_period(subscription: Any) -> tuple[int, int]:
    """Extraire la période Stripe Clover, avec compatibilité des anciens événements."""
    items = _stripe_value(subscription, "items", {})
    item_data = _stripe_value(items, "data", []) or []
    current_item = item_data[0] if item_data else {}

    period_start = _valid_stripe_timestamp(
        _stripe_value(current_item, "current_period_start")
    )
    period_end = _valid_stripe_timestamp(
        _stripe_value(current_item, "current_period_end")
    )

    if period_start is None or period_end is None:
        period_start = _valid_stripe_timestamp(
            _stripe_value(subscription, "current_period_start")
        )
        period_end = _valid_stripe_timestamp(
            _stripe_value(subscription, "current_period_end")
        )

    if period_start is None or period_end is None:
        raise ValueError("période Stripe absente ou invalide")

    return period_start, period_end


def _stripe_resource_id(resource: Any) -> str | None:
    """Retourner l'identifiant d'une ressource Stripe chaîne ou développée."""
    if isinstance(resource, str):
        return resource or None
    resource_id = _stripe_value(resource, "id")
    return resource_id if isinstance(resource_id, str) and resource_id else None


def _extract_invoice_subscription_id(invoice: Any) -> str | None:
    """Extraire l'abonnement d'une facture Clover ou d'un événement historique."""
    parent = _stripe_value(invoice, "parent")
    subscription_details = _stripe_value(parent, "subscription_details", {})
    subscription = _stripe_value(subscription_details, "subscription")
    subscription_id = _stripe_resource_id(subscription)
    if subscription_id:
        return subscription_id

    return _stripe_resource_id(_stripe_value(invoice, "subscription"))


def _normalize_subscription_status(status: Any) -> str:
    """Mapper les statuts Stripe vers la contrainte locale explicite."""
    if not isinstance(status, str):
        raise RuntimeError("Stripe subscription status missing")
    if status in {"active", "canceled", "past_due", "paused", "trialing", "incomplete"}:
        return status
    if status == "unpaid":
        return "past_due"
    if status == "incomplete_expired":
        return "canceled"
    raise RuntimeError(f"Unsupported Stripe subscription status: {status}")


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

# ============================================
# CONFIGURATION
# ============================================

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
stripe.default_http_client = stripe.RequestsClient(timeout=60)
stripe.max_network_retries = 1
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


# ============================================
# HELPER: Get active subscription
# ============================================

async def get_active_subscription(user_id: str) -> dict[str, Any] | None:
    """Get the user's current Stripe-manageable subscription from database."""
    if not supabase_client:
        raise RuntimeError("Supabase client unavailable")

    try:
        response = supabase_client.table("user_subscriptions")\
            .select("*, subscription_plans(name)")\
            .eq("user_id", user_id)\
            .in_("status", ["active", "past_due", "trialing"])\
            .order("created_at", desc=True)\
            .limit(1)\
            .maybe_single()\
            .execute()

        return response.data if response.data else None
    except Exception as exc:
        logger.error(
            "Failed to get active subscription",
            error_type=type(exc).__name__,
        )
        raise


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
    - Existing Stripe sub      → Stripe Billing Portal confirmation flow
    - Upgrade / downgrade      → Stripe handles payment, SCA and configured timing
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
        try:
            price_response = supabase_client.rpc("get_stripe_price_id", {
                "p_plan_name": plan_name,
                "p_billing_period": billing_period
            }).execute()
            if not price_response.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No Stripe price configured for plan={plan_name}, period={billing_period}. Check stripe_prices table."
                )
            # Extract price_id robustly (Supabase RPC may return string, list, or dict)
            raw_price = price_response.data
            if isinstance(raw_price, (list, tuple)):
                new_price_id = raw_price[0] if raw_price else None
            elif isinstance(raw_price, str):
                new_price_id = raw_price
            else:
                new_price_id = str(raw_price) if raw_price else None

            if not new_price_id or not isinstance(new_price_id, str):
                logger.error(f"[CHECKOUT] Invalid price_id type={type(raw_price).__name__} value={raw_price}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Invalid price configuration for {plan_name}/{billing_period}. Contact support."
                )

            logger.info(f"[STRIPE] Resolved price_id={new_price_id} for {plan_name}/{billing_period}")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[CHECKOUT] RPC get_stripe_price_id failed for {plan_name}/{billing_period}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Price lookup failed for {plan_name}/{billing_period}. Contact support."
            ) from None

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
        current_stripe_sub_id = existing.get("stripe_subscription_id") or ""

        # Les droits accordés manuellement ne sont pas des abonnements Stripe.
        # Ils ne doivent jamais empêcher une souscription payante normale.
        if not current_stripe_sub_id.startswith("sub_"):
            logger.info(f"[CHECKOUT] User {user_id} has DB subscription without Stripe ID — creating new checkout")
            return await _create_new_checkout(
                user_email=user_email,
                price_id=new_price_id,
                user_id=user_id,
                plan_name=plan_name,
                billing_period=billing_period,
                success_url=success_url,
                cancel_url=cancel_url
            )

        # Stripe reste la source de vérité : le prix, le client et l'item sont
        # lus directement sur l'abonnement au lieu de la projection locale.
        stripe_subscription = stripe.Subscription.retrieve(current_stripe_sub_id)
        subscription_items = _stripe_value(
            _stripe_value(stripe_subscription, "items", {}),
            "data",
            [],
        ) or []
        subscription_item_id = (
            _stripe_resource_id(subscription_items[0])
            if subscription_items
            else None
        )
        if not subscription_item_id:
            raise RuntimeError("Stripe subscription item missing")

        current_price_id = _stripe_resource_id(
            _stripe_value(subscription_items[0], "price")
        )
        if current_price_id == new_price_id:
            return {
                "success": True,
                "already_subscribed": True,
                "plan_name": plan_name,
            }

        customer_id = _stripe_resource_id(
            _stripe_value(stripe_subscription, "customer")
        )
        if not customer_id:
            raise RuntimeError("Stripe subscription customer missing")

        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=cancel_url,
            flow_data={
                "type": "subscription_update_confirm",
                "subscription_update_confirm": {
                    "subscription": current_stripe_sub_id,
                    "items": [
                        {"id": subscription_item_id, "price": new_price_id}
                    ],
                },
                "after_completion": {
                    "type": "redirect",
                    "redirect": {"return_url": cancel_url},
                },
            },
        )
        logger.info(
            "[CHECKOUT] Stripe portal update flow created",
            extra={
                "subscription_id": current_stripe_sub_id,
                "target_plan": plan_name,
                "target_billing_period": billing_period,
            },
        )
        return {
            "success": True,
            "checkout_url": portal_session.url,
            "session_id": portal_session.id,
            "portal": True,
        }

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(
            "[CHECKOUT] Stripe API error",
            extra={"error_type": type(e).__name__},
        )
        raise HTTPException(
            status_code=502,
            detail="Le service de paiement est temporairement indisponible",
        ) from None
    except Exception as e:
        logger.error(
            "[CHECKOUT] Failed",
            extra={"error_type": type(e).__name__},
        )
        raise HTTPException(
            status_code=500,
            detail="Impossible de démarrer le paiement",
        ) from None


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

    # Check for unused promo code with Stripe coupon
    promo_coupon_id = None
    promo_link_id = None
    if user_id and supabase_client:
        try:
            promo_result = supabase_client.table("user_promo_codes").select(
                "id, promo_code_id, applied_at"
            ).eq("user_id", user_id).is_("used_at", "null").order(
                "applied_at", desc=True
            ).limit(20).execute()

            if promo_result.data:
                for promo_link in promo_result.data:
                    promo_detail = supabase_client.table("promo_codes").select(
                        "stripe_coupon_id,is_active,starts_at,expires_at,plan,"
                        "max_uses,current_uses"
                    ).eq(
                        "id", promo_link["promo_code_id"]
                    ).maybe_single().execute()
                    promo = (
                        promo_detail.data
                        if isinstance(promo_detail.data, dict)
                        else {}
                    )
                    if not promo.get("stripe_coupon_id"):
                        continue
                    now = datetime.now(UTC)
                    starts_at = promo.get("starts_at")
                    expires_at = promo.get("expires_at")
                    starts = (
                        datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
                        if isinstance(starts_at, str)
                        else None
                    )
                    expires = (
                        datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                        if isinstance(expires_at, str)
                        else None
                    )
                    max_uses = promo.get("max_uses")
                    current_uses = promo.get("current_uses", 0)
                    if (
                        promo.get("is_active") is not True
                        or (starts is not None and starts > now)
                        or (expires is not None and expires <= now)
                        or (promo.get("plan") not in (None, plan_name))
                        or (
                            isinstance(max_uses, int)
                            and isinstance(current_uses, int)
                            and current_uses > max_uses
                        )
                    ):
                        continue
                    promo_link_id = promo_link["id"]
                    promo_coupon_id = promo["stripe_coupon_id"]
                    logger.info("[CHECKOUT] Valid promo coupon found")
                    break
        except Exception as e:
            logger.error(
                "[CHECKOUT] Failed to validate promo code",
                extra={"error_type": type(e).__name__},
            )
            raise HTTPException(
                status_code=500,
                detail="Impossible de valider le code promotionnel",
            ) from None

    # Build checkout session params
    checkout_params: dict[str, Any] = {
        "customer": customer_id,
        "customer_email": user_email if not customer_id else None,
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {
            "user_id": user_id,
            "plan_name": plan_name,
            "billing_period": billing_period,
        },
        "subscription_data": {
            "metadata": {
                "user_id": user_id,
                "plan_name": plan_name,
            }
        },
    }

    # Apply promo coupon discount if found
    if promo_coupon_id:
        checkout_params["discounts"] = [{"coupon": promo_coupon_id}]
        checkout_params["metadata"]["promo_link_id"] = promo_link_id

    if not supabase_client:
        raise HTTPException(
            status_code=503,
            detail="Le service de paiement est temporairement indisponible",
        )

    selection_key = ":".join(
        (plan_name, billing_period, str(promo_link_id or "no-promo"))
    )

    def _reservation_data(result: Any) -> dict[str, Any]:
        data = result.data
        if isinstance(data, list):
            data = data[0] if data else None
        if not isinstance(data, dict):
            raise RuntimeError("Invalid checkout reservation response")
        return data

    reservation = _reservation_data(
        supabase_client.rpc(
            "claim_subscription_checkout",
            {
                "p_user_id": user_id,
                "p_selection_key": selection_key,
                "p_plan_name": plan_name,
                "p_price_id": price_id,
            },
        ).execute()
    )
    if reservation.get("action") == "busy":
        raise HTTPException(
            status_code=409,
            detail="Une session de paiement est déjà en cours de création",
        )
    if reservation.get("action") == "selection_conflict":
        raise HTTPException(
            status_code=409,
            detail=(
                "Une tentative de paiement précédente doit être reprise "
                "avant de changer d'offre"
            ),
        )

    if reservation.get("action") == "reuse":
        existing_session_id = reservation.get("session_id")
        if not isinstance(existing_session_id, str) or not existing_session_id:
            raise RuntimeError("Checkout reservation missing session ID")
        try:
            existing_session = stripe.checkout.Session.retrieve(
                existing_session_id
            )
        except stripe.error.StripeError as e:
            logger.error(
                "[CHECKOUT] Existing Stripe session lookup failed",
                extra={"error_type": type(e).__name__},
            )
            raise HTTPException(
                status_code=502,
                detail="Stripe est temporairement indisponible",
            ) from None
        existing_status = _stripe_value(existing_session, "status")
        existing_url = _stripe_value(existing_session, "url")
        if existing_status == "open" and isinstance(existing_url, str):
            return {
                "success": True,
                "checkout_url": existing_url,
                "session_id": existing_session_id,
            }
        if existing_status == "complete":
            raise HTTPException(
                status_code=409,
                detail="Ce paiement est déjà en cours de confirmation",
            )
        invalidated = supabase_client.rpc(
            "invalidate_subscription_checkout",
            {"p_user_id": user_id, "p_session_id": existing_session_id},
        ).execute()
        if invalidated.data is not True:
            raise RuntimeError("Checkout reservation invalidation failed")
        reservation = _reservation_data(
            supabase_client.rpc(
                "claim_subscription_checkout",
                {
                    "p_user_id": user_id,
                    "p_selection_key": selection_key,
                    "p_plan_name": plan_name,
                    "p_price_id": price_id,
                },
            ).execute()
        )

    action = reservation.get("action")
    claim_token = reservation.get("claim_token")
    if action not in ("create", "replace") or not isinstance(claim_token, str):
        raise RuntimeError("Invalid checkout reservation claim")

    previous_session_id = reservation.get("previous_session_id")
    if action == "replace" and isinstance(previous_session_id, str):
        try:
            previous_session = stripe.checkout.Session.retrieve(
                previous_session_id
            )
            previous_status = _stripe_value(previous_session, "status")
            if previous_status == "open":
                stripe.checkout.Session.expire(previous_session_id)
            elif previous_status == "complete":
                raise HTTPException(
                    status_code=409,
                    detail="Un paiement précédent est en cours de confirmation",
                )
        except HTTPException:
            raise
        except stripe.error.StripeError as e:
            logger.error(
                "[CHECKOUT] Previous Stripe session could not be closed",
                extra={"error_type": type(e).__name__},
            )
            raise HTTPException(
                status_code=502,
                detail="Stripe est temporairement indisponible",
            ) from None

    checkout_params["idempotency_key"] = (
        f"subscription-checkout:{user_id}:{claim_token}"
    )
    checkout_params["metadata"]["checkout_reservation_token"] = claim_token

    try:
        session = stripe.checkout.Session.create(**checkout_params)
    except stripe.error.InvalidRequestError as e:
        logger.error(
            "[CHECKOUT] Stripe rejected checkout creation",
            extra={"error_type": type(e).__name__, "price_id": price_id},
        )
        supabase_client.rpc(
            "release_subscription_checkout",
            {"p_user_id": user_id, "p_claim_token": claim_token},
        ).execute()
        raise HTTPException(
            status_code=400,
            detail="La configuration de paiement est indisponible",
        ) from None
    except Exception as e:
        logger.error(
            "[CHECKOUT] Stripe session creation failed",
            extra={"error_type": type(e).__name__, "price_id": price_id},
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to create checkout session. Please try again or contact support."
        ) from None

    session_expires_at = _stripe_value(session, "expires_at")
    if isinstance(session_expires_at, int) and not isinstance(
        session_expires_at, bool
    ):
        expires_at = datetime.fromtimestamp(session_expires_at, UTC)
    else:
        expires_at = datetime.now(UTC) + timedelta(hours=23)
    finalized = supabase_client.rpc(
        "finalize_subscription_checkout",
        {
            "p_user_id": user_id,
            "p_claim_token": claim_token,
            "p_session_id": session.id,
            "p_expires_at": expires_at.isoformat(),
        },
    ).execute()
    if finalized.data is not True:
        raise RuntimeError("Checkout reservation finalization failed")

    logger.info(
        "[CHECKOUT] New checkout created",
        extra={"session_id": session.id, "plan": plan_name},
    )
    return {"success": True, "checkout_url": session.url, "session_id": session.id}


# ============================================
# WEBHOOK HANDLING
# ============================================

async def handle_stripe_webhook(
    payload: bytes,
    signature: str
) -> dict[str, str]:
    """
    Vérifie, réserve puis traite un événement Stripe de façon idempotente.

    Une réservation atomique empêche deux livraisons simultanées d'exécuter
    les mêmes effets. Les erreurs restent non-2xx afin que Stripe retente.
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
            raise HTTPException(status_code=400, detail="Invalid signature") from None
        except Exception as e:
            logger.error(f"Webhook parsing failed: {e}")
            raise HTTPException(status_code=400, detail="Webhook parsing failed") from None

    event_type = event["type"]
    event_id = event["id"] if "id" in event else "unknown"

    logger.info(f"[WEBHOOK] Received Stripe webhook: {event_type} (ID: {event_id})")

    # Réserver atomiquement l'événement avant tout effet métier.
    if not supabase_client:
        logger.error("[WEBHOOK] Database unavailable for idempotency check")
        raise HTTPException(status_code=503, detail="Webhook processing temporarily unavailable")

    try:
        claim = supabase_client.rpc(
            "claim_stripe_webhook_event",
            {
                "p_event_id": event_id,
                "p_event_type": event_type,
            }
        ).execute()
        claim_data = claim.data[0] if isinstance(claim.data, list) and claim.data else claim.data
        claim_status = _stripe_value(claim_data, "status")
        claim_token = _stripe_value(claim_data, "claim_token")

        if claim_status == "processed":
            logger.info(f"[WEBHOOK] Event {event_id} already processed, skipping")
            return {
                "status": "success",
                "event": event_type,
                "note": "already_processed"
            }
        if claim_status == "processing":
            logger.info(f"[WEBHOOK] Event {event_id} is already being processed")
            raise HTTPException(status_code=503, detail="Webhook event already in progress")
        if claim_status != "claimed" or not isinstance(claim_token, str):
            logger.error(f"[WEBHOOK] Unexpected claim status for {event_id}: {claim_status}")
            raise HTTPException(status_code=503, detail="Webhook claim unavailable")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[WEBHOOK] Failed to claim event {event_id}: {type(e).__name__}")
        raise HTTPException(
            status_code=503,
            detail="Webhook claim temporarily unavailable",
        ) from None

    # Handle different event types
    try:
        finalized_transactionally = False
        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            if _stripe_value(session, "payment_status") == "paid":
                finalized_transactionally = await handle_checkout_completed(
                    session,
                    event_id=event_id,
                    claim_token=claim_token,
                ) is True
            else:
                logger.warning(
                    "[WEBHOOK] Ignoring checkout completion without paid payment status",
                    extra={"event_id": event_id},
                )
        elif event_type == "checkout.session.async_payment_succeeded":
            session = event["data"]["object"]
            if _stripe_value(session, "payment_status") == "paid":
                finalized_transactionally = await handle_checkout_completed(
                    session,
                    event_id=event_id,
                    claim_token=claim_token,
                ) is True
            else:
                logger.warning(
                    "[WEBHOOK] Ignoring async checkout success without paid payment status",
                    extra={"event_id": event_id},
                )
        elif event_type == "checkout.session.async_payment_failed":
            logger.info(
                "[WEBHOOK] Async checkout payment failed; no subscription rights granted",
                extra={"event_id": event_id},
            )
        elif event_type == "customer.subscription.updated":
            finalized_transactionally = await handle_subscription_updated(
                event["data"]["object"],
                event_id=event_id,
                claim_token=claim_token,
            ) is True
        elif event_type == "customer.subscription.deleted":
            finalized_transactionally = await handle_subscription_deleted(
                event["data"]["object"],
                event_id=event_id,
                claim_token=claim_token,
            ) is True
        elif event_type in {
            "invoice.payment_failed",
            "invoice.payment_action_required",
        }:
            finalized_transactionally = await handle_payment_failed(
                event["data"]["object"],
                event_id=event_id,
                claim_token=claim_token,
            ) is True
        elif event_type == "invoice.paid":
            finalized_transactionally = await handle_invoice_paid(
                event["data"]["object"],
                event_id=event_id,
                claim_token=claim_token,
            ) is True
        elif event_type in {
            "charge.refunded",
            "charge.dispute.created",
            "charge.dispute.updated",
            "charge.dispute.closed",
        }:
            await handle_financial_review_event(
                event_type,
                event["data"]["object"],
            )
        else:
            logger.info(f"[WEBHOOK] Unhandled webhook event: {event_type}")

        if not finalized_transactionally:
            try:
                finalized = supabase_client.rpc(
                    "mark_webhook_event_processed",
                    {
                        "p_event_id": event_id,
                        "p_claim_token": claim_token,
                    },
                ).execute()
                if finalized.data is not True:
                    raise RuntimeError("webhook event finalization did not update a row")
                logger.info(f"[WEBHOOK] Marked event {event_id} as processed")
            except Exception as e:
                logger.error(
                    f"[WEBHOOK] Failed to finalize event {event_id}: {type(e).__name__}"
                )
                raise HTTPException(
                    status_code=503,
                    detail="Webhook finalization temporarily unavailable",
                ) from None

        return {"status": "success", "event": event_type}

    except Exception as e:
        try:
            supabase_client.rpc(
                "mark_webhook_event_failed",
                {
                    "p_event_id": event_id,
                    "p_claim_token": claim_token,
                    "p_error_type": type(e).__name__,
                },
            ).execute()
        except Exception as mark_error:
            logger.error(
                f"[WEBHOOK] Failed to mark event {event_id} as failed: "
                f"{type(mark_error).__name__}"
            )
        logger.error(f"Webhook processing failed: {event_type} ({type(e).__name__})")
        raise


# ============================================
# WEBHOOK HANDLERS
# ============================================

async def handle_checkout_completed(
    session: dict[str, Any],
    *,
    event_id: str | None = None,
    claim_token: str | None = None,
) -> bool:
    """Handle successful checkout - create or update subscription."""
    metadata = session["metadata"] if "metadata" in session else {}

    # Detect type based on metadata
    if "request_id" in metadata:
        return await handle_recruiter_checkout(
            session,
            event_id=event_id,
            claim_token=claim_token,
        )

    user_id = metadata.get("user_id") if isinstance(metadata, dict) else getattr(metadata, "user_id", None)
    plan_name = metadata.get("plan_name") if isinstance(metadata, dict) else getattr(metadata, "plan_name", None)
    promo_link_id = metadata.get("promo_link_id") if isinstance(metadata, dict) else getattr(metadata, "promo_link_id", None)
    checkout_reservation_token = (
        metadata.get("checkout_reservation_token")
        if isinstance(metadata, dict)
        else getattr(metadata, "checkout_reservation_token", None)
    )
    session_id = session["id"] if "id" in session else "unknown"

    if not user_id or not plan_name:
        error_msg = "Missing user_id or plan_name in checkout metadata"
        logger.error(f"[WEBHOOK] {error_msg}")

        raise HTTPException(status_code=400, detail="Missing metadata")

    stripe_subscription_id = session["subscription"] if "subscription" in session else None
    stripe_customer_id = session["customer"] if "customer" in session else None

    # 🔧 FIX: Verify subscription ID exists
    if not stripe_subscription_id:
        logger.error(f"No subscription ID in checkout session {session_id}")
        raise HTTPException(
            status_code=400,
            detail="No subscription found in checkout session"
        )

    if not supabase_client:
        logger.error("Supabase client not configured")
        raise RuntimeError("Supabase client unavailable")

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

            raise HTTPException(status_code=400, detail="User not found in database")

        logger.info(f"[WEBHOOK] User {user_id} verified successfully")

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to verify user existence: {str(e)}"
        logger.error(f"[WEBHOOK] {error_msg}")
        raise HTTPException(status_code=500, detail="User verification failed") from None

    try:
        plan_id = None
        if not checkout_reservation_token:
            plan_response = supabase_client.table("subscription_plans")\
                .select("id")\
                .eq("name", plan_name)\
                .maybe_single()\
                .execute()

            if not plan_response.data:
                logger.error(f"[WEBHOOK] Plan not found in DB: {plan_name}")
                raise RuntimeError(f"Plan Stripe introuvable: {plan_name}")

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
            ) from None

        period_start, period_end = extract_subscription_period(stripe_subscription)

        if not event_id or not claim_token:
            raise RuntimeError("Checkout webhook transaction context missing")

        result = supabase_client.rpc(
            "apply_stripe_checkout_completed",
            {
                "p_event_id": event_id,
                "p_claim_token": claim_token,
                "p_user_id": user_id,
                "p_plan_id": plan_id,
                "p_plan_name": plan_name,
                "p_subscription_status": _normalize_subscription_status(
                    getattr(stripe_subscription, "status", None)
                ),
                "p_subscription_id": stripe_subscription_id,
                "p_customer_id": stripe_customer_id,
                "p_price_id": stripe_subscription["items"]["data"][0]["price"]["id"],
                "p_period_start": datetime.fromtimestamp(
                    period_start,
                    tz=UTC,
                ).isoformat(),
                "p_period_end": datetime.fromtimestamp(
                    period_end,
                    tz=UTC,
                ).isoformat(),
                "p_cancel_at_period_end": bool(
                    getattr(stripe_subscription, "cancel_at_period_end", False)
                ),
                "p_promo_link_id": promo_link_id,
                "p_checkout_session_id": session_id,
                "p_checkout_reservation_token": checkout_reservation_token,
            },
        ).execute()
        result_data = (
            result.data[0]
            if isinstance(result.data, list) and result.data
            else result.data
        )
        if _stripe_value(result_data, "finalized") is not True:
            raise RuntimeError("Stripe checkout transaction failed")

        await invalidate_user_quota_cache(user_id)
        return True

    except Exception as e:
        logger.error(f"Failed to update subscription in database: {e}")
        raise


async def handle_subscription_updated(
    subscription: dict[str, Any],
    *,
    event_id: str | None = None,
    claim_token: str | None = None,
) -> bool:
    """Handle subscription updates (renewals, plan changes via modify)."""
    stripe_subscription_id = subscription["id"]

    if not supabase_client:
        raise RuntimeError("Supabase client unavailable")

    try:
        new_price_id = subscription["items"]["data"][0]["price"]["id"]
        period_start, period_end = extract_subscription_period(subscription)

        if event_id is not None or claim_token is not None:
            if not event_id or not claim_token:
                raise RuntimeError("Incomplete Stripe transaction context")
            result = supabase_client.rpc(
                "apply_stripe_subscription_updated",
                {
                    "p_event_id": event_id,
                    "p_claim_token": claim_token,
                    "p_subscription_id": stripe_subscription_id,
                    "p_user_id": _stripe_value(
                        _stripe_value(subscription, "metadata", {}),
                        "user_id",
                    ),
                    "p_customer_id": _stripe_resource_id(
                        _stripe_value(subscription, "customer")
                    ),
                    "p_status": _normalize_subscription_status(
                        subscription["status"]
                    ),
                    "p_price_id": new_price_id,
                    "p_period_start": datetime.fromtimestamp(
                        period_start,
                        tz=UTC,
                    ).isoformat(),
                    "p_period_end": datetime.fromtimestamp(
                        period_end,
                        tz=UTC,
                    ).isoformat(),
                    "p_cancel_at_period_end": bool(
                        getattr(subscription, "cancel_at_period_end", False)
                    ),
                },
            ).execute()
            result_data = (
                result.data[0]
                if isinstance(result.data, list) and result.data
                else result.data
            )
            if _stripe_value(result_data, "finalized") is not True:
                raise RuntimeError("Stripe subscription update transaction failed")
            user_id = _stripe_value(result_data, "user_id")
            if isinstance(user_id, str):
                await invalidate_user_quota_cache(user_id)
            return True

        update_data = {
            "status": _normalize_subscription_status(subscription["status"]),
            "stripe_price_id": new_price_id,
            "current_period_start": datetime.fromtimestamp(
                period_start,
                tz=UTC
            ).isoformat(),
            "current_period_end": datetime.fromtimestamp(
                period_end,
                tz=UTC
            ).isoformat(),
            "cancel_at_period_end": getattr(subscription, "cancel_at_period_end", False),
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

        # Lire l'état précédent avant mutation afin de n'envoyer l'e-mail
        # d'annulation que lors de la transition false -> true.
        user_subscription = supabase_client.table("user_subscriptions")\
            .select("user_id, cancel_at_period_end")\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .maybe_single()\
            .execute()
        previous_cancel_at_period_end = bool(
            user_subscription.data
            and user_subscription.data.get("cancel_at_period_end")
        )

        updated_subscription = supabase_client.table("user_subscriptions")\
            .update(update_data)\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()
        if not updated_subscription.data:
            raise RuntimeError("Stripe subscription missing from local projection")

        if user_subscription.data:
            user_id = user_subscription.data["user_id"]
            await invalidate_user_quota_cache(user_id)

            # Email d'annulation si cancel_at_period_end vient de passer a True
            if (
                getattr(subscription, "cancel_at_period_end", False)
                and not previous_cancel_at_period_end
            ):
                try:
                    customer_id = getattr(subscription, "customer", None)
                    if customer_id:
                        cust = stripe.Customer.retrieve(customer_id)
                        user_email = getattr(cust, "email", "")
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
                            end_date = datetime.fromtimestamp(
                                period_end, tz=UTC
                            ).strftime("%d/%m/%Y")
                            send_subscription_cancelled_email(
                                user_email=user_email,
                                plan_name=plan_display,
                                end_date=end_date,
                            )
                except Exception as email_err:
                    logger.warning(f"[WEBHOOK] Cancellation email error (non-fatal): {email_err}")

        logger.info(f"Subscription updated: {stripe_subscription_id}")
        return False

    except Exception as e:
        logger.error(f"Failed to update subscription: {e}")
        raise


async def handle_subscription_deleted(
    subscription: dict[str, Any],
    *,
    event_id: str | None = None,
    claim_token: str | None = None,
) -> bool:
    """Handle subscription cancellation."""
    stripe_subscription_id = subscription["id"]

    if not supabase_client:
        raise RuntimeError("Supabase client unavailable")

    if event_id is not None or claim_token is not None:
        if not event_id or not claim_token:
            raise RuntimeError("Incomplete Stripe transaction context")
        result = supabase_client.rpc(
            "apply_stripe_subscription_deleted",
            {
                "p_event_id": event_id,
                "p_claim_token": claim_token,
                "p_subscription_id": stripe_subscription_id,
            },
        ).execute()
        result_data = (
            result.data[0]
            if isinstance(result.data, list) and result.data
            else result.data
        )
        if _stripe_value(result_data, "finalized") is not True:
            raise RuntimeError("Stripe subscription deletion transaction failed")
        user_id = _stripe_value(result_data, "user_id")
        if isinstance(user_id, str):
            await invalidate_user_quota_cache(user_id)
        return True

    try:
        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "canceled",
                "canceled_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        if not result.data:
            raise RuntimeError("Stripe subscription missing from local projection")

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
                    skip_throttle=True,
                    category="cancellation",
                )

        logger.info(f"Subscription cancelled: {stripe_subscription_id}")
        return False

    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise


async def handle_financial_review_event(
    event_type: str,
    stripe_object: dict[str, Any],
) -> bool:
    """Signaler un remboursement ou un litige sans modifier les droits client."""
    object_id = _stripe_resource_id(stripe_object) or "unknown"
    logger.warning(
        "[WEBHOOK] Financial event requires review",
        event_type=event_type,
        stripe_object_id=object_id,
    )
    await send_admin_alert(
        subject="Événement Stripe à contrôler",
        body=f"Type: {event_type}\nObjet Stripe: {object_id}",
        severity="warning",
        category="error",
        idempotency_key=f"stripe-review/{event_type}/{object_id}",
    )
    return False


async def handle_payment_failed(
    invoice: dict[str, Any],
    *,
    event_id: str | None = None,
    claim_token: str | None = None,
) -> bool:
    """Handle failed payment."""
    stripe_subscription_id = _extract_invoice_subscription_id(invoice)

    if event_id is not None or claim_token is not None:
        if not event_id or not claim_token:
            raise RuntimeError("Incomplete Stripe transaction context")
        if not supabase_client:
            raise RuntimeError("Stripe database unavailable")
        invoice_id = _stripe_value(invoice, "id")
        if not isinstance(invoice_id, str) or not invoice_id:
            raise RuntimeError("Stripe invoice ID missing")
        result = supabase_client.rpc(
            "apply_stripe_payment_failed",
            {
                "p_event_id": event_id,
                "p_claim_token": claim_token,
                "p_subscription_id": stripe_subscription_id,
                "p_invoice_id": invoice_id,
            },
        ).execute()
        result_data = (
            result.data[0]
            if isinstance(result.data, list) and result.data
            else result.data
        )
        if _stripe_value(result_data, "finalized") is not True:
            raise RuntimeError("Stripe payment failure transaction failed")
        user_id = _stripe_value(result_data, "user_id")
        if isinstance(user_id, str):
            await invalidate_user_quota_cache(user_id)
        return True

    if not stripe_subscription_id:
        logger.info("[WEBHOOK] Invoice payment failed without subscription, skipping sync")
        return False

    if not supabase_client:
        return False

    try:
        previous_subscription = supabase_client.table("user_subscriptions")\
            .select("status")\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .maybe_single()\
            .execute()
        previous_status = (
            previous_subscription.data.get("status")
            if previous_subscription.data
            else None
        )

        result = supabase_client.table("user_subscriptions")\
            .update({
                "status": "past_due",
                "updated_at": datetime.now(UTC).isoformat()
            })\
            .eq("stripe_subscription_id", stripe_subscription_id)\
            .execute()

        if not result.data:
            raise RuntimeError("Stripe subscription missing from local projection")

        if previous_status != "past_due" and result.data and len(result.data) > 0:
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
                    customer_id = invoice["customer"] if "customer" in invoice else None
                    if customer_id:
                        cust = stripe.Customer.retrieve(customer_id)
                        user_email = getattr(cust, "email", "")
                        if user_email:
                            send_payment_failed_email(user_email=user_email)
                except Exception as email_err:
                    logger.warning(f"[WEBHOOK] Payment failed email error (non-fatal): {email_err}")

                # Alerte admin paiement echoue
                customer_email_failed = invoice["customer_email"] if "customer_email" in invoice else "inconnu"
                amount_due = invoice["amount_due"] if "amount_due" in invoice else 0
                await send_admin_alert(
                    subject=f"Paiement echoue — {customer_email_failed}",
                    body=(
                        f"Client: {customer_email_failed}\n"
                        f"Montant: {amount_due / 100:.2f} EUR\n"
                        f"Stripe sub: {stripe_subscription_id}"
                    ),
                    severity="error",
                    skip_throttle=True,
                    category="payment_failed",
                )

        logger.info(f"Subscription marked as past_due: {stripe_subscription_id}")
        return False

    except Exception as e:
        logger.error(f"Failed to update subscription status: {e}")
        raise


async def handle_invoice_paid(
    invoice: dict[str, Any],
    *,
    event_id: str | None = None,
    claim_token: str | None = None,
) -> bool:
    """Handle successful invoice payment — update subscription period + notify admin."""
    try:
        amount = (invoice["amount_paid"] if "amount_paid" in invoice else 0) / 100  # cents to euros
        currency = (invoice["currency"] if "currency" in invoice else "eur").upper()
        customer_email = invoice["customer_email"] if "customer_email" in invoice else "inconnu"
        billing_reason = invoice["billing_reason"] if "billing_reason" in invoice else "unknown"
        subscription_id = _extract_invoice_subscription_id(invoice) or "N/A"
        invoice_id = invoice["id"] if "id" in invoice else "N/A"
        payment_already_recorded = False
        if (
            event_id is None
            and claim_token is None
            and supabase_client
            and amount > 0
            and invoice_id != "N/A"
        ):
            previous_payment = supabase_client.table("stripe_payments")\
                .select("stripe_invoice_id")\
                .eq("stripe_invoice_id", invoice_id)\
                .maybe_single()\
                .execute()
            payment_already_recorded = bool(previous_payment.data)

        user_id_value: str | None = None
        stripe_customer_id = invoice.get("customer") if isinstance(invoice, dict) else None

        # For analytics: we may also need recurring interval and period
        stripe_sub: Any | None = None
        new_period_start: datetime | None = None
        new_period_end: datetime | None = None
        interval: str | None = None
        interval_count: int | None = None
        subscription_status: str | None = None
        payment_logged = payment_already_recorded

        if event_id is not None or claim_token is not None:
            if not event_id or not claim_token:
                raise RuntimeError("Incomplete Stripe transaction context")
            if not supabase_client:
                raise RuntimeError("Stripe database unavailable")
            if invoice_id == "N/A":
                raise RuntimeError("Stripe invoice ID missing")

            if subscription_id != "N/A":
                stripe_sub = stripe.Subscription.retrieve(subscription_id)
                subscription_status = _normalize_subscription_status(
                    _stripe_value(stripe_sub, "status")
                )
                period_start, period_end = extract_subscription_period(stripe_sub)
                new_period_start = datetime.fromtimestamp(period_start, tz=UTC)
                new_period_end = datetime.fromtimestamp(period_end, tz=UTC)
                items = _stripe_value(
                    _stripe_value(stripe_sub, "items", {}),
                    "data",
                    [],
                ) or []
                first_item = items[0] if items else {}
                price = _stripe_value(first_item, "price", {})
                recurring = _stripe_value(price, "recurring", {})
                interval_value = _stripe_value(recurring, "interval")
                interval_count_value = _stripe_value(recurring, "interval_count")
                interval = interval_value if isinstance(interval_value, str) else None
                interval_count = (
                    interval_count_value
                    if isinstance(interval_count_value, int)
                    and not isinstance(interval_count_value, bool)
                    else None
                )

            transaction = supabase_client.rpc(
                "apply_stripe_invoice_paid",
                {
                    "p_event_id": event_id,
                    "p_claim_token": claim_token,
                    "p_subscription_id": (
                        subscription_id if subscription_id != "N/A" else None
                    ),
                    "p_subscription_status": subscription_status,
                    "p_invoice_id": invoice_id,
                    "p_customer_id": stripe_customer_id,
                    "p_billing_reason": billing_reason,
                    "p_amount_paid": amount,
                    "p_currency": currency,
                    "p_period_start": (
                        new_period_start.isoformat() if new_period_start else None
                    ),
                    "p_period_end": (
                        new_period_end.isoformat() if new_period_end else None
                    ),
                    "p_interval": interval,
                    "p_interval_count": interval_count,
                },
            ).execute()
            transaction_data = (
                transaction.data[0]
                if isinstance(transaction.data, list) and transaction.data
                else transaction.data
            )
            if _stripe_value(transaction_data, "finalized") is not True:
                raise RuntimeError("Stripe invoice transaction failed")
            user_id = _stripe_value(transaction_data, "user_id")
            if isinstance(user_id, str):
                await invalidate_user_quota_cache(user_id)
            return True

        def persist_payment_ledger() -> None:
            """Écrire le journal requis avant les notifications financières."""
            if not supabase_client or amount <= 0 or invoice_id == "N/A":
                return

            payment_result = supabase_client.table("stripe_payments").upsert({
                "stripe_invoice_id": invoice_id,
                "user_id": user_id_value,
                "stripe_customer_id": stripe_customer_id,
                "stripe_subscription_id": subscription_id if subscription_id != "N/A" else None,
                "billing_reason": billing_reason,
                "amount_paid": amount,
                "currency": currency,
                "interval": interval,
                "interval_count": interval_count,
                "period_start": new_period_start.isoformat() if new_period_start else None,
                "period_end": new_period_end.isoformat() if new_period_end else None,
                "raw_invoice": invoice,
            }, on_conflict="stripe_invoice_id").execute()
            if not payment_result.data:
                raise RuntimeError("Stripe payment ledger was not persisted")

        # Update current_period_end on renewal/create/update
        if billing_reason in ("subscription_create", "subscription_cycle", "subscription_update") and subscription_id and subscription_id != "N/A":
            try:
                # Fetch fresh subscription data from Stripe
                stripe_sub = stripe.Subscription.retrieve(subscription_id)
                period_start, period_end = extract_subscription_period(stripe_sub)
                new_period_end = datetime.fromtimestamp(
                    period_end,
                    tz=UTC,
                )
                new_period_start = datetime.fromtimestamp(
                    period_start,
                    tz=UTC,
                )

                # Extract recurring interval from Stripe subscription (if available)
                try:
                    items = getattr(stripe_sub, "items", None)
                    data = getattr(items, "data", []) if items else []
                    if data:
                        price_obj = getattr(data[0], "price", None)
                        recurring = getattr(price_obj, "recurring", None) if price_obj else None
                        if recurring:
                            interval = getattr(recurring, "interval", None)
                            interval_count = getattr(recurring, "interval_count", None)
                except Exception:
                    pass

                if supabase_client:
                    # Update subscription dates/status
                    sub_row = supabase_client.table("user_subscriptions").select(
                        "user_id"
                    ).eq("stripe_subscription_id", subscription_id).maybe_single().execute()

                    updated_subscription = supabase_client.table("user_subscriptions").update({
                        "current_period_start": new_period_start.isoformat(),
                        "current_period_end": new_period_end.isoformat(),
                        "status": "active",
                    }).eq("stripe_subscription_id", subscription_id).execute()

                    if not updated_subscription.data:
                        raise RuntimeError(
                            "Stripe subscription missing from local projection"
                        )

                    logger.info(f"[WEBHOOK] Updated period_end={new_period_end.isoformat()} for sub={subscription_id}")

                    if sub_row.data:
                        user_id_value = sub_row.data.get("user_id")
                        # Invalidate cache so user sees updated quotas immediately
                        await invalidate_user_quota_cache(user_id_value)
            except Exception as e:
                logger.error(f"[WEBHOOK] Failed to update period_end for {subscription_id}: {e}")
                raise

            if not payment_logged:
                persist_payment_ledger()
                payment_logged = True

            reason_label = {
                "subscription_create": "Nouvel abonnement",
                "subscription_cycle": "Renouvellement",
                "subscription_update": "Changement de plan",
            }.get(billing_reason, billing_reason)

            # Email client avec lien facture Stripe
            if (
                not payment_already_recorded
                and customer_email
                and customer_email != "inconnu"
                and amount > 0
            ):
                try:
                    invoice_url = (invoice["hosted_invoice_url"] if "hosted_invoice_url" in invoice else None) or (invoice["invoice_pdf"] if "invoice_pdf" in invoice else None)
                    invoice_pdf_url = invoice["invoice_pdf"] if "invoice_pdf" in invoice else None
                    # Recuperer le nom du plan depuis la DB puis fallback Stripe Product
                    plan_label = ""
                    if supabase_client:
                        try:
                            db_sub = supabase_client.table("user_subscriptions").select(
                                "subscription_plans(display_name)"
                            ).eq("stripe_subscription_id", subscription_id).maybe_single().execute()
                            if db_sub.data:
                                plan_label = (db_sub.data.get("subscription_plans") or {}).get("display_name", "")
                        except Exception:
                            pass
                    if not plan_label:
                        try:
                            sub_items = getattr(stripe_sub, "items", None)
                            items_data = getattr(sub_items, "data", []) if sub_items else []
                            if items_data:
                                price_obj = getattr(items_data[0], "price", None)
                                prod_id = getattr(price_obj, "product", None) if price_obj else None
                                if prod_id:
                                    prod = stripe.Product.retrieve(prod_id)
                                    plan_label = getattr(prod, "name", "")
                        except Exception:
                            pass
                    plan_label = plan_label or "Abonnement HuntZen"
                    send_payment_confirmation_email(
                        user_email=customer_email,
                        plan_name=plan_label,
                        amount=f"{amount:.2f} {currency}",
                        invoice_url=invoice_url,
                        invoice_pdf_url=invoice_pdf_url,
                        billing_reason=billing_reason,
                    )
                except Exception as email_err:
                    logger.warning(f"[WEBHOOK] Invoice email failed (non-fatal): {email_err}")

            if not payment_already_recorded:
                await send_admin_alert(
                    subject=f"Paiement recu — {amount:.2f} {currency}",
                    body=(
                        f"Type: {reason_label}\n"
                        f"Montant: {amount:.2f} {currency}\n"
                        f"Client: {customer_email}\n"
                        f"Stripe sub: {subscription_id}\n"
                        f"Invoice ID: {invoice['id'] if 'id' in invoice else 'N/A'}"
                    ),
                    severity="info",
                    skip_throttle=True,
                    category="payment_received",
                )
            logger.info(
                "[WEBHOOK] Invoice paid",
                extra={
                    "amount": amount,
                    "currency": currency,
                    "billing_reason": reason_label,
                },
            )

        if not payment_logged:
            persist_payment_ledger()

        return False

    except Exception as e:
        logger.error(f"[WEBHOOK] handle_invoice_paid failed: {type(e).__name__}")
        raise


async def handle_recruiter_checkout(
    session: dict[str, Any],
    *,
    event_id: str | None = None,
    claim_token: str | None = None,
) -> bool:
    """Handle successful recruiter request payment."""
    metadata = _stripe_value(session, "metadata", {})
    request_id = _stripe_value(metadata, "request_id")

    if not request_id:
        logger.warning("Recruiter checkout missing request_id")
        raise RuntimeError("Recruiter checkout request ID missing")

    if not supabase_client:
        raise RuntimeError("Supabase client unavailable")

    if event_id is not None or claim_token is not None:
        if not event_id or not claim_token:
            raise RuntimeError("Incomplete Stripe transaction context")
        snapshot_response = (
            supabase_client.table("recruiter_requests")
            .select("user_id,stripe_checkout_session_id,amount_cents")
            .eq("id", request_id)
            .maybe_single()
            .execute()
        )
        snapshot = snapshot_response.data
        if not isinstance(snapshot, dict):
            raise RuntimeError("Recruiter checkout request snapshot missing")

        session_id = _stripe_resource_id(_stripe_value(session, "id"))
        metadata_user_id = _stripe_value(metadata, "user_id")
        mode = _stripe_value(session, "mode")
        payment_status = _stripe_value(session, "payment_status")
        amount_total = _stripe_value(session, "amount_total")
        currency = _stripe_value(session, "currency")
        if (
            session_id != snapshot.get("stripe_checkout_session_id")
            or metadata_user_id != snapshot.get("user_id")
            or mode != "payment"
            or payment_status != "paid"
            or isinstance(amount_total, bool)
            or not isinstance(amount_total, int)
            or amount_total != snapshot.get("amount_cents")
            or not isinstance(currency, str)
            or currency.lower() != "eur"
        ):
            raise RuntimeError("Recruiter checkout does not match stored request")

        payment_intent_id = _stripe_resource_id(
            _stripe_value(session, "payment_intent")
        )
        if not payment_intent_id:
            raise RuntimeError("Recruiter payment intent missing")
        result = supabase_client.rpc(
            "apply_stripe_recruiter_checkout",
            {
                "p_event_id": event_id,
                "p_claim_token": claim_token,
                "p_request_id": request_id,
                "p_payment_intent_id": payment_intent_id,
            },
        ).execute()
        result_data = (
            result.data[0]
            if isinstance(result.data, list) and result.data
            else result.data
        )
        if _stripe_value(result_data, "finalized") is not True:
            raise RuntimeError("Stripe recruiter transaction failed")
        return True

    try:
        request_response = supabase_client.table("recruiter_requests")\
            .select("*")\
            .eq("id", request_id)\
            .execute()

        if not request_response.data:
            raise RuntimeError("Recruiter request not found")

        request_data = request_response.data[0]
        if request_data.get("payment_status") == "paid":
            logger.info(f"Recruiter payment replay skipped: {request_id}")
            return False

        supabase_client.table("recruiter_requests")\
            .update({
                "payment_status": "paid",
                "payment_intent_id": _stripe_value(session, "payment_intent"),
            })\
            .eq("id", request_id)\
            .execute()

        logger.info(f"Recruiter request marked as paid: {request_id}")

        send_recruiter_request_confirmation(
            to_email=request_data["email"],
            full_name=request_data["full_name"],
            sector=request_data["sector"],
            experience_level=request_data["experience_level"],
            preferred_date=request_data.get("preferred_date"),
        )
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
        logger.info(f"Recruiter payment emails sent for request: {request_id}")
        return False

    except Exception as e:
        logger.error(f"Failed to process recruiter checkout: {type(e).__name__}")
        raise
