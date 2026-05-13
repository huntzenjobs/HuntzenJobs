"""
Geographic Utilities
====================
Country and city helpers using pycountry, OpenStreetMap Nominatim, and geonamescache.

Hybrid approach:
- Countries: pycountry (250+ countries, ISO 3166)
- Cities: OpenStreetMap Nominatim API (primary) + geonamescache (fallback)
"""

import gettext
import logging
import os
from functools import lru_cache

import geonamescache
import httpx
import pycountry

logger = logging.getLogger(__name__)

# Initialize geonames cache for offline fallback
_gc = geonamescache.GeonamesCache()

# Initialize French translator from pycountry built-in locales (250+ countries)
_localedir = os.path.join(os.path.dirname(pycountry.__file__), "locales")
try:
    _french_translator = gettext.translation(
        "iso3166-1", _localedir, languages=["fr"]
    ).gettext
except FileNotFoundError:
    logger.warning("[GEO] French locale not found for pycountry, falling back to English")
    _french_translator = None


@lru_cache(maxsize=256)
def country_code_to_name(country_code: str, lang: str = "en") -> str:
    """
    Convert ISO 3166-1 alpha-2 country code to full country name.

    Args:
        country_code: ISO 3166-1 alpha-2 code (e.g., "fr", "us", "by")
        lang: Language for country name ("en" or "fr")

    Returns:
        Full country name (e.g., "France", "United States", "Belarus")
        Falls back to uppercase code if not found

    Examples:
        >>> country_code_to_name("fr")
        "France"
        >>> country_code_to_name("by")
        "Belarus"
        >>> country_code_to_name("us")
        "United States"
    """
    try:
        country = pycountry.countries.get(alpha_2=country_code.upper())
        if country:
            name = country.name

            # French translation via pycountry built-in locales (250+ countries)
            if lang == "fr" and _french_translator:
                return _french_translator(name)

            return name
    except Exception as e:
        logger.warning(f"[GEO] Failed to convert country code '{country_code}': {e}")

    # Fallback to uppercase code
    return country_code.upper()


@lru_cache(maxsize=256)
def country_code_to_language(country_code: str) -> str:
    """
    Get primary language code for a country using geonamescache.

    Extracts the first (primary) language from geonamescache country data,
    which covers all countries. Falls back to "en" if not found.

    Args:
        country_code: ISO 3166-1 alpha-2 code

    Returns:
        Language code (e.g., "fr", "en", "de")

    Examples:
        >>> country_code_to_language("fr")
        "fr"
        >>> country_code_to_language("us")
        "en"
        >>> country_code_to_language("jp")
        "ja"
    """
    try:
        countries = _gc.get_countries()
        country = countries.get(country_code.upper())
        if country:
            languages_str = country.get("languages", "")
            if languages_str:
                # Format is "fr-FR,frp,br,co" — take the first, strip region
                primary = languages_str.split(",")[0]
                return primary.split("-")[0]
    except Exception as e:
        logger.warning(f"[GEO] Failed to get language for '{country_code}': {e}")

    return "en"


def format_location_query(
    query: str,
    city: str = "",
    country_code: str = "fr",
    lang: str = "en"
) -> str:
    """
    Format a job search query with location.

    Args:
        query: Job title or keywords
        city: City name (optional)
        country_code: ISO country code
        lang: Language for country name

    Returns:
        Formatted query string (e.g., "Data Engineer in Paris, France")

    Examples:
        >>> format_location_query("Developer", "Paris", "fr")
        "Developer in Paris, France"
        >>> format_location_query("Engineer", "", "by")
        "Engineer in Belarus"
    """
    country_name = country_code_to_name(country_code, lang)

    if city:
        location = f"{city}, {country_name}"
    else:
        location = country_name

    return f"{query} in {location}"


@lru_cache(maxsize=4)
def _get_fr_subdivisions() -> tuple:
    """
    Build French regions and departments from pycountry ISO 3166-2 data.
    Cached — parsed once at startup.

    Returns:
        (regions, departments) — each item is a dict with "name" and "type" keys.
        Departments also include "code" (e.g., "75" for Paris).
    """
    regions = []
    departments = []
    region_types = {"Metropolitan region", "Overseas region"}
    dept_types = {
        "Metropolitan department", "Overseas department",
        "Overseas territorial collectivity", "Territorial collectivity",
        "Metropolitan collectivity with special status",
    }

    for sub in pycountry.subdivisions.get(country_code="FR"):
        # "FR-75" → "75"
        code = sub.code.split("-", 1)[-1]

        if sub.type in region_types:
            regions.append({"name": sub.name, "type": "region"})
        elif sub.type in dept_types:
            departments.append({"name": sub.name, "code": code, "type": "department"})

    return tuple(regions), tuple(departments)


