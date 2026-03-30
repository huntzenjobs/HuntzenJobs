"""
Promo & Referral Code Validation/Apply Routes
===============================================
POST /api/codes/validate — valide un code promo ou referral (public)
POST /api/codes/apply   — lie un code promo a un utilisateur (auth requise)
"""

import logging
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.api.deps import get_supabase_client, get_user_id_from_token
from src.api.middleware import limiter
from src.services.referrals import _apply_free_days

logger = logging.getLogger(__name__)
router = APIRouter()

REFERRAL_CODE_PATTERN = re.compile(r"^HZN-[A-Z0-9]{6}$")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ValidateCodeRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=50)


class ApplyCodeRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=50)


# ---------------------------------------------------------------------------
# POST /api/codes/validate  (public, rate limit 10/min)
# ---------------------------------------------------------------------------

@router.post("/validate")
@limiter.limit("10/minute")
async def validate_code(request: Request, body: ValidateCodeRequest):
    """
    Valide un code promo ou referral.

    - Si le code matche HZN-XXXXXX -> recherche dans la table referrals
    - Sinon -> recherche dans la table promo_codes
    """
    code = body.code.strip().upper()
    supabase = get_supabase_client()

    # --- Code de parrainage ---
    if REFERRAL_CODE_PATTERN.match(code):
        return await _validate_referral_code(supabase, code)

    # --- Code promo ---
    return await _validate_promo_code(supabase, code)


async def _validate_referral_code(supabase, code: str) -> dict:
    """Valide un code de parrainage dans la table referrals."""
    try:
        ref_res = (
            supabase.table("referrals")
            .select("referrer_id, is_active")
            .eq("referral_code", code)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )

        if not ref_res.data:
            return {"valid": False, "type": "referral", "error": "Code de parrainage invalide ou inactif."}

        referrer_id = ref_res.data[0]["referrer_id"]

        # Recuperer le nom du parrain depuis profiles
        referrer_name = None
        try:
            profile_res = (
                supabase.table("profiles")
                .select("full_name")
                .eq("id", referrer_id)
                .limit(1)
                .execute()
            )
            if profile_res.data:
                referrer_name = profile_res.data[0].get("full_name")
        except Exception as e:
            logger.warning(f"[codes] Could not fetch referrer profile: {e}")

        return {
            "valid": True,
            "type": "referral",
            "description": "Code de parrainage",
            "referrer_name": referrer_name,
            "discount_type": None,
            "discount_value": None,
            "plan": None,
        }

    except Exception as e:
        logger.error(f"[codes] referral validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la validation du code de parrainage.",
        ) from None


async def _validate_promo_code(supabase, code: str) -> dict:
    """Valide un code promo dans la table promo_codes."""
    try:
        promo_res = (
            supabase.table("promo_codes")
            .select("id, code, description, discount_type, discount_value, plan, max_uses, current_uses, starts_at, expires_at, is_active")
            .eq("code", code)
            .limit(1)
            .execute()
        )

        if not promo_res.data:
            return {"valid": False, "type": "promo", "error": "Code promo invalide."}

        promo = promo_res.data[0]

        # Verifier is_active
        if not promo.get("is_active"):
            return {"valid": False, "type": "promo", "error": "Ce code promo n'est plus actif."}

        # Verifier expiration
        expires_at = promo.get("expires_at")
        if expires_at:
            try:
                expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expiry < datetime.now(UTC):
                    return {"valid": False, "type": "promo", "error": "Ce code promo a expire."}
            except (ValueError, TypeError):
                pass

        # Verifier starts_at
        starts_at = promo.get("starts_at")
        if starts_at:
            try:
                start = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
                if start > datetime.now(UTC):
                    return {"valid": False, "type": "promo", "error": "Ce code promo n'est pas encore actif."}
            except (ValueError, TypeError):
                pass

        # Verifier max_uses
        max_uses = promo.get("max_uses")
        current_uses = promo.get("current_uses", 0)
        if max_uses is not None and current_uses >= max_uses:
            return {"valid": False, "type": "promo", "error": "Ce code promo a atteint sa limite d'utilisation."}

        return {
            "valid": True,
            "type": "promo",
            "description": promo.get("description", ""),
            "referrer_name": None,
            "discount_type": promo.get("discount_type"),
            "discount_value": float(promo.get("discount_value", 0)),
            "plan": promo.get("plan"),
        }

    except Exception as e:
        logger.error(f"[codes] promo validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la validation du code promo.",
        ) from None


