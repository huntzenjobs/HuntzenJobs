"""
Public Plans API — no authentication required.
Returns active subscription plans for pricing pages and frontend hooks.
Supports multi-language via ?locale= query parameter (fr default, en/es/pt).
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, Query

from src.api.deps import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

PLANS_CACHE_KEY = "plans_config"
PLANS_CACHE_TTL = 10  # 10 seconds — pre-commercialisation, propagation rapide des changements admin
SUPPORTED_LOCALES = {"fr", "en", "es", "pt"}


def _apply_translations(plans: list[dict[str, Any]], locale: str) -> list[dict[str, Any]]:
    """Override display_name, description, features, features_excluded with translations if available."""
    if locale == "fr":
        return plans

    translated = []
    for plan in plans:
        plan_copy = {**plan}
        translations = plan_copy.get("translations") or {}
        lang_data = translations.get(locale)
        if lang_data and isinstance(lang_data, dict):
            if lang_data.get("display_name"):
                plan_copy["display_name"] = lang_data["display_name"]
            if lang_data.get("description"):
                plan_copy["description"] = lang_data["description"]
            if lang_data.get("features"):
                plan_copy["features"] = lang_data["features"]
            if lang_data.get("features_excluded"):
                plan_copy["features_excluded"] = lang_data["features_excluded"]
        # Remove translations from response to keep payload small
        plan_copy.pop("translations", None)
        translated.append(plan_copy)
    return translated


@router.get("/plans")
async def get_public_plans(
    locale: str | None = Query(default=None, description="Language code: fr, en, es, pt"),
) -> list[dict[str, Any]]:
    """
    Returns all active subscription plans with display info.
    Used by pricing pages and modals — no auth required.
    Cached in Redis for 5 minutes per locale.
    Invalidated by any admin PATCH on plans (limits, features, price, wording).

    ?locale=en returns translated display_name, description, features, features_excluded.
    Default (no locale or locale=fr) returns French content.
    """
    effective_locale = locale if locale in SUPPORTED_LOCALES else "fr"
    cache_key = f"{PLANS_CACHE_KEY}:{effective_locale}" if effective_locale != "fr" else PLANS_CACHE_KEY

    # Try Redis cache first
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
    except Exception:
        pass

    supabase = get_supabase_client()

    # Include translations column when a non-fr locale is requested
    select_fields = "id, name, display_name, description, price_monthly, price_yearly, features, features_excluded, limits, feature_flags, sort_order, is_active"
    if effective_locale != "fr":
        select_fields += ", translations"

    result = supabase.table("subscription_plans").select(
        select_fields
    ).eq("is_active", True).order("sort_order").execute()

    plans = result.data or []

    # Apply translations if needed
    if effective_locale != "fr":
        plans = _apply_translations(plans, effective_locale)

    # Cache in Redis
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex(cache_key, PLANS_CACHE_TTL, json.dumps(plans))
    except Exception:
        pass

    return plans


POPUPS_CACHE_KEY = "conversion_popups"
POPUPS_CACHE_TTL = 60  # 1 minute


@router.get("/conversion-popups")
async def get_public_conversion_popups(
    locale: str | None = Query(default=None, description="Language code: fr, en, es, pt"),
) -> list[dict[str, Any]]:
    """
    Returns active conversion popup configs for frontend display.
    Texts returned in requested locale (falls back to fr).
    No auth required -- cached in Redis.
    """
    effective_locale = locale if locale in SUPPORTED_LOCALES else "fr"
    cache_key = f"{POPUPS_CACHE_KEY}:{effective_locale}"

    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
    except Exception:
        pass

    supabase = get_supabase_client()
    result = supabase.table("conversion_popup_configs").select("*").eq(
        "is_active", True
    ).order("sort_order").execute()

    popups = []
    for row in result.data or []:
        popup = {
            "id": row["id"],
            "trigger_id": row["trigger_id"],
            "source_plans": row.get("source_plans", ["free"]),
            "target_plan": row.get("target_plan", "starter"),
            "feature_trigger": row.get("feature_trigger"),
            "discount_percent": float(row["discount_percent"]) if row.get("discount_percent") else None,
            "coupon_trigger": row.get("coupon_trigger"),
            "title": (row.get("title") or {}).get(effective_locale, (row.get("title") or {}).get("fr", "")),
            "body": (row.get("body") or {}).get(effective_locale, (row.get("body") or {}).get("fr", "")),
            "primary_cta": (row.get("primary_cta") or {}).get(effective_locale, (row.get("primary_cta") or {}).get("fr", "")),
            "secondary_cta": (row.get("secondary_cta") or {}).get(effective_locale, (row.get("secondary_cta") or {}).get("fr", "")) if row.get("secondary_cta") else None,
            "price_override": (row.get("price_override") or {}).get(effective_locale, (row.get("price_override") or {}).get("fr", "")) if row.get("price_override") else None,
        }
        popups.append(popup)

    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex(cache_key, POPUPS_CACHE_TTL, json.dumps(popups))
    except Exception:
        pass

    return popups
