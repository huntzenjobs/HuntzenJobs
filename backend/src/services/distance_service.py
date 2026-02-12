"""
Distance Service
=================
Geographic distance calculations using Haversine formula.
"""

import logging
from typing import Tuple

from geopy.distance import geodesic

logger = logging.getLogger(__name__)


class DistanceService:
    """
    Service for calculating distances between geographic coordinates.

    Uses the Haversine formula via geopy for accurate distance calculation.
    """

    @staticmethod
    def calculate_distance(
        coords1: Tuple[float, float],
        coords2: Tuple[float, float]
    ) -> float:
        """
        Calculate distance between two coordinates.

        Args:
            coords1: (latitude, longitude) of first point
            coords2: (latitude, longitude) of second point

        Returns:
            Distance in kilometers

        Example:
            >>> distance = DistanceService.calculate_distance(
            ...     (48.8566, 2.3522),  # Paris
            ...     (48.9719, 2.3981)   # Garges-lès-Gonesse
            ... )
            >>> print(f"{distance:.1f} km")
            14.8 km
        """
        try:
            distance_km = geodesic(coords1, coords2).kilometers
            return round(distance_km, 2)
        except Exception as e:
            logger.error(f"[Distance] Calculation error: {e}")
            return 0.0

    @staticmethod
    def is_within_radius(
        coords1: Tuple[float, float],
        coords2: Tuple[float, float],
        radius_km: float
    ) -> bool:
        """
        Check if two coordinates are within a radius.

        Args:
            coords1: (latitude, longitude) of first point
            coords2: (latitude, longitude) of second point
            radius_km: Maximum distance in kilometers

        Returns:
            True if within radius, False otherwise
        """
        distance = DistanceService.calculate_distance(coords1, coords2)
        return distance <= radius_km
