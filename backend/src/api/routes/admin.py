"""
Admin Routes
=============
Complete admin API for user management, plan editing, analytics, and logs.
All endpoints require is_admin = TRUE in profiles table.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import stripe as stripe_lib
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from structlog import get_logger

from src.api.deps import AdminUserDep, get_supabase_client
from src.config.settings import get_settings

logger = get_logger(__name__)
router = APIRouter()


# ============================================================
# PYDANTIC SCHEMAS
# ============================================================

class SuspendUserRequest(BaseModel):
    reason: str


class ForcePlanRequest(BaseModel):
    plan_id: str


class ResetPasswordRequest(BaseModel):
    pass  # no body needed


class DeleteUserRequest(BaseModel):
    confirm: bool = False


def _log_admin_action(
    supabase,
    admin_id: str,
    event_type: str,
    target_user_id: Optional[str] = None,
    event_data: Optional[dict] = None,
):
    """Log an admin action to security_events. Best-effort, never raises."""
    try:
        supabase.rpc("log_security_event", {
            "p_event_type": event_type,
            "p_severity": "warning",
            "p_user_id": admin_id,
            "p_event_data": {
                "admin_id": admin_id,
                "target_user_id": target_user_id,
                **(event_data or {}),
            }
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to log admin action {event_type}: {e}")


# ============================================================
# USER MANAGEMENT
# ============================================================

@router.get("/users")
async def list_users(
    admin: AdminUserDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    plan: Optional[str] = Query(default=None),
    user_status: Optional[str] = Query(default=None, alias="status"),
) -> Dict[str, Any]:
    """
    List all users with pagination, search, and filters.
    Returns profile + active plan + today's usage for each user.
    """
    supabase = get_supabase_client()

    try:
        # Build query: join profiles with user_subscriptions and subscription_plans
        query = supabase.table("profiles").select(
            "id, email, full_name, status, is_admin, created_at, suspended_at, suspended_reason,"
            "user_subscriptions!left(id, status, current_period_end, "
            "subscription_plans!inner(name, display_name, price_monthly))"
        ).order("created_at", desc=True)

        if search:
            query = query.ilike("email", f"%{search}%")
        if user_status:
            query = query.eq("status", user_status)

        offset = (page - 1) * per_page
        result = query.range(offset, offset + per_page - 1).execute()

        # Count total
        count_result = supabase.table("profiles").select("id", count="exact").execute()
        total = count_result.count or 0

        # Get today's usage for each user
        today = datetime.now(timezone.utc).date().isoformat()
        user_ids = [u["id"] for u in result.data]
        usage_result = supabase.table("usage_quotas").select(
            "user_id, cv_analyses_used, coach_seconds_used, job_searches_used"
        ).eq("quota_date", today).in_("user_id", user_ids).execute()

        usage_map = {u["user_id"]: u for u in (usage_result.data or [])}

        # Merge usage into users
        users = []
        for user in result.data:
            active_sub = next(
                (s for s in (user.get("user_subscriptions") or []) if s.get("status") == "active"),
                None
            )
            plan_filter_name = (active_sub or {}).get("subscription_plans", {}).get("name", "free")
            if plan and plan_filter_name != plan:
                continue

            users.append({
                **user,
                "plan": active_sub,
                "usage_today": usage_map.get(user["id"], {}),
            })

        return {
            "users": users,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page,
        }

    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """
    Full user detail: profile, subscription history, usage last 30 days, last 50 security events.
    """
    supabase = get_supabase_client()

    try:
        # Profile
        profile = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
        if not profile.data:
            raise HTTPException(status_code=404, detail="User not found")

        # Active subscription
        sub = supabase.table("user_subscriptions").select(
            "*, subscription_plans(name, display_name, price_monthly, limits)"
        ).eq("user_id", user_id).eq("status", "active").limit(1).execute()

        # Subscription history (last 10)
        history = supabase.table("subscription_history").select("*").eq(
            "user_id", user_id
        ).order("created_at", desc=True).limit(10).execute()

        # Usage last 30 days
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
        usage = supabase.table("usage_quotas").select("*").eq(
            "user_id", user_id
        ).gte("quota_date", thirty_days_ago).order("quota_date", desc=True).execute()

        # Security events last 50
        events = supabase.table("security_events").select(
            "id, event_type, severity, created_at, ip_address, event_data"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()

        return {
            "profile": profile.data,
            "subscription": sub.data[0] if sub.data else None,
            "subscription_history": history.data or [],
            "usage_30d": usage.data or [],
            "security_events": events.data or [],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user detail {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user detail")


@router.patch("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    body: SuspendUserRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Suspend a user account. They will be blocked from accessing the app."""
    supabase = get_supabase_client()

    try:
        result = supabase.table("profiles").update({
            "status": "suspended",
            "suspended_at": datetime.now(timezone.utc).isoformat(),
            "suspended_reason": body.reason,
        }).eq("id", user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        _log_admin_action(supabase, admin["id"], "admin.user_suspended", user_id, {
            "reason": body.reason
        })

        logger.info(f"Admin {admin['email']} suspended user {user_id}: {body.reason}")
        return {"success": True, "message": "User suspended"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to suspend user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to suspend user")


@router.patch("/users/{user_id}/reactivate")
async def reactivate_user(
    user_id: str,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Reactivate a suspended user."""
    supabase = get_supabase_client()

    try:
        result = supabase.table("profiles").update({
            "status": "active",
            "suspended_at": None,
            "suspended_reason": None,
        }).eq("id", user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        _log_admin_action(supabase, admin["id"], "admin.user_reactivated", user_id)

        logger.info(f"Admin {admin['email']} reactivated user {user_id}")
        return {"success": True, "message": "User reactivated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reactivate user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to reactivate user")


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """
    Send a password recovery email to the user via Supabase auth.admin.
    Returns the magic link (for admin copy-paste if needed).
    """
    supabase = get_supabase_client()

    try:
        # Get user email first
        profile = supabase.table("profiles").select("email").eq("id", user_id).single().execute()
        if not profile.data:
            raise HTTPException(status_code=404, detail="User not found")

        email = profile.data["email"]
        settings = get_settings()

        # Generate recovery link via Supabase admin API
        response = supabase.auth.admin.generate_link({
            "type": "recovery",
            "email": email,
            "options": {
                "redirect_to": f"{settings.get_primary_frontend_url()}/reset-password"
            }
        })

        _log_admin_action(supabase, admin["id"], "admin.password_reset", user_id, {
            "email": email
        })

        logger.info(f"Admin {admin['email']} triggered password reset for {email}")

        return {
            "success": True,
            "message": f"Password reset email sent to {email}",
            "action_link": response.properties.action_link if hasattr(response, "properties") else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reset password for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send reset email: {str(e)}")


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    body: DeleteUserRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """
    Delete a user account. Requires body: {"confirm": true}.
    Soft-deletes the profile then hard-deletes the auth user.
    """
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Send {"confirm": true} to confirm deletion'
        )

    supabase = get_supabase_client()

    try:
        # Soft-delete profile first
        supabase.table("profiles").update({
            "status": "deleted",
        }).eq("id", user_id).execute()

        # Hard delete from Supabase auth
        supabase.auth.admin.delete_user(user_id)

        _log_admin_action(supabase, admin["id"], "admin.user_deleted", user_id)

        logger.info(f"Admin {admin['email']} deleted user {user_id}")
        return {"success": True, "message": "User deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")


@router.post("/users/{user_id}/force-plan")
async def force_plan_change(
    user_id: str,
    body: ForcePlanRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """
    Force a user onto a specific plan. Updates DB only — does NOT touch Stripe.
    The next Stripe webhook will reconcile if needed.
    """
    supabase = get_supabase_client()

    try:
        # Verify plan exists
        plan = supabase.table("subscription_plans").select(
            "id, name, display_name"
        ).eq("id", body.plan_id).single().execute()

        if not plan.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        # Cancel any existing active subscriptions in DB
        supabase.table("user_subscriptions").update({
            "status": "canceled",
            "canceled_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).eq("status", "active").execute()

        # Create new subscription entry
        now = datetime.now(timezone.utc)
        result = supabase.table("user_subscriptions").insert({
            "user_id": user_id,
            "plan_id": body.plan_id,
            "status": "active",
            "current_period_start": now.isoformat(),
            "current_period_end": (now + timedelta(days=30)).isoformat(),
        }).execute()

        _log_admin_action(supabase, admin["id"], "admin.subscription_force_changed", user_id, {
            "new_plan_id": body.plan_id,
            "new_plan_name": plan.data["name"],
        })

        logger.info(
            f"Admin {admin['email']} force-changed {user_id} to plan {plan.data['name']}"
        )
        return {
            "success": True,
            "message": f"User plan changed to {plan.data['display_name']}",
            "subscription": result.data[0] if result.data else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to force plan change for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to change plan: {str(e)}")


# ============================================================
# PLANS / PACKAGE EDITOR
# ============================================================

@router.get("/plans")
async def list_plans(admin: AdminUserDep) -> List[Dict[str, Any]]:
    """List all subscription plans with their Stripe price IDs."""
    supabase = get_supabase_client()

    plans = supabase.table("subscription_plans").select(
        "*, stripe_prices(billing_period, stripe_price_id, is_active)"
    ).order("sort_order").execute()

    return plans.data or []


@router.patch("/plans/{plan_id}/limits")
async def update_plan_limits(
    plan_id: str,
    body: Dict[str, Any],
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Update numeric limits for a plan (cv_analyses, coach_seconds, job_searches)."""
    supabase = get_supabase_client()

    allowed_keys = {"cv_analyses", "coach_seconds", "job_searches"}
    limits = {k: v for k, v in body.items() if k in allowed_keys}

    if not limits:
        raise HTTPException(status_code=400, detail="No valid limit keys provided")

    try:
        # Get current limits and merge
        current = supabase.table("subscription_plans").select(
            "name, limits"
        ).eq("id", plan_id).single().execute()

        if not current.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        merged_limits = {**(current.data.get("limits") or {}), **limits}

        result = supabase.table("subscription_plans").update({
            "limits": merged_limits,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", plan_id).execute()

        _log_admin_action(supabase, admin["id"], "admin.plan_limits_updated", None, {
            "plan_id": plan_id,
            "plan_name": current.data["name"],
            "changes": limits,
        })

        return {"success": True, "limits": merged_limits}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update plan limits {plan_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update limits")


@router.patch("/plans/{plan_id}/features")
async def update_plan_features(
    plan_id: str,
    body: Dict[str, Any],
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Update feature flags array for a plan."""
    supabase = get_supabase_client()

    features = body.get("features")
    if not isinstance(features, list):
        raise HTTPException(status_code=400, detail="features must be a list")

    try:
        current = supabase.table("subscription_plans").select(
            "name"
        ).eq("id", plan_id).single().execute()

        if not current.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        result = supabase.table("subscription_plans").update({
            "features": features,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", plan_id).execute()

        _log_admin_action(supabase, admin["id"], "admin.plan_features_updated", None, {
            "plan_id": plan_id,
            "plan_name": current.data["name"],
            "features": features,
        })

        return {"success": True, "features": features}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update features")


@router.patch("/plans/{plan_id}/price")
async def update_plan_display_price(
    plan_id: str,
    body: Dict[str, Any],
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Update displayed price for a plan (DB only, does NOT touch Stripe)."""
    supabase = get_supabase_client()

    update_data: Dict[str, Any] = {}
    if "price_monthly" in body:
        update_data["price_monthly"] = float(body["price_monthly"])
    if "price_yearly" in body:
        update_data["price_yearly"] = float(body["price_yearly"])

    if not update_data:
        raise HTTPException(status_code=400, detail="No price fields provided")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        current = supabase.table("subscription_plans").select("name").eq("id", plan_id).single().execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        result = supabase.table("subscription_plans").update(update_data).eq("id", plan_id).execute()

        _log_admin_action(supabase, admin["id"], "admin.plan_price_display_updated", None, {
            "plan_id": plan_id, "plan_name": current.data["name"], "changes": update_data
        })

        return {"success": True, "plan": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update price")


@router.post("/plans/{plan_id}/stripe-price")
async def update_stripe_price(
    plan_id: str,
    body: Dict[str, Any],
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """
    Create a new Stripe price and archive the old one.
    Stripe does NOT allow editing existing prices — we must create new + archive old.
    Then updates the stripe_prices DB table via the existing update_stripe_price() RPC.
    """
    billing_period = body.get("billing_period")
    unit_amount = body.get("unit_amount")  # in cents (e.g. 890 for €8.90)
    currency = body.get("currency", "eur")

    if billing_period not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail="billing_period must be 'monthly' or 'yearly'")
    if not unit_amount or int(unit_amount) < 50:
        raise HTTPException(status_code=400, detail="unit_amount must be >= 50 cents")

    supabase = get_supabase_client()
    settings = get_settings()

    try:
        stripe_lib.api_key = settings.get_stripe_secret_key()

        # Get plan info + current price ID
        plan = supabase.table("subscription_plans").select("name, display_name").eq(
            "id", plan_id
        ).single().execute()
        if not plan.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        old_price = supabase.table("stripe_prices").select("stripe_price_id, stripe_product_id").eq(
            "plan_id", plan_id
        ).eq("billing_period", billing_period).eq("is_active", True).limit(1).execute()

        old_price_id = old_price.data[0]["stripe_price_id"] if old_price.data else None
        product_id = old_price.data[0].get("stripe_product_id") if old_price.data else None

        # Create new Stripe price
        interval = "month" if billing_period == "monthly" else "year"
        new_price = stripe_lib.Price.create(
            unit_amount=int(unit_amount),
            currency=currency,
            recurring={"interval": interval},
            product=product_id,
            nickname=f"{plan.data['display_name']} {billing_period}",
        )

        # Archive old Stripe price
        if old_price_id:
            stripe_lib.Price.modify(old_price_id, active=False)

        # Update DB via existing RPC
        supabase.rpc("update_stripe_price", {
            "p_plan_name": plan.data["name"],
            "p_billing_period": billing_period,
            "p_new_price_id": new_price.id,
            "p_new_product_id": product_id,
        }).execute()

        _log_admin_action(supabase, admin["id"], "admin.stripe_price_updated", None, {
            "plan_id": plan_id,
            "plan_name": plan.data["name"],
            "billing_period": billing_period,
            "old_price_id": old_price_id,
            "new_price_id": new_price.id,
            "unit_amount": unit_amount,
            "currency": currency,
        })

        return {
            "success": True,
            "new_price_id": new_price.id,
            "archived_price_id": old_price_id,
        }

    except HTTPException:
        raise
    except stripe_lib.StripeError as e:
        logger.error(f"Stripe error updating price: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to update Stripe price: {e}")
        raise HTTPException(status_code=500, detail="Failed to update Stripe price")


# ============================================================
# ANALYTICS
# ============================================================



@router.get("/stats")
async def get_admin_stats(admin: AdminUserDep) -> Dict[str, Any]:
    """Lightweight dashboard counters for nav badges."""
    supabase = get_supabase_client()
    users_res = supabase.table("profiles").select("id", count="exact").execute()
    webhooks_res = supabase.table("webhook_failures").select("id", count="exact").eq("resolved", False).execute()
    return {
        "total_users": users_res.count or 0,
        "webhook_failures_pending": webhooks_res.count or 0,
    }


@router.get("/analytics/churn")
async def get_churn_analytics(
    admin: AdminUserDep,
    days: int = Query(default=30, ge=1, le=365),
) -> Dict[str, Any]:
    """Users who cancelled in the last N days."""
    supabase = get_supabase_client()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = supabase.table("subscription_history").select(
        "id, user_id, created_at, old_values, notes, "
        "profiles!left(email, full_name), "
        "subscription_plans!left(name, display_name)"
    ).eq("action_type", "cancelled").gte("created_at", since).order("created_at", desc=True).limit(100).execute()
    return {"churned": result.data or [], "total": len(result.data or []), "period_days": days}


@router.get("/analytics/usage")
async def get_usage_analytics(
    admin: AdminUserDep,
    days: int = Query(default=30, ge=1, le=90),
) -> Dict[str, Any]:
    """Aggregate feature usage over the last N days."""
    from collections import defaultdict
    supabase = get_supabase_client()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    result = supabase.table("usage_quotas").select(
        "cv_analyses_used, coach_seconds_used, job_searches_used, user_id"
    ).gte("date", since).execute()
    rows = result.data or []
    totals = {
        "cv_analyses": sum(r.get("cv_analyses_used") or 0 for r in rows),
        "coach_seconds": sum(r.get("coach_seconds_used") or 0 for r in rows),
        "job_searches": sum(r.get("job_searches_used") or 0 for r in rows),
    }
    per_user: Dict[str, Dict[str, int]] = defaultdict(lambda: {"cv_analyses": 0, "coach_seconds": 0, "job_searches": 0})
    for r in rows:
        uid = r["user_id"]
        per_user[uid]["cv_analyses"] += r.get("cv_analyses_used") or 0
        per_user[uid]["coach_seconds"] += r.get("coach_seconds_used") or 0
        per_user[uid]["job_searches"] += r.get("job_searches_used") or 0
    top = sorted(per_user.items(), key=lambda x: x[1]["cv_analyses"], reverse=True)[:10]
    return {
        "totals": totals,
        "top_users": [{"user_id": uid, **s} for uid, s in top],
        "period_days": days,
        "active_users": len(per_user),
    }


@router.get("/analytics/revenue")
async def get_revenue_analytics(
    admin: AdminUserDep,
    period: str = Query(default="30d", pattern="^(30d|90d|12m)$"),
) -> Dict[str, Any]:
    """MRR, ARR, revenue breakdown by plan."""
    supabase = get_supabase_client()

    try:
        # Active paid subscriptions
        subs = supabase.table("user_subscriptions").select(
            "plan_id, subscription_plans!inner(name, display_name, price_monthly, price_yearly)"
        ).eq("status", "active").execute()

        mrr = 0.0
        by_plan: Dict[str, Dict] = {}

        for sub in (subs.data or []):
            plan_info = sub.get("subscription_plans", {})
            plan_name = plan_info.get("name", "free")
            if plan_name == "free":
                continue
            monthly = float(plan_info.get("price_monthly") or 0)
            mrr += monthly
            if plan_name not in by_plan:
                by_plan[plan_name] = {
                    "name": plan_name,
                    "display_name": plan_info.get("display_name"),
                    "count": 0,
                    "mrr": 0.0,
                }
            by_plan[plan_name]["count"] += 1
            by_plan[plan_name]["mrr"] += monthly

        # Total users per plan (including free)
        all_subs = supabase.table("user_subscriptions").select(
            "subscription_plans!inner(name)", count="exact"
        ).eq("status", "active").execute()

        total_users = supabase.table("profiles").select("id", count="exact").neq(
            "status", "deleted"
        ).execute()

        return {
            "mrr": round(mrr, 2),
            "arr": round(mrr * 12, 2),
            "by_plan": list(by_plan.values()),
            "total_paying_users": sum(v["count"] for v in by_plan.values()),
            "total_users": total_users.count or 0,
        }

    except Exception as e:
        logger.error(f"Failed to fetch revenue analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch revenue analytics")


@router.get("/analytics/subscriptions")
async def get_subscriptions_breakdown(
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Count of users per plan (active subscriptions)."""
    supabase = get_supabase_client()

    try:
        result = supabase.table("user_subscriptions").select(
            "status, subscription_plans!inner(name, display_name)"
        ).in_("status", ["active", "past_due", "trialing"]).execute()

        breakdown: Dict[str, int] = {}
        for sub in (result.data or []):
            plan_name = sub.get("subscription_plans", {}).get("name", "free")
            breakdown[plan_name] = breakdown.get(plan_name, 0) + 1

        return {"breakdown": breakdown}

    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch subscriptions breakdown")


# ============================================================
# LOGS
# ============================================================

@router.get("/logs/security")
async def get_security_logs(
    admin: AdminUserDep,
    user_id: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
) -> Dict[str, Any]:
    """Query security events with filters."""
    supabase = get_supabase_client()

    try:
        query = supabase.table("security_events").select(
            "id, event_type, severity, user_id, ip_address, created_at, event_data, "
            "profiles!left(email, full_name)"
        ).order("created_at", desc=True)

        if user_id:
            query = query.eq("user_id", user_id)
        if event_type:
            query = query.eq("event_type", event_type)
        if severity:
            query = query.eq("severity", severity)
        if from_date:
            query = query.gte("created_at", from_date)
        if to_date:
            query = query.lte("created_at", to_date)

        offset = (page - 1) * per_page
        result = query.range(offset, offset + per_page - 1).execute()

        count_q = supabase.table("security_events").select("id", count="exact")
        if user_id:
            count_q = count_q.eq("user_id", user_id)
        count_result = count_q.execute()

        return {
            "events": result.data or [],
            "total": count_result.count or 0,
            "page": page,
            "per_page": per_page,
        }

    except Exception as e:
        logger.error(f"Failed to fetch security logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch security logs")


@router.get("/logs/users/{user_id}")
async def get_user_logs(
    user_id: str,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """All security events for a specific user."""
    supabase = get_supabase_client()

    result = supabase.table("security_events").select(
        "id, event_type, severity, created_at, ip_address, event_data"
    ).eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()

    return {"events": result.data or []}


@router.get("/logs/webhooks")
async def get_webhook_logs(
    admin: AdminUserDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> Dict[str, Any]:
    """List Stripe webhook failures."""
    supabase = get_supabase_client()

    try:
        offset = (page - 1) * per_page
        result = supabase.table("webhook_failures").select("*").order(
            "created_at", desc=True
        ).range(offset, offset + per_page - 1).execute()

        count_result = supabase.table("webhook_failures").select("id", count="exact").execute()

        return {
            "failures": result.data or [],
            "total": count_result.count or 0,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch webhook logs")


# ============================================================
# REFERRALS ADMIN
# ============================================================

@router.get("/referrals/leaderboard")
async def get_referral_leaderboard(
    admin: AdminUserDep,
    limit: int = Query(default=20, ge=1, le=100),
) -> Dict[str, Any]:
    """Top referrers sorted by total_conversions."""
    supabase = get_supabase_client()
    result = supabase.table("referrals")         .select("id, referral_code, total_clicks, total_signups, total_conversions, referrer_id, profiles(email, full_name)")         .eq("is_active", True).order("total_conversions", desc=True).limit(limit).execute()
    return {"leaderboard": result.data or []}


@router.get("/referrals/stats")
async def get_referral_stats(admin: AdminUserDep) -> Dict[str, Any]:
    """Global referral program statistics."""
    supabase = get_supabase_client()
    return {
        "total_referrers": supabase.table("referrals").select("id", count="exact").execute().count or 0,
        "total_signups": supabase.table("referral_signups").select("id", count="exact").execute().count or 0,
        "total_conversions": supabase.table("referral_signups").select("id", count="exact").not_.is_("converted_to_paid_at", "null").execute().count or 0,
        "total_rewards_applied": supabase.table("referral_rewards").select("id", count="exact").eq("applied", True).execute().count or 0,
    }


@router.get("/referrals/config")
async def get_referral_config(admin: AdminUserDep) -> Dict[str, Any]:
    supabase = get_supabase_client()
    result = supabase.table("referral_config").select("*").eq("id", 1).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Referral config not found")
    return result.data


class ReferralConfigUpdate(BaseModel):
    signup_reward_type: Optional[str] = None
    signup_reward_value: Optional[Dict[str, Any]] = None
    conversion_reward_type: Optional[str] = None
    conversion_reward_value: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


@router.patch("/referrals/config")
async def update_referral_config(body: ReferralConfigUpdate, admin: AdminUserDep) -> Dict[str, Any]:
    supabase = get_supabase_client()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("referral_config").update(updates).eq("id", 1).execute()
    _log_admin_action(supabase, admin["id"], "admin.referral_config_updated", {"changes": list(updates.keys())})
    return result.data[0] if result.data else {}


@router.post("/referrals/grant-reward/{signup_id}")
async def grant_manual_reward(signup_id: str, admin: AdminUserDep) -> Dict[str, Any]:
    """Manually apply a referral reward."""
    supabase = get_supabase_client()
    from src.services.referrals import apply_referral_reward
    signup_res = supabase.table("referral_signups")         .select("id, referral_id, referred_user_id, converted_plan, referrals(referrer_id)")         .eq("id", signup_id).single().execute()
    if not signup_res.data:
        raise HTTPException(status_code=404, detail="Referral signup not found")
    signup = signup_res.data
    referrer_id = signup["referrals"]["referrer_id"]
    success = await apply_referral_reward(
        supabase, referral_signup_id=signup_id, referrer_id=referrer_id,
        plan_name=signup.get("converted_plan") or "manual",
    )
    _log_admin_action(supabase, admin["id"], "admin.referral_reward_granted", {"signup_id": signup_id})
    return {"ok": success}

