from unittest.mock import AsyncMock

import pytest

from src.agents.base import SubAgentTransientError
from src.agents.cv_analyzer.main_agent import CVAnalyzerAgent


class FakeJobMatcher:
    def __init__(self) -> None:
        self.tasks: list[str] = []

    async def run(self, *, task: str) -> str:
        self.tasks.append(task)
        if len(self.tasks) == 1:
            return "Le profil correspond bien à l'offre."
        return '{"match_score": 84, "verdict": "Bon alignement"}'


@pytest.mark.asyncio
async def test_job_match_retries_once_with_json_only_instruction() -> None:
    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    matcher = FakeJobMatcher()
    agent.job_matcher = matcher

    result = await agent._match_job(
        "CV avec expérience Python",
        "Offre recherchant Python",
        "fr",
    )

    assert result == {"match_score": 84, "verdict": "Bon alignement"}
    assert len(matcher.tasks) == 2
    assert "JSON" in matcher.tasks[1]
    assert "sans Markdown" in matcher.tasks[1]


@pytest.mark.asyncio
async def test_job_match_does_not_retry_a_transient_provider_failure() -> None:
    class TransientlyFailingMatcher:
        def __init__(self) -> None:
            self.calls = 0

        async def run(self, *, task: str) -> str:
            del task
            self.calls += 1
            raise SubAgentTransientError("timeout")

    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    matcher = TransientlyFailingMatcher()
    agent.job_matcher = matcher

    with pytest.raises(SubAgentTransientError):
        await agent._match_job("CV", "Offre", "fr")

    assert matcher.calls == 1


@pytest.mark.asyncio
async def test_improvements_decode_advisor_json_without_losing_recommendations() -> None:
    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent.delegate_to = AsyncMock(return_value='{"content_improvements":["Précisez les missions effectuées"],"missing_sections":["Résumé professionnel"]}')

    result = await agent._get_improvements("CV fictif", "fr")

    assert result == {
        "content_improvements": ["Précisez les missions effectuées"],
        "missing_sections": ["Résumé professionnel"],
    }
    agent.delegate_to.assert_awaited_once_with(
        "ImprovementAdvisor", task="CV fictif", context="Language: fr"
    )


@pytest.mark.parametrize("language,label", [
    ("fr", "Compétences mentionnées"),
    ("en", "Skills mentioned"),
    ("es", "Competencias mencionadas"),
    ("pt", "Competências mencionadas"),
])
def test_strengths_do_not_invent_proficiency(language: str, label: str) -> None:
    agent = object.__new__(CVAnalyzerAgent)
    assert agent._extract_strengths({}, {"technical_skills": ["Excel débutant"]}, language) == [
        f"{label} : Excel débutant"
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("response,expected", [
    ('```json\n{"quick_wins":["Ajoutez un titre"]}\n```', {"quick_wins": ["Ajoutez un titre"]}),
    ('[]', {}),
    ('CV_CONFIDENTIEL_TEST réponse invalide', {}),
])
async def test_improvement_parsing_does_not_log_cv_content(
    response: str, expected: dict[str, list[str]], caplog: pytest.LogCaptureFixture,
) -> None:
    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent.delegate_to = AsyncMock(return_value=response)
    assert await agent._get_improvements("CV fictif", "fr") == expected
    assert "CV_CONFIDENTIEL_TEST" not in caplog.text


@pytest.mark.asyncio
async def test_analysis_keeps_suggestions_and_separates_language_caches(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.agents.cv_analyzer import main_agent

    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent._score_ats = AsyncMock(return_value={"total": 78})
    agent._extract_skills = AsyncMock(return_value={"technical_skills": ["Excel débutant"]})
    agent._extract_info = AsyncMock(return_value={})
    agent.delegate_to = AsyncMock(return_value='{"content_improvements":["Précisez les missions effectuées"]}')
    cache = AsyncMock()
    cache.get.return_value = None
    monkeypatch.setattr(main_agent, "get_redis", AsyncMock(return_value=cache))
    cv_text = "Expérience en manutention. Formation logistique. " * 15

    for language in ("fr", "en"):
        result = await agent.run(cv_text=cv_text, language=language)
        assert result["success"] is True
        assert result["improvements"]["content_improvements"] == ["Précisez les missions effectuées"]
        assert "Précisez les missions effectuées" in result["weaknesses"]

    cache_keys = [call.args[0] for call in cache.setex.await_args_list]
    assert len(cache_keys) == 2
    assert cache_keys[0].startswith("cv:analysis:v2:fr:")
    assert cache_keys[1].startswith("cv:analysis:v2:en:")
    assert cache_keys[0] != cache_keys[1]
