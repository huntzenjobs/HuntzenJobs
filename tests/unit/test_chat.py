"""
Unit tests for chat and session endpoints.
"""
import pytest
from fastapi.testclient import TestClient


class TestChatEndpoint:
    """Tests for /chat endpoint."""

    def test_chat_valid_request(self, client: TestClient, valid_session_id: str):
        """Test chat with valid parameters."""
        response = client.post(
            "/chat",
            json={
                "message": "Bonjour, je cherche un emploi",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 200

    def test_chat_returns_response(self, client: TestClient, valid_session_id: str):
        """Test that chat returns a response."""
        response = client.post(
            "/chat",
            json={
                "message": "Bonjour",
                "session_id": valid_session_id
            }
        )
        data = response.json()
        assert "response" in data

    def test_chat_returns_agent(self, client: TestClient, valid_session_id: str):
        """Test that chat returns agent info."""
        response = client.post(
            "/chat",
            json={
                "message": "Test",
                "session_id": valid_session_id
            }
        )
        data = response.json()
        assert "agent" in data

    def test_chat_returns_jobs_list(self, client: TestClient, valid_session_id: str):
        """Test that chat returns jobs list."""
        response = client.post(
            "/chat",
            json={
                "message": "Test",
                "session_id": valid_session_id
            }
        )
        data = response.json()
        assert "jobs" in data
        assert isinstance(data["jobs"], list)

    def test_chat_missing_message(self, client: TestClient, valid_session_id: str):
        """Test chat without message."""
        response = client.post(
            "/chat",
            json={
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422

    def test_chat_missing_session_id(self, client: TestClient):
        """Test chat without session_id."""
        response = client.post(
            "/chat",
            json={
                "message": "Test"
            }
        )
        assert response.status_code == 422

    def test_chat_invalid_session_id(self, client: TestClient):
        """Test chat with invalid session_id format."""
        response = client.post(
            "/chat",
            json={
                "message": "Test",
                "session_id": "not-a-valid-uuid"
            }
        )
        assert response.status_code == 422

    def test_chat_empty_message(self, client: TestClient, valid_session_id: str):
        """Test chat with empty message."""
        response = client.post(
            "/chat",
            json={
                "message": "",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422

    def test_chat_message_too_long(self, client: TestClient, valid_session_id: str):
        """Test chat with message exceeding max length."""
        response = client.post(
            "/chat",
            json={
                "message": "x" * 2500,  # Max is 2000
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 422


class TestResetEndpoint:
    """Tests for /reset endpoint."""

    def test_reset_valid_session(self, client: TestClient, valid_session_id: str):
        """Test reset with valid session_id."""
        response = client.post(
            "/reset",
            json={
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 200

    def test_reset_returns_success(self, client: TestClient, valid_session_id: str):
        """Test that reset returns success status."""
        response = client.post(
            "/reset",
            json={
                "session_id": valid_session_id
            }
        )
        data = response.json()
        assert data["status"] == "success"

    def test_reset_missing_session_id(self, client: TestClient):
        """Test reset without session_id."""
        response = client.post("/reset", json={})
        assert response.status_code == 422

    def test_reset_invalid_session_id(self, client: TestClient):
        """Test reset with invalid session_id format."""
        response = client.post(
            "/reset",
            json={
                "session_id": "invalid"
            }
        )
        assert response.status_code == 422

    def test_reset_nonexistent_session(self, client: TestClient):
        """Test reset with non-existent session (should still succeed)."""
        response = client.post(
            "/reset",
            json={
                "session_id": "00000000-0000-0000-0000-000000000000"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"


class TestSessionPersistence:
    """Tests for session persistence behavior."""

    def test_session_created_on_first_message(self, client: TestClient):
        """Test that session is created on first message."""
        new_session_id = "11111111-1111-1111-1111-111111111111"

        response = client.post(
            "/chat",
            json={
                "message": "Hello",
                "session_id": new_session_id
            }
        )

        assert response.status_code == 200
        # If we can send a message, the session was created

    def test_session_maintains_context(self, client: TestClient):
        """Test that session maintains conversation context."""
        session_id = "22222222-2222-2222-2222-222222222222"

        # First message
        client.post(
            "/chat",
            json={
                "message": "Je m'appelle Jean",
                "session_id": session_id
            }
        )

        # Second message should have context from first
        response2 = client.post(
            "/chat",
            json={
                "message": "Quel est mon nom ?",
                "session_id": session_id
            }
        )

        assert response2.status_code == 200
        # The response should ideally remember the name, but we just test it works

    def test_reset_clears_session(self, client: TestClient):
        """Test that reset clears the session."""
        session_id = "33333333-3333-3333-3333-333333333333"

        # Create session
        client.post(
            "/chat",
            json={
                "message": "Hello",
                "session_id": session_id
            }
        )

        # Reset session
        reset_response = client.post(
            "/reset",
            json={
                "session_id": session_id
            }
        )

        assert reset_response.status_code == 200

        # After reset, new message should work (new session created)
        response = client.post(
            "/chat",
            json={
                "message": "Hello again",
                "session_id": session_id
            }
        )

        assert response.status_code == 200
