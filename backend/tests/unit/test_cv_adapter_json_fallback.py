import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, create_autospec

import pytest

from src.agents.cv_adapter.main_agent import CVAdapterAgent


class JsonValidationError(Exception):
    body = {"error": {"code": "json_validate_failed"}}


def _complete_cv_reference(
    *,
    title: str = "Data Analyst",
    start_date: str = "janvier 2022",
) -> dict[str, object]:
    return {
        "personal_info": {"name": "Camille"},
        "experiences": [
            {
                "title": title,
                "company": "Exemple",
                "start_date": start_date,
                "end_date": "mars 2024",
                "bullets": ["Analyse des données."],
            }
        ],
        "education": [
            {"degree": "Master Data", "school": "Université Exemple", "year": "2020-2022"}
        ],
        "certifications": [
            {"name": "Certification SQL", "issuer": "Exemple", "year": "2023"}
        ],
        "projects": [
            {"name": "Projet BI", "technologies": "Python", "description": "Tableaux de bord"}
        ],
        "skills": {"technical": ["Python", "SQL"]},
        "interests": [],
    }


def _complete_cv_source(
    *,
    headings: bool = True,
    project_url: str = "",
    portfolio_url: str = "",
) -> str:
    sections = [
        "Camille",
        "EXPÉRIENCE PROFESSIONNELLE" if headings else "",
        "Data Analyst · Exemple · janvier 2022 · mars 2024",
        "Analyse des données.",
        "PORTFOLIO" if portfolio_url else "",
        portfolio_url,
        "FORMATION" if headings else "",
        "Master Data · Universite\u0301   Exemple · 2020-2022",
        "CERTIFICATIONS" if headings else "",
        "Certification SQL · Exemple · 2023",
        "PROJETS" if headings else "",
        f"Projet BI · Python · Tableaux de bord · {project_url}",
        "COMPÉTENCES" if headings else "",
        "Python · SQL",
    ]
    return "\n".join(line for line in sections if line)


@pytest.mark.asyncio
async def test_confirmed_reference_skips_extraction_and_is_the_only_fact_source() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    confirmed = _complete_cv_reference()
    agent._extract_factual_data = AsyncMock(
        side_effect=AssertionError("confirmed reference must skip extraction")
    )
    agent._validate_extracted_data = AsyncMock(
        side_effect=AssertionError("confirmed reference must skip probabilistic validation")
    )
    agent._analyze_job = AsyncMock(return_value={"success": True, "required_skills": []})
    agent._map_cv_to_job = AsyncMock(
        return_value={"success": True, "skills_coverage": {}, "overall_fit_score": 75}
    )
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(return_value=_complete_cv_reference())
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent.run(
        "Texte OCR non fiable",
        "OFFRE SEULEMENT, disponibilité immédiate exigée",
        language="fr",
        confirmed_factual_reference=confirmed,
    )

    assert result["success"] is True
    agent._extract_factual_data.assert_not_awaited()
    agent._validate_extracted_data.assert_not_awaited()
    factual_source, checked_cv = agent._fact_check.await_args.args
    assert "OFFRE SEULEMENT" not in factual_source
    assert "disponibilité immédiate" not in factual_source
    assert json.loads(factual_source) == confirmed
    assert checked_cv["personal_info"]["name"] == "Camille"
    mapped_source = agent._map_cv_to_job.await_args.args[0]
    assert "OFFRE SEULEMENT" not in mapped_source


@pytest.mark.asyncio
async def test_exact_extracted_reference_skips_llm_fact_check() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(), "success": True}
    agent._fact_check = AsyncMock(side_effect=AssertionError("unexpected LLM fact-check"))

    result = await agent._validate_extracted_data(_complete_cv_source(), extracted)

    assert result == extracted
    agent._fact_check.assert_not_awaited()


@pytest.mark.asyncio
async def test_extracted_reference_with_absent_numeric_scalar_uses_llm_fact_check() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(), "success": True}
    extracted["education"][0]["year"] = 2099
    source = _complete_cv_source()
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent._validate_extracted_data(source, extracted)

    assert result == extracted
    agent._fact_check.assert_awaited_once_with(
        source,
        extracted,
        require_complete=True,
    )


@pytest.mark.asyncio
async def test_extracted_reference_with_nested_boolean_uses_llm_fact_check() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(), "success": True}
    extracted["personal_info"]["verified"] = True
    source = _complete_cv_source()
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent._validate_extracted_data(source, extracted)

    assert result == extracted
    agent._fact_check.assert_awaited_once_with(
        source,
        extracted,
        require_complete=True,
    )


@pytest.mark.asyncio
async def test_extracted_reference_with_absent_string_uses_llm_fact_check() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(title="Lead Data"), "success": True}
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent._validate_extracted_data(_complete_cv_source(), extracted)

    assert result == extracted
    agent._fact_check.assert_awaited_once_with(
        _complete_cv_source(),
        extracted,
        require_complete=True,
    )


