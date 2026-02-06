"""
Unit tests for freemium usage tracking endpoints.
"""
import pytest
from fastapi.testclient import TestClient


class TestCheckUsageEndpoint:
    """Tests for /api/check-usage endpoint."""

    def test_check_usage_valid_request(self, client: TestClient, valid_client_id: str):
        """Test check usage with valid parameters."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": valid_client_id,
                "feature": "cv_analysis"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "allowed" in data
        assert "current" in data
        assert "limit" in data
        assert "remaining" in data
        assert "reset_at" in data

    def test_check_usage_cv_analysis_limit(self, client: TestClient, valid_client_id: str):
        """Test that CV analysis has correct limit."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": valid_client_id,
                "feature": "cv_analysis"
            }
        )
        data = response.json()
        assert data["limit"] == 1  # 1 per day

    def test_check_usage_coach_limit(self, client: TestClient, valid_client_id: str):
        """Test that coach has correct limit (5 minutes = 300 seconds)."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": valid_client_id,
                "feature": "coach"
            }
        )
        data = response.json()
        assert data["limit"] == 300  # 5 minutes

    def test_check_usage_job_search_limit(self, client: TestClient, valid_client_id: str):
        """Test that job search has correct limit."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": valid_client_id,
                "feature": "job_search"
            }
        )
        data = response.json()
        assert data["limit"] == 3  # 3 per day

    def test_check_usage_invalid_feature(self, client: TestClient, valid_client_id: str):
        """Test check usage with invalid feature."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": valid_client_id,
                "feature": "invalid_feature"
            }
        )
        assert response.status_code == 422  # Validation error

    def test_check_usage_missing_client_id(self, client: TestClient):
        """Test check usage without client_id."""
        response = client.post(
            "/api/check-usage",
            json={
                "feature": "cv_analysis"
            }
        )
        assert response.status_code == 422

    def test_check_usage_short_client_id(self, client: TestClient):
        """Test check usage with too short client_id."""
        response = client.post(
            "/api/check-usage",
            json={
                "client_id": "short",
                "feature": "cv_analysis"
            }
        )
        assert response.status_code == 422


class TestIncrementUsageEndpoint:
    """Tests for /api/increment-usage endpoint."""

    def test_increment_usage_valid_request(self, client: TestClient):
        """Test increment usage with valid parameters."""
        # Use unique client_id to avoid interference
        unique_client_id = "hzn_increment_test_" + "x" * 20
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search",
                "amount": 1
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["current"] >= 1

    def test_increment_usage_updates_count(self, client: TestClient):
        """Test that increment actually updates the count."""
        unique_client_id = "hzn_increment_count_" + "y" * 20

        # First increment
        response1 = client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search",
                "amount": 1
            }
        )
        count1 = response1.json()["current"]

        # Second increment
        response2 = client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search",
                "amount": 1
            }
        )
        count2 = response2.json()["current"]

        assert count2 == count1 + 1

    def test_increment_usage_custom_amount(self, client: TestClient):
        """Test increment with custom amount (for coach time)."""
        unique_client_id = "hzn_increment_amount_" + "z" * 20
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "coach",
                "amount": 60  # 1 minute
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["current"] >= 60

    def test_increment_usage_invalid_amount(self, client: TestClient, valid_client_id: str):
        """Test increment with invalid amount."""
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": valid_client_id,
                "feature": "coach",
                "amount": -1
            }
        )
        assert response.status_code == 422

    def test_increment_usage_amount_too_large(self, client: TestClient, valid_client_id: str):
        """Test increment with amount exceeding max."""
        response = client.post(
            "/api/increment-usage",
            json={
                "client_id": valid_client_id,
                "feature": "coach",
                "amount": 5000  # Max is 3600
            }
        )
        assert response.status_code == 422


class TestUsageStatsEndpoint:
    """Tests for /api/usage-stats endpoint."""

    def test_usage_stats_valid_request(self, client: TestClient, valid_client_id: str):
        """Test usage stats with valid client_id."""
        response = client.get(f"/api/usage-stats?client_id={valid_client_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "stats" in data
        assert "date" in data

    def test_usage_stats_contains_all_features(self, client: TestClient, valid_client_id: str):
        """Test that usage stats contains all features."""
        response = client.get(f"/api/usage-stats?client_id={valid_client_id}")
        data = response.json()
        stats = data["stats"]
        assert "cv_analysis" in stats
        assert "coach" in stats
        assert "job_search" in stats

    def test_usage_stats_feature_structure(self, client: TestClient, valid_client_id: str):
        """Test that each feature stat has correct structure."""
        response = client.get(f"/api/usage-stats?client_id={valid_client_id}")
        data = response.json()
        for feature, stat in data["stats"].items():
            assert "current" in stat
            assert "limit" in stat
            assert "remaining" in stat
            assert "percentage" in stat

    def test_usage_stats_missing_client_id(self, client: TestClient):
        """Test usage stats without client_id."""
        response = client.get("/api/usage-stats")
        data = response.json()
        assert data["success"] is False
        assert "error" in data


class TestFreemiumLimitsEnforcement:
    """Tests for freemium limits enforcement."""

    def test_allowed_becomes_false_when_limit_reached(self, client: TestClient):
        """Test that allowed becomes false when limit is reached."""
        unique_client_id = "hzn_limit_test_" + "a" * 25

        # First, check that it's allowed
        response1 = client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "cv_analysis"
            }
        )
        assert response1.json()["allowed"] is True

        # Increment to reach limit
        client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "cv_analysis",
                "amount": 1
            }
        )

        # Check again - should be denied
        response2 = client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "cv_analysis"
            }
        )
        assert response2.json()["allowed"] is False

    def test_remaining_decreases_correctly(self, client: TestClient):
        """Test that remaining count decreases correctly."""
        unique_client_id = "hzn_remaining_test_" + "b" * 22

        # Check initial remaining
        response1 = client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search"
            }
        )
        initial_remaining = response1.json()["remaining"]

        # Increment
        client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search",
                "amount": 1
            }
        )

        # Check remaining after
        response2 = client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "job_search"
            }
        )
        new_remaining = response2.json()["remaining"]

        assert new_remaining == initial_remaining - 1
