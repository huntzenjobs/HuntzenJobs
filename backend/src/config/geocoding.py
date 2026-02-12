"""
Geocoding Configuration
========================
Multi-provider geocoding setup for worldwide city coordinates.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class GeocodingSettings(BaseSettings):
    """Geocoding service configuration."""

    # Nominatim (Primary - Free, Unlimited)
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "HuntZen/1.0 (contact@huntzen.com)"
    nominatim_timeout: int = 3  # seconds
    nominatim_rate_limit: float = 1.0  # requests per second

    # MapBox (Fallback - 100k/month free)
    mapbox_base_url: str = "https://api.mapbox.com"
    mapbox_access_token: str | None = None  # Optional
    mapbox_timeout: int = 3  # seconds

    # Cache settings
    geocoding_cache_ttl: int = 604800  # 7 days in seconds
    geocoding_cache_prefix: str = "geocode"

    # Feature flag
    enable_radius_search: bool = True  # Enable geographic radius filtering

    class Config:
        env_file = ".env"
        env_prefix = ""


@lru_cache
def get_geocoding_settings() -> GeocodingSettings:
    """Get cached geocoding settings."""
    return GeocodingSettings()