@pytest.mark.asyncio
async def test_portfolio_domain_misclassified_as_company_uses_llm_fact_check() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(), "success": True}
    extracted["experiences"][0]["company"] = "jobs.huntzen.co"
    source = _complete_cv_source(portfolio_url="jobs.huntzen.co")
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent._validate_extracted_data(source, extracted)

    assert result == extracted
    agent._fact_check.assert_awaited_once_with(
        source,
        extracted,
        require_complete=True,
    )


@pytest.mark.asyncio
async def test_project_domain_misclassified_as_company_uses_llm_fact_check() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(), "success": True}
    extracted["experiences"][0]["company"] = "jobs.huntzen.co"
    source = _complete_cv_source(project_url="jobs.huntzen.co")
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent._validate_extracted_data(source, extracted)

    assert result == extracted
    agent._fact_check.assert_awaited_once_with(
        source,
        extracted,
        require_complete=True,
    )


@pytest.mark.asyncio
async def test_exact_reference_without_explicit_headings_uses_llm_fact_check() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(), "success": True}
    source = _complete_cv_source(headings=False)
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent._validate_extracted_data(source, extracted)

    assert result == extracted
    agent._fact_check.assert_awaited_once_with(
        source,
        extracted,
        require_complete=True,
    )


@pytest.mark.asyncio
async def test_extracted_reference_uses_complete_correction_after_reverification() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    source = """EXPÉRIENCE PROFESSIONNELLE
Data Analyst, Exemple, janvier 2022 - mars 2024
FORMATION
Master Data, Université Exemple, 2020-2022
CERTIFICATION SQL, 2023
PROJET BI, Python
COMPÉTENCES Python, SQL"""
    contested = {
        **_complete_cv_reference(title="Lead Data", start_date="janvier 2020"),
        "success": True,
    }
    corrected = _complete_cv_reference()
    agent._fact_check = AsyncMock(
        side_effect=[
            {
                "valid": False,
                "issues": [{"type": "mismatch", "severity": "high"}],
                "sanitized_cv": corrected,
            },
            {"valid": True, "issues": []},
        ]
    )

    result = await agent._validate_extracted_data(source, contested)

    assert result == {**corrected, "success": True}
    assert result["experiences"][0]["title"] == "Data Analyst"
    assert result["experiences"][0]["start_date"] == "janvier 2022"
    assert agent._fact_check.await_count == 2
    assert agent._fact_check.await_args_list[0].args == (source, contested)
    assert agent._fact_check.await_args_list[0].kwargs == {"require_complete": True}
    assert agent._fact_check.await_args_list[1].args == (source, corrected)
    assert agent._fact_check.await_args_list[1].kwargs == {"require_complete": True}


@pytest.mark.asyncio
async def test_extracted_reference_rechecks_new_complete_correction_after_rejection() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    source = "EXPÉRIENCE PROFESSIONNELLE\nData Analyst, janvier 2022 - mars 2024"
    contested = {
        **_complete_cv_reference(title="Lead Data", start_date="janvier 2020"),
        "success": True,
    }
    first_correction = _complete_cv_reference()
    first_correction["experiences"][0]["bullets"] = ["Réduction des délais de 40 %."]
    second_correction = _complete_cv_reference()
    first_recheck_rejection = {
        "valid": False,
        "issues": [{"type": "skill_mismatch", "severity": "high"}],
        "sanitized_cv": second_correction,
    }
    agent._fact_check = AsyncMock(
        side_effect=[
            {
                "valid": False,
                "issues": [{"type": "mismatch", "severity": "high"}],
                "sanitized_cv": first_correction,
            },
            first_recheck_rejection,
            {"valid": True, "issues": []},
        ]
    )

    result = await agent._validate_extracted_data(source, contested)

    assert result == {**second_correction, "success": True}
    assert agent._fact_check.await_count == 3
    assert agent._fact_check.await_args_list[1].args == (source, first_correction)
    assert agent._fact_check.await_args_list[1].kwargs == {"require_complete": True}
    assert agent._fact_check.await_args_list[2].args == (source, second_correction)
    assert agent._fact_check.await_args_list[2].kwargs == {"require_complete": True}


@pytest.mark.asyncio
async def test_extracted_reference_rejects_partial_correction_without_reverification() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    partial = _complete_cv_reference()
    partial.pop("education")
    agent._fact_check = AsyncMock(
        return_value={
            "valid": False,
            "issues": [{"type": "missing_fact", "severity": "high"}],
            "sanitized_cv": partial,
        }
    )

    result = await agent._validate_extracted_data(
        "FORMATION\nMaster Data, Université Exemple, 2020-2022",
        {**_complete_cv_reference(title="Lead Data"), "success": True},
    )

    assert result["success"] is False
    assert "complete" in result["error"].lower()
    assert agent._fact_check.await_count == 1


