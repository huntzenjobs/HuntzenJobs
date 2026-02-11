"""
Auth API Routes
===============
User authentication and profile management.
"""

from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status, Request
from supabase import create_client, Client

from src.api.middleware import limiter
from src.config.settings import get_settings

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
        print(f"Error getting user from token: {e}")

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
        print(f"\n{'='*70}")
        print(f"[AUTH_ME DEBUG] User ID: {user_id}")
        print(f"[AUTH_ME DEBUG] Email: {profile.get('email')}")
        print(f"{'='*70}\n")

        # Get user's active subscription using RPC (with ORDER BY fix)
        # This ensures we always get the highest-priority plan (paid > free)
        subscription_response = supabase.rpc(
            "get_user_current_subscription",
            {"p_user_id": user_id}
        ).execute()

        # 🔍 DEBUG: Log raw RPC response
        print(f"\n{'='*70}")
        print(f"[AUTH_ME DEBUG] RPC get_user_current_subscription Response:")
        print(f"  - Data: {subscription_response.data}")
        print(f"  - Type: {type(subscription_response.data)}")
        print(f"  - Length: {len(subscription_response.data) if subscription_response.data else 0}")
        print(f"{'='*70}\n")

        # Default to free plan if no active subscription
        subscription_data = {
            "plan_name": "free",
            "plan_display_name": "Free",
            "price_monthly": 0,
            "status": "active",
            "current_period_end": None
        }

        if subscription_response.data and len(subscription_response.data) > 0:
            sub = subscription_response.data[0]

            # 🔍 DEBUG: Log subscription object details
            print(f"\n{'='*70}")
            print(f"[AUTH_ME DEBUG] ✅ Subscription FOUND:")
            print(f"  - plan_name: {sub.get('plan_name')}")
            print(f"  - plan_display_name: {sub.get('plan_display_name')}")
            print(f"  - subscription_status: {sub.get('subscription_status')}")
            print(f"  - current_period_end: {sub.get('current_period_end')}")
            print(f"  - stripe_subscription_id: {sub.get('stripe_subscription_id')}")
            print(f"{'='*70}\n")

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
                "current_period_end": sub.get("current_period_end")
            }
        else:
            # 🔍 DEBUG: No subscription found
            print(f"\n{'='*70}")
            print(f"[AUTH_ME DEBUG] ⚠️ NO SUBSCRIPTION FOUND - Defaulting to FREE")
            print(f"  - User ID: {user_id}")
            print(f"  - Email: {user['email']}")

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
                        print(f"\n  🚨 DESYNC DETECTED:")
                        print(f"     - Stripe Subscription ID in profiles: {stripe_sub_id}")
                        print(f"     - Stripe Customer ID: {stripe_customer_id}")
                        print(f"     - BUT no active subscription in user_subscriptions table!")
                        print(f"     - This indicates a webhook failure or manual DB modification")
                        print(f"\n  Possible causes:")
                        print(f"     1. Stripe webhook failed to process subscription.created")
                        print(f"     2. user_subscriptions.status is not 'active' or 'trialing'")
                        print(f"     3. user_subscriptions.current_period_end has expired")
                        print(f"     4. Manual deletion from user_subscriptions table")
                    else:
                        print(f"  ℹ️ No Stripe subscription IDs in profiles (user never subscribed)")
            except Exception as check_error:
                print(f"  ⚠️ Failed to check profiles for Stripe IDs: {check_error}")

            print(f"{'='*70}\n")

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
            "quotas": quotas
        }

        # 🔍 DEBUG: Log final response
        print(f"\n{'='*70}")
        print(f"[AUTH_ME DEBUG] 📤 FINAL RESPONSE to frontend:")
        print(f"  - subscription.plan_name: {subscription_data.get('plan_name')}")
        print(f"  - subscription.plan_display_name: {subscription_data.get('plan_display_name')}")
        print(f"  - subscription.status: {subscription_data.get('status')}")
        print(f"{'='*70}\n")

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"[AUTH_ME] Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user info: {str(e)}"
        )
