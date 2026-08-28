"""Régressions des routes de gestion d'abonnement Stripe."""

from dataclasses import dataclass
from unittest.mock import AsyncMock, Mock

import pytest
import stripe
from fastapi import Request

from src.api.routes import stripe as stripe_routes
from tests.fixtures.stripe_events import CLOVER_SUBSCRIPTION


@dataclass
class _Response:
    data: object


class _SubscriptionQuery:
    def __init__(self):
        self.allowed_statuses = None
        self.filters = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        if key == "status":
            self.allowed_statuses = [value]
        return self

    def in_(self, key, values):
        if key == "status":
            self.allowed_statuses = list(values)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if (
            self.filters.get("user_id") == "user_test"
            and self.allowed_statuses
            and "past_due" in self.allowed_statuses
        ):
            return _Response(
                [
                    {
                        "stripe_subscription_id": "sub_test_past_due",
                        "status": "past_due",
                        "subscription_plans": {"name": "pro"},
                    }
                ]
            )
        return _Response([])


class _FakeSupabase:
    def table(self, table_name: str):
        assert table_name == "user_subscriptions"
        return _SubscriptionQuery()


@pytest.mark.asyncio
async def test_checkout_cancellation_returns_to_dedicated_page(monkeypatch):
    """Un abandon Checkout doit afficher l'écran d'annulation prévu."""
    create_checkout = AsyncMock(
        return_value={
            "checkout_url": "https://checkout.stripe.test/session",
            "session_id": "cs_test_session",
        }
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/stripe/create-checkout-session",
            "headers": [],
            "client": ("test", 1234),
        }
    )
    monkeypatch.setattr(stripe_routes, "create_checkout_session", create_checkout)
    monkeypatch.setattr(
        type(stripe_routes.settings),
        "get_primary_frontend_url",
        Mock(return_value="https://www.huntzenjobs.com"),
    )
    checkout_route = getattr(stripe_routes.create_stripe_checkout, "__wrapped__", None)
    assert checkout_route is not None

    result = await checkout_route(
        request=request,
        plan_name="starter",
        billing_period="monthly",
        current_user={"id": "user_test", "email": "client@example.test"},
    )

    assert result["checkout_url"] == "https://checkout.stripe.test/session"
    assert create_checkout.await_args.kwargs["cancel_url"] == (
        "https://www.huntzenjobs.com/payment/cancel"
    )


@pytest.mark.asyncio
async def test_cancel_subscription_accepts_past_due_status(monkeypatch):
    """Un client en impayé doit pouvoir programmer l'arrêt de son abonnement."""
    modify = Mock(
        return_value={
            **CLOVER_SUBSCRIPTION,
            "id": "sub_test_past_due",
            "cancel_at_period_end": True,
        }
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/stripe/cancel-subscription",
            "headers": [],
            "client": ("test", 1234),
            "scheme": "http",
            "server": ("test", 80),
        }
    )

    monkeypatch.setattr(stripe_routes, "supabase_client", _FakeSupabase())
    monkeypatch.setattr(stripe.Subscription, "modify", modify)

    cancel_route = getattr(stripe_routes.cancel_subscription, "__wrapped__", None)
    assert cancel_route is not None
    result = await cancel_route(request=request, current_user={"id": "user_test"})

    assert result["success"] is True
    assert result["cancel_at_period_end"] is True
    assert result["current_period_end"] == 1_788_969_600
    modify.assert_called_once_with(
        "sub_test_past_due",
        cancel_at_period_end=True,
    )


@pytest.mark.asyncio
async def test_reactivate_subscription_returns_clover_period_end(monkeypatch):
    """La réactivation doit renvoyer la vraie fin de période Clover."""
    modify = Mock(
        return_value={
            **CLOVER_SUBSCRIPTION,
            "id": "sub_test_past_due",
            "cancel_at_period_end": False,
        }
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/stripe/reactivate-subscription",
            "headers": [],
            "client": ("test", 1234),
            "scheme": "http",
            "server": ("test", 80),
        }
    )

    monkeypatch.setattr(stripe_routes, "supabase_client", _FakeSupabase())
    monkeypatch.setattr(stripe.Subscription, "modify", modify)

    reactivate_route = getattr(stripe_routes.reactivate_subscription, "__wrapped__", None)
    assert reactivate_route is not None
    result = await reactivate_route(request=request, current_user={"id": "user_test"})

    assert result["success"] is True
    assert result["cancel_at_period_end"] is False
    assert result["current_period_end"] == 1_788_969_600
    modify.assert_called_once_with(
        "sub_test_past_due",
        cancel_at_period_end=False,
    )


