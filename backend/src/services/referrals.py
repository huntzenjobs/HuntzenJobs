"""Referral reward service.

Applies rewards to referrers after a paid conversion.
Called from handle_checkout_completed() in stripe.py.
"""

import logging
from datetime import UTC, datetime

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
                "applied_at": datetime.now(UTC).isoformat(),
            }).eq("id", reward_id).execute()
            logger.info(f"[REFERRAL] {reward_type} reward applied to referrer {referrer_id}")
        else:
            # Keep the record for retry — do NOT delete pending rewards
            logger.warning(f"[REFERRAL] Reward application failed for referrer {referrer_id}, kept as applied=false for retry")

        return success

    except Exception as e:
        logger.error(f"[REFERRAL] apply_referral_reward failed: {e}")
        return False


async def _apply_free_days(supabase_client, referrer_id: str, reward_value: dict) -> bool:
    """Extend or create a subscription for the referrer by N days (atomic)."""
    try:
        days = int(reward_value.get("days") or reward_value.get("reward_value") or 7)

        # Resolve plan_id from reward_plan name (default: pro)
        plan_name = reward_value.get("reward_plan", "pro")
        plan_ids = {"starter": "d18ddf08-784d-471c-b2d7-7586b4e5472c", "pro": "3f42df0e-6794-414f-9410-97981064fa7e", "premium": "d8fd5402-76f1-4b25-b35c-a6c5384cf817"}
        plan_id = plan_ids.get(plan_name, plan_ids["pro"])

        result = supabase_client.rpc(
            "extend_subscription_days",
            {"p_user_id": referrer_id, "p_days": days, "p_plan_id": plan_id},
        ).execute()

        if not result.data:
            logger.warning(f"[REFERRAL] extend_subscription_days returned falsy for {referrer_id}")
            return False

        return True

    except Exception as e:
        logger.error(f"[REFERRAL] _apply_free_days failed: {e}")
        return False


async def _apply_quota_bonus(supabase_client, referrer_id: str, reward_value: dict) -> bool:
    """Add bonus quota credits to the referrer via DB-level decrement of used counters."""
    try:
        cv_bonus = int(reward_value.get("cv_analyses", 0))
        coach_bonus = int(reward_value.get("coach_seconds", 0))
        jobs_bonus = int(reward_value.get("job_searches", 0))

        if not (cv_bonus or coach_bonus or jobs_bonus):
            logger.info(f"[REFERRAL] No quota bonus values for {referrer_id} — skipped")
            return True

        supabase_client.rpc(
            "apply_quota_bonus",
            {
                "p_user_id": referrer_id,
                "p_cv_analyses": cv_bonus,
                "p_coach_seconds": coach_bonus,
                "p_job_searches": jobs_bonus,
            },
        ).execute()

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
