"""Traitement durable et idempotent des effets externes Stripe."""

import asyncio
import threading
from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import stripe

from src.services import referrals as referral_service
from src.services import stripe_outbox


@dataclass
class _Response:
    data: object


class _RpcCall:
    def __init__(self, database: "_Database", name: str, params: dict):
        self.database = database
        self.name = name
        self.params = params

    def execute(self):
        self.database.execution_threads.append(threading.get_ident())
        self.database.calls.append((self.name, self.params))
        if self.name == "claim_stripe_effects":
            return _Response(self.database.effects)
        if self.name == "mark_stripe_effect_succeeded":
            return _Response(True)
        if self.name == "retry_stripe_effect":
            return _Response({"updated": True, "status": "pending"})
        raise AssertionError(f"RPC inattendue: {self.name}")


class _Database:
    def __init__(self, effects: list[dict]):
        self.effects = effects
        self.calls: list[tuple[str, dict]] = []
        self.execution_threads: list[int] = []

    def rpc(self, name: str, params: dict):
        return _RpcCall(self, name, params)


def _effect(effect_id: str, attempt_count: int = 1) -> dict:
    return {
        "id": effect_id,
        "effect_type": "payment_confirmation_client",
        "subject_type": "invoice",
        "subject_id": "in_test_outbox",
        "dedupe_key": f"payment-confirmation-client:{effect_id}",
        "claim_token": f"claim_{effect_id}",
        "attempt_count": attempt_count,
        "payload": {"invoice_id": "in_test_outbox"},
    }


@pytest.mark.asyncio
async def test_outbox_marks_success_only_after_delivery(monkeypatch):
    database = _Database([_effect("effect_success")])
    deliver = AsyncMock(return_value="email_provider_id")
    monkeypatch.setattr(stripe_outbox, "deliver_stripe_effect", deliver)

    result = await stripe_outbox.process_stripe_effects(database, limit=10)

    assert result == {"claimed": 1, "succeeded": 1, "retried": 0, "dead": 0}
    deliver.assert_awaited_once_with(database, database.effects[0])
    assert database.calls == [
        ("claim_stripe_effects", {"p_limit": 10}),
        (
            "mark_stripe_effect_succeeded",
            {
                "p_effect_id": "effect_success",
                "p_claim_token": "claim_effect_success",
                "p_provider_message_id": "email_provider_id",
            },
        ),
    ]


@pytest.mark.asyncio
async def test_outbox_database_operations_do_not_block_event_loop(monkeypatch):
    main_thread = threading.get_ident()
    database = _Database([_effect("effect_threaded_database")])
    monkeypatch.setattr(
        stripe_outbox,
        "deliver_stripe_effect",
        AsyncMock(return_value="provider_message_id"),
    )

    await stripe_outbox.process_stripe_effects(database, limit=1)

    assert len(database.execution_threads) == 2
    assert all(thread_id != main_thread for thread_id in database.execution_threads)


@pytest.mark.asyncio
async def test_outbox_times_out_delivery_before_releasing_claim(monkeypatch):
    database = _Database([_effect("effect_timeout")])
    delivery_started = asyncio.Event()

    async def delivery_never_finishes(*_args):
        delivery_started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(stripe_outbox, "deliver_stripe_effect", delivery_never_finishes)

    result = await stripe_outbox.process_stripe_effects(
        database,
        limit=1,
        effect_timeout_seconds=0.01,
    )

    assert delivery_started.is_set()
    assert result == {"claimed": 1, "succeeded": 0, "retried": 1, "dead": 0}
    assert database.calls[-1][0] == "retry_stripe_effect"
    assert database.calls[-1][1]["p_error_type"] == "TimeoutError"


