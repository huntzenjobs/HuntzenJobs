"""
Services Module
================
External service integrations and data providers.
"""

from src.services.job_providers import (
    BaseJobProvider,
    AdzunaProvider,
    SerpAPIProvider,
    RemoteOKProvider,
    aggregate_jobs,
)

__all__ = [
    "BaseJobProvider",
    "AdzunaProvider",
    "SerpAPIProvider",
    "RemoteOKProvider",
    "aggregate_jobs",
]
