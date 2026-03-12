"""User-facing referral endpoints.

GET  /api/referrals/my-code         — get or create the caller's referral code + stats
GET  /api/referrals/boost-status    — HuntZen Boost : paliers + progression
POST /api/referrals/apply-tier-reward — applique récompense quand palier atteint
POST /api/referrals/track-click     — increment click counter (unauthenticated)
POST /api/referrals/register        — link a newly created user to a referral code
"""

import logging
import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.api.deps import get_supabase_client, CurrentUserDep
from src.services.notifications import create_notification
from src.services.referrals import _apply_free_days, _apply_quota_bonus, _apply_stripe_coupon

APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "https://huntzenjobs.com")

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# GET /api/referrals/my-code
# ---------------------------------------------------------------------------

@router.get("/my-code")
async def get_my_code(current_user: CurrentUserDep):
    """Return (or create) the caller's referral code plus engagement stats."""
    supabase = get_supabase_client()

    code_res = supabase.rpc(
        "get_or_create_referral_code", {"p_user_id": current_user["id"]}
    ).execute()

    if not code_res.data:
        raise HTTPException(status_code=500, detail="Failed to get referral code")

    stats_res = supabase.table("referrals") \
        .select("referral_code, total_clicks, total_signups, total_conversions") \
        .eq("referrer_id", current_user["id"]) \
        .eq("is_active", True) \
        .limit(1) \
        .execute()

    stats = stats_res.data[0] if stats_res.data else {}

    return {
        "code": code_res.data,
        "total_clicks": stats.get("total_clicks", 0),
        "total_signups": stats.get("total_signups", 0),
        "total_conversions": stats.get("total_conversions", 0),
    }


# ---------------------------------------------------------------------------
# POST /api/referrals/track-click  (public — no auth required)
# ---------------------------------------------------------------------------

class TrackClickRequest(BaseModel):
    code: str


@router.post("/track-click")
async def track_click(body: TrackClickRequest):
    """Increment click counter for a referral code (called by frontend on landing)."""
    supabase = get_supabase_client()

    ref_res = supabase.table("referrals") \
        .select("id, total_clicks") \
        .eq("referral_code", body.code) \
        .eq("is_active", True) \
        .maybe_single() \
        .execute()

    if not ref_res.data:
        return {"ok": False}

    supabase.table("referrals").update({
        "total_clicks": ref_res.data["total_clicks"] + 1,
    }).eq("id", ref_res.data["id"]).execute()

    return {"ok": True}


# ---------------------------------------------------------------------------
# POST /api/referrals/register  (public — called right after email confirmation)
# ---------------------------------------------------------------------------

class RegisterReferralRequest(BaseModel):
    code: str
    new_user_id: str


@router.post("/register")
async def register_referral(body: RegisterReferralRequest):
    """
    Link a newly authenticated user to a referral code.
    Idempotent: UNIQUE constraint on referred_user_id prevents double registration.
    """
    supabase = get_supabase_client()

    ref_res = supabase.table("referrals") \
        .select("id, referrer_id, total_signups") \
        .eq("referral_code", body.code) \
        .eq("is_active", True) \
        .maybe_single() \
        .execute()

    if not ref_res.data:
        logger.warning(f"[REFERRAL] Unknown code: {body.code}")
        return {"ok": False, "reason": "invalid_code"}

    ref = ref_res.data

    if ref["referrer_id"] == body.new_user_id:
        return {"ok": False, "reason": "self_referral"}

    try:
        supabase.table("referral_signups").insert({
            "referral_id": ref["id"],
            "referred_user_id": body.new_user_id,
        }).execute()

        supabase.table("referrals").update({
            "total_signups": ref["total_signups"] + 1,
        }).eq("id", ref["id"]).execute()

        logger.info(f"[REFERRAL] User {body.new_user_id} registered via code {body.code}")
        return {"ok": True}

    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            return {"ok": True, "note": "already_registered"}
        logger.error(f"[REFERRAL] register_referral error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")


