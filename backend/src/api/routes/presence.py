"""
Presence, Tracking, Banner & Maintenance Routes
=================================================
presence_router : heartbeat utilisateur + SSE live admin
tracking_router : réception d'événements depuis le frontend
banner_router   : banner site-wide (lecture publique, écriture admin)

Nommage : ne pas appeler "events_router" — déjà pris par job-fairs dans __init__.py
"""

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel

from src.api.deps import AdminUserDep, get_current_user, get_supabase_client
from src.services.user_events import log_event

logger = logging.getLogger(__name__)

presence_router = APIRouter()
tracking_router = APIRouter()
banner_router   = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# MODELS
# ──────────────────────────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    page: str
    feature: str | None = None


class TrackEventRequest(BaseModel):
    event_name: str
    event_label: str | None = None
    category: str = "action"
    feature: str | None = None
    severity: str = "info"
    properties: dict | None = None
    source: str = "frontend"
    error_code: str | None = None
    duration_ms: int | None = None


class BannerRequest(BaseModel):
    text: str
    type: str = "info"   # "info" | "warning" | "error" | "success"
    active: bool = True


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
        from src.utils.cache import get_redis

        user_id = current_user.get("id")
        if not user_id:
            return {"ok": True}

        redis = await get_redis()
        if not redis:
            return {"ok": True}

        # Détection abus — sliding window 10 heartbeats/min max
        from src.services.abuse_detection import HEARTBEAT_MAX, HEARTBEAT_WINDOW, is_rate_limited
        if await is_rate_limited(redis, "ratelimit:heartbeat", user_id, HEARTBEAT_MAX, HEARTBEAT_WINDOW):
            return {"ok": True}  # silencieux, ne pas casser l'UX

        now = int(time.time())
        expire_at = now - 60  # présent = actif dans la dernière minute

        await redis.zadd("presence:all", {user_id: now})
        await redis.zremrangebyscore("presence:all", 0, expire_at)

        page_key = f"presence:page:{body.page}"
        await redis.zadd(page_key, {user_id: now})
        await redis.zremrangebyscore(page_key, 0, expire_at)
        await redis.expire(page_key, 120)

        if body.feature:
            feature_key = f"presence:feature:{body.feature}"
            await redis.zadd(feature_key, {user_id: now})
            await redis.zremrangebyscore(feature_key, 0, expire_at)
            await redis.expire(feature_key, 120)

    except Exception as e:
        logger.warning(f"[presence] heartbeat failed: {e}")

    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# SSE LIVE — admin temps réel
# ──────────────────────────────────────────────────────────────────────────────

