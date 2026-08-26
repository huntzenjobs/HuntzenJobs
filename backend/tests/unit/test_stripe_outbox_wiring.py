"""Câblage prioritaire du consommateur d'effets Stripe et du cron sécurisé."""

from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from src.api import deps
from src.api.routes import cron
from src.services import stripe_outbox
from src.workers import tasks


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
async def test_cron_processes_outbox_outside_ai_queue(monkeypatch):
    process = AsyncMock(
        return_value={"claimed": 1, "succeeded": 1, "retried": 0, "dead": 0}
    )
    monkeypatch.setattr(cron, "CRON_SECRET", "cron_test_secret")
    monkeypatch.setattr(tasks, "stripe_effect_outbox_task", process)

    result = await cron.stripe_effects_cron("Bearer cron_test_secret")

    assert result == {
        "success": True,
        "summary": {"claimed": 1, "succeeded": 1, "retried": 0, "dead": 0},
    }
    process.assert_awaited_once_with({})


@pytest.mark.asyncio
async def test_cron_reports_outbox_timeout(monkeypatch):
    async def never_finishes(_ctx):
        import asyncio

        await asyncio.Future()

    monkeypatch.setattr(cron, "CRON_SECRET", "cron_test_secret")
    monkeypatch.setattr(tasks, "stripe_effect_outbox_task", never_finishes)
    real_wait_for = cron.asyncio.wait_for

    async def short_wait(awaitable, timeout):
        del timeout
        return await real_wait_for(awaitable, timeout=0.01)

    monkeypatch.setattr(cron.asyncio, "wait_for", short_wait)

    with pytest.raises(HTTPException) as error:
        await cron.stripe_effects_cron("Bearer cron_test_secret")

    assert error.value.status_code == 504


@pytest.mark.asyncio
async def test_cron_reports_outbox_processing_failure(monkeypatch):
    monkeypatch.setattr(cron, "CRON_SECRET", "cron_test_secret")
    monkeypatch.setattr(
        tasks,
        "stripe_effect_outbox_task",
        AsyncMock(side_effect=RuntimeError("database unavailable")),
    )

    with pytest.raises(HTTPException) as error:
        await cron.stripe_effects_cron("Bearer cron_test_secret")

    assert error.value.status_code == 500
