"""
Public Coaches API — no authentication required.
Returns active coach configurations for frontend components.
Supports multi-language via ?locale= query parameter (fr default, en).
Same pattern as public_plans.py.
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, Query

from src.api.deps import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

COACHES_CACHE_KEY = "coaches_config"
COACHES_CACHE_TTL = 300  # 5 minutes
SUPPORTED_LOCALES = {"fr", "en", "es", "pt"}


def _apply_translations(coaches: list[dict[str, Any]], locale: str) -> list[dict[str, Any]]:
    """Override short_name, description, specialties, example_questions with translations if available."""
    if locale == "fr":
        return coaches

    translated = []
    for coach in coaches:
        coach_copy = {**coach}
        translations = coach_copy.get("translations") or {}
        lang_data = translations.get(locale)
        if lang_data and isinstance(lang_data, dict):
            if lang_data.get("short_name"):
                coach_copy["short_name"] = lang_data["short_name"]
            if lang_data.get("description"):
                coach_copy["description"] = lang_data["description"]
            if lang_data.get("specialties"):
                coach_copy["specialties"] = lang_data["specialties"]
            if lang_data.get("example_questions"):
                coach_copy["example_questions"] = lang_data["example_questions"]
        # Remove translations from response to keep payload small
        coach_copy.pop("translations", None)
        translated.append(coach_copy)
    return translated


@router.get("/coaches")
async def get_public_coaches(
    locale: str | None = Query(default=None, description="Language code: fr, en, es, pt"),
) -> list[dict[str, Any]]:
    """
    Returns all active coach configurations ordered by sort_order.
    Used by assistant page, welcome screen, bot selector — no auth required.
    Cached in Redis for 5 minutes per locale.

    ?locale=en returns translated short_name, description, specialties, example_questions.
    Default (no locale or locale=fr) returns French content.
    """
    effective_locale = locale if locale in SUPPORTED_LOCALES else "fr"
    cache_key = (
        f"{COACHES_CACHE_KEY}:{effective_locale}"
        if effective_locale != "fr"
        else COACHES_CACHE_KEY
    )

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
    select_fields = (
        "id, persona_name, short_name, description, specialties, "
        "example_questions, accent_color, icon, sort_order, is_active"
    )
    if effective_locale != "fr":
        select_fields += ", translations"

    result = supabase.table("coach_config").select(
        select_fields
    ).eq("is_active", True).order("sort_order").execute()

    coaches = result.data or []

    # Apply translations if needed
    if effective_locale != "fr":
        coaches = _apply_translations(coaches, effective_locale)

    # Cache in Redis
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex(cache_key, COACHES_CACHE_TTL, json.dumps(coaches))
    except Exception:
        pass

    return coaches
