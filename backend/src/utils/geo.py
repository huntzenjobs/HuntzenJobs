"""
Geographic Utilities
====================
Country and city helpers using pycountry, OpenStreetMap Nominatim, and geonamescache.

Hybrid approach:
- Countries: pycountry (250+ countries, ISO 3166)
- Cities: OpenStreetMap Nominatim API (primary) + geonamescache (fallback)
"""

import logging
from functools import lru_cache

import httpx
import pycountry
import geonamescache

logger = logging.getLogger(__name__)

# Initialize geonames cache for offline fallback
_gc = geonamescache.GeonamesCache()


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

            # French translations for common countries (optional)
            if lang == "fr":
                french_names = {
                    "United States": "États-Unis",
                    "United Kingdom": "Royaume-Uni",
                    "Germany": "Allemagne",
                    "Spain": "Espagne",
                    "Italy": "Italie",
                    "Netherlands": "Pays-Bas",
                    "Belgium": "Belgique",
                    "Switzerland": "Suisse",
                    "Austria": "Autriche",
                    "Belarus": "Biélorussie",
                    "Poland": "Pologne",
                    "Russia": "Russie",
                    "Ukraine": "Ukraine",
                    "Greece": "Grèce",
                    "Portugal": "Portugal",
                    "Sweden": "Suède",
                    "Norway": "Norvège",
                    "Denmark": "Danemark",
                    "Finland": "Finlande",
                    "Ireland": "Irlande",
                    "Czech Republic": "République Tchèque",
                    "Romania": "Roumanie",
                    "Hungary": "Hongrie",
                }
                return french_names.get(name, name)

            return name
    except Exception as e:
        logger.warning(f"[GEO] Failed to convert country code '{country_code}': {e}")

    # Fallback to uppercase code
    return country_code.upper()


@lru_cache(maxsize=256)
def country_code_to_language(country_code: str) -> str:
    """
    Get primary language code for a country.

    Args:
        country_code: ISO 3166-1 alpha-2 code

    Returns:
        Language code (e.g., "fr", "en", "de")

    Examples:
        >>> country_code_to_language("fr")
        "fr"
        >>> country_code_to_language("us")
        "en"
    """
    mapping = {
        "fr": "fr",
        "be": "fr",  # Belgium (French/Dutch)
        "ch": "fr",  # Switzerland (German/French/Italian)
        "lu": "fr",  # Luxembourg
        "de": "de",
        "at": "de",  # Austria
        "es": "es",
        "mx": "es",
        "ar": "es",
        "it": "it",
        "pt": "pt",
        "br": "pt",
        "nl": "nl",
        "ru": "ru",
        "by": "ru",  # Belarus (Russian/Belarusian)
        "ua": "uk",  # Ukraine
        "pl": "pl",
        "ja": "ja",
        "cn": "zh",
    }
    return mapping.get(country_code.lower(), "en")


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


async def search_cities_nominatim(
    query: str,
    country_code: str,
    limit: int = 10
) -> list[str]:
    """
    Search cities dynamically using OpenStreetMap Nominatim API.

    Real-time search as user types. This is the CORRECT way to search cities.

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
    if not query or len(query) < 1:
        return []

    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "countrycodes": country_code.lower(),
            "format": "json",
            "addressdetails": 1,
            "limit": limit,
            "featuretype": "city",  # Filter for cities only
        }
        headers = {
            "User-Agent": "HuntZen/3.0 (job search platform)"
        }

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()

        # Extract city names from results
        cities = []
        seen = set()  # Deduplicate

        for item in data:
            # Try to get city name from address details
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

        logger.info(f"[GEO] Nominatim search '{query}' in {country_code}: {len(cities)} results")
        return cities[:limit]

    except httpx.TimeoutException:
        logger.warning(f"[GEO] Nominatim timeout for query '{query}'")
        return []
    except Exception as e:
        logger.error(f"[GEO] Nominatim search failed: {e}")
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
