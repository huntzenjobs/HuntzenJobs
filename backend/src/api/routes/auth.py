"""
Auth API Routes
===============
User authentication and profile management.
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status, Request
from pydantic import BaseModel
from supabase import create_client, Client

from src.api.middleware import limiter
from src.config.settings import get_settings
from src.utils.cache import get_redis

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()


@router.get("/api/auth/test-debug")
async def test_debug():
    """Test endpoint to verify deployment."""
    import subprocess
    try:
        # Get current git commit hash dynamically
        commit_hash = subprocess.check_output(
            ['git', 'rev-parse', '--short', 'HEAD'],
            cwd='/app',  # Railway app directory
            stderr=subprocess.DEVNULL
        ).decode('ascii').strip()
    except:
        commit_hash = "unknown"

    return {
        "status": "ok",
        "message": "Debug logs deployed successfully",
        "commit": commit_hash
    }


def get_supabase_client() -> Client:
    """Get Supabase client (lazy initialization)."""
    return create_client(
        settings.supabase_url,
        settings.get_supabase_service_role_key()  # Use SERVICE_ROLE to bypass RLS
    )


def get_user_from_token(authorization: Optional[str]) -> Optional[dict]:
    """
    Extract user from Authorization header.

    Args:
        authorization: Bearer token from header

    Returns:
        User data if valid, None otherwise
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.replace("Bearer ", "")

    try:
        # Get user from Supabase using the token
        supabase = get_supabase_client()
        response = supabase.auth.get_user(token)
        if response and response.user:
            return {
                "id": response.user.id,
                "email": response.user.email,
                "user_metadata": response.user.user_metadata,
            }
    except Exception as e:
        logger.error(f"Error getting user from token: {e}")

    return None


