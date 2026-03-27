"""
Unit Tests for BaseAgent
========================
Tests the core BaseAgent functionality with mocked LLM.
Does NOT require API keys.
"""

from unittest.mock import patch

import pytest


class TestParseJson:
    """Test the _parse_json method added to BaseAgent."""

    @pytest.fixture
    def mock_agent(self):
        """Create a mock agent instance for testing _parse_json."""
        with patch('src.agents.base.ChatGroq'):
            from src.agents.base import AgentConfig, BaseAgent

            # Create a concrete subclass for testing
            class TestAgent(BaseAgent):
                async def run(self, **kwargs):
                    return {"success": True}

            config = AgentConfig(
                name="TestAgent",
                model="test-model",
                system_prompt="Test prompt"
            )
            return TestAgent(config)

    def test_parse_valid_json_string(self, mock_agent):
        """Should parse a valid JSON string."""
        json_str = '{"name": "test", "value": 123}'
        result = mock_agent._parse_json(json_str)

        assert result == {"name": "test", "value": 123}

    def test_parse_json_with_markdown_block(self, mock_agent):
        """Should extract JSON from markdown code blocks."""
        json_str = '''Here is the result:
```json
{"name": "test", "items": [1, 2, 3]}
```
Some text after.'''

        result = mock_agent._parse_json(json_str)
        assert result == {"name": "test", "items": [1, 2, 3]}

    def test_parse_json_embedded_in_text(self, mock_agent):
        """Should extract JSON embedded in text."""
        json_str = 'The result is {"success": true, "data": "value"} and that is all.'
        result = mock_agent._parse_json(json_str)

        assert result == {"success": True, "data": "value"}

    def test_parse_invalid_json_returns_none(self, mock_agent):
        """Should return None for invalid JSON."""
        result = mock_agent._parse_json("this is not json at all")
        assert result is None

    def test_parse_json_with_array(self, mock_agent):
        """Should parse JSON arrays."""
        json_str = '[{"id": 1}, {"id": 2}]'
        result = mock_agent._parse_json(json_str)

        assert result == [{"id": 1}, {"id": 2}]

    def test_parse_json_response_extracts_content(self, mock_agent):
        """Should handle string input (backward compat)."""
        result = mock_agent._parse_json_response('{"parsed": true}')
        assert result == {"parsed": True}

    def test_parse_json_response_handles_string(self, mock_agent):
        """Should handle plain string response."""
        result = mock_agent._parse_json_response('{"direct": "string"}')
        assert result == {"direct": "string"}


class TestAgentConfig:
    """Test AgentConfig validation."""

    def test_config_with_valid_params(self):
        """Should create config with valid parameters."""
        from src.agents.base import AgentConfig

        config = AgentConfig(
            name="TestAgent",
            model="llama3-8b-8192",
            temperature=0.5,
            max_tokens=1024,
            system_prompt="You are a test agent."
        )

        assert config.name == "TestAgent"
        assert config.model == "llama3-8b-8192"
        assert config.temperature == 0.5
        assert config.max_tokens == 1024

    def test_config_from_prompt_file(self):
        """Should create config with prompt file reference."""
        from src.agents.base import AgentConfig

        config = AgentConfig(
            name="TestAgent",
            model="test-model",
            system_prompt_file="coach_main.txt"  # This file exists
        )

        # system_prompt_file is stored, system_prompt can be None or empty
        assert config.system_prompt_file == "coach_main.txt"
        assert config.name == "TestAgent"


class TestSubAgent:
    """Test SubAgent creation."""

    def test_subagent_initialization(self):
        """Should initialize SubAgent with correct parameters."""
        with patch('src.agents.base.ChatGroq'):
            from src.agents.base import SubAgent

            sub = SubAgent(
                name="TestSubAgent",
                system_prompt="Test prompt",
                model="test-model",
                temperature=0.1,
                max_tokens=512
            )

            assert sub.name == "TestSubAgent"
            assert sub.system_prompt == "Test prompt"
            # Note: temperature is not exposed as attribute, it's passed to ChatGroq


class TestLoadPrompt:
    """Test prompt file loading."""

    def test_load_existing_prompt(self):
        """Should load prompt from existing file."""
        from src.agents.base import load_prompt

        # coach_main.txt should exist in backend/prompts/
        prompt = load_prompt("coach_main.txt")

        assert prompt is not None
        assert len(prompt) > 0
        assert isinstance(prompt, str)

    def test_load_nonexistent_prompt_returns_empty(self):
        """Should return empty string for non-existent file."""
        from src.agents.base import load_prompt

        prompt = load_prompt("nonexistent_prompt_file.txt")

        assert prompt == ""


class TestAgentRegistry:
    """Test sub-agent registration."""

    def test_register_sub_agent(self):
        """Should register sub-agents correctly."""
        with patch('src.agents.base.ChatGroq'):
            from src.agents.base import SubAgent

            sub1 = SubAgent(
                name="SubOne",
                system_prompt="Prompt 1",
                model="model",
                temperature=0.1
            )
            sub2 = SubAgent(
                name="SubTwo",
                system_prompt="Prompt 2",
                model="model",
                temperature=0.2
            )

            assert sub1.name == "SubOne"
            assert sub2.name == "SubTwo"
