import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from src.agents.expat.main_agent import ExpadationAgent, _official_source_cache


@pytest.mark.asyncio
async def test_official_fallback_prioritizes_matching_project_type() -> None:
    """Une question travail Canada charge uniquement la source officielle adaptée."""
    agent = ExpadationAgent.__new__(ExpadationAgent)
    agent.name = "ExpadationAgent"
    _official_source_cache.clear()

    with patch(
        "src.agents.expat.main_agent.scrape_url",
        new=AsyncMock(
            return_value={
                "markdown": "# Travailler au Canada\nVérifiez votre admissibilité.",
                "scraped_at": "2026-09-08T00:00:00Z",
            }
        ),
    ) as scrape:
        chunks = await agent._retrieve_official_sources("CA", "travail")

    assert len(chunks) == 1
    assert chunks[0]["country"] == "CA"
    assert chunks[0]["visa_type"] == "permis-travail"
    assert "canada.ca" in chunks[0]["source_url"]
    scrape.assert_awaited_once()


@pytest.mark.asyncio
async def test_official_fallback_maps_work_to_us_employment_source() -> None:
    """Le synonyme travail sélectionne bien la page emploi américaine."""
    agent = ExpadationAgent.__new__(ExpadationAgent)
    agent.name = "ExpadationAgent"
    _official_source_cache.clear()

    with patch(
        "src.agents.expat.main_agent.scrape_url",
        new=AsyncMock(return_value={"markdown": "Employment visas", "scraped_at": ""}),
    ) as scrape:
        chunks = await agent._retrieve_official_sources("US", "travail")

    assert chunks[0]["visa_type"] == "emploi"
    assert "employment.html" in chunks[0]["source_url"]
    assert "employment.html" in scrape.await_args.args[0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("country", "project_type", "expected_visa_type"),
    [
        ("US", "étude", "etudiant"),
        ("FR", "étude", "etudiant"),
        ("DE", "famille", "regroupement-familial"),
    ],
)
async def test_official_fallback_maps_exact_intent_values(
    country: str,
    project_type: str,
    expected_visa_type: str,
) -> None:
    """Les valeurs exactes du parseur sélectionnent une source cohérente."""
    agent = ExpadationAgent.__new__(ExpadationAgent)
    agent.name = "ExpadationAgent"
    _official_source_cache.clear()

    with patch(
        "src.agents.expat.main_agent.scrape_url",
        new=AsyncMock(return_value={"markdown": "Source officielle", "scraped_at": ""}),
    ):
        chunks = await agent._retrieve_official_sources(country, project_type)

    assert chunks[0]["visa_type"] == expected_visa_type


@pytest.mark.asyncio
async def test_official_fallback_coalesces_concurrent_requests() -> None:
    """Deux demandes concurrentes ne téléchargent la même page qu'une fois."""
    agent = ExpadationAgent.__new__(ExpadationAgent)
    agent.name = "ExpadationAgent"
    _official_source_cache.clear()

    async def delayed_scrape(*args: object, **kwargs: object) -> dict[str, str]:
        await asyncio.sleep(0.02)
        return {"markdown": "Source officielle", "scraped_at": ""}

    with patch(
        "src.agents.expat.main_agent.scrape_url",
        new=AsyncMock(side_effect=delayed_scrape),
    ) as scrape:
        first, second = await asyncio.gather(
            agent._retrieve_official_sources("CA", "travail"),
            agent._retrieve_official_sources("CA", "travail"),
        )

    assert first == second
    assert scrape.await_count == 1


@pytest.mark.asyncio
async def test_official_fallback_skips_unreachable_source() -> None:
    """Une source en panne ne produit ni contenu inventé ni fausse citation."""
    agent = ExpadationAgent.__new__(ExpadationAgent)
    agent.name = "ExpadationAgent"
    _official_source_cache.clear()

    with patch(
        "src.agents.expat.main_agent.scrape_url",
        new=AsyncMock(side_effect=RuntimeError("indisponible")),
    ):
        chunks = await agent._retrieve_official_sources("CA", "travail")

    assert chunks == []


@pytest.mark.asyncio
async def test_official_fallback_skips_empty_scrape_result() -> None:
    """Le résultat vide réel du scraper ne devient jamais une citation."""
    agent = ExpadationAgent.__new__(ExpadationAgent)
    agent.name = "ExpadationAgent"
    _official_source_cache.clear()

    with patch(
        "src.agents.expat.main_agent.scrape_url",
        new=AsyncMock(return_value={"markdown": "", "scraped_at": ""}),
    ):
        chunks = await agent._retrieve_official_sources("CA", "travail")

    assert chunks == []
