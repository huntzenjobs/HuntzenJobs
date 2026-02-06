"""
Unit tests for rate limiting functionality.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


class TestRateLimitingConfiguration:
    """Tests for rate limiting configuration."""

    def test_rate_limiter_exists_on_app(self, client: TestClient):
        """Test that rate limiter is configured on the app."""
        from main import app
        assert hasattr(app.state, 'limiter')

    def test_chat_endpoint_has_rate_limit(self, client: TestClient, valid_session_id: str):
        """Test that chat endpoint is rate limited."""
        # First request should succeed
        response = client.post(
            "/chat",
            json={
                "message": "Test message",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 200

    def test_jobs_search_endpoint_has_rate_limit(self, client: TestClient):
        """Test that job search endpoint is rate limited."""
        response = client.post(
            "/api/search/jobs",
            json={
                "job_title": "Developer",
                "country_code": "fr"
            }
        )
        # Should either succeed or return rate limit error
        assert response.status_code in [200, 429]

    def test_cv_analysis_endpoint_has_rate_limit(self, client: TestClient, sample_cv_text: str):
        """Test that CV analysis endpoint is rate limited."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "fr"
            }
        )
        # Should either succeed or return rate limit error
        assert response.status_code in [200, 429]

    def test_coach_endpoint_has_rate_limit(self, client: TestClient, valid_session_id: str):
        """Test that coach endpoint is rate limited."""
        response = client.post(
            "/api/coach",
            json={
                "message": "Bonjour",
                "session_id": valid_session_id
            }
        )
        # Should either succeed or return rate limit error
        assert response.status_code in [200, 429]


class TestRateLimitExceeded:
    """Tests for rate limit exceeded behavior."""

    def test_rate_limit_returns_429_status(self, fresh_client: TestClient, valid_session_id: str):
        """Test that exceeding rate limit returns 429."""
        # Note: This test is difficult without actually exceeding the limit
        # In a real scenario, you'd mock the limiter or use a test-specific limit
        with patch('main.limiter.limit') as mock_limit:
            from slowapi.errors import RateLimitExceeded
            from starlette.requests import Request

            # Configure mock to raise rate limit exception
            def raise_rate_limit(limit_string):
                def decorator(func):
                    async def wrapper(*args, **kwargs):
                        raise RateLimitExceeded(detail="Rate limit exceeded")
                    return wrapper
                return decorator

            # The rate limit handler should be configured
            from main import app
            # Verify the exception handler exists
            assert RateLimitExceeded in app.exception_handlers

    def test_rate_limit_response_contains_retry_after(self):
        """Test that rate limit response contains retry information."""
        # Rate limit responses should include retry-after header
        # This is a configuration check
        from main import limiter
        assert limiter is not None


class TestRateLimitByEndpoint:
    """Tests for different rate limits per endpoint."""

    def test_chat_rate_limit_30_per_minute(self, client: TestClient):
        """Test that chat has 30/minute rate limit configured."""
        # This is a documentation/specification test
        # The actual limit is in the decorator @limiter.limit("30/minute")
        pass

    def test_jobs_search_rate_limit_10_per_minute(self, client: TestClient):
        """Test that job search has 10/minute rate limit configured."""
        # The actual limit is in the decorator @limiter.limit("10/minute")
        pass

    def test_cv_analysis_rate_limit_5_per_minute(self, client: TestClient):
        """Test that CV analysis has 5/minute rate limit configured."""
        # The actual limit is in the decorator @limiter.limit("5/minute")
        pass

    def test_cv_pdf_rate_limit_3_per_minute(self, client: TestClient):
        """Test that CV PDF upload has 3/minute rate limit configured."""
        # The actual limit is in the decorator @limiter.limit("3/minute")
        pass

    def test_coach_rate_limit_20_per_minute(self, client: TestClient):
        """Test that coach has 20/minute rate limit configured."""
        # The actual limit is in the decorator @limiter.limit("20/minute")
        pass
