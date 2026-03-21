"""
Tests for Job Fair / Events Scrapers
======================================
Tests for Studyrama, CIDJ, and L'Etudiant event providers.
Validates that each scraper correctly extracts events with proper structure.
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from src.services.events.provider import (
    classify_event_type,
    classify_public,
    classify_sector,
    detect_region,
    parse_french_date,
    scrape_cidj_events,
    scrape_studyrama_salons,
    search_job_fairs,
)

# ═══════════════════════════════════════════════════════════════════════════════
# Unit Tests: Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════


class TestParseFrenchDate:
    """Test French date parsing utility."""

    def test_full_month(self):
        assert parse_french_date("28 février 2026") == "2026-02-28"

    def test_abbreviated_month(self):
        assert parse_french_date("7 mars 2026") == "2026-03-07"

    def test_samedi_prefix(self):
        assert parse_french_date("Samedi 20 juin 2026") == "2026-06-20"

    def test_dd_mm_yyyy_slash(self):
        assert parse_french_date("19/02/2026") == "2026-02-19"

    def test_empty_string_returns_today(self):
        result = parse_french_date("")
        assert result == datetime.now().strftime("%Y-%m-%d")


class TestClassifyEventType:
    def test_forum(self):
        assert classify_event_type("Forum des métiers") == "forum"

    def test_job_dating(self):
        assert classify_event_type("Job Dating recrutement") == "job_dating"

    def test_webinar(self):
        assert classify_event_type("Webinar alternance") == "webinar"

    def test_default_salon(self):
        assert classify_event_type("Salon de l'Etudiant") == "salon"


class TestClassifySector:
    def test_tech(self):
        assert classify_sector("Forum du numérique et cyber") == "tech"

    def test_health(self):
        assert classify_sector("Salon de la santé") == "health"

    def test_default_all(self):
        assert classify_sector("Salon de l'orientation") == "all"


class TestClassifyPublic:
    def test_students(self):
        assert classify_public("Salon alternance étudiants") == "students"

    def test_seniors(self):
        assert classify_public("Forum reconversion +50 ans") == "seniors"

    def test_default_all(self):
        assert classify_public("Salon de l'emploi") == "all"


class TestDetectRegion:
    def test_paris(self):
        assert detect_region("Paris") == "Île-de-France"

    def test_lyon(self):
        assert detect_region("Lyon") == "Auvergne-Rhône-Alpes"

    def test_unknown(self):
        assert detect_region("Tombouctou") == "France"


# ═══════════════════════════════════════════════════════════════════════════════
# Unit Tests: Normalization
# ═══════════════════════════════════════════════════════════════════════════════


class TestStudyramaNormalization:
    """Test Studyrama salon data normalization using mock HTML."""

    MOCK_HTML = """
    <html><body>
    <a class="salon physique" href="/salons/salon-test-bordeaux-123">
        <div class="block-salon">
            <div class="city">Bordeaux</div>
            <div class="label"><h3>Forum du Numérique de Bordeaux</h3></div>
            <div class="date">Samedi 7 mars 2026</div>
        </div>
    </a>
    <a class="salon physique" href="/salons/salon-paris-456">
        <div class="block-salon">
            <div class="city">Paris</div>
            <div class="label"><h3>Salon Sup'Alternance Paris</h3></div>
            <div class="date">Samedi 20 juin 2026</div>
        </div>
    </a>
    </body></html>
    """

    @pytest.mark.asyncio
    async def test_studyrama_parsing(self):
        """Test that Studyrama HTML is correctly parsed."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.text = self.MOCK_HTML

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.events.provider.httpx.AsyncClient", return_value=mock_client):
            events = await scrape_studyrama_salons()

        assert len(events) == 2

        # First event
        assert events[0].title == "Forum du Numérique de Bordeaux"
        assert events[0].city == "Bordeaux"
        assert events[0].date_start == "2026-03-07"
        assert events[0].url == "https://www.studyrama.com/salons/salon-test-bordeaux-123"
        assert events[0].source == "studyrama"
        assert events[0].organizer == "Studyrama"
        assert events[0].sector == "tech"  # "numérique" → tech

        # Second event
        assert events[1].city == "Paris"
        assert events[1].date_start == "2026-06-20"


