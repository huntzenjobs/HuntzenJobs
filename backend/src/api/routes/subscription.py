"""
Subscription management endpoints

Provides endpoints for subscription synchronization and cache management.
Used by frontend after Stripe checkout success to force cache refresh.
"""

from fastapi import APIRouter, Depends, HTTPException
from structlog import get_logger
from typing import Dict, Any

logger = get_logger(__name__)

# Initialize router
router = APIRouter()

# Import dependencies
try:
    from src.api.deps import get_current_user
    from app.quota import invalidate_user_quota_cache, get_user_quota_status
    from src.services.stripe import supabase_client
except ImportError as e:
    logger.error(f"Failed to import dependencies: {e}")
    raise


@router.post("/sync-cache")
async def sync_subscription_cache(current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Force sync subscription cache after upgrade/downgrade.

    Called by frontend after successful Stripe checkout to invalidate
    cached subscription data and return fresh quotas.

    This ensures the user sees their new plan immediately instead of
    waiting for the cache TTL to expire.

    Returns:
        Dict with success status, cache_invalidated flag, and fresh quota data
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        logger.info(f"Syncing subscription cache for user {user_id}")

        # Invalidate all quota caches
        success = await invalidate_user_quota_cache(user_id)

        if not success:
            logger.warning(f"Cache invalidation returned false for user {user_id}")

        # Return fresh quota status
        quota_status = await get_user_quota_status(user_id)

        logger.info(f"Cache synced successfully for user {user_id}")

        return {
            "success": True,
            "cache_invalidated": success,
            "quotas": quota_status
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cache sync failed for user {current_user.get('id')}: {e}")
        raise HTTPException(status_code=500, detail=f"Cache sync failed: {str(e)}")


@router.get("/current")
async def get_current_subscription(current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Get current subscription with fresh data (no cache).

    This endpoint bypasses all caching and queries the database directly
    to get the most up-to-date subscription information.

    Used by frontend payment/success page during polling to detect
    when webhook has processed the new subscription.

    Returns:
        Dict with subscription details including plan, status, and period
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        if not supabase_client:
            raise HTTPException(status_code=500, detail="Database not configured")

        # Query database directly (no cache)
        response = supabase_client.rpc("get_user_current_subscription", {
            "p_user_id": user_id
        }).execute()

        # RPC returns TABLE (list of rows), not a single object
        if not response.data or len(response.data) == 0:
            # No active subscription - user is on free plan
            return {
                "success": True,
                "subscription": {
                    "plan_name": "free",
                    "plan_display_name": "Free",
                    "status": "active",
                    "stripe_subscription_id": None,
                    "current_period_end": None
                }
            }

        # Get first row from the result
        subscription_data = response.data[0]

        return {
            "success": True,
            "subscription": {
                "plan_name": subscription_data.get("plan_name"),
                "plan_display_name": subscription_data.get("plan_display_name"),
                "status": subscription_data.get("subscription_status"),
                "stripe_subscription_id": subscription_data.get("stripe_subscription_id"),
                "current_period_end": subscription_data.get("current_period_end"),
                "limits": subscription_data.get("plan_limits")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get current subscription for user {current_user.get('id')}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get subscription: {str(e)}")
