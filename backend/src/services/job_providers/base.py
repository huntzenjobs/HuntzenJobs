"""
Base Job Provider
==================
Abstract base class for all job providers.
"""

import logging
from abc import ABC, abstractmethod
from collections.abc import Callable
from functools import wraps
from typing import Any

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Normalized contract type values used across all providers
NORMALIZED_CONTRACT_TYPES = {
    "CDI", "CDD", "Freelance", "Stage", "Alternance", "Interim", "Remote", "Temps partiel",
}


def normalize_contract_type(raw: str | None) -> str:
    """Normalize contract type from any provider to a standard value."""
    if not raw:
        return ""

    raw_lower = raw.lower().strip()

    # CDI / Permanent / Full-time (check partial first)
    if any(kw in raw_lower for kw in ["cdi", "permanent", "indéterminée", "indeterminee", "indefinite"]):
        if any(kw in raw_lower for kw in ["partiel", "partial", "part-time", "part time", "mi-temps"]):
            return "Temps partiel"
        return "CDI"

    # Full-time -> CDI (most full-time jobs are CDI)
    if any(kw in raw_lower for kw in [
        "plein temps", "full-time", "full time", "fulltime", "full--time",
        "à plein temps",
    ]):
        return "CDI"

    # Alternance (before CDD to avoid false match on "contrat")
    if any(kw in raw_lower for kw in [
        "alternance", "apprentissage", "apprenticeship", "work-study",
        "work study", "contrat pro",
    ]):
        return "Alternance"

    # Stage / Internship (before CDD to avoid "contract" false match)
    if any(kw in raw_lower for kw in ["stage", "intern", "internship", "stagiaire"]):
        return "Stage"

    # CDD / Contract / Fixed-term
    if any(kw in raw_lower for kw in [
        "cdd", "contract", "déterminée", "determinee", "fixed-term", "temporary",
    ]):
        if any(kw in raw_lower for kw in ["partiel", "partial", "part-time"]):
            return "Temps partiel"
        return "CDD"

    # Freelance
    if any(kw in raw_lower for kw in [
        "freelance", "indépendant", "independant", "profession libérale",
        "profession liberale", "prestataire", "contractor", "self-employed",
    ]):
        return "Freelance"

    # Interim
    if any(kw in raw_lower for kw in [
        "intérim", "interim", "travail temporaire", "temp work", "mis ",
    ]):
        return "Interim"

    # Temps partiel
    if any(kw in raw_lower for kw in [
        "temps partiel", "part-time", "part time", "mi-temps", "partiel",
    ]):
        return "Temps partiel"

    # Remote (exact match only)
    if raw_lower == "remote":
        return "Remote"

    return raw  # Garder la valeur originale si pas reconnue


def handle_provider_errors(func: Callable) -> Callable:
    """
    Decorator to handle common provider errors (DRY pattern).

    Catches:
    - httpx.TimeoutException
    - httpx.HTTPStatusError
    - General exceptions

    Returns empty list on error to allow graceful degradation.
    """
    @wraps(func)
    async def wrapper(self, *args, **kwargs) -> list[dict[str, Any]]:
        try:
            return await func(self, *args, **kwargs)
        except httpx.TimeoutException:
            self.logger.warning(f"[{self.name}] Request timeout")
            return []
        except httpx.HTTPStatusError as e:
            self.logger.error(f"[{self.name}] HTTP error: {e.response.status_code}")
            return []
        except Exception as e:
            self.logger.error(f"[{self.name}] Error: {e}")
            return []

    return wrapper


class JobListing(BaseModel):
    """Standardized job listing model."""
    id: str
    title: str
    company: str
    location: str
    description: str | None = None
    url: str | None = None
    salary: str | None = None
    contract_type: str | None = None
    source: str
    posted_date: str | None = None
    # Quality metadata computed by each provider
    url_is_direct: bool = True
    description_truncated: bool = False


class BaseJobProvider(ABC):
    """
    Abstract base class for job providers.

    All job providers must implement the `search` method
    and return standardized JobListing objects.
    """

    name: str = "base"
    supported_countries: set[str] = set()

    def __init__(self):
        """Initialize the provider."""
        self.logger = logging.getLogger(f"{__name__}.{self.name}")

    @abstractmethod
    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "fr",
        max_results: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Search for jobs.

        Args:
            query: Job title or keywords
            location: City or region
            country_code: ISO country code
            max_results: Maximum number of results

        Returns:
            List of job listings as dicts
        """
        pass

    def supports_country(self, country_code: str) -> bool:
        """Check if provider supports a country."""
        if not self.supported_countries:
            return True  # Empty set means all countries
        return country_code.lower() in self.supported_countries

    def normalize_job(self, raw_job: dict[str, Any]) -> dict[str, Any]:
        """
        Normalize a raw job response to standard format.

        Override in subclasses for provider-specific normalization.
        """
        return {
            "id": raw_job.get("id", ""),
            "title": raw_job.get("title", ""),
            "company": raw_job.get("company", ""),
            "location": raw_job.get("location", ""),
            "description": raw_job.get("description"),
            "url": raw_job.get("url"),
            "salary": raw_job.get("salary"),
            "contract_type": raw_job.get("contract_type"),
            "source": self.name,
            "posted_date": raw_job.get("posted_date"),
        }
