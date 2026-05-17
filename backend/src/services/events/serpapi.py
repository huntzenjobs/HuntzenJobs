"""
International Events via SerpAPI Google Events
================================================
Fetches career fairs and student events worldwide.
Results are cached 30 min per country to minimize API usage.
"""

import logging
from datetime import datetime

import httpx

from src.config.settings import settings
from src.utils.cache import redis_cache

logger = logging.getLogger(__name__)

# Country → localized query term
COUNTRY_QUERIES: dict[str, str] = {
    "United States": "student career fair",
    "United Kingdom": "student career fair",
    "Canada": "student career fair",
    "Australia": "student career fair",
    "Germany": "career fair student",
    "Netherlands": "career fair student",
    "Belgium": "forum emploi étudiant",
    "Spain": "feria empleo estudiante",
    "Italy": "career fair studenti",
    "India": "education career fair student",
    "Japan": "career fair student",
    "Singapore": "career fair student",
    "UAE": "career fair student",
    "South Africa": "student career fair",
    "Brazil": "feira de carreira estudante",
    "Morocco": "forum emploi étudiant",
    "France": "salon étudiant emploi",
}

SUPPORTED_COUNTRIES = sorted(COUNTRY_QUERIES.keys())


@redis_cache(ttl=1800, prefix="events_int")
async def fetch_events_for_country(country: str) -> list[dict]:
    """
    Fetch upcoming career/student events for a given country via SerpAPI.
    Cached 30 min per country to avoid redundant API calls.
    """
    query_term = COUNTRY_QUERIES.get(country, "career fair student")
    api_key = settings.get_serpapi_key()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://serpapi.com/search.json",
                params={
                    "engine": "google_events",
                    "q": f"{query_term} {country}",
                    "hl": "en",
                    "api_key": api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"[Events] SerpAPI error for {country}: {e}")
        return []

    today = datetime.now()
    events: list[dict] = []

    for item in data.get("events_results", []):
        try:
            start_date_raw = item.get("date", {}).get("start_date", "")
            if not start_date_raw:
                continue

            parsed = datetime.strptime(start_date_raw, "%b %d").replace(year=today.year)
            if parsed < today:
                continue

            address = item.get("address", [])
            city = address[-1] if len(address) > 1 else (address[0] if address else country)
            venue = item.get("venue", {})
            organizer = venue.get("name", "") if isinstance(venue, dict) else ""

            events.append({
                "title": item.get("title", ""),
                "event_type": _classify_event_type(item.get("title", "")),
                "public": _classify_public(item.get("title", "")),
                "sector": _classify_sector(item.get("title", "")),
                "level": "all",
                "date_start": parsed.strftime("%Y-%m-%d"),
                "date_end": None,
                "time_start": None,
                "time_end": item.get("date", {}).get("when"),
                "city": city,
                "region": country,
                "address": ", ".join(address) if address else None,
                "format": "virtual" if _is_virtual(item.get("title", "")) else "physical",
                "organizer": organizer,
                "description": None,
                "url": item.get("link", ""),
                "source": "serpapi",
                "registration_url": None,
                "is_free": None,
                "companies_count": None,
            })
        except Exception as e:
            logger.debug(f"[Events] SerpAPI parse error ({country}): {e}")
            continue

    logger.info(f"[Events] SerpAPI {country}: {len(events)} events")
    return events


def _classify_event_type(title: str) -> str:
    t = title.lower()
    if any(k in t for k in ["job dating", "jobdating"]):
        return "job_dating"
    if any(k in t for k in ["webinar", "online", "virtual", "en ligne", "visio"]):
        return "webinar"
    if "forum" in t:
        return "forum"
    return "salon"


def _classify_public(title: str) -> str:
    t = title.lower()
    if any(k in t for k in ["student", "étudiant", "graduate", "college", "university", "youth", "alternance", "stage"]):
        return "students"
    if any(k in t for k in ["senior", "reconversion", "+45", "+50"]):
        return "seniors"
    if any(k in t for k in ["professional", "cadre", "manager", "executive"]):
        return "pros"
    return "all"


def _classify_sector(title: str) -> str:
    t = title.lower()
    if any(k in t for k in ["tech", "it", "digital", "data", "cyber", "software", "numérique"]):
        return "tech"
    if any(k in t for k in ["health", "medical", "santé", "nursing", "pharma"]):
        return "health"
    if any(k in t for k in ["finance", "banking", "banque", "accounting", "insurance"]):
        return "finance"
    if any(k in t for k in ["engineering", "industrie", "manufacturing", "aerospace"]):
        return "industry"
    if any(k in t for k in ["retail", "commerce", "sales", "vente"]):
        return "retail"
    return "all"


def _is_virtual(title: str) -> bool:
    t = title.lower()
    return any(k in t for k in ["online", "virtual", "webinar", "en ligne", "visio", "remote"])
