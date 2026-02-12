"""
Job Aggregator
===============
Combines results from multiple job providers with optional geographic filtering.
"""

import asyncio
import logging
from typing import Any, Optional

from src.services.job_providers.base import BaseJobProvider
from src.services.geocoding_service import get_geocoding_service
from src.services.distance_service import DistanceService
from src.config.geocoding import get_geocoding_settings

logger = logging.getLogger(__name__)

geocoding_settings = get_geocoding_settings()


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
            # Adzuna supports max_days and contract_type
            if hasattr(provider, 'name') and provider.name == 'adzuna':
                kwargs["max_days"] = max_days
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

    # Apply geographic radius filtering if requested
    if radius_km and location and geocoding_settings.enable_radius_search:
        filtered_jobs = await filter_jobs_by_radius(
            jobs=all_jobs,
            search_location=location,
            country_code=country_code,
            radius_km=radius_km
        )
        logger.info(
            f"[Aggregator] Radius filter: {len(all_jobs)} → {len(filtered_jobs)} jobs "
            f"within {radius_km}km of {location}"
        )
        return filtered_jobs

    return all_jobs


def deduplicate_jobs(
    jobs: list[dict[str, Any]],
    similarity_threshold: float = 0.85,
) -> list[dict[str, Any]]:
    """
    Remove duplicate job listings.
    
    Uses title + company matching to identify duplicates.
    
    Args:
        jobs: List of job listings
        similarity_threshold: Similarity threshold for duplicates
        
    Returns:
        Deduplicated list
    """
    if not jobs:
        return []
    
    seen_fingerprints = set()
    unique_jobs = []
    
    for job in jobs:
        fingerprint = _create_fingerprint(job)
        
        if fingerprint not in seen_fingerprints:
            seen_fingerprints.add(fingerprint)
            unique_jobs.append(job)
    
    return unique_jobs


def _create_fingerprint(job: dict) -> str:
    """Create a fingerprint for deduplication."""
    title = (job.get("title") or "").lower()
    company = (job.get("company") or "").lower()
    
    # Normalize common variations
    title = title.replace("senior", "sr").replace("junior", "jr")
    
    # Use first 30 chars of title and 20 of company
    return f"{title[:30].strip()}|{company[:20].strip()}"


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


async def filter_jobs_by_radius(
    jobs: list[dict[str, Any]],
    search_location: str,
    country_code: str,
    radius_km: int
) -> list[dict[str, Any]]:
    """
    Filter jobs by geographic distance from search location.

    Args:
        jobs: List of job listings
        search_location: City name to search from
        country_code: ISO country code
        radius_km: Maximum distance in kilometers

    Returns:
        Filtered list of jobs within radius, sorted by distance
    """
    if not jobs or not search_location:
        return jobs

    geocoding_service = get_geocoding_service()

    # Geocode search location
    search_coords = await geocoding_service.geocode_city(search_location, country_code)

    if not search_coords:
        logger.warning(
            f"[Aggregator] Could not geocode search location: {search_location}, {country_code}. "
            f"Returning all jobs without filtering."
        )
        return jobs

    logger.info(
        f"[Aggregator] Search location: {search_location} → "
        f"({search_coords.latitude}, {search_coords.longitude})"
    )

    # Filter and annotate jobs with distance
    filtered_jobs = []

    for job in jobs:
        job_location = job.get("location", "")

        # Skip jobs without location
        if not job_location:
            logger.debug(f"[Aggregator] Skipping job without location: {job.get('title')}")
            continue

        # Always include remote jobs (skip distance filtering)
        if _is_remote_job(job_location):
            job["distance_km"] = 0
            job["is_remote"] = True
            filtered_jobs.append(job)
            logger.debug(f"[Aggregator] Including remote job: {job.get('title')}")
            continue

        # Extract city name from job location (e.g., "Paris, Île-de-France" → "Paris")
        job_city = _extract_city_from_location(job_location)

        # Geocode job location
        job_coords = await geocoding_service.geocode_city(job_city, country_code)

        if not job_coords:
            # STRICT MODE: If radius filtering is enabled, exclude non-geocodable jobs
            # to ensure accurate distance filtering
            logger.debug(
                f"[Aggregator] Could not geocode job location: {job_location}. "
                f"EXCLUDING from results (strict radius mode enabled)."
            )
            continue  # Exclude job when radius is specified

        # Calculate distance
        distance_km = DistanceService.calculate_distance(
            (search_coords.latitude, search_coords.longitude),
            (job_coords.latitude, job_coords.longitude)
        )

        # Filter by radius
        if distance_km <= radius_km:
            job["distance_km"] = distance_km
            job["is_remote"] = False
            filtered_jobs.append(job)
            logger.debug(
                f"[Aggregator] Including job: {job.get('title')} at {job_location} "
                f"({distance_km:.1f} km)"
            )
        else:
            logger.debug(
                f"[Aggregator] Excluding job: {job.get('title')} at {job_location} "
                f"({distance_km:.1f} km > {radius_km} km)"
            )

    # Sort by distance (remote jobs first, then by distance)
    filtered_jobs.sort(key=lambda j: (
        0 if j.get("is_remote") else 1,  # Remote jobs first
        j.get("distance_km") if j.get("distance_km") is not None else 999  # Then by distance
    ))

    return filtered_jobs


def _extract_city_from_location(location: str) -> str:
    """
    Extract city name from full location string.

    Examples:
        "Paris, Île-de-France" → "Paris"
        "Lyon, Auvergne-Rhône-Alpes, France" → "Lyon"
        "Remote" → "Remote"
    """
    if not location:
        return ""

    # Split by comma and take first part
    parts = location.split(",")
    city = parts[0].strip()

    return city


def _is_remote_job(location: str) -> bool:
    """
    Check if a job is remote based on location string.

    Returns:
        True if job is remote, False otherwise
    """
    if not location:
        return False

    location_lower = location.lower()

    remote_keywords = [
        "remote",
        "télétravail",
        "teletravail",
        "full remote",
        "100% remote",
        "anywhere",
        "world",
        "flexible"
    ]

    return any(keyword in location_lower for keyword in remote_keywords)
