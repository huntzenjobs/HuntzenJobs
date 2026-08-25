from unittest.mock import AsyncMock, Mock

import pytest

from src.utils import cache


@pytest.mark.asyncio
async def test_get_redis_uses_bounded_blocking_pool(monkeypatch: pytest.MonkeyPatch) -> None:
    pool = object()
    client = Mock()
    client.ping = AsyncMock()
    pool_from_url = Mock(return_value=pool)
    redis_factory = Mock(return_value=client)

    monkeypatch.setattr(cache, "_redis_client", None)
    monkeypatch.setattr(cache, "_redis_initialized", False)
    monkeypatch.setattr(cache, "_build_redis_url", lambda: "redis://staging.invalid:6379")
    monkeypatch.setattr(cache.aioredis.BlockingConnectionPool, "from_url", pool_from_url)
    monkeypatch.setattr(cache.aioredis, "Redis", redis_factory)

    assert await cache.get_redis() is client
    pool_from_url.assert_called_once_with(
        "redis://staging.invalid:6379",
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
        timeout=5,
        socket_connect_timeout=5,
        socket_keepalive=True,
    )
    redis_factory.assert_called_once_with(connection_pool=pool)
    client.ping.assert_awaited_once()
