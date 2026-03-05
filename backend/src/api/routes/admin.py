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

        # Active subscription (include stripe_customer_id)
        sub = supabase.table("user_subscriptions").select(
            "*, subscription_plans(name, display_name, price_monthly, limits)"
        ).eq("user_id", user_id).eq("status", "active").limit(1).execute()
        active_sub = sub.data[0] if sub.data else None

        # Subscription history (last 10) — join plan names
        history = supabase.table("subscription_history").select(
            "*, subscription_plans(name, display_name, price_monthly)"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(10).execute()

        # Usage last 30 days (all 30 days)
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
        usage = supabase.table("usage_quotas").select("*").eq(
            "user_id", user_id
        ).gte("quota_date", thirty_days_ago).order("quota_date", desc=True).execute()

        # Security events last 50
        events = supabase.table("security_events").select(
            "id, event_type, severity, created_at, ip_address, event_data"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()

        # Last login: most recent auth.login event
        last_login_res = supabase.table("security_events").select("created_at").eq(
            "user_id", user_id
        ).eq("event_type", "auth.login").order("created_at", desc=True).limit(1).execute()
        last_login_at = last_login_res.data[0]["created_at"] if last_login_res.data else None

        # Stripe customer ID from active subscription
        stripe_customer_id = (active_sub or {}).get("stripe_customer_id")

        # Approximate total paid: sum of (price_monthly * months active) per subscription
        all_subs = supabase.table("user_subscriptions").select(
            "created_at, canceled_at, subscription_plans(price_monthly)"
        ).eq("user_id", user_id).in_("status", ["active", "canceled"]).execute()
        now = datetime.now(timezone.utc)
        total_paid = 0.0
        for s in (all_subs.data or []):
            plan_price = (s.get("subscription_plans") or {}).get("price_monthly", 0)
            try:
                start = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                end_str = s.get("canceled_at")
                end = datetime.fromisoformat(end_str.replace("Z", "+00:00")) if end_str else now
                months = max(0, (end - start).days / 30)
                total_paid += plan_price * months
            except Exception:
                pass

        return {
            "profile": profile.data,
            "subscription": active_sub,
            "subscription_history": history.data or [],
            "usage_30d": usage.data or [],
            "security_events": events.data or [],
            "last_login_at": last_login_at,
            "stripe_customer_id": stripe_customer_id,
            "total_paid": round(total_paid, 2),
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
    """Dashboard KPI counters: users, revenue, growth, churn, webhooks."""
    supabase = get_supabase_client()

    today = datetime.now(timezone.utc).date().isoformat()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    month_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    users_res = supabase.table("profiles").select("id", count="exact").execute()
    webhooks_res = supabase.table("webhook_failures").select("id", count="exact").eq("resolved", False).execute()

    # Active subscriptions + MRR
    active_subs = supabase.table("user_subscriptions").select(
        "subscription_plans(price_monthly)", count="exact"
    ).eq("status", "active").execute()
    paying_count = active_subs.count or 0
    mrr = sum(
        (s.get("subscription_plans") or {}).get("price_monthly", 0)
        for s in (active_subs.data or [])
    )

    # New users
    new_today = supabase.table("profiles").select("id", count="exact").gte("created_at", today).execute()
    new_7d = supabase.table("profiles").select("id", count="exact").gte("created_at", week_ago).execute()

    # Churn last 30 days
    churn_res = supabase.table("user_subscriptions").select("id", count="exact").eq(
        "status", "canceled"
    ).gte("canceled_at", month_ago).execute()

    return {
        "total_users": users_res.count or 0,
        "webhook_failures_pending": webhooks_res.count or 0,
        "mrr": round(mrr, 2),
        "paying_users": paying_count,
        "new_users_today": new_today.count or 0,
        "new_users_7d": new_7d.count or 0,
        "churn_30d": churn_res.count or 0,
        "arpu": round(mrr / paying_count, 2) if paying_count > 0 else 0,
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
    top_user_ids = [uid for uid, _ in top]
    email_map: Dict[str, str] = {}
    if top_user_ids:
        profiles_res = supabase.table("profiles").select("id, email").in_("id", top_user_ids).execute()
        email_map = {p["id"]: p["email"] for p in (profiles_res.data or [])}
    return {
        "totals": totals,
        "top_users": [{"user_id": uid, "email": email_map.get(uid, ""), **s} for uid, s in top],
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


# ============================================================
# RECRUITER REQUESTS ADMIN
# ============================================================

class UpdateRecruiterRequestStatusBody(BaseModel):
    status: str  # new|assigned|scheduled|completed|cancelled


@router.get("/recruiter-requests")
async def list_recruiter_requests(
    admin: AdminUserDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    req_status: Optional[str] = Query(default=None, alias="status"),
    payment_status: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """List recruiter consultation requests with pagination and filters."""
    supabase = get_supabase_client()
    offset = (page - 1) * per_page

    query = supabase.table("recruiter_requests").select("*", count="exact").order(
        "created_at", desc=True
    )
    if search:
        query = query.or_(f"full_name.ilike.%{search}%,email.ilike.%{search}%,sector.ilike.%{search}%")
    if req_status:
        query = query.eq("status", req_status)
    if payment_status:
        query = query.eq("payment_status", payment_status)

    result = query.range(offset, offset + per_page - 1).execute()
    return {
        "requests": result.data or [],
        "total": result.count or 0,
    }


@router.patch("/recruiter-requests/{request_id}/status")
async def update_recruiter_request_status(
    request_id: str,
    body: UpdateRecruiterRequestStatusBody,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Update the status of a recruiter consultation request."""
    valid_statuses = {"new", "assigned", "scheduled", "completed", "cancelled"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    supabase = get_supabase_client()
    result = supabase.table("recruiter_requests").update(
        {"status": body.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", request_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Recruiter request not found")

    _log_admin_action(
        supabase, admin["id"], "admin.recruiter_request_status_updated",
        event_data={"request_id": request_id, "new_status": body.status}
    )
    return result.data[0]


# ============================================================
# WEBHOOK FAILURE RESOLUTION
# ============================================================

@router.post("/logs/webhooks/{failure_id}/resolve")
async def resolve_webhook_failure(
    failure_id: str,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Mark a webhook failure as resolved."""
    supabase = get_supabase_client()
    result = supabase.table("webhook_failures").update(
        {"resolved": True}
    ).eq("id", failure_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Webhook failure not found")

    _log_admin_action(
        supabase, admin["id"], "admin.webhook_failure_resolved",
        event_data={"failure_id": failure_id}
    )
    return {"ok": True}


# ============================================================
# ANALYTICS — USER GROWTH & MRR TREND
# ============================================================

@router.get("/analytics/growth")
async def get_user_growth(
    admin: AdminUserDep,
    days: int = Query(default=30, ge=7, le=90),
) -> Dict[str, Any]:
    """Daily new user signups for the last N days."""
    supabase = get_supabase_client()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    result = supabase.table("profiles").select(
        "created_at"
    ).gte("created_at", since).order("created_at").execute()

    # Group by date
    counts: Dict[str, int] = {}
    for p in (result.data or []):
        try:
            date = p["created_at"][:10]
            counts[date] = counts.get(date, 0) + 1
        except Exception:
            pass

    # Fill gaps for all days in range
    growth = []
    cumulative = 0
    # Count users before the period for cumulative baseline
    total_before = supabase.table("profiles").select("id", count="exact").lt("created_at", since).execute()
    cumulative = total_before.count or 0

    for i in range(days):
        d = (datetime.now(timezone.utc) - timedelta(days=days - 1 - i)).date().isoformat()
        new = counts.get(d, 0)
        cumulative += new
        growth.append({"date": d, "new_signups": new, "cumulative": cumulative})

    return {"growth": growth, "period_days": days}


@router.get("/analytics/mrr-trend")
async def get_mrr_trend(
    admin: AdminUserDep,
    days: int = Query(default=90, ge=30, le=365),
) -> Dict[str, Any]:
    """Approximate daily MRR for the last N days (based on active subscriptions)."""
    supabase = get_supabase_client()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # Load all subscriptions created within range or active during range
    subs_res = supabase.table("user_subscriptions").select(
        "created_at, canceled_at, status, subscription_plans(price_monthly)"
    ).in_("status", ["active", "canceled", "past_due"]).execute()
    subs = subs_res.data or []

    now = datetime.now(timezone.utc)
    trend = []
    for i in range(days):
        day = (now - timedelta(days=days - 1 - i)).replace(
            hour=23, minute=59, second=59, microsecond=0
        )
        day_str = day.date().isoformat()
        mrr = 0.0
        paying = 0
        for s in subs:
            try:
                start = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                end_str = s.get("canceled_at")
                end = datetime.fromisoformat(end_str.replace("Z", "+00:00")) if end_str else now
                if start <= day <= end:
                    price = (s.get("subscription_plans") or {}).get("price_monthly", 0)
                    mrr += price
                    paying += 1
            except Exception:
                pass
        trend.append({"date": day_str, "mrr": round(mrr, 2), "paying_users": paying})

    return {"trend": trend, "period_days": days}


# ============================================================
# USER USAGE RESET
# ============================================================

@router.post("/users/{user_id}/reset-usage")
async def reset_user_usage(user_id: str, admin: AdminUserDep) -> Dict[str, Any]:
    """Reset a user's daily usage quotas to zero for today."""
    supabase = get_supabase_client()
    today = datetime.now(timezone.utc).date().isoformat()

    result = supabase.table("usage_quotas").update({
        "cv_analyses_used": 0,
        "coach_seconds_used": 0,
        "job_searches_used": 0,
    }).eq("user_id", user_id).eq("quota_date", today).execute()

    _log_admin_action(
        supabase, admin["id"], "admin.user_usage_reset", user_id,
        {"reset_date": today}
    )
    return {"ok": True, "reset_date": today}


# ============================================================
# SEGMENTS & RETENTION
# ============================================================

@router.get("/segments/at-risk")
async def get_at_risk_users(admin: AdminUserDep) -> Dict[str, Any]:
    """Abonnés actifs sans usage depuis 7+ jours."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()

    subs = supabase.table("user_subscriptions").select(
        "user_id, current_period_end, subscription_plans(name, display_name)"
    ).eq("status", "active").execute()

    if not subs.data:
        return {"users": [], "total": 0}

    user_ids = [s["user_id"] for s in subs.data]
    sub_map = {s["user_id"]: s for s in subs.data}

    # Users avec usage dans les 7 derniers jours
    recent = supabase.table("usage_quotas").select("user_id").gte(
        "quota_date", cutoff
    ).in_("user_id", user_ids).execute()
    active_ids = {r["user_id"] for r in (recent.data or [])}

    at_risk_ids = [uid for uid in user_ids if uid not in active_ids]
    if not at_risk_ids:
        return {"users": [], "total": 0}

    profiles = supabase.table("profiles").select(
        "id, email, full_name"
    ).in_("id", at_risk_ids).eq("status", "active").execute()

    # Dernière date d'usage
    last_usage = supabase.table("usage_quotas").select(
        "user_id, quota_date"
    ).in_("user_id", at_risk_ids).order("quota_date", desc=True).execute()

    last_usage_map: Dict[str, str] = {}
    for u in (last_usage.data or []):
        if u["user_id"] not in last_usage_map:
            last_usage_map[u["user_id"]] = u["quota_date"]

    today_date = datetime.now(timezone.utc).date()
    result = []
    for p in (profiles.data or []):
        sub = sub_map.get(p["id"], {})
        last = last_usage_map.get(p["id"])
        days_inactive = (today_date - datetime.fromisoformat(last).date()).days if last else None
        result.append({
            "user_id": p["id"],
            "email": p["email"],
            "full_name": p.get("full_name"),
            "plan_name": sub.get("subscription_plans", {}).get("display_name", "—") if sub.get("subscription_plans") else "—",
            "last_usage_date": last,
            "days_inactive": days_inactive,
            "current_period_end": sub.get("current_period_end"),
        })
    result.sort(key=lambda x: (x["days_inactive"] or 9999), reverse=True)
    return {"users": result, "total": len(result)}


@router.get("/segments/about-to-churn")
async def get_about_to_churn(admin: AdminUserDep) -> Dict[str, Any]:
    """Abonnés ayant annulé ou en retard de paiement."""
    supabase = get_supabase_client()

    subs = supabase.table("user_subscriptions").select(
        "user_id, status, current_period_end, cancel_at_period_end, subscription_plans(name, display_name)"
    ).or_("status.eq.past_due,cancel_at_period_end.eq.true").execute()

    if not subs.data:
        return {"users": [], "total": 0}

    user_ids = [s["user_id"] for s in subs.data]
    sub_map = {s["user_id"]: s for s in subs.data}

    profiles = supabase.table("profiles").select(
        "id, email, full_name"
    ).in_("id", user_ids).execute()

    today_date = datetime.now(timezone.utc).date()
    result = []
    for p in (profiles.data or []):
        sub = sub_map.get(p["id"], {})
        end = sub.get("current_period_end")
        days_remaining = None
        if end:
            try:
                days_remaining = (datetime.fromisoformat(end.replace("Z", "+00:00")).date() - today_date).days
            except Exception:
                pass
        result.append({
            "user_id": p["id"],
            "email": p["email"],
            "full_name": p.get("full_name"),
            "plan_name": sub.get("subscription_plans", {}).get("display_name", "—") if sub.get("subscription_plans") else "—",
            "status": sub.get("status"),
            "cancel_at_period_end": sub.get("cancel_at_period_end"),
            "current_period_end": end,
            "days_remaining": days_remaining,
        })
    result.sort(key=lambda x: (x["days_remaining"] or 9999))
    return {"users": result, "total": len(result)}


@router.get("/segments/never-converted")
async def get_never_converted(admin: AdminUserDep) -> Dict[str, Any]:
    """Inscrits depuis 14j+ sans abonnement, mais avec au moins une action."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()

    profiles_res = supabase.table("profiles").select(
        "id, email, full_name, created_at"
    ).lte("created_at", cutoff).eq("status", "active").execute()

    if not profiles_res.data:
        return {"users": [], "total": 0}

    all_ids = [p["id"] for p in profiles_res.data]

    paying_res = supabase.table("user_subscriptions").select(
        "user_id"
    ).in_("user_id", all_ids).in_("status", ["active", "trialing"]).execute()
    paying_ids = {s["user_id"] for s in (paying_res.data or [])}

    free_ids = [uid for uid in all_ids if uid not in paying_ids]
    if not free_ids:
        return {"users": [], "total": 0}

    usage_res = supabase.table("usage_quotas").select(
        "user_id, cv_analyses_used, coach_seconds_used"
    ).in_("user_id", free_ids).execute()

    usage_map: Dict[str, Dict] = {}
    for u in (usage_res.data or []):
        uid = u["user_id"]
        if uid not in usage_map:
            usage_map[uid] = {"cv": 0, "coach": 0}
        usage_map[uid]["cv"] += u.get("cv_analyses_used", 0)
        usage_map[uid]["coach"] += u.get("coach_seconds_used", 0)

    today_date = datetime.now(timezone.utc).date()
    result = []
    for p in profiles_res.data:
        if p["id"] not in free_ids:
            continue
        u = usage_map.get(p["id"], {"cv": 0, "coach": 0})
        if u["cv"] == 0 and u["coach"] == 0:
            continue  # Jamais utilisé → moins prioritaire
        try:
            days = (today_date - datetime.fromisoformat(p["created_at"].replace("Z", "+00:00")).date()).days
        except Exception:
            days = 0
        result.append({
            "user_id": p["id"],
            "email": p["email"],
            "full_name": p.get("full_name"),
            "created_at": p["created_at"],
            "days_since_signup": days,
            "cv_analyses_total": u["cv"],
            "coach_seconds_total": u["coach"],
        })
    result.sort(key=lambda x: x["cv_analyses_total"] + x["coach_seconds_total"] // 60, reverse=True)
    return {"users": result, "total": len(result)}


# ============================================================
# ANALYTICS — FUNNEL & COHORTS & FORECAST
# ============================================================

@router.get("/analytics/funnel")
async def get_conversion_funnel(
    admin: AdminUserDep,
    days: int = Query(default=30, ge=7, le=90)
) -> Dict[str, Any]:
    """Funnel de conversion : Inscrits → CV → Coach → Payé → Renouvelé."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    signups = supabase.table("profiles").select("id", count="exact").gte(
        "created_at", cutoff
    ).eq("status", "active").execute()
    total_signups = signups.count or 0

    cv_users = supabase.table("usage_quotas").select("user_id").gte(
        "quota_date", cutoff[:10]
    ).gt("cv_analyses_used", 0).execute()
    cv_count = len({r["user_id"] for r in (cv_users.data or [])})

    coach_users = supabase.table("usage_quotas").select("user_id").gte(
        "quota_date", cutoff[:10]
    ).gt("coach_seconds_used", 0).execute()
    coach_count = len({r["user_id"] for r in (coach_users.data or [])})

    paid = supabase.table("subscription_history").select("user_id").gte(
        "created_at", cutoff
    ).eq("action_type", "created").execute()
    paid_count = len({r["user_id"] for r in (paid.data or [])})

    renewed = supabase.table("subscription_history").select("user_id").gte(
        "created_at", cutoff
    ).eq("action_type", "renewed").execute()
    renewed_count = len({r["user_id"] for r in (renewed.data or [])})

    def pct(n, ref):
        return round(n / ref * 100, 1) if ref > 0 else 0

    steps = [
        {"step": 1, "label": "Inscrits", "count": total_signups, "pct_of_previous": 100.0},
        {"step": 2, "label": "A utilisé CV", "count": cv_count, "pct_of_previous": pct(cv_count, total_signups)},
        {"step": 3, "label": "A utilisé Coach", "count": coach_count, "pct_of_previous": pct(coach_count, cv_count)},
        {"step": 4, "label": "A souscrit", "count": paid_count, "pct_of_previous": pct(paid_count, coach_count)},
        {"step": 5, "label": "A renouvelé", "count": renewed_count, "pct_of_previous": pct(renewed_count, paid_count)},
    ]
    return {"funnel": steps, "period_days": days}


@router.get("/analytics/cohorts")
async def get_cohort_retention(
    admin: AdminUserDep,
    months: int = Query(default=6, ge=2, le=12)
) -> Dict[str, Any]:
    """Analyse de rétention par cohorte mensuelle."""
    supabase = get_supabase_client()
    today = datetime.now(timezone.utc)
    cohorts = []

    for i in range(months - 1, -1, -1):
        cohort_start = (today.replace(day=1) - timedelta(days=i * 30)).replace(day=1)
        if i > 0:
            cohort_end = (today.replace(day=1) - timedelta(days=(i - 1) * 30)).replace(day=1)
        else:
            cohort_end = today
        cohort_month = cohort_start.strftime("%Y-%m")

        signups = supabase.table("profiles").select("id").gte(
            "created_at", cohort_start.isoformat()
        ).lt("created_at", cohort_end.isoformat()).execute()
        cohort_ids = [p["id"] for p in (signups.data or [])]
        total = len(cohort_ids)
        if total == 0:
            cohorts.append({"cohort_month": cohort_month, "total": 0, "retained_m1": None, "retained_m2": None, "retained_m3": None})
            continue

        def retention_at(m_offset):
            check_date = (cohort_start + timedelta(days=m_offset * 30)).isoformat()
            if check_date > today.isoformat():
                return None
            active = supabase.table("user_subscriptions").select("user_id").in_(
                "user_id", cohort_ids
            ).in_("status", ["active", "trialing"]).lte("created_at", check_date).execute()
            count = len({r["user_id"] for r in (active.data or [])})
            return round(count / total * 100, 1)

        cohorts.append({
            "cohort_month": cohort_month,
            "total": total,
            "retained_m1": retention_at(1),
            "retained_m2": retention_at(2),
            "retained_m3": retention_at(3),
        })

    return {"cohorts": cohorts, "months": months}


@router.get("/analytics/mrr-forecast")
async def get_mrr_forecast(admin: AdminUserDep) -> Dict[str, Any]:
    """Prévision MRR sur 3 mois basée sur régression linéaire des 90 derniers jours."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()

    subs = supabase.table("user_subscriptions").select(
        "created_at, canceled_at, cancel_at_period_end, subscription_plans(price_monthly)"
    ).lte("created_at", datetime.now(timezone.utc).isoformat()).execute()

    subs_data = [s for s in (subs.data or []) if s.get("subscription_plans")]

    today = datetime.now(timezone.utc).date()
    days_list = [(today - timedelta(days=d)) for d in range(89, -1, -1)]
    daily_mrr = []
    for day in days_list:
        mrr = 0.0
        for s in subs_data:
            try:
                created = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00")).date()
                canceled = None
                if s.get("canceled_at"):
                    canceled = datetime.fromisoformat(s["canceled_at"].replace("Z", "+00:00")).date()
                if created <= day and (canceled is None or canceled > day):
                    mrr += s["subscription_plans"]["price_monthly"]
            except Exception:
                continue
        daily_mrr.append(mrr)

    current_mrr = daily_mrr[-1] if daily_mrr else 0

    # Régression linéaire simple
    n = len(daily_mrr)
    if n < 7:
        return {"current_mrr": current_mrr, "forecast": [], "trend_pct": 0}

    x_mean = (n - 1) / 2
    y_mean = sum(daily_mrr) / n
    num = sum((i - x_mean) * (daily_mrr[i] - y_mean) for i in range(n))
    den = sum((i - x_mean) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0

    trend_pct = round(slope * 30 / current_mrr * 100, 1) if current_mrr > 0 else 0
    forecast = []
    for m in range(1, 4):
        projected = max(0, current_mrr + slope * 30 * m)
        month_label = (today.replace(day=1) + timedelta(days=32 * m)).strftime("%Y-%m")
        forecast.append({"month": month_label, "mrr_projected": round(projected, 2)})

    return {
        "current_mrr": round(current_mrr, 2),
        "forecast": forecast,
        "trend_pct": trend_pct,
        "slope_daily": round(slope, 2),
    }


# ============================================================
# EMAIL CUSTOM
# ============================================================

class SendEmailRequest(BaseModel):
    subject: str
    body: str
    from_name: str = "Huntzen"


class BulkEmailRequest(BaseModel):
    segment: str  # 'at-risk' | 'about-to-churn' | 'never-converted' | 'all-paying'
    subject: str
    body: str


@router.post("/users/{user_id}/send-email")
async def send_custom_email(
    user_id: str,
    req: SendEmailRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Envoie un email custom à un utilisateur via Resend."""
    import resend as resend_lib
    supabase = get_supabase_client()
    settings = get_settings()

    profile = supabase.table("profiles").select("email, full_name").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    email_addr = profile.data["email"]
    resend_lib.api_key = settings.get_resend_api_key()

    html_body = req.body.replace("\n", "<br>") if not req.body.strip().startswith("<") else req.body

    resend_lib.Emails.send({
        "from": f"{req.from_name} <{settings.from_email}>",
        "to": [email_addr],
        "subject": req.subject,
        "html": html_body,
    })

    _log_admin_action(supabase, admin["id"], "admin.email_sent", user_id, {
        "subject": req.subject,
        "to": email_addr,
    })
    return {"ok": True, "sent_to": email_addr}


@router.post("/users/bulk-email")
async def send_bulk_email(
    req: BulkEmailRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Envoie un email à tous les users d'un segment."""
    import resend as resend_lib
    supabase = get_supabase_client()
    settings = get_settings()
    resend_lib.api_key = settings.get_resend_api_key()

    # Récupérer les emails du segment
    emails: List[str] = []
    if req.segment == "all-paying":
        subs = supabase.table("user_subscriptions").select("user_id").eq("status", "active").execute()
        user_ids = [s["user_id"] for s in (subs.data or [])]
        if user_ids:
            profiles = supabase.table("profiles").select("email").in_("id", user_ids).execute()
            emails = [p["email"] for p in (profiles.data or [])]
    elif req.segment in ("at-risk", "about-to-churn", "never-converted"):
        # Réutiliser les mêmes queries que les endpoints segment
        if req.segment == "at-risk":
            res = await get_at_risk_users(admin)
        elif req.segment == "about-to-churn":
            res = await get_about_to_churn(admin)
        else:
            res = await get_never_converted(admin)
        emails = [u["email"] for u in res["users"]]
    else:
        raise HTTPException(status_code=400, detail="Segment invalide")

    if not emails:
        return {"ok": True, "sent": 0, "skipped": 0}

    MAX_BULK = 500
    emails = emails[:MAX_BULK]
    html_body = req.body.replace("\n", "<br>") if not req.body.strip().startswith("<") else req.body
    sent = 0

    for email_addr in emails:
        try:
            resend_lib.Emails.send({
                "from": f"Huntzen <{settings.from_email}>",
                "to": [email_addr],
                "subject": req.subject,
                "html": html_body,
            })
            sent += 1
        except Exception:
            pass

    _log_admin_action(supabase, admin["id"], "admin.bulk_email_sent", None, {
        "segment": req.segment,
        "subject": req.subject,
        "sent": sent,
        "total": len(emails),
    })
    return {"ok": True, "sent": sent, "skipped": len(emails) - sent}


# ============================================================
# HEALTH CHECK
# ============================================================

@router.get("/health")
async def get_health_check(admin: AdminUserDep) -> Dict[str, Any]:
    """Vérifie le statut de chaque service (Supabase, Stripe, Email, Backend)."""
    import asyncio
    import time
    import httpx

    services = []

    # Backend
    services.append({"name": "Backend", "status": "ok", "latency_ms": 0})

    # Supabase
    t = time.monotonic()
    try:
        supabase = get_supabase_client()
        supabase.table("profiles").select("id").limit(1).execute()
        services.append({"name": "Supabase", "status": "ok", "latency_ms": round((time.monotonic() - t) * 1000)})
    except Exception:
        services.append({"name": "Supabase", "status": "error", "latency_ms": round((time.monotonic() - t) * 1000)})

    # Stripe
    t = time.monotonic()
    try:
        settings = get_settings()
        stripe_lib.api_key = settings.get_stripe_secret_key()
        stripe_lib.Balance.retrieve()
        services.append({"name": "Stripe", "status": "ok", "latency_ms": round((time.monotonic() - t) * 1000)})
    except Exception:
        services.append({"name": "Stripe", "status": "error", "latency_ms": round((time.monotonic() - t) * 1000)})

    # Resend (simple ping)
    t = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get("https://api.resend.com/")
            services.append({"name": "Email (Resend)", "status": "ok" if r.status_code < 500 else "error", "latency_ms": round((time.monotonic() - t) * 1000)})
    except Exception:
        services.append({"name": "Email (Resend)", "status": "error", "latency_ms": round((time.monotonic() - t) * 1000)})

    overall = "ok" if all(s["status"] == "ok" for s in services) else "degraded"
    return {"status": overall, "services": services, "checked_at": datetime.now(timezone.utc).isoformat()}


# ============================================================
# PAIEMENTS STRIPE PAR USER
# ============================================================

@router.get("/users/{user_id}/payments")
async def get_user_payments(user_id: str, admin: AdminUserDep) -> Dict[str, Any]:
    """Récupère les 20 derniers paiements Stripe d'un utilisateur."""
    supabase = get_supabase_client()
    settings = get_settings()
    stripe_lib.api_key = settings.get_stripe_secret_key()

    sub = supabase.table("user_subscriptions").select(
        "stripe_customer_id"
    ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()

    if not sub.data or not sub.data[0].get("stripe_customer_id"):
        return {"payments": [], "total": 0}

    customer_id = sub.data[0]["stripe_customer_id"]
    try:
        charges = stripe_lib.Charge.list(customer=customer_id, limit=20)
        payments = []
        for c in charges.data:
            payments.append({
                "id": c.id,
                "amount": c.amount / 100,
                "currency": c.currency.upper(),
                "status": c.status,
                "created_at": datetime.fromtimestamp(c.created, tz=timezone.utc).isoformat(),
                "description": c.description,
                "receipt_url": c.receipt_url,
            })
        return {"payments": payments, "total": len(payments)}
    except Exception as e:
        logger.warning(f"Stripe payments fetch failed for {user_id}: {e}")
        return {"payments": [], "total": 0}


# ============================================================
# IMPERSONATION
# ============================================================

@router.post("/users/{user_id}/impersonate")
async def impersonate_user(user_id: str, admin: AdminUserDep) -> Dict[str, Any]:
    """Génère un magic link pour se connecter en tant qu'un utilisateur."""
    supabase = get_supabase_client()

    profile = supabase.table("profiles").select("email, full_name, status").eq("id", user_id).single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if profile.data["status"] != "active":
        raise HTTPException(status_code=400, detail="Impossible d'impersonner un compte suspendu ou supprimé")

    email = profile.data["email"]
    try:
        result = supabase.auth.admin.generate_link({
            "type": "magiclink",
            "email": email,
        })
        magic_link = result.properties.action_link if result.properties else None
        if not magic_link:
            raise HTTPException(status_code=500, detail="Impossible de générer le lien")
    except Exception as e:
        logger.error(f"Impersonation failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur génération lien : {str(e)}")

    _log_admin_action(supabase, admin["id"], "admin.impersonation", user_id, {
        "target_email": email,
        "admin_email": admin.get("email"),
    })
    return {"magic_link": magic_link, "expires_in": 300, "target_email": email}


# ============================================================
# FEATURE OVERRIDES PAR USER
# ============================================================

ALL_FEATURES = [
    "advanced_filters", "favorites", "ats_score", "pdf_export",
    "cv_history", "interview_sim", "email_alerts", "personalized_advice",
    "coach_history", "cover_letter", "branding",
]


class FeatureOverrideRequest(BaseModel):
    feature_name: str
    enabled: bool
    note: Optional[str] = None


@router.get("/users/{user_id}/feature-overrides")
async def get_feature_overrides(user_id: str, admin: AdminUserDep) -> Dict[str, Any]:
    """Retourne les feature overrides d'un utilisateur + la liste de toutes les features."""
    supabase = get_supabase_client()
    res = supabase.table("user_feature_overrides").select("*").eq("user_id", user_id).execute()
    overrides = {r["feature_name"]: r for r in (res.data or [])}

    features = []
    for f in ALL_FEATURES:
        override = overrides.get(f)
        features.append({
            "name": f,
            "has_override": override is not None,
            "override_enabled": override["enabled"] if override else None,
            "note": override.get("note") if override else None,
            "override_id": override["id"] if override else None,
        })
    return {"features": features, "total_overrides": len(overrides)}


@router.post("/users/{user_id}/feature-overrides")
async def set_feature_override(
    user_id: str,
    req: FeatureOverrideRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Crée ou met à jour un feature override pour un utilisateur."""
    if req.feature_name not in ALL_FEATURES:
        raise HTTPException(status_code=400, detail=f"Feature inconnue : {req.feature_name}")
    supabase = get_supabase_client()
    supabase.table("user_feature_overrides").upsert({
        "user_id": user_id,
        "feature_name": req.feature_name,
        "enabled": req.enabled,
        "note": req.note,
        "updated_by": admin["id"],
    }, on_conflict="user_id,feature_name").execute()

    _log_admin_action(supabase, admin["id"], "admin.feature_override_set", user_id, {
        "feature": req.feature_name,
        "enabled": req.enabled,
    })
    return {"ok": True}


@router.delete("/users/{user_id}/feature-overrides/{feature_name}")
async def delete_feature_override(
    user_id: str,
    feature_name: str,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Supprime un feature override — l'user revient aux droits de son plan."""
    supabase = get_supabase_client()
    supabase.table("user_feature_overrides").delete().eq(
        "user_id", user_id
    ).eq("feature_name", feature_name).execute()
    _log_admin_action(supabase, admin["id"], "admin.feature_override_removed", user_id, {
        "feature": feature_name,
    })
    return {"ok": True}


# ============================================================
# ÉDITEUR DE PROMPTS IA
# ============================================================

PROMPTS_DIR = __import__("pathlib").Path(__file__).parent.parent.parent.parent / "prompts"

PROMPT_DISPLAY_NAMES = {
    "cover_letter_generator": "Générateur de lettre de motivation",
    "cv_adapter_main": "Adaptateur CV (principal)",
    "cv_adapter_job_analyzer": "Adaptateur CV — Analyste offre",
    "cv_adapter_cv_mapper": "Adaptateur CV — Mapper CV",
    "cv_adapter_fact_checker": "Adaptateur CV — Vérificateur",
    "cv_adapter_rewriter": "Adaptateur CV — Réécriture",
    "cv_improvement_advisor": "Conseiller amélioration CV",
    "cv_job_matcher": "CV Job Matcher",
    "cv_skill_extractor": "Extracteur de compétences",
    "cv_ats_scorer": "Scoring ATS",
    "cv_analyzer_context": "Contexte Analyseur CV",
    "coach_main": "Coach (principal)",
    "coach_career_planner": "Coach — Planificateur carrière",
    "coach_salary_advisor": "Coach — Conseiller salaire",
    "coach_skill_analyzer": "Coach — Analyseur compétences",
    "coach_training_advisor": "Coach — Conseiller formation",
    "job_scout_context": "Job Scout — Contexte",
    "job_scout_ranker": "Job Scout — Classement",
    "job_scout_market_analyzer": "Job Scout — Marché",
    "job_scout_query_refiner": "Job Scout — Requête",
    "parameter_extractor": "Extracteur de paramètres",
    "branding_main": "Branding (principal)",
    "insider_finder": "Insider Finder",
}


class PromptUpdateRequest(BaseModel):
    content: str


@router.get("/prompts")
async def list_prompts(admin: AdminUserDep) -> Dict[str, Any]:
    """Liste tous les prompts depuis la DB (seed depuis fichiers si vide)."""
    supabase = get_supabase_client()
    res = supabase.table("ai_prompts").select("name, display_name, updated_at, updated_by").order("name").execute()

    if not res.data:
        # Seed depuis les fichiers .txt
        prompts_to_insert = []
        for txt_file in PROMPTS_DIR.glob("*.txt"):
            name = txt_file.stem
            try:
                content = txt_file.read_text(encoding="utf-8")
                prompts_to_insert.append({
                    "name": name,
                    "display_name": PROMPT_DISPLAY_NAMES.get(name, name.replace("_", " ").title()),
                    "content": content,
                })
            except Exception:
                pass
        if prompts_to_insert:
            supabase.table("ai_prompts").insert(prompts_to_insert).execute()
        res = supabase.table("ai_prompts").select("name, display_name, updated_at, updated_by").order("name").execute()

    return {"prompts": res.data or [], "total": len(res.data or [])}


@router.get("/prompts/{name}")
async def get_prompt(name: str, admin: AdminUserDep) -> Dict[str, Any]:
    """Retourne le contenu complet d'un prompt."""
    supabase = get_supabase_client()
    res = supabase.table("ai_prompts").select("*").eq("name", name).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' introuvable")
    return res.data


@router.put("/prompts/{name}")
async def update_prompt(
    name: str,
    req: PromptUpdateRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Met à jour le contenu d'un prompt."""
    supabase = get_supabase_client()
    res = supabase.table("ai_prompts").update({
        "content": req.content,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin["id"],
    }).eq("name", name).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' introuvable")

    _log_admin_action(supabase, admin["id"], "admin.prompt_updated", None, {"prompt_name": name})
    return {"ok": True, "name": name}


# ============================================================
# CODES PROMO STRIPE
# ============================================================

class CouponCreateRequest(BaseModel):
    name: str
    percent_off: Optional[float] = None
    amount_off: Optional[int] = None
    currency: str = "eur"
    duration: str = "once"  # "once" | "forever" | "repeating"
    duration_in_months: Optional[int] = None
    max_redemptions: Optional[int] = None


class ApplyCouponRequest(BaseModel):
    coupon_id: str


@router.get("/coupons")
async def list_coupons(admin: AdminUserDep) -> Dict[str, Any]:
    """Liste les coupons Stripe actifs."""
    settings = get_settings()
    stripe_lib.api_key = settings.get_stripe_secret_key()
    try:
        coupons = stripe_lib.Coupon.list(limit=100)
        result = []
        for c in coupons.data:
            result.append({
                "id": c.id,
                "name": c.name,
                "percent_off": c.percent_off,
                "amount_off": (c.amount_off or 0) / 100 if c.amount_off else None,
                "currency": (c.currency or "eur").upper(),
                "duration": c.duration,
                "duration_in_months": c.duration_in_months,
                "max_redemptions": c.max_redemptions,
                "times_redeemed": c.times_redeemed,
                "valid": c.valid,
                "created_at": datetime.fromtimestamp(c.created, tz=timezone.utc).isoformat(),
            })
        return {"coupons": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}")


@router.post("/coupons")
async def create_coupon(req: CouponCreateRequest, admin: AdminUserDep) -> Dict[str, Any]:
    """Crée un coupon Stripe."""
    settings = get_settings()
    stripe_lib.api_key = settings.get_stripe_secret_key()

    if req.percent_off is None and req.amount_off is None:
        raise HTTPException(status_code=400, detail="percent_off ou amount_off requis")

    params: Dict[str, Any] = {
        "name": req.name,
        "duration": req.duration,
        "currency": req.currency,
    }
    if req.percent_off is not None:
        params["percent_off"] = req.percent_off
    if req.amount_off is not None:
        params["amount_off"] = req.amount_off
    if req.duration == "repeating" and req.duration_in_months:
        params["duration_in_months"] = req.duration_in_months
    if req.max_redemptions:
        params["max_redemptions"] = req.max_redemptions

    try:
        coupon = stripe_lib.Coupon.create(**params)
        _log_admin_action(get_supabase_client(), admin["id"], "admin.coupon_created", None, {
            "coupon_id": coupon.id,
            "name": req.name,
        })
        return {"ok": True, "id": coupon.id, "name": coupon.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}")


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, admin: AdminUserDep) -> Dict[str, Any]:
    """Supprime un coupon Stripe."""
    settings = get_settings()
    stripe_lib.api_key = settings.get_stripe_secret_key()
    try:
        stripe_lib.Coupon.delete(coupon_id)
        _log_admin_action(get_supabase_client(), admin["id"], "admin.coupon_deleted", None, {
            "coupon_id": coupon_id,
        })
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}")


@router.post("/users/{user_id}/apply-coupon")
async def apply_coupon_to_user(
    user_id: str,
    req: ApplyCouponRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Applique un coupon Stripe à l'abonnement actif d'un utilisateur."""
    supabase = get_supabase_client()
    settings = get_settings()
    stripe_lib.api_key = settings.get_stripe_secret_key()

    sub = supabase.table("user_subscriptions").select(
        "stripe_subscription_id, stripe_customer_id"
    ).eq("user_id", user_id).eq("status", "active").single().execute()

    if not sub.data:
        raise HTTPException(status_code=404, detail="Aucun abonnement actif pour cet utilisateur")

    stripe_sub_id = sub.data.get("stripe_subscription_id")
    if not stripe_sub_id:
        raise HTTPException(status_code=400, detail="Pas de subscription Stripe associée")

    try:
        stripe_lib.Subscription.modify(stripe_sub_id, coupon=req.coupon_id)
        _log_admin_action(supabase, admin["id"], "admin.coupon_applied", user_id, {
            "coupon_id": req.coupon_id,
            "stripe_subscription_id": stripe_sub_id,
        })
        return {"ok": True, "coupon_applied": req.coupon_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}")
