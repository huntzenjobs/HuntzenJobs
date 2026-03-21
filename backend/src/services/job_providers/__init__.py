"""
Job Providers Module
=====================
Multi-source job aggregation system.
"""

from src.services.job_providers.adzuna import AdzunaProvider
from src.services.job_providers.aggregator import aggregate_jobs
from src.services.job_providers.base import BaseJobProvider
from src.services.job_providers.france_travail import FranceTravailProvider
from src.services.job_providers.jsearch import JSearchProvider
from src.services.job_providers.remoteok import RemoteOKProvider
from src.services.job_providers.serpapi import SerpAPIProvider

__all__ = [
    "BaseJobProvider",
    "AdzunaProvider",
    "SerpAPIProvider",
    "RemoteOKProvider",
    "JSearchProvider",
    "FranceTravailProvider",
    "aggregate_jobs",
]

