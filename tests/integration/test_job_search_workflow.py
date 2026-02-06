"""
Integration tests for job search workflow.
Tests the complete flow: search → results → job details
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.mark.integration
class TestJobSearchWorkflow:
    """Integration tests for job search workflow."""

    def test_complete_job_search_workflow(
        self,
        integration_client: TestClient,
        sample_job_search_params: dict,
        mock_job_search
    ):
        """Test complete job search workflow."""
        # Step 1: Perform job search
        search_response = integration_client.post(
            "/api/search/jobs",
            json=sample_job_search_params
        )

        # Step 2: Verify search results
        assert search_response.status_code == 200
        data = search_response.json()
        assert data["success"] is True
        assert "jobs" in data
        assert isinstance(data["jobs"], list)
        assert "count" in data

    def test_job_search_with_filters_workflow(
        self,
        integration_client: TestClient,
        mock_job_search
    ):
        """Test job search with various filters."""
        # Step 1: Search with all filters
        search_params = {
            "job_title": "Python Developer",
            "country_code": "fr",
            "city": "Paris",
            "contract_type": "CDI"
        }

        response = integration_client.post(
            "/api/search/jobs",
            json=search_params
        )

        # Step 2: Verify results reflect filters
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["query"]["title"] == "Python Developer"
        assert data["query"]["country"] == "fr"
        assert data["query"]["city"] == "Paris"

    def test_job_search_with_freemium_limit(
        self,
        integration_client: TestClient,
        unique_client_id: str,
        sample_job_search_params: dict,
        clean_usage,
        mock_job_search
    ):
        """Test job search respects freemium limits."""
        # Step 1: Check initial usage (limit is 3)
        check_response = integration_client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search"
            }
        )
        assert check_response.json()["allowed"] is True
        assert check_response.json()["limit"] == 3

        # Step 2: Use all 3 searches
        for i in range(3):
            integration_client.post(
                "/api/search/jobs",
                json=sample_job_search_params
            )
            integration_client.post(
                "/api/increment-usage",
                json={
                    "client_id": unique_client_id,
                    "feature": "job_search",
                    "amount": 1
                }
            )

        # Step 3: Verify limit reached
        check_response_2 = integration_client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search"
            }
        )
        assert check_response_2.json()["allowed"] is False

    def test_job_search_minimal_params_workflow(
        self,
        integration_client: TestClient,
        sample_job_search_params_minimal: dict,
        mock_job_search
    ):
        """Test job search with minimal parameters."""
        response = integration_client.post(
            "/api/search/jobs",
            json=sample_job_search_params_minimal
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


@pytest.mark.integration
class TestRecruiterSearchWorkflow:
    """Integration tests for recruiter search workflow."""

    def test_recruiter_by_company_workflow(
        self,
        integration_client: TestClient,
        sample_recruiter_search_params: dict
    ):
        """Test recruiter search by company workflow."""
        response = integration_client.post(
            "/api/search/recruiter",
            json=sample_recruiter_search_params
        )

        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "recruiters" in data

    def test_recruiter_by_domain_workflow(self, integration_client: TestClient):
        """Test recruiter search by domain workflow."""
        response = integration_client.post(
            "/api/search/recruiters-by-domain",
            json={
                "domain": "Data Science",
                "country": "France",
                "city": "Paris"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "recruiters" in data


@pytest.mark.integration
class TestGeoDataWorkflow:
    """Integration tests for geo data workflow."""

    def test_country_to_cities_workflow(self, integration_client: TestClient):
        """Test getting cities after selecting a country."""
        # Step 1: Get countries
        countries_response = integration_client.get("/api/countries")
        assert countries_response.status_code == 200
        countries_data = countries_response.json()
        assert countries_data["success"] is True
        assert len(countries_data["data"]) > 0

        # Step 2: Get cities for a country
        cities_response = integration_client.get("/api/cities/France")
        assert cities_response.status_code == 200
        cities_data = cities_response.json()
        assert cities_data["success"] is True

    def test_contract_types_workflow(self, integration_client: TestClient):
        """Test getting contract types for job search."""
        response = integration_client.get("/api/contract-types")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert len(data["data"]) > 0


@pytest.mark.integration
class TestJobSearchErrorHandling:
    """Integration tests for job search error handling."""

    def test_search_with_special_characters(
        self,
        integration_client: TestClient,
        mock_job_search
    ):
        """Test search with special characters in job title."""
        response = integration_client.post(
            "/api/search/jobs",
            json={
                "job_title": "C++ Developer & Data",
                "country_code": "fr"
            }
        )

        assert response.status_code == 200

    def test_search_with_unicode_characters(
        self,
        integration_client: TestClient,
        mock_job_search
    ):
        """Test search with unicode characters."""
        response = integration_client.post(
            "/api/search/jobs",
            json={
                "job_title": "Développeur Full-Stack",
                "country_code": "fr",
                "city": "Île-de-France"
            }
        )

        assert response.status_code == 200

    def test_unknown_country_handled(self, integration_client: TestClient):
        """Test that unknown country is handled."""
        response = integration_client.get("/api/cities/UnknownCountry123")

        # Should return empty list or handle gracefully
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