# ---------------------------------------------------------------------------
# GET /api/referrals/boost-status  (authenticated)
# ---------------------------------------------------------------------------

@router.get("/boost-status")
async def get_boost_status(current_user: CurrentUserDep):
    """
    Retourne l'état HuntZen Boost :
    - code + lien parrainage
    - total validés, palier actuel, palier suivant
    - config des tiers depuis referral_config
    - récompenses déjà gagnées
    - 10 derniers filleuls
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]

    # Code de parrainage (crée si absent)
    code_res = supabase.rpc(
        "get_or_create_referral_code", {"p_user_id": user_id}
    ).execute()
    referral_code = code_res.data if code_res.data else ""

    # Stats de la table referrals
    stats_res = (
        supabase.table("referrals")
        .select("id, referral_code, total_clicks, total_signups, total_conversions")
        .eq("referrer_id", user_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    stats = stats_res.data[0] if stats_res.data else {}
    referral_id = stats.get("id")
    total_validated = stats.get("total_conversions", 0)

    # Tiers depuis referral_config
    config_res = (
        supabase.table("referral_config")
        .select("tiers")
        .eq("id", 1)
        .maybe_single()
        .execute()
    )
    tiers = (config_res.data or {}).get("tiers") or []

    # Calcul palier actuel
    current_tier_idx = 0
    for i, tier in enumerate(tiers):
        if total_validated >= tier.get("friends", 0):
            current_tier_idx = i
    next_tier_idx = min(current_tier_idx + 1, len(tiers) - 1)
    next_tier = tiers[next_tier_idx] if next_tier_idx < len(tiers) else None
    friends_to_next = max(0, (next_tier or {}).get("friends", 0) - total_validated) if next_tier else 0

    # Récompenses déjà gagnées
    try:
        rewards_res = (
            supabase.table("referral_rewards")
            .select("reward_type, reward_value, applied_at")
            .eq("referrer_id", user_id)
            .eq("applied", True)
            .execute()
        )
        rewards_earned = rewards_res.data or []
    except Exception as e:
        logger.warning(f"[REFERRAL] rewards query error for {user_id}: {e}")
        rewards_earned = []

    # 10 derniers filleuls
    recent_referrals = []
    if referral_id:
        try:
            signups_res = (
                supabase.table("referral_signups")
                .select("referred_user_id, created_at, converted_to_paid_at")
                .eq("referral_id", referral_id)
                .order("created_at", desc=True)
                .limit(10)
                .execute()
            )
            for s in (signups_res.data or []):
                recent_referrals.append({
                    "status": "validated" if s.get("converted_to_paid_at") else "registered",
                    "created_at": s.get("created_at"),
                })
        except Exception as e:
            logger.warning(f"[REFERRAL] signups query error for {user_id}: {e}")

    return {
        "referral_code": referral_code,
        "referral_link": f"{APP_URL}/ref/{referral_code}",
        "total_clicks": stats.get("total_clicks", 0),
        "total_signups": stats.get("total_signups", 0),
        "total_validated": total_validated,
        "current_tier": current_tier_idx,
        "next_tier": next_tier_idx if next_tier else None,
        "friends_to_next": friends_to_next,
        "tiers": tiers,
        "rewards_earned": rewards_earned,
        "recent_referrals": recent_referrals,
    }


# ---------------------------------------------------------------------------
# POST /api/referrals/apply-tier-reward  (authenticated)
# ---------------------------------------------------------------------------

class ApplyTierRewardRequest(BaseModel):
    tier_index: int


@router.post("/apply-tier-reward")
async def apply_tier_reward(body: ApplyTierRewardRequest, current_user: CurrentUserDep):
    """
    Applique la récompense d'un palier atteint.
    Appelé depuis le webhook Stripe (ou manuellement depuis l'admin).
    Idempotent : vérifie si la récompense a déjà été appliquée.
    """
    supabase = get_supabase_client()
    user_id = current_user["id"]

    config_res = (
        supabase.table("referral_config")
        .select("tiers")
        .eq("id", 1)
        .maybe_single()
        .execute()
    )
    tiers = (config_res.data or {}).get("tiers") or []

    if body.tier_index < 0 or body.tier_index >= len(tiers):
        raise HTTPException(status_code=400, detail="Invalid tier_index")

    tier = tiers[body.tier_index]

    # Idempotence : vérifier si ce palier a déjà été enregistré (applied ou en cours)
    try:
        existing_rewards = (
            supabase.table("referral_rewards")
            .select("id, reward_value, applied")
            .eq("referrer_id", user_id)
            .execute()
        )
        for row in (existing_rewards.data or []):
            rv = row.get("reward_value") or {}
            if rv.get("tier_index") == body.tier_index:
                if row.get("applied"):
                    return {"ok": True, "tier": tier, "tier_index": body.tier_index, "already_applied": True}
                # Record applied=False existant → précédent appel a crashé, on nettoie
                try:
                    supabase.table("referral_rewards").delete().eq("id", row["id"]).execute()
                    logger.info(f"[REFERRAL] Cleaned up stale applied=False reward {row['id']} for {user_id}")
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"[REFERRAL] idempotency check failed for {user_id}: {e}")

    # Récupère un referral_signup_id (FK NOT NULL sur referral_rewards)
    try:
        ref_res = (
            supabase.table("referrals")
            .select("id")
            .eq("referrer_id", user_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        referral_id = ref_res.data[0]["id"] if ref_res.data else None

        signup_id = None
        if referral_id:
            signup_res = (
                supabase.table("referral_signups")
                .select("id")
                .eq("referral_id", referral_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            signup_id = signup_res.data[0]["id"] if signup_res.data else None

        if not signup_id:
            raise HTTPException(status_code=400, detail="No referral signups found — tier reward cannot be applied")

        # Insère la récompense dans referral_rewards (applied=False initialement)
        reward_res = supabase.table("referral_rewards").insert({
            "referral_signup_id": signup_id,
            "referrer_id": user_id,
            "reward_type": tier.get("reward_type", "quota_bonus"),
            "reward_value": {**tier, "tier_index": body.tier_index},
            "applied": False,
        }).execute()
        reward_id = reward_res.data[0]["id"] if reward_res.data else None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REFERRAL] apply_tier_reward insert failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record tier reward")

    # Appliquer réellement la récompense selon le type
    reward_type_str = tier.get("reward_type", "quota_bonus")
    try:
        if reward_type_str == "free_days":
            success = await _apply_free_days(supabase, user_id, tier)
        elif reward_type_str == "quota_bonus":
            success = await _apply_quota_bonus(supabase, user_id, tier)
        elif reward_type_str == "stripe_coupon":
            success = await _apply_stripe_coupon(supabase, user_id, tier, reward_id)
        else:
            logger.warning(f"[REFERRAL] Unknown reward_type '{reward_type_str}' for tier {body.tier_index}")
            success = False
    except Exception as e:
        logger.error(f"[REFERRAL] reward application error for {user_id}: {e}")
        success = False

    if success and reward_id:
        supabase.table("referral_rewards").update({
            "applied": True,
            "applied_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", reward_id).execute()
    elif reward_id:
        supabase.table("referral_rewards").delete().eq("id", reward_id).execute()
        raise HTTPException(status_code=500, detail="Failed to apply tier reward")

    # Notif de palier atteint
    create_notification(
        supabase,
        user_id,
        "referral_bonus",
        f"Niveau Ambassadeur atteint — {tier.get('label', '')}",
        f"Félicitations ! Tu as atteint le palier {body.tier_index + 1}. Ta récompense : {tier.get('label', '')}.",
        {"tier_index": body.tier_index, "tier": tier},
    )

    logger.info(f"[REFERRAL] Tier {body.tier_index} reward applied for user {user_id}")
    return {"ok": True, "tier": tier, "tier_index": body.tier_index}