@pytest.mark.asyncio
async def test_reactivate_subscription_accepts_trialing_status(monkeypatch):
    class _TrialingQuery(_SubscriptionQuery):
        def execute(self):
            if (
                self.filters.get("user_id") == "user_test"
                and self.allowed_statuses
                and "trialing" in self.allowed_statuses
            ):
                return _Response(
                    [
                        {
                            "stripe_subscription_id": "sub_test_trialing",
                            "status": "trialing",
                            "subscription_plans": {"name": "pro"},
                        }
                    ]
                )
            return _Response([])

    class _TrialingSupabase:
        def table(self, table_name: str):
            assert table_name == "user_subscriptions"
            return _TrialingQuery()

    modify = Mock(return_value={"id": "sub_test_trialing", "items": {"data": []}})
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/stripe/reactivate-subscription",
            "headers": [],
        }
    )
    monkeypatch.setattr(stripe_routes, "supabase_client", _TrialingSupabase())
    monkeypatch.setattr(stripe.Subscription, "modify", modify)
    reactivate_route = getattr(stripe_routes.reactivate_subscription, "__wrapped__", None)
    assert reactivate_route is not None

    result = await reactivate_route(
        request=request,
        current_user={"id": "user_test"},
    )

    assert result["success"] is True
    modify.assert_called_once_with("sub_test_trialing", cancel_at_period_end=False)


@pytest.mark.asyncio
async def test_cancel_subscription_requires_authenticated_user():
    """Une route appelée sans identité valide doit refuser avant toute requête."""
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/stripe/cancel-subscription",
            "headers": [],
        }
    )
    cancel_route = getattr(stripe_routes.cancel_subscription, "__wrapped__", None)
    assert cancel_route is not None

    with pytest.raises(Exception) as exc_info:
        await cancel_route(request=request, current_user={})

    assert getattr(exc_info.value, "status_code", None) == 401


@pytest.mark.asyncio
async def test_cancel_subscription_cannot_modify_another_user(monkeypatch):
    """L'ownership Supabase doit empêcher toute mutation Stripe inter-compte."""
    modify = Mock()
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/stripe/cancel-subscription",
            "headers": [],
        }
    )
    monkeypatch.setattr(stripe_routes, "supabase_client", _FakeSupabase())
    monkeypatch.setattr(stripe.Subscription, "modify", modify)
    cancel_route = getattr(stripe_routes.cancel_subscription, "__wrapped__", None)
    assert cancel_route is not None

    with pytest.raises(Exception) as exc_info:
        await cancel_route(request=request, current_user={"id": "other_user"})

    assert getattr(exc_info.value, "status_code", None) == 404
    modify.assert_not_called()


@pytest.mark.asyncio
async def test_cancel_subscription_stays_successful_when_period_is_missing(monkeypatch):
    """Une résiliation Stripe réussie ne doit pas être présentée comme échouée."""
    modify = Mock(
        return_value={
            "id": "sub_test_past_due",
            "cancel_at_period_end": True,
            "items": {"data": []},
        }
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/stripe/cancel-subscription",
            "headers": [],
        }
    )
    monkeypatch.setattr(stripe_routes, "supabase_client", _FakeSupabase())
    monkeypatch.setattr(stripe.Subscription, "modify", modify)
    cancel_route = getattr(stripe_routes.cancel_subscription, "__wrapped__", None)
    assert cancel_route is not None

    result = await cancel_route(request=request, current_user={"id": "user_test"})

    assert result["success"] is True
    assert result["current_period_end"] is None
