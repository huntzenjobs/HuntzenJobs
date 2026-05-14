"""
Job Providers Module
=====================
Multi-source job aggregation system.
"""

from src.services.job_providers.adzuna import AdzunaProvider
from src.services.job_providers.aggregator import aggregate_jobs
from src.services.job_providers.base import BaseJobProvider
from src.services.job_providers.careerjet import CareerjetProvider
from src.services.job_providers.france_travail import FranceTravailProvider
from src.services.job_providers.jooble import JoobleProvider
from src.services.job_providers.jsearch import JSearchProvider
from src.services.job_providers.le_forem import LeForemProvider
from src.services.job_providers.remoteok import RemoteOKProvider
from src.services.job_providers.serpapi import SerpAPIProvider

__all__ = [
    "BaseJobProvider",
    "AdzunaProvider",
    "CareerjetProvider",
    "SerpAPIProvider",
    "RemoteOKProvider",
    "JSearchProvider",
    "FranceTravailProvider",
    "JoobleProvider",
    "LeForemProvider",
    "aggregate_jobs",
]

