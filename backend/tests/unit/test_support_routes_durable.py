"""Contrats runtime des routes support durables."""

import sys
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from src.api.routes import support

USER_ID = "11111111-1111-4111-8111-111111111111"
ADMIN_ID = "22222222-2222-4222-8222-222222222222"
TICKET_ID = "33333333-3333-4333-8333-333333333333"
REQUEST_ID = "44444444-4444-4444-8444-444444444444"


@dataclass
class _Response:
    data: Any = None
    count: int | None = None


class _RateLimitError(Exception):
    code = "P0001"
    message = "support_ticket_rate_limit_exceeded"


class _Query:
    def __init__(self, database: "_Database", table: str):
        self.database = database
        self.table = table
        self.operations: list[tuple[str, Any]] = []

    def _chain(self, name: str, value: Any = None):
        self.operations.append((name, value))
        return self

    def select(self, columns: str, **kwargs):
        return self._chain("select", (columns, kwargs))

    def eq(self, column: str, value: Any):
        return self._chain("eq", (column, value))

    def gte(self, column: str, value: Any):
        return self._chain("gte", (column, value))

    def order(self, column: str, **kwargs):
        return self._chain("order", (column, kwargs))

    def range(self, start: int, end: int):
        return self._chain("range", (start, end))

    def limit(self, value: int):
        return self._chain("limit", value)

    def maybe_single(self):
        return self._chain("maybe_single")

    def single(self):
        return self._chain("single")

    def or_(self, expression: str):
        return self._chain("or", expression)

    def insert(self, payload: dict[str, Any]):
        self.database.direct_writes.append((self.table, "insert", payload))
        raise AssertionError("INSERT direct interdit dans les routes support")

    def update(self, payload: dict[str, Any]):
        self.database.direct_writes.append((self.table, "update", payload))
        raise AssertionError("UPDATE direct interdit dans les routes support")

    def execute(self):
        self.database.queries.append((self.table, list(self.operations)))
        return self.database.execute_query(self.table, self.operations)


class _Rpc:
    def __init__(self, database: "_Database", name: str, params: dict[str, Any]):
        self.database = database
        self.name = name
        self.params = params

    def execute(self):
        self.database.rpc_calls.append((self.name, self.params))
        if self.name == "get_user_current_subscription":
            return _Response([{"plan_name": "pro"}])
        if self.name == "create_support_ticket_idempotent":
            if self.database.rate_limited:
                raise _RateLimitError
            return _Response([{"id": TICKET_ID, "status": "open"}])
        if self.name in {
            "reply_support_ticket_idempotent",
            "set_support_ticket_status_idempotent",
        }:
            return _Response("55555555-5555-4555-8555-555555555555")
        if self.name == "log_security_event":
            return _Response(True)
        raise AssertionError(f"RPC inattendue: {self.name}")


class _StorageBucket:
    def create_signed_url(self, path: str, expires_in: int):
        return {"signedURL": f"https://signed.invalid/{path}?ttl={expires_in}"}


class _Storage:
    def from_(self, _bucket: str):
        return _StorageBucket()


class _Database:
    def __init__(
        self,
        *,
        rate_limited: bool = False,
        ticket_owner: str = USER_ID,
        profile_exists: bool = True,
        ticket_exists: bool = True,
    ):
        self.rate_limited = rate_limited
        self.ticket_owner = ticket_owner
        self.profile_exists = profile_exists
        self.ticket_exists = ticket_exists
        self.queries: list[tuple[str, list[tuple[str, Any]]]] = []
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []
        self.direct_writes: list[tuple[str, str, dict[str, Any]]] = []
        self.storage = _Storage()

    def table(self, name: str):
        return _Query(self, name)

    def rpc(self, name: str, params: dict[str, Any]):
        return _Rpc(self, name, params)

    def execute_query(self, table: str, operations: list[tuple[str, Any]]):
        equals = {value[0]: value[1] for name, value in operations if name == "eq"}
        select = next((value for name, value in operations if name == "select"), ("", {}))
        columns, options = select
        if table == "profiles":
            if not self.profile_exists:
                return None
            return _Response({"full_name": "Alice Exemple"})
        if table == "support_ticket_messages":
            return _Response(
                [{"id": "message", "author_role": "admin", "content": "Réponse", "created_at": "2026-08-31T00:00:00Z"}]
            )
        if table == "support_tickets" and options.get("count") == "exact":
            if "status" in equals:
                return _Response([], {"open": 3, "in_progress": 2, "resolved": 5}.get(equals["status"], 0))
            return _Response(
                [{"id": TICKET_ID, "user_id": self.ticket_owner, "subject": "Sujet test"}],
                10,
            )
        if table == "support_tickets" and columns == "id" and "request_id" in equals:
            return _Response([])
        if table == "support_tickets" and columns == "id" and "id" in equals:
            if not self.ticket_exists:
                return None
            if equals.get("user_id") and equals["user_id"] != self.ticket_owner:
                return None
            return _Response({"id": TICKET_ID})
        if table == "support_tickets":
            return _Response({"id": TICKET_ID, "user_id": self.ticket_owner, "subject": "Sujet test"})
        raise AssertionError(f"Requête inattendue sur {table}: {operations}")


