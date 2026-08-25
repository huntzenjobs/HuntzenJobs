"""Régressions du webhook Stripe checkout.session.completed."""

from dataclasses import dataclass
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
        self.filters = {}
        self.single = False

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def is_(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def execute(self):
        if self.table_name == "profiles":
            return _Response([{"id": "user_test"}])
        if self.table_name == "subscription_plans":
            return _Response(
                {"id": "plan_test_pro"} if self.database.plan_exists else None
            )
        if self.table_name == "referral_signups":
            return _Response(None)
        if self.table_name == "user_promo_codes" and self.operation == "select":
            if (
                self.filters.get("id") == "promo_link_test"
                and self.filters.get("user_id") == "user_test"
            ):
                return _Response(
                    {"id": "promo_link_test", "used_at": self.database.promo_used_at}
                )
            return _Response(None)
        if self.table_name == "user_promo_codes" and self.operation == "update":
            self.database.promo_used_at = self.payload["used_at"]
            self.database.promo_update_count += 1
            return _Response([self.payload])
        if self.table_name == "user_subscriptions" and self.operation == "select":
            rows = list(self.database.subscriptions.values())
            for key, value in self.filters.items():
                rows = [row for row in rows if row.get(key) == value]
            return _Response(rows[0] if self.single and rows else (None if self.single else rows))
        if self.table_name == "user_subscriptions" and self.operation == "insert":
            subscription_id = self.payload["stripe_subscription_id"]
            if subscription_id in self.database.subscriptions:
                raise RuntimeError("duplicate stripe_subscription_id")
            self.database.subscriptions[subscription_id] = dict(self.payload)
            self.database.inserted_subscriptions.append(self.payload)
            return _Response([self.payload])
        if self.table_name == "user_subscriptions" and self.operation == "update":
            for subscription_id, row in self.database.subscriptions.items():
                if all(row.get(key) == value for key, value in self.filters.items()):
                    row.update(self.payload)
                    self.database.updated_subscription_ids.append(subscription_id)
            return _Response([self.payload])
        return _Response([])


class _FakeSupabase:
    def __init__(self, plan_exists=True):
        self.plan_exists = plan_exists
        self.inserted_subscriptions = []
        self.updated_subscription_ids = []
        self.subscriptions = {}
        self.promo_used_at = None
        self.promo_update_count = 0
        self.rpc_calls = []

    def table(self, table_name: str):
        return _Query(self, table_name)

    def rpc(self, name: str, params: dict):
        self.rpc_calls.append((name, params))
        return _RpcQuery()


class _RpcQuery:
    def execute(self):
        return _Response({"finalized": True, "user_id": "user_test"})


@pytest.mark.asyncio
async def test_checkout_completed_persists_clover_item_period(monkeypatch):
    """Le checkout doit projeter la période Clover réelle, pas maintenant + 30 jours."""
    database = _FakeSupabase()
    stripe_subscription = stripe.StripeObject.construct_from(
        {
            **CLOVER_SUBSCRIPTION,
            "customer": "cus_test",
            "cancel_at_period_end": False,
        },
        key=None,
    )

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=stripe_subscription),
    )
    monkeypatch.setattr(stripe_service, "log_event", Mock())
    monkeypatch.setattr(stripe_service, "send_admin_alert", AsyncMock(return_value=True))
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )

    await stripe_service.handle_checkout_completed(
        {
            "id": "cs_test_checkout",
            "metadata": {"user_id": "user_test", "plan_name": "pro"},
            "subscription": "sub_test_clover",
            "customer": "cus_test",
        },
        event_id="evt_test_checkout",
        claim_token="claim_test_checkout",
    )

    assert len(database.rpc_calls) == 1
    rpc_name, params = database.rpc_calls[0]
    assert rpc_name == "apply_stripe_checkout_completed"
    assert params["p_event_id"] == "evt_test_checkout"
    assert params["p_claim_token"] == "claim_test_checkout"
    assert params["p_period_start"] == "2026-08-09T16:00:00+00:00"
    assert params["p_period_end"] == "2026-09-09T16:00:00+00:00"


