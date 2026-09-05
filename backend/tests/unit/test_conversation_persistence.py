"""Régressions de persistance et d'isolation des conversations assistants."""

import asyncio
import gc
from datetime import datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from arq import Retry
from fastapi import HTTPException, status
from pydantic import TypeAdapter, ValidationError
from starlette.requests import Request

from src.api import deps
from src.api.routes import assistant, branding, coach
from src.models.schemas import CoachRequest
from src.utils import cache as cache_utils
from src.utils import request_dedup
from src.workers import tasks


class _QueryResult:
    def __init__(self, data: list[dict[str, Any]] | None = None) -> None:
        self.data = data or []


class _ConversationQuery:
    def __init__(self, client: "_FakeSupabase", table_name: str) -> None:
        self.client = client
        self.table_name = table_name
        self.action = "select"
        self.filters: list[tuple[str, str]] = []
        self.payload: dict[str, Any] | None = None

    def select(self, _columns: str) -> "_ConversationQuery":
        self.action = "select"
        return self

    def insert(self, payload: dict[str, Any]) -> "_ConversationQuery":
        self.action = "insert"
        self.payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> "_ConversationQuery":
        self.action = "update"
        self.payload = payload
        return self

    def delete(self) -> "_ConversationQuery":
        self.action = "delete"
        return self

    def eq(self, column: str, value: str) -> "_ConversationQuery":
        self.filters.append((column, value))
        return self

    def order(self, _column: str, *, desc: bool = False) -> "_ConversationQuery":
        del desc
        return self

    def limit(self, _count: int) -> "_ConversationQuery":
        return self

    def execute(self) -> _QueryResult:
        self.client.operations.append(
            {
                "table": self.table_name,
                "action": self.action,
                "filters": self.filters.copy(),
                "payload": self.payload,
            }
        )
        if self.action == "select":
            return _QueryResult(self.client.selected_rows)
        return _QueryResult()


class _RpcQuery:
    def __init__(
        self,
        client: "_FakeSupabase",
        function_name: str,
        payload: dict[str, Any],
    ) -> None:
        self.client = client
        self.function_name = function_name
        self.payload = payload

    def execute(self) -> _QueryResult:
        self.client.operations.append(
            {
                "action": "rpc",
                "function": self.function_name,
                "payload": self.payload,
            }
        )
        return _QueryResult()


class _FakeSupabase:
    def __init__(self, selected_rows: list[dict[str, Any]] | None = None) -> None:
        self.selected_rows = selected_rows or []
        self.operations: list[dict[str, Any]] = []

    def table(self, table_name: str) -> _ConversationQuery:
        return _ConversationQuery(self, table_name)

    def rpc(self, function_name: str, payload: dict[str, Any]) -> _RpcQuery:
        return _RpcQuery(self, function_name, payload)


@pytest.fixture(autouse=True)
def _clear_memory_sessions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        tasks,
        "increment_global_ai_active",
        AsyncMock(return_value=1),
        raising=False,
    )
    monkeypatch.setattr(
        tasks,
        "decrement_global_ai_active",
        AsyncMock(),
        raising=False,
    )
    with deps._sessions_lock:
        deps._sessions.clear()
    tasks._local_session_locks.clear()
    yield
    with deps._sessions_lock:
        deps._sessions.clear()
    tasks._local_session_locks.clear()


def test_first_successful_turn_inserts_owned_timestamped_conversation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une ligne absente doit être créée avec les deux messages et leur propriétaire."""
    fake_supabase = _FakeSupabase()
    monkeypatch.setattr(deps, "get_supabase_client", lambda: fake_supabase)

    deps.update_session_history(
        "session-123",
        "Bonjour",
        "Comment puis-je vous aider ?",
        user_id="user-123",
        assistant_type="job-scout",
    )

    operation = fake_supabase.operations[0]
    assert operation["action"] == "rpc"
    assert operation["function"] == "append_coach_conversation_messages"
    assert operation["payload"]["p_user_id"] == "user-123"
    assert operation["payload"]["p_session_id"] == "session-123"
    assert operation["payload"]["p_assistant_type"] == "job-scout"
    assert operation["payload"]["p_messages"] == [
        {
            "role": "user",
            "content": "Bonjour",
            "timestamp": operation["payload"]["p_messages"][0]["timestamp"],
        },
        {
            "role": "assistant",
            "content": "Comment puis-je vous aider ?",
            "timestamp": operation["payload"]["p_messages"][1]["timestamp"],
        },
    ]
    for message in operation["payload"]["p_messages"]:
        parsed_timestamp = datetime.fromisoformat(message["timestamp"])
        assert parsed_timestamp.tzinfo is not None


def test_later_turn_appends_without_losing_existing_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un tour ultérieur doit conserver les messages déjà persistés."""
    existing_message = {
        "role": "user",
        "content": "Premier tour",
        "timestamp": "2026-08-26T08:00:00+00:00",
    }
    fake_supabase = _FakeSupabase(
        selected_rows=[{"id": "conversation-1", "messages": [existing_message]}]
    )
    monkeypatch.setattr(deps, "get_supabase_client", lambda: fake_supabase)

    deps.update_session_history(
        "session-123",
        "Deuxième tour",
        "Réponse suivante",
        user_id="user-123",
        assistant_type="cv-analyzer",
    )

    operation = fake_supabase.operations[0]
    assert operation["action"] == "rpc"
    assert operation["function"] == "append_coach_conversation_messages"
    assert [message["content"] for message in operation["payload"]["p_messages"]] == [
        "Deuxième tour",
        "Réponse suivante",
    ]