@pytest.mark.asyncio
async def test_outbox_retries_failed_delivery_with_bounded_backoff(monkeypatch):
    database = _Database([_effect("effect_retry", attempt_count=3)])
    monkeypatch.setattr(
        stripe_outbox,
        "deliver_stripe_effect",
        AsyncMock(side_effect=RuntimeError("Resend unavailable")),
    )

    result = await stripe_outbox.process_stripe_effects(database, limit=20)

    assert result == {"claimed": 1, "succeeded": 0, "retried": 1, "dead": 0}
    assert database.calls == [
        ("claim_stripe_effects", {"p_limit": 20}),
        (
            "retry_stripe_effect",
            {
                "p_effect_id": "effect_retry",
                "p_claim_token": "claim_effect_retry",
                "p_error_type": "RuntimeError",
                "p_retry_seconds": 120,
            },
        ),
    ]


@pytest.mark.asyncio
async def test_outbox_counts_dead_letter_response(monkeypatch):
    database = _Database([_effect("effect_dead", attempt_count=8)])
    monkeypatch.setattr(
        stripe_outbox,
        "deliver_stripe_effect",
        AsyncMock(side_effect=RuntimeError("permanent failure")),
    )

    original_rpc = database.rpc

    def rpc(name: str, params: dict):
        call = original_rpc(name, params)
        if name == "retry_stripe_effect":
            call.execute = lambda: (
                database.calls.append((name, params))
                or _Response({"updated": True, "status": "dead"})
            )
        return call

    monkeypatch.setattr(database, "rpc", rpc)

    result = await stripe_outbox.process_stripe_effects(database)

    assert result == {"claimed": 1, "succeeded": 0, "retried": 0, "dead": 1}


@pytest.mark.asyncio
async def test_outbox_rejects_effect_without_owner_token(monkeypatch):
    effect = _effect("effect_missing_token")
    effect["claim_token"] = None
    database = _Database([effect])
    deliver = AsyncMock(return_value="should_not_send")
    monkeypatch.setattr(stripe_outbox, "deliver_stripe_effect", deliver)

    with pytest.raises(RuntimeError, match="without owner token"):
        await stripe_outbox.process_stripe_effects(database)

    deliver.assert_not_awaited()


@pytest.mark.asyncio
async def test_payment_confirmation_uses_resend_idempotency_key(monkeypatch):
    invoice = stripe.StripeObject.construct_from(
        {
            "id": "in_test_outbox",
            "amount_paid": 1_390,
            "currency": "eur",
            "customer_email": "client@example.test",
            "hosted_invoice_url": "https://example.test/invoice",
            "invoice_pdf": None,
            "billing_reason": "subscription_cycle",
            "parent": {
                "type": "subscription_details",
                "subscription_details": {"subscription": "sub_test_outbox"},
            },
        },
        key=None,
    )
    subscription = stripe.StripeObject.construct_from(
        {
            "id": "sub_test_outbox",
            "items": {
                "data": [
                    {"price": {"product": "prod_test_outbox"}},
                ]
            },
        },
        key=None,
    )
    send_email = Mock(return_value=True)
    monkeypatch.setattr(
        stripe_outbox.stripe.Invoice,
        "retrieve",
        Mock(return_value=invoice),
    )
    monkeypatch.setattr(
        stripe_outbox.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )
    monkeypatch.setattr(
        stripe_outbox.stripe.Product,
        "retrieve",
        Mock(return_value=SimpleNamespace(name="Accélérateur")),
    )
    monkeypatch.setattr(
        stripe_outbox,
        "send_payment_confirmation_email",
        send_email,
    )
    effect = _effect("effect_email")

    provider_id = await stripe_outbox.deliver_stripe_effect(object(), effect)

    assert provider_id == effect["dedupe_key"]
    send_email.assert_called_once_with(
        user_email="client@example.test",
        plan_name="Accélérateur",
        amount="13.90 EUR",
        invoice_url="https://example.test/invoice",
        invoice_pdf_url=None,
        billing_reason="subscription_cycle",
        idempotency_key=effect["dedupe_key"],
    )


