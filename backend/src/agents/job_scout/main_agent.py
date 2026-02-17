"""
Job Scout - Main Agent
=======================
Orchestrates sub-agents for intelligent job search.

Sub-agents:
1. QueryRefiner - Enhances and corrects search queries
2. JobRanker - Scores and ranks job results
3. MarketAnalyzer - Provides job market insights
"""

import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from typing import Any, Optional

from src.agents.base import AgentConfig, BaseAgent, SubAgent, load_prompt
from src.config.settings import settings
from src.models.schemas import Job, JobSearchResponse, SearchMetadata
from src.services.job_providers import (
    AdzunaProvider,
    JSearchProvider,
    RemoteOKProvider,
    SerpAPIProvider,
    aggregate_jobs,
)
from src.utils.cache import redis_cache

logger = logging.getLogger(__name__)


class JobScoutAgent(BaseAgent):
    """
    Job Scout Agent with deep sub-agent architecture.
    
    Orchestrates:
    - Query refinement for better search results
    - Multi-provider job aggregation
    - AI-powered ranking and insights
    """
    
    def __init__(self):
        """Initialize the Job Scout with its sub-agents."""
        config = AgentConfig(
            name="JobScout",
            model=settings.llm_model_fast,
            temperature=0.2,
            max_tokens=1024,
            system_prompt_file="job_scout_context.txt",
        )
        super().__init__(config)
        
        # Initialize providers
        self.providers = [
            AdzunaProvider(),
            SerpAPIProvider(),
            JSearchProvider(),
            RemoteOKProvider(),
        ]
        
        # Initialize sub-agents
        self._init_sub_agents()
    
    def _init_sub_agents(self) -> None:
        """Initialize specialized sub-agents."""
        self.query_refiner = SubAgent(
            name="QueryRefiner",
            system_prompt=load_prompt("job_scout_query_refiner.txt"),
            temperature=0.1,
            max_tokens=512,
        )
        self.register_sub_agent(self.query_refiner)
        
        self.job_ranker = SubAgent(
            name="JobRanker",
            system_prompt=load_prompt("job_scout_ranker.txt"),
            temperature=0.1,
            max_tokens=256,
        )
        self.register_sub_agent(self.job_ranker)
        
        self.market_analyzer = SubAgent(
            name="MarketAnalyzer",
            system_prompt=load_prompt("job_scout_market_analyzer.txt"),
            model=settings.llm_model_powerful,
            temperature=0.3,
            max_tokens=1024,
        )
        self.register_sub_agent(self.market_analyzer)
        
        logger.info(f"[{self.name}] Initialized 3 sub-agents + {len(self.providers)} providers")

    @redis_cache(ttl=900, prefix="jobs")  # Cache job searches for 15 minutes
    async def run(
        self,
        job_title: str,
        country_code: str = "fr",
        city: str = "",
        contract_type: str = "",
        max_results: int = 50,
        max_days: int = 7,
        radius_km: Optional[int] = None,
        include_remote: bool = True,
        include_insights: bool = True,
    ) -> dict[str, Any]:
        """
        Execute job search with AI enhancement.

        Args:
            job_title: Job title to search
            country_code: ISO country code
            city: City filter
            contract_type: Contract type filter
            max_results: Maximum results to return
            max_days: Only jobs from last N days
            radius_km: Search radius in kilometers around city (optional)
            include_remote: Include remote jobs in search results (default: True)
            include_insights: Include market insights

        Returns:
            Search results with metadata
        """
        start_time = time.time()

        try:
            # Step 1: Refine query with sub-agent
            refined = await self._refine_query(job_title)
            search_query = refined.get("corrected_query", job_title)

            logger.info(f"[{self.name}] Searching: '{search_query}' in {country_code}")

            # Step 2: Filter providers based on include_remote setting
            # If user doesn't want remote jobs, exclude RemoteOK provider
            active_providers = self.providers
            if not include_remote:
                active_providers = [p for p in self.providers if p.name != "remoteok"]
                logger.info(f"[{self.name}] Remote jobs excluded, using {len(active_providers)} providers")
            else:
                logger.info(f"[{self.name}] Remote jobs included, using all {len(active_providers)} providers")

            # Step 3: Aggregate from active providers
            raw_jobs = await aggregate_jobs(
                providers=active_providers,
                query=search_query,
                location=city,
                country_code=country_code,
                max_per_provider=max_results,
                max_days=max_days,
                contract_type=contract_type,
                radius_km=radius_km,
            )
            
            # Step 3: Deduplicate
            unique_jobs = self._deduplicate_jobs(raw_jobs)
            
            # Step 3.5: Pre-filter by relevance (safety net)
            filtered_jobs = self._pre_filter_by_relevance(unique_jobs, search_query)
            logger.info(f"[{self.name}] Pre-filter: {len(unique_jobs)} → {len(filtered_jobs)} jobs")
            
            # Step 4: Rank with AI (sample for performance)
            ranked_jobs = await self._rank_jobs(filtered_jobs[:max_results * 2], job_title)
            
            # Step 5: Limit results
            final_jobs = ranked_jobs[:max_results]
            
            # Step 6: Market insights (optional)
            insights = None
            if include_insights and final_jobs:
                insights = await self._get_market_insights(job_title, country_code)
            
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            return {
                "success": True,
                "jobs": final_jobs,
                "metadata": {
                    "original_query": job_title,
                    "refined_query": search_query if search_query != job_title else None,
                    "total_raw": len(raw_jobs),
                    "total_deduplicated": len(unique_jobs),
                    "sources_used": list({j.get("source", "unknown") for j in raw_jobs}),
                    "search_time_ms": elapsed_ms,
                },
                "insights": insights,
            }
            
        except Exception as e:
            logger.error(f"[{self.name}] Search error: {e}")
            return {
                "success": False,
                "error": str(e),
                "jobs": [],
            }
    
    async def _refine_query(self, query: str) -> dict:
        """Refine search query using sub-agent."""
        try:
            result = await self.query_refiner.run(task=f"Refine job search: {query}")
            return self._parse_json(result) or {"corrected_query": query}
        except Exception as e:
            logger.warning(f"[{self.name}] Query refinement failed: {e}")
            return {"corrected_query": query}
    
    async def _rank_jobs(self, jobs: list[dict], query: str) -> list[dict]:
        """Rank jobs using AI scoring."""
        if not jobs:
            return []
        
        # Score a sample for performance (AI ranking is expensive)
        sample_size = min(len(jobs), 15)
        
        async def score_job(job: dict) -> dict:
            try:
                task = f"Query: {query}\nJob: {job.get('title')} at {job.get('company')}"
                result = await self.job_ranker.run(task=task)
                data = self._parse_json(result)
                if data:
                    job["score"] = data.get("score", 0.5)
                    job["is_spam"] = data.get("is_spam", False)
                else:
                    # Parse failed → push to bottom instead of middle
                    job["score"] = 0.1
            except Exception:
                job["score"] = 0.1
            return job
        
        # Score sample jobs in parallel
        scored_sample = await asyncio.gather(
            *[score_job(job) for job in jobs[:sample_size]]
        )
        
        # Add remaining jobs with default score
        for job in jobs[sample_size:]:
            job["score"] = 0.5
        
        all_jobs = list(scored_sample) + jobs[sample_size:]
        
        # Sort by score descending
        all_jobs.sort(key=lambda x: x.get("score", 0), reverse=True)
        
        return all_jobs
    
    async def _get_market_insights(self, job_title: str, country: str, location: str = "") -> dict:
        """Get market insights from sub-agent."""
        try:
            loc_str = f" in {location}" if location else ""
            task = f"Analyze job market for: {job_title}{loc_str} in {country.upper()}"
            result = await self.market_analyzer.run(task=task)
            return self._parse_json(result) or {}
        except Exception as e:
            logger.warning(f"[{self.name}] Market insights failed: {e}")
            return {}
    
    def _deduplicate_jobs(self, jobs: list[dict], threshold: float = 0.85) -> list[dict]:
        """
        Remove duplicate job listings.
        
        Uses title + company similarity matching.
        """
        if not jobs:
            return []
        
        seen = set()
        unique = []
        
        for job in jobs:
            # Create fingerprint
            title = (job.get("title") or "").lower()
            company = (job.get("company") or "").lower()
            fingerprint = f"{title[:30]}|{company[:20]}"
            
            if fingerprint not in seen:
                seen.add(fingerprint)
                unique.append(job)
        
        return unique

    @staticmethod
    def _pre_filter_by_relevance(jobs: list[dict], query: str, min_similarity: float = 0.25) -> list[dict]:
        """
        Safety-net filter: remove jobs whose title has NO relation to the search query.
        
        This runs BEFORE the AI ranker. Even if the ranker crashes,
        obviously irrelevant jobs (e.g. "Scrum Master" for query "boulanger")
        will never reach the frontend.
        
        Uses word overlap + fuzzy matching to be flexible:
        - "boulanger" matches "Boulanger H/F" ✅
        - "boulanger" matches "Vendeur en boulangerie" ✅ (fuzzy)
        - "boulanger" does NOT match "Scrum Master" ❌
        """
        if not jobs or not query:
            return jobs
        
        query_words = set(query.lower().split())
        filtered = []
        
        for job in jobs:
            title = (job.get("title") or "").lower()
            company = (job.get("company") or "").lower()
            title_words = set(title.split())
            
            # Check 1: Direct word overlap between query and title
            overlap = query_words & title_words
            if overlap:
                filtered.append(job)
                continue
            
            # Check 2: Fuzzy match (partial word match like "boulang" in "boulangerie")
            has_fuzzy = False
            for qw in query_words:
                if len(qw) < 3:
                    continue
                for tw in title_words:
                    if qw in tw or tw in qw:
                        has_fuzzy = True
                        break
                    # SequenceMatcher for near-matches
                    if SequenceMatcher(None, qw, tw).ratio() >= 0.7:
                        has_fuzzy = True
                        break
                if has_fuzzy:
                    break
            
            if has_fuzzy:
                filtered.append(job)
                continue
            
            # Check 3: Company name matches query (keep "Conseiller chez Boulanger")
            for qw in query_words:
                if qw in company:
                    filtered.append(job)
                    break
        
        # Fallback: if filter is too aggressive and removes everything, return originals
        if not filtered:
            logger.warning(f"[JobScout] Pre-filter removed ALL jobs, falling back to original list")
            return jobs
        
        return filtered
    
    async def refine_query(self, query: str) -> dict:
        """
        Public method to refine search query.
        
        Args:
            query: Raw search query
            
        Returns:
            Refined search parameters
        """
        return await self._refine_query(query)

    async def analyze_market(
        self,
        role: str,
        country_code: str = "fr",
        location: str = "",
    ) -> dict:
        """
        Public method to analyze job market.
        
        Args:
            role: Job role
            country_code: ISO country code
            location: City or region
            
        Returns:
            Market insights
        """
        return await self._get_market_insights(role, country_code, location)

    async def analyze_query(self, user_query: str) -> dict:
        """
        Analyze a natural language job query (alias for refine_query).
        
        Args:
            user_query: Natural language query
            
        Returns:
            Extracted search parameters
        """
        return await self.refine_query(user_query)


def get_job_scout() -> JobScoutAgent:
    """
    Get JobScout singleton instance.

    DEPRECATED: This function is maintained for backward compatibility only.
    New code should use src.api.deps.get_scout_agent() instead, which provides
    thread-safe singleton initialization.

    Returns:
        JobScoutAgent singleton instance (thread-safe via deps.py)
    """
    from src.api.deps import get_scout_agent
    return get_scout_agent()


async def search_jobs(
    job_title: str,
    country_code: str = "fr",
    city: str = "",
    contract_type: str = "",
    max_results: int = 25,
) -> dict[str, Any]:
    """
    Utility function for job search.
    
    Args:
        job_title: Job title to search
        country_code: ISO country code
        city: City filter
        contract_type: Contract type filter
        max_results: Maximum results
        
    Returns:
        Search results
    """
    scout = get_job_scout()
    return await scout.run(
        job_title=job_title,
        country_code=country_code,
        city=city,
        contract_type=contract_type,
        max_results=max_results,
    )
