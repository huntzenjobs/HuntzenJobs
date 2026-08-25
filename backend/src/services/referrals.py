"""Referral reward service.

Applies rewards to referrers after a paid conversion.
Called from handle_checkout_completed() in stripe.py.
"""

import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)


async def enqueue_referral_reward_debt(
    supabase_client,
    *,
    referral_signup_id: str,
    referrer_id: str,
    reward_type: str,
    reward_value: dict,
    source_key: str,
) -> dict:
    """Créer une dette de récompense unique, livrée par l'outbox."""
    result = supabase_client.rpc(
        "enqueue_referral_reward",
        {
            "p_referral_signup_id": referral_signup_id,
            "p_referrer_id": referrer_id,
            "p_reward_type": reward_type,
            "p_reward_value": reward_value,
            "p_source_key": source_key,
        },
    ).execute()
    data = result.data[0] if isinstance(result.data, list) and result.data else result.data
    if not isinstance(data, dict) or not data.get("reward_id"):
        raise RuntimeError("Invalid referral reward enqueue response")
    return data


async def apply_pending_referral_reward(
    supabase_client,
    reward_id: str,
) -> bool:
    """Appliquer une dette de récompense durable et idempotente."""
    result = supabase_client.rpc(
        "apply_referral_reward_record",
        {"p_reward_id": reward_id},
    ).execute()
    result_data = result.data[0] if isinstance(result.data, list) and result.data else result.data
    if not isinstance(result_data, dict):
        raise RuntimeError("Invalid referral reward transaction response")
    if result_data.get("applied") is True:
        return True
    if result_data.get("requires_external") is not True:
        raise RuntimeError("Referral reward was not applied")

    external_type = result_data.get("external_type")
    if external_type == "stripe_trial_extension":
        import stripe as stripe_lib

        subscription_id = result_data.get("subscription_id")
        trial_end = result_data.get("trial_end")
        lease_token = result_data.get("lease_token")
        idempotency_key = result_data.get("idempotency_key")
        if (
            not isinstance(subscription_id, str)
            or not isinstance(trial_end, int)
            or isinstance(trial_end, bool)
            or not isinstance(lease_token, str)
            or not isinstance(idempotency_key, str)
            or not idempotency_key
        ):
            raise RuntimeError("Invalid Stripe trial extension response")
        stripe_lib.Subscription.modify(
            subscription_id,
            trial_end=trial_end,
            proration_behavior="none",
            idempotency_key=idempotency_key,
        )
        finalized = supabase_client.rpc(
            "mark_referral_trial_extension_applied",
            {
                "p_reward_id": reward_id,
                "p_subscription_id": subscription_id,
                "p_trial_end": trial_end,
                "p_lease_token": lease_token,
            },
        ).execute()
        finalized_data = (
            finalized.data[0]
            if isinstance(finalized.data, list) and finalized.data
            else finalized.data
        )
        if finalized_data is not True:
            raise RuntimeError("Referral trial extension finalization failed")
        return True
    elif external_type == "stripe_coupon":
        reward_result = supabase_client.table("referral_rewards")\
            .select("id,referrer_id,reward_value,applied")\
            .eq("id", reward_id)\
            .maybe_single()\
            .execute()
        reward = reward_result.data
        if not isinstance(reward, dict):
            raise RuntimeError("Referral reward missing")
        if reward.get("applied") is True:
            return True
        applied = await _apply_stripe_coupon(
            supabase_client,
            str(reward["referrer_id"]),
            reward["reward_value"],
            reward_id,
        )
    else:
        raise RuntimeError("Unsupported external referral reward")
    if applied is not True:
        raise RuntimeError("Stripe referral reward application failed")
    update_result = supabase_client.table("referral_rewards")\
        .update({
            "applied": True,
            "applied_at": datetime.now(UTC).isoformat(),
        })\
        .eq("id", reward_id)\
        .eq("applied", False)\
        .execute()
    if not update_result.data:
        replay_result = supabase_client.table("referral_rewards")\
            .select("applied")\
            .eq("id", reward_id)\
            .maybe_single()\
            .execute()
        if not isinstance(replay_result.data, dict) or replay_result.data.get("applied") is not True:
            raise RuntimeError("Referral reward finalization failed")
    return True


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
            .select("stripe_subscription_id") \
            .eq("user_id", referrer_id) \
            .in_("status", ["active", "trialing"]) \
            .limit(1) \
            .execute()

        if not sub_res.data or not str(
            sub_res.data[0].get("stripe_subscription_id", "")
        ).startswith("sub_"):
            logger.warning(f"[REFERRAL] No Stripe subscription for referrer {referrer_id}")
            return False

        subscription_id = sub_res.data[0]["stripe_subscription_id"]
        stripe_lib.Subscription.modify(
            subscription_id,
            discounts=[{"coupon": coupon_id}],
            idempotency_key=f"referral-reward:{reward_id}",
        )

        supabase_client.table("referral_rewards").update({
            "stripe_coupon_id": coupon_id,
        }).eq("id", reward_id).execute()

        return True

    except Exception as e:
        logger.error(f"[REFERRAL] _apply_stripe_coupon failed: {e}")
        return False
