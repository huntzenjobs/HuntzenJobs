"""
Job Providers Module
=====================
Multi-source job aggregation system.
"""

from src.services.job_providers.base import BaseJobProvider
from src.services.job_providers.adzuna import AdzunaProvider
from src.services.job_providers.serpapi import SerpAPIProvider
from src.services.job_providers.remoteok import RemoteOKProvider
from src.services.job_providers.aggregator import aggregate_jobs

__all__ = [
    "BaseJobProvider",
    "AdzunaProvider",
    "SerpAPIProvider",
    "RemoteOKProvider",
    "aggregate_jobs",
]