@pytest.mark.asyncio
async def test_extracted_reference_rejects_correction_that_fails_reverification() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    source = "Data Analyst, janvier 2022 - mars 2024"
    corrected = _complete_cv_reference()
    second_correction = _complete_cv_reference()
    second_correction["experiences"][0]["bullets"] = ["Analyse des données source."]
    first_recheck_rejection = {
        "valid": False,
        "issues": [{"type": "missing_date", "severity": "high"}],
        "sanitized_cv": second_correction,
    }
    second_rejection = {
        "valid": False,
        "issues": [{"type": "missing_skill", "severity": "high"}],
        "sanitized_cv": _complete_cv_reference(),
    }
    agent._fact_check = AsyncMock(
        side_effect=[
            {
                "valid": False,
                "issues": [{"type": "mismatch", "severity": "high"}],
                "sanitized_cv": corrected,
            },
            first_recheck_rejection,
            second_rejection,
        ]
    )

    result = await agent._validate_extracted_data(
        source,
        {**_complete_cv_reference(start_date="janvier 2020"), "success": True},
    )

    assert result["success"] is False
    assert result["fact_check"] == second_rejection
    assert agent._fact_check.await_count == 3
    assert agent._fact_check.await_args_list[2].args == (source, second_correction)


@pytest.mark.asyncio
async def test_extracted_reference_rejects_partial_successive_correction() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    first_correction = _complete_cv_reference()
    partial_correction = _complete_cv_reference()
    partial_correction.pop("education")
    rejection = {
        "valid": False,
        "issues": [{"type": "missing_fact", "severity": "high"}],
        "sanitized_cv": partial_correction,
    }
    agent._fact_check = AsyncMock(
        side_effect=[
            {
                "valid": False,
                "issues": [{"type": "mismatch", "severity": "high"}],
                "sanitized_cv": first_correction,
            },
            rejection,
        ]
    )

    result = await agent._validate_extracted_data(
        "FORMATION\nMaster Data, Université Exemple, 2020-2022",
        {**_complete_cv_reference(title="Lead Data"), "success": True},
    )

    assert result["success"] is False
    assert result["fact_check"] == rejection
    assert agent._fact_check.await_count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("heading", "section"),
    [
        ("EXPÉRIENCE PROFESSIONNELLE", "experiences"),
        ("WORK EXPERIENCE", "experiences"),
        ("FORMATION", "education"),
        ("EDUCATION", "education"),
        ("CERTIFICATIONS", "certifications"),
        ("CERTIFICATES", "certifications"),
        ("PROJETS", "projects"),
        ("PROJECTS", "projects"),
        ("COMPÉTENCES", "skills"),
        ("SKILLS", "skills"),
        ("CENTRES D'INTÉRÊT", "interests"),
        ("INTERESTS", "interests"),
    ],
)
async def test_extracted_reference_rejects_successive_correction_missing_source_section(
    heading: str,
    section: str,
) -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    first_correction = _complete_cv_reference()
    first_correction["interests"] = ["Course à pied"]
    correction_with_missing_section = _complete_cv_reference()
    correction_with_missing_section["interests"] = ["Course à pied"]
    correction_with_missing_section[section] = {} if section == "skills" else []
    rejection = {
        "valid": False,
        "issues": [{"type": "missing_fact", "severity": "high"}],
        "sanitized_cv": correction_with_missing_section,
    }
    agent._fact_check = AsyncMock(
        side_effect=[
            {
                "valid": False,
                "issues": [{"type": "mismatch", "severity": "high"}],
                "sanitized_cv": first_correction,
            },
            rejection,
        ]
    )

    result = await agent._validate_extracted_data(
        f"{heading}: données présentes dans la source",
        {**_complete_cv_reference(title="Lead Data"), "success": True},
    )

    assert result["success"] is False
    assert result["fact_check"] == rejection
    assert agent._fact_check.await_count == 2


def test_missing_factual_sections_ignores_heading_words_inside_prose() -> None:
    candidate = _complete_cv_reference()
    candidate["education"] = []
    candidate["certifications"] = []
    candidate["projects"] = []
    candidate["skills"] = {}
    candidate["interests"] = []

    missing = CVAdapterAgent._missing_factual_sections(
        "Camille évoque sa formation, ses certifications, ses projets, ses skills et ses intérêts.",
        candidate,
    )

    assert missing == []


@pytest.mark.asyncio
async def test_extracted_reference_stops_after_valid_initial_control() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    extracted = {**_complete_cv_reference(), "success": True}
    agent._fact_check = AsyncMock(return_value={"valid": True, "issues": []})

    result = await agent._validate_extracted_data("CV source", extracted)

    assert result == extracted
    agent._fact_check.assert_awaited_once_with(
        "CV source",
        extracted,
        require_complete=True,
    )


@pytest.mark.asyncio
async def test_extracted_reference_fails_closed_when_initial_control_fails() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    validation_error = {
        "valid": False,
        "issues": [{"type": "validation_error", "severity": "high"}],
    }
    agent._fact_check = AsyncMock(return_value=validation_error)

    result = await agent._validate_extracted_data(
        "CV source",
        {**_complete_cv_reference(), "success": True},
    )

    assert result["success"] is False
    assert result["fact_check"] == validation_error


@pytest.mark.asyncio
async def test_complete_fact_check_requests_all_source_sections_and_date_associations() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    prompts: list[str] = []

    async def completion(**kwargs: object) -> dict[str, object]:
        prompts.append(str(kwargs["messages"][-1]["content"]))  # type: ignore[index]
        return {"valid": True, "issues": []}

    agent._create_json_completion = completion  # type: ignore[method-assign]

    result = await agent._fact_check(
        "CV source",
        _complete_cv_reference(),
        require_complete=True,
    )

    assert result == {"valid": True, "issues": []}
    prompt = prompts[0].casefold()
    for section in ("experiences", "education", "certifications", "projects", "skills"):
        assert section in prompt
    assert "dates" in prompt
    assert "duplicate" in prompt


