import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.cv_adapter.main_agent import CVAdapterAgent


class JsonValidationError(Exception):
    body = {"error": {"code": "json_validate_failed"}}


class FakeCompletions:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def create(self, **kwargs: object) -> SimpleNamespace:
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
        async def create(self, **kwargs: object) -> None:
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


def test_match_score_is_clamped_to_percentage_bounds() -> None:
    agent = object.__new__(CVAdapterAgent)

    result = agent._calculate_match_score(
        {"required_skills": [f"skill-{index}" for index in range(9)]},
        {
            "skills_coverage": {
                "matched": [f"skill-{index}" for index in range(11)],
                "missing": [],
            },
            "overall_fit_score": 122,
        },
    )

    assert result["skills_match"] == 100
    assert result["experience_fit"] == 100
    assert result["overall"] == 100


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


@pytest.mark.asyncio
async def test_adaptation_uses_sanitized_cv_when_fact_check_rejects_draft() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    original_data = {
        "success": True,
        "personal_info": {"name": "Camille"},
        "experiences": [{"title": "Data Analyst", "company": "Exemple"}],
    }
    sanitized_cv = {
        "personal_info": {"name": "Camille"},
        "experiences": [{"title": "Data Analyst", "company": "Exemple"}],
        "education": [],
        "certifications": [],
        "projects": [],
        "skills": {},
        "interests": [],
    }

    agent._extract_factual_data = AsyncMock(return_value=original_data)
    agent._analyze_job = AsyncMock(return_value={"success": True, "required_skills": []})
    agent._map_cv_to_job = AsyncMock(
        return_value={"success": True, "skills_coverage": {}, "overall_fit_score": 75}
    )
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(
        return_value={
            "personal_info": {"name": "Camille"},
            "experiences": [{"title": "Payments Lead", "company": "Exemple"}],
        }
    )
    agent._fact_check = AsyncMock(
        side_effect=[
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": sanitized_cv,
            },
            {"valid": True, "issues": []},
        ]
    )

    result = await agent.run("CV source", "Offre data", language="fr")

    assert agent._fact_check.await_count == 2
    assert agent._fact_check.await_args_list[1].args == ("CV source", sanitized_cv)
    assert result["success"] is True
    assert result["cv_data"] == {**sanitized_cv, "huntzen_certified": True}
    assert result["fact_check"] == {"valid": True, "issues": []}


def test_sanitized_cv_rejects_skills_absent_from_source() -> None:
    agent = object.__new__(CVAdapterAgent)
    original_data = {
        "personal_info": {"name": "Camille"},
        "experiences": [],
        "education": [],
        "certifications": [],
        "projects": [],
        "skills": {"Langages": ["Python"]},
        "interests": [],
    }
    sanitized_cv = {
        **original_data,
        "skills": {"Langages": ["Python", "Rust"]},
    }

    assert agent._sanitized_cv_preserves_source_facts(original_data, sanitized_cv) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("sanitized_cv", [{}, {"summary": "Profil data"}])
async def test_adaptation_rejects_empty_or_partial_sanitized_cv(
    sanitized_cv: dict[str, object],
) -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    original_data = {
        "success": True,
        "personal_info": {"name": "Camille", "email": "camille@example.com"},
        "experiences": [{"title": "Data Analyst", "company": "Exemple"}],
    }
    agent._extract_factual_data = AsyncMock(return_value=original_data)
    agent._analyze_job = AsyncMock(return_value={"success": True, "required_skills": []})
    agent._map_cv_to_job = AsyncMock(
        return_value={"success": True, "skills_coverage": {}, "overall_fit_score": 75}
    )
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(return_value={"summary": "Draft"})
    agent._fact_check = AsyncMock(
        return_value={
            "valid": False,
            "issues": [{"type": "hallucination", "severity": "high"}],
            "sanitized_cv": sanitized_cv,
        }
    )

    result = await agent.run("CV source", "Offre data", language="fr")

    assert result["success"] is False
    assert "sanitized" in result["error"].lower()


@pytest.mark.asyncio
async def test_fact_check_fails_closed_when_provider_errors() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(side_effect=RuntimeError("provider unavailable"))

    result = await agent._fact_check("CV source", {"summary": "Draft"})

    assert result["valid"] is False
    assert result["issues"][0]["type"] == "validation_error"


@pytest.mark.asyncio
async def test_fact_check_rejects_valid_true_with_reported_issues() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    issues = [{"type": "hallucination", "severity": "high"}]
    agent._create_json_completion = AsyncMock(
        return_value={"valid": True, "issues": issues, "sanitized_cv": {"summary": "Safe"}}
    )

    result = await agent._fact_check("CV source", {"summary": "Draft"})

    assert result["valid"] is False
    assert result["issues"] == issues


@pytest.mark.asyncio
async def test_cover_letter_fact_check_rejects_valid_true_with_issues() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    issues = [{"type": "hallucination", "severity": "high"}]
    agent._create_json_completion = AsyncMock(
        return_value={"valid": True, "issues": issues}
    )

    result = await agent._fact_check_cover_letter(
        {"personal_info": {"name": "Camille"}},
        "Offre data",
        {"paragraph_1": "Draft"},
    )

    assert result["valid"] is False
    assert result["issues"] == issues


@pytest.mark.asyncio
async def test_cover_letter_regenerates_once_after_factual_rejection() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    first_draft = {"paragraph_1": "J'ai dirigé une équipe paiement."}
    corrected_draft = {"paragraph_1": "Je souhaite contribuer à vos produits."}
    agent._create_json_completion = AsyncMock(
        side_effect=[
            first_draft,
            {
                "valid": False,
                "issues": [{"type": "hallucination", "adapted": "équipe paiement"}],
            },
            corrected_draft,
            {"valid": True, "issues": []},
        ]
    )

    result = await agent.generate_cover_letter(
        {"personal_info": {"name": "Camille"}, "experiences": []},
        "Offre Data Analyst",
        language="fr",
        company_name="Exemple",
    )

    assert agent._create_json_completion.await_count == 4
    assert all(
        "SAFETY OVERRIDE" in call.kwargs["messages"][0]["content"]
        for call in agent._create_json_completion.await_args_list
    )
    assert result["success"] is True
    assert result["paragraph_1"] == corrected_draft["paragraph_1"]
    assert result["fact_check"] == {"valid": True, "issues": []}
    correction_messages = agent._create_json_completion.await_args_list[2].kwargs["messages"]
    correction_draft = json.loads(correction_messages[-2]["content"])
    assert correction_draft["paragraph_1"] == first_draft["paragraph_1"]
    assert correction_draft["header"]["name"] == "Camille"
    assert "PREVIOUS DRAFT" not in correction_messages[-1]["content"]


@pytest.mark.asyncio
async def test_cover_letter_fails_after_second_factual_rejection() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    rejection = {
        "valid": False,
        "issues": [{"type": "hallucination", "adapted": "équipe paiement"}],
    }
    agent._create_json_completion = AsyncMock(
        side_effect=[
            {"paragraph_1": "J'ai dirigé une équipe paiement."},
            rejection,
            {"paragraph_1": "J'ai piloté les paiements."},
            rejection,
        ]
    )

    result = await agent.generate_cover_letter(
        {"personal_info": {"name": "Camille"}, "experiences": []},
        "Offre Data Analyst",
        language="fr",
        company_name="Exemple",
    )

    assert agent._create_json_completion.await_count == 4
    assert result["success"] is False
    assert result["fact_check"] == rejection
