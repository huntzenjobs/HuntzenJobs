import json
from unittest.mock import AsyncMock, Mock

import pytest
from arq import Retry

from src.api import deps
from src.workers import tasks
from src.workers.settings import WorkerSettings
from src.workers.tasks import cover_letter_task, cv_adapt_task


@pytest.fixture(autouse=True)
def _available_global_ai_capacity(monkeypatch: pytest.MonkeyPatch) -> None:
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


def test_worker_only_reserves_jobs_it_can_process_concurrently() -> None:
    assert WorkerSettings.max_jobs == 5
    function_names = {
        getattr(function, "name", None) or getattr(function, "__name__", "")
        for function in WorkerSettings.functions
    }
    assert "stripe_effect_outbox_task" not in function_names
    retry_budgets = {
        function.name: function.max_tries
        for function in WorkerSettings.functions
        if getattr(function, "name", None)
    }
    assert retry_budgets == {
        "coach_task": 30,
        "assistant_task": 30,
        "cv_adapt_task": 30,
        "cover_letter_task": 30,
    }


@pytest.mark.asyncio
async def test_worker_retries_instead_of_exceeding_global_ai_capacity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = Mock()
    agent.run = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)
    monkeypatch.setattr(
        tasks,
        "increment_global_ai_active",
        AsyncMock(return_value=tasks.GLOBAL_AI_SYNC_LIMIT + 1),
    )

    with pytest.raises(Retry):
        await cv_adapt_task(
            {},
            cv_text="CV suffisamment détaillé",
            job_description="Offre suffisamment détaillée",
        )

    agent.run.assert_not_awaited()


@pytest.mark.asyncio
async def test_cv_adapt_task_uses_current_agent_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = Mock()
    agent.run = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)
    commit_reservation = AsyncMock()
    monkeypatch.setattr(tasks, "_commit_quota_reservation", commit_reservation)

    result = await cv_adapt_task(
        {},
        cv_text="CV suffisamment détaillé",
        job_description="Offre suffisamment détaillée",
        language="fr",
        user_id="owner-123",
        quota_reservation_id="reservation-123",
    )

    assert result == {"success": True}
    agent.run.assert_awaited_once_with(
        cv_text="CV suffisamment détaillé",
        job_description="Offre suffisamment détaillée",
        language="fr",
        template="ats",
    )
    commit_reservation.assert_awaited_once_with("reservation-123", "owner-123")


@pytest.mark.asyncio
async def test_cover_letter_task_uses_structured_cv_data(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = Mock()
    agent.generate_cover_letter = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)
    commit_reservation = AsyncMock()
    monkeypatch.setattr(tasks, "_commit_quota_reservation", commit_reservation)
    cv_data = {"personal_info": {"name": "Jean Dupont"}}

    result = await cover_letter_task(
        {},
        cv_data=cv_data,
        job_description="Offre suffisamment détaillée",
        language="fr",
        company_name="Entreprise Test",
        user_id="owner-123",
        quota_reservation_id="reservation-456",
    )

    assert result == {"success": True}
    agent.generate_cover_letter.assert_awaited_once_with(
        cv_data=cv_data,
        job_description="Offre suffisamment détaillée",
        language="fr",
        company_name="Entreprise Test",
    )
    commit_reservation.assert_awaited_once_with("reservation-456", "owner-123")


@pytest.mark.asyncio
async def test_failed_worker_releases_quota_reservation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = Mock()
    agent.run = AsyncMock(return_value={"success": False, "error": "fact-check"})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)
    release_reservation = AsyncMock()
    monkeypatch.setattr(tasks, "_release_quota_reservation", release_reservation)

    result = await cv_adapt_task(
        {},
        cv_text="CV suffisamment détaillé",
        job_description="Offre suffisamment détaillée",
        quota_reservation_id="reservation-789",
    )

    assert result["success"] is False
    release_reservation.assert_awaited_once_with("reservation-789")


@pytest.mark.asyncio
async def test_final_worker_commit_failure_releases_reservation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = Mock()
    agent.run = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)
    monkeypatch.setattr(
        tasks,
        "_commit_quota_reservation",
        AsyncMock(side_effect=RuntimeError("database unavailable")),
    )
    release_reservation = AsyncMock()
    monkeypatch.setattr(tasks, "_release_quota_reservation", release_reservation)

    with pytest.raises(RuntimeError, match="database unavailable"):
        await cv_adapt_task(
            {"job_try": 30},
            cv_text="CV suffisamment détaillé",
            job_description="Offre suffisamment détaillée",
            user_id="owner-123",
            quota_reservation_id="reservation-final",
        )

    release_reservation.assert_awaited_once_with("reservation-final")


@pytest.mark.asyncio
async def test_cover_letter_task_accepts_legacy_queued_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = Mock()
    agent.generate_cover_letter = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)
    cv_data = {"personal_info": {"name": "Jean Dupont"}}

    await cover_letter_task(
        {},
        cv_text=json.dumps(cv_data),
        job_description="Offre suffisamment détaillée",
        job_title="Ancien champ toléré",
    )

    agent.generate_cover_letter.assert_awaited_once_with(
        cv_data=cv_data,
        job_description="Offre suffisamment détaillée",
        language="fr",
        company_name="",
    )
