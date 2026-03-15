"""
Redis cache layer for quota management (S6-3).

This module provides caching for quota checks to reduce database load.
Cache TTL: 5 minutes (300 seconds)

Features:
- QuotaCache: Cache quota status per user per feature
- Automatic serialization/deserialization
- Connection pooling via redis.asyncio

Author: HuntZen Team
Date: 2026-01-28
Sprint: 6 - Ticket S6-3
"""

import json
import os
from typing import Optional, Dict, Any
import redis.asyncio as redis
from structlog import get_logger

logger = get_logger(__name__)

# ============================================
# REDIS CLIENT INITIALIZATION
# ============================================

redis_client: Optional[redis.Redis] = None


async def init_redis_client() -> None:
    """Initialize Redis client with connection pooling."""
    global redis_client

    redis_url = os.getenv("REDIS_URL")

    if not redis_url:
        logger.warning("REDIS_URL not set - quota caching disabled")
        return

    try:
        redis_client = redis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,  # Connection pool size
            socket_connect_timeout=5,
            socket_keepalive=True
        )

        # Test connection
        await redis_client.ping()
        logger.info("Redis client initialized successfully", url=redis_url[:30] + "...")
    except Exception as e:
        logger.error("Redis initialization failed", error=str(e))
        redis_client = None


async def close_redis_client() -> None:
    """Close Redis client and cleanup connections."""
    global redis_client

    if redis_client:
        try:
            await redis_client.close()
            logger.info("Redis client closed successfully")
        except Exception as e:
            logger.error("Redis shutdown failed", error=str(e))
        finally:
            redis_client = None


# ============================================
# QUOTA CACHE CLASS
# ============================================

class QuotaCache:
    """
    Cache for quota status to reduce database queries.

    Cache key format: quota:{user_id}:{feature}
    TTL: 5 minutes (300 seconds)

    Cached data structure:
    {
        "quota_limit": 5,
        "quota_used": 2,
        "quota_remaining": 3,
        "quota_percentage": 40.0,
        "has_access": true,
        "reset_at": "2026-01-29T00:00:00+00:00"
    }
    """

    PREFIX = "quota"
    TTL = 300  # 5 minutes

    @staticmethod
    async def get(user_id: str, feature: str) -> Optional[Dict[str, Any]]:
        """
        Get cached quota status for user and feature.

        Args:
            user_id: User UUID
            feature: Feature name ('cv_analysis', 'coach', 'job_search')

        Returns:
            Cached quota data dict or None if not cached or Redis unavailable
        """
        if not redis_client:
            return None

        try:
            key = f"{QuotaCache.PREFIX}:{user_id}:{feature}"
            data = await redis_client.get(key)

            if data:
                logger.debug("Cache hit", user_id=user_id, feature=feature)
                return json.loads(data)
            else:
                logger.debug("Cache miss", user_id=user_id, feature=feature)
                return None

        except Exception as e:
            logger.error("Cache get failed", error=str(e), user_id=user_id, feature=feature)
            return None

    @staticmethod
    async def set(user_id: str, feature: str, quota_data: Dict[str, Any]) -> bool:
        """
        Cache quota status for user and feature.

        Args:
            user_id: User UUID
            feature: Feature name ('cv_analysis', 'coach', 'job_search')
            quota_data: Quota status dict to cache

        Returns:
            True if cached successfully, False otherwise
        """
        if not redis_client:
            return False

        try:
            key = f"{QuotaCache.PREFIX}:{user_id}:{feature}"
            await redis_client.setex(
                key,
                QuotaCache.TTL,
                json.dumps(quota_data)
            )
            logger.debug("Cache set", user_id=user_id, feature=feature, ttl=QuotaCache.TTL)
            return True

        except Exception as e:
            logger.error("Cache set failed", error=str(e), user_id=user_id, feature=feature)
            return False

    @staticmethod
    async def invalidate(user_id: str, feature: str) -> bool:
        """
        Invalidate cached quota for user and feature.

        Called after usage is incremented to force fresh DB query on next check.

        Args:
            user_id: User UUID
            feature: Feature name ('cv_analysis', 'coach', 'job_search')

        Returns:
            True if invalidated successfully, False otherwise
        """
        if not redis_client:
            return False

        try:
            key = f"{QuotaCache.PREFIX}:{user_id}:{feature}"
            await redis_client.delete(key)
            logger.debug("Cache invalidated", user_id=user_id, feature=feature)
            return True

        except Exception as e:
            logger.error("Cache invalidate failed", error=str(e), user_id=user_id, feature=feature)
            return False

    @staticmethod
    async def invalidate_all(user_id: str) -> bool:
        """
        Invalidate all cached quotas for a user (all features).

        Called when user's subscription changes.

        Args:
            user_id: User UUID

        Returns:
            True if invalidated successfully, False otherwise
        """
        if not redis_client:
            return False

        try:
            # Delete quota caches for all features
            features = ['cv_analysis', 'coach', 'job_search']
            keys = [f"{QuotaCache.PREFIX}:{user_id}:{feature}" for feature in features]

            if keys:
                await redis_client.delete(*keys)

            logger.info("All quota caches invalidated", user_id=user_id, count=len(keys))
            return True

        except Exception as e:
            logger.error("Cache invalidate_all failed", error=str(e), user_id=user_id)
            return False


# ============================================
# HEALTH CHECK
# ============================================

async def check_redis_health() -> Dict[str, Any]:
    """
    Check Redis connection health for /health endpoint.

    Returns:
        Health status dict with connection info
    """
    if not redis_client:
        return {
            "status": "disabled",
            "message": "Redis client not initialized"
        }

    try:
        # Ping Redis
        await redis_client.ping()

        # Get Redis info
        info = await redis_client.info("server")

        return {
            "status": "healthy",
            "redis_version": info.get("redis_version", "unknown"),
            "connected_clients": info.get("connected_clients", 0),
            "uptime_in_seconds": info.get("uptime_in_seconds", 0)
        }

    except Exception as e:
        logger.error("Redis health check failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e)
        }
