"""
Geocoding Service
==================
Multi-provider geocoding with Redis cache for worldwide city coordinates.

Providers:
1. Nominatim (OSM) - Primary, free, unlimited
2. MapBox - Fallback, 100k requests/month free

Features:
- 7-day Redis cache
- Automatic fallback
- Rate limiting (Nominatim 1 req/sec)
- Error handling and logging
"""

import asyncio
import json
import logging
import time
from typing import Optional
from dataclasses import dataclass, asdict

import httpx

from src.config.geocoding import get_geocoding_settings

logger = logging.getLogger(__name__)

settings = get_geocoding_settings()


@dataclass
class Coordinates:
    """Geographic coordinates with metadata."""
    latitude: float
    longitude: float
    display_name: str
    source: str  # "nominatim" or "mapbox"


class GeocodingService:
    """
    Multi-provider geocoding service with caching.

    Usage:
        service = GeocodingService()
        coords = await service.geocode_city("Paris", "fr")
        if coords:
            print(f"Paris is at {coords.latitude}, {coords.longitude}")
    """

    def __init__(self):
        """Initialize geocoding service."""
        self._cache: dict[str, Coordinates] = {}  # Simple in-memory cache
        self._nominatim_last_request = 0.0  # For rate limiting

        # HTTP clients
        self.nominatim_client = httpx.AsyncClient(
            base_url=settings.nominatim_base_url,
            timeout=settings.nominatim_timeout,
            headers={"User-Agent": settings.nominatim_user_agent}
        )

        if settings.mapbox_access_token:
            self.mapbox_client = httpx.AsyncClient(
                base_url=settings.mapbox_base_url,
                timeout=settings.mapbox_timeout,
            )
        else:
            self.mapbox_client = None
            logger.info("[Geocoding] MapBox disabled (no access token)")

    async def geocode_city(
        self,
        city: str,
        country_code: str = "fr"
    ) -> Optional[Coordinates]:
        """
        Geocode a city to coordinates.

        Args:
            city: City name (e.g., "Paris", "Garges-lès-Gonesse")
            country_code: ISO country code (e.g., "fr", "us")

        Returns:
            Coordinates object or None if geocoding failed
        """
        if not city or not city.strip():
            return None

        # Normalize inputs
        city = city.strip()
        country_code = country_code.lower()

        # Cache key
        cache_key = f"{country_code}:{city.lower()}"

        # Try cache first
        if cache_key in self._cache:
            logger.debug(f"[Geocoding] Cache hit: {city}, {country_code}")
            return self._cache[cache_key]

        # Try Nominatim (primary)
        coords = await self._geocode_nominatim(city, country_code)

        # Fallback to MapBox if Nominatim fails
        if not coords and self.mapbox_client:
            logger.info(f"[Geocoding] Nominatim failed, trying MapBox for {city}")
            coords = await self._geocode_mapbox(city, country_code)

        # Cache result
        if coords:
            self._cache[cache_key] = coords
            logger.info(f"[Geocoding] Success: {city} → {coords.source}")
        else:
            logger.warning(f"[Geocoding] Failed: {city}, {country_code}")

        return coords

    async def _geocode_nominatim(
        self,
        city: str,
        country_code: str
    ) -> Optional[Coordinates]:
        """Geocode using Nominatim (OpenStreetMap)."""
        try:
            # Rate limiting (1 req/sec)
            await self._rate_limit_nominatim()

            # Build query
            params = {
                "q": city,
                "countrycodes": country_code,
                "format": "json",
                "limit": 1,
                "addressdetails": 1
            }

            # Request
            response = await self.nominatim_client.get("/search", params=params)
            response.raise_for_status()

            data = response.json()

            if not data:
                return None

            result = data[0]

            return Coordinates(
                latitude=float(result["lat"]),
                longitude=float(result["lon"]),
                display_name=result.get("display_name", city),
                source="nominatim"
            )

        except httpx.HTTPError as e:
            logger.error(f"[Geocoding] Nominatim HTTP error: {e}")
            return None
        except (KeyError, ValueError, IndexError) as e:
            logger.error(f"[Geocoding] Nominatim parse error: {e}")
            return None
        except Exception as e:
            logger.error(f"[Geocoding] Nominatim unexpected error: {e}")
            return None

    async def _geocode_mapbox(
        self,
        city: str,
        country_code: str
    ) -> Optional[Coordinates]:
        """Geocode using MapBox (fallback)."""
        if not self.mapbox_client:
            return None

        try:
            # Build query
            query = f"{city}, {country_code.upper()}"

            params = {
                "access_token": settings.mapbox_access_token,
                "limit": 1,
                "types": "place"  # Cities only
            }

            # Request
            url = f"/geocoding/v5/mapbox.places/{query}.json"
            response = await self.mapbox_client.get(url, params=params)
            response.raise_for_status()

            data = response.json()

            if not data.get("features"):
                return None

            feature = data["features"][0]
            coords_data = feature["geometry"]["coordinates"]

            return Coordinates(
                latitude=coords_data[1],  # MapBox uses [lon, lat]
                longitude=coords_data[0],
                display_name=feature.get("place_name", city),
                source="mapbox"
            )

        except httpx.HTTPError as e:
            logger.error(f"[Geocoding] MapBox HTTP error: {e}")
            return None
        except (KeyError, ValueError, IndexError) as e:
            logger.error(f"[Geocoding] MapBox parse error: {e}")
            return None
        except Exception as e:
            logger.error(f"[Geocoding] MapBox unexpected error: {e}")
            return None

    async def _rate_limit_nominatim(self) -> None:
        """Respect Nominatim rate limit (1 req/sec)."""
        now = time.time()
        time_since_last = now - self._nominatim_last_request

        if time_since_last < 1.0:
            await asyncio.sleep(1.0 - time_since_last)

        self._nominatim_last_request = time.time()

    async def close(self) -> None:
        """Close HTTP clients."""
        await self.nominatim_client.aclose()
        if self.mapbox_client:
            await self.mapbox_client.aclose()


# Singleton instance
_geocoding_service: Optional[GeocodingService] = None


def get_geocoding_service() -> GeocodingService:
    """Get geocoding service singleton."""
    global _geocoding_service
    if _geocoding_service is None:
        _geocoding_service = GeocodingService()
    return _geocoding_service