@pytest.mark.asyncio
async def test_checkout_delegates_projection_and_finalization_to_atomic_rpc(monkeypatch):
    """La projection et la finalisation doivent partager une transaction SQL."""
    database = _FakeSupabase()
    stripe_subscription = stripe.StripeObject.construct_from(
        {
            **CLOVER_SUBSCRIPTION,
            "customer": "cus_test",
            "cancel_at_period_end": False,
        },
        key=None,
    )
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=stripe_subscription),
    )
    monkeypatch.setattr(stripe_service, "log_event", Mock())
    monkeypatch.setattr(stripe_service, "send_admin_alert", AsyncMock(return_value=True))
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    session = {
        "id": "cs_test_checkout",
        "metadata": {"user_id": "user_test", "plan_name": "pro"},
        "subscription": "sub_test_clover",
        "customer": "cus_test",
    }

    await stripe_service.handle_checkout_completed(
        session,
        event_id="evt_test_checkout",
        claim_token="claim_test_checkout",
    )

    assert len(database.rpc_calls) == 1
    rpc_name, params = database.rpc_calls[0]
    assert rpc_name == "apply_stripe_checkout_completed"
    assert params["p_subscription_id"] == "sub_test_clover"
    assert params["p_subscription_status"] == "active"


@pytest.mark.asyncio
async def test_checkout_missing_plan_raises_for_webhook_retry(monkeypatch):
    """Un paiement sans plan local ne doit jamais être marqué processed."""
    monkeypatch.setattr(
        stripe_service,
        "supabase_client",
        _FakeSupabase(plan_exists=False),
    )

    with pytest.raises(RuntimeError, match="Plan Stripe introuvable"):
        await stripe_service.handle_checkout_completed(
            {
                "id": "cs_test_checkout",
                "metadata": {"user_id": "user_test", "plan_name": "pro"},
                "subscription": "sub_test_clover",
                "customer": "cus_test",
            }
        )


@pytest.mark.asyncio
async def test_reserved_checkout_uses_exact_session_snapshot_after_plan_rename(
    monkeypatch,
):
    """Un paiement réservé ne doit pas dépendre du nom de plan courant."""
    database = _FakeSupabase(plan_exists=False)
    stripe_subscription = stripe.StripeObject.construct_from(
        {
            **CLOVER_SUBSCRIPTION,
            "customer": "cus_test",
            "cancel_at_period_end": False,
        },
        key=None,
    )
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=stripe_subscription),
    )
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )

    await stripe_service.handle_checkout_completed(
        {
            "id": "cs_reserved",
            "metadata": {
                "user_id": "user_test",
                "plan_name": "renamed-pro",
                "checkout_reservation_token": "reservation-token",
            },
            "subscription": "sub_test_clover",
            "customer": "cus_test",
        },
        event_id="evt_reserved",
        claim_token="webhook-claim",
    )

    rpc_name, params = database.rpc_calls[0]
    assert rpc_name == "apply_stripe_checkout_completed"
    assert params["p_plan_id"] is None
    assert params["p_checkout_session_id"] == "cs_reserved"
    assert params["p_checkout_reservation_token"] == "reservation-token"


@pytest.mark.asyncio
async def test_checkout_payment_consumes_promo_once(monkeypatch):
    database = _FakeSupabase()
    stripe_subscription = stripe.StripeObject.construct_from(
        {
            **CLOVER_SUBSCRIPTION,
            "customer": "cus_test",
            "cancel_at_period_end": False,
        },
        key=None,
    )
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=stripe_subscription),
    )
    monkeypatch.setattr(stripe_service, "log_event", Mock())
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    session = {
        "id": "cs_test_checkout_promo",
        "metadata": {
            "user_id": "user_test",
            "plan_name": "pro",
            "promo_link_id": "promo_link_test",
        },
        "subscription": "sub_test_clover",
        "customer": "cus_test",
    }

    await stripe_service.handle_checkout_completed(
        session,
        event_id="evt_test_checkout_promo",
        claim_token="claim_test_checkout_promo",
    )

    assert len(database.rpc_calls) == 1
    rpc_name, params = database.rpc_calls[0]
    assert rpc_name == "apply_stripe_checkout_completed"
    assert params["p_promo_link_id"] == "promo_link_test"
