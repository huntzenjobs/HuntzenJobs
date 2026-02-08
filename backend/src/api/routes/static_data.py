"""
Static Data API Routes
======================
Hybrid approach: OpenStreetMap Nominatim + Local fallback (pycountry + geonamescache)
"""

import logging
from functools import lru_cache

import httpx
import pycountry
import geonamescache
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize geonames cache
gc = geonamescache.GeonamesCache()


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


async def fetch_cities_from_nominatim(country_code: str, country_name: str) -> list[str]:
    """
    Fetch cities from OpenStreetMap Nominatim API.

    Returns empty list if rate limited or error occurs.
    """
    try:
        # Search for major cities in the country
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "country": country_name,
            "featuretype": "city",
            "format": "json",
            "limit": 50,
            "addressdetails": 1
        }
        headers = {
            "User-Agent": "HuntZen Job Search/1.0"
        }

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, params=params, headers=headers)

            if response.status_code == 429:
                # Rate limited
                logger.warning(f"Nominatim rate limit hit for {country_name}")
                return []

            if response.status_code != 200:
                return []

            data = response.json()
            cities = []
            seen = set()

            for item in data:
                # Extract city name
                city_name = item.get("display_name", "").split(",")[0].strip()
                if city_name and city_name not in seen and len(city_name) > 2:
                    cities.append(city_name)
                    seen.add(city_name)

            return cities[:30]  # Limit to 30 cities

    except Exception as e:
        logger.warning(f"Nominatim fetch failed for {country_name}: {e}")
        return []


def get_cities_from_geonames(country_code: str) -> list[str]:
    """
    Fallback: Get cities from local geonamescache.
    """
    try:
        cities_data = gc.get_cities()
        country_cities = []

        for city in cities_data.values():
            if city.get("countrycode", "").lower() == country_code.lower():
                # Only major cities (population > 100k)
                if city.get("population", 0) > 100000:
                    country_cities.append(city["name"])

        # Sort by population (reverse) and take top 30
        return sorted(country_cities)[:30]

    except Exception as e:
        logger.error(f"Geonames fallback failed for {country_code}: {e}")
        return []


@router.get("/api/cities/{country_name}")
async def get_cities(country_name: str):
    """
    Get cities for a country.

    Hybrid approach:
    1. Try OpenStreetMap Nominatim (always up-to-date, free)
    2. Fallback to geonamescache (local, works offline)

    Args:
        country_name: Country name (e.g., "France", "États-Unis")

    Returns:
        List of city names for the country
    """
    # Find country code from name
    country_code = None
    for country in get_all_countries():
        if country["name"].lower() == country_name.lower():
            country_code = country["code"]
            break

    if not country_code:
        return {
            "success": True,
            "data": []
        }

    # Try Nominatim first
    cities = await fetch_cities_from_nominatim(country_code, country_name)

    # Fallback to geonames if Nominatim failed
    if not cities:
        logger.info(f"Using geonames fallback for {country_name}")
        cities = get_cities_from_geonames(country_code)

    return {
        "success": True,
        "data": cities,
        "source": "nominatim" if cities and cities != get_cities_from_geonames(country_code) else "geonames"
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
