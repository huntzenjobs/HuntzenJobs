"""
Public Plans API — no authentication required.
Returns active subscription plans for pricing pages and frontend hooks.
"""

import json
import logging
from typing import Any, Dict, List

from fastapi import APIRouter

from src.api.deps import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

PLANS_CACHE_KEY = "plans_config"
PLANS_CACHE_TTL = 300  # 5 minutes


@router.get("/plans")
async def get_public_plans() -> List[Dict[str, Any]]:
    """
    Returns all active subscription plans with display info.
    Used by pricing pages and modals — no auth required.
    Cached in Redis for 5 minutes.
    Invalidated by any admin PATCH on plans (limits, features, price, wording).
    """
    # Try Redis cache first
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            cached = await redis.get(PLANS_CACHE_KEY)
            if cached:
                return json.loads(cached)
    except Exception:
        pass

    supabase = get_supabase_client()
    result = supabase.table("subscription_plans").select(
        "id, name, display_name, description, price_monthly, price_yearly, features, sort_order, is_active"
    ).eq("is_active", True).order("sort_order").execute()

    plans = result.data or []

    # Cache in Redis
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex(PLANS_CACHE_KEY, PLANS_CACHE_TTL, json.dumps(plans))
    except Exception:
        pass

    return plans