def _ticket_payload(**overrides: Any) -> support.SupportTicketCreate:
    values = {
        "request_id": REQUEST_ID,
        "category": "question",
        "priority": "normal",
        "subject": "Un sujet valide",
        "description": "Une description suffisamment longue pour le support.",
        "attachment_url": f"{USER_ID}/piece.pdf",
        "page_url": "/profile",
    }
    values.update(overrides)
    return support.SupportTicketCreate(**values)


@pytest.mark.asyncio
async def test_create_ticket_uses_idempotent_rpc_and_list_subscription(monkeypatch) -> None:
    database = _Database()
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)

    first = await support.create_ticket(
        _ticket_payload(),
        {"id": USER_ID, "email": "alice@example.test"},
    )
    replay = await support.create_ticket(
        _ticket_payload(),
        {"id": USER_ID, "email": "alice@example.test"},
    )

    assert first == replay == {
        "ticket_id": TICKET_ID,
        "short_id": "33333333",
        "status": "open",
    }
    creation_calls = [call for call in database.rpc_calls if call[0] == "create_support_ticket_idempotent"]
    assert len(creation_calls) == 2
    assert creation_calls[0][1]["p_request_id"] == REQUEST_ID
    assert creation_calls[0][1]["p_user_name"] == "Alice Exemple"
    assert creation_calls[0][1]["p_user_plan"] == "pro"
    assert database.direct_writes == []


@pytest.mark.asyncio
async def test_create_ticket_offloads_bounded_sync_database_calls(monkeypatch) -> None:
    database = _Database()
    offloaded: list[str] = []

    async def fake_run_sync_io(function, *args, **kwargs):
        offloaded.append(function.__name__)
        assert kwargs.get("timeout_seconds", 10) <= 10
        return function(*args)

    monkeypatch.setattr(support, "get_supabase_client", lambda: database)
    monkeypatch.setattr(support, "run_sync_io", fake_run_sync_io, raising=False)

    await support.create_ticket(
        _ticket_payload(),
        {"id": USER_ID, "email": "alice@example.test"},
    )

    assert len(offloaded) == 3


@pytest.mark.asyncio
async def test_create_ticket_accepts_confirmed_user_without_profile(monkeypatch) -> None:
    database = _Database(profile_exists=False)
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)

    response = await support.create_ticket(
        _ticket_payload(attachment_url=None),
        {"id": USER_ID, "email": "alice@example.test"},
    )

    assert response["ticket_id"] == TICKET_ID
    creation_call = next(
        params
        for name, params in database.rpc_calls
        if name == "create_support_ticket_idempotent"
    )
    assert creation_call["p_user_name"] == ""


@pytest.mark.asyncio
async def test_create_ticket_rejects_foreign_attachment_prefix(monkeypatch) -> None:
    database = _Database()
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)

    with pytest.raises(HTTPException) as error:
        await support.create_ticket(
            _ticket_payload(attachment_url=f"{USER_ID}-other/piece.pdf"),
            {"id": USER_ID, "email": "alice@example.test"},
        )

    assert error.value.status_code == 400
    assert database.rpc_calls == []


