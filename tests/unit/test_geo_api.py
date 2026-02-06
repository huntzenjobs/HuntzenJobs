"""
Unit tests for geo API endpoints (countries, cities, contract types).
"""
import pytest
from fastapi.testclient import TestClient


class TestCountriesEndpoint:
    """Tests for /api/countries endpoint."""

    def test_countries_returns_200(self, client: TestClient):
        """Test that countries endpoint returns 200."""
        response = client.get("/api/countries")
        assert response.status_code == 200

    def test_countries_returns_success(self, client: TestClient):
        """Test that countries endpoint returns success."""
        response = client.get("/api/countries")
        data = response.json()
        assert data["success"] is True

    def test_countries_returns_list(self, client: TestClient):
        """Test that countries endpoint returns a list."""
        response = client.get("/api/countries")
        data = response.json()
        assert isinstance(data["data"], list)

    def test_countries_has_count(self, client: TestClient):
        """Test that countries response has count."""
        response = client.get("/api/countries")
        data = response.json()
        assert "count" in data
        assert data["count"] == len(data["data"])

    def test_countries_contains_france(self, client: TestClient):
        """Test that France is in the countries list."""
        response = client.get("/api/countries")
        data = response.json()
        country_names = [c.get("name", "").lower() for c in data["data"]]
        assert "france" in country_names

    def test_country_structure(self, client: TestClient):
        """Test that each country has expected structure."""
        response = client.get("/api/countries")
        data = response.json()
        if data["data"]:
            country = data["data"][0]
            assert "name" in country
            assert "code" in country


class TestCitiesEndpoint:
    """Tests for /api/cities/{country_name} endpoint."""

    def test_cities_france_returns_200(self, client: TestClient):
        """Test that cities endpoint returns 200 for France."""
        response = client.get("/api/cities/France")
        assert response.status_code == 200

    def test_cities_france_returns_success(self, client: TestClient):
        """Test that cities endpoint returns success."""
        response = client.get("/api/cities/France")
        data = response.json()
        assert data["success"] is True

    def test_cities_france_returns_list(self, client: TestClient):
        """Test that cities endpoint returns a list."""
        response = client.get("/api/cities/France")
        data = response.json()
        assert isinstance(data["data"], list)

    def test_cities_france_contains_paris(self, client: TestClient):
        """Test that Paris is in France's cities."""
        response = client.get("/api/cities/France")
        data = response.json()
        cities_lower = [c.lower() for c in data["data"]]
        assert "paris" in cities_lower

    def test_cities_unknown_country(self, client: TestClient):
        """Test cities for unknown country."""
        response = client.get("/api/cities/UnknownCountry123")
        data = response.json()
        # Should return empty list or error
        assert "data" in data

    def test_cities_has_count(self, client: TestClient):
        """Test that cities response has count."""
        response = client.get("/api/cities/France")
        data = response.json()
        assert "count" in data


class TestContractTypesEndpoint:
    """Tests for /api/contract-types endpoint."""

    def test_contract_types_returns_200(self, client: TestClient):
        """Test that contract types endpoint returns 200."""
        response = client.get("/api/contract-types")
        assert response.status_code == 200

    def test_contract_types_returns_success(self, client: TestClient):
        """Test that contract types endpoint returns success."""
        response = client.get("/api/contract-types")
        data = response.json()
        assert data["success"] is True

    def test_contract_types_returns_list(self, client: TestClient):
        """Test that contract types endpoint returns a list."""
        response = client.get("/api/contract-types")
        data = response.json()
        assert isinstance(data["data"], list)

    def test_contract_types_not_empty(self, client: TestClient):
        """Test that contract types list is not empty."""
        response = client.get("/api/contract-types")
        data = response.json()
        assert len(data["data"]) > 0
