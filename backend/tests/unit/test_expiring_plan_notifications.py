"""Notifications fiables avant expiration des accès administrateur."""

from typing import Any

import pytest
from fastapi import HTTPException

from src.api.routes import cron
from src.workers import tasks


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    def __init__(self, client: "_Client", table: str) -> None:
        self.client = client
        self.table = table
        self.selection = ""

    def select(self, selection: str) -> "_Query":
        self.selection = selection
        self.client.selections.append((self.table, selection))
        return self

    def eq(self, *_args: object) -> "_Query":
        return self

    def like(self, *_args: object) -> "_Query":
        return self

    def gte(self, *_args: object) -> "_Query":
        return self

    def lt(self, *_args: object) -> "_Query":
        return self

    def in_(self, *_args: object) -> "_Query":
        return self

    def execute(self) -> _Result:
        if self.table == "user_subscriptions":
            self.client.subscription_queries += 1
            if self.client.subscription_queries == 1:
                row = {
                    "user_id": "user-1",
                    "plan_id": "plan-pro",
                    "current_period_end": "2026-09-12T10:00:00+00:00",
                }
                return _Result([row, dict(row)])
            return _Result([])
        if self.table == "profiles":
            return _Result(
                [
                    {
                        "id": "user-1",
                        "email": "user@example.com",
                        "language": "fr",
                    }
                ]
            )
        if self.table == "subscription_plans":
            return _Result([{"id": "plan-pro", "display_name": "Pro"}])
        raise AssertionError(f"Table inattendue: {self.table}")


class _Client:
    def __init__(self) -> None:
        self.selections: list[tuple[str, str]] = []
        self.subscription_queries = 0

    def table(self, table: str) -> _Query:
        return _Query(self, table)


@pytest.mark.asyncio
async def test_expiring_plans_fetches_profiles_without_invalid_embedding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = _Client()
    sent: list[dict[str, Any]] = []
    monkeypatch.setattr("src.api.deps.get_supabase_client", lambda: client)
    monkeypatch.setattr(
        "src.services.email.send_expiring_plan_email",
        lambda **kwargs: sent.append(kwargs),
    )
    monkeypatch.setattr(
        "src.services.email.send_expiring_plan_tomorrow_email",
        lambda **_kwargs: None,
    )

    result = await tasks.notify_expiring_plans({})

    assert result == {"success": True, "emails_sent": 1, "skipped": 1}
    assert sent == [
        {
            "user_email": "user@example.com",
            "plan_name": "Pro",
            "language": "fr",
        }
    ]
    subscription_selections = [
        selection for table, selection in client.selections if table == "user_subscriptions"
    ]
    assert subscription_selections
    assert all("profiles" not in selection for selection in subscription_selections)


@pytest.mark.asyncio
async def test_expiring_plan_cron_exposes_worker_failure_as_http_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cron, "CRON_SECRET", "cron-test")

    async def fail(_ctx: dict) -> dict:
        return {"success": False, "error": "database unavailable"}

    monkeypatch.setattr(tasks, "notify_expiring_plans", fail)

    with pytest.raises(HTTPException) as error:
        await cron.notify_expiring_plans_cron("Bearer cron-test")

    assert error.value.status_code == 500
    assert error.value.detail == "Failed to notify expiring plans"
