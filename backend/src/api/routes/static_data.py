"""
Static Data API Routes
======================
Provides static/reference data for the application.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/countries")
async def get_countries():
    """
    Get list of supported countries for job search.

    Returns:
        List of countries with name and ISO code
    """
    return {
        "success": True,
        "data": [
            {"name": "France", "code": "fr"},
            {"name": "Belgique", "code": "be"},
            {"name": "Suisse", "code": "ch"},
            {"name": "Luxembourg", "code": "lu"},
            {"name": "Canada", "code": "ca"},
            {"name": "Allemagne", "code": "de"},
            {"name": "Royaume-Uni", "code": "gb"},
            {"name": "Espagne", "code": "es"},
            {"name": "Italie", "code": "it"},
            {"name": "Pays-Bas", "code": "nl"},
            {"name": "Portugal", "code": "pt"},
            {"name": "États-Unis", "code": "us"},
        ]
    }


@router.get("/api/cities/{country_name}")
async def get_cities(country_name: str):
    """
    Get list of major cities for a country.

    Args:
        country_name: Country name (e.g., "France", "Belgique")

    Returns:
        List of city names for the country
    """
    # Map country names to major cities
    cities_by_country = {
        "France": ["Paris", "Lyon", "Marseille", "Toulouse", "Lille", "Bordeaux", "Nantes", "Nice", "Strasbourg", "Rennes", "Grenoble", "Montpellier"],
        "Belgique": ["Bruxelles", "Anvers", "Gand", "Charleroi", "Liège", "Bruges", "Namur", "Louvain"],
        "Suisse": ["Zurich", "Genève", "Bâle", "Lausanne", "Berne", "Winterthour", "Lucerne", "Saint-Gall"],
        "Luxembourg": ["Luxembourg", "Esch-sur-Alzette", "Differdange", "Dudelange"],
        "Canada": ["Toronto", "Montréal", "Vancouver", "Calgary", "Ottawa", "Edmonton", "Québec", "Winnipeg"],
        "Allemagne": ["Berlin", "Munich", "Hambourg", "Francfort", "Cologne", "Stuttgart", "Düsseldorf", "Dortmund"],
        "Royaume-Uni": ["Londres", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Newcastle", "Sheffield"],
        "Espagne": ["Madrid", "Barcelone", "Valence", "Séville", "Saragosse", "Malaga", "Murcie", "Bilbao"],
        "Italie": ["Rome", "Milan", "Naples", "Turin", "Palerme", "Gênes", "Bologne", "Florence"],
        "Pays-Bas": ["Amsterdam", "Rotterdam", "La Haye", "Utrecht", "Eindhoven", "Groningue", "Tilburg"],
        "Portugal": ["Lisbonne", "Porto", "Braga", "Coimbra", "Funchal", "Setúbal"],
        "États-Unis": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphie", "San Antonio", "San Diego", "Dallas", "San José"],
    }

    cities = cities_by_country.get(country_name, [])
    return {
        "success": True,
        "data": cities
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
