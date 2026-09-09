from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.base import SubAgentTransientError
from src.agents.cv_analyzer.main_agent import CVAnalyzerAgent, _looks_like_cv_text


def test_short_structured_cv_matches_the_text_upload_contract() -> None:
    cv_text = (
        "Camille Martin\nExpérience : développeuse React.\n"
        "Formation : licence informatique.\nCompétences : TypeScript, tests et Git.\n"
        "Projet recherché : développeuse frontend junior."
    )

    assert 100 <= len(cv_text) < 500
    assert _looks_like_cv_text(cv_text) is True


def test_short_unstructured_text_is_not_recognized_as_a_cv() -> None:
    assert _looks_like_cv_text("texte sans rubrique professionnelle " * 5) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("has_image", [False, True])
async def test_native_pdf_preserves_company_and_dates_on_the_same_row(has_image: bool) -> None:
    import io
    import re

    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=595, height=842)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
    })
    stream = DecodedStreamObject()
    stream.set_data(
        b"BT /F1 10 Tf 30 750 Td (Developer - Company A) Tj ET\n"
        b"BT /F1 10 Tf 420 750 Td (10/2025 - 06/2026) Tj ET\n"
        b"BT /F1 10 Tf 30 725 Td (Developed Python APIs and maintained automated tests.) Tj ET\n"
        b"BT /F1 10 Tf 30 650 Td (Developer - Company B) Tj ET\n"
        b"BT /F1 10 Tf 420 650 Td (11/2023 - 11/2024) Tj ET\n"
        b"BT /F1 10 Tf 30 625 Td (Built web interfaces and documented product features.) Tj ET\n"
    )
    page[NameObject("/Contents")] = writer._add_object(stream)
    if has_image:
        from pypdf.generic import NumberObject

        image = DecodedStreamObject()
        image.set_data(b"\xff\xff\xff")
        image.update({NameObject("/Type"): NameObject("/XObject"),
                      NameObject("/Subtype"): NameObject("/Image"),
                      NameObject("/Width"): NumberObject(1),
                      NameObject("/Height"): NumberObject(1),
                      NameObject("/ColorSpace"): NameObject("/DeviceRGB"),
                      NameObject("/BitsPerComponent"): NumberObject(8)})
        page["/Resources"][NameObject("/XObject")] = DictionaryObject({
            NameObject("/Im1"): writer._add_object(image),
        })
        stream.set_data(stream.get_data() + b"\nq 100 0 0 100 30 400 cm /Im1 Do Q")
    buffer = io.BytesIO()
    writer.write(buffer)
    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    # Dépendance externe simulant le déplacement observé dans la lecture Docling.
    converted_paths = []

    def convert(path):
        converted_paths.append(path)
        return SimpleNamespace(
        document=SimpleNamespace(export_to_markdown=lambda:
            "Company A\nCompany B\n10/2025 - 06/2026\n11/2023 - 11/2024\n" * 3))

    agent._docling_converter = SimpleNamespace(convert=convert)
    result = await agent.extract_text_from_pdf(buffer.getvalue())
    if has_image:
        # Même avec beaucoup de texte natif, une image peut contenir une expérience.
        assert len(converted_paths) == 1
    else:
        assert converted_paths == []
        assert re.search(r"Company A[^\n]*10/2025[^\n]*06/2026", result)
        assert re.search(r"Company B[^\n]*11/2023[^\n]*11/2024", result)


def test_docling_configuration_can_initialize_the_pdf_backend() -> None:
    from docling.datamodel.base_models import InputFormat
    from docling.document_converter import PdfFormatOption

    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent._docling_converter = None
    converter = agent.docling_converter
    assert isinstance(converter.format_to_options[InputFormat.PDF], PdfFormatOption)
    options = converter.format_to_options[InputFormat.PDF].pipeline_options
    assert options.do_ocr is True
    assert options.ocr_options.lang == ["fra", "eng"]
    assert options.ocr_options.force_full_page_ocr is False


@pytest.mark.asyncio
async def test_successful_pdf_extraction_removes_private_temporary_file(tmp_path, monkeypatch) -> None:
    from src.agents.cv_analyzer import main_agent

    original = main_agent.tempfile.NamedTemporaryFile
    monkeypatch.setattr(main_agent.tempfile, "NamedTemporaryFile",
                        lambda **kwargs: original(dir=tmp_path, **kwargs))
    text = "Expérience et formation en logistique. " * 10
    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent._docling_converter = SimpleNamespace(convert=lambda path: SimpleNamespace(
        document=SimpleNamespace(export_to_markdown=lambda: text)))
    assert await agent.extract_text_from_pdf(b"synthetic fixture") == text
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_failed_pdf_extraction_removes_private_temporary_file(tmp_path, monkeypatch) -> None:
    from src.agents.cv_analyzer import main_agent

    original = main_agent.tempfile.NamedTemporaryFile
    monkeypatch.setattr(main_agent.tempfile, "NamedTemporaryFile",
                        lambda **kwargs: original(dir=tmp_path, **kwargs))

    def fail_conversion(path):
        raise ValueError("Synthetic conversion failure")

    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent._docling_converter = SimpleNamespace(convert=fail_conversion)
    with pytest.raises(RuntimeError):
        await agent.extract_text_from_pdf(b"invalid synthetic PDF")
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("score", [
    {}, {"total": "80"}, {"total": float("nan")}, {"total": -1},
    {"total": True}, {"total": float("inf")}, {"total": 101},
])
async def test_invalid_ats_result_is_not_reported_as_success(score, monkeypatch) -> None:
    from src.agents.cv_analyzer import main_agent

    redis = SimpleNamespace(get=AsyncMock(return_value=None), setex=AsyncMock())
    monkeypatch.setattr(main_agent, "get_redis", AsyncMock(return_value=redis))
    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent._score_ats = AsyncMock(return_value=score)
    agent._extract_skills = AsyncMock(return_value={"technical_skills": ["Excel"]})
    agent._extract_info = AsyncMock(return_value={"full_name": "Alex"})
    agent._get_improvements = AsyncMock(return_value={})
    result = await agent.run("Expérience en manutention. Formation logistique. " * 15)
    assert result["success"] is False
    assert result.get("ats_score") is None
    redis.setex.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("score", [0, 80, 100])
async def test_valid_ats_score_is_preserved_without_invented_job_advice(score, monkeypatch) -> None:
    from src.agents.cv_analyzer import main_agent

    monkeypatch.setattr(main_agent, "get_redis", AsyncMock(return_value=None))
    agent = object.__new__(CVAnalyzerAgent)
    agent.name = "CVAnalyzer"
    agent._score_ats = AsyncMock(return_value={"total": score})
    agent._extract_skills = AsyncMock(return_value={"technical_skills": ["Excel"]})
    agent._extract_info = AsyncMock(return_value={"full_name": "Alex"})
    agent._get_improvements = AsyncMock(return_value={"content_improvements": ["Précisez votre rôle."]})
    agent._match_job = AsyncMock(return_value={"match_score": 60})
    result = await agent.run("Expérience en manutention. Formation logistique. " * 15,
                             job_description="Offre de manutentionnaire, rangement de colis.")
    assert result["success"] is True
    assert result["ats_score"] == score
    assert result["improvements"]["content_improvements"] == ["Précisez votre rôle."]


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
