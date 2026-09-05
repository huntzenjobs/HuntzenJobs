"""Traitement durable de l'outbox support."""

from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest
from fastapi import HTTPException

from src.api.routes import cron
from src.services import support_delivery_outbox as outbox

EFFECT_ID = "11111111-1111-4111-8111-111111111111"
TICKET_ID = "22222222-2222-4222-8222-222222222222"
MESSAGE_ID = "33333333-3333-4333-8333-333333333333"
DEDUPE_KEY = "44444444-4444-4444-8444-444444444444"
WORKER_ID = "55555555-5555-4555-8555-555555555555"


@dataclass
class _Response:
    data: Any


class _RpcCall:
    def __init__(self, database: "_Database", name: str, params: dict[str, Any]):
        self.database = database
        self.name = name
        self.params = params

    def execute(self):
        self.database.calls.append((self.name, self.params))
        if self.name == "claim_support_deliveries":
            effect = {
                "id": EFFECT_ID,
                "ticket_id": TICKET_ID,
                "message_id": MESSAGE_ID,
                "delivery_kind": "admin_reply",
                "dedupe_key": DEDUPE_KEY,
                "lease_owner": self.database.foreign_owner or self.params["p_worker_id"],
                "attempt_count": self.database.attempt_count,
                "payload": {"status": "resolved"},
            }
            return _Response([effect])
        if self.name == "mark_support_delivery_succeeded":
            return _Response(True)
        if self.name == "fail_support_delivery":
            return _Response({"updated": True, "status": self.database.failure_status})
        raise AssertionError(f"RPC inattendue: {self.name}")


class _Database:
    def __init__(
        self,
        *,
        failure_status: str = "pending",
        attempt_count: int = 1,
        foreign_owner: str | None = None,
    ):
        self.failure_status = failure_status
        self.attempt_count = attempt_count
        self.foreign_owner = foreign_owner
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]):
        return _RpcCall(self, name, params)


@pytest.mark.asyncio
async def test_processor_marks_success_with_same_lease_owner(monkeypatch) -> None:
    database = _Database()
    deliver = AsyncMock()
    monkeypatch.setattr(outbox, "deliver_support_effect", deliver)

    result = await outbox.process_support_deliveries(database, limit=4)

    assert result == {"claimed": 1, "succeeded": 1, "retried": 0, "dead": 0}
    claim_params = database.calls[0][1]
    success_params = database.calls[1][1]
    assert database.calls[0][0] == "claim_support_deliveries"
    assert success_params == {
        "p_delivery_id": EFFECT_ID,
        "p_worker_id": claim_params["p_worker_id"],
    }
    deliver.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("database", "expected"),
    [
        (_Database(attempt_count=2), {"claimed": 1, "succeeded": 0, "retried": 1, "dead": 0}),
        (
            _Database(failure_status="dead", attempt_count=8),
            {"claimed": 1, "succeeded": 0, "retried": 0, "dead": 1},
        ),
    ],
)
async def test_processor_retries_or_dead_letters_without_error_content(
    monkeypatch,
    database: _Database,
    expected: dict[str, int],
) -> None:
    monkeypatch.setattr(
        outbox,
        "deliver_support_effect",
        AsyncMock(side_effect=RuntimeError("adresse@example.test contenu privé")),
    )

    result = await outbox.process_support_deliveries(database)

    assert result == expected
    failure_name, failure_params = database.calls[-1]
    assert failure_name == "fail_support_delivery"
    assert failure_params["p_error"] == "RuntimeError"
    assert "adresse" not in str(failure_params)
    assert 1 <= failure_params["p_retry_seconds"] <= 3600


@pytest.mark.asyncio
async def test_processor_rejects_claim_returned_for_another_worker(monkeypatch) -> None:
    database = _Database(foreign_owner="99999999-9999-4999-8999-999999999999")
    deliver = AsyncMock()
    monkeypatch.setattr(outbox, "deliver_support_effect", deliver)

    with pytest.raises(RuntimeError, match="lease ownership"):
        await outbox.process_support_deliveries(database)

    deliver.assert_not_awaited()


