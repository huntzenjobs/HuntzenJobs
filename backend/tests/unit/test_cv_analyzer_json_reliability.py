"""Tests unitaires de fiabilité JSON du CV Analyzer."""

from unittest.mock import AsyncMock

import pytest

from src.agents.cv_analyzer.main_agent import CVAnalyzerAgent


@pytest.mark.asyncio
async def test_score_ats_retries_once_after_malformed_response() -> None:
    """Une réponse reçue mais malformée déclenche un unique nouvel essai strict."""
    analyzer = object.__new__(CVAnalyzerAgent)
    analyzer.name = "CVAnalyzer"
    analyzer.ats_scorer = AsyncMock()
    analyzer.ats_scorer.run.side_effect = [
        '{"total": 82, "format_score": 18',
        '{"total": 82, "format_score": 18}',
    ]

    result = await analyzer._score_ats("Expérience et compétences", language="fr")

    assert result == {"total": 82, "format_score": 18}
    assert analyzer.ats_scorer.run.await_count == 2
    retry_task = analyzer.ats_scorer.run.await_args_list[1].kwargs["task"]
    assert "uniquement avec l'objet JSON valide" in retry_task


@pytest.mark.asyncio
async def test_score_ats_does_not_retry_provider_failure() -> None:
    """Une panne fournisseur remonte sans nouvel appel applicatif."""
    analyzer = object.__new__(CVAnalyzerAgent)
    analyzer.name = "CVAnalyzer"
    analyzer.ats_scorer = AsyncMock()
    analyzer.ats_scorer.run.side_effect = RuntimeError("provider unavailable")

    with pytest.raises(RuntimeError, match="provider unavailable"):
        await analyzer._score_ats("Expérience et compétences", language="fr")

    assert analyzer.ats_scorer.run.await_count == 1


@pytest.mark.asyncio
async def test_score_ats_retries_after_valid_json_with_wrong_type() -> None:
    """Une liste JSON ne satisfait pas le contrat objet du score ATS."""
    analyzer = object.__new__(CVAnalyzerAgent)
    analyzer.name = "CVAnalyzer"
    analyzer.ats_scorer = AsyncMock()
    analyzer.ats_scorer.run.side_effect = [
        '[{"total": 82}]',
        '{"total": 82}',
    ]

    result = await analyzer._score_ats("Expérience et compétences", language="fr")

    assert result == {"total": 82}
    assert analyzer.ats_scorer.run.await_count == 2


@pytest.mark.asyncio
async def test_score_ats_stops_after_two_invalid_responses() -> None:
    """Deux réponses invalides terminent en résultat vide sans boucle de retry."""
    analyzer = object.__new__(CVAnalyzerAgent)
    analyzer.name = "CVAnalyzer"
    analyzer.ats_scorer = AsyncMock()
    analyzer.ats_scorer.run.side_effect = ["not json", "[]"]

    result = await analyzer._score_ats("Expérience et compétences", language="fr")

    assert result == {}
    assert analyzer.ats_scorer.run.await_count == 2
