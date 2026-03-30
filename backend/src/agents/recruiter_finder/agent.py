import logging
from typing import Any

from src.agents.base import AgentConfig, BaseAgent, SubAgent

logger = logging.getLogger(__name__)


class RecruiterFinderAgent(BaseAgent):
    """Generate tailored LinkedIn search queries for recruiter discovery."""

    def __init__(self) -> None:
        config = AgentConfig(
            name="RecruiterFinderStrategy",
            system_prompt_file="recruiter_finder.txt",
            temperature=0.15,
        )
        super().__init__(config)
        self.strategy_gen = SubAgent(
            name="RecruiterQueryGenerator",
            system_prompt=self.system_prompt,
            temperature=0.1,
            max_tokens=900,
        )

    async def run(
        self,
        company: str,
        job_title: str = "",
        country: str = "FR",
        language: str = "fr",
    ) -> dict[str, Any]:
        """Ask Groq for search queries to feed SerpAPI."""
        task = (
            f"Company: {company}\n"
            f"Role or job title: {job_title or 'General recruiter'}\n"
            f"Country/market: {country}\n"
            f"Language to prefer: {language}"
        )

        logger.info(
            "[RecruiterFinderStrategy] Generating search queries for %s (%s)",
            company,
            job_title or "Recruitment",
        )

        raw_response = await self.strategy_gen.run(task)
        parsed = self._parse_json(raw_response)
        if not parsed:
            return {
                "success": False,
                "queries": [],
                "strategy": "",
                "error": "Failed to parse Groq response",
            }

        queries = parsed.get("queries") or []
        if not queries:
            return {
                "success": False,
                "queries": [],
                "strategy": parsed.get("strategy", ""),
                "error": "Groq agent returned no queries",
            }

        return {
            "success": True,
            "queries": queries,
            "strategy": parsed.get("strategy", ""),
        }
