"""Régressions du webhook customer.subscription.updated."""

from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import stripe

from src.services import stripe as stripe_service
from tests.fixtures.stripe_events import CLOVER_SUBSCRIPTION


@dataclass
class _Response:
    data: object


class _Query:
    def __init__(self, database: "_FakeSupabase", table_name: str):
        self.database = database
        self.table_name = table_name
        self.operation = "select"
        self.payload = None

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def execute(self):
        if self.table_name == "stripe_prices":
            return _Response({"plan_id": "plan_test_pro"})
        if self.table_name == "subscription_plans":
            return _Response({"display_name": "Pro"})
        if self.table_name == "user_subscriptions" and self.operation == "update":
            self.database.subscription_updates.append(self.payload)
            self.database.cancel_at_period_end = self.payload.get(
                "cancel_at_period_end",
                self.database.cancel_at_period_end,
            )
            return _Response([self.payload])
        if self.table_name == "user_subscriptions" and self.operation == "select":
            return _Response(
                {
                    "user_id": "user_test",
                    "cancel_at_period_end": self.database.cancel_at_period_end,
                }
            )
        return _Response(None)


class _FakeSupabase:
    def __init__(self):
        self.subscription_updates = []
        self.cancel_at_period_end = False

    def table(self, table_name: str):
        return _Query(self, table_name)


@pytest.mark.asyncio
async def test_subscription_updated_persists_clover_item_period(monkeypatch):
    """Une mise à jour Stripe ne doit pas rendre l'abonnement immédiatement expiré."""
    database = _FakeSupabase()
    subscription = stripe.StripeObject.construct_from(
        {**CLOVER_SUBSCRIPTION, "cancel_at_period_end": False},
        key=None,
    )

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )

    await stripe_service.handle_subscription_updated(subscription)

    assert len(database.subscription_updates) == 1
    update = database.subscription_updates[0]
    assert update["current_period_start"] == "2026-08-09T16:00:00+00:00"
    assert update["current_period_end"] == "2026-09-09T16:00:00+00:00"


@pytest.mark.asyncio
async def test_subscription_cancellation_email_uses_clover_period_end(monkeypatch):
    """L'e-mail de résiliation doit annoncer la vraie fin d'accès Clover."""
    database = _FakeSupabase()
    subscription = stripe.StripeObject.construct_from(
        {
            **CLOVER_SUBSCRIPTION,
            "cancel_at_period_end": True,
            "customer": "cus_test_client",
        },
        key=None,
    )
    send_email = Mock(return_value=True)

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        stripe.Customer,
        "retrieve",
        Mock(return_value=SimpleNamespace(email="client@example.test")),
    )
    monkeypatch.setattr(
        stripe_service,
        "send_subscription_cancelled_email",
        send_email,
    )

    await stripe_service.handle_subscription_updated(subscription)
    await stripe_service.handle_subscription_updated(subscription)

    send_email.assert_called_once_with(
        user_email="client@example.test",
        plan_name="Pro",
        end_date="09/09/2026",
    )


@pytest.mark.parametrize(
    ("stripe_status", "local_status"),
    [
        ("active", "active"),
        ("trialing", "trialing"),
        ("unpaid", "past_due"),
        ("incomplete_expired", "canceled"),
    ],
)
def test_subscription_status_is_normalized_for_local_constraint(
    stripe_status,
    local_status,
):
    assert stripe_service._normalize_subscription_status(stripe_status) == local_status


def test_unknown_subscription_status_is_rejected():
    with pytest.raises(RuntimeError, match="Unsupported Stripe subscription status"):
        stripe_service._normalize_subscription_status("future_status")