@pytest.mark.asyncio
async def test_fact_check_excludes_transport_success_without_removing_candidate_facts() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    captured: list[dict] = []

    async def completion(**kwargs):
        prompt = kwargs["messages"][-1]["content"]
        payload = prompt.split("ADAPTED CV:\n", 1)[1].split("\n\nCheck every", 1)[0]
        captured.append(json.loads(payload))
        return {"valid": True, "issues": []}

    agent._create_json_completion = completion
    candidate = {**_complete_cv_reference(), "success": True}
    result = await agent._fact_check("CV source", candidate, require_complete=True)

    assert result["valid"] is True
    assert captured == [_complete_cv_reference()]
    assert candidate["success"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("is_career_change", [False, True])
async def test_rewriter_treats_job_keywords_as_context_not_candidate_evidence(is_career_change) -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    captured: list[str] = []

    async def completion(**kwargs):
        captured.append(kwargs["messages"][-1]["content"])
        return {"summary": "Analyse des données avec Python et SQL."}

    agent._create_json_completion = completion
    await agent._rewrite_bullets_only(
        _complete_cv_reference(),
        {"keywords": ["Kubernetes"], "required_skills": ["Kubernetes"]},
        {"is_career_change": is_career_change},
        "fr",
    )
    assert "MUST-USE KEYWORDS" not in captured[0]
    assert "not evidence about the candidate" in captured[0]
    assert "availability" in captured[0]
    assert "without inventing seniority" in captured[0]
    assert "TITLE MUST REFLECT TRANSITION" not in captured[0]
    assert "title MUST show transition" not in captured[0]
    assert "Kubernetes" not in captured[0]


@pytest.mark.asyncio
async def test_cv_verification_uses_powerful_model_when_fast_json_is_unreliable(monkeypatch) -> None:
    from src.agents.cv_adapter.main_agent import settings

    monkeypatch.setattr(settings, "llm_model_fast", "fast-model")
    monkeypatch.setattr(settings, "llm_model_powerful", "powerful-model")
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"

    async def provider_completion(**request):
        if request["model"] == "fast-model":
            raise JsonValidationError()
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"valid": true, "issues": [], "sanitized_cv": null}',
        ))])

    agent.groq_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=provider_completion,
    )))
    result = await agent._fact_check("Camille, Excel débutant.", {"skills": ["Excel débutant"]})
    assert result == {"valid": True, "issues": []}


@pytest.mark.asyncio
async def test_factual_extraction_survives_fast_model_json_failure(monkeypatch) -> None:
    from src.agents.cv_adapter.main_agent import settings

    monkeypatch.setattr(settings, "llm_model_fast", "fast-model")
    monkeypatch.setattr(settings, "llm_model_powerful", "powerful-model")
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"

    async def provider_completion(**request):
        if request["model"] == "fast-model":
            raise JsonValidationError()
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"education": [{"degree": "Bachelor", "year": "2022-2026"}], "skills": {}}',
        ))])

    agent.groq_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=provider_completion,
    )))
    result = await agent._extract_factual_data("FORMATION\nBachelor 2022-2026", "fr")
    assert result["success"] is True
    assert result["education"] == [{"degree": "Bachelor", "year": "2022-2026"}]


@pytest.mark.asyncio
async def test_letter_verification_uses_original_text_not_adapted_claims() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    source = "Camille. Lyon. Alternance à partir de septembre."
    requests = []

    async def completion(**kwargs):
        requests.append(kwargs["messages"][-1]["content"])
        if len(requests) == 1:
            return {"paragraph_1": "Mon parcours est présenté dans mon CV."}
        candidate_context = requests[-1].split("CANDIDATE SOURCE DATA:")[1].split("JOB DESCRIPTION")[0]
        if source in candidate_context and "CDI immédiat Paris" not in candidate_context:
            return {"valid": True, "issues": []}
        return {"valid": False, "issues": [{"type": "wrong_source"}]}

    agent._create_json_completion = completion
    result = await agent.generate_cover_letter(
        {"personal_info": {"name": "Camille"}, "summary": "CDI immédiat Paris"},
        "Offre fictive", source_cv_text=source,
    )
    assert result["success"] is True
    assert result["paragraph_1"] == "Mon parcours est présenté dans mon CV."
    assert source in requests[0]
    assert "CDI immédiat Paris" not in requests[0]


@pytest.mark.asyncio
@pytest.mark.parametrize("fallback_valid", [False, True])
async def test_fallback_letter_requires_its_own_factual_verification(fallback_valid: bool) -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    rejection = {"valid": False, "issues": [{"type": "unsupported_claim"}]}
    agent._create_json_completion = AsyncMock(side_effect=[
        {"paragraph_1": "Disponible immédiatement."}, rejection,
        {"paragraph_1": "Disponible immédiatement."}, rejection,
        {"valid": True, "issues": []} if fallback_valid else rejection,
    ])
    result = await agent.generate_cover_letter(
        {"personal_info": {"name": "Camille"}, "summary": "Disponible immédiatement."},
        "Offre fictive de développeur",
    )
    assert result["success"] is fallback_valid
    assert result["fact_check"]["valid"] is fallback_valid
    if not fallback_valid:
        assert "paragraph_1" not in result