@pytest.mark.asyncio
async def test_payment_admin_alert_does_not_require_customer_email(monkeypatch):
    invoice = stripe.StripeObject.construct_from(
        {
            "id": "in_test_admin",
            "amount_paid": 1_390,
            "currency": "eur",
            "parent": {
                "type": "subscription_details",
                "subscription_details": {"subscription": "sub_test_admin"},
            },
        },
        key=None,
    )
    send_alert = AsyncMock(return_value=True)
    monkeypatch.setattr(
        stripe_outbox.stripe.Invoice,
        "retrieve",
        Mock(return_value=invoice),
    )
    monkeypatch.setattr(stripe_outbox, "send_admin_alert", send_alert)
    effect = {
        "effect_type": "payment_received_admin",
        "subject_type": "invoice",
        "subject_id": "in_test_admin",
        "dedupe_key": "payment-received-admin:in_test_admin",
        "payload": {},
    }

    provider_id = await stripe_outbox.deliver_stripe_effect(object(), effect)

    assert provider_id == effect["dedupe_key"]
    send_alert.assert_awaited_once_with(
        subject="Paiement reçu — 13.90 EUR",
        body="Montant: 13.90 EUR\nStripe sub: sub_test_admin\nInvoice ID: in_test_admin",
        severity="info",
        skip_throttle=True,
        category="payment_received",
        idempotency_key=effect["dedupe_key"],
        strict=True,
    )


@pytest.mark.asyncio
async def test_payment_stripe_lookups_run_outside_event_loop(monkeypatch):
    main_thread = threading.get_ident()
    lookup_threads: list[int] = []

    def record_thread(result):
        def lookup(*_args, **_kwargs):
            lookup_threads.append(threading.get_ident())
            return result

        return lookup

    invoice = stripe.StripeObject.construct_from(
        {
            "id": "in_test_outbox",
            "amount_paid": 1_390,
            "currency": "eur",
            "customer_email": "client@example.test",
            "billing_reason": "subscription_cycle",
            "parent": {
                "type": "subscription_details",
                "subscription_details": {"subscription": "sub_test_outbox"},
            },
        },
        key=None,
    )
    subscription = stripe.StripeObject.construct_from(
        {
            "id": "sub_test_outbox",
            "items": {"data": [{"price": {"product": "prod_test_outbox"}}]},
        },
        key=None,
    )
    monkeypatch.setattr(
        stripe_outbox.stripe.Invoice,
        "retrieve",
        record_thread(invoice),
    )
    monkeypatch.setattr(
        stripe_outbox.stripe.Subscription,
        "retrieve",
        record_thread(subscription),
    )
    monkeypatch.setattr(
        stripe_outbox.stripe.Product,
        "retrieve",
        record_thread(SimpleNamespace(name="Accélérateur")),
    )
    monkeypatch.setattr(
        stripe_outbox,
        "send_payment_confirmation_email",
        Mock(return_value=True),
    )

    await stripe_outbox.deliver_stripe_effect(
        object(),
        _effect("effect_threaded_stripe"),
    )

    assert len(lookup_threads) == 3
    assert all(thread_id != main_thread for thread_id in lookup_threads)


@pytest.mark.asyncio
async def test_delivery_failure_is_not_reported_as_success(monkeypatch):
    invoice = stripe.StripeObject.construct_from(
        {
            "id": "in_test_outbox",
            "amount_paid": 1_390,
            "currency": "eur",
            "customer_email": "client@example.test",
            "billing_reason": "subscription_cycle",
            "parent": {
                "type": "subscription_details",
                "subscription_details": {"subscription": "sub_test_outbox"},
            },
        },
        key=None,
    )
    subscription = stripe.StripeObject.construct_from(
        {"id": "sub_test_outbox", "items": {"data": []}},
        key=None,
    )
    monkeypatch.setattr(
        stripe_outbox.stripe.Invoice,
        "retrieve",
        Mock(return_value=invoice),
    )
    monkeypatch.setattr(
        stripe_outbox.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )
    monkeypatch.setattr(
        stripe_outbox,
        "send_payment_confirmation_email",
        Mock(return_value=False),
    )

    with pytest.raises(RuntimeError, match="delivery failed"):
        await stripe_outbox.deliver_stripe_effect(object(), _effect("effect_false"))


