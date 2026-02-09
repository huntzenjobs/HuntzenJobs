"""
Quota management service layer (S6-3).

This module provides high-level functions for checking and incrementing user quotas.
Integrates database functions with Redis caching for optimal performance.

Usage:
    from app.quota import check_and_enforce_quota, increment_user_usage

    # In endpoint:
    if not await check_and_enforce_quota(user_id, "cv_analysis"):
        raise HTTPException(status_code=429, detail="Daily quota exceeded")

    # After successful operation:
    await increment_user_usage(user_id, "cv_analysis", 1)

Author: HuntZen Team
Date: 2026-01-28
Sprint: 6 - Ticket S6-3
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException
from structlog import get_logger
from app.database import get_db
from app.cache import QuotaCache

logger = get_logger(__name__)

# ============================================
# QUOTA CHECKING
# ============================================


async def check_user_quota(user_id: str, feature: str) -> bool:
    """
    Check if user has quota available for a feature.

    This function checks Redis cache first, then falls back to database.
    Returns True if user has quota available, False otherwise.

    Args:
        user_id: User UUID string
        feature: Feature name ('cv_analysis', 'coach', 'job_search')

    Returns:
        True if user has quota available, False if exceeded

    Raises:
        HTTPException: If database query fails
    """
    # Validate feature parameter
    if feature not in ('cv_analysis', 'coach', 'job_search', 'job_view'):
        logger.error("Invalid feature", feature=feature)
        raise ValueError(f"Invalid feature: {feature}")

    # Try Redis cache first
    cached_status = await QuotaCache.get(user_id, feature)
    if cached_status is not None:
        has_access = cached_status.get("has_access", False)
        logger.debug(
            "quota_check_cached",
            user_id=user_id,
            feature=feature,
            has_access=has_access
        )
        return has_access

    # Cache miss - query database
    try:
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT check_user_quota(%s, %s) as has_quota",
                    (user_id, feature)
                )
                result = await cur.fetchone()
                has_quota = result["has_quota"] if result else False

        logger.info(
            "quota_check_db",
            user_id=user_id,
            feature=feature,
            has_quota=has_quota
        )

        # Cache the result for next time (fetch full status for caching)
        if has_quota:
            await cache_quota_status(user_id, feature)

        return has_quota

    except Exception as e:
        logger.error(
            "quota_check_failed",
            error=str(e),
            user_id=user_id,
            feature=feature
        )
        # Fail open: allow access if quota check fails (avoid blocking users)
        return True


async def check_and_enforce_quota(user_id: str, feature: str) -> bool:
    """
    Check quota and raise HTTPException if exceeded.

    This is a convenience function for use in API endpoints.
    Raises 429 if quota exceeded, otherwise returns True.

    Args:
        user_id: User UUID string
        feature: Feature name ('cv_analysis', 'coach', 'job_search')

    Returns:
        True if quota available

    Raises:
        HTTPException: 429 Too Many Requests if quota exceeded
    """
    has_quota = await check_user_quota(user_id, feature)

    if not has_quota:
        logger.warning(
            "quota_exceeded",
            user_id=user_id,
            feature=feature
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "quota_exceeded",
                "message": f"Daily quota exceeded for {feature}",
                "feature": feature,
                "user_id": user_id
            }
        )

    return True


# ============================================
# USAGE INCREMENT
# ============================================


async def increment_user_usage(
    user_id: str,
    feature: str,
    amount: int = 1
) -> bool:
    """
    Increment usage counter for a feature.

    This function updates the database and invalidates the Redis cache
    to force fresh data on next quota check.

    Args:
        user_id: User UUID string
        feature: Feature name ('cv_analysis', 'coach', 'job_search')
        amount: Amount to increment (default: 1)

    Returns:
        True if incremented successfully, False otherwise
    """
    # Validate inputs
    if feature not in ('cv_analysis', 'coach', 'job_search', 'job_view'):
        logger.error("Invalid feature", feature=feature)
        raise ValueError(f"Invalid feature: {feature}")

    if amount < 0:
        logger.error("Invalid amount", amount=amount)
        raise ValueError(f"Amount must be non-negative: {amount}")

    try:
        # Increment in database
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT increment_usage(%s, %s, %s) as success",
                    (user_id, feature, amount)
                )
                result = await cur.fetchone()
                success = result["success"] if result else False

        if success:
            logger.info(
                "usage_incremented",
                user_id=user_id,
                feature=feature,
                amount=amount
            )
            # Debug log for tracking increment
            logger.info(f"[QUOTA_DB_RESULT] success={success}, user_id={user_id}, feature={feature}, amount={amount}")

            # Invalidate cache to force fresh data on next check
            invalidated = await QuotaCache.invalidate(user_id, feature)
            logger.info(f"[QUOTA_CACHE_INVALIDATE] success={invalidated}, user_id={user_id}, feature={feature}")

            if not invalidated:
                logger.error(f"[QUOTA] Failed to invalidate cache for {user_id}/{feature}")
                # Continue anyway (fail-open strategy)

        return success

    except Exception as e:
        logger.error(
            "usage_increment_failed",
            error=str(e),
            user_id=user_id,
            feature=feature,
            amount=amount
        )
        return False


# ============================================
# QUOTA STATUS
# ============================================


async def get_user_quota_status(user_id: str) -> Dict[str, Any]:
    """
    Get detailed quota status for all features for a user.

    Returns quota information including limits, usage, remaining, and reset time.

    Args:
        user_id: User UUID string

    Returns:
        Dict with quota status for each feature:
        {
            "cv_analysis": {
                "limit": 5,
                "used": 2,
                "remaining": 3,
                "percentage": 40.0,
                "has_access": True,
                "reset_at": "2026-01-29T00:00:00+00:00"
            },
            "coach": {...},
            "job_search": {...}
        }
    """
    try:
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM get_quota_status(%s)",
                    (user_id,)
                )
                rows = await cur.fetchall()

        # Convert rows to dict keyed by feature
        status = {}
        for row in rows:
            feature = row["feature"]
            status[feature] = {
                "limit": row["quota_limit"],
                "used": row["quota_used"],
                "remaining": row["quota_remaining"],
                "percentage": float(row["quota_percentage"]),
                "has_access": row["has_access"],
                "reset_at": row["reset_at"].isoformat() if row["reset_at"] else None
            }

            # Cache individual feature status
            await QuotaCache.set(user_id, feature, status[feature])

        logger.info("quota_status_retrieved", user_id=user_id, features=len(status))
        return status

    except Exception as e:
        logger.error("quota_status_failed", error=str(e), user_id=user_id)
        return {}


async def cache_quota_status(user_id: str, feature: str) -> bool:
    """
    Fetch and cache quota status for a specific feature.

    Helper function to populate cache after quota check.

    Args:
        user_id: User UUID string
        feature: Feature name

    Returns:
        True if cached successfully
    """
    try:
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM get_quota_status(%s) WHERE feature = %s",
                    (user_id, feature)
                )
                row = await cur.fetchone()

        if row:
            quota_data = {
                "limit": row["quota_limit"],
                "used": row["quota_used"],
                "remaining": row["quota_remaining"],
                "percentage": float(row["quota_percentage"]),
                "has_access": row["has_access"],
                "reset_at": row["reset_at"].isoformat() if row["reset_at"] else None
            }
            await QuotaCache.set(user_id, feature, quota_data)
            return True

        return False

    except Exception as e:
        logger.error("cache_quota_status_failed", error=str(e), user_id=user_id, feature=feature)
        return False


# ============================================
# SUBSCRIPTION CHANGE HANDLER
# ============================================


async def invalidate_user_quota_cache(user_id: str) -> bool:
    """
    Invalidate all quota caches for a user.

    Called when user's subscription changes (upgrade/downgrade).
    Forces fresh database queries on next quota checks.

    Args:
        user_id: User UUID string

    Returns:
        True if invalidated successfully
    """
    try:
        await QuotaCache.invalidate_all(user_id)
        logger.info("quota_cache_invalidated", user_id=user_id)
        return True
    except Exception as e:
        logger.error("quota_cache_invalidation_failed", error=str(e), user_id=user_id)
        return False