async def _get_presence_snapshot() -> dict:
    """Lit les compteurs de présence depuis Redis."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if not redis:
            return {"total": 0, "by_page": {}, "by_feature": {}}

        now = int(time.time())
        expire_at = now - 60

        # Nettoyage global
        await redis.zremrangebyscore("presence:all", 0, expire_at)
        total = await redis.zcard("presence:all")

        # Pages connues
        by_page: dict[str, int] = {}
        pages = ["/jobs", "/dashboard", "/assistant", "/cv-analysis", "/profile", "/pricing"]
        for page in pages:
            key = f"presence:page:{page}"
            await redis.zremrangebyscore(key, 0, expire_at)
            count = await redis.zcard(key)
            if count > 0:
                by_page[page] = count

        # Features connues (compteurs Groq existants)
        by_feature: dict[str, int] = {}
        for feature in ["coach", "cv_analysis", "job_scout"]:
            try:
                val = await redis.get(f"groq:active_{feature}")
                count = int(val or 0)
                if count > 0:
                    by_feature[feature] = count
            except Exception:
                pass

        return {"total": total, "by_page": by_page, "by_feature": by_feature}

    except Exception as e:
        logger.warning(f"[presence] snapshot failed: {e}")
        return {"total": 0, "by_page": {}, "by_feature": {}}


async def _live_event_generator(request: Request) -> AsyncGenerator[dict, None]:
    """Génère les snapshots SSE toutes les 10 secondes."""
    try:
        while True:
            if await request.is_disconnected():
                break

            snapshot = await _get_presence_snapshot()
            payload = json.dumps({"type": "snapshot", "presence": snapshot})
            yield {"event": "message", "data": payload}

            await asyncio.sleep(10)
    except asyncio.CancelledError:
        pass


@presence_router.get("/admin/live")
async def admin_sse_live(
    request: Request,
    token: str | None = None,
):
    """
    SSE endpoint pour l'admin — snapshot présence toutes les 10 secondes.
    Header X-Accel-Buffering: no requis pour Railway/Nginx.
    """
    # Vérifier que c'est un admin via token query param (SSE ne supporte pas les headers)
    if not token:
        return Response(status_code=401)
    try:
        from src.api.deps import get_supabase_anon_client
        from src.api.deps import get_supabase_client as _get_sb
        user_resp = get_supabase_anon_client().auth.get_user(token)
        if not user_resp or not user_resp.user:
            return Response(status_code=401)
        sb = _get_sb()
        profile = sb.table("profiles").select("is_admin").eq("id", user_resp.user.id).single().execute()
        if not profile.data or not profile.data.get("is_admin"):
            return Response(status_code=403)
    except Exception:
        return Response(status_code=401)

    from sse_starlette.sse import EventSourceResponse
    return EventSourceResponse(
        _live_event_generator(request),
        headers={"X-Accel-Buffering": "no"},
    )


# ──────────────────────────────────────────────────────────────────────────────
# FRONTEND TRACKING
# ──────────────────────────────────────────────────────────────────────────────

@tracking_router.post("/event")
async def track_event(
    body: TrackEventRequest,
    authorization: str | None = Header(default=None),
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


# ──────────────────────────────────────────────────────────────────────────────
# BANNER SITE-WIDE
# ──────────────────────────────────────────────────────────────────────────────

_BANNER_KEY = "site:banner"


@banner_router.get("/banner")
async def get_banner():
    """Retourne le banner actif (public, lu côté serveur dans le root layout)."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if not redis:
            return {"active": False}
        raw = await redis.get(_BANNER_KEY)
        if not raw:
            return {"active": False}
        return json.loads(raw)
    except Exception:
        return {"active": False}


@banner_router.post("/admin/banner")
async def set_banner(
    body: BannerRequest,
    current_admin: AdminUserDep,
):
    """Définit ou désactive le banner site-wide (admin uniquement)."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if not redis:
            return {"ok": False, "error": "Redis unavailable"}
        payload = {"text": body.text, "type": body.type, "active": body.active}
        await redis.set(_BANNER_KEY, json.dumps(payload))
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ──────────────────────────────────────────────────────────────────────────────
# MODE MAINTENANCE
# ──────────────────────────────────────────────────────────────────────────────

_MAINTENANCE_KEY = "site:maintenance"


@banner_router.get("/admin/maintenance")
async def get_maintenance_status(current_admin: AdminUserDep):
    """Retourne le statut du mode maintenance."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if not redis:
            return {"active": False}
        val = await redis.get(_MAINTENANCE_KEY)
        return {"active": bool(val)}
    except Exception:
        return {"active": False}


@banner_router.post("/admin/maintenance/enable")
async def enable_maintenance(current_admin: AdminUserDep):
    """Active le mode maintenance."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.set(_MAINTENANCE_KEY, "1")
        return {"ok": True, "active": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@banner_router.post("/admin/maintenance/disable")
async def disable_maintenance(current_admin: AdminUserDep):
    """Désactive le mode maintenance."""
    try:
        from src.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            await redis.delete(_MAINTENANCE_KEY)
        return {"ok": True, "active": False}
    except Exception as e:
        return {"ok": False, "error": str(e)}