def search_french_locations(query: str, limit: int = 5) -> list[dict]:
    """
    Search French regions and departments using pycountry ISO 3166-2 data.

    Matches on name (contains, case-insensitive) and department code (startswith).
    Regions are returned before departments.

    Args:
        query: Search query (e.g., "bre", "31", "île")
        limit: Maximum number of results (default: 5)

    Returns:
        List of matching locations with "name", "type", and optionally "code"

    Examples:
        >>> search_french_locations("bre")
        [{"name": "Bretagne", "type": "region"}, ...]
        >>> search_french_locations("31")
        [{"name": "Haute-Garonne", "code": "31", "type": "department"}]
    """
    query_lower = query.lower().strip()
    if not query_lower:
        return []

    regions, departments = _get_fr_subdivisions()
    results: list[dict] = []
    seen: set[str] = set()

    for region in regions:
        if query_lower in region["name"].lower() and region["name"].lower() not in seen:
            results.append(region)
            seen.add(region["name"].lower())

    for dept in departments:
        name_match = query_lower in dept["name"].lower()
        code_match = dept["code"].lower().startswith(query_lower)
        if (name_match or code_match) and dept["name"].lower() not in seen:
            results.append(dept)
            seen.add(dept["name"].lower())

    return results[:limit]


async def search_cities_nominatim(
    query: str,
    country_code: str,
    limit: int = 10
) -> list[str]:
    """
    Search cities dynamically using Nominatim + geonames hybrid approach.

    For short queries (< 4 chars), combines Nominatim with local geonames
    to improve results. This fixes the "Par" → Paris issue.

    Args:
        query: City name search query (e.g., "Garges", "Paris")
        country_code: ISO 3166-1 alpha-2 country code to filter results
        limit: Maximum number of results (default: 10)

    Returns:
        List of matching city names

    Examples:
        >>> await search_cities_nominatim("Garges", "fr")
        ["Garges-lès-Gonesse", "Garges-lès-Beaune"]
        >>> await search_cities_nominatim("Par", "fr")
        ["Paris", "Paray-le-Monial", "Paray-Vieille-Poste"]
    """
    if not query or len(query) < 2:
        return []

    cities = []
    seen = set()

    # Step 1: Try Nominatim first
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "countrycodes": country_code.lower(),
            "format": "json",
            "addressdetails": 1,
            "limit": limit * 2,  # Get more to filter later
        }
        headers = {
            "User-Agent": "HuntZen/3.0 (job search platform)"
        }

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()

        # Extract city names from Nominatim results
        # Prioritize results of type "administrative" (real cities)
        admin_cities = []
        other_cities = []

        for item in data:
            address = item.get("address", {})
            city = (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("municipality")
            )

            if city and city not in seen:
                seen.add(city)
                if item.get("type") == "administrative":
                    admin_cities.append(city)
                else:
                    other_cities.append(city)

        # Combine: administrative first, then others
        cities = admin_cities + other_cities

        logger.info(f"[GEO] Nominatim search '{query}' in {country_code}: {len(cities)} results")

    except httpx.TimeoutException:
        logger.warning(f"[GEO] Nominatim timeout for query '{query}'")
    except Exception as e:
        logger.error(f"[GEO] Nominatim search failed: {e}")

    # Step 2: For short queries (< 4 chars), ALWAYS add geonames for better accuracy
    if len(query) < 4:
        logger.info(f"[GEO] Short query '{query}', adding geonames for better accuracy")

        try:
            # Get all cities from geonames
            all_cities = get_cities_from_geonames(country_code, limit=500)

            # Filter cities that start with query (case-insensitive)
            query_lower = query.lower()
            matching_cities = [
                city for city in all_cities
                if city.lower().startswith(query_lower) and city not in seen
            ]

            # Prioritize geonames matches (they start with the query) over Nominatim
            # Geonames first, then Nominatim results
            cities = matching_cities + cities

            logger.info(f"[GEO] Geonames added {len(matching_cities)} matching cities")

        except Exception as e:
            logger.error(f"[GEO] Geonames fallback failed: {e}")

    return cities[:limit]