def test_history_read_filters_by_owner_and_returns_persisted_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une lecture service-role doit toujours inclure le propriétaire authentifié."""
    messages = [{"role": "user", "content": "Mon historique"}]
    fake_supabase = _FakeSupabase(selected_rows=[{"messages": messages}])
    monkeypatch.setattr(deps, "get_supabase_client", lambda: fake_supabase)

    assert deps.get_session_history("session-123", user_id="user-123") == messages

    select_operation = fake_supabase.operations[0]
    assert select_operation["filters"] == [
        ("session_id", "session-123"),
        ("user_id", "user-123"),
    ]


def test_memory_cache_is_isolated_by_owner_when_session_ids_collide(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Deux utilisateurs partageant un UUID ne doivent jamais partager leur cache chaud."""
    fake_supabase = _FakeSupabase()
    monkeypatch.setattr(deps, "get_supabase_client", lambda: fake_supabase)

    deps.update_session_history(
        "shared-session",
        "Secret A",
        "Réponse A",
        user_id="user-a",
    )
    deps.update_session_history(
        "shared-session",
        "Secret B",
        "Réponse B",
        user_id="user-b",
    )

    history_a = deps.get_session_history("shared-session", user_id="user-a")
    history_b = deps.get_session_history("shared-session", user_id="user-b")

    assert [message["content"] for message in history_a] == ["Secret A", "Réponse A"]
    assert [message["content"] for message in history_b] == ["Secret B", "Réponse B"]


def test_clear_session_deletes_only_the_owned_persisted_conversation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """La suppression doit cibler le couple session/propriétaire en mémoire et en DB."""
    fake_supabase = _FakeSupabase()
    monkeypatch.setattr(deps, "get_supabase_client", lambda: fake_supabase)
    deps.update_session_history(
        "shared-session",
        "Secret A",
        "Réponse A",
        user_id="user-a",
    )
    deps.update_session_history(
        "shared-session",
        "Secret B",
        "Réponse B",
        user_id="user-b",
    )
    fake_supabase.operations.clear()

    deps.clear_session("shared-session", user_id="user-a")

    assert deps.get_session_history("shared-session", user_id="user-a") == []
    assert [
        message["content"]
        for message in deps.get_session_history("shared-session", user_id="user-b")
    ] == ["Secret B", "Réponse B"]
    delete_operation = next(
        operation for operation in fake_supabase.operations if operation["action"] == "delete"
    )
    assert delete_operation["filters"] == [
        ("session_id", "shared-session"),
        ("user_id", "user-a"),
    ]


def test_helpers_without_owner_never_query_service_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Les appels internes historiques restent mémoire-only sans identité utilisateur."""
    def _fail_if_called() -> None:
        pytest.fail("Supabase service-role ne doit pas être utilisé sans user_id")

    monkeypatch.setattr(deps, "get_supabase_client", _fail_if_called)

    deps.update_session_history("legacy-session", "Bonjour", "Réponse")
    assert [
        message["content"] for message in deps.get_session_history("legacy-session")
    ] == ["Bonjour", "Réponse"]
    deps.clear_session("legacy-session")
    assert deps.get_session_history("legacy-session") == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("route_module", "function_name"),
    [
        (coach, "delete_session"),
        (assistant, "delete_assistant_session"),
        (branding, "delete_branding_session"),
    ],
)
async def test_delete_routes_pass_authenticated_owner_to_clear_session(
    monkeypatch: pytest.MonkeyPatch,
    route_module: Any,
    function_name: str,
) -> None:
    """Chaque DELETE doit exiger l'utilisateur courant et supprimer uniquement sa session."""
    clear_calls: list[tuple[str, str | None]] = []

    def _record_clear(session_id: str, *, user_id: str | None = None) -> None:
        clear_calls.append((session_id, user_id))

    monkeypatch.setattr(route_module, "clear_session", _record_clear, raising=False)

    await getattr(route_module, function_name)(
        session_id="session-123",
        current_user={"id": "owner-123"},
    )

    assert clear_calls == [("session-123", "owner-123")]


@pytest.mark.asyncio
async def test_branding_route_uses_owned_history_and_allowed_storage_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Branding doit isoler l'historique tout en respectant la contrainte DB existante."""
    history_calls: list[tuple[str, str | None]] = []
    update_calls: list[dict[str, Any]] = []

    def _get_history(session_id: str, *, user_id: str | None = None) -> list[dict]:
        history_calls.append((session_id, user_id))
        return []

    def _update_history(
        session_id: str,
        user_message: str,
        assistant_response: str,
        *,
        user_id: str | None = None,
        assistant_type: str = "career-coach",
    ) -> None:
        update_calls.append(
            {
                "session_id": session_id,
                "user_message": user_message,
                "assistant_response": assistant_response,
                "user_id": user_id,
                "assistant_type": assistant_type,
            }
        )

    monkeypatch.setattr(branding, "get_session_history", _get_history)
    monkeypatch.setattr(branding, "update_session_history", _update_history)
    agent = AsyncMock()
    agent.run.return_value = {
        "success": True,
        "response": "Définissons votre positionnement.",
        "language": "fr",
        "branding_state": {"step": "onboarding"},
    }

    response = await branding.branding_chat(
        request=Request({"type": "http", "method": "POST", "path": "/api/branding/chat"}),
        data=branding.BrandingRequest(
            message="Je travaille mon profil.",
            session_id="12345678-1234-1234-1234-123456789abc",
        ),
        agent=agent,
        current_user={"id": "owner-123"},
    )

    assert response.success is True
    assert history_calls == [("12345678-1234-1234-1234-123456789abc", "owner-123")]
    assert update_calls == [
        {
            "session_id": "12345678-1234-1234-1234-123456789abc",
            "user_message": "Je travaille mon profil.",
            "assistant_response": "Définissons votre positionnement.",
            "user_id": "owner-123",
            "assistant_type": "career-coach",
        }
    ]


