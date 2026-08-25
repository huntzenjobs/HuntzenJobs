"""Régressions des webhooks Stripe liés aux factures."""

from dataclasses import dataclass
from unittest.mock import AsyncMock, Mock

import pytest
import stripe

from src.services import notifications
from src.services import stripe as stripe_service
from tests.fixtures.stripe_events import CLOVER_INVOICE, CLOVER_SUBSCRIPTION


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
        self.selected_columns = ""

    def select(self, *args, **_kwargs):
        self.operation = "select"
        self.selected_columns = args[0] if args else ""
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def maybe_single(self):
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def upsert(self, payload, **_kwargs):
        self.operation = "upsert"
        self.payload = payload
        return self

    def execute(self):
        if self.table_name == "stripe_payments" and self.operation == "select":
            invoice_id = self.filters.get("stripe_invoice_id")
            return _Response(
                {"stripe_invoice_id": invoice_id}
                if invoice_id in self.database.payment_invoice_ids
                else None
            )
        if self.table_name == "stripe_payments" and self.operation == "upsert":
            if self.database.payment_upsert_error:
                raise self.database.payment_upsert_error
            self.database.payment_invoice_ids.add(self.payload["stripe_invoice_id"])
            return _Response([self.payload])
        if self.table_name != "user_subscriptions":
            return _Response(None)
        if self.operation == "select":
            return _Response(
                {
                    "user_id": "user_test",
                    "status": self.database.subscription_status,
                }
            )
        if self.operation == "update":
            if self.database.update_returns_empty:
                return _Response([])
            if "status" in self.payload:
                self.database.subscription_status = self.payload["status"]
            self.database.subscription_updates.append(
                {"payload": self.payload, "filters": self.filters}
            )
            return _Response([{"user_id": "user_test", **self.payload}])
        return _Response(None)


class _FakeSupabase:
    def __init__(
        self,
        update_returns_empty=False,
        subscription_status="active",
        payment_upsert_error: Exception | None = None,
    ):
        self.update_returns_empty = update_returns_empty
        self.subscription_status = subscription_status
        self.payment_upsert_error = payment_upsert_error
        self.subscription_updates = []
        self.payment_invoice_ids = set()

    def table(self, table_name: str):
        return _Query(self, table_name)


@pytest.mark.asyncio
async def test_payment_failed_reads_clover_invoice_subscription(monkeypatch):
    """Une facture Clover refusée doit passer le bon abonnement en past_due."""
    database = _FakeSupabase()
    create_notification = Mock(return_value=True)

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(notifications, "create_notification", create_notification)
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(stripe_service, "send_admin_alert", AsyncMock(return_value=True))

    await stripe_service.handle_payment_failed(CLOVER_INVOICE)

    assert len(database.subscription_updates) == 1
    update = database.subscription_updates[0]
    assert update["filters"] == {"stripe_subscription_id": "sub_test_clover"}
    assert update["payload"]["status"] == "past_due"
    assert update["payload"]["updated_at"].endswith("+00:00")
    assert create_notification.call_count == 1


@pytest.mark.asyncio
async def test_invoice_paid_refreshes_clover_subscription_period(monkeypatch):
    """Une facture Clover payée doit réactiver les droits avec la période réelle."""
    database = _FakeSupabase()
    subscription = stripe.StripeObject.construct_from(CLOVER_SUBSCRIPTION, key=None)

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(stripe_service, "send_admin_alert", AsyncMock(return_value=True))

    await stripe_service.handle_invoice_paid(CLOVER_INVOICE)

    assert len(database.subscription_updates) == 1
    update = database.subscription_updates[0]
    assert update["filters"] == {"stripe_subscription_id": "sub_test_clover"}
    assert update["payload"] == {
        "current_period_start": "2026-08-09T16:00:00+00:00",
        "current_period_end": "2026-09-09T16:00:00+00:00",
        "status": "active",
    }


@pytest.mark.asyncio
async def test_invoice_paid_propagates_entitlement_sync_failure(monkeypatch):
    """Une période non synchronisée doit faire retenter l'événement financier."""
    monkeypatch.setattr(stripe_service, "supabase_client", _FakeSupabase())
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(side_effect=RuntimeError("Stripe unavailable")),
    )
    monkeypatch.setattr(stripe_service, "send_admin_alert", AsyncMock(return_value=True))

    with pytest.raises(RuntimeError, match="Stripe unavailable"):
        await stripe_service.handle_invoice_paid(CLOVER_INVOICE)


