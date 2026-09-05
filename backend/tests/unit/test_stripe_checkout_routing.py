"""Régressions du routage Checkout selon l'abonnement existant."""

from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.services import stripe as stripe_service


@dataclass
class _Response:
    data: object


class _SubscriptionQuery:
    def __init__(self):
        self.allowed_statuses = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
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

    def maybe_single(self):
        return self

    def execute(self):
        if self.allowed_statuses and "past_due" in self.allowed_statuses:
            return _Response(
                {
                    "user_id": "user_test",
                    "status": "past_due",
                    "stripe_subscription_id": "sub_test_existing_past_due",
                    "subscription_plans": {"name": "pro"},
                }
            )
        return _Response(None)


class _FakeSupabase:
    def table(self, table_name: str):
        assert table_name == "user_subscriptions"
        return _SubscriptionQuery()


@pytest.mark.asyncio
async def test_existing_subscription_includes_past_due(monkeypatch):
    """Un impayé reste un abonnement Stripe existant à gérer, pas à dupliquer."""
    monkeypatch.setattr(stripe_service, "supabase_client", _FakeSupabase())

    result = await stripe_service.get_active_subscription("user_test")

    assert result is not None
    assert result["status"] == "past_due"
    assert result["stripe_subscription_id"] == "sub_test_existing_past_due"


@pytest.mark.asyncio
async def test_subscription_lookup_failure_is_not_treated_as_free_user(monkeypatch):
    class _FailingQuery(_SubscriptionQuery):
        def execute(self):
            raise RuntimeError("database unavailable")

    class _FailingSupabase:
        def table(self, table_name: str):
            assert table_name == "user_subscriptions"
            return _FailingQuery()

    monkeypatch.setattr(stripe_service, "supabase_client", _FailingSupabase())

    with pytest.raises(RuntimeError, match="database unavailable"):
        await stripe_service.get_active_subscription("user_test")


@pytest.mark.asyncio
async def test_subscription_lookup_accepts_supabase_no_row_response(monkeypatch):
    """Une absence de ligne Supabase doit être interprétée comme sans abonnement."""

    class _NoRowsQuery(_SubscriptionQuery):
        def execute(self):
            return None

    class _NoRowsSupabase:
        def table(self, table_name: str):
            assert table_name == "user_subscriptions"
            return _NoRowsQuery()

    monkeypatch.setattr(stripe_service, "supabase_client", _NoRowsSupabase())

    assert await stripe_service.get_active_subscription("user_without_row") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "malformed_response",
    [object(), _Response([]), _Response([{"unexpected": "row"}])],
)
async def test_subscription_lookup_rejects_malformed_supabase_response(
    monkeypatch,
    malformed_response,
):
    """Une réponse inconnue ne doit pas autoriser la création d'un doublon Stripe."""

    class _MalformedQuery(_SubscriptionQuery):
        def execute(self):
            return malformed_response

    class _MalformedSupabase:
        def table(self, table_name: str):
            assert table_name == "user_subscriptions"
            return _MalformedQuery()

    monkeypatch.setattr(stripe_service, "supabase_client", _MalformedSupabase())

    with pytest.raises(RuntimeError, match="Unexpected Supabase response"):
        await stripe_service.get_active_subscription("user_test")


@pytest.mark.asyncio
async def test_existing_subscription_uses_stripe_portal_confirmation(monkeypatch):
    class _Rpc:
        def execute(self):
            return _Response("price_test_premium")

    class _ProfilesQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def execute(self):
            return _Response([{"id": "user_test"}])

    class _CheckoutSupabase:
        def table(self, table_name: str):
            assert table_name == "profiles"
            return _ProfilesQuery()

        def rpc(self, *_args, **_kwargs):
            return _Rpc()

    portal_create = Mock(
        return_value=SimpleNamespace(
            id="bps_test_update",
            url="https://billing.stripe.test/update",
        )
    )
    create_checkout = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "supabase_client", _CheckoutSupabase())
    monkeypatch.setattr(
        stripe_service,
        "get_active_subscription",
        AsyncMock(
            return_value={
                "stripe_subscription_id": "sub_test_existing_long_id",
                "stripe_price_id": "price_test_pro",
                "subscription_plans": {"name": "pro"},
            }
        ),
    )
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(
            return_value=SimpleNamespace(
                customer="cus_test_existing",
                items=SimpleNamespace(
                    data=[
                        SimpleNamespace(
                            id="si_test_existing",
                            price=SimpleNamespace(id="price_test_pro"),
                        )
                    ]
                )
            )
        ),
    )
    monkeypatch.setattr(
        stripe_service.stripe.billing_portal.Session,
        "create",
        portal_create,
    )
    monkeypatch.setattr(stripe_service, "_create_new_checkout", create_checkout)

    result = await stripe_service.create_checkout_session(
        user_id="user_test",
        user_email="client@example.test",
        plan_name="premium",
        billing_period="monthly",
        success_url="https://example.test/success",
        cancel_url="https://example.test/cancel",
    )

    assert result["checkout_url"] == "https://billing.stripe.test/update"
    assert result["session_id"] == "bps_test_update"
    create_checkout.assert_not_awaited()
    portal_create.assert_called_once_with(
        customer="cus_test_existing",
        return_url="https://example.test/cancel",
        flow_data={
            "type": "subscription_update_confirm",
            "subscription_update_confirm": {
                "subscription": "sub_test_existing_long_id",
                "items": [
                    {"id": "si_test_existing", "price": "price_test_premium"}
                ],
            },
            "after_completion": {
                "type": "redirect",
                "redirect": {"return_url": "https://example.test/cancel"},
            },
        },
    )


