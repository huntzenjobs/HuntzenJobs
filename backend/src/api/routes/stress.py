"""
Stress Test Routes — HuntZen Admin
====================================
POST   /api/admin/stress/run              Lance un test (ARQ)
DELETE /api/admin/stress/run/{run_id}     Annule un test en cours
GET    /api/admin/stress/stream/{run_id}  SSE métriques live
GET    /api/admin/stress/runs             Historique paginé
GET    /api/admin/stress/runs/{run_id}    Détail complet
"""
import asyncio
import json
import logging
from typing import Optional, AsyncGenerator, List

from fastapi import APIRouter, Request, Response, Query
from pydantic import BaseModel, Field

from src.api.deps import AdminUserDep, get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter()

PREDEFINED_SCENARIOS = [
    {
        "id": "baseline_50",
        "name": "Baseline 50",
        "concurrency": 50,
        "duration_sec": 60,
        "ramp_up_sec": 10,
        "features": ["auth", "jobs", "coach"],
        "description": "Test de base — 50 users simultanés",
    },
    {
        "id": "coach_stress_200",
        "name": "Coach Stress 200",
        "concurrency": 200,
        "duration_sec": 120,
        "ramp_up_sec": 30,
        "features": ["coach"],
        "description": "Stress test coach IA — 200 users",
    },
    {
        "id": "cv_stress_100",
        "name": "CV Stress 100",
        "concurrency": 100,
        "duration_sec": 90,
        "ramp_up_sec": 20,
        "features": ["cv_analysis"],
        "description": "Stress test analyse CV — 100 users",
    },
    {
        "id": "auth_spike_300",
        "name": "Auth Spike 300",
        "concurrency": 300,
        "duration_sec": 60,
        "ramp_up_sec": 10,
        "features": ["auth"],
        "description": "Spike d'authentification — 300 users",
    },
    {
        "id": "full_platform_500",
        "name": "Full Platform 500",
        "concurrency": 500,
        "duration_sec": 120,
        "ramp_up_sec": 45,
        "features": ["auth", "jobs", "coach", "cv_analysis"],
        "description": "Test plateforme complète — 500 users",
    },
]


class StressRunRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    concurrency: int = Field(..., ge=1, le=500)
    duration_sec: int = Field(..., ge=10, le=600)
    ramp_up_sec: int = Field(default=0, ge=0, le=120)
    features: List[str] = Field(..., min_length=1)


# ──────────────────────────────────────────────────────────────────────────────
# LANCER UN TEST
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/scenarios")
async def list_scenarios(admin: AdminUserDep):
    """Retourne les scénarios pré-définis."""
    return {"scenarios": PREDEFINED_SCENARIOS}


@router.post("/run")
async def start_stress_run(
    admin: AdminUserDep,
    body: StressRunRequest,
) -> dict:
    """Lance un stress test via ARQ (queue dédiée stress_test)."""
    from arq import create_pool
    from src.workers.stress_settings import _get_redis_settings
    from src.utils.cache import get_redis

    supabase = get_supabase_client()

    # Vérifier qu'il n'y a pas déjà un run en cours
    running = supabase.table("stress_test_runs").select("id").eq("status", "running").execute()
    if running.data:
        return Response(
            content=json.dumps({"detail": "Un test est déjà en cours"}),
            status_code=409,
            media_type="application/json",
        )

    # Créer le run en DB
    run_data = supabase.table("stress_test_runs").insert({
        "name": body.name,
        "status": "pending",
        "started_by_user_id": admin.get("id"),
        "config": {
            "concurrency": body.concurrency,
            "duration_sec": body.duration_sec,
            "ramp_up_sec": body.ramp_up_sec,
            "features": body.features,
        },
    }).execute()

    if not run_data.data:
        return Response(status_code=500)

    run_id = run_data.data[0]["id"]

    # Récupérer le token admin pour les requêtes auth
    redis = await get_redis()
    token = admin.get("_token")

    # Enqueue dans ARQ queue stress_test
    try:
        pool = await create_pool(_get_redis_settings())
        await pool.enqueue_job(
            "stress_test_task",
            run_id=run_id,
            name=body.name,
            concurrency=body.concurrency,
            duration_sec=body.duration_sec,
            ramp_up_sec=body.ramp_up_sec,
            features=body.features,
            token=token,
            _queue_name="stress_test",
        )
        await pool.close()
    except Exception as e:
        logger.error(f"[stress] ARQ enqueue failed: {e}")
        supabase.table("stress_test_runs").update({"status": "failed"}).eq("id", run_id).execute()
        return Response(status_code=500)

    return {"run_id": run_id, "status": "pending"}


