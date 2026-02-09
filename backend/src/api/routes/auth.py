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


def get_supabase_client() -> Client:
    """Get Supabase client (lazy initialization)."""
    return create_client(
        settings.supabase_url,
        settings.get_supabase_key()
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

            # Extract price from plan_limits JSONB (subscription_plans doesn't have price_monthly in RPC)
            # For now, map plan names to prices (will be fixed in Phase 1 with stripe_prices table)
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
