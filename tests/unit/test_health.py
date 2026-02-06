"""
Unit tests for health check endpoint.
"""
import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_check_returns_200(self, client: TestClient):
        """Test that health check returns 200 OK."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_check_returns_healthy_status(self, client: TestClient):
        """Test that health check returns healthy status."""
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "healthy"

    def test_health_check_returns_service_name(self, client: TestClient):
        """Test that health check returns service name."""
        response = client.get("/health")
        data = response.json()
        assert data["service"] == "huntzen-backend"

    def test_health_check_response_structure(self, client: TestClient):
        """Test that health check response has correct structure."""
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert "service" in data
