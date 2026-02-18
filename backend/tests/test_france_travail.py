"""
Tests for France Travail Job Provider
======================================
Unit tests for the FranceTravailProvider class.

Tests cover:
1. Normalization of job data
2. Country filtering (France-only)  
3. Contract type mapping
4. Salary formatting
5. Integration test (live API — skipped without credentials)
"""

import pytest
from src.services.job_providers.france_travail import FranceTravailProvider


# ============================================================================
#  Fixture
# ============================================================================

@pytest.fixture
def ft_provider():
    """Fixture for FranceTravailProvider."""
    return FranceTravailProvider()


# ============================================================================
#  Normalization Tests
# ============================================================================

class TestFranceTravailNormalization:
    """Test job data normalization."""

    def test_normalize_complete_job(self, ft_provider):
        """Test normalization with all fields present."""
        raw = {
            "id": "203RTGK",
            "intitule": "Boulanger H/F",
            "description": "Nous recherchons un boulanger passionné...",
            "lieuTravail": {"libelle": "31 - TOULOUSE"},
            "entreprise": {"nom": "La Mie de Pain"},
            "typeContratLibelle": "CDI",
            "salaire": {"libelle": "2000€ - 2500€"},
            "dateCreation": "2026-02-17T10:00:00Z",
            "origineOffre": {
                "urlOrigine": "https://candidat.francetravail.fr/offres/recherche/detail/203RTGK"
            },
        }
        result = ft_provider._normalize_ft_job(raw)

        assert result["id"] == "ft_203RTGK"
        assert result["title"] == "Boulanger H/F"
        assert result["company"] == "La Mie de Pain"
        assert result["location"] == "31 - TOULOUSE"
        assert result["contract_type"] == "CDI"
        assert result["salary"] == "2000€ - 2500€"
        assert result["source"] == "france_travail"
        assert "203RTGK" in result["url"]

    def test_normalize_missing_company(self, ft_provider):
        """Missing company falls back to 'Entreprise confidentielle'."""
        raw = {"id": "ABC123", "intitule": "Développeur Python", "entreprise": {}}
        result = ft_provider._normalize_ft_job(raw)
        assert result["company"] == "Entreprise confidentielle"

    def test_normalize_missing_location(self, ft_provider):
        """Missing location falls back to 'France'."""
        raw = {"id": "ABC123", "intitule": "Développeur Python"}
        result = ft_provider._normalize_ft_job(raw)
        assert result["location"] == "France"

    def test_normalize_description_truncation(self, ft_provider):
        """Descriptions are truncated at 500 chars."""
        raw = {"id": "ABC123", "intitule": "Test", "description": "A" * 1000}
        result = ft_provider._normalize_ft_job(raw)
        assert len(result["description"]) == 500

    def test_normalize_url_fallback(self, ft_provider):
        """Without origineOffre, URL is built from job ID."""
        raw = {"id": "XYZ789", "intitule": "Test"}
        result = ft_provider._normalize_ft_job(raw)
        assert result["url"] == "https://candidat.francetravail.fr/offres/recherche/detail/XYZ789"


# ============================================================================
#  Contract Type Tests
# ============================================================================

class TestContractTypeMapping:
    """Test contract type normalization."""

    @pytest.mark.parametrize("raw,expected", [
        ("CDI", "CDI"),
        ("CDD", "CDD"),
        ("MIS", "Intérim"),
        ("LIB", "Freelance"),
        ("SAI", "Saisonnier"),
        ("XYZ", "XYZ"),     # Unknown passthrough
        (None, None),        # None passthrough
    ])
    def test_contract_mapping(self, ft_provider, raw, expected):
        assert ft_provider._normalize_contract(raw) == expected


# ============================================================================
#  Salary Formatting Tests
# ============================================================================

class TestSalaryFormatting:
    """Test salary formatting."""

    def test_salary_libelle(self, ft_provider):
        item = {"salaire": {"libelle": "Horaire de 12.02 Euros"}}
        assert ft_provider._format_salary(item) == "Horaire de 12.02 Euros"

    def test_salary_commentaire(self, ft_provider):
        item = {"salaire": {"commentaire": "2000€ - 2200€ selon expérience"}}
        assert ft_provider._format_salary(item) == "2000€ - 2200€ selon expérience"

    def test_salary_libelle_priority_over_commentaire(self, ft_provider):
        """Libelle takes priority over commentaire."""
        item = {"salaire": {"libelle": "25k", "commentaire": "negotiable"}}
        assert ft_provider._format_salary(item) == "25k"

    def test_no_salary(self, ft_provider):
        assert ft_provider._format_salary({}) is None
        assert ft_provider._format_salary({"salaire": {}}) is None


# ============================================================================
#  Country Filter Tests
# ============================================================================

class TestCountryFilter:
    """Test that France Travail only works for France."""

    def test_supports_france(self, ft_provider):
        assert ft_provider.supports_country("fr") is True

    def test_rejects_us(self, ft_provider):
        assert ft_provider.supports_country("us") is False

    def test_rejects_uk(self, ft_provider):
        assert ft_provider.supports_country("gb") is False

    @pytest.mark.asyncio
    async def test_search_non_french_returns_empty(self, ft_provider):
        """Searching for non-FR country returns empty list immediately."""
        result = await ft_provider.search("developer", country_code="us")
        assert result == []


# ============================================================================
#  Provider Metadata Tests
# ============================================================================

class TestProviderMetadata:
    """Test provider metadata."""

    def test_name(self, ft_provider):
        assert ft_provider.name == "france_travail"

    def test_supported_countries(self, ft_provider):
        assert ft_provider.supported_countries == {"fr"}


# ============================================================================
#  Integration Test (requires live API credentials)
# ============================================================================

class TestFranceTravailIntegration:
    """Integration tests that call the real API."""

    @pytest.mark.asyncio
    @pytest.mark.skipif(
        not __import__("os").getenv("CLIENT_ID"),
        reason="CLIENT_ID not set — skipping live API test"
    )
    async def test_live_search_boulanger_toulouse(self, ft_provider):
        """Test a real search for 'boulanger' in Toulouse."""
        results = await ft_provider.search(
            query="boulanger",
            location="Toulouse",
            country_code="fr",
            max_results=5,
        )

        assert len(results) > 0, "Expected at least 1 result"

        job = results[0]
        assert job["id"].startswith("ft_")
        assert job["source"] == "france_travail"
        assert job["title"]
        assert job["url"]
