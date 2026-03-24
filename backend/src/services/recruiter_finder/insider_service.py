
import asyncio
import logging
from typing import Any

import httpx

from src.agents.insider_finder.agent import InsiderFinderAgent
from src.config.settings import settings

logger = logging.getLogger(__name__)

class InsiderFinderService:
    """
    Service responsible for orchestrating the discovery of company insiders.
    Combines AI-generated strategies (Groq) with real-world search results (SerpAPI).
    """

    def __init__(self):
        self.agent = InsiderFinderAgent()
        self.serpapi_url = "https://serpapi.com/search"

    async def find_insiders(
        self,
        job_title: str,
        company: str,
        city: str = "",
        is_alternance: bool = False,
        country_code: str = "fr",
    ) -> dict[str, Any]:
        """
        Executes a hunt for insiders for a specific job.

        1. Asks the AI for a search strategy.
        2. Executes queries via SerpAPI in parallel.
        3. Formats and returns the list of potential contacts.
        """
        # Step 1: Get search strategy from Hunter Agent
        strategy_result = await self.agent.run(
            job_title=job_title,
            company=company,
            city=city,
            is_alternance=is_alternance
        )

        if not strategy_result.get("success"):
            return {
                "success": False,
                "error": strategy_result.get("error", "Unknown error in agent"),
                "insiders": []
            }

        queries = strategy_result.get("queries", [])
        strategy_text = strategy_result.get("strategy", "")

        all_insiders = []
        api_key = settings.get_serpapi_key()
        seen_links: set[str] = set()

        async with httpx.AsyncClient(timeout=10.0) as client:
            tasks = [
                self._execute_query(client, q_obj, api_key, country_code)
                for q_obj in queries[:5]
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for r in results:
                if isinstance(r, Exception):
                    logger.error(f"[InsiderService] Query failed: {r}")
                    continue
                if isinstance(r, list):
                    for insider in r:
                        link = insider.get("link", "")
                        if link not in seen_links:
                            seen_links.add(link)
                            all_insiders.append(insider)

        return {
            "success": True,
            "strategy": strategy_text,
            "insiders": all_insiders,
            "total_found": len(all_insiders),
        }

    async def _execute_query(
        self,
        client: httpx.AsyncClient,
        q_obj: dict,
        api_key: str,
        country_code: str,
    ) -> list[dict]:
        """Execute a single SerpAPI query and return found insiders."""
        query_text = q_obj.get("query")
        query_type = q_obj.get("type", "other")
        label = q_obj.get("label", "Contact")

        params = {
            "engine": "google",
            "q": query_text,
            "api_key": api_key,
            "gl": country_code or "fr",
            "hl": country_code or "fr",
        }

        try:
            resp = await client.get(self.serpapi_url, params=params)
            resp.raise_for_status()
            data = resp.json()
            results = []
            for res in data.get("organic_results", []):
                link = res.get("link", "")
                if "linkedin.com/in/" in link:
                    results.append({
                        "name": res.get("title", "").split(" - ")[0].strip(),
                        "title": res.get("title", ""),
                        "link": link,
                        "snippet": res.get("snippet", ""),
                        "category": query_type,
                        "label": label,
                    })
            return results
        except Exception as e:
            logger.error(f"[InsiderService] Search failed for query '{query_text}': {e}")
            return []