def test_unchecked_fallback_is_not_marked_as_verified() -> None:
    result = CVAdapterAgent._build_source_only_cover_letter(
        {"summary": "Résumé déjà adapté, non vérifié."},
        language="fr", company_name="Exemple", date_str="2026-09-07",
    )
    assert result["fact_check"]["valid"] is False
    assert result["success"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("extraction_success", [True, False])
async def test_fallback_uses_original_facts_instead_of_rejected_adapted_summary(extraction_success: bool) -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    source = "Camille, Lyon. Excel débutant. Classement de dossiers."
    agent._extract_factual_data = create_autospec(agent._extract_factual_data, return_value={
        "success": extraction_success, "personal_info": {"name": "Camille"},
        "experiences": [{"title": "Assistante", "company": "Exemple", "bullets": ["Classement de dossiers."]}],
    })
    agent._create_json_completion = AsyncMock(side_effect=[
        {"paragraph_1": "Brouillon refusé"}, {"paragraph_1": "Brouillon refusé"},
        {"subject": "Candidature", "salutation": "Madame, Monsieur,",
         "paragraph_1": "Ma candidature", "paragraph_2": "Classement de dossiers.",
         "paragraph_3": "Je reste disponible pour un entretien.",
         "closing": "Cordialement,", "signature": "Camille"},
    ])
    checked = []

    async def check(candidate, job, letter):
        checked.append(letter)
        return {"valid": len(checked) == 3, "issues": [] if len(checked) == 3 else [{"type": "unsupported"}]}

    agent._fact_check_cover_letter = check
    result = await agent.generate_cover_letter(
        {"personal_info": {"name": "Camille"}, "summary": "Experte Excel disponible immédiatement."},
        "Offre fictive", source_cv_text=source,
    )
    agent._extract_factual_data.assert_awaited_once_with(source, "fr")
    if not extraction_success:
        assert result["success"] is False
        assert "paragraph_1" not in result
        assert len(checked) == 2
        return
    assert result["success"] is True
    assert "Experte Excel" not in json.dumps(checked[-1])
    assert "Classement de dossiers" in json.dumps(checked[-1])


@pytest.mark.asyncio
@pytest.mark.parametrize("empty_translation", [False, True])
async def test_original_source_fallback_is_translated_before_final_fact_check(empty_translation: bool) -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._extract_factual_data = create_autospec(agent._extract_factual_data, return_value={
        "success": True, "personal_info": {"name": "Camille"},
        "experiences": [{"title": "Assistante", "company": "Exemple", "bullets": ["Classement de dossiers."]}],
    })
    translated = {} if empty_translation else {
        "subject": "Application", "salutation": "Dear Hiring Manager,",
        "paragraph_1": "I am applying for the advertised position.",
        "paragraph_2": "My experience at Exemple includes filing documents.",
        "paragraph_3": "I look forward to discussing the role.",
        "closing": "Kind regards,", "signature": "Camille",
    }
    agent._create_json_completion = AsyncMock(side_effect=[
        {"paragraph_1": "Invented draft"}, {"paragraph_1": "Invented draft"}, translated,
    ])
    agent._fact_check_cover_letter = AsyncMock(side_effect=[
        {"valid": False, "issues": [{"type": "unsupported"}]},
        {"valid": False, "issues": [{"type": "unsupported"}]},
        {"valid": True, "issues": []},
    ])
    result = await agent.generate_cover_letter(
        {"personal_info": {"name": "Camille"}}, "Offre fictive",
        language="en", source_cv_text="Camille. Exemple. Classement de dossiers.",
    )
    assert agent._create_json_completion.await_count == 3
    if empty_translation:
        assert result["success"] is False
        assert "paragraph_1" not in result
        return
    assert result["paragraph_2"] == translated["paragraph_2"]
    assert agent._fact_check_cover_letter.await_args.args[2]["paragraph_2"] == translated["paragraph_2"]


@pytest.mark.asyncio
async def test_skill_categorization_preserves_source_levels_and_rejects_additions() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(return_value={
        "Outils": ["Excel", "SAP"],
        "Langues": ["Français courant", "Français courant"],
    })
    result = await agent._categorize_skills_dynamically(
        ["Excel débutant", "Français courant"], "Manutentionnaire", "Logistique", []
    )
    skills = [skill for values in result.values() for skill in values]
    assert sorted(skills) == ["Excel débutant", "Français courant"]


@pytest.mark.asyncio
async def test_skill_categorization_keeps_valid_grouping_and_original_spelling() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(return_value={"Outils": ["excel débutant"]})
    result = await agent._categorize_skills_dynamically(
        ["Excel débutant"], "Manutentionnaire", "Logistique", []
    )
    assert result == {"Outils": ["Excel débutant"]}


@pytest.mark.asyncio
async def test_skill_categorization_failure_keeps_all_source_skills_once() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(side_effect=RuntimeError("provider unavailable"))
    source = [f"Compétence {number}" for number in range(16)] + ["Français", "Français"]
    result = await agent._categorize_skills_dynamically(source, "Logistique", "", [])
    skills = [skill for values in result.values() for skill in values]
    assert len(skills) == 17
    assert set(skills) == set(source)


@pytest.mark.parametrize("language", ["fr", "en"])
def test_source_only_letter_does_not_attribute_two_jobs_to_one_employer(language: str) -> None:
    result = CVAdapterAgent._build_source_only_cover_letter(
        {"experiences": [
            {"company": "Source A", "bullets": ["Réception des colis."]},
            {"company": "Source B", "bullets": ["Mise en rayon."]},
        ]}, language=language, company_name="Cible", date_str="2026-09-06"
    )
    assert "Réception des colis." in result["paragraph_2"]
    assert "Mise en rayon." in result["paragraph_2"]
    assert "Source A" not in result["paragraph_2"]


@pytest.mark.asyncio
async def test_extraction_restores_explicit_source_skill_levels_and_deduplicates() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(return_value={
        "personal_info": {"name": "Alex"},
        "skills": {"technical": ["Excel", "Python"], "tools": ["Excel"]},
    })
    result = await agent._extract_factual_data(
        "Alex\nCompétences\nExcel : débutant. Python : intermédiaire.", "fr"
    )
    skills = [skill for values in result["skills"].values() for skill in values]
    assert skills == ["Excel débutant", "Python intermédiaire"]


@pytest.mark.asyncio
async def test_extraction_does_not_guess_skill_levels_when_not_in_source() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(return_value={
        "personal_info": {"name": "Alex"}, "skills": {"tools": ["Excel"]},
    })
    result = await agent._extract_factual_data("Alex\nCompétences : Excel.", "fr")
    assert result["skills"] == {"tools": ["Excel"]}


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["Skills\nExcel\nAdvanced English", "Skills\nExcel Advanced English"])
async def test_extraction_does_not_attach_another_skill_level(source: str) -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(return_value={
        "personal_info": {"name": "Alex"}, "skills": {"tools": ["Excel"]},
    })
    result = await agent._extract_factual_data(source, "en")
    assert result["skills"] == {"tools": ["Excel"]}