@router.get("/api/auth/me")
@limiter.limit("60/minute")
async def get_current_user_info(
    request: Request,
    authorization: Optional[str] = Header(None)
):
    """
    Get current authenticated user information with subscription and quotas.

    Sprint AUTH (SA-4): Returns user profile + subscription + quotas.

    Returns:
        - user: Profile information (id, email, full_name, avatar_url)
        - subscription: Current plan details
        - quotas: Usage stats for cv_analysis, coach, job_search

    Raises:
        HTTPException: If not authenticated
    """
    # Get user from token
    user = get_user_from_token(authorization)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    user_id = user["id"]

    # Cache Redis TTL 30s (réduit la charge Supabase ×10 sous charge)
    try:
        redis = await get_redis()
        if redis:
            cached = await redis.get(f"auth_me:{user_id}")
            if cached:
                return json.loads(cached)
    except Exception:
        pass

    try:
        # Get Supabase client
        supabase = get_supabase_client()

        # Get user profile from profiles table
        profile_response = supabase.table("profiles").select(
            "id, email, full_name, avatar_url, created_at"
        ).eq("id", user_id).execute()

        if not profile_response.data or len(profile_response.data) == 0:
            raise HTTPException(
                status_code=404,
                detail="User profile not found"
            )

        profile = profile_response.data[0]

        # 🔍 DEBUG: Log user info before RPC call
        logger.debug("="*70)
        logger.debug(f"[AUTH_ME DEBUG] User ID: {user_id}")
        logger.debug(f"[AUTH_ME DEBUG] Email: {profile.get('email')}")
        logger.debug("="*70)

        # Get user's active subscription using RPC (with ORDER BY fix)
        # This ensures we always get the highest-priority plan (paid > free)
        subscription_response = supabase.rpc(
            "get_user_current_subscription",
            {"p_user_id": user_id}
        ).execute()

        # 🔍 DEBUG: Log raw RPC response
        logger.debug("="*70)
        logger.debug(f"[AUTH_ME DEBUG] RPC get_user_current_subscription Response:")
        logger.debug(f"  - Data: {subscription_response.data}")
        logger.debug(f"  - Type: {type(subscription_response.data)}")
        logger.debug(f"  - Length: {len(subscription_response.data) if subscription_response.data else 0}")
        logger.debug("="*70)

        # Default to free plan if no active subscription
        subscription_data = {
            "plan_name": "free",
            "plan_display_name": "Free",
            "price_monthly": 0,
            "status": "active",
            "current_period_end": None,
            "cancel_at_period_end": False,
        }

        if subscription_response.data and len(subscription_response.data) > 0:
            sub = subscription_response.data[0]

            # 🔍 DEBUG: Log subscription object details
            logger.debug("="*70)
            logger.debug(f"[AUTH_ME DEBUG] ✅ Subscription FOUND:")
            logger.debug(f"  - plan_name: {sub.get('plan_name')}")
            logger.debug(f"  - plan_display_name: {sub.get('plan_display_name')}")
            logger.debug(f"  - subscription_status: {sub.get('subscription_status')}")
            logger.debug(f"  - current_period_end: {sub.get('current_period_end')}")
            logger.debug(f"  - stripe_subscription_id: {sub.get('stripe_subscription_id')}")
            logger.debug("="*70)

            # Fetch plan prices dynamically from subscription_plans table
            try:
                plans_response = supabase.table("subscription_plans")\
                    .select("name, price_monthly")\
                    .execute()

                plan_prices = {
                    plan["name"]: plan["price_monthly"]
                    for plan in plans_response.data
                }
            except Exception as e:
                logger.error(f"Failed to fetch plan prices: {e}")
                # Fallback to hardcoded prices (safety)
                plan_prices = {"free": 0, "starter": 8.90, "pro": 13.90, "premium": 19.90}
            subscription_data = {
                "plan_name": sub.get("plan_name", "free"),
                "plan_display_name": sub.get("plan_display_name", "Free"),
                "price_monthly": plan_prices.get(sub.get("plan_name", "free"), 0),
                "status": sub.get("subscription_status", "active"),
                "current_period_end": sub.get("current_period_end"),
                "cancel_at_period_end": sub.get("cancel_at_period_end", False),
            }
        else:
            # 🔍 DEBUG: No subscription found
            logger.debug("="*70)
            logger.debug(f"[AUTH_ME DEBUG] ⚠️ NO SUBSCRIPTION FOUND - Defaulting to FREE")
            logger.debug(f"  - User ID: {user_id}")
            logger.debug(f"  - Email: {user['email']}")

            # Check if user has stripe_subscription_id in profiles but no active subscription
            # This would indicate a desync between Stripe and Supabase
            try:
                profile_check = supabase.table("profiles") \
                    .select("stripe_subscription_id, stripe_customer_id") \
                    .eq("id", user_id) \
                    .single() \
                    .execute()

                if profile_check.data:
                    stripe_sub_id = profile_check.data.get("stripe_subscription_id")
                    stripe_customer_id = profile_check.data.get("stripe_customer_id")

                    if stripe_sub_id:
                        logger.warning(f"🚨 DESYNC DETECTED:")
                        logger.warning(f"   - Stripe Subscription ID in profiles: {stripe_sub_id}")
                        logger.warning(f"   - Stripe Customer ID: {stripe_customer_id}")
                        logger.warning(f"   - BUT no active subscription in user_subscriptions table!")
                        logger.warning(f"   - This indicates a webhook failure or manual DB modification")
                        logger.warning(f"Possible causes:")
                        logger.warning(f"   1. Stripe webhook failed to process subscription.created")
                        logger.warning(f"   2. user_subscriptions.status is not 'active' or 'trialing'")
                        logger.warning(f"   3. user_subscriptions.current_period_end has expired")
                        logger.warning(f"   4. Manual deletion from user_subscriptions table")
                    else:
                        logger.debug(f"ℹ️ No Stripe subscription IDs in profiles (user never subscribed)")
            except Exception as check_error:
                logger.error(f"⚠️ Failed to check profiles for Stripe IDs: {check_error}")

            logger.debug("="*70)

        # Get quota status using Supabase RPC
        quota_response = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()

        # Format quotas for frontend
        quotas = {}
        if quota_response.data:
            for quota in quota_response.data:
                feature = quota["feature"]
                quotas[feature] = {
                    "limit": quota["quota_limit"],
                    "used": quota["quota_used"],
                    "remaining": quota["quota_remaining"],
                    "percentage": float(quota["quota_percentage"]) if quota["quota_percentage"] else 0,
                    "has_access": quota["has_access"],
                    "reset_at": quota["reset_at"]
                }

        # Fetch individual feature overrides set by admin
        feature_overrides = {}
        try:
            overrides_res = supabase.table("user_feature_overrides") \
                .select("feature_name, enabled") \
                .eq("user_id", user_id) \
                .execute()
            if overrides_res.data:
                feature_overrides = {r["feature_name"]: r["enabled"] for r in overrides_res.data}
        except Exception as e:
            logger.warning(f"Could not fetch feature overrides for {user_id}: {e}")

        # Build response
        response_data = {
            "success": True,
            "user": {
                "id": str(profile["id"]),
                "email": profile["email"],
                "full_name": profile.get("full_name"),
                "avatar_url": profile.get("avatar_url"),
                "created_at": profile.get("created_at")
            },
            "subscription": subscription_data,
            "quotas": quotas,
            "feature_overrides": feature_overrides
        }

        # 🔍 DEBUG: Log final response
        logger.debug("="*70)
        logger.debug(f"[AUTH_ME DEBUG] 📤 FINAL RESPONSE to frontend:")
        logger.debug(f"  - subscription.plan_name: {subscription_data.get('plan_name')}")
        logger.debug(f"  - subscription.plan_display_name: {subscription_data.get('plan_display_name')}")
        logger.debug(f"  - subscription.status: {subscription_data.get('status')}")
        logger.debug("="*70)

        try:
            redis = await get_redis()
            if redis:
                await redis.setex(f"auth_me:{user_id}", 30, json.dumps(response_data))
        except Exception:
            pass

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTH_ME] Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user info: {str(e)}"
        )


class WelcomeRequest(BaseModel):
    email: str
    full_name: str = ""


@router.post("/api/auth/welcome")
async def send_welcome_email(payload: WelcomeRequest):
    """Send welcome email after signup. No auth required — called from frontend post-signup."""
    from src.services.email import send_welcome
    try:
        send_welcome(to_email=payload.email, full_name=payload.full_name)
    except Exception as e:
        logger.warning(f"Welcome email failed (non-blocking): {e}")
    return {"success": True}
