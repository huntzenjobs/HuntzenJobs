"""
Stats API Routes
=================
GET /api/stats/plan-distribution — répartition des abonnements (pour Pop-up #8)
Public, pas d'auth requise. Données mises en cache 1h.
"""

import json
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter
from supabase import create_client

from src.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Cache simple en mémoire (pas de Redis pour un endpoint public sans auth)
_plan_distribution_cache: dict = {}
_cache_expires_at: datetime | None = None
CACHE_TTL_MINUTES = 60


def _get_supabase():
    settings = get_settings()
    return create_client(settings.supabase_url, settings.get_supabase_service_role_key())


# ---------------------------------------------------------------------------
# GET /api/stats/plan-distribution  (public)
# ---------------------------------------------------------------------------

@router.get("/plan-distribution")
async def get_plan_distribution():
    """
    Retourne la distribution des abonnements actifs.
    Utilisé par Pop-up #8 pour afficher "X% choisissent Pro".
    Cache en mémoire 1h pour éviter les requêtes répétées.
    """
    global _plan_distribution_cache, _cache_expires_at

    now = datetime.now(timezone.utc)
    if _cache_expires_at and now < _cache_expires_at and _plan_distribution_cache:
        return _plan_distribution_cache

    try:
        supabase = _get_supabase()
        res = (
            supabase.table("user_subscriptions")
            .select("plan_name")
            .eq("status", "active")
            .execute()
        )
        rows = res.data or []
        total = len(rows)

        if total == 0:
            result = {
                "total": 0,
                "distribution": {},
                "pro_percent": 67,  # Valeur par défaut si pas de données
                "cached_at": now.isoformat(),
            }
        else:
            counts: dict[str, int] = {}
            for row in rows:
                plan = row.get("plan_name", "free")
                counts[plan] = counts.get(plan, 0) + 1

            distribution = {
                plan: {"count": cnt, "percent": round(cnt / total * 100)}
                for plan, cnt in counts.items()
            }
            pro_count = counts.get("pro", 0) + counts.get("premium", 0)
            result = {
                "total": total,
                "distribution": distribution,
                "pro_percent": round(pro_count / total * 100),
                "cached_at": now.isoformat(),
            }

        _plan_distribution_cache = result
        _cache_expires_at = now + timedelta(minutes=CACHE_TTL_MINUTES)
        return result

    except Exception as e:
        logger.error(f"[stats] plan_distribution error: {e}")
        # Retourne des données par défaut plutôt que 500
        return {
            "total": 0,
            "distribution": {},
            "pro_percent": 67,
            "error": "data_unavailable",
        }
