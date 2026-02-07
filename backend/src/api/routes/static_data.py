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
        List of country names
    """
    return [
        "France",
        "Belgique",
        "Suisse",
        "Luxembourg",
        "Canada",
        "Allemagne",
        "Royaume-Uni",
        "Espagne",
        "Italie",
        "Pays-Bas",
        "Portugal",
        "États-Unis",
    ]


@router.get("/api/contract-types")
async def get_contract_types():
    """
    Get list of contract types.

    Returns:
        List of contract type names
    """
    return [
        "CDI",
        "CDD",
        "Stage",
        "Alternance",
        "Freelance",
        "Intérim",
        "Contrat pro",
        "VIE",
    ]
