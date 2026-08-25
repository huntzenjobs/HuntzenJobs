"""Contrats des RPC métier atomiques utilisées par les webhooks Stripe."""

from dataclasses import dataclass
from unittest.mock import Mock

import pytest
import stripe

from src.services import stripe as stripe_service
from tests.fixtures.stripe_events import CLOVER_INVOICE, CLOVER_SUBSCRIPTION


@dataclass
class _Response:
    data: object


class _RpcCall:
    def __init__(self, database: "_Database", name: str, params: dict):
        self.database = database
        self.name = name
        self.params = params

    def execute(self):
        self.database.calls.append((self.name, self.params))
        return _Response({"finalized": True, "user_id": "user_test"})


class _RecruiterSnapshotQuery:
    def __init__(self, database: "_Database"):
        self.database = database

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return _Response(self.database.recruiter_snapshot)


class _Database:
    def __init__(self, recruiter_snapshot: dict | None = None):
        self.calls: list[tuple[str, dict]] = []
        self.recruiter_snapshot = recruiter_snapshot or {
            "user_id": "22222222-2222-2222-2222-222222222222",
            "stripe_checkout_session_id": "cs_test_recruiter",
            "amount_cents": 5_000,
        }

    def rpc(self, name: str, params: dict):
        return _RpcCall(self, name, params)

    def table(self, table_name: str):
        assert table_name == "recruiter_requests"
        return _RecruiterSnapshotQuery(self)


@pytest.mark.asyncio
async def test_invoice_paid_uses_atomic_projection_ledger_outbox_rpc(monkeypatch):
    database = _Database()
    subscription = stripe.StripeObject.construct_from(CLOVER_SUBSCRIPTION, key=None)
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )

    finalized = await stripe_service.handle_invoice_paid(
        {
            **CLOVER_INVOICE,
            "amount_paid": 1_390,
            "customer": "cus_test_client",
        },
        event_id="evt_test_invoice_paid",
        claim_token="claim_test_token",
    )

    assert finalized is True
    assert database.calls == [
        (
            "apply_stripe_invoice_paid",
            {
                "p_event_id": "evt_test_invoice_paid",
                "p_claim_token": "claim_test_token",
                "p_subscription_id": "sub_test_clover",
                "p_subscription_status": "active",
                "p_invoice_id": "in_test_clover",
                "p_customer_id": "cus_test_client",
                "p_billing_reason": "subscription_cycle",
                "p_amount_paid": 13.9,
                "p_currency": "EUR",
                "p_period_start": "2026-08-09T16:00:00+00:00",
                "p_period_end": "2026-09-09T16:00:00+00:00",
                "p_interval": None,
                "p_interval_count": None,
            },
        )
    ]


@pytest.mark.asyncio
async def test_standalone_invoice_paid_is_journaled_and_finalized_atomically(monkeypatch):
    """Une facture hors abonnement ne doit pas rester bloquée indéfiniment."""
    database = _Database()
    retrieve_subscription = Mock()
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        retrieve_subscription,
    )

    finalized = await stripe_service.handle_invoice_paid(
        {
            "id": "in_test_standalone",
            "amount_paid": 5_000,
            "currency": "eur",
            "customer": "cus_test_client",
            "customer_email": "client@example.test",
            "billing_reason": "manual",
        },
        event_id="evt_test_standalone_paid",
        claim_token="claim_test_token",
    )

    assert finalized is True
    retrieve_subscription.assert_not_called()
    assert database.calls == [
        (
            "apply_stripe_invoice_paid",
            {
                "p_event_id": "evt_test_standalone_paid",
                "p_claim_token": "claim_test_token",
                "p_subscription_id": None,
                "p_subscription_status": None,
                "p_invoice_id": "in_test_standalone",
                "p_customer_id": "cus_test_client",
                "p_billing_reason": "manual",
                "p_amount_paid": 50.0,
                "p_currency": "EUR",
                "p_period_start": None,
                "p_period_end": None,
                "p_interval": None,
                "p_interval_count": None,
            },
        )
    ]


@pytest.mark.asyncio
async def test_paid_old_invoice_does_not_reactivate_canceled_subscription(
    monkeypatch,
):
    database = _Database()
    subscription = stripe.StripeObject.construct_from(
        {**CLOVER_SUBSCRIPTION, "status": "canceled"},
        key=None,
    )
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )

    await stripe_service.handle_invoice_paid(
        CLOVER_INVOICE,
        event_id="evt_test_old_paid",
        claim_token="claim_test_token",
    )

    assert database.calls[0][1]["p_subscription_status"] == "canceled"


@pytest.mark.asyncio
async def test_payment_failed_uses_atomic_projection_notification_rpc(monkeypatch):
    database = _Database()
    monkeypatch.setattr(stripe_service, "supabase_client", database)

    finalized = await stripe_service.handle_payment_failed(
        CLOVER_INVOICE,
        event_id="evt_test_payment_failed",
        claim_token="claim_test_token",
    )

    assert finalized is True
    assert database.calls == [
        (
            "apply_stripe_payment_failed",
            {
                "p_event_id": "evt_test_payment_failed",
                "p_claim_token": "claim_test_token",
                "p_subscription_id": "sub_test_clover",
                "p_invoice_id": "in_test_clover",
            },
        )
    ]


