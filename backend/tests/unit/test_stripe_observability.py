"""Contrats d'observabilité pour la nouvelle journalisation Stripe."""

from dataclasses import dataclass
from typing import Any
from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from src.api.routes import admin, health


@dataclass
class _Response:
    data: Any = None
    count: int | None = None


FAILED_EVENT = {
    "id": "a4c56ec4-b63d-4a4d-a0f7-b551043077f5",
    "stripe_event_id": "evt_failed",
    "event_type": "invoice.paid",
    "status": "failed",
    "error_type": "RuntimeError",
    "processing_started_at": "2026-08-12T08:59:00+00:00",
    "failed_at": "2026-08-12T09:00:00+00:00",
    "created_at": "2026-08-12T08:59:00+00:00",
}


class _Query:
    def __init__(self, client: "_Supabase", table_name: str):
        self.client = client
        self.table_name = table_name
        self.filters: dict[str, Any] = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key: str, value: Any):
        self.filters[key] = value
        return self

    def gte(self, *_args):
        return self

    def in_(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args):
        return self

    def maybe_single(self):
        return self

    def execute(self) -> _Response:
        self.client.queries.append((self.table_name, dict(self.filters)))
        if self.table_name == "stripe_webhook_events":
            if self.filters.get("id") == FAILED_EVENT["id"]:
                return _Response(data=FAILED_EVENT)
            if self.filters.get("status") == "failed":
                return _Response(data=[FAILED_EVENT], count=1)
        return _Response(data=[], count=0)


class _Supabase:
    def __init__(self):
        self.queries: list[tuple[str, dict[str, Any]]] = []

    def table(self, table_name: str) -> _Query:
        return _Query(self, table_name)

    def rpc(self, name: str, _params: dict[str, Any]):
        if name != "get_webhook_processing_stats":
            raise AssertionError(f"RPC legacy inattendue: {name}")
        return _RpcQuery(
            _Response(
                data={
                    "total_events": 4,
                    "events_by_type": {"invoice.paid": 4},
                    "oldest_event": "2026-08-12T08:00:00+00:00",
                    "newest_event": "2026-08-12T09:00:00+00:00",
                }
            )
        )


class _RpcQuery:
    def __init__(self, response: _Response):
        self.response = response

    def execute(self) -> _Response:
        return self.response


@pytest.mark.asyncio
async def test_admin_webhook_logs_expose_failed_stripe_events(monkeypatch):
    """La liste admin doit lire la source alimentée par le dispatcher courant."""
    database = _Supabase()
    monkeypatch.setattr(admin, "get_supabase_client", Mock(return_value=database))

    result = await admin.get_webhook_logs(
        admin={"id": "admin"},
        page=1,
        per_page=50,
    )

    assert result["total"] == 1
    assert result["failures"] == [
        {
            "id": FAILED_EVENT["id"],
            "stripe_event_id": "evt_failed",
            "event_type": "invoice.paid",
            "error_message": "RuntimeError",
            "error_traceback": None,
            "retry_count": 0,
            "first_attempt_at": "2026-08-12T08:59:00+00:00",
            "last_attempt_at": "2026-08-12T09:00:00+00:00",
            "resolved": False,
            "resolved_at": None,
            "created_at": "2026-08-12T08:59:00+00:00",
            "updated_at": "2026-08-12T09:00:00+00:00",
        }
    ]


@pytest.mark.asyncio
async def test_admin_stats_count_failed_stripe_events(monkeypatch):
    """Le badge admin ne doit plus compter la table legacy non alimentée."""
    database = _Supabase()
    monkeypatch.setattr(admin, "get_supabase_client", Mock(return_value=database))

    result = await admin.get_admin_stats(admin={"id": "admin"})

    assert result["webhook_failures_pending"] == 1


@pytest.mark.asyncio
async def test_webhook_health_uses_failed_stripe_events(monkeypatch):
    """Le taux de succès doit inclure un événement marqué failed par le dispatcher."""
    database = _Supabase()
    monkeypatch.setattr(health, "supabase_client", database)

    result = await health.get_webhook_health(hours=24)

    assert result["total_events"] == 4
    assert result["failed_events"] == 1
    assert result["success_rate"] == 75.0
    assert result["unresolved_failures"] == 1
    assert result["recent_failures"][0]["event_id"] == "evt_failed"


@pytest.mark.asyncio
async def test_admin_retry_is_explicitly_disabled_without_mutating_event(monkeypatch):
    """Un bouton retry ne doit jamais prétendre réussir sans redispatch réel."""
    database = _Supabase()
    monkeypatch.setattr(admin, "get_supabase_client", Mock(return_value=database))

    with pytest.raises(HTTPException) as exc_info:
        await admin.retry_webhook(FAILED_EVENT["id"], admin={"id": "admin"})

    assert exc_info.value.status_code == 409
    assert "Stripe Dashboard" in exc_info.value.detail
    assert database.queries == [
        ("stripe_webhook_events", {"id": FAILED_EVENT["id"], "status": "failed"})
    ]
