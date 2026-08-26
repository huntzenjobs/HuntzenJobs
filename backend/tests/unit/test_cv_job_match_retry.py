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
