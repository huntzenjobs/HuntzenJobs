"""
Unit tests for Pydantic validation models.
"""
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError


class TestChatMessageValidation:
    """Tests for ChatMessage model validation."""

    def test_valid_message(self, client: TestClient, valid_session_id: str):
        """Test that valid message is accepted."""
        response = client.post(
            "/chat",
            json={
                "message": "Hello, I need help",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 200

    def test_empty_message_rejected(self, client: TestClient, valid_session_id: str):
        """Test that empty message is rejected."""
        response = client.post(
            "/chat",
            json={
                "message": "",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422

    def test_message_too_long_rejected(self, client: TestClient, valid_session_id: str):
        """Test that message exceeding max length is rejected."""
        long_message = "x" * 2001  # Max is 2000
        response = client.post(
            "/chat",
            json={
                "message": long_message,
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422

    def test_message_at_max_length_accepted(self, client: TestClient, valid_session_id: str):
        """Test that message at max length is accepted."""
        max_message = "x" * 2000
        response = client.post(
            "/chat",
            json={
                "message": max_message,
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 200

    def test_missing_message_rejected(self, client: TestClient, valid_session_id: str):
        """Test that missing message field is rejected."""
        response = client.post(
            "/chat",
            json={
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422

    def test_missing_session_id_rejected(self, client: TestClient):
        """Test that missing session_id is rejected."""
        response = client.post(
            "/chat",
            json={
                "message": "Hello"
            }
        )
        assert response.status_code == 422


class TestJobSearchRequestValidation:
    """Tests for JobSearchRequest model validation."""

    def test_valid_job_search(self, client: TestClient, sample_job_search_params: dict):
        """Test that valid job search request is accepted."""
        response = client.post("/api/search/jobs", json=sample_job_search_params)
        assert response.status_code == 200

    def test_missing_job_title_rejected(self, client: TestClient):
        """Test that missing job_title is rejected."""
        response = client.post(
            "/api/search/jobs",
            json={
                "country_code": "fr",
                "city": "Paris"
            }
        )
        assert response.status_code == 422

    def test_empty_job_title_rejected(self, client: TestClient):
        """Test that empty job_title is rejected."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "",
                "country_code": "fr"
            }
        )
        assert response.status_code == 422

    def test_job_title_too_long_rejected(self, client: TestClient):
        """Test that job_title exceeding max length is rejected."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "x" * 201,  # Max is 200
                "country_code": "fr"
            }
        )
        assert response.status_code == 422

    def test_missing_country_code_rejected(self, client: TestClient):
        """Test that missing country_code is rejected."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer"
            }
        )
        assert response.status_code == 422

    def test_country_code_too_short_rejected(self, client: TestClient):
        """Test that country_code too short is rejected."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer",
                "country_code": "f"  # Min is 2
            }
        )
        assert response.status_code == 422

    def test_country_code_too_long_rejected(self, client: TestClient):
        """Test that country_code too long is rejected."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer",
                "country_code": "fran"  # Max is 3
            }
        )
        assert response.status_code == 422

    def test_optional_city_accepted(self, client: TestClient, sample_job_search_params_minimal: dict):
        """Test that request without city is accepted."""
        response = client.post("/api/search/jobs", json=sample_job_search_params_minimal)
        assert response.status_code == 200

    def test_optional_contract_type_accepted(self, client: TestClient):
        """Test that request without contract_type is accepted."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer",
                "country_code": "fr",
                "city": "Paris"
            }
        )
        assert response.status_code == 200


class TestCVAnalysisRequestValidation:
    """Tests for CVAnalysisRequest model validation."""

    def test_valid_cv_analysis(self, client: TestClient, sample_cv_text: str):
        """Test that valid CV analysis request is accepted."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "fr"
            }
        )
        assert response.status_code == 200

    def test_cv_text_too_short_rejected(self, client: TestClient):
        """Test that cv_text below minimum is rejected."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": "Too short",  # Min is 50
                "language": "fr"
            }
        )
        assert response.status_code == 422

    def test_cv_text_at_minimum_accepted(self, client: TestClient):
        """Test that cv_text at minimum length is accepted."""
        min_cv_text = "x" * 50
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": min_cv_text,
                "language": "fr"
            }
        )
        # Should be accepted (validation passes)
        assert response.status_code == 200

    def test_missing_cv_text_rejected(self, client: TestClient):
        """Test that missing cv_text is rejected."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "language": "fr"
            }
        )
        assert response.status_code == 422

    def test_optional_job_description_accepted(self, client: TestClient, sample_cv_text: str):
        """Test that request without job_description is accepted."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text
            }
        )
        assert response.status_code == 200

    def test_with_job_description_accepted(
        self, client: TestClient, sample_cv_text: str, sample_job_description: str
    ):
        """Test that request with job_description is accepted."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "job_description": sample_job_description,
                "language": "fr"
            }
        )
        assert response.status_code == 200

    def test_default_language_is_french(self, client: TestClient, sample_cv_text: str):
        """Test that default language is French."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text
            }
        )
        assert response.status_code == 200


