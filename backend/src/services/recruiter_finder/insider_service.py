
import logging
from typing import Any, List, Dict
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
        is_alternance: bool = False
    ) -> Dict[str, Any]:
        """
        Executes a hunt for insiders for a specific job.
        
        1. Asks the AI for a search strategy.
        2. Executes queries via SerpAPI.
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

        # Step 2: Execute queries (we can run them in parallel for speed if needed)
        # For now, let's process them and avoid duplicate links
        seen_links = set()

        async with httpx.AsyncClient(timeout=20.0) as client:
            for q_obj in queries[:3]: # Limit to top 3 strategies to save credits
                query_text = q_obj.get("query")
                query_type = q_obj.get("type", "other")
                label = q_obj.get("label", "Contact")
                
                params = {
                    "engine": "google",
                    "q": query_text,
                    "api_key": api_key,
                    "gl": "fr", # Default to France, can be improved to detect country
                    "hl": "fr"
                }
                
                try:
                    resp = await client.get(self.serpapi_url, params=params)
                    resp.raise_for_status()
                    data = resp.json()
                    
                    organic_results = data.get("organic_results", [])
                    
                    for res in organic_results:
                        link = res.get("link", "")
                        if "linkedin.com/in/" in link and link not in seen_links:
                            seen_links.add(link)
                            all_insiders.append({
                                "name": res.get("title", "").split(" - ")[0],
                                "title": res.get("title", ""),
                                "link": link,
                                "snippet": res.get("snippet", ""),
                                "category": query_type,
                                "label": label
                            })
                except Exception as e:
                    logger.error(f"[InsiderService] Search failed for query '{query_text}': {e}")
                    continue

        return {
            "success": True,
            "strategy": strategy_text,
            "insiders": all_insiders,
            "total_found": len(all_insiders)
        }
