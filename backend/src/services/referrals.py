"""Referral reward service.

Applies rewards to referrers after a paid conversion.
Called from handle_checkout_completed() in stripe.py.
"""

import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


async def apply_referral_reward(
    supabase_client,
    referral_signup_id: str,
    referrer_id: str,
    plan_name: str,
) -> bool:
    """
    Apply the configured conversion reward to a referrer.

    Flow:
    1. Read referral_config for reward type/value
    2. Create referral_rewards record (unapplied)
    3. Apply reward (free_days / quota_bonus / stripe_coupon)
    4. Mark reward as applied
    """
    try:
        config_res = supabase_client.table("referral_config") \
            .select("*").eq("id", 1).single().execute()

        if not config_res.data or not config_res.data.get("is_active"):
            logger.info("[REFERRAL] Referral system inactive — skipping reward")
            return False

        config = config_res.data
        reward_type = config["conversion_reward_type"]
        reward_value = config["conversion_reward_value"]

        # Create reward record
        reward_res = supabase_client.table("referral_rewards").insert({
            "referral_signup_id": referral_signup_id,
            "referrer_id": referrer_id,
            "reward_type": reward_type,
            "reward_value": reward_value,
            "applied": False,
        }).execute()

        if not reward_res.data:
            logger.error("[REFERRAL] Failed to create reward record")
            return False

        reward_id = reward_res.data[0]["id"]

        if reward_type == "free_days":
            success = await _apply_free_days(supabase_client, referrer_id, reward_value)
        elif reward_type == "quota_bonus":
            success = await _apply_quota_bonus(supabase_client, referrer_id, reward_value)
        elif reward_type == "stripe_coupon":
            success = await _apply_stripe_coupon(supabase_client, referrer_id, reward_value, reward_id)
        else:
            logger.warning(f"[REFERRAL] Unknown reward type: {reward_type}")
            return False

        if success:
            supabase_client.table("referral_rewards").update({
                "applied": True,
                "applied_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", reward_id).execute()
            logger.info(f"[REFERRAL] {reward_type} reward applied to referrer {referrer_id}")
        else:
            # Remove the pending record — no dangling applied=FALSE entries
            supabase_client.table("referral_rewards").delete().eq("id", reward_id).execute()
            logger.error(f"[REFERRAL] Reward application failed for referrer {referrer_id}, record removed")

        return success

    except Exception as e:
        logger.error(f"[REFERRAL] apply_referral_reward failed: {e}")
        return False


async def _apply_free_days(supabase_client, referrer_id: str, reward_value: dict) -> bool:
    """Extend the referrer's active subscription by N days."""
    try:
        days = int(reward_value.get("days", 7))

        sub_res = supabase_client.table("user_subscriptions") \
            .select("id, current_period_end") \
            .eq("user_id", referrer_id) \
            .eq("status", "active") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if not sub_res.data:
            logger.warning(f"[REFERRAL] Referrer {referrer_id} has no active subscription — free_days skipped")
            return False

        sub = sub_res.data[0]
        current_end_str = sub["current_period_end"].replace("Z", "+00:00")
        current_end = datetime.fromisoformat(current_end_str)
        new_end = current_end + timedelta(days=days)

        supabase_client.table("user_subscriptions").update({
            "current_period_end": new_end.isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", sub["id"]).execute()

        return True

    except Exception as e:
        logger.error(f"[REFERRAL] _apply_free_days failed: {e}")
        return False


async def _apply_quota_bonus(supabase_client, referrer_id: str, reward_value: dict) -> bool:
    """Add bonus quota credits to the referrer for today."""
    try:
        from datetime import date
        today = date.today().isoformat()

        quota_res = supabase_client.table("usage_quotas") \
            .select("*") \
            .eq("user_id", referrer_id) \
            .eq("date", today) \
            .execute()

        if not quota_res.data:
            logger.info(f"[REFERRAL] No quota record today for {referrer_id} — bonus skipped")
            return True  # Not a hard failure

        quota = quota_res.data[0]
        updates = {}

        if bonus_cv := int(reward_value.get("cv_analyses", 0)):
            updates["cv_analyses_remaining"] = (quota.get("cv_analyses_remaining") or 0) + bonus_cv
        if bonus_coach := int(reward_value.get("coach_seconds", 0)):
            updates["coach_seconds_remaining"] = (quota.get("coach_seconds_remaining") or 0) + bonus_coach
        if bonus_jobs := int(reward_value.get("job_searches", 0)):
            updates["job_searches_remaining"] = (quota.get("job_searches_remaining") or 0) + bonus_jobs

        if updates:
            supabase_client.table("usage_quotas").update(updates) \
                .eq("user_id", referrer_id) \
                .eq("date", today) \
                .execute()

        return True

    except Exception as e:
        logger.error(f"[REFERRAL] _apply_quota_bonus failed: {e}")
        return False


async def _apply_stripe_coupon(
    supabase_client, referrer_id: str, reward_value: dict, reward_id: str
) -> bool:
    """Apply a Stripe coupon to the referrer's customer account."""
    try:
        import stripe as stripe_lib

        coupon_id = reward_value.get("coupon_id")
        if not coupon_id:
            logger.error("[REFERRAL] stripe_coupon reward missing coupon_id in reward_value")
            return False

        sub_res = supabase_client.table("user_subscriptions") \
            .select("stripe_customer_id") \
            .eq("user_id", referrer_id) \
            .eq("status", "active") \
            .limit(1) \
            .execute()

        if not sub_res.data or not sub_res.data[0].get("stripe_customer_id"):
            logger.warning(f"[REFERRAL] No Stripe customer for referrer {referrer_id}")
            return False

        customer_id = sub_res.data[0]["stripe_customer_id"]
        stripe_lib.Customer.modify(customer_id, coupon=coupon_id)

        supabase_client.table("referral_rewards").update({
            "stripe_coupon_id": coupon_id,
        }).eq("id", reward_id).execute()

        return True

    except Exception as e:
        logger.error(f"[REFERRAL] _apply_stripe_coupon failed: {e}")
        return False
