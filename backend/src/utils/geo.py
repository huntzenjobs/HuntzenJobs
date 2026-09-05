"""
Geographic Utilities
====================
Country and city helpers using pycountry and the local geonamescache dataset.

Hybrid approach:
- Countries: pycountry (250+ countries, ISO 3166)
- Cities: local geonamescache dataset, safe for interactive autocomplete
"""

import gettext
import logging
import os
import unicodedata
from functools import lru_cache

import geonamescache
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


def _normalize_city_search(value: str) -> str:
    """Normalize a city name for accent-insensitive local matching."""
    normalized = unicodedata.normalize("NFKD", value.casefold().strip())
    return "".join(char for char in normalized if not unicodedata.combining(char))


@lru_cache(maxsize=256)
def _get_city_records(country_code: str) -> tuple[dict, ...]:
    """Return one country's local city records sorted by population."""
    code = country_code.upper().strip()
    if not pycountry.countries.get(alpha_2=code):
        return ()

    records = [
        city
        for city in _gc.get_cities().values()
        if city.get("countrycode", "").upper() == code
    ]
    records.sort(key=lambda city: city.get("population", 0), reverse=True)
    return tuple(records)


@lru_cache(maxsize=256)
def _get_searchable_city_records(
    country_code: str,
) -> tuple[tuple[str, int, str, tuple[str, ...]], ...]:
    """Pre-normalize a country's city names once per process."""
    records: list[tuple[str, int, str, tuple[str, ...]]] = []
    for city in _get_city_records(country_code):
        name = str(city.get("name") or "").strip()
        if not name:
            continue
        alternate_names = tuple(
            _normalize_city_search(str(alternate))
            for alternate in city.get("alternatenames", [])
            if alternate
        )
        records.append((
            name,
            int(city.get("population") or 0),
            _normalize_city_search(name),
            alternate_names,
        ))
    return tuple(records)


@lru_cache(maxsize=4096)
def _search_cities_local_cached(
    normalized_query: str,
    country_code: str,
    limit: int,
) -> tuple[str, ...]:
    ranked: list[tuple[int, int, str]] = []
    for name, population, normalized_name, alternate_names in _get_searchable_city_records(
        country_code
    ):
        if normalized_name.startswith(normalized_query):
            rank = 0
        elif any(alternate.startswith(normalized_query) for alternate in alternate_names):
            rank = 1
        elif normalized_query in normalized_name:
            rank = 2
        elif any(normalized_query in alternate for alternate in alternate_names):
            rank = 3
        else:
            continue

        ranked.append((rank, -population, name))

    ranked.sort()
    results: list[str] = []
    seen: set[str] = set()
    for _, _, name in ranked:
        key = _normalize_city_search(name)
        if key in seen:
            continue
        seen.add(key)
        results.append(name)
        if len(results) >= limit:
            break
    return tuple(results)


def search_cities_local(query: str, country_code: str, limit: int = 10) -> list[str]:
    """Search the bundled city dataset without an external autocomplete API."""
    normalized_query = _normalize_city_search(query)
    if len(normalized_query) < 2 or limit < 1:
        return []
    return list(
        _search_cities_local_cached(
            normalized_query,
            country_code.lower().strip(),
            limit,
        )
    )


@lru_cache(maxsize=8192)
def get_city_coordinates_local(
    city_name: str,
    country_code: str,
) -> tuple[float, float] | None:
    """Resolve exact city coordinates from the bundled dataset."""
    normalized_name = _normalize_city_search(city_name)
    if not normalized_name:
        return None

    for city in _get_city_records(country_code):
        known_names = {
            _normalize_city_search(str(city.get("name") or "")),
            *(
                _normalize_city_search(str(alternate))
                for alternate in city.get("alternatenames", [])
                if alternate
            ),
        }
        if normalized_name not in known_names:
            continue

        latitude = city.get("latitude")
        longitude = city.get("longitude")
        if latitude is None or longitude is None:
            return None
        return float(latitude), float(longitude)

    return None


async def search_cities_nominatim(
    query: str,
    country_code: str,
    limit: int = 10
) -> list[str]:
    """Compatibility wrapper backed by the local dataset, without HTTP."""
    return search_cities_local(query, country_code, limit)


async def get_cities_from_nominatim(country_code: str, limit: int = 500) -> list[str]:
    """Compatibility wrapper returning local cities without HTTP."""
    return get_cities_from_geonames(country_code, limit)


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
    return [str(city["name"]) for city in _get_city_records(country_code)[:limit]]


async def get_cities_for_country(
    country_code: str,
    limit: int = 500,
    use_fallback: bool = True
) -> list[str]:
    """
    Get cities for a country from the bundled local dataset.

    Args:
        country_code: ISO 3166-1 alpha-2 country code
        limit: Maximum number of cities to return (default: 500)
        use_fallback: Kept for API compatibility

    Returns:
        List of city names (sorted by population, descending)

    Examples:
        >>> await get_cities_for_country("by")
        ["Minsk", "Gomel", "Mogilev", "Vitebsk", ...]
        >>> await get_cities_for_country("fr", limit=10)
        ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", ...]
    """
    del use_fallback
    cities = get_cities_from_geonames(country_code, limit)
    if cities:
        logger.info(f"[GEO] Found {len(cities)} cities for {country_code} locally")
    return cities