@pytest.mark.asyncio
async def test_referral_reward_is_applied_from_durable_outbox(monkeypatch):
    apply_reward = AsyncMock(return_value=True)
    monkeypatch.setattr(
        stripe_outbox,
        "apply_pending_referral_reward",
        apply_reward,
    )
    effect = {
        "effect_type": "referral_reward",
        "subject_type": "referral_reward",
        "subject_id": "reward_test",
        "dedupe_key": "referral-reward:signup_test",
        "payload": {},
    }
    database = object()

    provider_id = await stripe_outbox.deliver_stripe_effect(database, effect)

    assert provider_id == "referral-reward:signup_test"
    apply_reward.assert_awaited_once_with(database, "reward_test")


@pytest.mark.asyncio
async def test_referral_coupon_uses_stable_stripe_idempotency_key(monkeypatch):
    class _Query:
        def __init__(self, table_name: str):
            self.table_name = table_name

        def select(self, *_args):
            return self

        def update(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def in_(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            if self.table_name == "user_subscriptions":
                return _Response([{"stripe_subscription_id": "sub_referrer"}])
            return _Response([{"id": "reward_test"}])

    database = SimpleNamespace(table=lambda name: _Query(name))
    modify = Mock()
    monkeypatch.setattr(stripe.Subscription, "modify", modify)

    applied = await referral_service._apply_stripe_coupon(
        database,
        "user_referrer",
        {"coupon_id": "coupon_referral"},
        "reward_test",
    )

    assert applied is True
    modify.assert_called_once_with(
        "sub_referrer",
        discounts=[{"coupon": "coupon_referral"}],
        idempotency_key="referral-reward:reward_test",
    )


@pytest.mark.asyncio
async def test_free_days_on_stripe_subscription_extend_trial_idempotently(monkeypatch):
    class _Call:
        def __init__(self, response):
            self.response = response

        def execute(self):
            return self.response

        def update(self, *_args):
            return self

        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def maybe_single(self):
            return self

    class _Database:
        def rpc(self, name, _params):
            if name == "apply_referral_reward_record":
                return _Call(
                    _Response(
                        {
                            "applied": False,
                            "requires_external": True,
                            "external_type": "stripe_trial_extension",
                        "subscription_id": "sub_referrer",
                        "trial_end": 1_800_000_000,
                        "lease_token": "lease_referral",
                        "idempotency_key": (
                            "trial-extension:user_referrer:sub_referrer:1800000000"
                        ),
                        }
                    )
                )
            if name == "mark_referral_trial_extension_applied":
                assert _params == {
                    "p_reward_id": "reward_test",
                    "p_subscription_id": "sub_referrer",
                    "p_trial_end": 1_800_000_000,
                    "p_lease_token": "lease_referral",
                }
                return _Call(_Response(True))
            raise AssertionError(f"RPC inattendue: {name}")

        def table(self, table_name):
            assert table_name == "referral_rewards"
            return _Call(_Response([{"id": "reward_test", "applied": True}]))

    modify = Mock()
    monkeypatch.setattr(stripe.Subscription, "modify", modify)

    applied = await referral_service.apply_pending_referral_reward(
        _Database(),
        "reward_test",
    )

    assert applied is True
    modify.assert_called_once_with(
        "sub_referrer",
        trial_end=1_800_000_000,
        proration_behavior="none",
        idempotency_key=(
            "trial-extension:user_referrer:sub_referrer:1800000000"
        ),
    )


@pytest.mark.asyncio
async def test_promo_free_days_uses_durable_idempotent_trial_extension(monkeypatch):
    calls: list[tuple[str, dict]] = []

    class _Call:
        def __init__(self, response):
            self.response = response

        def execute(self):
            return _Response(self.response)

    class _Database:
        def rpc(self, name: str, params: dict):
            calls.append((name, params))
            if name == "prepare_promo_free_days":
                return _Call(
                    {
                        "applied": False,
                        "external_type": "stripe_trial_extension",
                        "subscription_id": "sub_promo",
                        "trial_end": 1_900_000_000,
                        "lease_token": "lease_promo",
                        "idempotency_key": (
                            "trial-extension:user_promo:sub_promo:1900000000"
                        ),
                    }
                )
            if name == "mark_promo_free_days_applied":
                return _Call(True)
            raise AssertionError(f"RPC inattendue: {name}")

    modify = Mock()
    monkeypatch.setattr(stripe.Subscription, "modify", modify)
    effect = {
        "effect_type": "promo_free_days",
        "subject_type": "promo_code",
        "subject_id": "promo_link_test",
        "dedupe_key": "promo-free-days:promo_link_test",
        "payload": {},
    }

    result = await stripe_outbox.deliver_stripe_effect(_Database(), effect)

    assert result == effect["dedupe_key"]
    modify.assert_called_once_with(
        "sub_promo",
        trial_end=1_900_000_000,
        proration_behavior="none",
        idempotency_key="trial-extension:user_promo:sub_promo:1900000000",
    )
    assert calls == [
        (
            "prepare_promo_free_days",
            {"p_promo_link_id": "promo_link_test"},
        ),
        (
            "mark_promo_free_days_applied",
            {
                "p_promo_link_id": "promo_link_test",
                "p_subscription_id": "sub_promo",
                "p_trial_end": 1_900_000_000,
                "p_lease_token": "lease_promo",
            },
        ),
    ]


@pytest.mark.asyncio
async def test_cancellation_email_uses_immutable_outbox_period(monkeypatch):
    """Une réactivation ultérieure ne doit pas changer la date déjà promise."""

    class _TableQuery:
        def __init__(self, table_name: str):
            self.table_name = table_name

        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            if self.table_name == "user_subscriptions":
                return _Response(
                    {
                        "user_id": "user_test",
                        "plan_id": "plan_new",
                        "current_period_end": "2027-01-31T00:00:00+00:00",
                        "stripe_customer_id": "cus_test_client",
                    }
                )
            return _Response({"display_name": "Plan historique"})

    database = SimpleNamespace(table=lambda name: _TableQuery(name))
    send_email = Mock(return_value=True)
    monkeypatch.setattr(
        stripe_outbox.stripe.Customer,
        "retrieve",
        Mock(return_value=SimpleNamespace(email="client@example.test")),
    )
    monkeypatch.setattr(
        stripe_outbox,
        "send_subscription_cancelled_email",
        send_email,
    )
    effect = {
        "effect_type": "subscription_cancelled_client",
        "subject_id": "sub_test_outbox",
        "dedupe_key": "subscription-cancelled-client:sub_test_outbox:1788998400",
        "payload": {
            "period_end": "2026-09-10T00:00:00+00:00",
            "plan_id": "plan_historic",
        },
    }

    await stripe_outbox.deliver_stripe_effect(database, effect)

    send_email.assert_called_once_with(
        user_email="client@example.test",
        plan_name="Plan historique",
        end_date="10/09/2026",
        idempotency_key=effect["dedupe_key"],
    )


@pytest.mark.asyncio
async def test_scheduled_cancellation_is_skipped_after_reactivation(monkeypatch):
    class _TableQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            return _Response(
                {
                    "user_id": "user_test",
                    "plan_id": "plan_test",
                    "current_period_end": "2026-09-10T00:00:00+00:00",
                    "stripe_customer_id": "cus_test_client",
                    "cancel_at_period_end": False,
                    "status": "active",
                }
            )

    database = SimpleNamespace(table=lambda _name: _TableQuery())
    send_email = Mock(return_value=True)
    monkeypatch.setattr(
        stripe_outbox,
        "send_subscription_cancelled_email",
        send_email,
    )
    effect = {
        "effect_type": "subscription_cancelled_client",
        "subject_id": "sub_test_outbox",
        "dedupe_key": "subscription-cancelled-client:evt_old_cancel",
        "payload": {
            "cancellation_mode": "scheduled",
            "period_end": "2026-09-10T00:00:00+00:00",
        },
    }

    result = await stripe_outbox.deliver_stripe_effect(database, effect)

    assert result == effect["dedupe_key"]
    send_email.assert_not_called()


def test_single_row_reports_missing_subject_without_attribute_error():
    with pytest.raises(RuntimeError, match="subject missing: subscription"):
        stripe_outbox._single_row(None, label="subscription")