@pytest.mark.asyncio
async def test_create_ticket_enforces_verified_user_hourly_limit(monkeypatch) -> None:
    database = _Database(rate_limited=True)
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)

    with pytest.raises(HTTPException) as error:
        await support.create_ticket(
            _ticket_payload(attachment_url=None),
            {"id": USER_ID, "email": "alice@example.test"},
        )

    assert error.value.status_code == 429
    assert any(name == "create_support_ticket_idempotent" for name, _params in database.rpc_calls)
    assert not any(
        table == "support_tickets"
        and any(name == "gte" for name, _value in operations)
        for table, operations in database.queries
    )


@pytest.mark.asyncio
async def test_admin_update_uses_stable_distinct_rpc_subkeys(monkeypatch) -> None:
    database = _Database()
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)
    payload = support.AdminTicketUpdate(
        request_id=REQUEST_ID,
        status="resolved",
        admin_reply="Une réponse bornée.",
    )

    await support.admin_update_ticket(TICKET_ID, payload, {"id": ADMIN_ID})
    first_calls = [
        (name, params)
        for name, params in database.rpc_calls
        if name.endswith("_idempotent") and name != "create_support_ticket_idempotent"
    ]
    database.rpc_calls.clear()
    await support.admin_update_ticket(TICKET_ID, payload, {"id": ADMIN_ID})
    second_calls = [
        (name, params)
        for name, params in database.rpc_calls
        if name.endswith("_idempotent") and name != "create_support_ticket_idempotent"
    ]

    assert first_calls == second_calls
    assert {name for name, _params in first_calls} == {
        "reply_support_ticket_idempotent",
        "set_support_ticket_status_idempotent",
    }
    request_keys = {
        params["p_request_id"]
        for _name, params in first_calls
    }
    assert len(request_keys) == 2
    assert all(UUID(key).version == 5 for key in request_keys)
    assert database.direct_writes == []


def test_admin_reply_is_bounded_and_empty_update_is_rejected() -> None:
    with pytest.raises(ValidationError):
        support.AdminTicketUpdate(request_id=REQUEST_ID, admin_reply="x" * 10001)
    with pytest.raises(ValidationError):
        support.AdminTicketUpdate(request_id=REQUEST_ID)


@pytest.mark.parametrize(
    "overrides",
    [
        {"subject": "     "},
        {"description": "                         "},
    ],
)
def test_ticket_rejects_content_containing_only_whitespace(overrides: dict[str, str]) -> None:
    with pytest.raises(ValidationError):
        _ticket_payload(**overrides)


def test_admin_reply_and_chatbot_reject_content_containing_only_whitespace() -> None:
    with pytest.raises(ValidationError):
        support.AdminTicketUpdate(request_id=REQUEST_ID, admin_reply="   ")
    with pytest.raises(ValidationError):
        support.ChatbotRequest(question="   ")


@pytest.mark.asyncio
async def test_admin_search_is_sanitized_and_stats_use_exact_counts(monkeypatch) -> None:
    database = _Database()
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)

    response = await support.admin_list_tickets(
        {"id": ADMIN_ID},
        status_filter="open",
        search="alice),status.eq.open",
        page=2,
        page_size=25,
    )

    search_expression = next(
        value
        for table, operations in database.queries
        if table == "support_tickets"
        for name, value in operations
        if name == "or"
    )
    assert "),status.eq.open" not in search_expression
    assert any(
        ("range", (25, 49)) in operations
        for table, operations in database.queries
        if table == "support_tickets"
    )
    exact_count_queries = [
        operations
        for table, operations in database.queries
        if table == "support_tickets"
        and any(name == "select" and value[1].get("count") == "exact" for name, value in operations)
    ]
    assert len(exact_count_queries) == 5
    assert response["stats"] == {
        "open": 3,
        "in_progress": 2,
        "resolved": 5,
        "resolved_pct": 50,
    }