@pytest.mark.asyncio
async def test_coach_worker_reads_and_persists_with_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le worker coach doit garder l'ownership après passage par Redis."""
    history_calls: list[tuple[str, str | None]] = []
    update_calls: list[dict[str, Any]] = []
    agent = AsyncMock()
    agent.run.return_value = {"success": True, "response": "Réponse coach"}
    monkeypatch.setattr(deps, "get_coach_agent", lambda: agent)

    def _get_history(session_id: str, *, user_id: str | None = None) -> list[dict]:
        history_calls.append((session_id, user_id))
        return [{"role": "user", "content": "Contexte"}]

    def _update_history(
        session_id: str,
        user_message: str,
        assistant_response: str,
        *,
        user_id: str | None = None,
        assistant_type: str = "career-coach",
    ) -> None:
        update_calls.append(
            {
                "session_id": session_id,
                "user_message": user_message,
                "assistant_response": assistant_response,
                "user_id": user_id,
                "assistant_type": assistant_type,
            }
        )

    monkeypatch.setattr(deps, "get_session_history", _get_history)
    monkeypatch.setattr(deps, "update_session_history", _update_history)

    result = await tasks.coach_task(
        {},
        message="Question",
        session_id="session-123",
        language="fr",
        user_id="owner-123",
        assistant_type="career-coach",
        cv_context="\n[CONTEXTE CV]\nPython\n[FIN CONTEXTE CV]\n",
    )

    assert result["success"] is True
    assert history_calls == [("session-123", "owner-123")]
    agent.run.assert_awaited_once_with(
        message="Question\n[CONTEXTE CV]\nPython\n[FIN CONTEXTE CV]\n",
        history=[{"role": "user", "content": "Contexte"}],
        language="fr",
        deep_analysis=True,
    )
    assert update_calls[0]["user_message"] == "Question"
    assert update_calls[0]["user_id"] == "owner-123"
    assert update_calls[0]["assistant_type"] == "career-coach"


@pytest.mark.asyncio
async def test_assistant_worker_persists_successful_result_with_owner_and_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un assistant mis en queue doit persister sa réponse sous le bon type."""
    update_calls: list[dict[str, Any]] = []
    history_calls: list[tuple[str, str | None]] = []
    agent = AsyncMock()
    agent.run.return_value = {"success": True, "response": "Réponse scout"}
    monkeypatch.setattr(deps, "get_scout_conversational_agent", lambda: agent)

    def _get_history(session_id: str, *, user_id: str | None = None) -> list[dict]:
        history_calls.append((session_id, user_id))
        return [{"role": "user", "content": "Contexte rechargé"}]

    def _update_history(
        session_id: str,
        user_message: str,
        assistant_response: str,
        *,
        user_id: str | None = None,
        assistant_type: str = "career-coach",
    ) -> None:
        update_calls.append(
            {
                "session_id": session_id,
                "user_message": user_message,
                "assistant_response": assistant_response,
                "user_id": user_id,
                "assistant_type": assistant_type,
            }
        )

    monkeypatch.setattr(deps, "get_session_history", _get_history)
    monkeypatch.setattr(deps, "update_session_history", _update_history)

    result = await tasks.assistant_task(
        {},
        message="Trouve-moi un poste.",
        session_id="session-123",
        assistant_type="job-scout",
        language="fr",
        user_id="owner-123",
    )

    assert result["success"] is True
    assert history_calls == [("session-123", "owner-123")]
    agent.run.assert_awaited_once_with(
        message="Trouve-moi un poste.",
        history=[{"role": "user", "content": "Contexte rechargé"}],
        language="fr",
    )
    assert update_calls == [
        {
            "session_id": "session-123",
            "user_message": "Trouve-moi un poste.",
            "assistant_response": "Réponse scout",
            "user_id": "owner-123",
            "assistant_type": "job-scout",
        }
    ]


@pytest.mark.asyncio
async def test_assistant_enqueue_forwards_owner_to_worker_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """L'identité utilisée pour la déduplication doit aussi parvenir au job ARQ."""
    enqueued_payloads: list[dict[str, Any]] = []

    class _Job:
        job_id = "job-123"

    class _Pool:
        async def enqueue_job(self, task_name: str, **kwargs: Any) -> _Job:
            enqueued_payloads.append({"task_name": task_name, **kwargs})
            return _Job()

    monkeypatch.setattr(assistant, "register_request", AsyncMock(return_value=None))
    monkeypatch.setattr(assistant, "store_job_id", AsyncMock())
    monkeypatch.setattr(assistant, "store_job_owner", AsyncMock(return_value=True))

    result = await assistant._dedup_or_enqueue(
        _Pool(),
        "assistant_task",
        "job-scout",
        "owner-123",
        None,
        13,
        message="Trouve-moi un poste.",
        session_id="session-123",
        assistant_type="job-scout",
        language="fr",
        user_id="owner-123",
    )

    assert result is not None
    assert len(enqueued_payloads[0].pop("_job_id")) == 32
    assert enqueued_payloads == [
        {
            "task_name": "assistant_task",
            "message": "Trouve-moi un poste.",
            "session_id": "session-123",
            "assistant_type": "job-scout",
            "language": "fr",
            "user_id": "owner-123",
        }
    ]