async def get_cities_from_nominatim(country_code: str, limit: int = 500) -> list[str]:
    """
    Get all cities for a country from OpenStreetMap Nominatim API.

    Fetches major cities from Nominatim without a specific query.

    Args:
        country_code: ISO 3166-1 alpha-2 country code
        limit: Maximum number of cities to return (default: 500)

    Returns:
        List of city names

    Examples:
        >>> await get_cities_from_nominatim("km")  # Comores
        ["Moroni", "Mutsamudu", "Fomboni", ...]
        >>> await get_cities_from_nominatim("fr")
        ["Paris", "Marseille", "Lyon", ...]
    """
    if not country_code:
        return []

    try:
        url = "https://nominatim.openstreetmap.org/search"
        # Note: Nominatim search without 'q' or city/street filter might fail with 400
        # This function is intended to get "all cities" but Nominatim doesn't support that
        # without a generic query or a structured filter.
        # If no query is provided, we should probably just return empty and let fallback handle it.
        params = {
            "countrycodes": country_code.lower(),
            "format": "json",
            "addressdetails": 1,
            "limit": min(limit, 100),  # Nominatim max limit
        }
        headers = {
            "User-Agent": "HuntZen/3.0 (job search platform)"
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()

        # Extract city names from results
        cities = []
        seen = set()

        for item in data:
            address = item.get("address", {})
            city = (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("municipality")
                or item.get("display_name", "").split(",")[0]
            )

            if city and city not in seen:
                cities.append(city)
                seen.add(city)

        logger.info(f"[GEO] Nominatim found {len(cities)} cities for {country_code}")
        return cities

    except httpx.TimeoutException:
        logger.warning(f"[GEO] Nominatim timeout for country {country_code}")
        return []
    except Exception as e:
        logger.error(f"[GEO] Nominatim failed for {country_code}: {e}")
        return []


def get_cities_from_geonames(country_code: str, limit: int = 500) -> list[str]:
    """
    Get cities from local geonamescache.

    Cities are sorted by population (largest first).

    Args:
        country_code: ISO 3166-1 alpha-2 country code
        limit: Maximum number of cities to return (default: 500)

    Returns:
        List of city names (sorted by population, descending)

    Examples:
        >>> get_cities_from_geonames("fr")
        ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", ...]
        >>> get_cities_from_geonames("by")
        ["Minsk", "Gomel", "Mogilev", "Vitebsk", ...]
    """
    try:
        cities_data = _gc.get_cities()
        country_cities = []

        for city in cities_data.values():
            if city.get("countrycode", "").upper() == country_code.upper():
                # Accept all cities (no population filter)
                country_cities.append({
                    "name": city["name"],
                    "population": city.get("population", 0)
                })

        # Sort by population (descending) and extract names
        country_cities.sort(key=lambda x: x["population"], reverse=True)
        return [city["name"] for city in country_cities[:limit]]

    except Exception as e:
        logger.error(f"[GEO] Geonames fallback failed for {country_code}: {e}")
        return []


async def get_cities_for_country(
    country_code: str,
    limit: int = 500,
    use_fallback: bool = True
) -> list[str]:
    """
    Get cities for a country (hybrid approach).

    Tries OpenStreetMap Nominatim first, falls back to local geonamescache.

    Args:
        country_code: ISO 3166-1 alpha-2 country code
        limit: Maximum number of cities to return (default: 500)
        use_fallback: Whether to use geonamescache fallback if Nominatim fails

    Returns:
        List of city names (sorted by population, descending)

    Examples:
        >>> await get_cities_for_country("by")
        ["Minsk", "Gomel", "Mogilev", "Vitebsk", ...]
        >>> await get_cities_for_country("fr", limit=10)
        ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", ...]
    """
    # Try Nominatim first (always up-to-date)
    cities = await get_cities_from_nominatim(country_code, limit)

    if cities:
        logger.info(f"[GEO] Found {len(cities)} cities for {country_code} via Nominatim")
        return cities

    # Fallback to local cache
    if use_fallback:
        cities = get_cities_from_geonames(country_code, limit)
        if cities:
            logger.info(f"[GEO] Found {len(cities)} cities for {country_code} via geonames (fallback)")
            return cities

    logger.warning(f"[GEO] No cities found for {country_code}")
    return []
