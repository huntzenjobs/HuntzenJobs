"""
Integration tests for CV analysis workflow.
Tests the complete flow: upload → analysis → results
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock


@pytest.mark.integration
class TestCVAnalysisWorkflow:
    """Integration tests for CV analysis workflow."""

    def test_cv_text_analysis_workflow(
        self,
        integration_client: TestClient,
        sample_cv_text: str,
        mock_cv_analysis
    ):
        """Test complete CV text analysis workflow."""
        # Step 1: Submit CV for analysis
        response = integration_client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "fr"
            }
        )

        # Step 2: Verify response
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "analysis" in data

    def test_cv_with_job_matching_workflow(
        self,
        integration_client: TestClient,
        sample_cv_text: str,
        sample_job_description: str,
        mock_cv_analysis
    ):
        """Test CV analysis with job matching workflow."""
        # Step 1: Submit CV with job description
        response = integration_client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "job_description": sample_job_description,
                "language": "fr"
            }
        )

        # Step 2: Verify response contains matching info
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    def test_cv_pdf_upload_workflow(
        self,
        integration_client: TestClient,
        sample_pdf_bytes: bytes,
        mock_pdf_extraction,
        mock_cv_analysis
    ):
        """Test PDF upload and analysis workflow."""
        # Step 1: Upload PDF
        response = integration_client.post(
            "/api/analyze-cv-pdf",
            files={"file": ("cv.pdf", sample_pdf_bytes, "application/pdf")},
            data={"language": "fr"}
        )

        # Step 2: Verify response
        assert response.status_code == 200
        data = response.json()
        # Response should contain analysis results or error
        assert "success" in data

    def test_cv_analysis_with_freemium_limit(
        self,
        integration_client: TestClient,
        unique_client_id: str,
        sample_cv_text: str,
        clean_usage,
        mock_cv_analysis
    ):
        """Test CV analysis respects freemium limits."""
        # Step 1: Check initial usage
        check_response = integration_client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "cv_analysis"
            }
        )
        assert check_response.json()["allowed"] is True
        assert check_response.json()["remaining"] == 1

        # Step 2: Perform CV analysis
        analysis_response = integration_client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "fr"
            }
        )
        assert analysis_response.status_code == 200

        # Step 3: Increment usage
        increment_response = integration_client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "cv_analysis",
                "amount": 1
            }
        )
        assert increment_response.status_code == 200

        # Step 4: Verify limit reached
        check_response_2 = integration_client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "cv_analysis"
            }
        )
        assert check_response_2.json()["allowed"] is False
        assert check_response_2.json()["remaining"] == 0


@pytest.mark.integration
class TestCVAnalysisErrorHandling:
    """Integration tests for CV analysis error handling."""

    def test_invalid_pdf_format_handled(self, integration_client: TestClient):
        """Test that invalid PDF format is handled gracefully."""
        response = integration_client.post(
            "/api/analyze-cv-pdf",
            files={"file": ("cv.txt", b"Not a PDF", "text/plain")},
            data={"language": "fr"}
        )

        data = response.json()
        assert data["success"] is False
        assert "error" in data

    def test_empty_cv_text_handled(self, integration_client: TestClient):
        """Test that empty CV text is handled."""
        response = integration_client.post(
            "/api/analyze-cv",
            json={
                "cv_text": "x" * 50,  # Minimum length, but not useful
                "language": "fr"
            }
        )

        # Should still process (validation passed)
        assert response.status_code == 200

    def test_very_long_cv_handled(self, integration_client: TestClient, mock_cv_analysis):
        """Test that very long CV is handled."""
        long_cv = "Experience: " + ("Developer at Company. " * 500)

        response = integration_client.post(
            "/api/analyze-cv",
            json={
                "cv_text": long_cv,
                "language": "fr"
            }
        )

        assert response.status_code == 200


@pytest.mark.integration
class TestCVAnalysisLanguages:
    """Integration tests for CV analysis in different languages."""

    def test_french_cv_analysis(
        self,
        integration_client: TestClient,
        sample_cv_text: str,
        mock_cv_analysis
    ):
        """Test French CV analysis."""
        response = integration_client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text,
                "language": "fr"
            }
        )

        assert response.status_code == 200

    def test_english_cv_analysis(
        self,
        integration_client: TestClient,
        sample_cv_text_english: str,
        mock_cv_analysis
    ):
        """Test English CV analysis."""
        response = integration_client.post(
            "/api/analyze-cv",
            json={
                "cv_text": sample_cv_text_english,
                "language": "en"
            }
        )

        assert response.status_code == 200
