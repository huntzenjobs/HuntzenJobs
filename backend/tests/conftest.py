"""
Pytest Configuration
====================
Shared fixtures for HuntZen backend tests.

IMPORTANT: This file loads .env BEFORE any imports to ensure
environment variables are available when settings.py is first imported.
"""

from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# LOAD .env BEFORE ANY OTHER IMPORTS (critical for settings.py caching)
# ═══════════════════════════════════════════════════════════════════════════════
from dotenv import load_dotenv

# Load environment variables from root .env
root_dir = Path(__file__).parent.parent.parent
env_file = root_dir / ".env"
if env_file.exists():
    load_dotenv(env_file, override=True)

# Also try .env.test for test-specific overrides (but don't override GROQ_API_KEY)
env_test_file = root_dir / ".env.test"
if env_test_file.exists():
    # Load test env but don't override API keys from main .env
    load_dotenv(env_test_file, override=False)

# ═══════════════════════════════════════════════════════════════════════════════
# NOW import the rest (settings will pick up env vars)
# ═══════════════════════════════════════════════════════════════════════════════
import pytest

from src.agents.coach.main_agent import CareerCoachAgent
from src.agents.cv_analyzer.main_agent import CVAnalyzerAgent
from src.agents.job_scout.main_agent import JobScoutAgent


@pytest.fixture
def coach_agent():
    """Fixture for CareerCoachAgent."""
    return CareerCoachAgent()

@pytest.fixture
def cv_analyzer():
    """Fixture for CVAnalyzerAgent."""
    return CVAnalyzerAgent()

@pytest.fixture
def job_scout():
    """Fixture for JobScoutAgent."""
    return JobScoutAgent()
