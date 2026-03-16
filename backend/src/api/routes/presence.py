"""
Presence & Tracking Routes
===========================
presence_router : heartbeat utilisateur (qui est en ligne maintenant)
tracking_router : réception d'événements depuis le frontend

Nommage : ne pas appeler "events_router" — déjà pris par job-fairs dans __init__.py
"""

import logging
from typing import Optional

from fastapi import APIRouter, Request, Depends, Header
from pydantic import BaseModel

from src.api.deps import get_current_user, get_supabase_client
from src.services.user_events import log_event

logger = logging.getLogger(__name__)

presence_router = APIRouter()
tracking_router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# MODELS
# ──────────────────────────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    page: str
    feature: Optional[str] = None


class TrackEventRequest(BaseModel):
    event_name: str
    event_label: Optional[str] = None
    category: str = "action"
    feature: Optional[str] = None
    severity: str = "info"
    properties: Optional[dict] = None
    source: str = "frontend"
    error_code: Optional[str] = None
    duration_ms: Optional[int] = None


# ──────────────────────────────────────────────────────────────────────────────
# PRESENCE HEARTBEAT
# ──────────────────────────────────────────────────────────────────────────────

@presence_router.post("/heartbeat")
async def heartbeat(
    body: HeartbeatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Enregistre la présence d'un utilisateur sur une page.
    Appelé toutes les 30s depuis le dashboard frontend.
    """
    try:
        import time
        from src.utils.cache import get_redis

        user_id = current_user.get("id")
        if not user_id:
            return {"ok": True}

        redis = await get_redis()
        if not redis:
            return {"ok": True}

        now = int(time.time())
        expire_at = now - 60  # présent = actif dans la dernière minute

        # Enregistrer présence globale
        await redis.zadd("presence:all", {user_id: now})
        await redis.zremrangebyscore("presence:all", 0, expire_at)

        # Enregistrer présence par page
        page_key = f"presence:page:{body.page}"
        await redis.zadd(page_key, {user_id: now})
        await redis.zremrangebyscore(page_key, 0, expire_at)
        await redis.expire(page_key, 120)

        # Enregistrer présence par feature (si applicable)
        if body.feature:
            feature_key = f"presence:feature:{body.feature}"
            await redis.zadd(feature_key, {user_id: now})
            await redis.zremrangebyscore(feature_key, 0, expire_at)
            await redis.expire(feature_key, 120)

    except Exception as e:
        logger.warning(f"[presence] heartbeat failed: {e}")

    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# FRONTEND TRACKING
# ──────────────────────────────────────────────────────────────────────────────

@tracking_router.post("/event")
async def track_event(
    body: TrackEventRequest,
    authorization: Optional[str] = Header(default=None),
):
    """
    Reçoit un événement depuis le frontend et l'insère dans user_events.
    Auth optionnelle : si pas de token → user_id = None.
    """
    user_id = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from src.api.deps import get_supabase_anon_client
            token = authorization.replace("Bearer ", "")
            resp = get_supabase_anon_client().auth.get_user(token)
            if resp and resp.user:
                user_id = resp.user.id
        except Exception:
            pass

    supabase = get_supabase_client()
    log_event(
        supabase,
        event_name=body.event_name,
        event_label=body.event_label,
        category=body.category,
        user_id=user_id,
        feature=body.feature,
        severity=body.severity,
        properties=body.properties or {},
        source="frontend",
        error_code=body.error_code,
        duration_ms=body.duration_ms,
    )

    return {"ok": True}
