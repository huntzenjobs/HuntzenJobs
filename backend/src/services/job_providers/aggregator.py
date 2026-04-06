"""
Job Aggregator
===============
Combines results from multiple job providers.
"""

import asyncio
import logging
from difflib import SequenceMatcher
from typing import Any

from src.services.job_providers.base import BaseJobProvider

logger = logging.getLogger(__name__)


ALTERNANCE_SIGNALS = frozenset({
    "alternance", "apprenti", "apprentissage",
    "contrat pro", "contrat d'apprentissage",
    "work-study", "work study",
})


def _is_alternance_job(job: dict) -> bool:
    """Retourne True si l'offre présente un signal alternance clair."""
    text = f"{job.get('title', '')} {job.get('description', '') or ''}".lower()
    return (
        job.get("contract_type") == "alternance"
        or any(signal in text for signal in ALTERNANCE_SIGNALS)
    )


async def aggregate_jobs(
    providers: list[BaseJobProvider],
    query: str,
    location: str = "",
    country_code: str = "fr",
    max_per_provider: int = 50,
    max_days: int = 7,
    contract_type: str = "",
    radius_km: int | None = None,
) -> list[dict[str, Any]]:
    """
    Aggregate jobs from multiple providers.

    Args:
        providers: List of job providers to query
        query: Job title or keywords
        location: City or region
        country_code: ISO country code
        max_per_provider: Max results per provider
        max_days: Only jobs from last N days
        contract_type: Filter by contract type
        radius_km: Search radius in kilometers around city (optional)

    Returns:
        Combined list of all job listings
    """
    async def search_provider(provider: BaseJobProvider) -> tuple[str, list[dict]]:
        """Search a single provider."""
        try:
            # Pass extra params if provider supports them
            kwargs = {
                "query": query,
                "location": location,
                "country_code": country_code,
                "max_results": max_per_provider,
            }
            # Passer max_days à tous les providers (chacun l'ignore si non supporté via **kwargs)
            kwargs["max_days"] = max_days

            # Transmettre contract_type à TOUS les providers via **kwargs
            if contract_type:
                kwargs["contract_type"] = contract_type

            # Pass radius_km to providers that support it
            if radius_km is not None:
                kwargs["radius_km"] = radius_km

            jobs = await provider.search(**kwargs)
            return provider.name, jobs
        except Exception as e:
            logger.error(f"[Aggregator] {provider.name} failed: {e}")
            return provider.name, []

    # Search all providers in parallel
    tasks = [search_provider(p) for p in providers]
    results = await asyncio.gather(*tasks)

    # Combine results
    all_jobs = []
    source_stats = {}

    for source_name, jobs in results:
        source_stats[source_name] = len(jobs)
        all_jobs.extend(jobs)

    logger.info(f"[Aggregator] Collected {len(all_jobs)} total jobs | {source_stats}")

    # Post-filter alternance — filet de sécurité contre les faux positifs résiduels
    if contract_type in ("alternance", "apprentissage"):
        before = len(all_jobs)
        all_jobs = [j for j in all_jobs if _is_alternance_job(j)]
        for j in all_jobs:
            if j.get("contract_type") != "alternance":
                j["contract_type"] = "alternance"
        logger.info(f"[Aggregator] Post-filter alternance: {before} → {len(all_jobs)} jobs")

    return all_jobs


def deduplicate_jobs(
    jobs: list[dict[str, Any]],
    similarity_threshold: float = 0.85,
) -> list[dict[str, Any]]:
    """
    Remove duplicate job listings using fuzzy matching.

    Uses title + company similarity to catch near-duplicates like:
    - "Data Scientist" vs "Data Scientist - Paris"
    - "Software Engineer" vs "Software Engineer (H/F)"

    Args:
        jobs: List of job listings
        similarity_threshold: Min similarity ratio (0-1) to consider duplicate.
                              0.85 = 85% match → duplicate. Lower = more aggressive.

    Returns:
        Deduplicated list (keeps the first occurrence)
    """
    if not jobs:
        return []

    unique_jobs: list[dict[str, Any]] = []
    fingerprints: list[str] = []

    for job in jobs:
        fp = _create_fingerprint(job)

        # Check against all kept fingerprints for fuzzy match
        is_duplicate = False
        for existing_fp in fingerprints:
            ratio = SequenceMatcher(None, fp, existing_fp).ratio()
            if ratio >= similarity_threshold:
                is_duplicate = True
                break

        if not is_duplicate:
            fingerprints.append(fp)
            unique_jobs.append(job)

    if len(jobs) != len(unique_jobs):
        logger.info(
            f"[Dedup] {len(jobs)} → {len(unique_jobs)} "
            f"(removed {len(jobs) - len(unique_jobs)} duplicates, threshold={similarity_threshold})"
        )

    return unique_jobs


def _create_fingerprint(job: dict) -> str:
    """
    Create a normalized fingerprint for deduplication.

    Uses full title + company (not truncated) so SequenceMatcher
    can properly measure similarity between near-duplicates.
    """
    title = (job.get("title") or "").lower().strip()
    company = (job.get("company") or "").lower().strip()

    # Normalize common variations
    title = title.replace("senior", "sr").replace("junior", "jr")
    # Remove common suffixes that inflate difference
    for noise in ("(h/f)", "(f/h)", "(m/w/d)", "- cdi", "- cdd"):
        title = title.replace(noise, "")

    return f"{title.strip()}|{company.strip()}"


def sort_jobs_by_relevance(
    jobs: list[dict[str, Any]],
    query: str,
) -> list[dict[str, Any]]:
    """
    Sort jobs by relevance to query.

    Args:
        jobs: List of job listings
        query: Original search query

    Returns:
        Sorted list (most relevant first)
    """
    query_words = set(query.lower().split())

    def relevance_score(job: dict) -> float:
        title = (job.get("title") or "").lower()
        title_words = set(title.split())

        # Title word overlap
        overlap = len(query_words & title_words)
        title_score = overlap / len(query_words) if query_words else 0

        # Source priority
        source_priority = {
            "google_jobs": 0.9,
            "jsearch": 0.88,
            "linkedin": 0.85,
            "adzuna": 0.8,
            "indeed": 0.8,
            "glassdoor": 0.8,
            "remoteok": 0.7,
        }
        source_score = source_priority.get(job.get("source", ""), 0.5)

        # Has URL bonus
        url_bonus = 0.1 if job.get("url") else 0

        # Has description bonus
        desc_bonus = 0.1 if job.get("description") else 0

        return title_score * 0.5 + source_score * 0.3 + url_bonus + desc_bonus

    return sorted(jobs, key=relevance_score, reverse=True)
