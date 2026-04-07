"""
Jooble Job Provider
====================
Aggregator covering 70+ countries.
https://jooble.org/api/about

Features:
- Worldwide coverage (aggregates Indeed, LinkedIn, StepStone, etc.)
- Free API key
- POST-based REST API
- Radius search support
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

logger = logging.getLogger(__name__)


class JoobleProvider(BaseJobProvider):
    """
    Jooble job aggregator — 70+ countries, free API.

    Aggregates from Indeed, LinkedIn, Glassdoor, StepStone and many more.
    Particularly strong for Belgium, Luxembourg, and other countries
    not well covered by Adzuna.
    """

    name = "jooble"
    supported_countries = set()  # All countries

    BASE_URL = "https://jooble.org/api"

    @handle_provider_errors
    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "fr",
        max_results: int = 50,
        **kwargs,
    ) -> list[dict[str, Any]]:
        """Search Jooble for jobs worldwide."""
        api_key = getattr(settings, "jooble_api_key", None) or ""
        if not api_key:
            logger.debug(f"[{self.name}] Missing Jooble API key")
            return []

        url = f"{self.BASE_URL}/{api_key}"

        # Jooble (jooble.org) est anglophone — ajouter le pays en anglais à la location
        country_names = {
            "fr": "France", "be": "Belgium", "lu": "Luxembourg",
            "ch": "Switzerland", "de": "Germany", "nl": "Netherlands",
            "gb": "United Kingdom", "us": "United States", "ca": "Canada",
            "es": "Spain", "it": "Italy", "pt": "Portugal",
        }
        country_name = country_names.get(country_code.lower(), "")
        jooble_location = f"{location}, {country_name}" if location and country_name else location or country_name

        body: dict[str, Any] = {
            "keywords": query,
            "location": jooble_location,
            "page": 1,
            "companysearch": False,
        }

        # Radius si fourni (valeurs acceptées : 0, 4, 8, 16, 26, 40, 80)
        radius_km = kwargs.get("radius_km")
        if radius_km:
            # Mapper vers les valeurs Jooble acceptées
            jooble_radii = [0, 4, 8, 16, 26, 40, 80]
            body["radius"] = str(min(jooble_radii, key=lambda x: abs(x - radius_km)))

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                json=body,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

        raw_jobs = data.get("jobs", [])
        jobs = [self._normalize_jooble_job(item) for item in raw_jobs[:max_results]]

        total = data.get("totalCount", len(jobs))
        logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}' in {location or country_code} (total: {total})")
        return jobs

    def _normalize_jooble_job(self, item: dict) -> dict[str, Any]:
        """Normalize a Jooble job to the standard format."""
        job_id = item.get("id", "")

        # Type de contrat depuis le champ "type"
        raw_type = item.get("type", "")
        contract = self._normalize_type(raw_type)

        # Description (Jooble fournit un "snippet")
        snippet = item.get("snippet", "") or ""
        # Nettoyer les tags HTML basiques
        import re
        description = re.sub(r"<[^>]+>", "", snippet).strip()

        return {
            "id": f"jooble_{job_id}",
            "title": item.get("title", ""),
            "company": item.get("company", ""),
            "location": item.get("location", ""),
            "description": description[:500] if description else "",
            "url": item.get("link", ""),
            "salary": item.get("salary") or None,
            "contract_type": contract,
            "source": self.name,
            "posted_date": item.get("updated"),
            "url_is_direct": False,
        }

    @staticmethod
    def _normalize_type(raw_type: str) -> str:
        """Normalize Jooble job type to standard contract type."""
        if not raw_type:
            return ""
        raw = raw_type.lower().strip()
        type_map = {
            "full-time": "CDI",
            "full time": "CDI",
            "permanent": "CDI",
            "part-time": "Temps partiel",
            "part time": "Temps partiel",
            "contract": "CDD",
            "temporary": "CDD",
            "internship": "Stage",
            "intern": "Stage",
            "freelance": "Freelance",
        }
        mapped = type_map.get(raw)
        if mapped:
            return mapped
        return normalize_contract_type(raw_type)