@pytest.mark.asyncio
async def test_admin_granted_subscription_can_start_paid_checkout(monkeypatch):
    class _Rpc:
        def execute(self):
            return _Response("price_test_pro")

    class _ProfilesQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def execute(self):
            return _Response([{"id": "user_test"}])

    class _CheckoutSupabase:
        def table(self, table_name: str):
            assert table_name == "profiles"
            return _ProfilesQuery()

        def rpc(self, *_args, **_kwargs):
            return _Rpc()

    create_checkout = AsyncMock(return_value={"checkout_url": "https://checkout"})
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "supabase_client", _CheckoutSupabase())
    monkeypatch.setattr(
        stripe_service,
        "get_active_subscription",
        AsyncMock(
            return_value={
                "stripe_subscription_id": "admin_granted",
                "stripe_price_id": None,
                "subscription_plans": {"name": "pro"},
            }
        ),
    )
    monkeypatch.setattr(stripe_service, "_create_new_checkout", create_checkout)

    result = await stripe_service.create_checkout_session(
        user_id="user_test",
        user_email="client@example.test",
        plan_name="pro",
        billing_period="monthly",
        success_url="https://example.test/success",
        cancel_url="https://example.test/cancel",
    )

    assert result["checkout_url"] == "https://checkout"
    create_checkout.assert_awaited_once()


@pytest.mark.asyncio
async def test_promo_is_not_consumed_before_checkout_payment(monkeypatch):
    class _PromoQuery:
        def __init__(self, table_name: str, updates: list[dict[str, object]]):
            self.table_name = table_name
            self.updates = updates

        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def is_(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def maybe_single(self):
            return self

        def update(self, payload):
            self.updates.append(payload)
            return self

        def execute(self):
            if self.table_name == "user_promo_codes":
                return _Response([{"id": "promo_link_test", "promo_code_id": "promo_test"}])
            return _Response(
                {
                    "stripe_coupon_id": "coupon_test",
                    "is_active": True,
                    "starts_at": "2026-01-01T00:00:00Z",
                    "expires_at": "2027-01-01T00:00:00Z",
                    "plan": "pro",
                    "max_uses": 10,
                    "current_uses": 1,
                }
            )

    class _PromoSupabase:
        def __init__(self):
            self.updates: list[dict[str, object]] = []

        def table(self, table_name: str):
            return _PromoQuery(table_name, self.updates)

        def rpc(self, name: str, _params: dict):
            if name == "claim_subscription_checkout":
                return SimpleNamespace(
                    execute=lambda: _Response(
                        {
                            "action": "create",
                            "claim_token": "claim_test",
                            "previous_session_id": None,
                        }
                    )
                )
            if name == "finalize_subscription_checkout":
                return SimpleNamespace(execute=lambda: _Response(True))
            raise AssertionError(f"RPC inattendue: {name}")

    database = _PromoSupabase()
    session_create = Mock(
        return_value=SimpleNamespace(
            id="cs_test_promo",
            url="https://checkout.stripe.test/session",
        )
    )
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service,
        "_get_or_create_stripe_customer",
        AsyncMock(return_value="cus_test"),
    )
    monkeypatch.setattr(
        stripe_service.stripe.checkout.Session,
        "create",
        session_create,
    )

    result = await stripe_service._create_new_checkout(
        user_email="client@example.test",
        price_id="price_test",
        user_id="user_test",
        plan_name="pro",
        billing_period="monthly",
        success_url="https://example.test/success",
        cancel_url="https://example.test/cancel",
    )

    assert result["session_id"] == "cs_test_promo"
    assert database.updates == []
    checkout_metadata = session_create.call_args.kwargs["metadata"]
    assert checkout_metadata["promo_link_id"] == "promo_link_test"
    assert session_create.call_args.kwargs["idempotency_key"] == (
        "subscription-checkout:user_test:claim_test"
    )


