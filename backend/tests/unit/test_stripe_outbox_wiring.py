"""Câblage du consommateur d'effets Stripe vers ARQ et le cron sécurisé."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import arq
import pytest
from fastapi import HTTPException

from src.api import deps
from src.api.routes import cron
from src.services import stripe_outbox
from src.workers import settings, tasks


@pytest.mark.asyncio
async def test_worker_processes_one_outbox_batch(monkeypatch):
    database = object()
    process = AsyncMock(
        return_value={"claimed": 1, "succeeded": 1, "retried": 0, "dead": 0}
    )
    monkeypatch.setattr(deps, "get_supabase_client", Mock(return_value=database))
    monkeypatch.setattr(stripe_outbox, "process_stripe_effects", process)

    result = await tasks.stripe_effect_outbox_task({})

    assert result == {"claimed": 1, "succeeded": 1, "retried": 0, "dead": 0}
    process.assert_awaited_once_with(
        database,
        limit=4,
        effect_timeout_seconds=20,
    )


@pytest.mark.asyncio
async def test_worker_drains_multiple_full_batches(monkeypatch):
    database = object()
    process = AsyncMock(
        side_effect=[
            {"claimed": 4, "succeeded": 3, "retried": 1, "dead": 0},
            {"claimed": 2, "succeeded": 2, "retried": 0, "dead": 0},
        ]
    )
    monkeypatch.setattr(deps, "get_supabase_client", Mock(return_value=database))
    monkeypatch.setattr(stripe_outbox, "process_stripe_effects", process)

    result = await tasks.stripe_effect_outbox_task({})

    assert result == {"claimed": 6, "succeeded": 5, "retried": 1, "dead": 0}
    assert process.await_count == 2


@pytest.mark.asyncio
async def test_worker_stops_before_claiming_after_time_budget(monkeypatch):
    database = object()
    process = AsyncMock(
        return_value={
            "claimed": 4,
            "succeeded": 4,
            "retried": 0,
            "dead": 0,
        }
    )
    monkeypatch.setattr(deps, "get_supabase_client", Mock(return_value=database))
    monkeypatch.setattr(stripe_outbox, "process_stripe_effects", process)
    monkeypatch.setattr(tasks, "monotonic", Mock(side_effect=[0, 91]))

    result = await tasks.stripe_effect_outbox_task({})

    assert result["claimed"] == 4
    process.assert_awaited_once_with(
        database,
        limit=4,
        effect_timeout_seconds=20,
    )


@pytest.mark.asyncio
async def test_cron_rejects_invalid_secret(monkeypatch):
    monkeypatch.setattr(cron, "CRON_SECRET", "cron_test_secret")

    with pytest.raises(HTTPException) as error:
        await cron.stripe_effects_cron("Bearer wrong")

    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_cron_enqueues_outbox_worker(monkeypatch):
    enqueue = AsyncMock(return_value=SimpleNamespace(job_id="job_test_outbox"))
    close = AsyncMock()
    pool = SimpleNamespace(enqueue_job=enqueue, aclose=close)
    monkeypatch.setattr(cron, "CRON_SECRET", "cron_test_secret")
    monkeypatch.setattr(cron, "time", Mock(return_value=60_001), raising=False)

    monkeypatch.setattr(arq, "create_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(settings, "_get_redis_settings", Mock(return_value=object()))

    result = await cron.stripe_effects_cron("Bearer cron_test_secret")

    assert result == {"success": True, "job_id": "job_test_outbox"}
    enqueue.assert_awaited_once_with(
        "stripe_effect_outbox_task",
        _job_id="stripe-effect-outbox:500",
        _expires=120,
    )
    close.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_cron_uses_same_job_id_for_duplicate_trigger(monkeypatch):
    enqueue = AsyncMock(
        side_effect=[SimpleNamespace(job_id="stripe-effect-outbox:500"), None]
    )
    close = AsyncMock()
    pool = SimpleNamespace(enqueue_job=enqueue, aclose=close)
    monkeypatch.setattr(cron, "CRON_SECRET", "cron_test_secret")
    monkeypatch.setattr(cron, "time", Mock(return_value=60_001), raising=False)
    monkeypatch.setattr(arq, "create_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(settings, "_get_redis_settings", Mock(return_value=object()))

    first = await cron.stripe_effects_cron("Bearer cron_test_secret")
    duplicate = await cron.stripe_effects_cron("Bearer cron_test_secret")

    assert first == {"success": True, "job_id": "stripe-effect-outbox:500"}
    assert duplicate == {
        "success": True,
        "job_id": "stripe-effect-outbox:500",
        "already_enqueued": True,
    }
    assert enqueue.await_count == 2


@pytest.mark.asyncio
async def test_cron_closes_redis_pool_when_enqueue_fails(monkeypatch):
    close = AsyncMock()
    pool = SimpleNamespace(
        enqueue_job=AsyncMock(side_effect=RuntimeError("redis unavailable")),
        aclose=close,
    )
    monkeypatch.setattr(cron, "CRON_SECRET", "cron_test_secret")
    monkeypatch.setattr(arq, "create_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(settings, "_get_redis_settings", Mock(return_value=object()))

    with pytest.raises(HTTPException) as error:
        await cron.stripe_effects_cron("Bearer cron_test_secret")

    assert error.value.status_code == 500
    close.assert_awaited_once_with()
