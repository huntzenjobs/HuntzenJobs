"""
Integration tests for coach conversation workflow.
Tests multi-turn conversations and session persistence.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock


@pytest.mark.integration
class TestCoachConversationWorkflow:
    """Integration tests for coach conversation workflow."""

    def test_single_message_conversation(
        self,
        integration_client: TestClient,
        unique_session_id: str,
        mock_huntzen_app
    ):
        """Test single message conversation with coach."""
        response = integration_client.post(
            "/api/coach",
            json={
                "message": "Comment améliorer mon CV ?",
                "session_id": unique_session_id
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "response" in data

    def test_multi_turn_conversation(
        self,
        integration_client: TestClient,
        unique_session_id: str,
        mock_huntzen_app
    ):
        """Test multi-turn conversation with coach."""
        # Turn 1: Initial question
        response1 = integration_client.post(
            "/api/coach",
            json={
                "message": "Je cherche un emploi dans la data",
                "session_id": unique_session_id
            }
        )
        assert response1.status_code == 200

        # Turn 2: Follow-up question
        response2 = integration_client.post(
            "/api/coach",
            json={
                "message": "Quelles compétences dois-je avoir ?",
                "session_id": unique_session_id
            }
        )
        assert response2.status_code == 200

        # Turn 3: Another follow-up
        response3 = integration_client.post(
            "/api/coach",
            json={
                "message": "Et pour le salaire ?",
                "session_id": unique_session_id
            }
        )
        assert response3.status_code == 200

    def test_coach_with_freemium_time_limit(
        self,
        integration_client: TestClient,
        unique_session_id: str,
        unique_client_id: str,
        clean_usage,
        mock_huntzen_app
    ):
        """Test coach respects time-based freemium limit."""
        # Step 1: Check initial usage (limit is 300 seconds = 5 minutes)
        check_response = integration_client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "coach"
            }
        )
        assert check_response.json()["limit"] == 300
        assert check_response.json()["allowed"] is True

        # Step 2: Simulate using 60 seconds
        integration_client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "coach",
                "amount": 60
            }
        )

        # Step 3: Check remaining time
        check_response_2 = integration_client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "coach"
            }
        )
        assert check_response_2.json()["current"] == 60
        assert check_response_2.json()["remaining"] == 240  # 300 - 60

        # Step 4: Use remaining time
        integration_client.post(
            "/api/increment-usage",
            json={
                "client_id": unique_client_id,
                "feature": "coach",
                "amount": 240
            }
        )

        # Step 5: Verify limit reached
        check_response_3 = integration_client.post(
            "/api/check-usage",
            json={
                "client_id": unique_client_id,
                "feature": "coach"
            }
        )
        assert check_response_3.json()["allowed"] is False


@pytest.mark.integration
class TestMainChatWorkflow:
    """Integration tests for main chat workflow."""

    def test_chat_creates_session(
        self,
        integration_client: TestClient,
        unique_session_id: str,
        mock_huntzen_app
    ):
        """Test that chat creates and uses session."""
        from main import sessions

        # Initially no session
        assert unique_session_id not in sessions

        # Send message
        response = integration_client.post(
            "/chat",
            json={
                "message": "Bonjour",
                "session_id": unique_session_id
            }
        )

        assert response.status_code == 200

        # Session should now exist
        assert unique_session_id in sessions

    def test_chat_response_structure(
        self,
        integration_client: TestClient,
        unique_session_id: str,
        mock_huntzen_app
    ):
        """Test that chat response has correct structure."""
        response = integration_client.post(
            "/chat",
            json={
                "message": "Je cherche un emploi",
                "session_id": unique_session_id
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Verify response structure
        assert "response" in data
        assert "agent" in data
        assert "jobs" in data
        assert isinstance(data["jobs"], list)

    def test_session_reset_and_new_conversation(
        self,
        integration_client: TestClient,
        unique_session_id: str,
        mock_huntzen_app
    ):
        """Test session reset and starting new conversation."""
        # Start conversation
        integration_client.post(
            "/chat",
            json={
                "message": "Premier message",
                "session_id": unique_session_id
            }
        )

        # Reset session
        reset_response = integration_client.post(
            "/reset",
            json={"session_id": unique_session_id}
        )
        assert reset_response.status_code == 200
        assert reset_response.json()["status"] == "success"

        # Start new conversation
        response = integration_client.post(
            "/chat",
            json={
                "message": "Nouveau message après reset",
                "session_id": unique_session_id
            }
        )
        assert response.status_code == 200


@pytest.mark.integration
class TestCoachErrorHandling:
    """Integration tests for coach error handling."""

    def test_coach_with_empty_message(
        self,
        integration_client: TestClient,
        unique_session_id: str
    ):
        """Test coach with empty message is rejected."""
        response = integration_client.post(
            "/api/coach",
            json={
                "message": "",
                "session_id": unique_session_id
            }
        )
        assert response.status_code == 422

    def test_coach_with_very_long_message(
        self,
        integration_client: TestClient,
        unique_session_id: str
    ):
        """Test coach with message exceeding limit is rejected."""
        response = integration_client.post(
            "/api/coach",
            json={
                "message": "x" * 2001,  # Max is 2000
                "session_id": unique_session_id
            }
        )
        assert response.status_code == 422

    def test_coach_handles_graph_error(
        self,
        integration_client: TestClient,
        unique_session_id: str
    ):
        """Test coach handles graph execution errors gracefully."""
        with patch('main.huntzen_app') as mock_app:
            mock_app.ainvoke = AsyncMock(side_effect=Exception("Graph error"))

            response = integration_client.post(
                "/api/coach",
                json={
                    "message": "Test",
                    "session_id": unique_session_id
                }
            )

            # Should return error response, not crash
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False or "error" in data


@pytest.mark.integration
class TestConversationContextPersistence:
    """Integration tests for conversation context persistence."""

    def test_session_maintains_message_history(
        self,
        integration_client: TestClient,
        unique_session_id: str,
        mock_huntzen_app
    ):
        """Test that session maintains message history."""
        from main import sessions

        # Send multiple messages
        messages = ["Premier message", "Deuxième message", "Troisième message"]

        for msg in messages:
            integration_client.post(
                "/chat",
                json={
                    "message": msg,
                    "session_id": unique_session_id
                }
            )

        # Check session has accumulated messages
        session = sessions.get(unique_session_id)
        assert session is not None
        # Should have user messages (HumanMessage) for each input
        assert len(session.get("messages", [])) >= len(messages)

    def test_different_sessions_are_isolated(
        self,
        integration_client: TestClient,
        mock_huntzen_app
    ):
        """Test that different sessions are isolated."""
        from main import sessions
        import uuid

        session1 = str(uuid.uuid4())
        session2 = str(uuid.uuid4())

        # Message to session 1
        integration_client.post(
            "/chat",
            json={
                "message": "Message pour session 1",
                "session_id": session1
            }
        )

        # Message to session 2
        integration_client.post(
            "/chat",
            json={
                "message": "Message pour session 2",
                "session_id": session2
            }
        )

        # Sessions should be separate - each session ID maps to its own state
        assert session1 in sessions
        assert session2 in sessions
        # Verify they are different keys (different session IDs)
        assert session1 != session2
        # Verify both sessions have their own state objects (identity check)
        assert sessions[session1] is not sessions[session2]
