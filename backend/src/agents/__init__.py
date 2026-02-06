"""
Agents Module
==============
Deep LangChain Agents Architecture (No LangGraph)

Each main agent orchestrates multiple specialized sub-agents.
"""

from src.agents.base import BaseAgent, BaseTool
from src.agents.coach import CareerCoachAgent
from src.agents.job_scout import JobScoutAgent
from src.agents.cv_analyzer import CVAnalyzerAgent
from src.agents.cv_adapter import CVAdapterAgent

__all__ = [
    "BaseAgent",
    "BaseTool",
    "CareerCoachAgent",
    "JobScoutAgent",
    "CVAnalyzerAgent",
    "CVAdapterAgent",
]
