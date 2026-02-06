"""
RemoteOK Job Provider
======================
Free API for remote jobs.
https://remoteok.com/api
"""

import logging
from typing import Any

import httpx

from src.services.job_providers.base import BaseJobProvider

logger = logging.getLogger(__name__)


class RemoteOKProvider(BaseJobProvider):
    """
    RemoteOK API provider.
    
    Features:
    - 100% free API
    - Remote-only jobs
    - Tech-focused
    - No authentication required
    """
    
    name = "remoteok"
    supported_countries = set()  # Remote = all countries
    
    BASE_URL = "https://remoteok.com/api"
    
    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "fr",
        max_results: int = 50,
    ) -> list[dict[str, Any]]:
        """
        Search RemoteOK for remote jobs.
        
        Args:
            query: Job title or keywords
            location: Ignored (all remote)
            country_code: Ignored (all remote)
            max_results: Maximum results
            
        Returns:
            List of normalized job listings
        """
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    self.BASE_URL,
                    headers={"User-Agent": "HuntZen/3.0"},
                )
                response.raise_for_status()
                data = response.json()
            
            # Filter by query
            query_lower = query.lower()
            query_words = set(query_lower.split())
            
            jobs = []
            for item in data[1:]:  # Skip first item (legal notice)
                if not isinstance(item, dict):
                    continue
                
                # Check relevance
                position = (item.get("position") or "").lower()
                tags = " ".join(item.get("tags", [])).lower()
                
                if any(word in position or word in tags for word in query_words):
                    jobs.append(self._normalize_remoteok_job(item))
                    
                    if len(jobs) >= max_results:
                        break
            
            logger.info(f"[{self.name}] Found {len(jobs)} remote jobs for '{query}'")
            return jobs
            
        except httpx.TimeoutException:
            logger.warning(f"[{self.name}] Request timeout")
            return []
        except Exception as e:
            logger.error(f"[{self.name}] Error: {e}")
            return []
    
    def _normalize_remoteok_job(self, item: dict) -> dict[str, Any]:
        """Normalize RemoteOK job response."""
        return {
            "id": f"remoteok_{item.get('id')}",
            "title": item.get("position", ""),
            "company": item.get("company", ""),
            "location": "Remote",
            "description": item.get("description"),
            "url": item.get("url"),
            "salary": self._format_salary(item),
            "contract_type": "remote",
            "source": self.name,
            "posted_date": item.get("date"),
        }
    
    def _format_salary(self, item: dict) -> str | None:
        """Format salary if available."""
        min_sal = item.get("salary_min")
        max_sal = item.get("salary_max")
        
        if min_sal and max_sal:
            return f"${int(min_sal):,} - ${int(max_sal):,}"
        return None
