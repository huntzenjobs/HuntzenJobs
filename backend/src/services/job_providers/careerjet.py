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
- Basic Auth with API key
"""

import logging
import re
from base64 import b64encode
from typing import Any

import httpx

from src.config.settings import settings
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

    Uses Basic Auth (API key as username, empty password).
    Requires user_ip, user_agent, and Referer header.
    """

    name = "careerjet"
    supported_countries = set()  # All countries via locale mapping

    BASE_URL = "https://search.api.careerjet.net/v4/query"

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
        api_key = settings.careerjet_affid
        if not api_key:
            logger.debug(f"[{self.name}] Missing Careerjet API key (CAREERJET_AFFID)")
            return []

        locale = _COUNTRY_TO_LOCALE.get(country_code.lower(), "en_GB")

        params: dict[str, Any] = {
            "keywords": query,
            "location": location,
            "locale_code": locale,
            "page_size": min(max_results, 99),
            "page": 1,
            "sort": "relevance",
            "user_ip": "195.154.0.1",
            "user_agent": "Mozilla/5.0 (compatible; HuntZen/3.0)",
        }

        # Contract type filter
        contract_mapped = self._map_contract(kwargs.get("contract_type", ""))
        if contract_mapped:
            params["contract_type"] = contract_mapped

        # Basic Auth: API key as username, empty password
        credentials = b64encode(f"{api_key}:".encode()).decode()
        headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Referer": "https://www.huntzenjobs.com/jobs",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(self.BASE_URL, params=params, headers=headers)
            if resp.status_code != 200:
                logger.error(f"[{self.name}] HTTP {resp.status_code} body={resp.text}")
                return []
            data = resp.json()

        # Handle location mode (no results, just location suggestions)
        if data.get("type") == "LOCATIONS":
            logger.info(f"[{self.name}] Location mode: {data.get('message')}")
            return []

        if data.get("type") == "ERROR":
            logger.warning(f"[{self.name}] API error: {data.get('message')}")
            return []

        raw_jobs = data.get("jobs", [])
        jobs = [self._normalize_job(item) for item in raw_jobs[:max_results]]

        total = data.get("hits", len(jobs))
        logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}' in {location or country_code} (total: {total})")
        return jobs

    def _normalize_job(self, item: dict) -> dict[str, Any]:
        """Normalize a Careerjet job to the standard format."""
        # Nettoyer la description HTML
        description = item.get("description", "") or ""
        description = re.sub(r"<[^>]+>", "", description).strip()

        # Salaire
        salary = item.get("salary") or None
        if salary and isinstance(salary, str) and salary.strip() == "":
            salary = None

        return {
            "id": f"cj_{hash(item.get('url', '')) % 10**8}",
            "title": item.get("title", ""),
            "company": item.get("company", ""),
            "location": item.get("locations", ""),
            "description": description[:500] if description else "",
            "url": item.get("url", ""),
            "salary": salary,
            "contract_type": normalize_contract_type(item.get("salary_type", "")),
            "source": self.name,
            "posted_date": item.get("date"),
            "url_is_direct": False,
        }

    @staticmethod
    def _map_contract(contract_type: str) -> str:
        """Map normalized contract type to Careerjet contract_type param."""
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
