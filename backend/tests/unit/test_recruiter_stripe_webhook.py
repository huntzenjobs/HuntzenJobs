"""Régression du webhook Stripe historique des demandes recruteur."""

from dataclasses import dataclass
from unittest.mock import AsyncMock, Mock

import pytest
import stripe
from starlette.requests import Request

from src.api.routes import recruiter as recruiter_routes
from src.services import stripe as stripe_service


@dataclass
class _Response:
    data: object


class _RecruiterQuery:
    def __init__(self, database: "_RecruiterDatabase"):
        self.database = database
        self.operation = "select"
        self.payload = None

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.database.error:
            raise self.database.error
        if self.operation == "update":
            self.database.updates.append(self.payload)
            self.database.request.update(self.payload)
            return _Response([self.payload])
        return _Response([dict(self.database.request)])


class _RecruiterDatabase:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.updates = []
        self.request = {
            "email": "client@example.test",
            "full_name": "Client Test",
            "phone": None,
            "sector": "Tech",
            "experience_level": "5 ans",
            "message": "Demande de test suffisamment longue",
            "preferred_date": "2026-08-20",
            "payment_status": "pending",
        }

    def table(self, table_name: str):
        assert table_name == "recruiter_requests"
        return _RecruiterQuery(self)


@pytest.mark.asyncio
async def test_recruiter_webhook_delegates_to_central_idempotent_dispatcher(monkeypatch):
    """L'ancienne URL ne doit plus posséder une deuxième logique de paiement."""
    payload = b'{"id":"evt_recruiter_test"}'
    dispatcher = AsyncMock(
        return_value={
            "status": "success",
            "event": "checkout.session.completed",
        }
    )

    async def receive():
        return {"type": "http.request", "body": payload, "more_body": False}

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/recruiter/webhook",
            "headers": [(b"stripe-signature", b"signature_test")],
        },
        receive,
    )
    monkeypatch.setattr(recruiter_routes, "handle_stripe_webhook", dispatcher, raising=False)

    result = await recruiter_routes.stripe_webhook(request)

    assert result == {
        "status": "success",
        "event": "checkout.session.completed",
    }
    dispatcher.assert_awaited_once_with(payload, "signature_test")


@pytest.mark.asyncio
async def test_central_recruiter_handler_supports_stripe_object_and_sends_both_emails(
    monkeypatch,
):
    """Le dispatcher unique conserve confirmation client et notification admin."""
    database = _RecruiterDatabase()
    confirmation = Mock(return_value=True)
    notification = Mock(return_value=True)
    session = stripe.StripeObject.construct_from(
        {
            "id": "cs_test_recruiter",
            "payment_intent": "pi_test_recruiter",
            "metadata": {"request_id": "request_test"},
        },
        key=None,
    )
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service,
        "send_recruiter_request_confirmation",
        confirmation,
    )
    monkeypatch.setattr(
        stripe_service,
        "send_recruiter_request_notification",
        notification,
        raising=False,
    )

    await stripe_service.handle_recruiter_checkout(session)
    await stripe_service.handle_recruiter_checkout(session)

    assert database.updates == [
        {
            "payment_status": "paid",
            "payment_intent_id": "pi_test_recruiter",
        }
    ]
    confirmation.assert_called_once()
    notification.assert_called_once()


@pytest.mark.asyncio
async def test_central_recruiter_handler_propagates_database_failure(monkeypatch):
    """Une mutation échouée doit provoquer une relivraison Stripe."""
    session = {
        "id": "cs_test_recruiter",
        "payment_intent": "pi_test_recruiter",
        "metadata": {"request_id": "request_test"},
    }
    monkeypatch.setattr(
        stripe_service,
        "supabase_client",
        _RecruiterDatabase(error=RuntimeError("database unavailable")),
    )

    with pytest.raises(RuntimeError, match="database unavailable"):
        await stripe_service.handle_recruiter_checkout(session)
