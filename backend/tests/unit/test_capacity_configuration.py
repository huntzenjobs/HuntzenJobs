"""Contrats de capacité partagés par l'API, PostgreSQL, Redis et ARQ."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app import database
from src.api import middleware
from src.config.settings import Settings
from src.workers.settings import _get_redis_settings


def test_capacity_settings_have_safe_bounded_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.db_pool_min_size == 1
    assert settings.db_pool_size == 5
    assert settings.db_pool_timeout == 10
    assert settings.redis_limiter_url == ""
    assert settings.arq_redis_url == ""


@pytest.mark.asyncio
async def test_database_pool_uses_capacity_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool_instance = Mock()
    pool_instance.open = AsyncMock()
    pool_factory = Mock(return_value=pool_instance)
    monkeypatch.setenv("DATABASE_URL", "postgresql://pooler.invalid/database")
    monkeypatch.setattr(database, "AsyncConnectionPool", pool_factory)
    monkeypatch.setattr(
        database,
        "get_settings",
        lambda: SimpleNamespace(
            db_pool_min_size=1,
            db_pool_size=5,
            db_pool_timeout=10,
        ),
        raising=False,
    )
    monkeypatch.setattr(database, "pool", None)

    await database.init_connection_pool_async()

    assert pool_factory.call_args.kwargs["min_size"] == 1
    assert pool_factory.call_args.kwargs["max_size"] == 5
    assert pool_factory.call_args.kwargs["timeout"] == 10
    pool_instance.open.assert_awaited_once()


def test_arq_prefers_the_dedicated_queue_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "ARQ_REDIS_URL",
        "rediss://queue-user:queue-password@queue.internal:6380/3",
    )
    monkeypatch.setenv(
        "REDIS_URL",
        "redis://cache-user:cache-password@cache.internal:6379/0",
    )

    redis_settings = _get_redis_settings()

    assert redis_settings.host == "queue.internal"
    assert redis_settings.port == 6380
    assert redis_settings.database == 3
    assert redis_settings.username == "queue-user"
    assert redis_settings.password == "queue-password"
    assert redis_settings.ssl is True


def test_rate_limiter_prefers_dedicated_redis_and_accepts_tls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        middleware.settings,
        "redis_limiter_url",
        "rediss://limiter.internal:6380",
        raising=False,
    )
    monkeypatch.setattr(
        middleware.settings,
        "redis_url",
        "redis://cache.internal:6379",
    )

    assert middleware._get_rate_limit_redis_url() == "rediss://limiter.internal:6380"
