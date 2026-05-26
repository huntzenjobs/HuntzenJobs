"""
Tests unitaires : normalisation des noms de pays pour l'Agent Expadation.

Couvre les 20 pays présents dans la base vectorielle et leurs alias FR/EN/codes.
"""

import pytest

from src.agents.expat.main_agent import _normalize_country


@pytest.mark.parametrize(
    "name,expected",
    [
        # France
        ("France", "FR"), ("france", "FR"), ("FR", "FR"), ("fr", "FR"),
        # Allemagne
        ("Allemagne", "DE"), ("Germany", "DE"), ("Deutschland", "DE"), ("DE", "DE"),
        # Canada
        ("Canada", "CA"), ("canada", "CA"), ("CA", "CA"),
        # Royaume-Uni
        ("Royaume-Uni", "GB"), ("Royaume Uni", "GB"), ("UK", "GB"),
        ("Angleterre", "GB"), ("Grande-Bretagne", "GB"), ("United Kingdom", "GB"),
        # USA
        ("Etats-Unis", "US"), ("États-Unis", "US"), ("USA", "US"),
        ("United States", "US"), ("US", "US"),
        # Irlande
        ("Irlande", "IE"), ("Ireland", "IE"),
        # Belgique
        ("Belgique", "BE"), ("Belgium", "BE"),
        # Suisse
        ("Suisse", "CH"), ("Switzerland", "CH"), ("Schweiz", "CH"),
        # Suède
        ("Suede", "SE"), ("Suède", "SE"), ("Sweden", "SE"),
        # Norvège
        ("Norvege", "NO"), ("Norvège", "NO"), ("Norway", "NO"),
        # Finlande
        ("Finlande", "FI"), ("Finland", "FI"),
        # Japon
        ("Japon", "JP"), ("Japan", "JP"),
        # Pays-Bas
        ("Pays-Bas", "NL"), ("Pays Bas", "NL"), ("Netherlands", "NL"), ("Hollande", "NL"),
        # Australie
        ("Australie", "AU"), ("Australia", "AU"),
        # Danemark
        ("Danemark", "DK"), ("Denmark", "DK"),
        # Singapour
        ("Singapour", "SG"), ("Singapore", "SG"),
        # Luxembourg
        ("Luxembourg", "LU"),
        # Autriche
        ("Autriche", "AT"), ("Austria", "AT"),
        # Espagne
        ("Espagne", "ES"), ("Spain", "ES"), ("España", "ES"),
        # Portugal
        ("Portugal", "PT"),
    ],
)
def test_normalize_country_known(name: str, expected: str) -> None:
    """Vérifie le mapping nom de pays vers code ISO 2 lettres."""
    assert _normalize_country(name) == expected


@pytest.mark.parametrize(
    "name",
    ["", "  ", "Mars", "Atlantide", "pays-inconnu", "ZZ"],
)
def test_normalize_country_unknown_returns_empty(name: str) -> None:
    """Un nom inconnu doit renvoyer une chaîne vide (pas de filtre pays appliqué)."""
    assert _normalize_country(name) == ""


def test_normalize_country_handles_whitespace_and_case() -> None:
    """Espaces de bordure et casse mélangée doivent être tolérés."""
    assert _normalize_country("  france  ") == "FR"
    assert _normalize_country("FRANCE") == "FR"
    assert _normalize_country("FraNCe") == "FR"
