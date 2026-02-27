"""User-facing referral endpoints.

GET  /api/referrals/my-code     — get or create the caller's referral code + stats
POST /api/referrals/track-click — increment click counter (unauthenticated)
POST /api/referrals/register    — link a newly created user to a referral code
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.api.deps import get_supabase_client, CurrentUserDep

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
