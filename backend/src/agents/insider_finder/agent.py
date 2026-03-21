
import logging
from typing import Any

from pydantic import BaseModel

from src.agents.base import AgentConfig, BaseAgent, SubAgent

logger = logging.getLogger(__name__)

class InsiderQuery(BaseModel):
    type: str
    label: str
    query: str
    reason: str

class InsiderFinderResponse(BaseModel):
    queries: list[InsiderQuery]
    strategy: str

class InsiderFinderAgent(BaseAgent):
    """
    Agent responsible for finding the best people to contact for a job.
    Uses Groq to generate strategic search queries and could later be extended 
    to process search results.
    """

    def __init__(self):
        config = AgentConfig(
            name="InsiderFinder",
            system_prompt_file="insider_finder.txt",
            temperature=0.1
        )
        super().__init__(config)

        # We can also use a SubAgent for specific query generation if needed
        # but here the main agent prompt already handles it well.
        # For pure OOP/SubAgent demo, let's wrap the logic.
        self.query_gen = SubAgent(
            name="QueryGenerator",
            system_prompt=self.system_prompt
        )

    async def run(self, job_title: str, company: str, city: str = "", is_alternance: bool = False) -> dict[str, Any]:
        """
        Generates LinkedIn search queries for a job.
        
        Args:
            job_title: Title of the job
            company: Company name
            city: City location
            is_alternance: Whether it's a student job
            
        Returns:
            Dict containing queries and strategy
        """
        task = f"Job: {job_title}\nCompany: {company}\nLocation: {city}\nType: {'Work-study/Internship' if is_alternance else 'Standard'}"

        logger.info(f"[{self.name}] Generating queries for {job_title} at {company}")

        raw_response = await self.query_gen.run(task)
        parsed = self._parse_json(raw_response)

        if not parsed:
            return {
                "success": False,
                "error": "Failed to generate search strategy",
                "queries": [],
                "strategy": ""
            }

        return {
            "success": True,
            "queries": parsed.get("queries", []),
            "strategy": parsed.get("strategy", "")
        }
