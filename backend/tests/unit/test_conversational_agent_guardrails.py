import logging
from types import SimpleNamespace

import pytest

import src.agents.coach.main_agent as coach_module
from src.agents.base import BaseAgent
from src.agents.branding.main_agent import BrandingAgent
from src.agents.coach.main_agent import CareerCoachAgent
from src.agents.cv_adapter.conversational_agent import CVAdapterConversationalAgent
from src.agents.cv_analyzer.conversational_agent import CVAnalyzerConversationalAgent
from src.agents.interview_sim.conversational_agent import InterviewSimAgent
from src.agents.job_scout.conversational_agent import JobScoutConversationalAgent

AGENT_CLASSES = (
    CVAdapterConversationalAgent,
    CVAnalyzerConversationalAgent,
    InterviewSimAgent,
    JobScoutConversationalAgent,
)


class CapturingLLM:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.messages: list[object] = []

    async def ainvoke(self, messages: list[object]) -> SimpleNamespace:
        self.messages = messages
        if self.fail:
            raise RuntimeError("provider unavailable")
        return SimpleNamespace(content="Réponse prudente")


def _install_fake_base_init(monkeypatch: pytest.MonkeyPatch, llm: CapturingLLM) -> None:
    def fake_init(self: BaseAgent, config: object) -> None:
        self.config = config
        self.name = config.name  # type: ignore[attr-defined]
        self.llm = llm
        self.logger = logging.getLogger(str(self.name))

    monkeypatch.setattr(BaseAgent, "__init__", fake_init)


@pytest.mark.asyncio
@pytest.mark.parametrize("agent_class", AGENT_CLASSES)
async def test_conversational_agents_send_factual_guardrails_to_llm(
    monkeypatch: pytest.MonkeyPatch,
    agent_class: type[BaseAgent],
) -> None:
    llm = CapturingLLM()
    _install_fake_base_init(monkeypatch, llm)
    agent = agent_class()

    result = await agent.run("Aide-moi avec mon profil", history=[], language="fr")

    prompt = str(llm.messages[0].content).lower()  # type: ignore[attr-defined]
    assert result["success"] is True
    assert agent.config.temperature <= 0.3
    assert "n'attribue jamais au candidat" in prompt
    assert "n'invente jamais de score numérique de cv" in prompt
    assert "exemple hypothétique" in prompt


@pytest.mark.asyncio
async def test_job_scout_does_not_claim_application_submission_or_live_platforms(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    llm = CapturingLLM()
    _install_fake_base_init(monkeypatch, llm)
    agent = JobScoutConversationalAgent()

    await agent.run("Où dois-je postuler ?", history=[], language="fr")

    prompt = str(llm.messages[0].content).lower()  # type: ignore[attr-defined]
    assert "huntzen ne soumet pas de candidatures" in prompt
    assert "plateforme comme active" in prompt


@pytest.mark.asyncio
@pytest.mark.parametrize("agent_class", AGENT_CLASSES)
async def test_conversational_agents_return_stable_error_when_provider_fails(
    monkeypatch: pytest.MonkeyPatch,
    agent_class: type[BaseAgent],
) -> None:
    llm = CapturingLLM(fail=True)
    _install_fake_base_init(monkeypatch, llm)
    agent = agent_class()

    result = await agent.run("Bonjour", history=[], language="fr")

    assert result["success"] is False
    assert "Désolé" in result["response"]


@pytest.mark.parametrize("agent_class", (CareerCoachAgent, BrandingAgent))
def test_coach_and_branding_append_factual_guardrails_after_loaded_prompt(
    monkeypatch: pytest.MonkeyPatch,
    agent_class: type[BaseAgent],
) -> None:
    llm = CapturingLLM()

    def fake_init(self: BaseAgent, config: object) -> None:
        self.config = config
        self.name = config.name  # type: ignore[attr-defined]
        self.llm = llm
        self.system_prompt = "Ancien prompt DB potentiellement permissif"
        self.logger = logging.getLogger(str(self.name))

    monkeypatch.setattr(BaseAgent, "__init__", fake_init)
    monkeypatch.setattr(CareerCoachAgent, "_init_sub_agents", lambda self: None)

    agent = agent_class()
    prompt = agent.system_prompt.lower()

    assert agent.config.temperature <= 0.3
    assert prompt.startswith("ancien prompt db")
    assert "n'attribue jamais au candidat" in prompt
    assert "n'invente jamais de score numérique de cv" in prompt
    assert "exemple hypothétique" in prompt


def test_all_coach_subagents_append_factual_guardrails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_prompts: dict[str, str] = {}

    class FakeSubAgent:
        def __init__(self, *, name: str, system_prompt: str, **kwargs: object) -> None:
            self.name = name
            captured_prompts[name] = system_prompt

    def fake_init(self: BaseAgent, config: object) -> None:
        self.config = config
        self.name = config.name  # type: ignore[attr-defined]
        self.system_prompt = "Prompt principal"
        self._sub_agents = {}
        self.logger = logging.getLogger(str(self.name))

    monkeypatch.setattr(BaseAgent, "__init__", fake_init)
    monkeypatch.setattr(coach_module, "SubAgent", FakeSubAgent)
    monkeypatch.setattr(coach_module, "load_prompt", lambda filename: f"Prompt DB {filename}")

    CareerCoachAgent()

    assert set(captured_prompts) == {
        "TrainingAdvisor",
        "CareerPlanner",
        "SkillAnalyzer",
        "SalaryAdvisor",
        "ParameterExtractor",
    }
    assert all(
        "n'attribue jamais au candidat" in prompt.lower()
        for prompt in captured_prompts.values()
    )
