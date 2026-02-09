"""
Geographic Utilities
====================
Country and city helpers using pycountry and geonamescache.
"""

import logging
from functools import lru_cache

import pycountry

logger = logging.getLogger(__name__)


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