@pytest.mark.asyncio
async def test_admin_list_does_not_report_zero_stats_when_counting_fails(monkeypatch) -> None:
    database = _Database()
    calls = 0

    async def fail_first_count(function, *args, **_kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("database unavailable")
        return function(*args)

    monkeypatch.setattr(support, "get_supabase_client", lambda: database)
    monkeypatch.setattr(support, "run_sync_io", fail_first_count)

    with pytest.raises(HTTPException) as error:
        await support.admin_list_tickets({"id": ADMIN_ID})

    assert error.value.status_code == 500
    assert error.value.detail == "Erreur lors du chargement des statistiques"


@pytest.mark.asyncio
async def test_owner_history_hides_foreign_ticket_and_admin_can_read(monkeypatch) -> None:
    foreign_database = _Database(ticket_owner="99999999-9999-4999-8999-999999999999")
    monkeypatch.setattr(support, "get_supabase_client", lambda: foreign_database)

    with pytest.raises(HTTPException) as error:
        await support.get_ticket_messages(TICKET_ID, {"id": USER_ID})
    assert error.value.status_code == 404
    assert not any(table == "support_ticket_messages" for table, _ops in foreign_database.queries)

    admin_database = _Database()
    monkeypatch.setattr(support, "get_supabase_client", lambda: admin_database)
    result = await support.admin_get_ticket_messages(TICKET_ID, {"id": ADMIN_ID})
    assert result["messages"][0]["content"] == "Réponse"


@pytest.mark.asyncio
async def test_admin_history_returns_404_when_ticket_is_absent(monkeypatch) -> None:
    database = _Database(ticket_exists=False)
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)

    with pytest.raises(HTTPException) as error:
        await support.admin_get_ticket_messages(TICKET_ID, {"id": ADMIN_ID})

    assert error.value.status_code == 404
    assert not any(table == "support_ticket_messages" for table, _ops in database.queries)


@pytest.mark.asyncio
async def test_admin_update_returns_404_when_ticket_is_absent(monkeypatch) -> None:
    database = _Database(ticket_exists=False)
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)
    payload = support.AdminTicketUpdate(
        request_id=REQUEST_ID,
        status="resolved",
        admin_reply="Une réponse bornée.",
    )

    with pytest.raises(HTTPException) as error:
        await support.admin_update_ticket(TICKET_ID, payload, {"id": ADMIN_ID})

    assert error.value.status_code == 404
    assert not any(
        name in {"reply_support_ticket_idempotent", "set_support_ticket_status_idempotent"}
        for name, _params in database.rpc_calls
    )


@pytest.mark.asyncio
async def test_admin_update_does_not_hide_ticket_lookup_failure(monkeypatch) -> None:
    database = _Database()
    monkeypatch.setattr(support, "get_supabase_client", lambda: database)

    async def fail_lookup(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(support, "run_sync_io", fail_lookup)
    payload = support.AdminTicketUpdate(
        request_id=REQUEST_ID,
        status="resolved",
    )

    with pytest.raises(RuntimeError, match="database unavailable"):
        await support.admin_update_ticket(TICKET_ID, payload, {"id": ADMIN_ID})


@pytest.mark.asyncio
async def test_support_chatbot_uses_async_configured_model(monkeypatch) -> None:
    calls: dict[str, Any] = {}

    class _AsyncChatGroq:
        def __init__(self, **kwargs: Any) -> None:
            calls["model"] = kwargs["model"]

        async def ainvoke(self, messages: list[object]) -> SimpleNamespace:
            calls["messages"] = messages
            return SimpleNamespace(content="Réponse support sûre")

        def invoke(self, messages: list[object]) -> None:
            raise AssertionError("L'appel Groq synchrone bloquerait l'event loop")

    monkeypatch.setitem(
        sys.modules,
        "langchain_groq",
        SimpleNamespace(ChatGroq=_AsyncChatGroq),
    )
    monkeypatch.setitem(
        sys.modules,
        "langchain_core.messages",
        SimpleNamespace(
            HumanMessage=lambda **kwargs: kwargs,
            SystemMessage=lambda **kwargs: kwargs,
        ),
    )
    monkeypatch.setattr(
        support,
        "get_settings",
        lambda: SimpleNamespace(
            get_groq_key=lambda: "test-key",
            llm_model_fast="configured-fast-model",
        ),
    )

    response = await support.chatbot_response(
        Request({"type": "http", "method": "POST", "path": "/api/support/chatbot", "headers": []}),
        support.ChatbotRequest(question="Comment analyser mon CV ?"),
        {"id": USER_ID},
    )

    assert response == {"type": "ai", "answer": "Réponse support sûre"}
    assert calls["model"] == "configured-fast-model"
    assert len(calls["messages"]) == 2
