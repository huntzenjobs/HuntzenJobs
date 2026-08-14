"""Consommateur durable des effets externes produits par les webhooks Stripe."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import sentry_sdk
import stripe

from src.services.admin_alerts import send_admin_alert
from src.services.email import (
    send_payment_confirmation_email,
    send_payment_failed_email,
    send_recruiter_request_confirmation,
    send_recruiter_request_notification,
    send_subscription_cancelled_email,
)
from src.services.referrals import apply_pending_referral_reward
from src.services.stripe import _extract_invoice_subscription_id, _stripe_resource_id

logger = logging.getLogger(__name__)


def _rpc_data(result: Any) -> Any:
    data = result.data
    if isinstance(data, list) and len(data) == 1:
        return data[0]
    return data


def _retry_delay(attempt_count: int) -> int:
    safe_attempt = max(1, attempt_count)
    return min(3600, 30 * (2 ** (safe_attempt - 1)))


def _value(resource: Any, key: str, default: Any = None) -> Any:
    if isinstance(resource, dict):
        return resource.get(key, default)
    return getattr(resource, key, default)


def _require_delivery(sent: bool, effect_type: str) -> None:
    if sent is not True:
        raise RuntimeError(f"Stripe effect delivery failed: {effect_type}")


async def _invoice_email(invoice: Any) -> str:
    email = _value(invoice, "customer_email", "")
    if isinstance(email, str) and email:
        return email
    customer_id = _stripe_resource_id(_value(invoice, "customer"))
    if customer_id:
        customer = await asyncio.to_thread(stripe.Customer.retrieve, customer_id)
        customer_email = _value(customer, "email", "")
        if isinstance(customer_email, str) and customer_email:
            return customer_email
    raise RuntimeError("Stripe invoice customer email missing")


async def _invoice_plan_name(invoice: Any) -> str:
    subscription_id = _extract_invoice_subscription_id(invoice)
    if not subscription_id:
        return "Abonnement HuntZen"
    subscription = await asyncio.to_thread(
        stripe.Subscription.retrieve,
        subscription_id,
    )
    items = _value(_value(subscription, "items", {}), "data", []) or []
    first_item = items[0] if items else {}
    price = _value(first_item, "price", {})
    product_id = _stripe_resource_id(_value(price, "product"))
    if not product_id:
        return "Abonnement HuntZen"
    product = await asyncio.to_thread(stripe.Product.retrieve, product_id)
    product_name = _value(product, "name", "")
    return product_name if isinstance(product_name, str) and product_name else "Abonnement HuntZen"


def _single_row(query_result: Any, *, label: str) -> dict[str, Any]:
    data = getattr(query_result, "data", None)
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict):
        raise RuntimeError(f"Stripe outbox subject missing: {label}")
    return data


async def deliver_stripe_effect(supabase_client: Any, effect: dict[str, Any]) -> str:
    """Résoudre les données à la livraison et envoyer avec une clé stable."""
    effect_type = effect.get("effect_type")
    subject_id = effect.get("subject_id")
    dedupe_key = effect.get("dedupe_key")
    if not isinstance(effect_type, str) or not effect_type:
        raise RuntimeError("Invalid Stripe outbox effect type")
    if not isinstance(subject_id, str) or not subject_id:
        raise RuntimeError("Invalid Stripe outbox subject ID")
    if not isinstance(dedupe_key, str) or not dedupe_key:
        raise RuntimeError("Invalid Stripe outbox effect")

    if effect_type.startswith("payment_"):
        invoice = await asyncio.to_thread(stripe.Invoice.retrieve, subject_id)
        amount_paid = (_value(invoice, "amount_paid", 0) or 0) / 100
        amount_due = (_value(invoice, "amount_due", 0) or 0) / 100
        currency = str(_value(invoice, "currency", "eur")).upper()
        customer_email = await _invoice_email(invoice)
        subscription_id = _extract_invoice_subscription_id(invoice) or "N/A"

        if effect_type == "payment_confirmation_client":
            sent = await asyncio.to_thread(
                send_payment_confirmation_email,
                user_email=customer_email,
                plan_name=await _invoice_plan_name(invoice),
                amount=f"{amount_paid:.2f} {currency}",
                invoice_url=_value(invoice, "hosted_invoice_url")
                or _value(invoice, "invoice_pdf"),
                invoice_pdf_url=_value(invoice, "invoice_pdf"),
                billing_reason=_value(invoice, "billing_reason", "subscription_create"),
                idempotency_key=dedupe_key,
            )
            _require_delivery(sent, effect_type)
        elif effect_type == "payment_failed_client":
            sent = await asyncio.to_thread(
                send_payment_failed_email,
                user_email=customer_email,
                idempotency_key=dedupe_key,
            )
            _require_delivery(sent, effect_type)
        elif effect_type == "payment_received_admin":
            sent = await send_admin_alert(
                subject=f"Paiement reçu — {amount_paid:.2f} {currency}",
                body=(
                    f"Montant: {amount_paid:.2f} {currency}\n"
                    f"Stripe sub: {subscription_id}\nInvoice ID: {subject_id}"
                ),
                severity="info",
                skip_throttle=True,
                category="payment_received",
                idempotency_key=dedupe_key,
                strict=True,
            )
            _require_delivery(sent, effect_type)
        elif effect_type == "payment_failed_admin":
            sent = await send_admin_alert(
                subject=f"Paiement échoué — {subject_id}",
                body=(
                    f"Montant dû: {amount_due:.2f} {currency}\n"
                    f"Stripe sub: {subscription_id}\nInvoice ID: {subject_id}"
                ),
                severity="error",
                skip_throttle=True,
                category="payment_failed",
                idempotency_key=dedupe_key,
                strict=True,
            )
            _require_delivery(sent, effect_type)
        else:
            raise RuntimeError(f"Unsupported Stripe payment effect: {effect_type}")
        return dedupe_key

    if effect_type.startswith("subscription_cancelled_"):
        payload = effect.get("payload")
        immutable_payload = payload if isinstance(payload, dict) else {}
        subscription_query = (
            supabase_client.table("user_subscriptions")
            .select(
                "user_id,plan_id,current_period_end,stripe_customer_id,"
                "cancel_at_period_end,status"
            )
            .eq("stripe_subscription_id", subject_id)
            .maybe_single()
        )
        row = _single_row(
            await asyncio.to_thread(subscription_query.execute),
            label="subscription",
        )
        if (
            immutable_payload.get("cancellation_mode") == "scheduled"
            and row.get("status") != "canceled"
            and row.get("cancel_at_period_end") is not True
        ):
            logger.info(
                "[stripe_outbox] Scheduled cancellation superseded",
                extra={"effect_id": effect.get("id")},
            )
            return dedupe_key
        if effect_type == "subscription_cancelled_client":
            customer_id = row.get("stripe_customer_id")
            if not isinstance(customer_id, str) or not customer_id:
                raise RuntimeError("Stripe subscription customer missing")
            customer = await asyncio.to_thread(stripe.Customer.retrieve, customer_id)
            customer_email = _value(customer, "email", "")
            if not isinstance(customer_email, str) or not customer_email:
                raise RuntimeError("Stripe subscription customer email missing")
            plan_name = "Abonnement HuntZen"
            plan_id = immutable_payload.get("plan_id") or row.get("plan_id")
            if isinstance(plan_id, str) and plan_id:
                plan_query = supabase_client.table("subscription_plans")\
                    .select("display_name")\
                    .eq("id", plan_id)\
                    .maybe_single()
                plan_result = await asyncio.to_thread(plan_query.execute)
                if isinstance(plan_result.data, dict):
                    plan_name = plan_result.data.get("display_name") or plan_name
            period_end = (
                immutable_payload.get("period_end")
                or row.get("current_period_end")
            )
            if not isinstance(period_end, str) or not period_end:
                raise RuntimeError("Stripe subscription period end missing")
            end_date = datetime.fromisoformat(period_end.replace("Z", "+00:00"))\
                .astimezone(UTC)\
                .strftime("%d/%m/%Y")
            sent = await asyncio.to_thread(
                send_subscription_cancelled_email,
                user_email=customer_email,
                plan_name=plan_name,
                end_date=end_date,
                idempotency_key=dedupe_key,
            )
            _require_delivery(sent, effect_type)
        else:
            sent = await send_admin_alert(
                subject="Résiliation abonnement",
                body=f"Stripe sub: {subject_id}",
                severity="warning",
                skip_throttle=True,
                category="cancellation",
                idempotency_key=dedupe_key,
                strict=True,
            )
            _require_delivery(sent, effect_type)
        return dedupe_key

    if effect_type.startswith("recruiter_paid_"):
        request_query = (
            supabase_client.table("recruiter_requests")
            .select("*")
            .eq("id", subject_id)
            .maybe_single()
        )
        request = _single_row(
            await asyncio.to_thread(request_query.execute),
            label="recruiter_request",
        )
        if effect_type == "recruiter_paid_client":
            sent = await asyncio.to_thread(
                send_recruiter_request_confirmation,
                to_email=request["email"],
                full_name=request["full_name"],
                sector=request["sector"],
                experience_level=request["experience_level"],
                preferred_date=request.get("preferred_date"),
                idempotency_key=dedupe_key,
            )
        else:
            sent = await asyncio.to_thread(
                send_recruiter_request_notification,
                request_id=subject_id,
                full_name=request["full_name"],
                email=request["email"],
                phone=request.get("phone"),
                sector=request["sector"],
                experience_level=request["experience_level"],
                message=request["message"],
                preferred_date=request.get("preferred_date"),
                idempotency_key=dedupe_key,
            )
        _require_delivery(sent, effect_type)
        return dedupe_key

    if effect_type == "referral_reward":
        applied = await asyncio.to_thread(
            lambda: asyncio.run(
                apply_pending_referral_reward(supabase_client, subject_id)
            ),
        )
        _require_delivery(applied, effect_type)
        return dedupe_key

    if effect_type == "promo_free_days":
        prepared_query = supabase_client.rpc(
            "prepare_promo_free_days",
            {"p_promo_link_id": subject_id},
        )
        prepared_result = await asyncio.to_thread(prepared_query.execute)
        prepared = _rpc_data(prepared_result)
        if not isinstance(prepared, dict):
            raise RuntimeError("Invalid promo free-days preparation response")
        if prepared.get("applied") is True:
            return dedupe_key
        if prepared.get("external_type") != "stripe_trial_extension":
            raise RuntimeError("Unsupported promo free-days effect")

        promo_subscription_id = prepared.get("subscription_id")
        trial_end = prepared.get("trial_end")
        lease_token = prepared.get("lease_token")
        idempotency_key = prepared.get("idempotency_key")
        if (
            not isinstance(promo_subscription_id, str)
            or not isinstance(trial_end, int)
            or isinstance(trial_end, bool)
            or not isinstance(lease_token, str)
            or not isinstance(idempotency_key, str)
            or not idempotency_key
        ):
            raise RuntimeError("Invalid promo Stripe trial extension")
        await asyncio.to_thread(
            stripe.Subscription.modify,
            promo_subscription_id,
            trial_end=trial_end,
            proration_behavior="none",
            idempotency_key=idempotency_key,
        )
        finalized_query = supabase_client.rpc(
            "mark_promo_free_days_applied",
            {
                "p_promo_link_id": subject_id,
                "p_subscription_id": promo_subscription_id,
                "p_trial_end": trial_end,
                "p_lease_token": lease_token,
            },
        )
        finalized_result = await asyncio.to_thread(finalized_query.execute)
        if _rpc_data(finalized_result) is not True:
            raise RuntimeError("Promo free-days finalization failed")
        return dedupe_key

    raise RuntimeError(f"Unsupported Stripe effect: {effect_type}")


async def process_stripe_effects(
    supabase_client: Any,
    *,
    limit: int = 20,
    effect_timeout_seconds: float = 20,
) -> dict[str, int]:
    """Réclamer puis livrer un lot, avec finalisation liée au claim token."""
    claimed_query = supabase_client.rpc(
        "claim_stripe_effects",
        {"p_limit": limit},
    )
    claimed_result = await asyncio.to_thread(claimed_query.execute)
    claimed_data = claimed_result.data or []
    effects = claimed_data if isinstance(claimed_data, list) else [claimed_data]
    summary = {
        "claimed": len(effects),
        "succeeded": 0,
        "retried": 0,
        "dead": 0,
    }

    for effect in effects:
        effect_id = effect.get("id") if isinstance(effect, dict) else None
        claim_token = effect.get("claim_token") if isinstance(effect, dict) else None
        if not isinstance(effect_id, str) or not isinstance(claim_token, str):
            raise RuntimeError("Stripe outbox effect claimed without owner token")

        try:
            async with asyncio.timeout(effect_timeout_seconds):
                provider_message_id = await deliver_stripe_effect(
                    supabase_client,
                    effect,
                )
            finalized_query = supabase_client.rpc(
                "mark_stripe_effect_succeeded",
                {
                    "p_effect_id": effect_id,
                    "p_claim_token": claim_token,
                    "p_provider_message_id": provider_message_id,
                },
            )
            finalized = await asyncio.to_thread(finalized_query.execute)
            if _rpc_data(finalized) is not True:
                raise RuntimeError("Stripe effect finalization lost claim ownership")
            summary["succeeded"] += 1
        except Exception as exc:
            attempt_count = effect.get("attempt_count", 1)
            if not isinstance(attempt_count, int) or isinstance(attempt_count, bool):
                attempt_count = 1
            retry_query = supabase_client.rpc(
                "retry_stripe_effect",
                {
                    "p_effect_id": effect_id,
                    "p_claim_token": claim_token,
                    "p_error_type": type(exc).__name__,
                    "p_retry_seconds": _retry_delay(attempt_count),
                },
            )
            retry_result = await asyncio.to_thread(retry_query.execute)
            retry_data = _rpc_data(retry_result)
            if not isinstance(retry_data, dict):
                raise RuntimeError(
                    "Stripe effect retry returned an invalid response"
                ) from exc
            if retry_data.get("updated") is not True:
                raise RuntimeError("Stripe effect retry lost claim ownership") from None
            if retry_data.get("status") == "dead":
                summary["dead"] += 1
                logger.error(
                    "[stripe_outbox] Effect moved to dead-letter",
                    extra={"effect_id": effect_id, "error_type": type(exc).__name__},
                )
                sentry_sdk.capture_message(
                    "Stripe outbox effect moved to dead-letter",
                    level="error",
                )
            else:
                summary["retried"] += 1

    return summary
