import json
from unittest.mock import AsyncMock, Mock

import pytest

from src.api import deps
from src.workers.tasks import cover_letter_task, cv_adapt_task


@pytest.mark.asyncio
async def test_cv_adapt_task_uses_current_agent_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = Mock()
    agent.run = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)

    result = await cv_adapt_task(
        {},
        cv_text="CV suffisamment détaillé",
        job_description="Offre suffisamment détaillée",
        language="fr",
    )

    assert result == {"success": True}
    agent.run.assert_awaited_once_with(
        cv_text="CV suffisamment détaillé",
        job_description="Offre suffisamment détaillée",
        language="fr",
        template="ats",
    )


@pytest.mark.asyncio
async def test_cover_letter_task_uses_structured_cv_data(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = Mock()
    agent.generate_cover_letter = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(deps, "get_cv_adapter_main", lambda: agent)
    cv_data = {"personal_info": {"name": "Jean Dupont"}}

    result = await cover_letter_task(
        {},
        cv_data=cv_data,
        job_description="Offre suffisamment détaillée",
        language="fr",
        company_name="Entreprise Test",
    )

    assert result == {"success": True}
    agent.generate_cover_letter.assert_awaited_once_with(
        cv_data=cv_data,
        job_description="Offre suffisamment détaillée",
        language="fr",
        company_name="Entreprise Test",
    )


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
