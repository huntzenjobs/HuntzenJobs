"""
Tests for the location post-filter in the aggregator.
"""

import pytest

from src.services.job_providers.aggregator import (
    _is_remote_job,
    _location_matches,
    _normalize_location_text,
)


class TestNormalizeLocationText:
    """Test location text normalization."""

    def test_basic_lowercase(self):
        assert _normalize_location_text("Nantes") == "nantes"

    def test_strip_accents(self):
        assert _normalize_location_text("Genève") == "geneve"

    def test_strip_postal_code(self):
        result = _normalize_location_text("44000 - Nantes")
        assert "44000" not in result
        assert "nantes" in result

    def test_strip_cedex(self):
        result = _normalize_location_text("Nantes Cedex 3")
        assert "cedex" not in result
        assert "nantes" in result

    def test_strip_cs(self):
        result = _normalize_location_text("Nantes CS 12345")
        assert "cs" not in result.split()
        assert "12345" not in result

    def test_collapse_whitespace(self):
        result = _normalize_location_text("  Nantes   Cedex   ")
        assert "  " not in result


class TestLocationMatches:
    """Test the _location_matches function."""

    def test_exact_match(self):
        assert _location_matches("Nantes", "Nantes") is True

    def test_case_insensitive(self):
        assert _location_matches("nantes", "Nantes") is True

    def test_postal_code_prefix(self):
        assert _location_matches("44000 - Nantes", "Nantes") is True

    def test_region_suffix(self):
        assert _location_matches("Nantes, Pays de la Loire", "Nantes") is True

    def test_parentheses(self):
        assert _location_matches("Nantes (44)", "Nantes") is True

    def test_different_city(self):
        assert _location_matches("Paris", "Nantes") is False

    def test_different_city_with_region(self):
        assert _location_matches("Lyon, Auvergne-Rhone-Alpes", "Nantes") is False

    def test_empty_job_location_passes(self):
        """Jobs with no location should pass (benefit of the doubt)."""
        assert _location_matches("", "Nantes") is True

    def test_empty_target_city_passes(self):
        """If no city filter requested, all jobs pass."""
        assert _location_matches("Paris", "") is True

    def test_both_empty(self):
        assert _location_matches("", "") is True

    def test_accented_city(self):
        assert _location_matches("Saint-Étienne", "Saint-Etienne") is True

    def test_cedex_in_location(self):
        assert _location_matches("44300 Nantes Cedex 3", "Nantes") is True

    def test_nearby_city_does_not_match(self):
        """Nearby cities should NOT match (Saint-Herblain != Nantes)."""
        assert _location_matches("Saint-Herblain", "Nantes") is False

    def test_ile_de_france(self):
        assert _location_matches("Paris, Ile-de-France", "Paris") is True

    def test_arrondissement(self):
        assert _location_matches("Paris 15e", "Paris") is True


class TestIsRemoteJob:
    """Test remote job detection."""

    def test_location_remote(self):
        assert _is_remote_job({"location": "Remote"}) is True

    def test_location_teletravail(self):
        assert _is_remote_job({"location": "Télétravail"}) is True

    def test_contract_remote(self):
        assert _is_remote_job({"location": "Paris", "contract_type": "Remote"}) is True

    def test_source_remoteok(self):
        assert _is_remote_job({"location": "Remote", "source": "remoteok"}) is True

    def test_normal_job_not_remote(self):
        assert _is_remote_job({"location": "Nantes", "contract_type": "CDI"}) is False

    def test_empty_job(self):
        assert _is_remote_job({}) is False
