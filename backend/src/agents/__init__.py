"""
Agents Module
==============
Deep LangChain Agents Architecture (No LangGraph)

Each main agent orchestrates multiple specialized sub-agents.
"""

from src.agents.base import BaseAgent, BaseTool
from src.agents.branding import BrandingAgent
from src.agents.coach import CareerCoachAgent
from src.agents.cv_adapter import CVAdapterAgent
from src.agents.cv_analyzer import CVAnalyzerAgent
from src.agents.job_scout import JobScoutAgent

__all__ = [
    "BaseAgent",
    "BaseTool",
    "CareerCoachAgent",
    "JobScoutAgent",
    "CVAnalyzerAgent",
    "CVAdapterAgent",
    "BrandingAgent",
]