@pytest.mark.asyncio
async def test_free_days_link_does_not_mask_stripe_coupon(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self.promo_id: str | None = None

        def select(self, *_args):
            return self

        def eq(self, key: str, value: str):
            if key == "id":
                self.promo_id = value
            return self

        def is_(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            if self.table_name == "user_promo_codes":
                return _Response(
                    [
                        {"id": "link_free", "promo_code_id": "promo_free"},
                        {"id": "link_coupon", "promo_code_id": "promo_coupon"},
                    ]
                )
            if self.promo_id == "promo_free":
                return _Response(
                    {
                        "stripe_coupon_id": None,
                        "is_active": True,
                    }
                )
            return _Response(
                {
                    "stripe_coupon_id": "coupon_test",
                    "is_active": True,
                    "starts_at": None,
                    "expires_at": None,
                    "plan": "pro",
                    "max_uses": 10,
                    "current_uses": 1,
                }
            )

    class _Database:
        def table(self, name: str):
            return _Query(name)

        def rpc(self, name: str, _params: dict):
            if name == "claim_subscription_checkout":
                return SimpleNamespace(
                    execute=lambda: _Response(
                        {
                            "action": "create",
                            "claim_token": "claim_coupon",
                            "previous_session_id": None,
                        }
                    )
                )
            if name == "finalize_subscription_checkout":
                return SimpleNamespace(execute=lambda: _Response(True))
            raise AssertionError(f"RPC inattendue: {name}")

    database = _Database()
    session_create = Mock(
        return_value=SimpleNamespace(
            id="cs_test_coupon",
            url="https://checkout.stripe.test/session",
        )
    )
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service,
        "_get_or_create_stripe_customer",
        AsyncMock(return_value="cus_test"),
    )
    monkeypatch.setattr(
        stripe_service.stripe.checkout.Session,
        "create",
        session_create,
    )

    await stripe_service._create_new_checkout(
        user_email="client@example.test",
        price_id="price_test",
        user_id="user_test",
        plan_name="pro",
        billing_period="monthly",
        success_url="https://example.test/success",
        cancel_url="https://example.test/cancel",
    )

    assert session_create.call_args.kwargs["discounts"] == [
        {"coupon": "coupon_test"}
    ]
    assert session_create.call_args.kwargs["metadata"]["promo_link_id"] == (
        "link_coupon"
    )


@pytest.mark.asyncio
async def test_invalid_newest_coupon_does_not_mask_older_valid_coupon(monkeypatch):
    """Un coupon expiré ne doit pas bloquer les autres choix de paiement."""
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name
            self.promo_id: str | None = None

        def select(self, *_args):
            return self

        def eq(self, key: str, value: str):
            if key == "id":
                self.promo_id = value
            return self

        def is_(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            if self.table_name == "user_promo_codes":
                return _Response(
                    [
                        {"id": "link_expired", "promo_code_id": "expired"},
                        {"id": "link_valid", "promo_code_id": "valid"},
                    ]
                )
            if self.promo_id == "expired":
                return _Response(
                    {
                        "stripe_coupon_id": "coupon_expired",
                        "is_active": False,
                        "starts_at": None,
                        "expires_at": None,
                        "plan": "pro",
                        "max_uses": 10,
                        "current_uses": 1,
                    }
                )
            return _Response(
                {
                    "stripe_coupon_id": "coupon_valid",
                    "is_active": True,
                    "starts_at": None,
                    "expires_at": None,
                    "plan": "pro",
                    "max_uses": 10,
                    "current_uses": 1,
                }
            )

    class _Database:
        def table(self, name: str):
            return _Query(name)

        def rpc(self, name: str, _params: dict):
            if name == "claim_subscription_checkout":
                return SimpleNamespace(
                    execute=lambda: _Response(
                        {
                            "action": "create",
                            "claim_token": "claim_valid_coupon",
                            "previous_session_id": None,
                        }
                    )
                )
            if name == "finalize_subscription_checkout":
                return SimpleNamespace(execute=lambda: _Response(True))
            raise AssertionError(f"RPC inattendue: {name}")

    session_create = Mock(
        return_value=SimpleNamespace(
            id="cs_valid_coupon",
            url="https://checkout.stripe.test/valid",
        )
    )
    monkeypatch.setattr(stripe_service, "supabase_client", _Database())
    monkeypatch.setattr(
        stripe_service,
        "_get_or_create_stripe_customer",
        AsyncMock(return_value="cus_test"),
    )
    monkeypatch.setattr(
        stripe_service.stripe.checkout.Session,
        "create",
        session_create,
    )

    await stripe_service._create_new_checkout(
        user_email="client@example.test",
        price_id="price_test",
        user_id="user_test",
        plan_name="pro",
        billing_period="monthly",
        success_url="https://example.test/success",
        cancel_url="https://example.test/cancel",
    )

    assert session_create.call_args.kwargs["discounts"] == [
        {"coupon": "coupon_valid"}
    ]
    assert session_create.call_args.kwargs["metadata"]["promo_link_id"] == (
        "link_valid"
    )


@pytest.mark.asyncio
async def test_same_checkout_selection_reuses_open_session(monkeypatch):
    class _EmptyPromoQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def is_(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            return _Response([])

    class _Database:
        def table(self, _name: str):
            return _EmptyPromoQuery()

        def rpc(self, name: str, _params: dict):
            assert name == "claim_subscription_checkout"
            return SimpleNamespace(
                execute=lambda: _Response(
                    {"action": "reuse", "session_id": "cs_existing"}
                )
            )

    create = Mock()
    monkeypatch.setattr(stripe_service, "supabase_client", _Database())
    monkeypatch.setattr(
        stripe_service,
        "_get_or_create_stripe_customer",
        AsyncMock(return_value="cus_test"),
    )
    monkeypatch.setattr(
        stripe_service.stripe.checkout.Session,
        "retrieve",
        Mock(
            return_value=SimpleNamespace(
                status="open",
                url="https://checkout.stripe.test/existing",
            )
        ),
    )
    monkeypatch.setattr(stripe_service.stripe.checkout.Session, "create", create)

    result = await stripe_service._create_new_checkout(
        user_email="client@example.test",
        price_id="price_test",
        user_id="user_test",
        plan_name="pro",
        billing_period="monthly",
        success_url="https://example.test/success",
        cancel_url="https://example.test/cancel",
    )

    assert result["session_id"] == "cs_existing"
    create.assert_not_called()


@pytest.mark.asyncio
async def test_different_checkout_selection_expires_previous_session(monkeypatch):
    rpc_calls: list[str] = []

    class _EmptyPromoQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def is_(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            return _Response([])

    class _Database:
        def table(self, _name: str):
            return _EmptyPromoQuery()

        def rpc(self, name: str, _params: dict):
            rpc_calls.append(name)
            if name == "claim_subscription_checkout":
                return SimpleNamespace(
                    execute=lambda: _Response(
                        {
                            "action": "replace",
                            "claim_token": "claim_replacement",
                            "previous_session_id": "cs_previous",
                        }
                    )
                )
            if name == "finalize_subscription_checkout":
                return SimpleNamespace(execute=lambda: _Response(True))
            raise AssertionError(f"RPC inattendue: {name}")

    expire = Mock()
    create = Mock(
        return_value=SimpleNamespace(
            id="cs_replacement",
            url="https://checkout.stripe.test/replacement",
        )
    )
    monkeypatch.setattr(stripe_service, "supabase_client", _Database())
    monkeypatch.setattr(
        stripe_service,
        "_get_or_create_stripe_customer",
        AsyncMock(return_value="cus_test"),
    )
    monkeypatch.setattr(
        stripe_service.stripe.checkout.Session,
        "retrieve",
        Mock(return_value=SimpleNamespace(status="open")),
    )
    monkeypatch.setattr(stripe_service.stripe.checkout.Session, "expire", expire)
    monkeypatch.setattr(stripe_service.stripe.checkout.Session, "create", create)

    result = await stripe_service._create_new_checkout(
        user_email="client@example.test",
        price_id="price_premium",
        user_id="user_test",
        plan_name="premium",
        billing_period="yearly",
        success_url="https://example.test/success",
        cancel_url="https://example.test/cancel",
    )

    assert result["session_id"] == "cs_replacement"
    expire.assert_called_once_with("cs_previous")
    assert create.call_args.kwargs["idempotency_key"] == (
        "subscription-checkout:user_test:claim_replacement"
    )
    assert rpc_calls == [
        "claim_subscription_checkout",
        "finalize_subscription_checkout",
    ]
