"""
Pytest Configuration
====================
Shared fixtures for HuntZen backend tests.
"""

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
