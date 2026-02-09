"""
SerpAPI Job Provider
=====================
Google Jobs search via SerpAPI.
https://serpapi.com/google-jobs-api
"""

import logging
from typing import Any

import httpx

from src.config.settings import settings
from src.services.job_providers.base import BaseJobProvider
from src.utils.geo import country_code_to_name, country_code_to_language

logger = logging.getLogger(__name__)


class SerpAPIProvider(BaseJobProvider):
    """
    SerpAPI Google Jobs provider.
    
    Features:
    - Access to Google Jobs aggregator
    - Worldwide coverage
    - Structured data
    - Paid API (100 free searches/month)
    """
    
    name = "google_jobs"
    supported_countries = set()  # All countries
    
    BASE_URL = "https://serpapi.com/search"
    
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
        Search Google Jobs via SerpAPI.

        Args:
            query: Job title or keywords
            location: City or region
            country_code: ISO country code
            max_results: Maximum results
            radius_km: Search radius in kilometers around city (optional)

        Returns:
            List of normalized job listings
        """
        api_key = settings.get_serpapi_key()
        if not api_key:
            logger.debug(f"[{self.name}] Missing API key")
            return []

        # Build location string using pycountry for comprehensive support
        location_str = location or country_code_to_name(country_code)

        # Build query with radius if specified
        search_query = query
        if radius_km and location:
            search_query = f"{query} within {radius_km} km"

        params = {
            "engine": "google_jobs",
            "q": search_query,
            "location": location_str,
            "hl": country_code_to_language(country_code),
            "api_key": api_key,
        }
        
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
            
            jobs = []
            for item in data.get("jobs_results", [])[:max_results]:
                jobs.append(self._normalize_serpapi_job(item))
            
            logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}'")
            return jobs
            
        except httpx.TimeoutException:
            logger.warning(f"[{self.name}] Request timeout")
            return []
        except httpx.HTTPStatusError as e:
            logger.error(f"[{self.name}] HTTP error: {e.response.status_code}")
            return []
        except Exception as e:
            logger.error(f"[{self.name}] Error: {e}")
            return []
    
    def _normalize_serpapi_job(self, item: dict) -> dict[str, Any]:
        """Normalize SerpAPI job response."""
        # Extract apply link
        apply_options = item.get("apply_options", [])
        url = apply_options[0].get("link") if apply_options else None
        
        # Extract salary
        salary = None
        if "salary" in item.get("detected_extensions", {}):
            salary = item["detected_extensions"]["salary"]
        
        return {
            "id": f"google_{hash(item.get('title', '') + item.get('company_name', ''))}",
            "title": item.get("title", ""),
            "company": item.get("company_name", ""),
            "location": item.get("location", ""),
            "description": item.get("description"),
            "url": url,
            "salary": salary,
            "contract_type": self._extract_contract_type(item),
            "source": self.name,
            "posted_date": item.get("detected_extensions", {}).get("posted_at"),
        }
    
    def _extract_contract_type(self, item: dict) -> str | None:
        """Extract contract type from extensions."""
        extensions = item.get("detected_extensions", {})
        if extensions.get("schedule_type"):
            return extensions["schedule_type"]
        return None
