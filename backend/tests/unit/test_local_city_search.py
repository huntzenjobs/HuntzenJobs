"""Recherche de villes locale, sans dépendance à un service d'autocomplétion."""

import pytest

from src.api.routes.static_data import search_cities
from src.utils.geo import get_city_coordinates_local, search_cities_local


def test_local_city_search_finds_paris_from_short_prefix() -> None:
    results = search_cities_local("Par", "fr", limit=10)

    assert "Paris" in results


def test_local_city_search_rejects_unknown_country() -> None:
    assert search_cities_local("Paris", "zz", limit=10) == []


def test_local_city_coordinates_find_known_city() -> None:
    coordinates = get_city_coordinates_local("Paris", "fr")

    assert coordinates is not None
    latitude, longitude = coordinates
    assert 48.0 < latitude < 49.0
    assert 2.0 < longitude < 3.0


@pytest.mark.asyncio
async def test_city_route_merges_french_locations_and_cities() -> None:
    response = await search_cities(q="Par", country_code="fr", limit=10)

    assert response["success"] is True
    assert any(item["name"] == "Paris" for item in response["data"])


@pytest.mark.asyncio
async def test_city_route_returns_empty_data_for_unknown_country() -> None:
    response = await search_cities(q="Paris", country_code="zz", limit=10)

    assert response == {
        "success": True,
        "data": [],
        "query": "Paris",
        "country_code": "zz",
        "count": 0,
    }