@pytest.mark.asyncio
async def test_failed_assistant_enqueue_clears_pending_dedup_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un enqueue refusé ne doit pas bloquer le retry utilisateur pendant le TTL."""
    clear_pending = AsyncMock()
    clear_owner = AsyncMock()
    monkeypatch.setattr(assistant, "register_request", AsyncMock(return_value=None))
    monkeypatch.setattr(assistant, "store_job_owner", AsyncMock(return_value=False))
    monkeypatch.setattr(assistant, "clear_pending_request", clear_pending)
    monkeypatch.setattr(assistant, "clear_job_owner", clear_owner)

    with pytest.raises(RuntimeError, match="propriétaire"):
        await assistant._dedup_or_enqueue(
            SimpleNamespace(),
            "assistant_task",
            "job-scout",
            "owner-123",
            None,
            13,
            message="Trouve-moi un poste.",
            session_id="session-123",
            assistant_type="job-scout",
            language="fr",
            user_id="owner-123",
        )

    clear_pending.assert_awaited_once()
    clear_owner.assert_awaited_once()


@pytest.mark.asyncio
async def test_explicit_assistant_request_id_is_stable_and_scoped_by_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le client ne doit jamais pouvoir choisir une clé Redis globale assistant."""
    register = AsyncMock(return_value="job-existing")
    monkeypatch.setattr(assistant, "register_request", register)

    for user_id in ("owner-a", "owner-a", "owner-b"):
        result = await assistant._dedup_or_enqueue(
            _QueuePool(),
            "assistant_task",
            "job-scout",
            user_id,
            "client-request-123",
            13,
            message="Question",
            session_id="session-123",
            assistant_type="job-scout",
            user_id=user_id,
        )
        assert result is not None
        assert result["job_id"] == "job-existing"

    keys = [call.args[0] for call in register.await_args_list]
    assert keys[0] == keys[1]
    assert keys[0] != keys[2]
    assert all(key != "client-request-123" for key in keys)
    assert all(key.startswith("assistant:") for key in keys)


def test_coach_request_rejects_unknown_assistant_type() -> None:
    """Un type arbitraire doit être rejeté par Pydantic avant quota et agent."""
    with pytest.raises(ValidationError):
        CoachRequest(
            message="Bonjour",
            session_id="12345678-1234-1234-1234-123456789abc",
            assistant_type="type-arbitraire",
        )


def test_assistant_routes_accept_sync_and_queued_response_contracts() -> None:
    """FastAPI doit pouvoir sérialiser la soupape ARQ sans transformer la réponse en 500."""
    queued = {
        "queued": True,
        "job_id": "job-123",
        "estimated_wait_seconds": 24,
    }
    synchronous = {
        "success": True,
        "response": "Réponse",
        "agent": "job-scout",
    }

    assistant_routes = {
        route.path: route
        for route in assistant.router.routes
        if route.path in {
            "/job-scout",
            "/cv-analyzer",
            "/cv-adapter",
            "/interview-sim",
        }
    }
    assert len(assistant_routes) == 4
    for route in assistant_routes.values():
        response_adapter = TypeAdapter(route.response_model)
        assert response_adapter.validate_python(queued).queued is True
        assert response_adapter.validate_python(synchronous).success is True


def test_attach_cv_rejects_non_canonical_assistant_type_before_processing() -> None:
    """Le formulaire d'upload ne doit jamais accepter une clé de quota contrôlée par le client."""
    route = next(route for route in assistant.router.routes if route.path == "/attach-cv")
    assistant_type_field = next(
        field for field in route.dependant.body_params if field.name == "assistant_type"
    )

    with pytest.raises(ValidationError):
        TypeAdapter(assistant_type_field.field_info.annotation).validate_python("quota-arbitraire")


