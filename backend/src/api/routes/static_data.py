"""
Static Data API Routes
======================
Hybrid approach: OpenStreetMap Nominatim + Local fallback (pycountry + geonamescache)
"""

import logging
from functools import lru_cache

import pycountry
from fastapi import APIRouter, Query

from src.utils.geo import country_code_to_name, get_cities_for_country, search_cities_nominatim

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache(maxsize=1)
def get_all_countries() -> list[dict]:
    """
    Get all countries using pycountry (ISO 3166-1 alpha-2).
    French names via pycountry built-in locales (250+ countries).
    Cached for performance.
    """
    countries = []
    for country in pycountry.countries:
        name = country_code_to_name(country.alpha_2, lang="fr")

        countries.append({
            "name": name,
            "code": country.alpha_2.lower()
        })

    # Sort alphabetically by name
    return sorted(countries, key=lambda x: x["name"])


@router.get("/api/countries")
async def get_countries():
    """
    Get all countries (ISO 3166-1 alpha-2) using pycountry.

    Returns:
        List of all countries with name and ISO code
    """
    return {
        "success": True,
        "data": get_all_countries()
    }


@router.get("/api/cities/{country_name}")
async def get_cities(country_name: str):
    """
    Get cities for a country using hybrid approach.

    Uses centralized geo utilities (OpenStreetMap Nominatim + geonamescache fallback).

    Args:
        country_name: Country name (e.g., "France", "Biélorussie", "Belarus")

    Returns:
        List of major city names for the country

    Examples:
        GET /api/cities/France → ["Paris", "Marseille", "Lyon", ...]
        GET /api/cities/Belarus → ["Minsk", "Gomel", "Mogilev", ...]
    """
    # Find country code from name (supports both English and French names)
    country_code = None
    for country in get_all_countries():
        if country["name"].lower() == country_name.lower():
            country_code = country["code"]
            break

    # Also try direct country lookup by name (English)
    if not country_code:
        try:
            country = pycountry.countries.search_fuzzy(country_name)[0]
            country_code = country.alpha_2.lower()
        except Exception:
            pass

    if not country_code:
        return {
            "success": True,
            "data": [],
            "message": f"Country not found: {country_name}"
        }

    # Use centralized geo utility (Nominatim + geonames fallback)
    cities = await get_cities_for_country(country_code, limit=500)

    return {
        "success": True,
        "data": cities,
        "country_code": country_code,
        "count": len(cities)
    }


@router.get("/api/cities/search")
async def search_cities(
    q: str = Query(..., min_length=1, description="City search query"),
    country_code: str = Query(..., min_length=2, max_length=2, description="ISO country code"),
    limit: int = Query(default=10, ge=1, le=20, description="Max results")
):
    """
    Search cities dynamically using OpenStreetMap Nominatim.

    Real-time city search as user types. This is the CORRECT approach.

    Args:
        q: City name query (e.g., "Garges", "Par", "Minsk")
        country_code: ISO 3166-1 alpha-2 country code (e.g., "fr", "by")
        limit: Maximum number of results (default: 10)

    Returns:
        List of matching city names

    Examples:
        GET /api/cities/search?q=Garges&country_code=fr
        → ["Garges-lès-Gonesse", "Garges-lès-Beaune"]

        GET /api/cities/search?q=Par&country_code=fr
        → ["Paris", "Paray-le-Monial", ...]
    """
    cities = await search_cities_nominatim(q, country_code, limit)

    return {
        "success": True,
        "data": cities,
        "query": q,
        "country_code": country_code,
        "count": len(cities)
    }


@router.get("/api/contract-types")
async def get_contract_types():
    """
    Get list of contract types.

    Returns:
        List of contract type objects with id and label
    """
    return {
        "success": True,
        "data": [
            {"id": "cdi", "label": "CDI", "label_en": "Permanent Contract"},
            {"id": "cdd", "label": "CDD", "label_en": "Fixed-term Contract"},
            {"id": "stage", "label": "Stage", "label_en": "Internship"},
            {"id": "alternance", "label": "Alternance", "label_en": "Work-study"},
            {"id": "freelance", "label": "Freelance", "label_en": "Freelance"},
            {"id": "interim", "label": "Intérim", "label_en": "Temporary"},
            {"id": "contrat_pro", "label": "Contrat pro", "label_en": "Professional Contract"},
            {"id": "vie", "label": "VIE", "label_en": "International Volunteer"},
        ]
    }
