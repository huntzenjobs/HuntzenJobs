"""
Adzuna Job Provider
====================
Free tier API with 15+ countries support.
https://developer.adzuna.com/
"""

import logging
from typing import Any

import httpx

from src.config.settings import settings
from src.services.job_providers.base import (
    BaseJobProvider,
    handle_provider_errors,
    normalize_contract_type,
)
from src.utils.url_validator import is_description_truncated, is_direct_job_url

logger = logging.getLogger(__name__)


class AdzunaProvider(BaseJobProvider):
    """
    Adzuna API provider.

    Features:
    - Free tier: 1000 requests/month
    - Supports 17 countries
    - Good for Europe and English-speaking countries
    """

    name = "adzuna"
    supported_countries = {
        "au", "at", "br", "ca", "de", "fr", "in", "it",
        "mx", "nl", "nz", "pl", "ru", "sg", "za", "gb", "us"
    }

    BASE_URL = "https://api.adzuna.com/v1/api/jobs"

    @handle_provider_errors
    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "fr",
        max_results: int = 50,
        max_days: int = 7,
        contract_type: str = "",
        **kwargs,
    ) -> list[dict[str, Any]]:
        """
        Search Adzuna for jobs.

        Args:
            query: Job title or keywords
            location: City or region
            country_code: ISO country code
            max_results: Maximum results (max 50 per page)
            max_days: Only jobs from last N days
            contract_type: Filter by contract type

        Returns:
            List of normalized job listings
        """
        # Check credentials
        if not settings.adzuna_app_id or not settings.get_adzuna_key():
            logger.debug(f"[{self.name}] Missing credentials")
            return []

        # Check country support
        cc = country_code.lower()
        if not self.supports_country(cc):
            logger.debug(f"[{self.name}] Country {cc} not supported")
            return []

        url = f"{self.BASE_URL}/{cc}/search/1"
        params = {
            "app_id": settings.adzuna_app_id,
            "app_key": settings.get_adzuna_key(),
            "what": query,
            "where": location,
            "results_per_page": min(max_results, 50),
            "max_days_old": max_days,
            "content-type": "application/json",
        }

        # Map contract types to Adzuna values
        # Alternance : on ne touche PAS la query. Le post-filtre dans
        # aggregator.py (_is_alternance_job) se charge de filtrer après.
        # Enrichir avec "alternance" retournait souvent 0 résultats.
        if contract_type and contract_type not in ("alternance", "apprentissage"):
            contract_map = {
                "cdi": "permanent",
                "cdd": "contract",
                "freelance": "contract",
                "internship": "contract",
                "permanent": "permanent",
                "contract": "contract",
            }
            if contract_type.lower() in contract_map:
                params["contract_type"] = contract_map[contract_type.lower()]

        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        jobs = []
        for item in data.get("results", []):
            jobs.append(self._normalize_adzuna_job(item))

        logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}' in {cc}")
        return jobs

    def _normalize_adzuna_job(self, item: dict) -> dict[str, Any]:
        """Normalize Adzuna job response."""
        description = item.get("description")
        url = item.get("redirect_url")
        return {
            "id": f"adzuna_{item.get('id')}",
            "title": item.get("title", ""),
            "company": item.get("company", {}).get("display_name", ""),
            "location": item.get("location", {}).get("display_name", ""),
            "description": description,
            "url": url,
            "salary": self._format_salary(item),
            "contract_type": normalize_contract_type(item.get("contract_type")),
            "source": self.name,
            "posted_date": item.get("created"),
            "url_is_direct": is_direct_job_url(url),
            "description_truncated": is_description_truncated(description, "adzuna"),
        }

    def _format_salary(self, item: dict) -> str | None:
        """Format salary range."""
        min_sal = item.get("salary_min")
        max_sal = item.get("salary_max")

        if min_sal and max_sal:
            return f"{int(min_sal):,} - {int(max_sal):,}"
        elif min_sal:
            return f"From {int(min_sal):,}"
        elif max_sal:
            return f"Up to {int(max_sal):,}"
        return None
