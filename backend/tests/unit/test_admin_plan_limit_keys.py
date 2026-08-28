from types import SimpleNamespace
from typing import Any

import pytest

from src.api.routes import admin as admin_routes
from src.api.routes import auth as auth_routes


class FakeQuery:
    def __init__(self, client: "FakeSupabase") -> None:
        self.client = client
        self.operation = "select"

    def select(self, *_args: Any, **_kwargs: Any) -> "FakeQuery":
        self.operation = "select"
        return self

    def update(self, payload: dict[str, Any]) -> "FakeQuery":
        self.operation = "update"
        self.client.updated_payloads.append(payload)
        return self

    def eq(self, *_args: Any, **_kwargs: Any) -> "FakeQuery":
        return self

    def single(self) -> "FakeQuery":
        return self

    def execute(self) -> SimpleNamespace:
        if self.operation == "select":
            return SimpleNamespace(data=self.client.current_plan)
        return SimpleNamespace(data=[self.client.updated_payloads[-1]])


class FakeSupabase:
    def __init__(self, current_limits: dict[str, int]) -> None:
        self.current_plan = {"name": "starter", "limits": current_limits}
        self.updated_payloads: list[dict[str, Any]] = []

    def table(self, _name: str) -> FakeQuery:
        return FakeQuery(self)

    def rpc(self, *_args: Any, **_kwargs: Any) -> FakeQuery:
        return FakeQuery(self)


@pytest.mark.asyncio
async def test_update_plan_limits_persists_only_canonical_quota_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une sauvegarde admin ne doit plus recréer les anciennes clés de quota."""
    fake = FakeSupabase(
        {
            "cv_analyses": 5,
            "cv_adapt": 50,
            "cover_letter": 50,
            "job_searches": 10,
            "assistant_messages": 100,
            "saved_jobs": 100,
            "recruiter_searches": 10,
            "job_views": -1,
            "jobs_visible": -1,
        }
    )
    monkeypatch.setattr(admin_routes, "get_supabase_client", lambda: fake)

    async def no_redis() -> None:
        return None

    monkeypatch.setattr("src.utils.cache.get_redis", no_redis)

    result = await admin_routes.update_plan_limits(
        "starter-id",
        {
            "ats_scores_per_day": 10,
            "cv_adapt_per_day": 30,
            "cover_letter_per_day": 30,
            "job_searches_per_day": 10,
            "assistant_messages_per_day": 20,
            "saved_jobs_per_day": 30,
            "recruiter_searches_per_day": 20,
            "job_views": -1,
            "jobs_visible": -1,
        },
        {"id": "admin-id", "email": "admin@example.test"},
    )

    assert result["limits"] == {
        "ats_scores_per_day": 10,
        "cv_adapt_per_day": 30,
        "cover_letter_per_day": 30,
        "job_searches_per_day": 10,
        "assistant_messages_per_day": 20,
        "saved_jobs_per_day": 30,
        "recruiter_searches_per_day": 20,
        "job_views": -1,
        "jobs_visible": -1,
    }


@pytest.mark.asyncio
async def test_update_plan_limits_normalizes_legacy_clients(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un ancien frontend reste compatible sans réintroduire de doublons JSON."""
    fake = FakeSupabase({"cv_adapt_per_day": 10, "ats_scores_per_day": 5})
    monkeypatch.setattr(admin_routes, "get_supabase_client", lambda: fake)

    async def no_redis() -> None:
        return None

    monkeypatch.setattr("src.utils.cache.get_redis", no_redis)

    result = await admin_routes.update_plan_limits(
        "free-id",
        {"cv_adapt": 12, "cv_analyses": 6},
        {"id": "admin-id", "email": "admin@example.test"},
    )

    assert result["limits"] == {
        "cv_adapt_per_day": 12,
        "ats_scores_per_day": 6,
    }


@pytest.mark.asyncio
async def test_custom_user_limits_are_stored_with_runtime_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Les limites personnalisées doivent être lues par get_quota_status()."""
    fake = FakeSupabase({})
    monkeypatch.setattr(admin_routes, "get_supabase_client", lambda: fake)

    async def no_cache(_user_id: str) -> None:
        return None

    monkeypatch.setattr(admin_routes, "_invalidate_user_cache", no_cache)

    result = await admin_routes.set_custom_limits(
        "user-id",
        admin_routes.SetCustomLimitsRequest(
            cv_analyses_daily=7,
            assistant_messages_daily=25,
            job_searches_daily=11,
        ),
        {"id": "admin-id", "email": "admin@example.test"},
    )

    assert result["custom_limits"] == {
        "ats_scores_per_day": 7,
        "assistant_messages_per_day": 25,
        "job_searches_per_day": 11,
    }


def test_saved_jobs_fallback_prefers_the_runtime_key() -> None:
    """Le fallback Auth doit suivre la même limite que get_quota_status()."""
    assert auth_routes._get_saved_jobs_plan_limit(
        {"saved_jobs": 100, "saved_jobs_per_day": 30}
    ) == 30
    assert auth_routes._get_saved_jobs_plan_limit({"saved_jobs": 20}) == 20