@pytest.mark.asyncio
async def test_extraction_prompt_keeps_project_items_in_their_source_section() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    captured: list[str] = []

    async def completion(**kwargs: object) -> dict[str, object]:
        captured.append(str(kwargs["messages"][1]["content"]))  # type: ignore[index]
        return {"personal_info": {"name": "Alex"}, "projects": []}

    agent._create_json_completion = completion  # type: ignore[method-assign]

    await agent._extract_factual_data(
        "PROJETS\nProduit Acme · acme.example · https://acme.example", "fr"
    )

    prompt = captured[0].casefold()
    assert "preserve each item under the cv section where it appears" in prompt
    assert "url, domain, or product mentioned in a projects section is project data" in prompt
    assert "never an employer or work experience" in prompt
    assert "only classify an item as work experience when the cv explicitly presents it" in prompt
    assert "job title and both a start date and an end date" in prompt


@pytest.mark.asyncio
async def test_extraction_prompt_requires_contiguous_literal_values() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    captured: list[str] = []

    async def completion(**kwargs: object) -> dict[str, object]:
        captured.append(str(kwargs["messages"][1]["content"]))  # type: ignore[index]
        return {"personal_info": {"name": "Alex"}, "projects": []}

    agent._create_json_completion = completion  # type: ignore[method-assign]

    await agent._extract_factual_data("Alex", "fr")

    prompt = captured[0].casefold()
    assert "every non-empty string value in the json" in prompt
    assert "one contiguous literal quotation from the cv content" in prompt
    assert "normalizing only unicode representation and whitespace" in prompt
    assert "never summarize, paraphrase, rewrite, or concatenate separate source fragments" in prompt
    assert "use an empty string for a scalar field or an empty list for a list field" in prompt
    assert "technologies must always be a json list of strings" in prompt
    assert '"technologies": ["exact contiguous technology text from cv"]' in prompt
    assert "never combine non-contiguous technology fragments" in prompt


@pytest.mark.parametrize("language", ["fr", "en"])
def test_source_only_letter_does_not_use_candidate_title_as_target_job(language) -> None:
    letter = CVAdapterAgent._build_source_only_cover_letter(
        {"personal_info": {"title": "Tech Lead Fullstack"}},
        language=language, company_name="Exemple", date_str="6 septembre 2026",
    )
    assert "Tech Lead Fullstack" not in letter["paragraph_1"]
    assert "Tech Lead Fullstack" not in letter["subject"]
    expected = "poste proposé" if language == "fr" else "advertised position"
    assert expected in letter["paragraph_1"]
    assert expected in letter["subject"]