class _ContextQuery:
    def __init__(self, database: "_ContextDatabase", table: str):
        self.database = database
        self.table = table

    def select(self, _columns: str):
        return self

    def eq(self, _column: str, _value: Any):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self.table == "support_tickets":
            return _Response(
                {
                    "id": TICKET_ID,
                    "user_id": "user",
                    "user_email": "alice@example.test",
                    "user_name": "Alice",
                    "user_plan": "pro",
                    "page_url": "/profile",
                    "category": "question",
                    "priority": "normal",
                    "subject": "Sujet",
                    "description": "Description",
                }
            )
        if self.table == "support_ticket_messages":
            return _Response(
                {"id": MESSAGE_ID, "ticket_id": TICKET_ID, "content": "Réponse admin"}
            )
        raise AssertionError(self.table)


class _ContextDatabase:
    def table(self, name: str):
        return _ContextQuery(self, name)


class _NotificationQuery:
    def __init__(self, database: "_NotificationDatabase"):
        self.database = database

    def select(self, _columns: str):
        raise AssertionError("SELECT puis INSERT n'est pas une déduplication atomique")

    def upsert(self, payload: dict[str, Any], **kwargs: Any):
        self.database.upserts.append((payload, kwargs))
        return self

    def execute(self):
        return _Response([])


class _NotificationDatabase:
    def __init__(self):
        self.upserts: list[tuple[dict[str, Any], dict[str, Any]]] = []

    def table(self, name: str):
        assert name == "user_notifications"
        return _NotificationQuery(self)


def test_notification_uses_atomic_deterministic_upsert() -> None:
    database = _NotificationDatabase()

    for _attempt in range(2):
        assert outbox._create_notification_once(
            database,
            user_id="user",
            ticket_id=TICKET_ID,
            dedupe_key=DEDUPE_KEY,
            notification_type="support_ticket_reply",
            title="Réponse support",
            message="Une réponse est disponible.",
        )

    first_payload, first_options = database.upserts[0]
    second_payload, second_options = database.upserts[1]
    assert first_payload == second_payload
    assert UUID(first_payload["id"]).version == 5
    assert first_payload == {
        "id": first_payload["id"],
        "user_id": "user",
        "type": "support_ticket_reply",
        "title": "Réponse support",
        "body": "Une réponse est disponible.",
        "data": {
            "support_dedupe_key": DEDUPE_KEY,
            "ticket_id": TICKET_ID,
        },
        "read": False,
    }
    assert first_options == second_options == {
        "on_conflict": "id",
        "ignore_duplicates": True,
    }


@pytest.mark.asyncio
async def test_reply_delivery_reuses_dedupe_for_resend_and_notification(monkeypatch) -> None:
    send_reply = Mock(return_value=True)
    notify = Mock(return_value=True)
    monkeypatch.setattr(outbox, "send_support_ticket_reply", send_reply)
    monkeypatch.setattr(outbox, "_create_notification_once", notify)
    monkeypatch.setattr(outbox, "_checkpoint_delivery_channel", Mock(return_value=True))
    effect = {
        "id": EFFECT_ID,
        "ticket_id": TICKET_ID,
        "message_id": MESSAGE_ID,
        "delivery_kind": "admin_reply",
        "dedupe_key": DEDUPE_KEY,
        "lease_owner": WORKER_ID,
    }

    await outbox.deliver_support_effect(_ContextDatabase(), effect)

    assert send_reply.call_args.kwargs["idempotency_key"] == f"support:{DEDUPE_KEY}"
    assert notify.call_args.kwargs["dedupe_key"] == DEDUPE_KEY


