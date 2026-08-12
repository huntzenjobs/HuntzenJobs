"""Régressions de sécurité du dispatch des webhooks Stripe."""

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from src.services import stripe as stripe_service


@dataclass
class _Response:
    data: object


class _RpcResult:
    def __init__(self, data=None, error: Exception | None = None):
        self.data = data
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return _Response(self.data)


class _FakeSupabase:
    def __init__(
        self,
        claim_status="claimed",
        error: Exception | None = None,
        mark_processed_result=True,
    ):
        self.claim_status = claim_status
        self.error = error
        self.mark_processed_result = mark_processed_result
        self.calls = []

    def rpc(self, function_name: str, params):
        self.calls.append((function_name, params))
        if function_name == "claim_stripe_webhook_event":
            return _RpcResult(
                {
                    "status": self.claim_status,
                    "claim_token": "claim_test_token"
                    if self.claim_status == "claimed"
                    else None,
                },
                self.error,
            )
        if function_name == "mark_webhook_event_processed":
            return _RpcResult(self.mark_processed_result)
        if function_name == "mark_webhook_event_failed":
            return _RpcResult(True)
        raise AssertionError(f"RPC inattendue: {function_name}")


def _event():
    return {
        "id": "evt_test_duplicate",
        "type": "customer.subscription.updated",
        "data": {"object": {"id": "sub_test_clover"}},
    }


def _invoice_paid_event():
    return {
        "id": "evt_test_invoice_paid",
        "type": "invoice.paid",
        "data": {"object": {"id": "in_test_paid"}},
    }


def _signature(payload: bytes, secret: str) -> str:
    timestamp = int(time.time())
    signed_payload = f"{timestamp}.".encode() + payload
    digest = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


@pytest.mark.asyncio
async def test_webhook_rejects_missing_secret_before_handler(monkeypatch):
    """Le webhook doit rester fermé si le secret de signature est absent."""
    handler = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "")
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    with pytest.raises(HTTPException) as exc_info:
        await stripe_service.handle_stripe_webhook(b"{}", "signature")

    assert exc_info.value.status_code == 500
    handler.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_real_signature_before_handler(monkeypatch):
    """La vérification HMAC réelle doit rejeter un secret différent."""
    payload = json.dumps(_event(), separators=(",", ":")).encode()
    handler = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_expected")
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    with pytest.raises(HTTPException) as exc_info:
        await stripe_service.handle_stripe_webhook(
            payload,
            _signature(payload, "whsec_wrong"),
        )

    assert exc_info.value.status_code == 400
    handler.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_duplicate_is_skipped(monkeypatch):
    """Un événement Stripe déjà traité ne doit déclencher aucun handler."""
    handler = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    database = _FakeSupabase(claim_status="processed")
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(stripe_service.stripe.Webhook, "construct_event", lambda *_args: _event())
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    result = await stripe_service.handle_stripe_webhook(b"payload", "signature")

    assert result["note"] == "already_processed"
    handler.assert_not_awaited()
    assert [name for name, _params in database.calls] == ["claim_stripe_webhook_event"]


@pytest.mark.asyncio
async def test_webhook_refuses_processing_when_idempotency_check_fails(monkeypatch):
    """Sans verrou d'idempotence, Stripe doit retenter plutôt que doubler les effets."""
    handler = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        stripe_service,
        "supabase_client",
        _FakeSupabase(error=RuntimeError("RPC unavailable")),
    )
    monkeypatch.setattr(stripe_service.stripe.Webhook, "construct_event", lambda *_args: _event())
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    with pytest.raises(HTTPException) as exc_info:
        await stripe_service.handle_stripe_webhook(b"payload", "signature")

    assert exc_info.value.status_code == 503
    handler.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_in_progress_is_retried_without_second_handler(monkeypatch):
    """Deux livraisons simultanées ne doivent jamais exécuter deux handlers."""
    handler = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(
        stripe_service,
        "supabase_client",
        _FakeSupabase(claim_status="processing"),
    )
    monkeypatch.setattr(stripe_service.stripe.Webhook, "construct_event", lambda *_args: _event())
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    with pytest.raises(HTTPException) as exc_info:
        await stripe_service.handle_stripe_webhook(b"payload", "signature")

    assert exc_info.value.status_code == 503
    handler.assert_not_awaited()


@pytest.mark.asyncio
async def test_webhook_marks_event_only_after_handler_success(monkeypatch):
    """Le statut processed n'est écrit qu'après la réussite métier."""
    database = _FakeSupabase()
    handler = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(stripe_service.stripe.Webhook, "construct_event", lambda *_args: _event())
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    result = await stripe_service.handle_stripe_webhook(b"payload", "signature")

    assert result["status"] == "success"
    handler.assert_awaited_once()
    assert [name for name, _params in database.calls] == [
        "claim_stripe_webhook_event",
        "mark_webhook_event_processed",
    ]
    assert database.calls[1][1]["p_claim_token"] == "claim_test_token"


@pytest.mark.asyncio
async def test_webhook_marks_failed_handler_for_safe_retry(monkeypatch):
    """Un échec métier libère explicitement l'événement pour une relivraison."""
    database = _FakeSupabase()
    handler = AsyncMock(side_effect=RuntimeError("handler failed"))
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(stripe_service.stripe.Webhook, "construct_event", lambda *_args: _event())
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    with pytest.raises(RuntimeError, match="handler failed"):
        await stripe_service.handle_stripe_webhook(b"payload", "signature")

    assert [name for name, _params in database.calls] == [
        "claim_stripe_webhook_event",
        "mark_webhook_event_failed",
    ]
    assert database.calls[1][1]["p_claim_token"] == "claim_test_token"


@pytest.mark.asyncio
async def test_webhook_refuses_success_when_finalization_did_not_update(monkeypatch):
    """Un marquage processed sans ligne modifiée ne doit jamais produire un faux 200."""
    database = _FakeSupabase(mark_processed_result=False)
    handler = AsyncMock()
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(stripe_service.stripe.Webhook, "construct_event", lambda *_args: _event())
    monkeypatch.setattr(stripe_service, "handle_subscription_updated", handler)

    with pytest.raises(HTTPException) as exc_info:
        await stripe_service.handle_stripe_webhook(b"payload", "signature")

    assert exc_info.value.status_code == 503
    handler.assert_awaited_once()


@pytest.mark.asyncio
async def test_transactional_handler_owns_webhook_finalization(monkeypatch):
    """Une RPC métier atomique ne doit jamais être finalisée une seconde fois."""
    database = _FakeSupabase()
    handler = AsyncMock(return_value=True)
    monkeypatch.setattr(stripe_service, "STRIPE_ENABLED", True)
    monkeypatch.setattr(stripe_service, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setattr(stripe_service, "supabase_client", database)
    monkeypatch.setattr(
        stripe_service.stripe.Webhook,
        "construct_event",
        lambda *_args: _invoice_paid_event(),
    )
    monkeypatch.setattr(stripe_service, "handle_invoice_paid", handler)

    result = await stripe_service.handle_stripe_webhook(b"payload", "signature")

    assert result == {"status": "success", "event": "invoice.paid"}
    handler.assert_awaited_once_with(
        {"id": "in_test_paid"},
        event_id="evt_test_invoice_paid",
        claim_token="claim_test_token",
    )
    assert [name for name, _params in database.calls] == [
        "claim_stripe_webhook_event",
    ]