@pytest.mark.asyncio
async def test_french_fallback_letter_date_does_not_depend_on_system_locale(monkeypatch, request) -> None:
    import locale
    original_setlocale = locale.setlocale
    previous_locale = locale.setlocale(locale.LC_TIME)
    request.addfinalizer(lambda: original_setlocale(locale.LC_TIME, previous_locale))
    locale.setlocale(locale.LC_TIME, "C")
    def unavailable_locale(*args):
        raise locale.Error("French locale unavailable")
    monkeypatch.setattr(locale, "setlocale", unavailable_locale)
    class FixedDate(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 6)
    monkeypatch.setattr("datetime.datetime", FixedDate)
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    agent._create_json_completion = AsyncMock(side_effect=[
        {}, {"valid": False, "issues": [{}]}, {}, {"valid": False, "issues": [{}]},
        {"valid": True, "issues": []},
    ])
    letter = await agent.generate_cover_letter(
        {"personal_info": {"name": "Alex"}}, "Offre fictive", language="fr"
    )
    assert letter["date"] == "6 septembre 2026"


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
            {"valid": True, "issues": []},
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": sanitized_cv,
            },
            {"valid": True, "issues": []},
        ]
    )

    result = await agent.run("CV source", "Offre data", language="fr")

    assert agent._fact_check.await_count == 3
    assert agent._fact_check.await_args_list[0].kwargs == {"require_complete": True}
    assert agent._fact_check.await_args_list[2].args == ("CV source", sanitized_cv)
    assert result["success"] is True
    assert result["cv_data"] == {**sanitized_cv, "huntzen_certified": True}
    assert result["fact_check"] == {"valid": True, "issues": []}


@pytest.mark.asyncio
async def test_adaptation_rechecks_new_preserving_correction_after_final_rejection() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    original_data = {**_complete_cv_reference(), "success": True}
    first_correction = {**_complete_cv_reference(), "summary": "Résumé encore refusé."}
    second_correction = {**_complete_cv_reference(), "summary": "Résumé factuel."}

    agent._extract_factual_data = AsyncMock(return_value=original_data)
    agent._analyze_job = AsyncMock(return_value={"success": True, "required_skills": []})
    agent._map_cv_to_job = AsyncMock(
        return_value={"success": True, "skills_coverage": {}, "overall_fit_score": 75}
    )
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(return_value={"summary": "Brouillon inventé."})
    agent._fact_check = AsyncMock(
        side_effect=[
            {"valid": True, "issues": []},
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": first_correction,
            },
            {
                "valid": False,
                "issues": [{"type": "unsupported_summary", "severity": "high"}],
                "sanitized_cv": second_correction,
            },
            {"valid": True, "issues": []},
        ]
    )

    result = await agent.run("CV source", "Offre data", language="en")

    assert agent._fact_check.await_count == 4
    assert agent._fact_check.await_args_list[2].args == ("CV source", first_correction)
    assert agent._fact_check.await_args_list[3].args == ("CV source", second_correction)
    assert result["success"] is True
    assert result["cv_data"] == {**second_correction, "huntzen_certified": True}
    assert result["fact_check"] == {"valid": True, "issues": []}


@pytest.mark.asyncio
async def test_adaptation_validates_source_fallback_when_next_correction_loses_facts() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    original_data = {**_complete_cv_reference(), "success": True}
    first_correction = {**_complete_cv_reference(), "summary": "Résumé encore refusé."}
    incomplete_correction = _complete_cv_reference()
    incomplete_correction["skills"] = {"technical": ["Python"]}
    source_only = {key: value for key, value in original_data.items() if key != "success"}

    agent._extract_factual_data = AsyncMock(return_value=original_data)
    agent._analyze_job = AsyncMock(return_value={"success": True, "required_skills": []})
    agent._map_cv_to_job = AsyncMock(
        return_value={"success": True, "skills_coverage": {}, "overall_fit_score": 75}
    )
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(return_value={"summary": "Brouillon inventé."})
    agent._fact_check = AsyncMock(
        side_effect=[
            {"valid": True, "issues": []},
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": first_correction,
            },
            {
                "valid": False,
                "issues": [{"type": "missing_skill", "severity": "high"}],
                "sanitized_cv": incomplete_correction,
            },
            {"valid": True, "issues": []},
        ]
    )

    result = await agent.run("CV source", "Offre data", language="en")

    assert agent._fact_check.await_count == 4
    assert agent._fact_check.await_args_list[3].args == ("CV source", source_only)
    assert result["success"] is True
    assert result["cv_data"] == {**source_only, "huntzen_certified": True}
    assert result["fact_check"] == {
        "valid": True,
        "issues": [],
        "mode": "source_only_fallback",
    }


@pytest.mark.asyncio
async def test_adaptation_fails_closed_when_source_fallback_is_rejected() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    original_data = {**_complete_cv_reference(), "success": True}
    invalid_correction = _complete_cv_reference()
    invalid_correction["skills"] = {"technical": ["Python"]}
    source_rejection = {
        "valid": False,
        "issues": [{"type": "source_rejected", "severity": "high"}],
    }

    agent._extract_factual_data = AsyncMock(return_value=original_data)
    agent._analyze_job = AsyncMock(return_value={"success": True, "required_skills": []})
    agent._map_cv_to_job = AsyncMock(
        return_value={"success": True, "skills_coverage": {}, "overall_fit_score": 75}
    )
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(return_value={"summary": "Brouillon inventé."})
    agent._fact_check = AsyncMock(
        side_effect=[
            {"valid": True, "issues": []},
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": invalid_correction,
            },
            source_rejection,
        ]
    )

    result = await agent.run("CV source", "Offre data", language="en")

    assert agent._fact_check.await_count == 3
    assert result["success"] is False
    assert result["fact_check"] == source_rejection
    assert "cv_data" not in result


