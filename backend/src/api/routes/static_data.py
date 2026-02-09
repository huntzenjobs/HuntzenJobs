"""
Static Data API Routes
======================
Hybrid approach: OpenStreetMap Nominatim + Local fallback (pycountry + geonamescache)
"""

import logging
from functools import lru_cache

import pycountry
from fastapi import APIRouter

from src.utils.geo import country_code_to_name, get_cities_for_country

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache(maxsize=1)
def get_all_countries() -> list[dict]:
    """
    Get all countries using pycountry (ISO 3166-1 alpha-2).
    Cached for performance.
    """
    countries = []
    for country in pycountry.countries:
        # Use French name if available, otherwise English
        name = country.name
        # French translations for common countries
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
            "Greece": "Grèce",
            "Portugal": "Portugal",
            "Poland": "Pologne",
            "Sweden": "Suède",
            "Norway": "Norvège",
            "Denmark": "Danemark",
            "Finland": "Finlande",
            "Ireland": "Irlande",
            "Czech Republic": "République Tchèque",
            "Romania": "Roumanie",
            "Hungary": "Hongrie",
            "South Africa": "Afrique du Sud",
            "Egypt": "Égypte",
            "Morocco": "Maroc",
            "Algeria": "Algérie",
            "Tunisia": "Tunisie",
            "Saudi Arabia": "Arabie Saoudite",
            "United Arab Emirates": "Émirats Arabes Unis",
            "China": "Chine",
            "Japan": "Japon",
            "South Korea": "Corée du Sud",
            "India": "Inde",
            "Thailand": "Thaïlande",
            "Vietnam": "Vietnam",
            "Indonesia": "Indonésie",
            "Malaysia": "Malaisie",
            "Singapore": "Singapour",
            "Philippines": "Philippines",
            "Israel": "Israël",
            "Turkey": "Turquie",
            "Australia": "Australie",
            "New Zealand": "Nouvelle-Zélande",
            "Canada": "Canada",
            "Brazil": "Brésil",
            "Argentina": "Argentine",
            "Chile": "Chili",
            "Colombia": "Colombie",
            "Peru": "Pérou",
            "Mexico": "Mexique",
        }
        name = french_names.get(country.name, country.name)

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
    cities = await get_cities_for_country(country_code, limit=50)

    return {
        "success": True,
        "data": cities,
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
