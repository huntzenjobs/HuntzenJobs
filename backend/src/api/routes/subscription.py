"""
Subscription management endpoints

Provides endpoints for subscription synchronization and cache management.
Used by frontend after Stripe checkout success to force cache refresh.
"""

from fastapi import APIRouter, Depends, HTTPException
from structlog import get_logger
from typing import Dict, Any
from datetime import datetime
from pydantic import BaseModel

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


@router.post("/force-sync")
async def force_sync_with_stripe(current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Force sync user subscription with Stripe (one-time fix).

    Queries Stripe directly and updates DB to match.
    Use this once to fix desynchronization, then webhooks handle it automatically.

    Returns:
        Dict with sync status and updated subscription info
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        logger.info(f"Force syncing subscription for user {user_id}")

        if not supabase_client:
            raise HTTPException(status_code=500, detail="Database not configured")

        # Get customer_id from DB
        user_sub = supabase_client.table("user_subscriptions")\
            .select("stripe_customer_id, id")\
            .eq("user_id", user_id)\
            .eq("status", "active")\
            .maybe_single()\
            .execute()

        if not user_sub.data:
            return {
                "success": False,
                "message": "No active subscription found in DB"
            }

        customer_id = user_sub.data.get("stripe_customer_id")
        if not customer_id:
            return {
                "success": False,
                "message": "No Stripe customer ID found"
            }

        # Query Stripe for active subscriptions (source of truth)
        import stripe as stripe_lib
        stripe_subs = stripe_lib.Subscription.list(
            customer=customer_id,
            status="active",
            limit=1
        )

        if not stripe_subs.data:
            # No active subscription in Stripe
            supabase_client.table("user_subscriptions")\
                .update({"status": "canceled", "updated_at": "NOW()"})\
                .eq("id", user_sub.data["id"])\
                .execute()

            return {
                "success": True,
                "synced": True,
                "message": "No active subscription in Stripe, moved to free plan"
            }

        # Get first active subscription from Stripe
        stripe_sub = stripe_subs.data[0]
        stripe_sub_id = stripe_sub.id
        stripe_price_id = stripe_sub["items"]["data"][0]["price"]["id"]

        # Map price_id to plan_name via DB query (dynamic, not hardcoded)
        try:
            # Query stripe_prices table with JOIN to subscription_plans
            price_lookup = supabase_client.table("stripe_prices")\
                .select("subscription_plans(name)")\
                .eq("stripe_price_id", stripe_price_id)\
                .eq("is_active", True)\
                .single()\
                .execute()

            if price_lookup.data and price_lookup.data.get("subscription_plans"):
                plan_name = price_lookup.data["subscription_plans"]["name"]
                logger.info(f"Mapped price {stripe_price_id} to plan {plan_name} via DB lookup")
            else:
                # Fallback: price not found in DB, log warning and skip sync
                logger.warning(f"Price {stripe_price_id} not found in stripe_prices table, cannot sync")
                raise HTTPException(
                    status_code=500,
                    detail=f"Stripe price {stripe_price_id} not configured in database. Please add it to stripe_prices table."
                )
        except Exception as e:
            logger.error(f"Failed to lookup price {stripe_price_id}: {e}")
            # Re-raise as HTTP exception
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail=f"Failed to map Stripe price to plan: {str(e)}")

        # Get plan_id from plan_name
        plan_response = supabase_client.table("subscription_plans")\
            .select("id")\
            .eq("name", plan_name)\
            .single()\
            .execute()

        if not plan_response.data:
            raise HTTPException(status_code=500, detail=f"Plan {plan_name} not found in DB")

        # UPDATE existing subscription with Stripe data
        supabase_client.table("user_subscriptions")\
            .update({
                "stripe_subscription_id": stripe_sub_id,
                "plan_id": plan_response.data["id"],
                "stripe_price_id": stripe_price_id,
                "current_period_start": datetime.fromtimestamp(stripe_sub.current_period_start).isoformat(),
                "current_period_end": datetime.fromtimestamp(stripe_sub.current_period_end).isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            })\
            .eq("id", user_sub.data["id"])\
            .execute()

        # Invalidate cache
        await invalidate_user_quota_cache(user_id)

        logger.info(f"Force sync completed for user {user_id}: {plan_name}")

        return {
            "success": True,
            "synced": True,
            "message": f"Synced with Stripe: {plan_name}",
            "subscription": {
                "plan_name": plan_name,
                "stripe_subscription_id": stripe_sub_id
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Force sync failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


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


# ============================================================================
# Coach Session Management (server-side validation)
# ============================================================================

class CoachSessionRequest(BaseModel):
    action: str  # "start" | "stop" | "validate"


@router.post("/coach-session")
async def manage_coach_session(
    request: CoachSessionRequest,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Manage coach session server-side to prevent exploitation via multi-tab sessions.

    Actions:
    - start: Create new active session (fails if one already exists)
    - stop: End current session and increment usage
    - validate: Check if session is active

    This prevents users from opening multiple tabs to bypass coaching time limits.
    """
    user_id = current_user["id"]

    try:
        if request.action == "start":
            # Check if session already active
            existing = supabase_client.table("active_coach_sessions")\
                .select("*")\
                .eq("user_id", user_id)\
                .execute()

            if existing.data and len(existing.data) > 0:
                logger.warning(f"User {user_id} attempted to start coach session but one is already active")
                raise HTTPException(
                    status_code=400,
                    detail="A coach session is already active. Please stop the current session first."
                )

            # Create new session
            session = supabase_client.table("active_coach_sessions")\
                .insert({
                    "user_id": user_id,
                    "started_at": datetime.utcnow().isoformat()
                })\
                .execute()

            if not session.data or len(session.data) == 0:
                raise HTTPException(status_code=500, detail="Failed to create coach session")

            logger.info(f"Started coach session for user {user_id}: {session.data[0]['id']}")

            return {
                "status": "started",
                "session_id": session.data[0]["id"],
                "started_at": session.data[0]["started_at"]
            }

        elif request.action == "stop":
            # Get active session
            session_response = supabase_client.table("active_coach_sessions")\
                .select("*")\
                .eq("user_id", user_id)\
                .execute()

            if not session_response.data or len(session_response.data) == 0:
                logger.warning(f"User {user_id} attempted to stop coach session but none is active")
                raise HTTPException(status_code=404, detail="No active coach session found")

            session = session_response.data[0]

            # Calculate elapsed time
            started_at = datetime.fromisoformat(session["started_at"].replace('Z', '+00:00'))
            elapsed_seconds = int((datetime.utcnow() - started_at.replace(tzinfo=None)).total_seconds())

            # Increment usage via RPC
            try:
                increment_result = supabase_client.rpc("increment_usage", {
                    "p_user_id": user_id,
                    "p_feature": "coach",
                    "p_amount": elapsed_seconds
                }).execute()

                logger.info(f"Incremented coach usage for user {user_id}: {elapsed_seconds}s")

            except Exception as e:
                logger.error(f"Failed to increment coach usage: {e}")
                # Continue to delete session even if increment fails

            # Delete active session
            supabase_client.table("active_coach_sessions")\
                .delete()\
                .eq("id", session["id"])\
                .execute()

            logger.info(f"Stopped coach session for user {user_id}: {elapsed_seconds}s")

            # Invalidate cache to refresh quota
            try:
                invalidate_user_quota_cache(user_id)
            except Exception as e:
                logger.warning(f"Failed to invalidate quota cache after coach session: {e}")

            return {
                "status": "stopped",
                "elapsed_seconds": elapsed_seconds,
                "session_id": session["id"]
            }

        elif request.action == "validate":
            # Check if session active
            session_response = supabase_client.table("active_coach_sessions")\
                .select("*")\
                .eq("user_id", user_id)\
                .execute()

            is_active = session_response.data and len(session_response.data) > 0

            result = {
                "is_active": is_active
            }

            if is_active:
                session = session_response.data[0]
                result["started_at"] = session["started_at"]
                result["session_id"] = session["id"]

                # Calculate current elapsed
                started_at = datetime.fromisoformat(session["started_at"].replace('Z', '+00:00'))
                elapsed_seconds = int((datetime.utcnow() - started_at.replace(tzinfo=None)).total_seconds())
                result["elapsed_seconds"] = elapsed_seconds

            return result

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action: {request.action}. Must be 'start', 'stop', or 'validate'."
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to manage coach session for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to manage coach session: {str(e)}")
