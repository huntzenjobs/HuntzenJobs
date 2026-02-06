"""
Unit tests for session management functionality.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import time


class TestSessionCreation:
    """Tests for session creation."""

    def test_session_created_on_first_chat(self, fresh_client: TestClient, clean_sessions):
        """Test that a new session is created on first chat message."""
        from main import sessions

        session_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

        # Initially no sessions
        assert session_id not in sessions

        response = fresh_client.post(
            "/chat",
            json={
                "message": "Hello",
                "session_id": session_id
            }
        )

        assert response.status_code == 200
        # Session should now exist
        assert session_id in sessions

    def test_session_initial_state(self, fresh_client: TestClient, clean_sessions):
        """Test that new session has correct initial state."""
        from main import sessions

        session_id = "11111111-2222-3333-4444-555555555555"

        fresh_client.post(
            "/chat",
            json={
                "message": "Bonjour",
                "session_id": session_id
            }
        )

        # Check session structure
        session = sessions.get(session_id)
        assert session is not None
        assert "messages" in session
        assert "user_language" in session

    def test_session_timestamp_updated(self, fresh_client: TestClient, clean_sessions):
        """Test that session timestamp is updated on message."""
        from main import session_timestamps

        session_id = "66666666-7777-8888-9999-aaaaaaaaaaaa"

        fresh_client.post(
            "/chat",
            json={
                "message": "Test",
                "session_id": session_id
            }
        )

        assert session_id in session_timestamps
        timestamp = session_timestamps[session_id]
        assert timestamp > 0


class TestSessionPersistence:
    """Tests for session persistence."""

    def test_session_maintains_messages(self, fresh_client: TestClient, clean_sessions):
        """Test that session maintains message history."""
        from main import sessions

        session_id = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"

        # First message
        fresh_client.post(
            "/chat",
            json={
                "message": "Premier message",
                "session_id": session_id
            }
        )

        # Second message
        fresh_client.post(
            "/chat",
            json={
                "message": "Deuxième message",
                "session_id": session_id
            }
        )

        session = sessions.get(session_id)
        # Should have at least 2 user messages
        assert len(session["messages"]) >= 2

    def test_session_reuses_existing_state(self, fresh_client: TestClient, clean_sessions):
        """Test that existing session is reused, not recreated."""
        from main import sessions

        session_id = "cccccccc-dddd-eeee-ffff-000000000000"

        # Create session
        fresh_client.post(
            "/chat",
            json={
                "message": "First",
                "session_id": session_id
            }
        )

        first_messages_count = len(sessions[session_id]["messages"])

        # Add another message
        fresh_client.post(
            "/chat",
            json={
                "message": "Second",
                "session_id": session_id
            }
        )

        # Messages should have increased, not reset
        assert len(sessions[session_id]["messages"]) > first_messages_count


class TestSessionReset:
    """Tests for session reset."""

    def test_reset_removes_session(self, fresh_client: TestClient, clean_sessions):
        """Test that reset removes the session."""
        from main import sessions

        session_id = "dddddddd-eeee-ffff-0000-111111111111"

        # Create session
        fresh_client.post(
            "/chat",
            json={
                "message": "Hello",
                "session_id": session_id
            }
        )

        assert session_id in sessions

        # Reset session
        response = fresh_client.post(
            "/reset",
            json={"session_id": session_id}
        )

        assert response.status_code == 200
        assert session_id not in sessions

    def test_reset_removes_timestamp(self, fresh_client: TestClient, clean_sessions):
        """Test that reset removes session timestamp."""
        from main import sessions, session_timestamps

        session_id = "eeeeeeee-ffff-0000-1111-222222222222"

        # Create session
        fresh_client.post(
            "/chat",
            json={
                "message": "Hello",
                "session_id": session_id
            }
        )

        assert session_id in session_timestamps

        # Reset session
        fresh_client.post(
            "/reset",
            json={"session_id": session_id}
        )

        assert session_id not in session_timestamps

    def test_reset_nonexistent_session_succeeds(self, fresh_client: TestClient, clean_sessions):
        """Test that resetting non-existent session still succeeds."""
        response = fresh_client.post(
            "/reset",
            json={"session_id": "ffffffff-0000-1111-2222-333333333333"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"


class TestSessionCleanup:
    """Tests for session cleanup functionality."""

    def test_cleanup_function_exists(self):
        """Test that cleanup function is defined."""
        from main import cleanup_expired_sessions
        assert callable(cleanup_expired_sessions)

    def test_session_ttl_is_configured(self):
        """Test that SESSION_TTL is configured."""
        from main import SESSION_TTL
        assert SESSION_TTL > 0
        assert SESSION_TTL == 3600  # 1 hour

    def test_cleanup_removes_expired_sessions(self, clean_sessions):
        """Test that cleanup removes sessions older than TTL."""
        from main import sessions, session_timestamps, cleanup_expired_sessions, SESSION_TTL

        # Add an "old" session
        old_session_id = "old-session-id-00000000000000000"
        sessions[old_session_id] = {"messages": [], "user_language": "fr"}
        session_timestamps[old_session_id] = time.time() - SESSION_TTL - 100  # Expired

        # Add a "new" session
        new_session_id = "new-session-id-11111111111111111"
        sessions[new_session_id] = {"messages": [], "user_language": "fr"}
        session_timestamps[new_session_id] = time.time()  # Not expired

        # Run cleanup
        cleanup_expired_sessions()

        # Old session should be removed
        assert old_session_id not in sessions
        assert old_session_id not in session_timestamps

        # New session should remain
        assert new_session_id in sessions
        assert new_session_id in session_timestamps

    def test_cleanup_called_on_chat(self, fresh_client: TestClient, clean_sessions):
        """Test that cleanup is called during chat requests."""
        with patch('main.cleanup_expired_sessions') as mock_cleanup:
            fresh_client.post(
                "/chat",
                json={
                    "message": "Test",
                    "session_id": "00000000-1111-2222-3333-444444444444"
                }
            )
            # Cleanup should be called
            mock_cleanup.assert_called()


class TestSessionValidation:
    """Tests for session ID validation."""

    def test_invalid_session_id_format_rejected(self, client: TestClient):
        """Test that invalid session ID format is rejected."""
        response = client.post(
            "/chat",
            json={
                "message": "Test",
                "session_id": "invalid-format"
            }
        )
        assert response.status_code == 422

    def test_non_uuid_session_id_rejected(self, client: TestClient):
        """Test that non-UUID session ID is rejected."""
        response = client.post(
            "/chat",
            json={
                "message": "Test",
                "session_id": "not_a_uuid_at_all"
            }
        )
        assert response.status_code == 422

    def test_valid_uuid_session_id_accepted(self, client: TestClient, valid_session_id: str):
        """Test that valid UUID session ID is accepted."""
        response = client.post(
            "/chat",
            json={
                "message": "Test",
                "session_id": valid_session_id
            }
        )
        assert response.status_code == 200
