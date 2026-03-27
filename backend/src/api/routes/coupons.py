"""
Coupons API Routes
==================
POST /api/coupons/generate-for-trigger — génère un coupon Stripe unique par user + trigger

Triggers supportés :
  momentum    → -20% 24h   (Pop-up 5 : user actif)
  anti_churn  → -30% 3 mois (Pop-up 6 : avant annulation)
  win_back_7d → 7j Pro offerts (Pop-up 7 : user inactif 7j)
"""

import logging
import os
from datetime import UTC, datetime, timedelta

import stripe
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from src.api.deps import CurrentUserDep, get_supabase_client
from src.services.notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "https://huntzenjobs.com")

# Configuration des coupons par trigger
TRIGGER_CONFIG = {
    "momentum": {
        "percent_off": 20,
        "duration": "once",
        "duration_in_months": None,
        "expires_hours": 24,
        "notif_title": "Offre spéciale -20% rien que pour toi",
        "notif_body": "Tu es actif sur ta recherche — voici une réduction exclusive valable 24h.",
        "plan": "starter",
    },
    "anti_churn": {
        "percent_off": 30,
        "duration": "repeating",
        "duration_in_months": 3,
        "expires_hours": 72,
        "notif_title": "Reste et économise -30% pendant 3 mois",
        "notif_body": "Avant de partir, voici une offre exclusive : -30% sur ton abonnement pendant 3 mois.",
        "plan": "pro",
    },
    "win_back_7d": {
        "percent_off": 100,
        "duration": "once",
        "duration_in_months": None,
        "expires_hours": 168,  # 7 jours
        "notif_title": "7 jours Pro offerts — on t'a réservé ta place",
        "notif_body": "Tu nous manques ! Reviens et profite de 7 jours Pro gratuits.",
        "plan": "pro",
    },
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class GenerateCouponRequest(BaseModel):
    trigger_type: str
    user_id: str | None = None  # Admin peut passer un user_id explicite


# ---------------------------------------------------------------------------
# POST /api/coupons/generate-for-trigger
# ---------------------------------------------------------------------------

@router.post("/generate-for-trigger")
async def generate_for_trigger(
    body: GenerateCouponRequest,
    current_user: CurrentUserDep,
):
    """
    Génère un coupon Stripe unique pour un trigger donné.
    Idempotent : vérifie si user a déjà eu ce type de coupon.
    """
    if body.trigger_type not in TRIGGER_CONFIG:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"trigger_type must be one of: {', '.join(TRIGGER_CONFIG.keys())}",
        )

    supabase = get_supabase_client()
    user_id = current_user["id"]
    config = TRIGGER_CONFIG[body.trigger_type]

    # Idempotence : vérifier si un coupon de ce type existe déjà pour ce user
    try:
        existing = (
            supabase.table("user_notifications")
            .select("id, data")
            .eq("user_id", user_id)
            .eq("type", "promo_code")
            .execute()
        )
        for notif in (existing.data or []):
            notif_data = notif.get("data") or {}
            if notif_data.get("trigger_type") == body.trigger_type:
                coupon_code = notif_data.get("coupon_code")
                logger.info(f"[coupons] Already generated {body.trigger_type} for {user_id}: {coupon_code}")
                return {
                    "coupon_code": coupon_code,
                    "discount": f"{config['percent_off']}%",
                    "already_existed": True,
                }
    except Exception as e:
        logger.warning(f"[coupons] idempotency check failed: {e}")

    # Créer le coupon Stripe
    try:
        expires_at = datetime.now(UTC) + timedelta(hours=config["expires_hours"])
        coupon_params: dict = {
            "percent_off": config["percent_off"],
            "duration": config["duration"],
            "redeem_by": int(expires_at.timestamp()),
            "metadata": {
                "trigger_type": body.trigger_type,
                "user_id": user_id,
            },
        }
        if config["duration_in_months"]:
            coupon_params["duration_in_months"] = config["duration_in_months"]

        coupon = stripe.Coupon.create(**coupon_params)
        coupon_code = coupon.id

    except Exception as e:
        logger.error(f"[coupons] Stripe coupon creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create Stripe coupon") from None

    # Construire l'URL de checkout avec le coupon pré-rempli
    checkout_url = f"{APP_URL}/pricing?coupon={coupon_code}&plan={config['plan']}"

    # Créer la notification in-app
    create_notification(
        supabase,
        user_id,
        "promo_code",
        config["notif_title"],
        config["notif_body"],
        {
            "trigger_type": body.trigger_type,
            "coupon_code": coupon_code,
            "discount": f"{config['percent_off']}%",
            "expires_at": expires_at.isoformat(),
            "checkout_url": checkout_url,
            "plan": config["plan"],
        },
    )

    logger.info(f"[coupons] Created {body.trigger_type} coupon {coupon_code} for user {user_id}")
    return {
        "coupon_code": coupon_code,
        "discount": f"{config['percent_off']}%",
        "expires_at": expires_at.isoformat(),
        "checkout_url": checkout_url,
        "plan": config["plan"],
    }
