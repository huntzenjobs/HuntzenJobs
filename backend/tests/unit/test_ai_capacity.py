"""Régressions du garde-fou de capacité IA partagé entre routes et workers."""

from unittest.mock import AsyncMock

import pytest

from src.utils import ai_capacity


@pytest.mark.asyncio
async def test_global_ai_counter_uses_one_shared_cross_feature_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = AsyncMock()
    redis.eval.return_value = 7
    monkeypatch.setattr(ai_capacity, "get_redis", AsyncMock(return_value=redis))

    count = await ai_capacity.increment_global_ai_active()

    assert count == 7
    acquire_call = redis.eval.await_args
    assert acquire_call.args[:3] == (
        ai_capacity._ACQUIRE_LEASE_SCRIPT,
        1,
        ai_capacity.GLOBAL_AI_ACTIVE_KEY,
    )
    assert len(acquire_call.args[3]) == 32
    assert acquire_call.args[4] == ai_capacity.GLOBAL_AI_ACTIVE_TTL_SECONDS


@pytest.mark.asyncio
async def test_global_ai_counter_fails_closed_without_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ai_capacity, "get_redis", AsyncMock(return_value=None))

    with pytest.raises(ai_capacity.CapacityStoreUnavailable):
        await ai_capacity.increment_global_ai_active()


@pytest.mark.asyncio
async def test_capacity_release_never_relies_on_a_non_atomic_read_modify_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = AsyncMock()
    redis.eval.side_effect = [1, 0]
    monkeypatch.setattr(ai_capacity, "get_redis", AsyncMock(return_value=redis))

    await ai_capacity.increment_global_ai_active()
    await ai_capacity.decrement_global_ai_active()

    release_call = redis.eval.await_args_list[1]
    assert release_call.args[:3] == (
        ai_capacity._RELEASE_LEASE_SCRIPT,
        1,
        ai_capacity.GLOBAL_AI_ACTIVE_KEY,
    )
    assert len(release_call.args[3]) == 32


@pytest.mark.asyncio
async def test_extraction_lease_renews_only_its_live_zset_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = AsyncMock()
    redis.eval.side_effect = [1, 1]
    monkeypatch.setattr(ai_capacity, "get_redis", AsyncMock(return_value=redis))

    await ai_capacity.increment_cv_extraction_active()
    await ai_capacity.renew_cv_extraction_active()

    acquire_call, renew_call = redis.eval.await_args_list
    assert renew_call.args == (
        ai_capacity._RENEW_LEASE_SCRIPT,
        1,
        ai_capacity.CV_EXTRACTION_ACTIVE_KEY,
        acquire_call.args[3],
        ai_capacity.CV_EXTRACTION_ACTIVE_TTL_SECONDS,
    )
