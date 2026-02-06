"""
Job Fairs Agent
===============
Agent for finding job fairs and employment events in France.

Features:
- Multi-source scraping (France Travail, L'Etudiant, APEC, CCI)
- Smart filtering by region, sector, public, format
- Fallback to mock data if scraping fails
"""

import logging
from typing import Any, Optional

from src.agents.base import AgentConfig, BaseAgent
from src.config.settings import settings

logger = logging.getLogger(__name__)


class JobFairsAgent(BaseAgent):
    """
    Job Fairs Agent for finding employment events.

    Uses the existing job_fairs scraper from job_finder.providers.
    """

    def __init__(self):
        """Initialize the Job Fairs Agent."""
        config = AgentConfig(
            name="JobFairsAgent",
            model=settings.llm_model_fast,  # Fast model for filtering
            temperature=0.1,
            max_tokens=2048,
        )
        super().__init__(config)
        logger.info(f"[{self.name}] Initialized")

    async def run(
        self,
        region: str = "",
        sector: str = "",
        public: str = "",
        event_type: str = "",
        format_type: str = "",
    ) -> dict[str, Any]:
        """
        Search for job fairs with filters.

        Args:
            region: Region filter (e.g., "Île-de-France", "Auvergne-Rhône-Alpes")
            sector: Sector filter (e.g., "tech", "industrie", "sante")
            public: Public filter (e.g., "etudiants", "pros", "tous", "seniors")
            event_type: Event type filter (e.g., "salon", "forum", "job_dating", "webinar")
            format_type: Format filter (e.g., "physique", "virtuel", "hybride")

        Returns:
            Search results with events list and metadata
        """
        try:
            # Import scraper
            from job_finder.providers.job_fairs import search_job_fairs as scrape_job_fairs

            logger.info(f"[{self.name}] Searching job fairs with filters: "
                       f"region={region}, sector={sector}, public={public}, "
                       f"type={event_type}, format={format_type}")

            # Call scraper - returns dict with events already as dicts
            result = await scrape_job_fairs(
                region=region,
                sector=sector,
                public=public,
                event_type=event_type,
                format_type=format_type,
            )

            logger.info(f"[{self.name}] Found {result['count']} events from {result.get('sources', [])}")

            return {
                "success": True,
                "events": result["events"],  # Already converted to dicts by scraper
                "count": result["count"],
                "filters_applied": {
                    "region": region,
                    "sector": sector,
                    "public": public,
                    "event_type": event_type,
                    "format": format_type,
                },
            }

        except Exception as e:
            logger.error(f"[{self.name}] Error searching job fairs: {e}")
            return {
                "success": False,
                "error": str(e),
                "events": [],
                "count": 0,
            }


# Singleton instance
_job_fairs_instance: Optional[JobFairsAgent] = None


def get_job_fairs_agent() -> JobFairsAgent:
    """Get or create the singleton JobFairsAgent instance."""
    global _job_fairs_instance
    if _job_fairs_instance is None:
        _job_fairs_instance = JobFairsAgent()
    return _job_fairs_instance


async def search_job_fairs(
    region: str = "",
    sector: str = "",
    public: str = "",
    event_type: str = "",
    format_type: str = "",
) -> dict[str, Any]:
    """
    Utility function for job fairs search.

    Args:
        region: Region filter
        sector: Sector filter
        public: Public filter
        event_type: Event type filter
        format_type: Format filter

    Returns:
        Search results
    """
    agent = get_job_fairs_agent()
    return await agent.run(
        region=region,
        sector=sector,
        public=public,
        event_type=event_type,
        format_type=format_type,
    )