@pytest.mark.asyncio
async def test_standalone_payment_failed_is_notified_and_finalized_atomically(
    monkeypatch,
):
    database = _Database()
    monkeypatch.setattr(stripe_service, "supabase_client", database)

    finalized = await stripe_service.handle_payment_failed(
        {
            "id": "in_test_standalone_failed",
            "customer": "cus_test_client",
            "customer_email": "client@example.test",
        },
        event_id="evt_test_standalone_failed",
        claim_token="claim_test_token",
    )

    assert finalized is True
    assert database.calls == [
        (
            "apply_stripe_payment_failed",
            {
                "p_event_id": "evt_test_standalone_failed",
                "p_claim_token": "claim_test_token",
                "p_subscription_id": None,
                "p_invoice_id": "in_test_standalone_failed",
            },
        )
    ]


@pytest.mark.asyncio
async def test_subscription_deleted_uses_atomic_projection_outbox_rpc(monkeypatch):
    database = _Database()
    monkeypatch.setattr(stripe_service, "supabase_client", database)

    finalized = await stripe_service.handle_subscription_deleted(
        {"id": "sub_test_clover"},
        event_id="evt_test_subscription_deleted",
        claim_token="claim_test_token",
    )

    assert finalized is True
    assert database.calls == [
        (
            "apply_stripe_subscription_deleted",
            {
                "p_event_id": "evt_test_subscription_deleted",
                "p_claim_token": "claim_test_token",
                "p_subscription_id": "sub_test_clover",
            },
        )
    ]


@pytest.mark.asyncio
async def test_subscription_updated_uses_atomic_projection_outbox_rpc(monkeypatch):
    database = _Database()
    monkeypatch.setattr(stripe_service, "supabase_client", database)

    finalized = await stripe_service.handle_subscription_updated(
        stripe.StripeObject.construct_from(
            {**CLOVER_SUBSCRIPTION, "cancel_at_period_end": True},
            key=None,
        ),
        event_id="evt_test_subscription_updated",
        claim_token="claim_test_token",
    )

    assert finalized is True
    assert database.calls == [
        (
            "apply_stripe_subscription_updated",
            {
                "p_event_id": "evt_test_subscription_updated",
                "p_claim_token": "claim_test_token",
                "p_subscription_id": "sub_test_clover",
                "p_status": "active",
                "p_price_id": "price_test_monthly",
                "p_period_start": "2026-08-09T16:00:00+00:00",
                "p_period_end": "2026-09-09T16:00:00+00:00",
                "p_cancel_at_period_end": True,
            },
        )
    ]


@pytest.mark.asyncio
async def test_recruiter_checkout_uses_atomic_payment_outbox_rpc(monkeypatch):
    database = _Database()
    monkeypatch.setattr(stripe_service, "supabase_client", database)

    finalized = await stripe_service.handle_recruiter_checkout(
        {
            "id": "cs_test_recruiter",
            "mode": "payment",
            "payment_status": "paid",
            "amount_total": 5_000,
            "currency": "eur",
            "payment_intent": "pi_test_recruiter",
            "metadata": {
                "request_id": "11111111-1111-1111-1111-111111111111",
                "user_id": "22222222-2222-2222-2222-222222222222",
            },
        },
        event_id="evt_test_recruiter",
        claim_token="claim_test_token",
    )

    assert finalized is True
    assert database.calls == [
        (
            "apply_stripe_recruiter_checkout",
            {
                "p_event_id": "evt_test_recruiter",
                "p_claim_token": "claim_test_token",
                "p_request_id": "11111111-1111-1111-1111-111111111111",
                "p_payment_intent_id": "pi_test_recruiter",
            },
        )
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("session_override", "metadata_override"),
    [
        ({"id": "cs_other"}, {}),
        ({}, {"user_id": "33333333-3333-3333-3333-333333333333"}),
        ({"mode": "subscription"}, {}),
        ({"payment_status": "unpaid"}, {}),
        ({"amount_total": 4_999}, {}),
        ({"currency": "usd"}, {}),
    ],
)
async def test_recruiter_checkout_rejects_session_not_matching_stored_snapshot(
    monkeypatch,
    session_override,
    metadata_override,
):
    database = _Database()
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    metadata = {
        "request_id": "11111111-1111-1111-1111-111111111111",
        "user_id": "22222222-2222-2222-2222-222222222222",
        **metadata_override,
    }
    session = {
        "id": "cs_test_recruiter",
        "mode": "payment",
        "payment_status": "paid",
        "amount_total": 5_000,
        "currency": "eur",
        "payment_intent": "pi_test_recruiter",
        "metadata": metadata,
        **session_override,
    }

    with pytest.raises(RuntimeError, match="Recruiter checkout"):
        await stripe_service.handle_recruiter_checkout(
            session,
            event_id="evt_test_recruiter",
            claim_token="claim_test_token",
        )

    assert database.calls == []
