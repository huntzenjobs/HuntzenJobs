from types import SimpleNamespace

import pytest

from src.agents.cv_adapter.main_agent import CVAdapterAgent


class JsonValidationError(Exception):
    body = {"error": {"code": "json_validate_failed"}}


class FakeCompletions:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def create(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            raise JsonValidationError("Groq JSON validation failed")
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='```json\n{"personal_info": {"name": "Camille"}}\n```'
                    )
                )
            ]
        )


@pytest.mark.asyncio
async def test_json_completion_retries_without_provider_json_mode() -> None:
    agent = object.__new__(CVAdapterAgent)
    completions = FakeCompletions()
    agent.groq_client = SimpleNamespace(
        chat=SimpleNamespace(completions=completions)
    )
    agent.name = "CVAdapter"

    result = await agent._create_json_completion(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": "Return JSON"}],
        temperature=0.0,
    )

    assert result == {"personal_info": {"name": "Camille"}}
    assert completions.calls[0]["response_format"] == {"type": "json_object"}
    assert completions.calls[0]["max_completion_tokens"] == 8192
    assert "response_format" not in completions.calls[1]
    assert completions.calls[1]["max_completion_tokens"] == 8192
    assert len(completions.calls) == 2


@pytest.mark.asyncio
async def test_json_completion_does_not_retry_unrelated_errors() -> None:
    agent = object.__new__(CVAdapterAgent)

    class FailingCompletions:
        def create(self, **kwargs: object) -> None:
            raise RuntimeError("network unavailable")

    agent.groq_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FailingCompletions())
    )
    agent.name = "CVAdapter"

    with pytest.raises(RuntimeError, match="network unavailable"):
        await agent._create_json_completion(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": "Return JSON"}],
            temperature=0.0,
        )


@pytest.mark.asyncio
async def test_factual_extraction_retries_when_structured_sections_are_lost() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    calls: list[str] = []

    async def fake_completion(**kwargs: object) -> dict[str, object]:
        calls.append(str(kwargs["model"]))
        if len(calls) == 1:
            return {"personal_info": {"name": "Camille"}, "experiences": [], "education": []}
        return {
            "personal_info": {"name": "Camille"},
            "experiences": [{"title": "Data Engineer", "company": "Exemple"}],
            "education": [{"degree": "Master", "school": "Université Exemple"}],
        }

    agent._create_json_completion = fake_completion  # type: ignore[method-assign]

    result = await agent._extract_factual_data(
        "EXPERIENCE PROFESSIONNELLE\nData Engineer - Exemple\nFORMATION\nMaster - Université Exemple",
        "fr",
    )

    assert result["success"] is True
    assert len(result["experiences"]) == 1
    assert len(result["education"]) == 1
    assert len(calls) == 2


def test_rewritten_bullets_reject_invented_metrics() -> None:
    original = ["Conception de pipelines traitant 20 millions d'événements par jour."]
    invented = ["Réduction de 40 % du délai sur 2 millions d'événements."]

    assert CVAdapterAgent._safe_improved_bullets(original, invented) == original


def test_rewritten_bullets_keep_original_metrics() -> None:
    original = ["Réduction de 35 % du temps de traitement."]
    improved = ["Optimisation du pipeline réduisant le traitement de 35 %."]

    assert CVAdapterAgent._safe_improved_bullets(original, improved) == improved


@pytest.mark.asyncio
async def test_skill_categorization_never_injects_job_requirements() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    categorized_inputs: list[str] = []

    async def fake_categorize(**kwargs: object) -> dict[str, list[str]]:
        categorized_inputs.extend(kwargs["all_skills"])  # type: ignore[arg-type]
        return {"Langages": list(kwargs["all_skills"])}  # type: ignore[arg-type]

    agent._categorize_skills_dynamically = fake_categorize  # type: ignore[method-assign]
    cv_data = {"skills": {"Langages": ["Python"]}}

    result = await agent._inject_missing_skills(
        cv_data,
        {"skills_coverage": {"missing": ["Spark"], "transferable": ["Docker"]}},
        {"required_skills": ["Spark"], "nice_to_have_skills": ["Airflow"]},
    )

    assert categorized_inputs == ["Python"]
    assert result["skills"] == {"Langages": ["Python"]}
