"""
Unit tests for CV analysis API endpoints.
"""
import pytest
from fastapi.testclient import TestClient


class TestAnalyzeCVEndpoint:
    """Tests for /api/analyze-cv endpoint."""

    def test_analyze_cv_valid_request(self, client: TestClient, sample_cv_text: str):
        """Test CV analysis with valid CV text."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "fr"
            }
        )
        assert response.status_code == 200

    def test_analyze_cv_returns_success(self, client: TestClient, sample_cv_text: str):
        """Test that CV analysis returns success flag."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "fr"
            }
        )
        data = response.json()
        assert "success" in data

    def test_analyze_cv_missing_cv_text(self, client: TestClient):
        """Test CV analysis without cv_text."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "language": "fr"
            }
        )
        assert response.status_code == 422

    def test_analyze_cv_text_too_short(self, client: TestClient):
        """Test CV analysis with cv_text too short."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": "Too short",  # Min is 50 chars
                "language": "fr"
            }
        )
        assert response.status_code == 422

    def test_analyze_cv_with_job_description(
        self, client: TestClient, sample_cv_text: str, sample_job_description: str
    ):
        """Test CV analysis with job description for matching."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "job_description": sample_job_description,
                "language": "fr"
            }
        )
        assert response.status_code == 200

    def test_analyze_cv_default_language(self, client: TestClient, sample_cv_text: str):
        """Test that CV analysis defaults to French."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text
            }
        )
        assert response.status_code == 200

    def test_analyze_cv_english_language(self, client: TestClient, sample_cv_text: str):
        """Test CV analysis with English language."""
        response = client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "en"
            }
        )
        assert response.status_code == 200


class TestAnalyzeCVPDFEndpoint:
    """Tests for /api/analyze-cv-pdf endpoint."""

    def test_analyze_cv_pdf_missing_file(self, client: TestClient):
        """Test PDF analysis without file."""
        response = client.post("/api/analyze-cv-pdf")
        assert response.status_code == 422

    def test_analyze_cv_pdf_wrong_file_type(self, client: TestClient):
        """Test PDF analysis with wrong file type."""
        # Create a fake text file
        response = client.post(
            "/api/analyze-cv-pdf",
            files={"file": ("test.txt", b"This is a text file", "text/plain")}
        )
        data = response.json()
        assert data["success"] is False
        assert "format" in data["error"].lower() or "pdf" in data["error"].lower()

    def test_analyze_cv_pdf_with_language(self, client: TestClient):
        """Test PDF analysis with language parameter."""
        # This will fail because it's not a real PDF, but we test the parameter handling
        response = client.post(
            "/api/analyze-cv-pdf",
            files={"file": ("test.pdf", b"%PDF-1.4 fake pdf", "application/pdf")},
            data={"language": "en"}
        )
        # Will likely fail due to invalid PDF, but endpoint should accept the request
        assert response.status_code == 200


class TestCoachEndpoint:
    """Tests for /api/coach endpoint."""

    def test_coach_valid_request(self, client: TestClient, valid_session_id: str):
        """Test coach endpoint with valid parameters."""
        response = client.post(
            "/api/coach",
            json={
                "message": "Comment améliorer mon CV ?",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 200

    def test_coach_returns_response(self, client: TestClient, valid_session_id: str):
        """Test that coach returns a response."""
        response = client.post(
            "/api/coach",
            json={
                "message": "Bonjour",
                "session_id": valid_session_id
            }
        )
        data = response.json()
        assert "response" in data

    def test_coach_missing_message(self, client: TestClient, valid_session_id: str):
        """Test coach without message."""
        response = client.post(
            "/api/coach",
            json={
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422

    def test_coach_missing_session_id(self, client: TestClient):
        """Test coach without session_id."""
        response = client.post(
            "/api/coach",
            json={
                "message": "Test message"
            }
        )
        assert response.status_code == 422

    def test_coach_invalid_session_id(self, client: TestClient):
        """Test coach with invalid session_id format."""
        response = client.post(
            "/api/coach",
            json={
                "message": "Test message",
                "session_id": "invalid-uuid"
            }
        )
        assert response.status_code == 422

    def test_coach_message_too_long(self, client: TestClient, valid_session_id: str):
        """Test coach with message exceeding max length."""
        response = client.post(
            "/api/coach",
            json={
                "message": "x" * 2500,  # Max is 2000
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422

    def test_coach_empty_message(self, client: TestClient, valid_session_id: str):
        """Test coach with empty message."""
        response = client.post(
            "/api/coach",
            json={
                "message": "",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422