@pytest.mark.asyncio
async def test_reply_checkpoints_email_before_attempting_notification(monkeypatch) -> None:
    events: list[str] = []

    def send_reply(**_kwargs: Any) -> bool:
        events.append("email")
        return True

    def checkpoint(_supabase: Any, *, channel: str, **_kwargs: Any) -> bool:
        events.append(f"checkpoint:{channel}")
        return True

    def notify(_supabase: Any, **_kwargs: Any) -> bool:
        events.append("notification")
        return True

    monkeypatch.setattr(outbox, "send_support_ticket_reply", send_reply)
    monkeypatch.setattr(outbox, "_checkpoint_delivery_channel", checkpoint, raising=False)
    monkeypatch.setattr(outbox, "_create_notification_once", notify)

    await outbox.deliver_support_effect(
        _ContextDatabase(),
        {
            "id": EFFECT_ID,
            "ticket_id": TICKET_ID,
            "message_id": MESSAGE_ID,
            "delivery_kind": "admin_reply",
            "dedupe_key": DEDUPE_KEY,
            "lease_owner": WORKER_ID,
            "email_delivered_at": None,
            "notification_delivered_at": None,
        },
    )

    assert events == [
        "email",
        "checkpoint:email",
        "notification",
        "checkpoint:notification",
    ]


@pytest.mark.asyncio
async def test_reply_retry_skips_email_after_durable_checkpoint(monkeypatch) -> None:
    send_reply = Mock(return_value=True)
    checkpoint = Mock(return_value=True)
    notify = Mock(return_value=True)
    monkeypatch.setattr(outbox, "send_support_ticket_reply", send_reply)
    monkeypatch.setattr(outbox, "_checkpoint_delivery_channel", checkpoint, raising=False)
    monkeypatch.setattr(outbox, "_create_notification_once", notify)

    await outbox.deliver_support_effect(
        _ContextDatabase(),
        {
            "id": EFFECT_ID,
            "ticket_id": TICKET_ID,
            "message_id": MESSAGE_ID,
            "delivery_kind": "admin_reply",
            "dedupe_key": DEDUPE_KEY,
            "lease_owner": WORKER_ID,
            "email_delivered_at": "2026-09-05T09:00:00Z",
            "notification_delivered_at": None,
        },
    )

    send_reply.assert_not_called()
    notify.assert_called_once()
    assert checkpoint.call_args.kwargs["channel"] == "notification"


@pytest.mark.asyncio
async def test_email_or_notification_failure_keeps_effect_retryable(monkeypatch) -> None:
    monkeypatch.setattr(outbox, "send_support_ticket_reply", Mock(return_value=False))
    monkeypatch.setattr(outbox, "_create_notification_once", Mock(return_value=True))
    effect = {
        "id": EFFECT_ID,
        "ticket_id": TICKET_ID,
        "message_id": MESSAGE_ID,
        "delivery_kind": "admin_reply",
        "dedupe_key": DEDUPE_KEY,
        "lease_owner": WORKER_ID,
    }

    with pytest.raises(RuntimeError, match="email delivery failed"):
        await outbox.deliver_support_effect(_ContextDatabase(), effect)


@pytest.mark.asyncio
async def test_support_cron_is_secret_protected_and_bounded(monkeypatch) -> None:
    process = AsyncMock(return_value={"claimed": 0, "succeeded": 0, "retried": 0, "dead": 0})
    monkeypatch.setattr(cron, "CRON_SECRET", "cron-test")
    monkeypatch.setattr(cron, "process_support_deliveries", process, raising=False)
    monkeypatch.setattr(cron, "get_supabase_client", lambda: object())

    with pytest.raises(HTTPException) as unauthorized:
        await cron.support_effects_cron("Bearer wrong")
    assert unauthorized.value.status_code == 401
    process.assert_not_awaited()

    response = await cron.support_effects_cron("Bearer cron-test")
    assert response == {
        "success": True,
        "summary": {"claimed": 0, "succeeded": 0, "retried": 0, "dead": 0},
    }
    process.assert_awaited_once()
    call_options = process.await_args.kwargs
    assert call_options["lease_seconds"] >= cron.SUPPORT_OUTBOX_CRON_TIMEOUT_SECONDS
    assert (
        call_options["limit"] * call_options["effect_timeout_seconds"]
        <= cron.SUPPORT_OUTBOX_CRON_TIMEOUT_SECONDS - 20
    )