@pytest.mark.asyncio
async def test_attach_cv_checks_interview_feature_before_reading_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un plan sans simulateur doit être rejeté avant tout coût PDF/Modal/Groq."""
    feature_check = MagicMock(
        side_effect=HTTPException(status_code=403, detail="feature disabled")
    )
    monkeypatch.setattr(assistant, "_require_feature_flag_sync", feature_check)
    upload = SimpleNamespace(filename="cv.pdf", read=AsyncMock(return_value=b"pdf"))
    http_request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/attach-cv",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await assistant.attach_cv_to_chat.__wrapped__(
            request=http_request,
            coach_agent=object(),
            cv_agent=object(),
            cv_adapter_agent=object(),
            scout_agent=object(),
            branding_agent=object(),
            interview_agent=object(),
            current_user={"id": "owner-123"},
            file=upload,
            assistant_type="interview-sim",
            session_id="session-123",
            language="fr",
        )

    assert exc_info.value.status_code == 403
    feature_check.assert_called_once()
    upload.read.assert_not_awaited()


@pytest.mark.asyncio
async def test_attach_cv_fails_before_reading_when_extraction_capacity_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(assistant, "check_assistant_quota", lambda *_args: None)
    monkeypatch.setattr(
        assistant,
        "_incr_extraction_active",
        AsyncMock(side_effect=RuntimeError("redis unavailable")),
        raising=False,
    )
    upload = SimpleNamespace(filename="cv.pdf", read=AsyncMock(return_value=b"pdf"))
    http_request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/attach-cv",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await assistant.attach_cv_to_chat.__wrapped__(
            request=http_request,
            coach_agent=object(),
            cv_agent=object(),
            cv_adapter_agent=object(),
            scout_agent=object(),
            branding_agent=object(),
            interview_agent=object(),
            current_user={"id": "owner-123"},
            file=upload,
            assistant_type="career-coach",
            session_id="session-123",
            language="fr",
        )

    assert exc_info.value.status_code == 503
    upload.read.assert_not_awaited()


@pytest.mark.asyncio
async def test_legacy_assistant_payload_injects_context_without_unknown_run_kwargs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un ancien job ARQ doit rester exécutable avec la signature actuelle des agents."""
    received: list[dict[str, Any]] = []

    class _StrictAgent:
        async def run(
            self,
            message: str,
            history: list[dict] | None = None,
            language: str = "fr",
        ) -> dict[str, Any]:
            received.append({"message": message, "history": history, "language": language})
            return {"success": True, "response": "Réponse compatible"}

    monkeypatch.setattr(deps, "get_cv_adapter_agent", lambda: _StrictAgent())
    monkeypatch.setattr(deps, "get_session_history", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(deps, "update_session_history", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(cache_utils, "get_redis", AsyncMock(return_value=None))

    result = await tasks.assistant_task(
        {},
        message="Adapte mon profil.",
        session_id="legacy-context",
        assistant_type="cv-adapter",
        user_id="owner-123",
        cv_text="CV source vérifié",
        job_description="Offre cible vérifiée",
    )

    assert result["success"] is True
    assert received == [
        {
            "message": (
                "Adapte mon profil.\n\n[CV FOURNI]\nCV source vérifié\n[FIN DU CV]"
                "\n\n[OFFRE FOURNIE]\nOffre cible vérifiée\n[FIN DE L'OFFRE]"
            ),
            "history": [],
            "language": "fr",
        }
    ]


@pytest.mark.asyncio
async def test_busy_session_lock_defers_without_waiting_for_a_worker_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un job concurrent de la même session doit être replanifié immédiatement."""
    redis_lock = AsyncMock()
    redis_lock.acquire.return_value = False

    class _Redis:
        def lock(self, _key: str, **kwargs: Any) -> AsyncMock:
            assert kwargs["blocking_timeout"] == 0
            return redis_lock

    monkeypatch.setattr(cache_utils, "get_redis", AsyncMock(return_value=_Redis()))

    started_at = asyncio.get_running_loop().time()
    with pytest.raises(Retry):
        async with tasks._session_execution_lock("owner-123", "busy-session"):
            pytest.fail("Le verrou occupé ne doit pas être acquis")
    elapsed = asyncio.get_running_loop().time() - started_at

    assert elapsed < 0.25


class _RpcExecution:
    def execute(self) -> _QueryResult:
        return _QueryResult([{"success": True}])


class _CoachQuotaSupabase:
    def __init__(self) -> None:
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, payload: dict[str, Any]) -> _RpcExecution:
        self.rpc_calls.append((name, payload))
        return _RpcExecution()


def test_coach_cv_context_reads_score_from_result_jsonb(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le contexte coach doit suivre le schéma réel de cv_analyses."""

    class _LatestCvQuery:
        selected_columns = ""

        def select(self, columns: str) -> "_LatestCvQuery":
            self.selected_columns = columns
            return self

        def eq(self, *_args: Any) -> "_LatestCvQuery":
            return self

        def order(self, *_args: Any, **_kwargs: Any) -> "_LatestCvQuery":
            return self

        def limit(self, *_args: Any) -> "_LatestCvQuery":
            return self

        def maybe_single(self) -> "_LatestCvQuery":
            return self

        def execute(self) -> SimpleNamespace:
            return SimpleNamespace(
                data={
                    "cv_text": "Python et gestion de projet",
                    "result": {"ats_score": {"total": 84}},
                    "created_at": "2026-09-05T08:00:00Z",
                }
            )

    query = _LatestCvQuery()

    class _CvSupabase:
        def table(self, table_name: str) -> _LatestCvQuery:
            assert table_name == "cv_analyses"
            return query

    monkeypatch.setattr(coach, "get_supabase_client", lambda: _CvSupabase())

    context = coach._get_user_cv_context("owner-123")

    assert query.selected_columns == "cv_text, result, created_at"
    assert "Score ATS: 84/100" in context
    assert "Python et gestion de projet" in context


class _QueuedJob:
    job_id = "job-123"


class _QueuePool:
    def __init__(self) -> None:
        self.payloads: list[dict[str, Any]] = []

    async def enqueue_job(self, task_name: str, **kwargs: Any) -> _QueuedJob:
        self.payloads.append({"task_name": task_name, **kwargs})
        return _QueuedJob()


@pytest.mark.asyncio
async def test_new_queued_coach_job_increments_quota_once_and_forwards_cv_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un nouveau job coach doit consommer une fois et garder la qualité du chemin sync."""
    pool = _QueuePool()
    supabase = _CoachQuotaSupabase()
    invalidation = AsyncMock()
    monkeypatch.setattr(coach, "_check_per_coach_quota", lambda *_args: None)
    monkeypatch.setattr(coach, "_incr_active", AsyncMock(return_value=13))
    monkeypatch.setattr(coach, "_decr_active", AsyncMock())
    monkeypatch.setattr(coach, "_get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(coach, "register_request", AsyncMock(return_value=None))
    monkeypatch.setattr(coach, "store_job_id", AsyncMock())
    monkeypatch.setattr(coach, "store_job_owner", AsyncMock(return_value=True))
    monkeypatch.setattr(
        coach,
        "_get_user_cv_context",
        lambda _user_id: "\n[CONTEXTE CV]\nPython\n[FIN CONTEXTE CV]\n",
    )
    monkeypatch.setattr(coach, "get_supabase_client", lambda: supabase)
    monkeypatch.setattr(coach, "invalidate_user_quota_cache", invalidation)

    response = await coach.coach_chat(
        request=Request({"type": "http", "method": "POST", "path": "/api/coach/chat"}),
        data=CoachRequest(
            message="Question brute",
            session_id="12345678-1234-1234-1234-123456789abc",
        ),
        agent=AsyncMock(),
        current_user={"id": "owner-123", "email": "owner@example.com"},
    )

    assert response["queued"] is True
    assert supabase.rpc_calls == [
        (
            "increment_coach_message",
            {
                "p_user_id": "owner-123",
                "p_coach_type": "career-coach",
                "p_amount": 1,
            },
        )
    ]
    invalidation.assert_awaited_once_with("owner-123")
    assert len(pool.payloads[0].pop("_job_id")) == 32
    assert pool.payloads == [
        {
            "task_name": "coach_task",
            "message": "Question brute",
            "session_id": "12345678-1234-1234-1234-123456789abc",
            "language": "fr",
            "user_id": "owner-123",
            "assistant_type": "career-coach",
            "cv_context": "\n[CONTEXTE CV]\nPython\n[FIN CONTEXTE CV]\n",
        }
    ]


@pytest.mark.asyncio
async def test_deduplicated_coach_job_never_increments_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Retourner un job coach existant ne doit pas recompter le même message."""
    pool = _QueuePool()
    supabase = _CoachQuotaSupabase()
    invalidation = AsyncMock()
    cv_context = AsyncMock()
    monkeypatch.setattr(coach, "_check_per_coach_quota", lambda *_args: None)
    monkeypatch.setattr(coach, "_incr_active", AsyncMock(return_value=13))
    monkeypatch.setattr(coach, "_decr_active", AsyncMock())
    monkeypatch.setattr(coach, "_get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(coach, "register_request", AsyncMock(return_value="job-existing"))
    monkeypatch.setattr(coach, "_get_user_cv_context", cv_context)
    monkeypatch.setattr(coach, "get_supabase_client", lambda: supabase)
    monkeypatch.setattr(coach, "invalidate_user_quota_cache", invalidation)

    response = await coach.coach_chat(
        request=Request({"type": "http", "method": "POST", "path": "/api/coach/chat"}),
        data=CoachRequest(
            message="Question brute",
            session_id="12345678-1234-1234-1234-123456789abc",
        ),
        agent=AsyncMock(),
        current_user={"id": "owner-123", "email": "owner@example.com"},
    )

    assert response["job_id"] == "job-existing"
    assert supabase.rpc_calls == []
    invalidation.assert_not_awaited()
    cv_context.assert_not_awaited()
    assert pool.payloads == []


@pytest.mark.asyncio
async def test_explicit_coach_request_id_is_stable_and_scoped_by_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le client ne doit jamais pouvoir choisir une clé Redis globale coach."""
    pool = _QueuePool()
    register = AsyncMock(return_value="job-existing")
    monkeypatch.setattr(coach, "_check_per_coach_quota", lambda *_args: None)
    monkeypatch.setattr(coach, "_incr_active", AsyncMock(return_value=13))
    monkeypatch.setattr(coach, "_decr_active", AsyncMock())
    monkeypatch.setattr(coach, "_get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(coach, "register_request", register)

    data = CoachRequest(
        message="Question",
        session_id="12345678-1234-1234-1234-123456789abc",
        request_id="client-request-123",
    )
    route_request = Request(
        {"type": "http", "method": "POST", "path": "/api/coach/chat"}
    )

    for user_id in ("owner-a", "owner-a", "owner-b"):
        await coach.coach_chat(
            request=route_request,
            data=data,
            agent=AsyncMock(),
            current_user={"id": user_id, "email": f"{user_id}@example.com"},
        )

    keys = [call.args[0] for call in register.await_args_list]
    assert keys[0] == keys[1]
    assert keys[0] != keys[2]
    assert all(key != "client-request-123" for key in keys)
    assert all(key.startswith("coach:") for key in keys)
    assert pool.payloads == []


@pytest.mark.asyncio
async def test_pending_coach_request_returns_conflict_without_second_enqueue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un enqueue coach concurrent ne doit ni doubler le job ni basculer en sync."""
    pool = _QueuePool()
    monkeypatch.setattr(coach, "_check_per_coach_quota", lambda *_args: None)
    monkeypatch.setattr(coach, "_incr_active", AsyncMock(return_value=13))
    monkeypatch.setattr(coach, "_decr_active", AsyncMock())
    monkeypatch.setattr(coach, "_get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(
        coach,
        "register_request",
        AsyncMock(side_effect=request_dedup.RequestEnqueuePendingError("same-request")),
    )

    with pytest.raises(HTTPException) as exc_info:
        await coach.coach_chat(
            request=Request(
                {"type": "http", "method": "POST", "path": "/api/coach/chat"}
            ),
            data=CoachRequest(
                message="Question concurrente",
                session_id="12345678-1234-1234-1234-123456789abc",
            ),
            agent=AsyncMock(),
            current_user={"id": "owner-123", "email": "owner@example.com"},
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert pool.payloads == []


@pytest.mark.asyncio
async def test_queued_assistant_route_leaves_history_reload_to_worker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une route mise en queue ne doit pas figer un historique qui peut encore évoluer."""
    pool = _QueuePool()
    monkeypatch.setattr(assistant, "check_assistant_quota", lambda *_args: None)
    monkeypatch.setattr(
        assistant,
        "get_session_history",
        lambda *_args, **_kwargs: pytest.fail("La route ne doit pas charger le snapshot ARQ"),
    )
    monkeypatch.setattr(assistant, "_incr_active", AsyncMock(return_value=13))
    monkeypatch.setattr(assistant, "_decr_active", AsyncMock())
    monkeypatch.setattr(assistant, "_get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(assistant, "register_request", AsyncMock(return_value=None))
    monkeypatch.setattr(assistant, "store_job_id", AsyncMock())
    monkeypatch.setattr(assistant, "store_job_owner", AsyncMock(return_value=True))
    monkeypatch.setattr(assistant, "increment_assistant_messages", lambda *_args: None)
    monkeypatch.setattr(assistant, "invalidate_user_quota_cache", AsyncMock())

    response = await assistant.job_scout_chat(
        request=assistant.AssistantRequest(
            message="Trouve-moi un poste.",
            session_id="session-123",
            assistant_type="job-scout",
        ),
        agent=AsyncMock(),
        current_user={"id": "owner-123"},
    )

    assert response["queued"] is True
    assert len(pool.payloads[0].pop("_job_id")) == 32
    assert pool.payloads == [
        {
            "task_name": "assistant_task",
            "message": "Trouve-moi un poste.",
            "session_id": "session-123",
            "assistant_type": "job-scout",
            "language": "fr",
            "user_id": "owner-123",
        }
    ]


@pytest.mark.asyncio
async def test_pending_assistant_request_returns_conflict_without_second_enqueue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un enqueue assistant concurrent ne doit ni doubler le job ni basculer en sync."""
    pool = _QueuePool()
    agent = AsyncMock()
    monkeypatch.setattr(assistant, "check_assistant_quota", lambda *_args: None)
    monkeypatch.setattr(assistant, "_incr_active", AsyncMock(return_value=13))
    monkeypatch.setattr(assistant, "_decr_active", AsyncMock())
    monkeypatch.setattr(assistant, "_get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(
        assistant,
        "register_request",
        AsyncMock(side_effect=request_dedup.RequestEnqueuePendingError("same-request")),
    )

    with pytest.raises(HTTPException) as exc_info:
        await assistant.job_scout_chat(
            request=assistant.AssistantRequest(
                message="Question concurrente",
                session_id="session-123",
                assistant_type="job-scout",
            ),
            agent=agent,
            current_user={"id": "owner-123"},
        )

    assert exc_info.value.status_code == status.HTTP_409_CONFLICT
    assert pool.payloads == []
    agent.run.assert_not_awaited()


@pytest.mark.asyncio
async def test_pending_dedup_waits_for_existing_job_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le second appel doit récupérer le job créé par le premier appel concurrent."""
    redis = AsyncMock()
    redis.set.return_value = False
    redis.get.side_effect = ["__pending__", "job-concurrent"]
    monkeypatch.setattr(request_dedup, "get_redis", AsyncMock(return_value=redis))
    monkeypatch.setattr(request_dedup.asyncio, "sleep", AsyncMock())

    existing = await request_dedup.register_request("same-request")

    assert existing == "job-concurrent"
    assert redis.get.await_count == 2


@pytest.mark.asyncio
async def test_pending_dedup_timeout_is_explicit_and_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un placeholder bloqué doit échouer explicitement au lieu d'enqueue à nouveau."""
    redis = AsyncMock()
    redis.set.return_value = False
    redis.get.return_value = "__pending__"
    monkeypatch.setattr(request_dedup, "get_redis", AsyncMock(return_value=redis))
    monkeypatch.setattr(
        request_dedup,
        "_PENDING_WAIT_TIMEOUT_SECONDS",
        0,
        raising=False,
    )

    with pytest.raises(RuntimeError, match="encore en cours"):
        await request_dedup.register_request("stuck-request")


@pytest.mark.asyncio
async def test_same_session_worker_jobs_defer_without_parallel_execution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le verrou local doit différer le doublon sans monopoliser le worker."""
    active_calls = 0
    max_active_calls = 0

    async def _run_agent(**_kwargs: Any) -> dict[str, Any]:
        nonlocal active_calls, max_active_calls
        active_calls += 1
        max_active_calls = max(max_active_calls, active_calls)
        await asyncio.sleep(0.03)
        active_calls -= 1
        return {"success": True, "response": "Réponse"}

    agent = AsyncMock()
    agent.run.side_effect = _run_agent
    monkeypatch.setattr(cache_utils, "get_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(deps, "get_scout_conversational_agent", lambda: agent)
    monkeypatch.setattr(deps, "get_session_history", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(deps, "update_session_history", lambda *_args, **_kwargs: None)

    results = await asyncio.wait_for(
        asyncio.gather(
            tasks.assistant_task(
                {},
                message="Premier",
                session_id="same-session",
                assistant_type="job-scout",
                user_id="owner-123",
            ),
            tasks.assistant_task(
                {},
                message="Deuxième",
                session_id="same-session",
                assistant_type="job-scout",
                user_id="owner-123",
            ),
            return_exceptions=True,
        ),
        timeout=1,
    )

    assert max_active_calls == 1
    assert sum(isinstance(result, Retry) for result in results) == 1
    assert sum(isinstance(result, dict) for result in results) == 1
    gc.collect()
    assert "assistant:session:owner-123:same-session" not in tasks._local_session_locks


@pytest.mark.asyncio
async def test_legacy_worker_payloads_remain_compatible(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Les jobs déjà en file doivent rester exécutables sans les nouveaux champs."""
    coach_agent = AsyncMock()
    coach_agent.run.return_value = {"success": True, "response": "Coach legacy"}
    scout_agent = AsyncMock()
    scout_agent.run.return_value = {"success": True, "response": "Scout legacy"}
    updates: list[dict[str, Any]] = []

    def _update_history(
        session_id: str,
        user_message: str,
        assistant_response: str,
        *,
        user_id: str | None = None,
        assistant_type: str = "career-coach",
    ) -> None:
        updates.append(
            {
                "session_id": session_id,
                "user_message": user_message,
                "assistant_response": assistant_response,
                "user_id": user_id,
                "assistant_type": assistant_type,
            }
        )

    monkeypatch.setattr(cache_utils, "get_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(deps, "get_coach_agent", lambda: coach_agent)
    monkeypatch.setattr(deps, "get_scout_conversational_agent", lambda: scout_agent)
    monkeypatch.setattr(deps, "get_session_history", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(deps, "update_session_history", _update_history)

    coach_result = await tasks.coach_task(
        {},
        message="Ancien coach",
        session_id="legacy-coach",
    )
    assistant_result = await tasks.assistant_task(
        {},
        message="Ancien assistant",
        session_id="legacy-assistant",
        assistant_type="job-scout",
        history=[{"role": "user", "content": "Snapshot legacy"}],
    )

    assert coach_result["success"] is True
    assert assistant_result["success"] is True
    scout_agent.run.assert_awaited_once_with(
        message="Ancien assistant",
        history=[{"role": "user", "content": "Snapshot legacy"}],
        language="fr",
    )
    assert [call["user_id"] for call in updates] == [None, None]
    assert [call["assistant_type"] for call in updates] == [
        "career-coach",
        "job-scout",
    ]


@pytest.mark.asyncio
async def test_redis_session_lock_is_bounded_and_released(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le verrou distribué doit être borné et libéré même après le traitement."""
    redis_lock = AsyncMock()
    redis_lock.acquire.return_value = True

    class _Redis:
        def lock(self, key: str, **kwargs: Any) -> AsyncMock:
            assert key == "assistant:session:owner-123:redis-session"
            assert kwargs == {
                "timeout": tasks._SESSION_LOCK_TTL_SECONDS,
                "blocking_timeout": tasks._SESSION_LOCK_WAIT_SECONDS,
            }
            return redis_lock

    monkeypatch.setattr(cache_utils, "get_redis", AsyncMock(return_value=_Redis()))

    async with tasks._session_execution_lock("owner-123", "redis-session"):
        redis_lock.acquire.assert_awaited_once_with()

    redis_lock.release.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_different_session_worker_jobs_remain_independent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le verrou ne doit jamais sérialiser deux sessions distinctes."""
    active_calls = 0
    both_entered = asyncio.Event()

    async def _run_agent(**_kwargs: Any) -> dict[str, Any]:
        nonlocal active_calls
        active_calls += 1
        if active_calls == 2:
            both_entered.set()
        await asyncio.wait_for(both_entered.wait(), timeout=0.5)
        return {"success": True, "response": "Réponse"}

    agent = AsyncMock()
    agent.run.side_effect = _run_agent
    monkeypatch.setattr(cache_utils, "get_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(deps, "get_scout_conversational_agent", lambda: agent)
    monkeypatch.setattr(deps, "get_session_history", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(deps, "update_session_history", lambda *_args, **_kwargs: None)

    await asyncio.wait_for(
        asyncio.gather(
            tasks.assistant_task(
                {},
                message="Premier",
                session_id="session-a",
                assistant_type="job-scout",
                user_id="owner-123",
            ),
            tasks.assistant_task(
                {},
                message="Deuxième",
                session_id="session-b",
                assistant_type="job-scout",
                user_id="owner-123",
            ),
        ),
        timeout=1,
    )

    assert both_entered.is_set()


@pytest.mark.asyncio
async def test_session_worker_lock_is_released_when_agent_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une exception agent ne doit jamais bloquer définitivement la conversation."""
    agent = AsyncMock()
    agent.run.side_effect = [
        RuntimeError("échec agent"),
        {"success": True, "response": "Deuxième essai"},
    ]
    monkeypatch.setattr(cache_utils, "get_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(deps, "get_scout_conversational_agent", lambda: agent)
    monkeypatch.setattr(deps, "get_session_history", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(deps, "update_session_history", lambda *_args, **_kwargs: None)

    with pytest.raises(RuntimeError, match="échec agent"):
        await tasks.assistant_task(
            {},
            message="Premier",
            session_id="session-failure",
            assistant_type="job-scout",
            user_id="owner-123",
        )

    result = await asyncio.wait_for(
        tasks.assistant_task(
            {},
            message="Deuxième",
            session_id="session-failure",
            assistant_type="job-scout",
            user_id="owner-123",
        ),
        timeout=1,
    )

    assert result["success"] is True


@pytest.mark.asyncio
async def test_run_sync_io_supports_async_test_doubles() -> None:
    """Le pont I/O reste compatible avec les doubles async utilisés en tests."""

    async def async_double(value: str) -> str:
        return f"ok:{value}"

    assert await deps.run_sync_io(async_double, "value") == "ok:value"