@pytest.mark.asyncio
async def test_adaptation_fails_closed_after_two_invalid_post_rejection_controls() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    original_data = {**_complete_cv_reference(), "success": True}
    first_correction = {**_complete_cv_reference(), "summary": "Première correction."}
    second_correction = {**_complete_cv_reference(), "summary": "Deuxième correction."}
    final_rejection = {
        "valid": False,
        "issues": [{"type": "unsupported_summary", "severity": "high"}],
        "sanitized_cv": _complete_cv_reference(),
    }

    agent._extract_factual_data = AsyncMock(return_value=original_data)
    agent._analyze_job = AsyncMock(return_value={"success": True, "required_skills": []})
    agent._map_cv_to_job = AsyncMock(
        return_value={"success": True, "skills_coverage": {}, "overall_fit_score": 75}
    )
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(return_value={"summary": "Brouillon inventé."})
    agent._fact_check = AsyncMock(
        side_effect=[
            {"valid": True, "issues": []},
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": first_correction,
            },
            {
                "valid": False,
                "issues": [{"type": "unsupported_summary", "severity": "high"}],
                "sanitized_cv": second_correction,
            },
            final_rejection,
        ]
    )

    result = await agent.run("CV source", "Offre data", language="en")

    assert agent._fact_check.await_count == 4
    assert agent._fact_check.await_args_list[3].args == ("CV source", second_correction)
    assert result["success"] is False
    assert result["fact_check"] == final_rejection
    assert "cv_data" not in result


@pytest.mark.asyncio
async def test_adaptation_uses_source_only_after_invalid_sanitization_and_reverification() -> None:
    agent = object.__new__(CVAdapterAgent)
    agent.name = "CVAdapter"
    original = {"success": True, "personal_info": {"name": "Alex"},
                "experiences": [{"company": "Source", "bullets": ["Réception."]}],
                "skills": {"tools": ["Excel débutant"]}}
    agent._extract_factual_data = AsyncMock(return_value=original)
    agent._analyze_job = AsyncMock(return_value={"success": True})
    agent._map_cv_to_job = AsyncMock(return_value={"success": True})
    agent._rewrite_bullets_only = AsyncMock(return_value={"success": True})
    agent._merge_cv_data = AsyncMock(return_value={"summary": "Maîtrise Excel"})
    agent._fact_check = AsyncMock(side_effect=[
        {"valid": True, "issues": []},
        {"valid": False, "issues": [{"type": "hallucination"}], "sanitized_cv": {}},
        {"valid": True, "issues": []},
    ])
    result = await agent.run("CV source", "Offre", language="fr")
    assert result["success"] is True
    assert result["cv_data"]["skills"] == {"Outils": ["Excel débutant"]}
    assert "summary" not in result["cv_data"]
    assert agent._fact_check.await_count == 3
    checked = agent._fact_check.await_args_list[2].args[1]
    assert checked["experiences"] == original["experiences"]
    assert result["fact_check"]["mode"] == "source_only_fallback"


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
        side_effect=[
            {"valid": True, "issues": []},
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": sanitized_cv,
            },
            {
                "valid": False,
                "issues": [{"type": "hallucination", "severity": "high"}],
                "sanitized_cv": sanitized_cv,
            },
        ]
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
async def test_cover_letter_uses_source_only_fallback_after_second_factual_rejection() -> None:
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
            {"valid": True, "issues": []},
        ]
    )

    result = await agent.generate_cover_letter(
        {
            "personal_info": {
                "name": "Camille Martin",
                "title": "Développeuse backend",
                "email": "camille@example.com",
                "city": "Lyon",
            },
            "summary": "Développeuse Python spécialisée dans les API.",
            "experiences": [
                {
                    "title": "Développeuse backend",
                    "company": "Source SA",
                    "bullets": ["Conception d'API FastAPI."],
                }
            ],
            "skills": {"Langages": ["Python"], "Frameworks": ["FastAPI"]},
        },
        "Offre Data Analyst",
        language="fr",
        company_name="Exemple",
    )

    assert agent._create_json_completion.await_count == 5
    assert result["success"] is True
    assert result["fact_check"] == {
        "valid": True,
        "issues": [],
        "mode": "source_only_fallback",
    }
    rendered = json.dumps(result, ensure_ascii=False)
    assert "Camille Martin" in rendered
    assert result["subject"] == "Candidature au poste proposé"
    assert "Développeuse Python spécialisée dans les API." in result["paragraph_1"]
    assert "Conception d'API FastAPI." in rendered
    assert "équipe paiement" not in rendered
    assert "piloté les paiements" not in rendered