# ──────────────────────────────────────────────────────────────────────────────
# ANNULER UN TEST
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/run/{run_id}")
async def cancel_stress_run(
    admin: AdminUserDep,
    run_id: str,
) -> dict:
    """Annule un test en cours via Redis cancel signal."""
    from src.utils.cache import redis_set_cancel

    supabase = get_supabase_client()
    await redis_set_cancel(run_id)

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    supabase.table("stress_test_runs").update({
        "status": "cancelled",
        "completed_at": now_iso,
        "updated_at": now_iso,
    }).eq("id", run_id).eq("status", "running").execute()

    return {"ok": True, "run_id": run_id}


# ──────────────────────────────────────────────────────────────────────────────
# SSE STREAM
# ──────────────────────────────────────────────────────────────────────────────

async def _stress_sse_generator(
    request: Request,
    run_id: str,
) -> AsyncGenerator[dict, None]:
    """Souscrit au channel Redis stress:{run_id} et yield les métriques."""
    from src.utils.cache import get_redis

    redis = await get_redis()
    if not redis:
        return

    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(f"stress:{run_id}")

        async for message in pubsub.listen():
            if await request.is_disconnected():
                break

            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    yield {"event": "message", "data": json.dumps(data)}
                    # Arrêter si le worker signale la fin
                    if data.get("type") == "done":
                        break
                except Exception:
                    pass

    except asyncio.CancelledError:
        pass
    finally:
        try:
            await pubsub.unsubscribe(f"stress:{run_id}")
            await pubsub.close()
        except Exception:
            pass


@router.get("/stream/{run_id}")
async def stress_sse_stream(
    request: Request,
    run_id: str,
    token: Optional[str] = None,
):
    """SSE endpoint — métriques live d'un stress test."""
    if not token:
        return Response(status_code=401)
    try:
        from src.api.deps import get_supabase_anon_client, get_supabase_client as _get_sb
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
        _stress_sse_generator(request, run_id),
        headers={"X-Accel-Buffering": "no"},
    )


# ──────────────────────────────────────────────────────────────────────────────
# HISTORIQUE
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/runs")
async def list_stress_runs(
    admin: AdminUserDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Liste paginée des stress test runs (sans timeseries pour alléger)."""
    supabase = get_supabase_client()
    offset = (page - 1) * page_size

    result = supabase.table("stress_test_runs").select(
        "id, name, status, config, total_requests, successful, failed, "
        "avg_response_ms, p95_response_ms, p99_response_ms, max_response_ms, "
        "started_by_user_id, created_at, completed_at"
    ).order("created_at", desc=True).range(offset, offset + page_size - 1).execute()

    return {"runs": result.data or [], "page": page, "page_size": page_size}


@router.get("/runs/{run_id}")
async def get_stress_run(
    admin: AdminUserDep,
    run_id: str,
) -> dict:
    """Détail complet d'un run (avec timeseries pour les courbes)."""
    supabase = get_supabase_client()

    result = supabase.table("stress_test_runs").select("*").eq("id", run_id).single().execute()
    if not result.data:
        return Response(status_code=404)

    return result.data
