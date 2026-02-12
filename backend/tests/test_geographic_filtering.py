"""
Tests for Geographic Radius Filtering
=======================================
"""

import pytest
from src.services.distance_service import DistanceService
from src.services.job_providers.aggregator import (
    _extract_city_from_location,
    _is_remote_job
)


class TestDistanceService:
    """Tests for DistanceService."""

    def test_calculate_distance_paris_garges(self):
        """Test distance calculation between Paris and Garges-lès-Gonesse."""
        paris = (48.8566, 2.3522)
        garges = (48.9719, 2.3981)

        distance = DistanceService.calculate_distance(paris, garges)

        # Should be around 14-15 km
        assert 14 <= distance <= 16

    def test_calculate_distance_same_location(self):
        """Test distance calculation for same location."""
        paris = (48.8566, 2.3522)

        distance = DistanceService.calculate_distance(paris, paris)

        assert distance == 0.0

    def test_is_within_radius_true(self):
        """Test is_within_radius returns True when within radius."""
        paris = (48.8566, 2.3522)
        versailles = (48.8049, 2.1204)  # ~17 km from Paris

        result = DistanceService.is_within_radius(paris, versailles, radius_km=20)

        assert result is True

    def test_is_within_radius_false(self):
        """Test is_within_radius returns False when outside radius."""
        paris = (48.8566, 2.3522)
        lyon = (45.7640, 4.8357)  # ~465 km from Paris

        result = DistanceService.is_within_radius(paris, lyon, radius_km=50)

        assert result is False


class TestLocationHelpers:
    """Tests for location helper functions."""

    def test_extract_city_from_location_simple(self):
        """Test extracting city from simple location."""
        location = "Paris, Île-de-France"

        city = _extract_city_from_location(location)

        assert city == "Paris"

    def test_extract_city_from_location_complex(self):
        """Test extracting city from complex location."""
        location = "Lyon, Auvergne-Rhône-Alpes, France"

        city = _extract_city_from_location(location)

        assert city == "Lyon"

    def test_extract_city_from_location_single(self):
        """Test extracting city from single-word location."""
        location = "Remote"

        city = _extract_city_from_location(location)

        assert city == "Remote"

    def test_is_remote_job_english(self):
        """Test detecting remote jobs (English)."""
        assert _is_remote_job("Remote") is True
        assert _is_remote_job("Full Remote") is True
        assert _is_remote_job("100% Remote") is True

    def test_is_remote_job_french(self):
        """Test detecting remote jobs (French)."""
        assert _is_remote_job("Télétravail") is True
        assert _is_remote_job("100% télétravail") is True

    def test_is_remote_job_not_remote(self):
        """Test detecting non-remote jobs."""
        assert _is_remote_job("Paris, France") is False
        assert _is_remote_job("Lyon") is False


@pytest.mark.asyncio
class TestGeocodingIntegration:
    """Integration tests for geocoding (requires network)."""

    async def test_geocode_paris(self):
        """Test geocoding Paris."""
        from src.services.geocoding_service import get_geocoding_service

        service = get_geocoding_service()

        coords = await service.geocode_city("Paris", "fr")

        assert coords is not None
        assert 48.8 <= coords.latitude <= 48.9
        assert 2.3 <= coords.longitude <= 2.4
        assert "paris" in coords.display_name.lower()

    async def test_geocode_invalid_city(self):
        """Test geocoding invalid city returns None."""
        from src.services.geocoding_service import get_geocoding_service

        service = get_geocoding_service()

        coords = await service.geocode_city("XYZ_INVALID_CITY_12345", "fr")

        assert coords is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