class TestCIDJNormalization:
    """Test CIDJ event data normalization using mock HTML."""

    MOCK_HTML = """
    <html><body>
    <div class="views-row item-post-card">
        <div class="content-item-post-card">
            <div class="detail-item-post-card">
                <p class="title-post-card">
                    <a href="https://www.cidj.com/agendas/paris-emploi-jeunes">Paris pour l'emploi des jeunes</a>
                </p>
                <span class="adress-item-post-card">Montreuil (93)</span>
                <p class="date-range-post-card">Du19/02/2026Au19/02/2026</p>
            </div>
        </div>
    </div>
    <div class="views-row item-post-card">
        <div class="content-item-post-card">
            <div class="detail-item-post-card">
                <p class="title-post-card">
                    <a href="/agendas/atelier-orientation">Atelier d'orientation CIDJ</a>
                </p>
                <span class="adress-item-post-card">Paris (75)</span>
                <p class="date-range-post-card">Du23/02/2026Au23/02/2026</p>
            </div>
        </div>
    </div>
    </body></html>
    """

    @pytest.mark.asyncio
    async def test_cidj_parsing(self):
        """Test that CIDJ HTML is correctly parsed."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.text = self.MOCK_HTML

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.events.provider.httpx.AsyncClient", return_value=mock_client):
            events = await scrape_cidj_events()

        assert len(events) == 2

        # First event
        assert events[0].title == "Paris pour l'emploi des jeunes"
        assert events[0].city == "Montreuil"
        assert events[0].date_start == "2026-02-19"
        assert events[0].date_end == "2026-02-19"
        assert events[0].url == "https://www.cidj.com/agendas/paris-emploi-jeunes"
        assert events[0].source == "cidj"

        # Second event: relative URL should be made absolute
        assert events[1].city == "Paris"
        assert events[1].url == "https://www.cidj.com/agendas/atelier-orientation"


# ═══════════════════════════════════════════════════════════════════════════════
# Integration Test: Deduplication
# ═══════════════════════════════════════════════════════════════════════════════


class TestDeduplication:
    """Test that the aggregator deduplicates events across sources."""

    @pytest.mark.asyncio
    async def test_no_duplicates_same_title_and_city(self):
        """Events with same title + city from different sources should be deduplicated."""
        result = await search_job_fairs()
        events = result.get("events", [])

        # Check no two events have the same (title_lower, city_lower)
        seen = set()
        for e in events:
            key = (e["title"].lower().strip(), e["city"].lower().strip())
            assert key not in seen, f"Duplicate found: {key}"
            seen.add(key)

    @pytest.mark.asyncio
    async def test_only_future_events(self):
        """All returned events should have date_start >= today."""
        result = await search_job_fairs()
        today = datetime.now().strftime("%Y-%m-%d")
        for e in result.get("events", []):
            assert e["date_start"] >= today, f"Past event found: {e['title']} ({e['date_start']})"


# ═══════════════════════════════════════════════════════════════════════════════
# Live Integration Test (only if network available)
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_live_search_all_sources():
    """
    Live test: verify that the full pipeline returns real events.
    This test hits real websites and may fail if they change their HTML structure.
    """
    result = await search_job_fairs()

    assert result["success"] is True
    assert result["count"] > 0, "Expected at least 1 event from live sources"
    assert len(result["events"]) == result["count"]

    # Verify event structure
    for event in result["events"]:
        assert "title" in event and len(event["title"]) > 3
        assert "city" in event
        assert "date_start" in event
        assert "source" in event
        assert "url" in event and event["url"].startswith("http")
        assert event["source"] in ["letudiant", "studyrama", "cidj", "france_travail", "apec", "cci"]