# ---------------------------------------------------------------------------
# POST /api/codes/apply  (authenticated, rate limit 5/min)
# ---------------------------------------------------------------------------

@router.post("/apply")
@limiter.limit("5/minute")
async def apply_code(
    request: Request,
    body: ApplyCodeRequest,
    authorization: str | None = Header(None),
):
    """
    Lie un code promo a un utilisateur.

    - Si code referral -> renvoie vers /api/referrals/register
    - Sinon -> verifie validite, insere dans user_promo_codes, incremente current_uses
    """
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant ou invalide",
        )

    code = body.code.strip().upper()
    supabase = get_supabase_client()

    # --- Code de parrainage -> rediriger ---
    if REFERRAL_CODE_PATTERN.match(code):
        return {
            "ok": False,
            "error": "referral_code",
            "message": "Les codes de parrainage doivent etre appliques via /api/referrals/register.",
        }

    # --- Rechercher le code promo ---
    try:
        promo_res = (
            supabase.table("promo_codes")
            .select(
                "id, code, is_active, max_uses, current_uses, expires_at, starts_at, discount_type, discount_value, plan",
            )
            .eq("code", code)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error(f"[codes] apply lookup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne",
        ) from None

    if not promo_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code promo invalide.",
        )

    promo = promo_res.data[0]

    # --- Verifications de validite ---
    if not promo.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce code promo n'est plus actif.",
        )

    expires_at = promo.get("expires_at")
    if expires_at:
        try:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expiry < datetime.now(UTC):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ce code promo a expire.",
                )
        except (ValueError, TypeError):
            pass

    starts_at = promo.get("starts_at")
    if starts_at:
        try:
            start = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
            if start > datetime.now(UTC):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ce code promo n'est pas encore actif.",
                )
        except (ValueError, TypeError):
            pass

    max_uses = promo.get("max_uses")
    current_uses = promo.get("current_uses", 0)
    if max_uses is not None and current_uses >= max_uses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce code promo a atteint sa limite d'utilisation.",
        )

    # --- Inserer dans user_promo_codes (UNIQUE constraint protege contre les doublons) ---
    promo_id = promo["id"]
    try:
        supabase.table("user_promo_codes").insert({
            "user_id": user_id,
            "promo_code_id": promo_id,
        }).execute()
    except Exception as e:
        error_msg = str(e).lower()
        if "duplicate" in error_msg or "unique" in error_msg or "23505" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tu as deja utilise ce code promo.",
            ) from None
        logger.error(f"[codes] apply insert error for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de l'application du code promo.",
        ) from None

    # --- Incrementer current_uses ---
    try:
        supabase.table("promo_codes").update({
            "current_uses": current_uses + 1,
        }).eq("id", promo_id).execute()
    except Exception as e:
        logger.warning(f"[codes] Failed to increment current_uses for promo {promo_id}: {e}")

    # --- Appliquer l'effet du code promo (jours gratuits) ---
    try:
        if promo.get("discount_type") == "free_days":
            try:
                days = int(promo.get("discount_value") or 0)
            except (TypeError, ValueError):
                days = 0

            if days > 0:
                reward_value = {
                    "days": days,
                    # par defaut on offre le plan pro si aucun plan n'est defini
                    "reward_plan": promo.get("plan") or "pro",
                }
                success = await _apply_free_days(supabase, user_id, reward_value)
                if not success:
                    logger.error(
                        f"[codes] _apply_free_days failed for user {user_id} and promo {promo_id}",
                    )
    except Exception as e:
        logger.error(f"[codes] Failed to apply promo side effects for {user_id}: {e}")

    logger.info(f"[codes] User {user_id} applied promo code {code} (promo_id={promo_id})")
    return {"ok": True, "message": "Code promo applique avec succes."}