class TestRecruiterSearchRequestValidation:
    """Tests for RecruiterSearchRequest model validation."""

    def test_valid_recruiter_search(self, client: TestClient, sample_recruiter_search_params: dict):
        """Test that valid recruiter search is accepted."""
        response = client.post("/api/search/recruiter", json=sample_recruiter_search_params)
        assert response.status_code == 200

    def test_missing_company_name_rejected(self, client: TestClient):
        """Test that missing company_name is rejected."""
        response = client.post(
            "/api/search/recruiter",
            json={
                "location": "Paris"
            }
        )
        assert response.status_code == 422

    def test_empty_company_name_rejected(self, client: TestClient):
        """Test that empty company_name is rejected."""
        response = client.post(
            "/api/search/recruiter",
            json={
                "company_name": "",
                "location": "Paris"
            }
        )
        assert response.status_code == 422

    def test_company_name_too_long_rejected(self, client: TestClient):
        """Test that company_name exceeding max length is rejected."""
        response = client.post(
            "/api/search/recruiter",
            json={
                "company_name": "x" * 201,  # Max is 200
                "location": "Paris"
            }
        )
        assert response.status_code == 422

    def test_optional_location_accepted(self, client: TestClient):
        """Test that request without location is accepted."""
        response = client.post(
            "/api/search/recruiter",
            json={
                "company_name": "Google"
            }
        )
        assert response.status_code == 200


class TestCheckUsageRequestValidation:
    """Tests for CheckUsageRequest model validation."""

    def test_valid_check_usage(self, client: TestClient, valid_client_id: str):
        """Test that valid check usage request is accepted."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": valid_client_id,
                "feature": "cv_analysis"
            }
        )
        assert response.status_code == 200

    def test_invalid_feature_rejected(self, client: TestClient, valid_client_id: str):
        """Test that invalid feature is rejected."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": valid_client_id,
                "feature": "invalid_feature"
            }
        )
        assert response.status_code == 422

    def test_valid_features_accepted(self, client: TestClient, valid_client_id: str):
        """Test that all valid features are accepted."""
        valid_features = ["cv_analysis", "coach", "job_search"]
        for feature in valid_features:
            response = client.post(
                "/api/check-usage",
                json={
                    "client_id": valid_client_id,
                    "feature": feature
                }
            )
            assert response.status_code == 200, f"Feature {feature} should be valid"

    def test_client_id_too_short_rejected(self, client: TestClient):
        """Test that client_id below minimum is rejected."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": "short",  # Min is 10
                "feature": "cv_analysis"
            }
        )
        assert response.status_code == 422

    def test_client_id_too_long_rejected(self, client: TestClient):
        """Test that client_id above maximum is rejected."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": "x" * 101,  # Max is 100
                "feature": "cv_analysis"
            }
        )
        assert response.status_code == 422


class TestIncrementUsageRequestValidation:
    """Tests for IncrementUsageRequest model validation."""

    def test_valid_increment_usage(self, client: TestClient, valid_client_id: str):
        """Test that valid increment usage request is accepted."""
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": valid_client_id,
                "feature": "cv_analysis",
                "amount": 1
            }
        )
        assert response.status_code == 200

    def test_negative_amount_rejected(self, client: TestClient, valid_client_id: str):
        """Test that negative amount is rejected."""
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": valid_client_id,
                "feature": "cv_analysis",
                "amount": -1
            }
        )
        assert response.status_code == 422

    def test_zero_amount_rejected(self, client: TestClient, valid_client_id: str):
        """Test that zero amount is rejected."""
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": valid_client_id,
                "feature": "cv_analysis",
                "amount": 0
            }
        )
        assert response.status_code == 422

    def test_amount_too_large_rejected(self, client: TestClient, valid_client_id: str):
        """Test that amount above maximum is rejected."""
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": valid_client_id,
                "feature": "coach",
                "amount": 3601  # Max is 3600
            }
        )
        assert response.status_code == 422

    def test_default_amount_is_one(self, client: TestClient, unique_client_id: str, clean_usage):
        """Test that default amount is 1."""
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["current"] == 1
