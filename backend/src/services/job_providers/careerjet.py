"""
Careerjet Job Provider
=======================
Job search aggregator with native francophone support.
https://www.careerjet.com/partners/api/

Features:
- 90 localized sites, 28 languages
- Native fr_FR, fr_BE, fr_CH, fr_CA, fr_LU locales
- 40M+ job listings from 70,000+ sites
- Free, 1000 requests/hour
- No API key required (affiliate ID only)
"""

import logging
from typing import Any

import httpx

from src.services.job_providers.base import (
    BaseJobProvider,
    handle_provider_errors,
    normalize_contract_type,
)

logger = logging.getLogger(__name__)

# Mapping country_code → Careerjet locale
_COUNTRY_TO_LOCALE = {
    "fr": "fr_FR",
    "be": "fr_BE",
    "ch": "fr_CH",
    "ca": "fr_CA",
    "lu": "fr_LU",
    "de": "de_DE",
    "gb": "en_GB",
    "us": "en_US",
    "nl": "nl_NL",
    "es": "es_ES",
    "it": "it_IT",
    "pt": "pt_PT",
    "at": "de_AT",
    "au": "en_AU",
}


class CareerjetProvider(BaseJobProvider):
    """
    Careerjet job aggregator — strong francophone coverage.

    Native support for fr_FR, fr_BE, fr_CH, fr_CA, fr_LU.
    Returns French job titles and descriptions for francophone countries.
    """

    name = "careerjet"
    supported_countries = set()  # All countries via locale mapping

    BASE_URL = "https://public.api.careerjet.net/search"
    AFFID = "213e213hd12"  # Public affiliate ID for API access

    @handle_provider_errors
    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "fr",
        max_results: int = 50,
        **kwargs,
    ) -> list[dict[str, Any]]:
        """Search Careerjet for jobs with native locale support."""
        locale = _COUNTRY_TO_LOCALE.get(country_code.lower(), "en_US")

        params = {
            "keywords": query,
            "location": location,
            "locale_code": locale,
            "affid": self.AFFID,
            "pagesize": min(max_results, 99),
            "page": 1,
            "sort": "relevance",
            "contracttype": self._map_contract(kwargs.get("contract_type", "")),
        }

        # Remove empty params
        params = {k: v for k, v in params.items() if v}

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(self.BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data.get("type") == "ERROR":
            logger.warning(f"[{self.name}] API error: {data.get('error')}")
            return []

        raw_jobs = data.get("jobs", [])
        jobs = [self._normalize_job(item) for item in raw_jobs[:max_results]]

        total = data.get("hits", len(jobs))
        logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}' in {location or country_code} (total: {total})")
        return jobs

    def _normalize_job(self, item: dict) -> dict[str, Any]:
        """Normalize a Careerjet job to the standard format."""
        import re

        # Nettoyer la description HTML
        description = item.get("description", "") or ""
        description = re.sub(r"<[^>]+>", "", description).strip()

        # Salaire
        salary = item.get("salary") or None
        if salary and salary.strip() == "":
            salary = None

        return {
            "id": f"careerjet_{item.get('url', '').split('/')[-1][:20] or 'unknown'}",
            "title": item.get("title", ""),
            "company": item.get("company", ""),
            "location": item.get("locations", ""),
            "description": description[:500] if description else "",
            "url": item.get("url", ""),
            "salary": salary,
            "contract_type": normalize_contract_type(item.get("type", "")),
            "source": self.name,
            "posted_date": item.get("date"),
            "url_is_direct": False,
        }

    @staticmethod
    def _map_contract(contract_type: str) -> str:
        """Map normalized contract type to Careerjet contracttype param."""
        if not contract_type:
            return ""
        mapping = {
            "cdi": "p",       # permanent
            "cdd": "c",       # contract
            "interim": "t",   # temporary
            "freelance": "c",
            "internship": "i",
            "stage": "i",
        }
        return mapping.get(contract_type.lower().strip(), "")
