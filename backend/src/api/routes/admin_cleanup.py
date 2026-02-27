"""
Admin cleanup endpoint for subscription synchronization.
Temporary endpoint to fix orphaned subscriptions by querying Stripe.
"""

from fastapi import APIRouter, Depends, HTTPException
from structlog import get_logger
from typing import Dict, Any
import stripe

logger = get_logger(__name__)

router = APIRouter()

# Import dependencies
try:
    from src.api.deps import get_current_admin
    from src.services.stripe import supabase_client, stripe
except ImportError as e:
    logger.error(f"Failed to import dependencies: {e}")
    raise


@router.post("/sync-subscriptions/{user_id}")
async def sync_user_subscriptions(
    user_id: str,
    current_user: dict = Depends(get_current_admin)
) -> Dict[str, Any]:
    """
    Cleanup orphaned subscriptions by synchronizing with Stripe.

    This endpoint:
    1. Gets all active subscriptions from Stripe for the user
    2. Marks DB subscriptions as 'canceled' if they don't exist in Stripe
    3. Returns sync results

    TEMPORARY: For manual cleanup during migration period.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        logger.info(f"Starting subscription sync for user {user_id}")

        # Step 1: Get all active subscriptions from DB
        db_subs_response = supabase_client.table("user_subscriptions")\
            .select("id, stripe_subscription_id, stripe_customer_id, status")\
            .eq("user_id", user_id)\
            .eq("status", "active")\
            .execute()

        if not db_subs_response.data:
            logger.info(f"No active subscriptions found in DB for user {user_id}")
            return {
                "success": True,
                "message": "No active subscriptions to sync",
                "db_count": 0,
                "stripe_count": 0,
                "canceled_count": 0
            }

        db_subs = db_subs_response.data
        logger.info(f"Found {len(db_subs)} active subscriptions in DB")

        # Step 2: Get customer_id (all should have same customer)
        customer_id = next((s["stripe_customer_id"] for s in db_subs if s.get("stripe_customer_id")), None)

        if not customer_id:
            raise HTTPException(
                status_code=400,
                detail="No Stripe customer ID found for user subscriptions"
            )

        # Step 3: Get all active subscriptions from Stripe
        stripe_subs = stripe.Subscription.list(
            customer=customer_id,
            status="active",
            limit=100
        )

        stripe_sub_ids = {s.id for s in stripe_subs.data}
        logger.info(f"Found {len(stripe_sub_ids)} active subscriptions in Stripe: {stripe_sub_ids}")

        # Step 4: Cancel DB subscriptions that don't exist in Stripe
        canceled_count = 0
        for db_sub in db_subs:
            if db_sub["stripe_subscription_id"] not in stripe_sub_ids:
                logger.info(f"Canceling orphaned subscription: {db_sub['stripe_subscription_id']}")

                supabase_client.table("user_subscriptions")\
                    .update({
                        "status": "canceled",
                        "updated_at": "NOW()"
                    })\
                    .eq("id", db_sub["id"])\
                    .execute()

                canceled_count += 1

        logger.info(f"Sync complete: {canceled_count} orphaned subscriptions canceled")

        return {
            "success": True,
            "message": f"Synchronized subscriptions with Stripe",
            "db_count": len(db_subs),
            "stripe_count": len(stripe_sub_ids),
            "canceled_count": canceled_count,
            "remaining_active": len(db_subs) - canceled_count
        }

    except stripe.error.StripeError as e:
        logger.error(f"Stripe API error during sync: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"Subscription sync failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
