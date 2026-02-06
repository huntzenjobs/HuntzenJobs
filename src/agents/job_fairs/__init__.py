"""
Job Fairs Agent Module
=======================
Agent for finding and filtering job fairs/events in France.
"""

from src.agents.job_fairs.main_agent import (
    JobFairsAgent,
    get_job_fairs_agent,
    search_job_fairs,
)

__all__ = [
    "JobFairsAgent",
    "get_job_fairs_agent",
    "search_job_fairs",
]
