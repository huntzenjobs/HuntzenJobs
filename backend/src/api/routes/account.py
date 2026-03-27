"""
Account Management API Routes
===============================
DELETE /api/account/delete  — Suppression de compte utilisateur (self-service)
GET    /api/account/export  — Export des données personnelles (RGPD art. 20)
"""

import logging
from datetime import UTC, datetime
from typing import Any

import stripe as stripe_lib
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from src.api.deps import get_supabase_client, get_user_info_from_token
from src.api.middleware import limiter
from src.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class DeleteAccountRequest(BaseModel):
    confirm: bool


# ---------------------------------------------------------------------------
# DELETE /delete — Suppression de compte
# ---------------------------------------------------------------------------

@router.delete("/delete")
@limiter.limit("3/hour")
async def delete_account(
    request: Request,
    payload: DeleteAccountRequest,
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    """
    Supprime le compte de l'utilisateur authentifie.

    Etapes :
    1. Soft-delete du profil (status = "deleted")
    2. Suppression des abonnements
    3. Suppression des quotas d'utilisation
    4. Hard-delete du compte auth Supabase

    Necessite confirmation explicite via {"confirm": true}.
    Rate limit : 3 appels par heure.
    """
    # 1. Authentification
    user = get_user_info_from_token(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant ou invalide",
        )

    # 2. Confirmation obligatoire
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous devez confirmer la suppression avec confirm=true",
        )

    user_id = user["id"]
    user_email = user.get("email", "unknown")
    supabase = get_supabase_client()

    logger.info(
        "Suppression de compte demandee",
        extra={"user_id": user_id, "email": user_email},
    )

    try:
        # 3. Soft-delete du profil
        supabase.table("profiles").update(
            {"status": "deleted"}
        ).eq("id", user_id).execute()
        logger.info("Profil soft-delete effectue", extra={"user_id": user_id})

        # 3b. Annuler les subscriptions Stripe actives avant suppression
        settings = get_settings()
        stripe_lib.api_key = settings.get_stripe_secret_key()
        subs_result = supabase.table("user_subscriptions").select(
            "stripe_subscription_id, status"
        ).eq("user_id", user_id).in_(
            "status", ["active", "trialing"]
        ).execute()

        for sub in subs_result.data or []:
            sub_id = sub.get("stripe_subscription_id")
            if not sub_id:
                continue
            try:
                stripe_lib.Subscription.modify(
                    sub_id,
                    cancel_at_period_end=True,
                )
                logger.info(
                    "Subscription Stripe annulee (cancel_at_period_end)",
                    extra={"user_id": user_id, "stripe_subscription_id": sub_id},
                )
            except Exception as stripe_err:
                logger.error(
                    "Echec annulation Stripe, suppression continue",
                    extra={
                        "user_id": user_id,
                        "stripe_subscription_id": sub_id,
                        "error": str(stripe_err),
                    },
                )

        # 4. Suppression des abonnements
        supabase.table("user_subscriptions").delete().eq(
            "user_id", user_id
        ).execute()
        logger.info("Abonnements supprimes", extra={"user_id": user_id})

        # 5. Suppression des quotas d'utilisation
        supabase.table("usage_quotas").delete().eq(
            "user_id", user_id
        ).execute()
        logger.info("Quotas supprimes", extra={"user_id": user_id})

        # 6. Hard-delete du compte auth Supabase
        supabase.auth.admin.delete_user(user_id)
        logger.info(
            "Compte auth Supabase supprime",
            extra={"user_id": user_id},
        )

    except Exception as e:
        logger.error(
            "Erreur lors de la suppression du compte",
            extra={"user_id": user_id, "error": str(e)},
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la suppression du compte",
        ) from e

    logger.info(
        "Compte supprime avec succes",
        extra={"user_id": user_id, "email": user_email},
    )

    return {
        "success": True,
        "message": "Votre compte a ete supprime avec succes",
    }


# ---------------------------------------------------------------------------
# GET /export — Export des donnees personnelles (RGPD art. 20)
# ---------------------------------------------------------------------------

def _safe_query(
    supabase: Any,
    table: str,
    user_id: str,
    single: bool = False,
) -> Any:
    """
    Execute une requete Supabase avec gestion d'erreur gracieuse.

    Si la table n'existe pas ou qu'une erreur survient, retourne None
    (single=True) ou une liste vide (single=False) au lieu de planter.
    """
    try:
        query = supabase.table(table).select("*").eq("user_id", user_id)
        if single:
            result = query.maybe_single().execute()
            return result.data
        else:
            result = query.execute()
            return result.data or []
    except Exception as e:
        logger.warning(
            "Erreur lors de la lecture de la table %s pour l'export",
            table,
            extra={"user_id": user_id, "error": str(e)},
        )
        return None if single else []


@router.get("/export")
@limiter.limit("5/hour")
async def export_user_data(
    request: Request,
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    """
    Exporte toutes les donnees personnelles de l'utilisateur (RGPD art. 20).

    Collecte les donnees depuis toutes les tables pertinentes et retourne
    un JSON structure par categorie.

    Rate limit : 5 appels par heure.
    """
    # 1. Authentification
    user = get_user_info_from_token(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token manquant ou invalide",
        )

    user_id = user["id"]
    user_email = user.get("email", "unknown")
    supabase = get_supabase_client()

    logger.info(
        "Export de donnees personnelles demande",
        extra={"user_id": user_id, "email": user_email},
    )

    # 2. Collecter les donnees depuis chaque table
    # Profil (user_id = id dans profiles)
    try:
        profile_result = supabase.table("profiles").select("*").eq(
            "id", user_id
        ).maybe_single().execute()
        profile = profile_result.data
    except Exception as e:
        logger.warning(
            "Erreur lors de la lecture du profil pour l'export",
            extra={"user_id": user_id, "error": str(e)},
        )
        profile = None

    subscriptions = _safe_query(supabase, "user_subscriptions", user_id)
    saved_jobs = _safe_query(supabase, "saved_jobs", user_id)
    cv_analyses = _safe_query(supabase, "cv_analyses", user_id)
    usage_quotas = _safe_query(supabase, "usage_quotas", user_id)
    career_score = _safe_query(
        supabase, "user_career_score", user_id, single=True
    )
    xp_events = _safe_query(supabase, "user_xp_events", user_id)
    notifications = _safe_query(supabase, "user_notifications", user_id)

    # 3. Construire la reponse structuree
    export_data: dict[str, Any] = {
        "metadata": {
            "export_date": datetime.now(UTC).isoformat(),
            "user_email": user_email,
            "user_id": user_id,
            "format_version": "1.0",
        },
        "profile": profile,
        "subscriptions": subscriptions,
        "saved_jobs": saved_jobs,
        "cv_analyses": cv_analyses,
        "usage_quotas": usage_quotas,
        "career_score": career_score,
        "xp_events": xp_events,
        "notifications": notifications,
    }

    logger.info(
        "Export de donnees personnelles termine",
        extra={
            "user_id": user_id,
            "tables_exported": len(
                [v for k, v in export_data.items() if k != "metadata" and v]
            ),
        },
    )

    return export_data