@pytest.mark.asyncio
async def test_invoice_paid_retry_skips_duplicate_emails_and_alerts(monkeypatch):
    """Une relivraison finalisée tardivement ne doit pas notifier deux fois."""
    database = _FakeSupabase()
    subscription = stripe.StripeObject.construct_from(CLOVER_SUBSCRIPTION, key=None)
    invoice = {**CLOVER_INVOICE, "amount_paid": 1_390}
    confirmation = Mock(return_value=True)
    admin_alert = AsyncMock(return_value=True)

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        stripe_service,
        "send_payment_confirmation_email",
        confirmation,
    )
    monkeypatch.setattr(stripe_service, "send_admin_alert", admin_alert)

    await stripe_service.handle_invoice_paid(invoice)
    await stripe_service.handle_invoice_paid(invoice)

    confirmation.assert_called_once()
    admin_alert.assert_awaited_once()


@pytest.mark.asyncio
async def test_payment_failed_raises_when_local_subscription_is_missing(monkeypatch):
    """Un impayé sans projection locale doit rester à retenter/réconcilier."""
    monkeypatch.setattr(
        stripe_service,
        "supabase_client",
        _FakeSupabase(update_returns_empty=True),
    )

    with pytest.raises(RuntimeError, match="missing from local projection"):
        await stripe_service.handle_payment_failed(CLOVER_INVOICE)


@pytest.mark.asyncio
async def test_payment_failed_retry_notifies_only_on_status_transition(monkeypatch):
    """Un retry past_due ne doit pas renvoyer les mêmes notifications."""
    database = _FakeSupabase()
    create_notification = Mock(return_value=True)
    failed_email = Mock(return_value=True)
    admin_alert = AsyncMock(return_value=True)

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(notifications, "create_notification", create_notification)
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        stripe_service.stripe.Customer,
        "retrieve",
        Mock(return_value=Mock(email="client@example.test")),
    )
    monkeypatch.setattr(stripe_service, "send_payment_failed_email", failed_email)
    monkeypatch.setattr(stripe_service, "send_admin_alert", admin_alert)

    invoice = {**CLOVER_INVOICE, "customer": "cus_test_client"}
    await stripe_service.handle_payment_failed(invoice)
    await stripe_service.handle_payment_failed(invoice)

    create_notification.assert_called_once()
    failed_email.assert_called_once()
    admin_alert.assert_awaited_once()


@pytest.mark.asyncio
async def test_invoice_paid_raises_when_local_subscription_is_missing(monkeypatch):
    """Un client payé sans ligne locale ne doit jamais produire un faux succès."""
    subscription = stripe.StripeObject.construct_from(CLOVER_SUBSCRIPTION, key=None)
    monkeypatch.setattr(
        stripe_service,
        "supabase_client",
        _FakeSupabase(update_returns_empty=True),
    )
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )

    with pytest.raises(RuntimeError, match="missing from local projection"):
        await stripe_service.handle_invoice_paid(CLOVER_INVOICE)


@pytest.mark.asyncio
async def test_invoice_paid_requires_financial_ledger_before_notifications(monkeypatch):
    """Un journal financier indisponible doit bloquer les notifications et retenter."""
    subscription = stripe.StripeObject.construct_from(CLOVER_SUBSCRIPTION, key=None)
    confirmation = Mock(return_value=True)
    admin_alert = AsyncMock(return_value=True)
    database = _FakeSupabase(
        payment_upsert_error=RuntimeError("ledger unavailable")
    )

    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Subscription,
        "retrieve",
        Mock(return_value=subscription),
    )
    monkeypatch.setattr(
        stripe_service,
        "invalidate_user_quota_cache",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(
        stripe_service,
        "send_payment_confirmation_email",
        confirmation,
    )
    monkeypatch.setattr(stripe_service, "send_admin_alert", admin_alert)

    with pytest.raises(RuntimeError, match="ledger unavailable"):
        await stripe_service.handle_invoice_paid(
            {**CLOVER_INVOICE, "amount_paid": 1_390}
        )

    confirmation.assert_not_called()
    admin_alert.assert_not_awaited()


@pytest.mark.asyncio
async def test_subscription_deleted_raises_when_local_subscription_is_missing(
    monkeypatch,
):
    """Une suppression Stripe sans projection locale doit rester à réconcilier."""
    monkeypatch.setattr(
        stripe_service,
        "supabase_client",
        _FakeSupabase(update_returns_empty=True),
    )

    with pytest.raises(RuntimeError, match="missing from local projection"):
        await stripe_service.handle_subscription_deleted(
            {"id": "sub_test_clover"}
        )
