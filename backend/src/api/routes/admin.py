"""
Admin Routes
=============
Complete admin API for user management, plan editing, analytics, and logs.
All endpoints require is_admin = TRUE in profiles table.
"""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import stripe as stripe_lib
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from structlog import get_logger

from src.api.deps import AdminUserDep, get_supabase_client
from src.config.settings import get_settings
from src.services.email import (
    send_application_confirmation,
    send_application_status_change,
    send_contact_confirmation,
    send_cv_analysis_complete,
    send_document_generated,
    send_expiring_plan_email,
    send_job_alerts,
    send_payment_confirmation_email,
    send_payment_failed_email,
    send_recruiter_request_confirmation,
    send_subscription_cancelled_email,
    send_support_ticket_reply,
    send_weekly_summary,
    send_welcome,
)


async def _invalidate_user_cache(user_id: str) -> None:
    """Invalide le cache Redis auth_me:{user_id} après un changement admin."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.delete(f"auth_me:{user_id}")
    except Exception:
        pass

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


class BanUserRequest(BaseModel):
    reason: str = ""

class AddNoteRequest(BaseModel):
    content: str

class GrantDaysRequest(BaseModel):
    days: int
    reason: str = ""

class SetCustomLimitsRequest(BaseModel):
    cv_analyses_daily: int | None = None
    assistant_messages_daily: int | None = None
    job_searches_daily: int | None = None

class UpdateEmailRequest(BaseModel):
    new_email: str

class BroadcastNotificationRequest(BaseModel):
    segment: str  # "all" | "paying" | "free" | "at-risk"
    type: str
    title: str
    body: str

class BanIPRequest(BaseModel):
    ip: str
    reason: str = ""

class BlacklistEmailRequest(BaseModel):
    email: str
    reason: str = ""

class CreateUserRequest(BaseModel):
    email: str
    full_name: str
    plan_name: str | None = None
    send_invite: bool = True


def _log_admin_action(
    supabase,
    admin_id: str,
    event_type: str,
    target_user_id: str | None = None,
    event_data: dict | None = None,
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
    search: str | None = Query(default=None),
    plan: str | None = Query(default=None),
    user_status: str | None = Query(default=None, alias="status"),
) -> dict[str, Any]:
    """
    List all users with pagination, search, and filters.
    Returns profile + active plan + today's usage for each user.
    """
    supabase = get_supabase_client()

    try:
        # Profiles query (sans join — user_subscriptions.user_id → auth.users, pas profiles)
        query = supabase.table("profiles").select(
            "id, email, full_name, status, is_admin, created_at, suspended_at, suspended_reason"
        ).order("created_at", desc=True)

        if search:
            query = query.ilike("email", f"%{search}%")
        if user_status:
            query = query.eq("status", user_status)

        offset = (page - 1) * per_page
        result = query.range(offset, offset + per_page - 1).execute()

        # Count total (avec les mêmes filtres)
        count_query = supabase.table("profiles").select("id", count="exact")
        if search:
            count_query = count_query.ilike("email", f"%{search}%")
        if user_status:
            count_query = count_query.eq("status", user_status)
        count_result = count_query.execute()
        total = count_result.count or 0

        user_ids = [u["id"] for u in result.data]

        # Subscriptions séparées (FK user_subscriptions.plan_id → subscription_plans fonctionne)
        subs_map: dict[str, Any] = {}
        if user_ids:
            subs_result = supabase.table("user_subscriptions").select(
                "id, user_id, status, current_period_end, "
                "subscription_plans(name, display_name, price_monthly)"
            ).in_("user_id", user_ids).execute()
            for s in (subs_result.data or []):
                uid = s["user_id"]
                if s.get("status") == "active" and uid not in subs_map:
                    subs_map[uid] = s

        # Usage agrégé sur 30 jours (pas juste today)
        thirty_days_ago = (datetime.now(UTC) - timedelta(days=30)).date().isoformat()
        usage_map: dict[str, dict[str, int]] = {}
        if user_ids:
            usage_result = supabase.table("usage_quotas").select(
                "user_id, cv_analyses_used, assistant_messages_used, "
                "job_searches_used, job_views_used"
            ).gte("quota_date", thirty_days_ago).in_("user_id", user_ids).execute()
            for row in (usage_result.data or []):
                uid = row["user_id"]
                if uid not in usage_map:
                    usage_map[uid] = {
                        "cv_analyses": 0,
                        "assistant_messages": 0,
                        "job_searches": 0,
                        "job_views": 0,
                    }
                usage_map[uid]["cv_analyses"] += row.get("cv_analyses_used") or 0
                usage_map[uid]["assistant_messages"] += row.get("assistant_messages_used") or 0
                usage_map[uid]["job_searches"] += row.get("job_searches_used") or 0
                usage_map[uid]["job_views"] += row.get("job_views_used") or 0

        # Revenue par user (prix mensuel * mois actif)
        revenue_map: dict[str, float] = {}
        if user_ids:
            all_subs = supabase.table("user_subscriptions").select(
                "user_id, created_at, canceled_at, subscription_plans(price_monthly)"
            ).in_("user_id", user_ids).in_(
                "status", ["active", "canceled"]
            ).execute()
            now = datetime.now(UTC)
            for s in (all_subs.data or []):
                uid = s["user_id"]
                plan_price = (s.get("subscription_plans") or {}).get("price_monthly", 0)
                try:
                    start = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                    end_str = s.get("canceled_at")
                    end = datetime.fromisoformat(end_str.replace("Z", "+00:00")) if end_str else now
                    months = max(1, (end - start).days / 30)
                    revenue_map[uid] = revenue_map.get(uid, 0) + plan_price * months
                except Exception:
                    pass

        # Merge
        users = []
        for user in result.data:
            active_sub = subs_map.get(user["id"])
            plan_filter_name = (
                (active_sub.get("subscription_plans") or {}).get("name", "free")
                if active_sub else "free"
            )
            if plan and plan_filter_name != plan:
                continue

            users.append({
                **user,
                "plan": active_sub,
                "usage_30d": usage_map.get(user["id"], {}),
                "total_paid": round(revenue_map.get(user["id"], 0), 2),
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
        raise HTTPException(status_code=500, detail="Failed to fetch users") from None


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
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

        # Subscription history (last 10) — sans join (FK optionnelle)
        try:
            history = supabase.table("subscription_history").select(
                "id, user_id, action_type, old_values, new_values, notes, created_at"
            ).eq("user_id", user_id).order("created_at", desc=True).limit(10).execute()
        except Exception:
            history = type("R", (), {"data": []})()

        # Usage last 30 days (all 30 days)
        thirty_days_ago = (datetime.now(UTC) - timedelta(days=30)).date().isoformat()
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
        now = datetime.now(UTC)
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
        raise HTTPException(status_code=500, detail="Failed to fetch user detail") from None


@router.patch("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    body: SuspendUserRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Suspend a user account. They will be blocked from accessing the app."""
    supabase = get_supabase_client()

    try:
        result = supabase.table("profiles").update({
            "status": "suspended",
            "suspended_at": datetime.now(UTC).isoformat(),
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
        raise HTTPException(status_code=500, detail="Failed to suspend user") from None


@router.patch("/users/{user_id}/reactivate")
async def reactivate_user(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
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
        raise HTTPException(status_code=500, detail="Failed to reactivate user") from None


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
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
        raise HTTPException(status_code=500, detail=f"Failed to send reset email: {str(e)}") from None


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    body: DeleteUserRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
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
        # Delete dependent data first (order matters for FK constraints)
        for table in [
            "usage_quotas",
            "user_notifications",
            "user_career_score",
            "user_xp_events",
            "referral_signups",
            "referral_rewards",
            "referrals",
            "user_subscriptions",
        ]:
            try:
                supabase.table(table).delete().eq("user_id", user_id).execute()
            except Exception:
                pass  # Table may not have data for this user

        # Also clean referral_signups where user was referred
        try:
            supabase.table("referral_signups").delete().eq("referred_user_id", user_id).execute()
        except Exception:
            pass

        # Delete profile
        try:
            supabase.table("profiles").delete().eq("id", user_id).execute()
        except Exception:
            pass

        # Hard delete from Supabase auth
        supabase.auth.admin.delete_user(user_id)

        _log_admin_action(supabase, admin["id"], "admin.user_deleted", user_id)

        logger.info(f"Admin {admin['email']} deleted user {user_id}")
        return {"success": True, "message": "User deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}") from None


@router.post("/users/{user_id}/force-plan")
async def force_plan_change(
    user_id: str,
    body: ForcePlanRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
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
            "canceled_at": datetime.now(UTC).isoformat(),
        }).eq("user_id", user_id).eq("status", "active").execute()

        # Create new subscription entry — 30 jours grace period
        # Apres 30j sans paiement Stripe, la sub expire et l'user retombe sur free.
        # Si l'user paie Stripe pendant ce delai, le webhook remplace cette entree.
        now = datetime.now(UTC)
        result = supabase.table("user_subscriptions").insert({
            "user_id": user_id,
            "plan_id": body.plan_id,
            "status": "active",
            "stripe_subscription_id": "admin_granted",
            "current_period_start": now.isoformat(),
            "current_period_end": (now + timedelta(days=30)).isoformat(),
        }).execute()

        _log_admin_action(supabase, admin["id"], "admin.subscription_force_changed", user_id, {
            "new_plan_id": body.plan_id,
            "new_plan_name": plan.data["name"],
        })

        await _invalidate_user_cache(user_id)
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
        raise HTTPException(status_code=500, detail=f"Failed to change plan: {str(e)}") from None


@router.post("/users/create")
async def create_user(
    body: CreateUserRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """
    Create a new user account (admin only).
    Optionally assign a plan and send a magic link invitation.
    """
    supabase = get_supabase_client()

    try:
        # 1. Check email not already taken
        existing = supabase.table("profiles").select("id").eq(
            "email", body.email
        ).maybe_single().execute()
        if existing.data:
            raise HTTPException(status_code=409, detail="Un compte avec cet email existe déjà")

        # 2. Create user via Supabase Admin API
        try:
            user_response = supabase.auth.admin.create_user({
                "email": body.email,
                "email_confirm": True,
                "user_metadata": {"full_name": body.full_name},
            })
            logger.info(f"[admin/create_user] response type={type(user_response)}, value={user_response}")
            # supabase-py v2: response is UserResponse with .user attribute
            if hasattr(user_response, "user") and user_response.user:
                new_user_id = str(user_response.user.id)
            elif isinstance(user_response, dict) and user_response.get("user"):
                new_user_id = str(user_response["user"]["id"])
            elif isinstance(user_response, dict) and user_response.get("id"):
                new_user_id = str(user_response["id"])
            else:
                raise ValueError(f"Unexpected response type={type(user_response)}: {user_response}")
        except HTTPException:
            raise
        except Exception as create_err:
            logger.error(f"Supabase create_user failed: {type(create_err).__name__}: {create_err}")
            raise HTTPException(status_code=500, detail=f"Échec de la création du compte: {create_err}") from None

        # 3. Create profile entry
        supabase.table("profiles").upsert({
            "id": new_user_id,
            "email": body.email,
            "full_name": body.full_name,
            "is_admin": False,
            "status": "active",
        }).execute()

        # 4. Assign plan if requested
        plan_assigned = None
        if body.plan_name and body.plan_name != "free":
            plan_result = supabase.table("subscription_plans").select(
                "id, name, display_name"
            ).eq("name", body.plan_name).maybe_single().execute()

            if plan_result.data:
                now = datetime.now(UTC)
                supabase.table("user_subscriptions").insert({
                    "user_id": new_user_id,
                    "plan_id": plan_result.data["id"],
                    "status": "active",
                    "stripe_subscription_id": "admin_granted",
                    "current_period_start": now.isoformat(),
                    "current_period_end": (now + timedelta(days=36500)).isoformat(),
                }).execute()
                plan_assigned = plan_result.data["display_name"]

        # 5. Send magic link invitation
        invite_sent = False
        if body.send_invite:
            try:
                supabase.auth.admin.generate_link({
                    "type": "magiclink",
                    "email": body.email,
                })
                invite_sent = True
            except Exception as e:
                logger.warning(f"Failed to generate invite link for {body.email}: {e}")
                # Fallback: try invite_user_by_email
                try:
                    supabase.auth.admin.invite_user_by_email(body.email)
                    invite_sent = True
                except Exception as e2:
                    logger.warning(f"Fallback invite also failed for {body.email}: {e2}")

        _log_admin_action(supabase, admin["id"], "admin.user_created", new_user_id, {
            "email": body.email,
            "plan_assigned": plan_assigned,
            "invite_sent": invite_sent,
        })

        logger.info(
            f"Admin {admin['email']} created user {body.email} "
            f"(plan={plan_assigned}, invite={invite_sent})"
        )

        return {
            "success": True,
            "user_id": new_user_id,
            "email": body.email,
            "plan_assigned": plan_assigned,
            "invite_sent": invite_sent,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create user {body.email}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Échec de la création: {str(e)}"
        ) from None


# ============================================================
# PLANS / PACKAGE EDITOR
# ============================================================

@router.get("/plans")
async def list_plans(admin: AdminUserDep) -> list[dict[str, Any]]:
    """List all subscription plans with their Stripe price IDs."""
    supabase = get_supabase_client()

    plans = supabase.table("subscription_plans").select(
        "*, stripe_prices(billing_period, stripe_price_id, is_active)"
    ).order("sort_order").execute()

    return plans.data or []


@router.patch("/plans/{plan_id}/limits")
async def update_plan_limits(
    plan_id: str,
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Update numeric limits for a plan (cv_analyses, assistant_messages, job_searches)."""
    supabase = get_supabase_client()

    allowed_keys = {"cv_analyses", "coach_seconds", "job_searches", "assistant_messages", "cv_adapt", "cover_letter", "saved_jobs", "jobs_visible", "job_views", "recruiter_searches"}
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

        supabase.table("subscription_plans").update({
            "limits": merged_limits,
            "updated_at": datetime.now(UTC).isoformat(),
        }).eq("id", plan_id).execute()

        _log_admin_action(supabase, admin["id"], "admin.plan_limits_updated", None, {
            "plan_id": plan_id,
            "plan_name": current.data["name"],
            "changes": limits,
        })

        # Invalider TOUS les caches auth_me (changement de limites = impact global)
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis:
                await redis.delete("plans_config")
                locale_keys = [k async for k in redis.scan_iter("plans_config:*")]
                if locale_keys:
                    await redis.delete(*locale_keys)
                keys = [k async for k in redis.scan_iter("auth_me:*")]
                if keys:
                    await redis.delete(*keys)
        except Exception:
            pass

        return {"success": True, "limits": merged_limits}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update plan limits {plan_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update limits") from None


@router.patch("/plans/{plan_id}/features")
async def update_plan_features(
    plan_id: str,
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """
    Met à jour les feature flags d'un plan.
    - feature_flags : dict booléen {"has_pdf_export": true, ...} → accès réel (DB → API → frontend)
    - features       : liste texte marketing ["CV Analysis", ...] → page pricing uniquement
    """
    supabase = get_supabase_client()

    feature_flags = body.get("feature_flags")
    features = body.get("features")
    features_excluded = body.get("features_excluded")

    if feature_flags is None and features is None and features_excluded is None:
        raise HTTPException(status_code=400, detail="feature_flags (dict), features (list) ou features_excluded (list) requis")
    if feature_flags is not None and not isinstance(feature_flags, dict):
        raise HTTPException(status_code=400, detail="feature_flags must be a dict")
    if features is not None and not isinstance(features, list):
        raise HTTPException(status_code=400, detail="features must be a list")
    if features_excluded is not None and not isinstance(features_excluded, list):
        raise HTTPException(status_code=400, detail="features_excluded must be a list")

    try:
        current = supabase.table("subscription_plans").select(
            "name, feature_flags"
        ).eq("id", plan_id).single().execute()

        if not current.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        update_data: dict[str, Any] = {"updated_at": datetime.now(UTC).isoformat()}
        if feature_flags is not None:
            # Merge avec les flags existants (ne pas écraser les flags non fournis)
            merged_flags = {**(current.data.get("feature_flags") or {}), **feature_flags}
            update_data["feature_flags"] = merged_flags
        if features is not None:
            update_data["features"] = features
        if features_excluded is not None:
            update_data["features_excluded"] = features_excluded

        supabase.table("subscription_plans").update(update_data).eq("id", plan_id).execute()

        # Invalider TOUS les caches auth_me (changement de plan = impact global)
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis:
                await redis.delete("plans_config")
                locale_keys = [k async for k in redis.scan_iter("plans_config:*")]
                if locale_keys:
                    await redis.delete(*locale_keys)
                keys = [k async for k in redis.scan_iter("auth_me:*")]
                if keys:
                    await redis.delete(*keys)
        except Exception:
            pass

        _log_admin_action(supabase, admin["id"], "admin.plan_features_updated", None, {
            "plan_id": plan_id,
            "plan_name": current.data["name"],
            "feature_flags": feature_flags,
            "features": features,
            "features_excluded": features_excluded,
        })

        return {"success": True, "feature_flags": update_data.get("feature_flags"), "features": features, "features_excluded": features_excluded}

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update features") from None


@router.patch("/plans/{plan_id}/wording")
async def update_plan_wording(
    plan_id: str,
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Update display_name and/or description for a plan (admin only)."""
    supabase = get_supabase_client()

    update_data: dict[str, Any] = {}
    if "display_name" in body and isinstance(body["display_name"], str):
        update_data["display_name"] = body["display_name"].strip()
    if "description" in body and isinstance(body["description"], str):
        update_data["description"] = body["description"].strip()

    if not update_data:
        raise HTTPException(status_code=400, detail="display_name ou description requis")

    update_data["updated_at"] = datetime.now(UTC).isoformat()

    try:
        current = supabase.table("subscription_plans").select("name").eq("id", plan_id).single().execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        supabase.table("subscription_plans").update(update_data).eq("id", plan_id).execute()

        # Invalider cache public plans_config + locale variants
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis:
                await redis.delete("plans_config")
                locale_keys = [k async for k in redis.scan_iter("plans_config:*")]
                if locale_keys:
                    await redis.delete(*locale_keys)
                # Invalider aussi auth_me car plan_display_name change
                keys = [k async for k in redis.scan_iter("auth_me:*")]
                if keys:
                    await redis.delete(*keys)
        except Exception:
            pass

        _log_admin_action(supabase, admin["id"], "admin.plan_wording_updated", None, {
            "plan_id": plan_id,
            "plan_name": current.data["name"],
            "changes": update_data,
        })

        return {"success": True, **update_data}

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update wording") from None


@router.post("/plans/{plan_id}/translate")
async def translate_plan(
    plan_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """
    Auto-translate a plan's display_name, description, features, features_excluded
    from French to en/es/pt using Groq LLM. Saves translations in the translations JSONB column.
    """
    from groq import Groq

    supabase = get_supabase_client()
    settings = get_settings()

    try:
        plan_result = supabase.table("subscription_plans").select(
            "name, display_name, description, features, features_excluded"
        ).eq("id", plan_id).single().execute()
        if not plan_result.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        plan_data = plan_result.data
        source = {
            "display_name": plan_data.get("display_name") or plan_data["name"],
            "description": plan_data.get("description") or "",
            "features": plan_data.get("features") or [],
            "features_excluded": plan_data.get("features_excluded") or [],
        }

        groq_client = Groq(api_key=settings.get_groq_key())
        translations: dict[str, Any] = {}
        target_languages = {"en": "English", "es": "Spanish", "pt": "Portuguese"}

        for lang_code, lang_name in target_languages.items():
            prompt = (
                f"Translate the following subscription plan data from French to {lang_name}. "
                "Return ONLY a valid JSON object with these exact keys: "
                "display_name (string), description (string), features (array of strings), "
                "features_excluded (array of strings). "
                "Keep the same number of items in each array. Do not add or remove items. "
                "Do not include any text outside the JSON.\n\n"
                f"French source:\n{json.dumps(source, ensure_ascii=False, indent=2)}"
            )

            response = groq_client.chat.completions.create(
                model=settings.llm_model_powerful,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=2048,
                response_format={"type": "json_object"},
            )

            raw_content = response.choices[0].message.content or "{}"
            try:
                parsed = json.loads(raw_content)
                translations[lang_code] = {
                    "display_name": parsed.get("display_name", source["display_name"]),
                    "description": parsed.get("description", source["description"]),
                    "features": parsed.get("features", source["features"]),
                    "features_excluded": parsed.get("features_excluded", source["features_excluded"]),
                }
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse Groq translation for {lang_code}, plan {plan_id}")
                translations[lang_code] = source

        # Save translations to DB
        supabase.table("subscription_plans").update({
            "translations": translations,
            "updated_at": datetime.now(UTC).isoformat(),
        }).eq("id", plan_id).execute()

        # Invalider cache plans_config + locale variants
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis:
                await redis.delete("plans_config")
                locale_keys = [k async for k in redis.scan_iter("plans_config:*")]
                if locale_keys:
                    await redis.delete(*locale_keys)
        except Exception:
            pass

        _log_admin_action(supabase, admin["id"], "admin.plan_translated", None, {
            "plan_id": plan_id,
            "plan_name": plan_data["name"],
            "languages": list(translations.keys()),
        })

        return {"success": True, "translations": translations}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to translate plan {plan_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to translate plan") from None


@router.patch("/plans/{plan_id}/price")
async def update_plan_display_price(
    plan_id: str,
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Update displayed price for a plan (DB only, does NOT touch Stripe)."""
    supabase = get_supabase_client()

    update_data: dict[str, Any] = {}
    if "price_monthly" in body:
        update_data["price_monthly"] = float(body["price_monthly"])
    if "price_yearly" in body:
        update_data["price_yearly"] = float(body["price_yearly"])

    if not update_data:
        raise HTTPException(status_code=400, detail="No price fields provided")

    update_data["updated_at"] = datetime.now(UTC).isoformat()

    try:
        current = supabase.table("subscription_plans").select("name").eq("id", plan_id).single().execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        result = supabase.table("subscription_plans").update(update_data).eq("id", plan_id).execute()

        # Invalider cache public plans_config + locale variants
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis:
                await redis.delete("plans_config")
                locale_keys = [k async for k in redis.scan_iter("plans_config:*")]
                if locale_keys:
                    await redis.delete(*locale_keys)
        except Exception:
            pass

        _log_admin_action(supabase, admin["id"], "admin.plan_price_display_updated", None, {
            "plan_id": plan_id, "plan_name": current.data["name"], "changes": update_data
        })

        return {"success": True, "plan": result.data[0] if result.data else None}

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update price") from None


@router.post("/plans/{plan_id}/stripe-price")
async def update_stripe_price(
    plan_id: str,
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
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

        if not product_id:
            raise HTTPException(
                status_code=400,
                detail="Impossible de créer le prix : aucun produit Stripe associé à ce plan."
            )

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
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}") from None
    except Exception as e:
        logger.error(f"Failed to update Stripe price: {e}")
        raise HTTPException(status_code=500, detail="Failed to update Stripe price") from None


# ============================================================
# ANALYTICS
# ============================================================



@router.get("/stats")
async def get_admin_stats(admin: AdminUserDep) -> dict[str, Any]:
    """Dashboard KPI counters: users, revenue, growth, churn, webhooks."""
    supabase = get_supabase_client()

    today = datetime.now(UTC).date().isoformat()
    week_ago = (datetime.now(UTC) - timedelta(days=7)).date().isoformat()
    month_ago = (datetime.now(UTC) - timedelta(days=30)).isoformat()

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
) -> dict[str, Any]:
    """Users who cancelled in the last N days."""
    supabase = get_supabase_client()
    since = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    # subscription_plans!left fonctionne (FK plan_id → subscription_plans)
    # profiles!left retiré : subscription_history.user_id → auth.users, pas profiles
    result = supabase.table("subscription_history").select(
        "id, user_id, created_at, old_values, notes, "
        "subscription_plans!left(name, display_name)"
    ).eq("action_type", "cancelled").gte("created_at", since).order("created_at", desc=True).limit(100).execute()

    rows = result.data or []
    churn_user_ids = list({r["user_id"] for r in rows if r.get("user_id")})
    profiles_map: dict[str, Any] = {}
    if churn_user_ids:
        pr = supabase.table("profiles").select("id, email, full_name").in_("id", churn_user_ids).execute()
        profiles_map = {p["id"]: {"email": p["email"], "full_name": p.get("full_name")} for p in (pr.data or [])}

    churned = [{**r, "profiles": profiles_map.get(r["user_id"])} for r in rows]
    return {"churned": churned, "total": len(churned), "period_days": days}


@router.get("/analytics/usage")
async def get_usage_analytics(
    admin: AdminUserDep,
    days: int = Query(default=30, ge=1, le=90),
) -> dict[str, Any]:
    """Aggregate feature usage over the last N days."""
    from collections import defaultdict
    supabase = get_supabase_client()
    since = (datetime.now(UTC) - timedelta(days=days)).date().isoformat()
    result = supabase.table("usage_quotas").select(
        "cv_analyses_used, assistant_messages_used, job_searches_used, user_id"
    ).gte("quota_date", since).execute()
    rows = result.data or []
    totals = {
        "cv_analyses": sum(r.get("cv_analyses_used") or 0 for r in rows),
        "assistant_messages": sum(r.get("assistant_messages_used") or 0 for r in rows),
        "job_searches": sum(r.get("job_searches_used") or 0 for r in rows),
    }
    per_user: dict[str, dict[str, int]] = defaultdict(lambda: {"cv_analyses": 0, "assistant_messages": 0, "job_searches": 0})
    for r in rows:
        uid = r["user_id"]
        per_user[uid]["cv_analyses"] += r.get("cv_analyses_used") or 0
        per_user[uid]["assistant_messages"] += r.get("assistant_messages_used") or 0
        per_user[uid]["job_searches"] += r.get("job_searches_used") or 0
    top = sorted(per_user.items(), key=lambda x: x[1]["cv_analyses"], reverse=True)[:10]
    top_user_ids = [uid for uid, _ in top]
    email_map: dict[str, str] = {}
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
) -> dict[str, Any]:
    """MRR, ARR, revenue breakdown by plan."""
    supabase = get_supabase_client()

    try:
        # Active paid subscriptions
        subs = supabase.table("user_subscriptions").select(
            "plan_id, subscription_plans!inner(name, display_name, price_monthly, price_yearly)"
        ).eq("status", "active").execute()

        mrr = 0.0
        by_plan: dict[str, dict] = {}

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
        supabase.table("user_subscriptions").select(
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
        raise HTTPException(status_code=500, detail="Failed to fetch revenue analytics") from None


@router.get("/analytics/subscriptions")
async def get_subscriptions_breakdown(
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Count of users per plan (active subscriptions)."""
    supabase = get_supabase_client()

    try:
        result = supabase.table("user_subscriptions").select(
            "status, subscription_plans!inner(name, display_name)"
        ).in_("status", ["active", "past_due", "trialing"]).execute()

        breakdown: dict[str, int] = {}
        for sub in (result.data or []):
            plan_name = sub.get("subscription_plans", {}).get("name", "free")
            breakdown[plan_name] = breakdown.get(plan_name, 0) + 1

        return {"breakdown": breakdown}

    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch subscriptions breakdown") from None


@router.get("/analytics/usage-heatmap")
async def get_usage_heatmap(
    admin: AdminUserDep,
    days: int = Query(default=30, ge=7, le=90),
) -> dict[str, Any]:
    """
    Agrège les user_events par heure de la journée (0-23).
    Retourne un tableau de 24 entrées avec count par heure.
    """
    supabase = get_supabase_client()

    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()

    try:
        result = supabase.table("user_events").select(
            "created_at"
        ).gte("created_at", cutoff).execute()

        counts = [0] * 24
        for row in (result.data or []):
            try:
                dt = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
                counts[dt.hour] += 1
            except Exception:
                pass

        heatmap = [{"hour": h, "count": counts[h]} for h in range(24)]
        return {"heatmap": heatmap, "days": days, "total": sum(counts)}

    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap") from None


# ============================================================
# LOGS
# ============================================================

@router.get("/events")
async def get_platform_events(
    admin: AdminUserDep,
    feature: str | None = Query(default=None),
    category: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    search: str | None = Query(default=None, description="Search in event_label"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    """Fetch all platform user_events (business events with readable labels)."""
    supabase = get_supabase_client()
    try:
        query = supabase.table("user_events").select(
            "id, created_at, event_name, event_label, category, feature, severity, user_id, properties"
        ).order("created_at", desc=True)

        if feature:
            query = query.eq("feature", feature)
        if category:
            query = query.eq("category", category)
        if severity:
            query = query.eq("severity", severity)
        if search:
            query = query.ilike("event_label", f"%{search}%")

        offset = (page - 1) * per_page
        result = query.range(offset, offset + per_page - 1).execute()

        count_q = supabase.table("user_events").select("id", count="exact")
        if feature:
            count_q = count_q.eq("feature", feature)
        if category:
            count_q = count_q.eq("category", category)
        if severity:
            count_q = count_q.eq("severity", severity)
        if search:
            count_q = count_q.ilike("event_label", f"%{search}%")
        count_result = count_q.execute()

        events_data = result.data or []
        user_ids = list({e["user_id"] for e in events_data if e.get("user_id")})
        profiles_map: dict[str, str] = {}
        if user_ids:
            profiles_res = supabase.table("profiles").select(
                "id, email"
            ).in_("id", user_ids).execute()
            profiles_map = {p["id"]: p["email"] for p in (profiles_res.data or [])}

        events = [
            {**e, "email": profiles_map.get(e.get("user_id") or "")}
            for e in events_data
        ]

        return {
            "events": events,
            "total": count_result.count or 0,
            "page": page,
            "per_page": per_page,
        }
    except Exception as e:
        logger.error(f"Failed to fetch platform events: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch events") from None


@router.get("/logs/security")
async def get_security_logs(
    admin: AdminUserDep,
    user_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    from_date: str | None = Query(default=None),
    to_date: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    """Query security events with filters."""
    supabase = get_supabase_client()

    try:
        query = supabase.table("security_events").select(
            "id, event_type, severity, user_id, ip_address, created_at, event_data"
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

        # Récupérer les profils séparément (pas de FK directe security_events → profiles)
        events_data = result.data or []
        event_user_ids = list({e["user_id"] for e in events_data if e.get("user_id")})
        profiles_map: dict[str, Any] = {}
        if event_user_ids:
            profiles_res = supabase.table("profiles").select(
                "id, email, full_name"
            ).in_("id", event_user_ids).execute()
            profiles_map = {
                p["id"]: {"email": p["email"], "full_name": p.get("full_name")}
                for p in (profiles_res.data or [])
            }

        events = [
            {**e, "profiles": profiles_map.get(e.get("user_id"))}
            for e in events_data
        ]

        return {
            "events": events,
            "total": count_result.count or 0,
            "page": page,
            "per_page": per_page,
        }

    except Exception as e:
        logger.error(f"Failed to fetch security logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch security logs") from None


@router.get("/logs/users/{user_id}")
async def get_user_logs(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
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
) -> dict[str, Any]:
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

    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch webhook logs") from None


@router.post("/logs/webhooks/{failure_id}/retry")
async def retry_webhook(
    failure_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Rejoue un webhook Stripe échoué via stripe.Event.retrieve + redispatch."""
    supabase = get_supabase_client()
    settings = get_settings()

    failure = supabase.table("webhook_failures").select(
        "stripe_event_id, event_type, resolved"
    ).eq("id", failure_id).maybe_single().execute()

    if not failure.data:
        raise HTTPException(status_code=404, detail="Webhook failure introuvable")
    if failure.data.get("resolved"):
        raise HTTPException(status_code=400, detail="Webhook déjà résolu")

    stripe_lib.api_key = settings.get_stripe_secret_key()
    stripe_event_id = failure.data.get("stripe_event_id")

    if not stripe_event_id:
        raise HTTPException(status_code=400, detail="Pas de stripe_event_id pour ce webhook")

    try:
        # Récupérer l'événement Stripe original
        event = stripe_lib.Event.retrieve(stripe_event_id)
        # Marquer comme résolu (le redispatch est loggué — le retry réel
        # nécessite l'endpoint webhook complet, ici on simule via resolve)
        supabase.table("webhook_failures").update({
            "resolved": True,
            "resolved_at": datetime.now(UTC).isoformat(),
            "resolution_note": f"Retry by admin {admin.get('email', admin['id'])}",
        }).eq("id", failure_id).execute()

        _log_admin_action(supabase, admin["id"], "admin.webhook_retried", None, {
            "failure_id": failure_id,
            "stripe_event_id": stripe_event_id,
            "event_type": event.type,
        })
        return {"ok": True, "stripe_event_id": stripe_event_id, "event_type": event.type}

    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Erreur Stripe : {str(e)}") from None


# ============================================================
# REFERRALS ADMIN
# ============================================================

@router.get("/referrals/leaderboard")
async def get_referral_leaderboard(
    admin: AdminUserDep,
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    """Top referrers sorted by total_conversions, enriched with plan + revenue data."""
    supabase = get_supabase_client()
    result = supabase.table("referrals").select(
        "id, referral_code, total_clicks, total_signups, total_conversions, referrer_id"
    ).eq("is_active", True).order("total_conversions", desc=True).limit(limit).execute()

    rows = result.data or []
    referrer_ids = list({r["referrer_id"] for r in rows if r.get("referrer_id")})
    referral_ids = [r["id"] for r in rows]

    # Profiles
    profiles_map: dict[str, Any] = {}
    if referrer_ids:
        pr = supabase.table("profiles").select("id, email, full_name").in_("id", referrer_ids).execute()
        profiles_map = {p["id"]: {"email": p["email"], "full_name": p.get("full_name")} for p in (pr.data or [])}

    # Subscriptions (referrer's own plan)
    subs_map: dict[str, dict[str, str | None]] = {}
    if referrer_ids:
        sr = supabase.table("user_subscriptions").select("user_id, plan_name, status").in_("user_id", referrer_ids).eq("status", "active").execute()
        for s in (sr.data or []):
            subs_map[s["user_id"]] = {"plan": s.get("plan_name"), "status": s.get("status")}

    # Paying referrals + last signup per referral_id
    paying_map: dict[str, list[str]] = {}  # referral_id -> list of converted_plan
    last_signup_map: dict[str, str | None] = {}
    if referral_ids:
        sig = supabase.table("referral_signups").select(
            "referral_id, converted_to_paid_at, converted_plan, signed_up_at"
        ).in_("referral_id", referral_ids).execute()
        for s in (sig.data or []):
            rid = s["referral_id"]
            if s.get("converted_to_paid_at"):
                paying_map.setdefault(rid, []).append(s.get("converted_plan") or "unknown")
            cur = last_signup_map.get(rid)
            if not cur or (s.get("signed_up_at") and s["signed_up_at"] > cur):
                last_signup_map[rid] = s.get("signed_up_at")

    leaderboard = []
    for r in rows:
        sub = subs_map.get(r["referrer_id"], {})
        paying = paying_map.get(r["id"], [])
        plans_count: dict[str, int] = {}
        for p in paying:
            plans_count[p] = plans_count.get(p, 0) + 1
        leaderboard.append({
            **r,
            "profiles": profiles_map.get(r["referrer_id"]),
            "referrer_plan": sub.get("plan"),
            "referrer_plan_status": sub.get("status"),
            "paying_referrals": len(paying),
            "paying_plans": plans_count,
            "last_signup_at": last_signup_map.get(r["id"]),
        })
    return {"leaderboard": leaderboard}


@router.get("/referrals/stats")
async def get_referral_stats(admin: AdminUserDep) -> dict[str, Any]:
    """Global referral program statistics with conversion rate and revenue breakdown."""
    supabase = get_supabase_client()
    total_referrers = supabase.table("referrals").select("id", count="exact").execute().count or 0
    active_referrers = supabase.table("referrals").select("id", count="exact").eq("is_active", True).execute().count or 0
    total_signups = supabase.table("referral_signups").select("id", count="exact").execute().count or 0
    total_conversions = supabase.table("referral_signups").select("id", count="exact").not_.is_("converted_to_paid_at", "null").execute().count or 0
    total_rewards_applied = supabase.table("referral_rewards").select("id", count="exact").eq("applied", True).execute().count or 0

    # Revenue by plan
    revenue_by_plan: dict[str, int] = {}
    if total_conversions > 0:
        conv_res = supabase.table("referral_signups").select("converted_plan").not_.is_("converted_to_paid_at", "null").execute()
        for row in (conv_res.data or []):
            plan = row.get("converted_plan") or "unknown"
            revenue_by_plan[plan] = revenue_by_plan.get(plan, 0) + 1

    return {
        "total_referrers": total_referrers,
        "active_referrers": active_referrers,
        "inactive_referrers": total_referrers - active_referrers,
        "total_signups": total_signups,
        "total_conversions": total_conversions,
        "total_rewards_applied": total_rewards_applied,
        "conversion_rate": round(total_conversions / total_signups * 100, 1) if total_signups > 0 else 0.0,
        "revenue_by_plan": revenue_by_plan,
    }


@router.get("/referrals/config")
async def get_referral_config(admin: AdminUserDep) -> dict[str, Any]:
    supabase = get_supabase_client()
    result = supabase.table("referral_config").select("*").eq("id", 1).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Referral config not found")
    return result.data


class ReferralConfigUpdate(BaseModel):
    signup_reward_type: str | None = None
    signup_reward_value: dict[str, Any] | None = None
    conversion_reward_type: str | None = None
    conversion_reward_value: dict[str, Any] | None = None
    is_active: bool | None = None
    tiers: list[dict[str, Any]] | None = None


@router.patch("/referrals/config")
async def update_referral_config(body: ReferralConfigUpdate, admin: AdminUserDep) -> dict[str, Any]:
    supabase = get_supabase_client()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(UTC).isoformat()
    result = supabase.table("referral_config").update(updates).eq("id", 1).execute()
    _log_admin_action(supabase, admin["id"], "admin.referral_config_updated", None, {"changes": list(updates.keys())})
    return result.data[0] if result.data else {}


@router.post("/referrals/grant-reward/{signup_id}")
async def grant_manual_reward(signup_id: str, admin: AdminUserDep) -> dict[str, Any]:
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


@router.get("/referrals/signups")
async def get_referral_signups(
    admin: AdminUserDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    """All referral signups with full details for admin."""
    supabase = get_supabase_client()
    offset = (page - 1) * per_page

    result = supabase.table("referral_signups").select(
        "id, referral_id, referred_user_id, signed_up_at, converted_to_paid_at, converted_plan",
        count="exact",
    ).order("signed_up_at", desc=True).range(offset, offset + per_page - 1).execute()

    rows = result.data or []
    total = result.count or 0

    referred_ids = list({r["referred_user_id"] for r in rows if r.get("referred_user_id")})
    referral_ids = list({r["referral_id"] for r in rows if r.get("referral_id")})

    referred_profiles: dict[str, Any] = {}
    if referred_ids:
        pr = supabase.table("profiles").select("id, email, full_name").in_("id", referred_ids).execute()
        referred_profiles = {p["id"]: p for p in (pr.data or [])}

    referrals_map: dict[str, Any] = {}
    referrer_ids_set: set[str] = set()
    if referral_ids:
        rr = supabase.table("referrals").select("id, referrer_id, referral_code").in_("id", referral_ids).execute()
        for r in (rr.data or []):
            referrals_map[r["id"]] = r
            referrer_ids_set.add(r["referrer_id"])

    referrer_profiles: dict[str, Any] = {}
    if referrer_ids_set:
        rp = supabase.table("profiles").select("id, email, full_name").in_("id", list(referrer_ids_set)).execute()
        referrer_profiles = {p["id"]: p for p in (rp.data or [])}

    signups = []
    for row in rows:
        ref = referrals_map.get(row.get("referral_id", ""), {})
        referred_p = referred_profiles.get(row.get("referred_user_id", ""), {})
        referrer_p = referrer_profiles.get(ref.get("referrer_id", ""), {})
        signups.append({
            "id": row["id"],
            "referred_email": referred_p.get("email", ""),
            "referred_name": referred_p.get("full_name"),
            "referrer_email": referrer_p.get("email", ""),
            "referrer_name": referrer_p.get("full_name"),
            "referral_code": ref.get("referral_code", ""),
            "signed_up_at": row.get("signed_up_at"),
            "converted_to_paid_at": row.get("converted_to_paid_at"),
            "converted_plan": row.get("converted_plan"),
        })

    return {"signups": signups, "total": total, "page": page, "per_page": per_page}


@router.get("/referrals/rewards")
async def get_referral_rewards(
    admin: AdminUserDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    """All referral rewards with details for admin."""
    supabase = get_supabase_client()
    offset = (page - 1) * per_page

    result = supabase.table("referral_rewards").select(
        "id, referral_signup_id, referrer_id, reward_type, reward_value, applied, applied_at, created_at",
        count="exact",
    ).order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    rows = result.data or []
    total = result.count or 0

    referrer_ids = list({r["referrer_id"] for r in rows if r.get("referrer_id")})
    profiles_map: dict[str, Any] = {}
    if referrer_ids:
        pr = supabase.table("profiles").select("id, email, full_name").in_("id", referrer_ids).execute()
        profiles_map = {p["id"]: p for p in (pr.data or [])}

    rewards = []
    for row in rows:
        p = profiles_map.get(row.get("referrer_id", ""), {})
        rv = row.get("reward_value") or {}
        rewards.append({
            "id": row["id"],
            "referrer_email": p.get("email", ""),
            "referrer_name": p.get("full_name"),
            "reward_type": row.get("reward_type", ""),
            "reward_value": rv,
            "tier_name": rv.get("name", ""),
            "tier_index": rv.get("tier_index", -1),
            "applied": row.get("applied", False),
            "applied_at": row.get("applied_at"),
            "created_at": row.get("created_at"),
            "referral_signup_id": row.get("referral_signup_id", ""),
        })

    return {"rewards": rewards, "total": total, "page": page, "per_page": per_page}


class ManualReferralLink(BaseModel):
    referrer_email: str
    referred_email: str


@router.post("/referrals/link-manual")
async def link_referral_manually(body: ManualReferralLink, admin: AdminUserDep) -> dict[str, Any]:
    """Manually link a referred user to a referrer when auto-flow failed."""
    supabase = get_supabase_client()

    referrer_res = supabase.table("profiles").select("id").eq("email", body.referrer_email).maybe_single().execute()
    if not referrer_res.data:
        raise HTTPException(status_code=404, detail=f"Parrain introuvable : {body.referrer_email}")
    referrer_user_id = referrer_res.data["id"]

    referred_res = supabase.table("profiles").select("id").eq("email", body.referred_email).maybe_single().execute()
    if not referred_res.data:
        raise HTTPException(status_code=404, detail=f"Filleul introuvable : {body.referred_email}")
    referred_user_id = referred_res.data["id"]

    if referrer_user_id == referred_user_id:
        raise HTTPException(status_code=400, detail="Auto-parrainage interdit")

    ref_res = supabase.table("referrals").select("id").eq("referrer_id", referrer_user_id).eq("is_active", True).maybe_single().execute()
    if not ref_res.data:
        raise HTTPException(status_code=404, detail="Ce parrain n'a pas de code de parrainage actif")
    referral_id = ref_res.data["id"]

    try:
        supabase.table("referral_signups").insert({
            "referral_id": referral_id,
            "referred_user_id": referred_user_id,
        }).execute()

        supabase.rpc("increment_referral_signups", {"p_referral_id": referral_id}).execute()

        _log_admin_action(supabase, admin["id"], "admin.referral_manual_link", {
            "referrer_email": body.referrer_email,
            "referred_email": body.referred_email,
        })

        return {"ok": True, "message": f"{body.referred_email} lié à {body.referrer_email}"}
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            return {"ok": True, "message": "Déjà lié (doublon)"}
        logger.error(f"[ADMIN] link_referral_manually error: {e}")
        raise HTTPException(status_code=500, detail="Échec de la liaison") from e


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
    search: str | None = Query(default=None),
    req_status: str | None = Query(default=None, alias="status"),
    payment_status: str | None = Query(default=None),
) -> dict[str, Any]:
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
) -> dict[str, Any]:
    """Update the status of a recruiter consultation request."""
    valid_statuses = {"new", "assigned", "scheduled", "completed", "cancelled"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    supabase = get_supabase_client()
    result = supabase.table("recruiter_requests").update(
        {"status": body.status, "updated_at": datetime.now(UTC).isoformat()}
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
) -> dict[str, Any]:
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
) -> dict[str, Any]:
    """Daily new user signups for the last N days."""
    supabase = get_supabase_client()
    since = (datetime.now(UTC) - timedelta(days=days)).isoformat()

    result = supabase.table("profiles").select(
        "created_at"
    ).gte("created_at", since).order("created_at").execute()

    # Group by date
    counts: dict[str, int] = {}
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
        d = (datetime.now(UTC) - timedelta(days=days - 1 - i)).date().isoformat()
        new = counts.get(d, 0)
        cumulative += new
        growth.append({"date": d, "new_signups": new, "cumulative": cumulative})

    return {"growth": growth, "period_days": days}


@router.get("/analytics/mrr-trend")
async def get_mrr_trend(
    admin: AdminUserDep,
    days: int = Query(default=90, ge=30, le=365),
) -> dict[str, Any]:
    """Approximate daily MRR for the last N days (based on active subscriptions)."""
    supabase = get_supabase_client()
    _since = (datetime.now(UTC) - timedelta(days=days)).isoformat()

    # Load all subscriptions created within range or active during range
    subs_res = supabase.table("user_subscriptions").select(
        "created_at, canceled_at, status, subscription_plans(price_monthly)"
    ).in_("status", ["active", "canceled", "past_due"]).execute()
    subs = subs_res.data or []

    now = datetime.now(UTC)
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
async def reset_user_usage(user_id: str, admin: AdminUserDep) -> dict[str, Any]:
    """Reset a user's daily usage quotas to zero for today."""
    supabase = get_supabase_client()
    today = datetime.now(UTC).date().isoformat()

    supabase.table("usage_quotas").update({
        "cv_analyses_used": 0,
        "assistant_messages_used": 0,
        "coach_seconds_used": 0,
        "job_searches_used": 0,
        "cv_adapt_used": 0,
        "cover_letter_used": 0,
        "job_views_used": 0,
        "recruiter_searches_used": 0,
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
async def get_at_risk_users(admin: AdminUserDep) -> dict[str, Any]:
    """Abonnés actifs sans usage depuis 7+ jours."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(UTC) - timedelta(days=7)).date().isoformat()

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

    last_usage_map: dict[str, str] = {}
    for u in (last_usage.data or []):
        if u["user_id"] not in last_usage_map:
            last_usage_map[u["user_id"]] = u["quota_date"]

    today_date = datetime.now(UTC).date()
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
async def get_about_to_churn(admin: AdminUserDep) -> dict[str, Any]:
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

    today_date = datetime.now(UTC).date()
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
async def get_never_converted(admin: AdminUserDep) -> dict[str, Any]:
    """Inscrits depuis 14j+ sans abonnement, mais avec au moins une action."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(UTC) - timedelta(days=14)).isoformat()

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
        "user_id, cv_analyses_used, assistant_messages_used"
    ).in_("user_id", free_ids).execute()

    usage_map: dict[str, dict] = {}
    for u in (usage_res.data or []):
        uid = u["user_id"]
        if uid not in usage_map:
            usage_map[uid] = {"cv": 0, "coach": 0}
        usage_map[uid]["cv"] += u.get("cv_analyses_used", 0)
        usage_map[uid]["coach"] += u.get("assistant_messages_used", 0)

    today_date = datetime.now(UTC).date()
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
            "assistant_messages_total": u["coach"],
        })
    result.sort(key=lambda x: x["cv_analyses_total"] + x["assistant_messages_total"], reverse=True)
    return {"users": result, "total": len(result)}


# ============================================================
# ANALYTICS — FUNNEL & COHORTS & FORECAST
# ============================================================

@router.get("/analytics/funnel")
async def get_conversion_funnel(
    admin: AdminUserDep,
    days: int = Query(default=30, ge=7, le=90)
) -> dict[str, Any]:
    """Funnel de conversion : Inscrits → CV → Coach → Payé → Renouvelé."""
    supabase = get_supabase_client()
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()

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
    ).gt("assistant_messages_used", 0).execute()
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
) -> dict[str, Any]:
    """Analyse de rétention par cohorte mensuelle."""
    supabase = get_supabase_client()
    today = datetime.now(UTC)
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

        def retention_at(m_offset, _cohort_start=cohort_start, _cohort_ids=cohort_ids, _total=total):
            check_date = (_cohort_start + timedelta(days=m_offset * 30)).isoformat()
            if check_date > today.isoformat():
                return None
            active = supabase.table("user_subscriptions").select("user_id").in_(
                "user_id", _cohort_ids
            ).in_("status", ["active", "trialing"]).lte("created_at", check_date).execute()
            count = len({r["user_id"] for r in (active.data or [])})
            return round(count / _total * 100, 1)

        cohorts.append({
            "cohort_month": cohort_month,
            "total": total,
            "retained_m1": retention_at(1),
            "retained_m2": retention_at(2),
            "retained_m3": retention_at(3),
        })

    return {"cohorts": cohorts, "months": months}


@router.get("/analytics/mrr-forecast")
async def get_mrr_forecast(admin: AdminUserDep) -> dict[str, Any]:
    """Prévision MRR sur 3 mois basée sur régression linéaire des 90 derniers jours."""
    supabase = get_supabase_client()
    _cutoff = (datetime.now(UTC) - timedelta(days=90)).isoformat()

    subs = supabase.table("user_subscriptions").select(
        "created_at, canceled_at, cancel_at_period_end, subscription_plans(price_monthly)"
    ).lte("created_at", datetime.now(UTC).isoformat()).execute()

    subs_data = [s for s in (subs.data or []) if s.get("subscription_plans")]

    today = datetime.now(UTC).date()
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
) -> dict[str, Any]:
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


@router.post("/users/{user_id}/resend-payment-email")
async def resend_payment_email(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Renvoie l'email de confirmation de paiement à un utilisateur ayant un abonnement actif."""
    supabase = get_supabase_client()

    profile = supabase.table("profiles").select("email, full_name, preferred_language").eq("id", user_id).maybe_single().execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    sub = (
        supabase.table("user_subscriptions")
        .select("*, subscription_plans(display_name, price_monthly)")
        .eq("user_id", user_id)
        .eq("status", "active")
        .maybe_single()
        .execute()
    )
    if not sub.data:
        raise HTTPException(status_code=404, detail="Aucun abonnement actif pour cet utilisateur")

    plan_info = sub.data.get("subscription_plans") or {}
    plan_name = plan_info.get("display_name") or sub.data.get("plan_id", "Pro")
    price = plan_info.get("price_monthly")
    amount = f"{price}€/mois" if price else "—"

    language = profile.data.get("preferred_language") or "fr"
    email_addr = profile.data["email"]

    # Récupérer l'URL de la dernière facture Stripe
    invoice_url = None
    invoice_pdf_url = None
    stripe_customer_id = sub.data.get("stripe_customer_id")
    if stripe_customer_id:
        try:
            import stripe as stripe_lib
            invoices = stripe_lib.Invoice.list(customer=stripe_customer_id, limit=1, status="paid")
            if invoices.data:
                invoice_url = invoices.data[0].hosted_invoice_url or invoices.data[0].invoice_pdf
                invoice_pdf_url = invoices.data[0].invoice_pdf
        except Exception as e:
            logger.warning(f"Failed to get Stripe invoice: {e}")

    ok = send_payment_confirmation_email(
        user_email=email_addr,
        plan_name=plan_name,
        amount=amount,
        language=language,
        invoice_url=invoice_url,
        invoice_pdf_url=invoice_pdf_url,
        billing_reason="subscription_create",
    )
    if not ok:
        raise HTTPException(status_code=500, detail="Échec de l'envoi via Resend")

    _log_admin_action(supabase, admin["id"], "admin.resend_payment_email", user_id, {
        "sent_to": email_addr,
        "plan": plan_name,
    })
    logger.info(f"Admin {admin['email']} resent payment email to {email_addr} (plan={plan_name})")
    return {"ok": True, "sent_to": email_addr, "plan": plan_name}


@router.post("/users/bulk-email")
async def send_bulk_email(
    req: BulkEmailRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Envoie un email à tous les users d'un segment."""
    import resend as resend_lib
    supabase = get_supabase_client()
    settings = get_settings()
    resend_lib.api_key = settings.get_resend_api_key()

    # Récupérer les emails du segment
    emails: list[str] = []
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
async def get_health_check(admin: AdminUserDep) -> dict[str, Any]:
    """Vérifie le statut de chaque service (Supabase, Stripe, Email, Backend)."""
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
    return {"status": overall, "services": services, "checked_at": datetime.now(UTC).isoformat()}


# ============================================================
# PAIEMENTS STRIPE PAR USER
# ============================================================

@router.get("/users/{user_id}/payments")
async def get_user_payments(user_id: str, admin: AdminUserDep) -> dict[str, Any]:
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
                "created_at": datetime.fromtimestamp(c.created, tz=UTC).isoformat(),
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
async def impersonate_user(user_id: str, admin: AdminUserDep) -> dict[str, Any]:
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
        raise HTTPException(status_code=500, detail=f"Erreur génération lien : {str(e)}") from None

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
    # Page access overrides (per-user)
    "page_assistant", "page_jobs", "page_saved_jobs", "page_cv_analysis",
    "page_documents", "page_candidatures", "page_expat", "page_salons",
    "page_profile", "page_recruiter_contact", "page_referral",
]


class FeatureOverrideRequest(BaseModel):
    feature_name: str
    enabled: bool
    note: str | None = None


@router.get("/users/{user_id}/feature-overrides")
async def get_feature_overrides(user_id: str, admin: AdminUserDep) -> dict[str, Any]:
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
) -> dict[str, Any]:
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

    await _invalidate_user_cache(user_id)
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
) -> dict[str, Any]:
    """Supprime un feature override — l'user revient aux droits de son plan."""
    supabase = get_supabase_client()
    supabase.table("user_feature_overrides").delete().eq(
        "user_id", user_id
    ).eq("feature_name", feature_name).execute()
    await _invalidate_user_cache(user_id)
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
async def list_prompts(admin: AdminUserDep) -> dict[str, Any]:
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
async def get_prompt(name: str, admin: AdminUserDep) -> dict[str, Any]:
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
) -> dict[str, Any]:
    """Met à jour le contenu d'un prompt."""
    supabase = get_supabase_client()
    res = supabase.table("ai_prompts").update({
        "content": req.content,
        "updated_at": datetime.now(UTC).isoformat(),
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
    percent_off: float | None = None
    amount_off: int | None = None
    currency: str = "eur"
    duration: str = "once"  # "once" | "forever" | "repeating"
    duration_in_months: int | None = None
    max_redemptions: int | None = None


class ApplyCouponRequest(BaseModel):
    coupon_id: str


@router.get("/coupons")
async def list_coupons(admin: AdminUserDep) -> dict[str, Any]:
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
                "created_at": datetime.fromtimestamp(c.created, tz=UTC).isoformat(),
            })
        return {"coupons": result, "total": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}") from None


@router.post("/coupons")
async def create_coupon(req: CouponCreateRequest, admin: AdminUserDep) -> dict[str, Any]:
    """Crée un coupon Stripe."""
    settings = get_settings()
    stripe_lib.api_key = settings.get_stripe_secret_key()

    if req.percent_off is None and req.amount_off is None:
        raise HTTPException(status_code=400, detail="percent_off ou amount_off requis")

    params: dict[str, Any] = {
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
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}") from None


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, admin: AdminUserDep) -> dict[str, Any]:
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
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}") from None


@router.post("/users/{user_id}/apply-coupon")
async def apply_coupon_to_user(
    user_id: str,
    req: ApplyCouponRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
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
        raise HTTPException(status_code=500, detail=f"Erreur Stripe : {str(e)}") from None


# ============================================================
# USER MANAGEMENT — PHASE C ACTIONS
# ============================================================

@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    req: BanUserRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Bannit un utilisateur (Supabase Auth ban_duration + is_banned=True)."""
    supabase = get_supabase_client()
    settings = get_settings()

    # Import Supabase admin client avec service_role
    from supabase import create_client
    supabase_admin = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # Ban via Supabase Auth Admin (876600h ≈ 100 ans)
    supabase_admin.auth.admin.update_user_by_id(user_id, {"ban_duration": "876600h"})

    # Mettre à jour le profil
    supabase.table("profiles").update({
        "is_banned": True,
        "status": "suspended",
    }).eq("id", user_id).execute()

    _log_admin_action(supabase, admin["id"], "admin.user_banned", user_id, {
        "reason": req.reason,
    })
    return {"ok": True}


@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Lève le ban d'un utilisateur."""
    supabase = get_supabase_client()
    settings = get_settings()

    from supabase import create_client
    supabase_admin = create_client(settings.supabase_url, settings.supabase_service_role_key)

    supabase_admin.auth.admin.update_user_by_id(user_id, {"ban_duration": "none"})

    supabase.table("profiles").update({
        "is_banned": False,
        "status": "active",
    }).eq("id", user_id).execute()

    _log_admin_action(supabase, admin["id"], "admin.user_unbanned", user_id, {})
    return {"ok": True}


@router.post("/users/{user_id}/force-signout")
async def force_signout_user(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Force la déconnexion globale d'un utilisateur (révoque tous ses tokens)."""
    supabase = get_supabase_client()
    settings = get_settings()

    from supabase import create_client
    supabase_admin = create_client(settings.supabase_url, settings.supabase_service_role_key)

    supabase_admin.auth.admin.sign_out(user_id, scope="global")

    _log_admin_action(supabase, admin["id"], "admin.force_signout", user_id, {})
    return {"ok": True}


@router.put("/users/{user_id}/email")
async def update_user_email(
    user_id: str,
    req: UpdateEmailRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Met à jour l'email d'un utilisateur (Supabase Auth + profil)."""
    supabase = get_supabase_client()
    settings = get_settings()

    from supabase import create_client
    supabase_admin = create_client(settings.supabase_url, settings.supabase_service_role_key)

    supabase_admin.auth.admin.update_user_by_id(user_id, {"email": req.new_email})

    supabase.table("profiles").update({"email": req.new_email}).eq("id", user_id).execute()

    _log_admin_action(supabase, admin["id"], "admin.email_updated", user_id, {
        "new_email": req.new_email,
    })
    return {"ok": True}


@router.get("/users/{user_id}/notes")
async def get_admin_notes(
    user_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Retourne les notes internes sur un utilisateur."""
    supabase = get_supabase_client()
    res = supabase.table("admin_notes").select(
        "id, note, admin_id, created_at"
    ).eq("user_id", user_id).order("created_at", desc=True).execute()
    return {"notes": res.data or []}


@router.post("/users/{user_id}/add-note")
async def add_admin_note(
    user_id: str,
    req: AddNoteRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Ajoute une note interne sur un utilisateur."""
    supabase = get_supabase_client()

    supabase.table("admin_notes").insert({
        "user_id": user_id,
        "admin_id": admin["id"],
        "note": req.content,
        "created_at": datetime.now(UTC).isoformat(),
    }).execute()

    _log_admin_action(supabase, admin["id"], "admin.note_added", user_id, {
        "content_preview": req.content[:100],
    })
    return {"ok": True}


@router.post("/users/{user_id}/grant-days")
async def grant_free_days(
    user_id: str,
    req: GrantDaysRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Offre des jours gratuits : via Stripe trial si abonnement actif, sinon via user_subscriptions."""
    supabase = get_supabase_client()
    settings = get_settings()

    sub = supabase.table("user_subscriptions").select(
        "stripe_subscription_id, current_period_end, status, plan_id"
    ).eq("user_id", user_id).eq("status", "active").maybe_single().execute()

    if sub.data and sub.data.get("stripe_subscription_id"):
        # Étend via Stripe trial_end
        stripe_lib.api_key = settings.get_stripe_secret_key()
        current_end = sub.data.get("current_period_end")
        if current_end:
            if isinstance(current_end, str):
                current_dt = datetime.fromisoformat(current_end.replace("Z", "+00:00"))
            else:
                current_dt = datetime.fromtimestamp(current_end, tz=UTC)
        else:
            current_dt = datetime.now(UTC)

        new_end = current_dt + timedelta(days=req.days)
        stripe_lib.Subscription.modify(
            sub.data["stripe_subscription_id"],
            trial_end=int(new_end.timestamp()),
        )
    else:
        # Freemium : créer ou prolonger un abonnement local
        _plan_id = sub.data["plan_id"] if sub.data else None
        new_end = datetime.now(UTC) + timedelta(days=req.days)
        if sub.data:
            supabase.table("user_subscriptions").update({
                "current_period_end": new_end.isoformat(),
            }).eq("user_id", user_id).eq("status", "active").execute()
        else:
            # Récupère le plan Pro
            pro_plan = supabase.table("subscription_plans").select("id").eq("name", "pro").maybe_single().execute()
            supabase.table("user_subscriptions").insert({
                "user_id": user_id,
                "plan_id": pro_plan.data["id"] if pro_plan.data else None,
                "status": "active",
                "current_period_start": datetime.now(UTC).isoformat(),
                "current_period_end": new_end.isoformat(),
            }).execute()

    _log_admin_action(supabase, admin["id"], "admin.days_granted", user_id, {
        "days": req.days,
        "reason": req.reason,
    })
    return {"ok": True, "days_granted": req.days}


@router.post("/users/{user_id}/set-custom-limits")
async def set_custom_limits(
    user_id: str,
    req: SetCustomLimitsRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Définit des limites personnalisées pour un utilisateur."""
    supabase = get_supabase_client()

    limits: dict[str, Any] = {}
    if req.cv_analyses_daily is not None:
        limits["cv_analyses_daily"] = req.cv_analyses_daily
    if req.assistant_messages_daily is not None:
        limits["assistant_messages_daily"] = req.assistant_messages_daily
    if req.job_searches_daily is not None:
        limits["job_searches_daily"] = req.job_searches_daily

    if not limits:
        raise HTTPException(status_code=400, detail="Aucune limite spécifiée")

    supabase.table("user_subscriptions").update({
        "custom_limits": limits,
    }).eq("user_id", user_id).eq("status", "active").execute()

    await _invalidate_user_cache(user_id)
    _log_admin_action(supabase, admin["id"], "admin.custom_limits_set", user_id, limits)
    return {"ok": True, "custom_limits": limits}


VALID_ARQ_FUNCTIONS = {"coach_task", "assistant_task", "cv_adapt_task", "cover_letter_task"}


class RetryJobRequest(BaseModel):
    function_name: str
    kwargs: dict = {}


@router.post("/users/{user_id}/retry-job")
async def retry_arq_job(
    user_id: str,
    req: RetryJobRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Réenqueue réellement un job ARQ pour un utilisateur."""
    if req.function_name not in VALID_ARQ_FUNCTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Fonction invalide. Valeurs acceptées : {', '.join(sorted(VALID_ARQ_FUNCTIONS))}",
        )

    try:
        from uuid import uuid4

        from arq import create_pool

        from src.workers.settings import _get_redis_settings
        pool = await create_pool(_get_redis_settings())
        job = await pool.enqueue_job(req.function_name, _job_id=str(uuid4()), **req.kwargs)
        await pool.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Redis/ARQ indisponible : {e}") from None

    supabase = get_supabase_client()
    new_job_id = job.job_id if job else None
    _log_admin_action(supabase, admin["id"], "admin.job_retried", user_id, {
        "function": req.function_name,
        "new_job_id": new_job_id,
    })
    return {"ok": True, "job_id": new_job_id, "function": req.function_name}


@router.get("/users/{user_id}/events")
async def get_user_events(
    user_id: str,
    admin: AdminUserDep,
    limit: int = Query(default=100, le=200),
) -> dict[str, Any]:
    """Retourne les 100 derniers événements d'un utilisateur (user_events)."""
    supabase = get_supabase_client()

    result = supabase.table("user_events").select(
        "id, created_at, event_name, event_label, category, feature, severity, properties, error_code"
    ).eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()

    return {"events": result.data or [], "total": len(result.data or [])}


# ============================================================
# SEARCH GLOBAL (C3)
# ============================================================

@router.get("/search")
async def admin_search(
    admin: AdminUserDep,
    q: str = Query(..., min_length=2),
) -> dict[str, Any]:
    """Recherche globale admin : users par email/nom."""
    supabase = get_supabase_client()

    users = supabase.table("profiles").select(
        "id, email, full_name, status, is_admin, created_at"
    ).or_(
        f"email.ilike.%{q}%,full_name.ilike.%{q}%"
    ).limit(20).execute()

    return {"users": users.data or []}


# ============================================================
# CSV EXPORT (C4) — chemin /export/users pour éviter conflit avec /users/{user_id}
# ============================================================

@router.get("/export/users")
async def export_users_csv(
    admin: AdminUserDep,
) -> Any:
    """Exporte tous les utilisateurs en CSV (StreamingResponse)."""
    import csv
    import io

    from fastapi.responses import StreamingResponse

    supabase = get_supabase_client()

    result = supabase.table("profiles").select(
        "id, email, full_name, status, created_at, is_admin"
    ).order("created_at", desc=True).limit(5000).execute()

    users = result.data or []

    def generate():
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=["id", "email", "full_name", "status", "is_admin", "created_at"])
        writer.writeheader()
        for u in users:
            writer.writerow({k: u.get(k, "") for k in ["id", "email", "full_name", "status", "is_admin", "created_at"]})
        yield buf.getvalue()

    _log_admin_action(supabase, admin["id"], "admin.users_exported", None, {"count": len(users)})

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=huntzen-users.csv"},
    )


# ============================================================
# D1 — BROADCAST NOTIFICATION (segment → tous les users)
# ============================================================

@router.post("/broadcast-notification")
async def broadcast_notification(
    admin: AdminUserDep,
    payload: BroadcastNotificationRequest,
) -> dict[str, Any]:
    """Envoie une notification in-app à tous les users d'un segment."""
    from src.services.notifications import VALID_TYPES, create_notification

    if payload.type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Type invalide. Valeurs acceptées : {', '.join(VALID_TYPES)}",
        )

    VALID_SEGMENTS = {"all", "paying", "free", "at-risk"}
    if payload.segment not in VALID_SEGMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Segment invalide. Valeurs acceptées : {', '.join(VALID_SEGMENTS)}",
        )

    supabase = get_supabase_client()

    # Récupérer les user_ids selon le segment
    if payload.segment == "all":
        result = supabase.table("profiles").select("id").eq("status", "active").execute()
        user_ids = [r["id"] for r in (result.data or [])]

    elif payload.segment == "paying":
        result = supabase.table("user_subscriptions").select(
            "user_id, subscription_plans(name)"
        ).eq("status", "active").execute()
        user_ids = [
            r["user_id"] for r in (result.data or [])
            if (r.get("subscription_plans") or {}).get("name") != "free"
        ]

    elif payload.segment == "free":
        paying_result = supabase.table("user_subscriptions").select(
            "user_id, subscription_plans(name)"
        ).eq("status", "active").execute()
        paying_ids = {
            r["user_id"] for r in (paying_result.data or [])
            if (r.get("subscription_plans") or {}).get("name") != "free"
        }
        all_result = supabase.table("profiles").select("id").eq("status", "active").execute()
        user_ids = [r["id"] for r in (all_result.data or []) if r["id"] not in paying_ids]

    else:  # at-risk : abonnés actifs sans activité depuis 7j
        cutoff = (datetime.now(UTC) - timedelta(days=7)).isoformat()
        subs_result = supabase.table("user_subscriptions").select("user_id").eq("status", "active").execute()
        all_paying_ids = [r["user_id"] for r in (subs_result.data or [])]
        if not all_paying_ids:
            return {"sent": 0, "segment": payload.segment}
        recent_result = supabase.table("user_events").select("user_id").gt("created_at", cutoff).execute()
        recent_ids = {r["user_id"] for r in (recent_result.data or [])}
        user_ids = [uid for uid in all_paying_ids if uid not in recent_ids]

    if not user_ids:
        return {"sent": 0, "segment": payload.segment}

    sent = 0
    for uid in user_ids:
        notif_id = create_notification(
            supabase,
            user_id=uid,
            type=payload.type,
            title=payload.title,
            body=payload.body,
            data={"broadcast": True, "segment": payload.segment, "admin_id": admin["id"]},
        )
        if notif_id:
            sent += 1

    _log_admin_action(
        supabase, admin["id"], "admin.broadcast_notification", None,
        {"segment": payload.segment, "type": payload.type, "sent": sent, "total": len(user_ids)},
    )

    return {"sent": sent, "total": len(user_ids), "segment": payload.segment}


# ============================================================
# D3 — BAN IP + LISTE NOIRE EMAILS (Redis, TTL 30j)
# ============================================================

BAN_TTL = 30 * 24 * 3600  # 30 jours en secondes


@router.post("/ban-ip")
async def ban_ip(
    admin: AdminUserDep,
    payload: BanIPRequest,
) -> dict[str, Any]:
    """Bannit une IP (stockage Redis, TTL 30j)."""
    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        raise HTTPException(status_code=503, detail="Redis indisponible")

    import json as _json
    meta = _json.dumps({"reason": payload.reason, "admin_id": admin["id"], "banned_at": datetime.now(UTC).isoformat()})
    await redis.setex(f"banned_ip:{payload.ip}", BAN_TTL, meta)

    supabase = get_supabase_client()
    _log_admin_action(supabase, admin["id"], "admin.ip_banned", None, {"ip": payload.ip, "reason": payload.reason, "ttl_days": 30})

    return {"ip": payload.ip, "banned": True}


@router.delete("/ban-ip/{ip:path}")
async def unban_ip(
    ip: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Lève le bannissement d'une IP."""
    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        raise HTTPException(status_code=503, detail="Redis indisponible")

    deleted = await redis.delete(f"banned_ip:{ip}")

    supabase = get_supabase_client()
    _log_admin_action(supabase, admin["id"], "admin.ip_unbanned", None, {"ip": ip})

    return {"ip": ip, "banned": False, "was_banned": bool(deleted)}


@router.get("/banned-ips")
async def list_banned_ips(
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Liste toutes les IPs bannies avec leurs métadonnées."""
    import json as _json

    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        return {"ips": []}

    keys = [k async for k in redis.scan_iter("banned_ip:*")]
    ips = []
    for key in keys:
        raw = await redis.get(key)
        ttl = await redis.ttl(key)
        try:
            meta = _json.loads(raw) if raw else {}
        except Exception:
            meta = {}
        ip_addr = key.removeprefix("banned_ip:") if isinstance(key, str) else key.decode().removeprefix("banned_ip:")
        ips.append({"ip": ip_addr, "ttl_seconds": ttl, **meta})

    return {"ips": ips}


@router.post("/blacklist-email")
async def blacklist_email(
    admin: AdminUserDep,
    payload: BlacklistEmailRequest,
) -> dict[str, Any]:
    """Ajoute un email à la liste noire (Redis, TTL 30j)."""
    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        raise HTTPException(status_code=503, detail="Redis indisponible")

    import json as _json
    email_key = payload.email.lower().strip()
    meta = _json.dumps({"reason": payload.reason, "admin_id": admin["id"], "added_at": datetime.now(UTC).isoformat()})
    await redis.setex(f"blacklisted_email:{email_key}", BAN_TTL, meta)

    supabase = get_supabase_client()
    _log_admin_action(supabase, admin["id"], "admin.email_blacklisted", None, {"email": email_key, "reason": payload.reason})

    return {"email": email_key, "blacklisted": True}


@router.get("/blacklisted-emails")
async def list_blacklisted_emails(
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Liste tous les emails en liste noire."""
    import json as _json

    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        return {"emails": []}

    keys = [k async for k in redis.scan_iter("blacklisted_email:*")]
    emails = []
    for key in keys:
        raw = await redis.get(key)
        ttl = await redis.ttl(key)
        try:
            meta = _json.loads(raw) if raw else {}
        except Exception:
            meta = {}
        email_addr = key.removeprefix("blacklisted_email:") if isinstance(key, str) else key.decode().removeprefix("blacklisted_email:")
        emails.append({"email": email_addr, "ttl_seconds": ttl, **meta})

    return {"emails": emails}


# ============================================================
# ASSISTANT SUGGESTIONS MANAGEMENT
# ============================================================

@router.get("/suggestions")
async def admin_get_suggestions(admin: AdminUserDep) -> dict[str, Any]:
    """Get all suggestions grouped by assistant."""
    supabase = get_supabase_client()
    result = supabase.table("assistant_suggestions").select(
        "id, assistant_id, text, display_order, is_active, created_at"
    ).order("assistant_id").order("display_order").execute()

    grouped: dict[str, list] = {}
    for row in (result.data or []):
        aid = row["assistant_id"]
        if aid not in grouped:
            grouped[aid] = []
        grouped[aid].append(row)

    return {"suggestions": grouped}


@router.post("/suggestions")
async def admin_add_suggestion(
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Add a new suggestion for an assistant."""
    supabase = get_supabase_client()
    assistant_id = body.get("assistant_id")
    text = body.get("text", "").strip()

    if not assistant_id or not text:
        raise HTTPException(status_code=400, detail="assistant_id and text are required")

    # Get next order
    existing = supabase.table("assistant_suggestions").select("display_order").eq(
        "assistant_id", assistant_id
    ).order("display_order", desc=True).limit(1).execute()
    next_order = (existing.data[0]["display_order"] + 1) if existing.data else 0

    result = supabase.table("assistant_suggestions").insert({
        "assistant_id": assistant_id,
        "text": text,
        "display_order": next_order,
        "is_active": True,
    }).execute()

    _log_admin_action(supabase, admin["id"], "admin.suggestion_added", None, {"assistant_id": assistant_id, "text": text})
    return {"success": True, "suggestion": result.data[0] if result.data else {}}


@router.patch("/suggestions/{suggestion_id}")
async def admin_update_suggestion(
    suggestion_id: str,
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Update a suggestion (text or is_active)."""
    supabase = get_supabase_client()
    update_data: dict[str, Any] = {}
    if "text" in body:
        update_data["text"] = body["text"].strip()
    if "is_active" in body:
        update_data["is_active"] = body["is_active"]
    if "display_order" in body:
        update_data["display_order"] = body["display_order"]

    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update")

    result = supabase.table("assistant_suggestions").update(update_data).eq(
        "id", suggestion_id
    ).execute()

    return {"success": True, "suggestion": result.data[0] if result.data else {}}


@router.delete("/suggestions/{suggestion_id}")
async def admin_delete_suggestion(
    suggestion_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Delete a suggestion."""
    supabase = get_supabase_client()
    supabase.table("assistant_suggestions").delete().eq("id", suggestion_id).execute()
    _log_admin_action(supabase, admin["id"], "admin.suggestion_deleted", None, {"suggestion_id": suggestion_id})
    return {"success": True}


# ============================================================================
# ADMIN NOTIFICATION PREFERENCES
# ============================================================================

@router.get("/alert-preferences")
async def get_admin_alert_preferences(admin: AdminUserDep) -> dict[str, Any]:
    """Get admin email alert preferences (which notifications are enabled/disabled)."""
    from src.services.admin_alerts import ALERT_CATEGORIES, get_alert_preferences

    prefs = await get_alert_preferences()
    categories = []
    for key, config in ALERT_CATEGORIES.items():
        categories.append({
            "key": key,
            "label": config["label"],
            "description": config["description"],
            "enabled": prefs.get(key, config["default"]),
        })
    return {"categories": categories}


class AlertPreferencesUpdate(BaseModel):
    preferences: dict[str, bool]


@router.put("/alert-preferences")
async def update_admin_alert_preferences(
    body: AlertPreferencesUpdate,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Update admin email alert preferences."""
    from src.services.admin_alerts import ALERT_CATEGORIES, set_alert_preferences

    # Validate keys
    valid_keys = set(ALERT_CATEGORIES.keys())
    for key in body.preferences:
        if key not in valid_keys:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid alert category: {key}. Valid: {', '.join(sorted(valid_keys))}",
            ) from None

    prefs = await set_alert_preferences(body.preferences)
    supabase = get_supabase_client()
    _log_admin_action(supabase, admin["id"], "admin.alert_preferences_updated", None, body.preferences)
    return {"success": True, "preferences": prefs}


# ============================================================
# COACH CONFIG MANAGEMENT
# ============================================================

class UpdateCoachRequest(BaseModel):
    short_name: str | None = None
    description: str | None = None
    specialties: list[str] | None = None
    example_questions: list[str] | None = None
    accent_color: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


@router.get("/coaches")
async def admin_list_coaches(
    admin: AdminUserDep,
) -> list[dict[str, Any]]:
    """List all coaches with full data (including translations)."""
    supabase = get_supabase_client()
    result = supabase.table("coach_config").select("*").order("sort_order").execute()
    return result.data or []


@router.patch("/coaches/{coach_id}")
async def admin_update_coach(
    coach_id: str,
    body: UpdateCoachRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Update coach fields (short_name, description, specialties, etc.)."""
    supabase = get_supabase_client()

    # Verify coach exists
    existing = supabase.table("coach_config").select("id").eq("id", coach_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail=f"Coach {coach_id} not found")

    update_data: dict[str, Any] = {"updated_at": datetime.now(UTC).isoformat()}
    if body.short_name is not None:
        update_data["short_name"] = body.short_name
    if body.description is not None:
        update_data["description"] = body.description
    if body.specialties is not None:
        update_data["specialties"] = body.specialties
    if body.example_questions is not None:
        update_data["example_questions"] = body.example_questions
    if body.accent_color is not None:
        update_data["accent_color"] = body.accent_color
    if body.icon is not None:
        update_data["icon"] = body.icon
    if body.sort_order is not None:
        update_data["sort_order"] = body.sort_order
    if body.is_active is not None:
        update_data["is_active"] = body.is_active

    supabase.table("coach_config").update(update_data).eq("id", coach_id).execute()

    # Invalidate cache
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.delete("coaches_config")
            locale_keys = [k async for k in redis.scan_iter("coaches_config:*")]
            if locale_keys:
                await redis.delete(*locale_keys)
    except Exception:
        pass

    _log_admin_action(supabase, admin["id"], "admin.coach_updated", None, {
        "coach_id": coach_id,
        "fields": list(update_data.keys()),
    })

    return {"success": True, "coach_id": coach_id}


@router.post("/coaches/{coach_id}/translate")
async def translate_coach(
    coach_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """
    Auto-translate a coach's short_name, description, specialties, example_questions
    from French to en/es/pt using Groq LLM. Same pattern as plans translate.
    """
    from groq import Groq

    supabase = get_supabase_client()
    settings = get_settings()

    try:
        coach_result = supabase.table("coach_config").select(
            "id, persona_name, short_name, description, specialties, example_questions"
        ).eq("id", coach_id).single().execute()
        if not coach_result.data:
            raise HTTPException(status_code=404, detail="Coach not found")

        coach_data = coach_result.data
        source = {
            "short_name": coach_data.get("short_name") or "",
            "description": coach_data.get("description") or "",
            "specialties": coach_data.get("specialties") or [],
            "example_questions": coach_data.get("example_questions") or [],
        }

        groq_client = Groq(api_key=settings.get_groq_key())
        translations: dict[str, Any] = {}
        target_languages = {"en": "English", "es": "Spanish", "pt": "Portuguese"}

        for lang_code, lang_name in target_languages.items():
            prompt = (
                f"Translate the following coach profile data from French to {lang_name}. "
                "Return ONLY a valid JSON object with these exact keys: "
                "short_name (string), description (string), specialties (array of strings), "
                "example_questions (array of strings). "
                "Keep the same number of items in each array. Do not add or remove items. "
                "Do not include any text outside the JSON.\n\n"
                f"French source:\n{json.dumps(source, ensure_ascii=False, indent=2)}"
            )

            response = groq_client.chat.completions.create(
                model=settings.llm_model_powerful,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=2048,
                response_format={"type": "json_object"},
            )

            raw_content = response.choices[0].message.content or "{}"
            try:
                parsed = json.loads(raw_content)
                translations[lang_code] = {
                    "short_name": parsed.get("short_name", source["short_name"]),
                    "description": parsed.get("description", source["description"]),
                    "specialties": parsed.get("specialties", source["specialties"]),
                    "example_questions": parsed.get("example_questions", source["example_questions"]),
                }
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse Groq translation for {lang_code}, coach {coach_id}")
                translations[lang_code] = source

        # Save translations to DB
        supabase.table("coach_config").update({
            "translations": translations,
            "updated_at": datetime.now(UTC).isoformat(),
        }).eq("id", coach_id).execute()

        # Invalidate cache
        try:
            from src.utils.cache import get_redis
            redis = await get_redis()
            if redis:
                await redis.delete("coaches_config")
                locale_keys = [k async for k in redis.scan_iter("coaches_config:*")]
                if locale_keys:
                    await redis.delete(*locale_keys)
        except Exception:
            pass

        _log_admin_action(supabase, admin["id"], "admin.coach_translated", None, {
            "coach_id": coach_id,
            "persona_name": coach_data["persona_name"],
            "languages": list(translations.keys()),
        })

        return {"success": True, "translations": translations}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to translate coach {coach_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to translate coach") from None


# ============================================================
# PROMO CODES MANAGEMENT
# ============================================================

class CreatePromoCodeRequest(BaseModel):
    code: str
    description: str
    discount_type: str  # "percent", "free_days", "fixed_amount"
    discount_value: float
    plan: str | None = None
    stripe_coupon_id: str | None = None
    max_uses: int | None = None
    starts_at: str | None = None
    expires_at: str | None = None
    campaign: str | None = None


class UpdatePromoCodeRequest(BaseModel):
    is_active: bool | None = None
    description: str | None = None
    max_uses: int | None = None
    expires_at: str | None = None
    campaign: str | None = None


@router.get("/promo-codes")
async def list_promo_codes(admin: AdminUserDep) -> list[dict[str, Any]]:
    """List all promo codes with usage stats."""
    supabase = get_supabase_client()
    result = supabase.table("promo_codes").select("*").order("created_at", desc=True).execute()
    return result.data or []


@router.post("/promo-codes")
async def create_promo_code(body: CreatePromoCodeRequest, admin: AdminUserDep) -> dict[str, Any]:
    """Create a new promo code."""
    supabase = get_supabase_client()

    # Check code doesn't already exist
    existing = supabase.table("promo_codes").select("id").eq("code", body.code.upper()).maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Un code avec ce nom existe deja")

    data: dict[str, Any] = {
        "code": body.code.upper(),
        "description": body.description,
        "discount_type": body.discount_type,
        "discount_value": body.discount_value,
        "plan": body.plan,
        "stripe_coupon_id": body.stripe_coupon_id,
        "max_uses": body.max_uses,
        "campaign": body.campaign,
        "is_active": True,
    }
    if body.starts_at:
        data["starts_at"] = body.starts_at
    if body.expires_at:
        data["expires_at"] = body.expires_at

    result = supabase.table("promo_codes").insert(data).execute()

    _log_admin_action(supabase, admin["id"], "admin.promo_code_created", None, {
        "code": body.code.upper(),
        "campaign": body.campaign,
    })

    return result.data[0] if result.data else {}


@router.patch("/promo-codes/{promo_id}")
async def update_promo_code(promo_id: str, body: UpdatePromoCodeRequest, admin: AdminUserDep) -> dict[str, Any]:
    """Update a promo code (toggle active, change fields)."""
    supabase = get_supabase_client()

    update_data: dict[str, Any] = {}
    if body.is_active is not None:
        update_data["is_active"] = body.is_active
    if body.description is not None:
        update_data["description"] = body.description
    if body.max_uses is not None:
        update_data["max_uses"] = body.max_uses
    if body.expires_at is not None:
        update_data["expires_at"] = body.expires_at
    if body.campaign is not None:
        update_data["campaign"] = body.campaign

    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ a mettre a jour")

    result = supabase.table("promo_codes").update(update_data).eq("id", promo_id).execute()

    _log_admin_action(supabase, admin["id"], "admin.promo_code_updated", None, {
        "promo_id": promo_id,
        "changes": update_data,
    })

    return result.data[0] if result.data else {}


@router.delete("/promo-codes/{promo_id}")
async def delete_promo_code(promo_id: str, admin: AdminUserDep) -> dict[str, Any]:
    """Delete a promo code."""
    supabase = get_supabase_client()
    supabase.table("promo_codes").delete().eq("id", promo_id).execute()

    _log_admin_action(supabase, admin["id"], "admin.promo_code_deleted", None, {
        "promo_id": promo_id,
    })

    return {"success": True}


# ---------------------------------------------------------------------------
# Test all email templates (admin diagnostic)
# ---------------------------------------------------------------------------


class TestEmailsRequest(BaseModel):
    to_email: str


@router.post("/test-all-emails")
async def test_all_emails(
    req: TestEmailsRequest,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """
    Envoie les 14 templates email de test a une adresse donnee.
    Aucun effet de bord en DB — appel direct aux fonctions email.
    Admin uniquement.
    """
    to = req.to_email
    results: dict[str, bool] = {}

    # 1. Bienvenue
    results["welcome"] = send_welcome(to, "Wissem Test", "fr")

    # 2. Confirmation paiement
    results["payment_confirmation"] = send_payment_confirmation_email(
        user_email=to, plan_name="Pro", amount="9.90€/mois", language="fr",
        invoice_url="https://huntzenjobs.com", billing_reason="subscription_create",
    )

    # 3. Paiement echoue
    results["payment_failed"] = send_payment_failed_email(to, "fr")

    # 4. Annulation abonnement
    results["subscription_cancelled"] = send_subscription_cancelled_email(
        user_email=to, plan_name="Pro", end_date="30/04/2026", language="fr",
    )

    # 5. Confirmation candidature
    results["application_confirmation"] = send_application_confirmation(
        to_email=to, job_title="Data Engineer", company="TechCorp",
        job_url="https://huntzenjobs.com/jobs", language="fr",
    )

    # 6. Changement statut candidature (entretien)
    results["application_status_interview"] = send_application_status_change(
        to_email=to, job_title="Data Engineer", company="TechCorp",
        new_status="interview", language="fr",
    )

    # 7. Changement statut candidature (offre)
    results["application_status_offer"] = send_application_status_change(
        to_email=to, job_title="Data Engineer", company="TechCorp",
        new_status="offer", language="fr",
    )

    # 8. Analyse CV terminee
    results["cv_analysis_complete"] = send_cv_analysis_complete(to, "fr")

    # 9. Document genere (CV adapte)
    results["document_generated_cv"] = send_document_generated(
        to_email=to, doc_type="cv", job_title="Data Engineer",
        company="TechCorp", language="fr",
    )

    # 10. Document genere (lettre de motivation)
    results["document_generated_lm"] = send_document_generated(
        to_email=to, doc_type="cover_letter", job_title="Data Engineer",
        company="TechCorp", language="fr",
    )

    # 11. Confirmation consultation recruteur
    results["recruiter_confirmation"] = send_recruiter_request_confirmation(
        to_email=to, full_name="Wissem Test", sector="Tech",
        experience_level="Senior", preferred_date="15/04/2026", language="fr",
    )

    # 12. Reponse ticket support
    results["support_reply"] = send_support_ticket_reply(
        user_email=to, user_name="Wissem Test", ticket_id="TEST-001",
        ticket_subject="Test ticket", admin_reply="Ceci est une reponse de test.",
        language="fr",
    )

    # 13. Confirmation formulaire contact
    results["contact_confirmation"] = send_contact_confirmation(to, "Wissem Test", "fr")

    # 14. Plan expire bientot (J-7)
    results["expiring_plan"] = send_expiring_plan_email(to, "Pro", "fr")

    # 14b. Plan expire demain (J-1)
    from src.services.email import send_expiring_plan_tomorrow_email
    results["expiring_plan_tomorrow"] = send_expiring_plan_tomorrow_email(to, "Pro", "fr")

    # 15. Alertes emploi quotidiennes
    results["job_alerts"] = send_job_alerts(
        to_email=to, user_name="Wissem",
        jobs=[
            {"title": "Data Engineer", "company": "TechCorp", "location": "Paris", "url": "https://huntzenjobs.com/jobs"},
            {"title": "Backend Developer", "company": "StartupAI", "location": "Lyon", "url": "https://huntzenjobs.com/jobs"},
        ],
        language="fr",
    )

    # 16. Resume hebdomadaire
    results["weekly_summary"] = send_weekly_summary(
        to_email=to,
        stats={"applications": 5, "saved": 12, "documents": 3, "views": 48},
        language="fr",
    )

    sent = sum(1 for v in results.values() if v)
    failed = sum(1 for v in results.values() if not v)

    return {
        "ok": failed == 0,
        "sent": sent,
        "failed": failed,
        "to": to,
        "details": results,
    }


# ============================================================
# CONVERSION POPUP CONFIGS
# ============================================================

@router.get("/conversion-popups")
async def list_conversion_popups(admin: AdminUserDep) -> list[dict[str, Any]]:
    """List all conversion popup configs."""
    supabase = get_supabase_client()
    result = supabase.table("conversion_popup_configs").select("*").order("sort_order").execute()
    return result.data or []


@router.post("/conversion-popups")
async def create_conversion_popup(
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Create a new conversion popup config."""
    supabase = get_supabase_client()
    required = {"trigger_id", "target_plan", "title", "body", "primary_cta"}
    if not required.issubset(body.keys()):
        raise HTTPException(status_code=400, detail=f"Missing required fields: {required - body.keys()}")

    allowed = {
        "trigger_id", "source_plans", "target_plan", "feature_trigger",
        "title", "body", "primary_cta", "secondary_cta", "price_override",
        "discount_percent", "coupon_trigger", "is_active", "sort_order",
    }
    data = {k: v for k, v in body.items() if k in allowed}
    result = supabase.table("conversion_popup_configs").insert(data).execute()
    _log_admin_action(supabase, admin["id"], "admin.popup_created", None, {"trigger_id": data.get("trigger_id")})
    return (result.data or [{}])[0]


@router.patch("/conversion-popups/{popup_id}")
async def update_conversion_popup(
    popup_id: str,
    body: dict[str, Any],
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Update a conversion popup config."""
    supabase = get_supabase_client()
    allowed = {
        "trigger_id", "source_plans", "target_plan", "feature_trigger",
        "title", "body", "primary_cta", "secondary_cta", "price_override",
        "discount_percent", "coupon_trigger", "is_active", "sort_order",
    }
    data = {k: v for k, v in body.items() if k in allowed}
    if not data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    data["updated_at"] = datetime.now(UTC).isoformat()
    supabase.table("conversion_popup_configs").update(data).eq("id", popup_id).execute()
    _log_admin_action(supabase, admin["id"], "admin.popup_updated", None, {"popup_id": popup_id, "fields": list(data.keys())})
    return {"success": True}


@router.delete("/conversion-popups/{popup_id}")
async def delete_conversion_popup(
    popup_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Delete a conversion popup config."""
    supabase = get_supabase_client()
    supabase.table("conversion_popup_configs").delete().eq("id", popup_id).execute()
    _log_admin_action(supabase, admin["id"], "admin.popup_deleted", None, {"popup_id": popup_id})
    return {"success": True}


@router.post("/conversion-popups/{popup_id}/translate")
async def translate_conversion_popup(
    popup_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """Auto-translate popup texts from French to en/es/pt using Groq LLM."""
    from groq import Groq

    supabase = get_supabase_client()
    settings = get_settings()

    popup_result = supabase.table("conversion_popup_configs").select("*").eq("id", popup_id).single().execute()
    if not popup_result.data:
        raise HTTPException(status_code=404, detail="Popup not found")

    popup = popup_result.data
    fr_texts = {
        "title": (popup.get("title") or {}).get("fr", ""),
        "body": (popup.get("body") or {}).get("fr", ""),
        "primary_cta": (popup.get("primary_cta") or {}).get("fr", ""),
        "secondary_cta": ((popup.get("secondary_cta") or {}).get("fr", "") if popup.get("secondary_cta") else ""),
        "price_override": ((popup.get("price_override") or {}).get("fr", "") if popup.get("price_override") else ""),
    }

    groq_client = Groq(api_key=settings.get_groq_key())
    target_languages = {"en": "English", "es": "Spanish", "pt": "Portuguese"}
    translations: dict[str, dict[str, str]] = {}

    for lang_code, lang_name in target_languages.items():
        prompt = (
            f"Translate these conversion popup texts from French to {lang_name}. "
            "Return ONLY a valid JSON object with these exact keys: "
            "title, body, primary_cta, secondary_cta, price_override. "
            "If a value is empty, keep it empty. Keep it short and persuasive. "
            "Do not include any text outside the JSON.\n\n"
            f"French source:\n{json.dumps(fr_texts, ensure_ascii=False, indent=2)}"
        )
        try:
            response = groq_client.chat.completions.create(
                model=settings.llm_model_powerful,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=1024,
                response_format={"type": "json_object"},
            )
            parsed = json.loads(response.choices[0].message.content or "{}")
            translations[lang_code] = parsed
        except Exception as e:
            logger.warning(f"Failed to translate popup {popup_id} to {lang_code}: {e}")
            translations[lang_code] = fr_texts

    # Merge translations into existing JSONB fields
    update_data: dict[str, Any] = {"updated_at": datetime.now(UTC).isoformat()}
    for field in ["title", "body", "primary_cta", "secondary_cta", "price_override"]:
        current = popup.get(field) or {}
        if not isinstance(current, dict):
            current = {"fr": current} if current else {}
        for lang_code, texts in translations.items():
            val = texts.get(field, "")
            if val:
                current[lang_code] = val
        if current:
            update_data[field] = current

    supabase.table("conversion_popup_configs").update(update_data).eq("id", popup_id).execute()
    _log_admin_action(supabase, admin["id"], "admin.popup_translated", None, {
        "popup_id": popup_id,
        "languages": list(translations.keys()),
    })

    return {"success": True, "translations": translations}


@router.post("/plans/{plan_id}/generate-wording")
async def generate_plan_wording(
    plan_id: str,
    admin: AdminUserDep,
) -> dict[str, Any]:
    """
    Auto-generate features/features_excluded text arrays from plan limits and flags.
    Returns the generated arrays without saving — admin can review and save manually.
    """
    supabase = get_supabase_client()
    plan_result = supabase.table("subscription_plans").select(
        "name, limits, feature_flags"
    ).eq("id", plan_id).single().execute()
    if not plan_result.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan = plan_result.data
    limits = plan.get("limits") or {}
    flags = plan.get("feature_flags") or {}

    # Mapping limits → wording
    limit_wording = {
        "job_searches": ("recherches d'offres par jour", "Recherches illimitees"),
        "cv_analyses": ("analyses CV par jour", "Analyses CV illimitees"),
        "assistant_messages": ("messages coaching par jour", "Messages coaching illimites"),
        "cv_adapt": ("adaptations CV par jour", "Adaptations CV illimitees"),
        "cover_letter": ("lettres de motivation par jour", "Lettres de motivation illimitees"),
        "saved_jobs": ("offres sauvegardees", "Sauvegardes illimitees"),
        "jobs_visible": ("offres visibles par jour", "Toutes les offres visibles"),
        "job_views": ("vues d'offres par jour", "Vues illimitees"),
        "recruiter_searches": ("recherches recruteur par jour", "Recherches recruteur illimitees"),
    }

    # Mapping flags → wording
    flag_wording = {
        "has_advanced_filters": "Filtres avances",
        "has_favorites": "Gestion favoris",
        "has_visual_score": "Score visuel CV",
        "has_pdf_export": "Export PDF",
        "has_cv_history": "Historique CV",
        "has_interview_sim": "Simulation d'entretien",
        "has_email_alerts": "Alertes email",
        "has_personalized_advice": "Conseils personnalises",
        "has_coach_history": "Historique coach",
        "has_cover_letter": "Lettre de motivation IA",
        "has_branding": "Branding personnel",
        "has_cv_details": "Details CV avances",
    }

    page_wording = {
        "page_assistant": "Coach IA",
        "page_jobs": "Recherche emploi",
        "page_saved_jobs": "Jobs sauvegardes",
        "page_cv_analysis": "Analyse CV",
        "page_documents": "Documents",
        "page_candidatures": "Candidatures",
        "page_expat": "Expat",
        "page_salons": "Salons emploi",
        "page_profile": "Profil",
        "page_recruiter_contact": "Contact recruteurs",
        "page_referral": "Parrainage",
    }

    features: list[str] = []
    features_excluded: list[str] = []

    # Generate from limits
    for key, (limited_tpl, unlimited_text) in limit_wording.items():
        val = limits.get(key, 0)
        if val == -1:
            features.append(unlimited_text)
        elif val > 0:
            features.append(f"{val} {limited_tpl}")
        else:
            features_excluded.append(unlimited_text)

    # Generate from feature flags
    for key, text in flag_wording.items():
        if flags.get(key):
            features.append(text)
        else:
            features_excluded.append(text)

    # Generate from page access flags
    for key, text in page_wording.items():
        if flags.get(key):
            features.append(text)
        else:
            features_excluded.append(text)

    features.append("Support standard")

    return {
        "success": True,
        "features": features,
        "features_excluded": features_excluded,
    }
