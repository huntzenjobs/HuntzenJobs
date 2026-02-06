"""
Unit tests for job search API endpoints.
"""
import pytest
from fastapi.testclient import TestClient


class TestJobSearchEndpoint:
    """Tests for /api/search/jobs endpoint."""

    def test_job_search_valid_request(self, client: TestClient, sample_job_search_params: dict):
        """Test job search with valid parameters."""
        response = client.post("/api/search/jobs", json=sample_job_search_params)
        assert response.status_code == 200

    def test_job_search_returns_success(self, client: TestClient, sample_job_search_params: dict):
        """Test that job search returns success flag."""
        response = client.post("/api/search/jobs", json=sample_job_search_params)
        data = response.json()
        assert "success" in data

    def test_job_search_returns_jobs_list(self, client: TestClient, sample_job_search_params: dict):
        """Test that job search returns jobs list."""
        response = client.post("/api/search/jobs", json=sample_job_search_params)
        data = response.json()
        assert "jobs" in data
        assert isinstance(data["jobs"], list)

    def test_job_search_returns_count(self, client: TestClient, sample_job_search_params: dict):
        """Test that job search returns count."""
        response = client.post("/api/search/jobs", json=sample_job_search_params)
        data = response.json()
        assert "count" in data

    def test_job_search_returns_sources(self, client: TestClient, sample_job_search_params: dict):
        """Test that job search returns sources used."""
        response = client.post("/api/search/jobs", json=sample_job_search_params)
        data = response.json()
        if data.get("success"):
            assert "sources" in data

    def test_job_search_missing_job_title(self, client: TestClient):
        """Test job search without job_title."""
        response = client.post(
            "/api/search/jobs",
            json={
                "country_code": "fr",
                "city": "Paris"
            }
        )
        assert response.status_code == 422

    def test_job_search_missing_country(self, client: TestClient):
        """Test job search without country_code."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer"
            }
        )
        assert response.status_code == 422

    def test_job_search_empty_job_title(self, client: TestClient):
        """Test job search with empty job_title."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "",
                "country_code": "fr"
            }
        )
        assert response.status_code == 422

    def test_job_search_job_title_too_long(self, client: TestClient):
        """Test job search with job_title exceeding max length."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "x" * 250,  # Max is 200
                "country_code": "fr"
            }
        )
        assert response.status_code == 422

    def test_job_search_optional_city(self, client: TestClient):
        """Test job search without city (optional field)."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer",
                "country_code": "fr"
            }
        )
        assert response.status_code == 200

    def test_job_search_optional_contract_type(self, client: TestClient):
        """Test job search without contract_type (optional field)."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer",
                "country_code": "fr",
                "city": "Paris"
            }
        )
        assert response.status_code == 200

    def test_job_search_query_echo(self, client: TestClient, sample_job_search_params: dict):
        """Test that job search echoes back query parameters."""
        response = client.post("/api/search/jobs", json=sample_job_search_params)
        data = response.json()
        if data.get("success"):
            assert "query" in data
            assert data["query"]["title"] == sample_job_search_params["job_title"]


class TestJobDescriptionEndpoint:
    """Tests for /api/job/description endpoint."""

    def test_job_description_missing_url(self, client: TestClient):
        """Test job description without URL."""
        response = client.post(
            "/api/job/description",
            json={}
        )
        assert response.status_code == 422

    def test_job_description_empty_url(self, client: TestClient):
        """Test job description with empty URL."""
        response = client.post(
            "/api/job/description",
            json={"url": ""}
        )
        data = response.json()
        assert data["success"] is False

    def test_job_description_invalid_url(self, client: TestClient):
        """Test job description with invalid URL."""
        response = client.post(
            "/api/job/description",
            json={"url": "not-a-valid-url"}
        )
        data = response.json()
        # Should either fail validation or return error
        assert response.status_code in [200, 422]


class TestRecruiterSearchEndpoint:
    """Tests for /api/search/recruiter endpoint."""

    def test_recruiter_search_valid_request(self, client: TestClient):
        """Test recruiter search with valid parameters."""
        response = client.post(
            "/api/search/recruiter",
            json={
                "company_name": "Google",
                "location": "Paris"
            }
        )
        assert response.status_code == 200

    def test_recruiter_search_missing_company(self, client: TestClient):
        """Test recruiter search without company_name."""
        response = client.post(
            "/api/search/recruiter",
            json={
                "location": "Paris"
            }
        )
        assert response.status_code == 422

    def test_recruiter_search_response_structure(self, client: TestClient):
        """Test recruiter search response structure."""
        response = client.post(
            "/api/search/recruiter",
            json={
                "company_name": "TestCompany",
                "location": "Paris"
            }
        )
        data = response.json()
        assert "success" in data
        assert "recruiters" in data


class TestRecruiterByDomainEndpoint:
    """Tests for /api/search/recruiters-by-domain endpoint."""

    def test_recruiters_by_domain_valid_request(self, client: TestClient):
        """Test recruiters by domain with valid parameters."""
        response = client.post(
            "/api/search/recruiters-by-domain",
            json={
                "domain": "Data Science",
                "country": "France",
                "city": "Paris"
            }
        )
        assert response.status_code == 200

    def test_recruiters_by_domain_missing_domain(self, client: TestClient):
        """Test recruiters by domain without domain."""
        response = client.post(
            "/api/search/recruiters-by-domain",
            json={
                "country": "France"
            }
        )
        assert response.status_code == 422

    def test_recruiters_by_domain_response_structure(self, client: TestClient):
        """Test recruiters by domain response structure."""
        response = client.post(
            "/api/search/recruiters-by-domain",
            json={
                "domain": "Tech",
                "country": "France"
            }
        )
        data = response.json()
        assert "success" in data
        assert "recruiters" in data
