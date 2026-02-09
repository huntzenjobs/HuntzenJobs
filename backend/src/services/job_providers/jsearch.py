"""
JSearch Job Provider (RapidAPI)
================================
Multi-board aggregator via Google for Jobs.
Aggregates: Google Jobs, LinkedIn, Indeed, Glassdoor, ZipRecruiter.
https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch

Uses the same RAPIDAPI_KEY as the salary JSearch integration.
"""

import logging
import re
from typing import Any

import httpx

from src.config.settings import settings
from src.services.job_providers.base import BaseJobProvider
from src.utils.geo import country_code_to_name, format_location_query

logger = logging.getLogger(__name__)

# Mapping of known publishers → normalized source names
_PUBLISHER_SOURCE_MAP = {
    "linkedin": "linkedin",
    "indeed": "indeed",
    "glassdoor": "glassdoor",
    "ziprecruiter": "ziprecruiter",
    "google": "google_jobs",
}


class JSearchProvider(BaseJobProvider):
    """
    JSearch via RapidAPI — the multi-board aggregator.

    One API call searches across Google Jobs, LinkedIn, Indeed,
    Glassdoor, and ZipRecruiter simultaneously.

    Features:
    - Worldwide coverage (best for US/UK/CA, good everywhere else)
    - Employer logos, remote flag, apply links
    - Salary data when available
    - Publisher attribution (so we know which board it came from)

    Rate limits (BASIC/free plan): 200 requests/month.
    """

    name = "jsearch"
    supported_countries = set()  # Worldwide

    BASE_URL = "https://jsearch.p.rapidapi.com/search"
    HOST = "jsearch.p.rapidapi.com"

    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "fr",
        max_results: int = 50,
        radius_km: int | None = None,
        **kwargs,
    ) -> list[dict[str, Any]]:
        """
        Search jobs via JSearch /search endpoint.

        Args:
            query: Job title or keywords
            location: City or region
            country_code: ISO country code
            max_results: Maximum results (JSearch returns ~10 per page)
            radius_km: Search radius in kilometers around city (optional)

        Returns:
            List of normalized job listings
        """
        rapidapi_key = settings.get_rapidapi_key()
        if not rapidapi_key:
            logger.debug(f"[{self.name}] Missing RapidAPI key, skipping")
            return []

        # JSearch uses natural-language queries like "Data Engineer in Paris, France"
        # Use pycountry for comprehensive country support (250+ countries)
        country_name = country_code_to_name(country_code)
        location_str = f"{location}, {country_name}" if location else country_name

        # Add radius to query if specified
        if radius_km and location:
            search_query = f"{query} in {location_str} within {radius_km} km"
        else:
            search_query = f"{query} in {location_str}"

        # Request up to 2 pages (~20 results)
        num_pages = min(2, max(1, max_results // 10))

        headers = {
            "X-RapidAPI-Key": rapidapi_key,
            "X-RapidAPI-Host": self.HOST,
        }
        params = {
            "query": search_query,
            "page": "1",
            "num_pages": str(num_pages),
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(self.BASE_URL, headers=headers, params=params)

                if response.status_code == 429:
                    logger.warning(f"[{self.name}] Rate limit exceeded")
                    return []

                response.raise_for_status()
                data = response.json()

            results = data.get("data", [])
            if not isinstance(results, list):
                return []

            jobs = []
            for item in results[:max_results]:
                job = self._normalize_jsearch_job(item, location_str)
                if job:
                    jobs.append(job)

            logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}' in {location_str}")
            return jobs

        except httpx.TimeoutException:
            logger.warning(f"[{self.name}] Request timeout")
            return []
        except httpx.HTTPStatusError as e:
            logger.error(f"[{self.name}] HTTP {e.response.status_code}: {e.response.text[:200]}")
            return []
        except Exception as e:
            logger.error(f"[{self.name}] Error: {e}")
            return []

    def _normalize_jsearch_job(self, item: dict, fallback_location: str) -> dict[str, Any] | None:
        """
        Normalize a JSearch API result to the standard JobListing format.
        """
        title = item.get("job_title")
        if not title:
            return None

        # ── URL ──
        url = item.get("job_apply_link") or item.get("job_google_link")

        # ── Source from publisher ──
        publisher = (item.get("job_publisher") or "").lower()
        source = self.name  # default
        for keyword, source_name in _PUBLISHER_SOURCE_MAP.items():
            if keyword in publisher:
                source = source_name
                break

        # ── Location ──
        parts = []
        if item.get("job_city"):
            parts.append(item["job_city"])
        if item.get("job_state"):
            parts.append(item["job_state"])
        if item.get("job_country"):
            parts.append(item["job_country"])
        job_location = ", ".join(parts) if parts else fallback_location

        # ── Salary formatting ──
        salary = self._format_salary(item)

        # ── Contract type ──
        employment_type = item.get("job_employment_type")
        contract = self._normalize_contract_type(employment_type)

        # ── Remote flag ──
        is_remote = item.get("job_is_remote", False)
        if is_remote and "remote" not in job_location.lower():
            job_location = f"{job_location} (Remote)"

        return {
            "id": f"jsearch_{item.get('job_id', hash(title + (item.get('employer_name') or '')))}",
            "title": title,
            "company": item.get("employer_name") or "Unknown",
            "location": job_location,
            "description": (item.get("job_description") or "")[:500],
            "url": url,
            "salary": salary,
            "contract_type": contract,
            "source": source,
            "posted_date": item.get("job_posted_at_datetime_utc"),
        }

    def _format_salary(self, item: dict) -> str | None:
        """Format salary data from JSearch response."""
        salary_min = item.get("job_min_salary")
        salary_max = item.get("job_max_salary")

        if not salary_min and not salary_max:
            return None

        salary_period = item.get("job_salary_period", "YEAR")
        salary_currency = item.get("job_salary_currency", "USD")

        period_labels = {"YEAR": "/an", "MONTH": "/mois", "HOUR": "/h"}
        period_text = period_labels.get(salary_period, "/an")

        def fmt(val: float | int) -> str:
            """Format a salary number (e.g. 45000 → 45K, 25 → 25)."""
            if val >= 1000:
                return f"{int(val / 1000)}K"
            return str(int(val))

        if salary_min and salary_max:
            return f"{fmt(salary_min)} - {fmt(salary_max)} {salary_currency}{period_text}"
        elif salary_min:
            return f"{fmt(salary_min)}+ {salary_currency}{period_text}"
        elif salary_max:
            return f"≤{fmt(salary_max)} {salary_currency}{period_text}"

        return None

    @staticmethod
    def _normalize_contract_type(raw: str | None) -> str | None:
        """Normalize JSearch employment type strings."""
        if not raw:
            return None
        raw_lower = raw.lower().replace("_", " ").replace("-", " ")
        mapping = {
            "fulltime": "CDI",
            "full time": "CDI",
            "parttime": "CDD",
            "part time": "CDD",
            "contractor": "Freelance",
            "contract": "CDD",
            "intern": "Stage",
            "internship": "Stage",
            "temporary": "Intérim",
        }
        for key, value in mapping.items():
            if key in raw_lower:
                return value
        return raw  # Return as-is if no match
