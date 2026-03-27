"""
Stress Test Worker — HuntZen
============================
Tâche ARQ dédiée à la queue "stress_test".
Lance des requêtes HTTP concurrentes contre les endpoints prod,
agrège les métriques toutes les 500ms et les publie via Redis pub/sub.

Lancement worker dédié Railway :
    python -m arq src.workers.stress_settings.StressWorkerSettings
"""
import asyncio
import json
import os
import statistics
import time
from typing import Any

import aiohttp

from src.utils.logger import get_logger

logger = get_logger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Endpoints testables par feature
FEATURE_ENDPOINTS = {
    "auth": {
        "method": "GET",
        "path": "/api/health/ping",
        "body": None,
        "auth": False,
    },
    "jobs": {
        "method": "GET",
        "path": "/api/jobs/search?q=developpeur&country=FR&limit=5",
        "body": None,
        "auth": True,
    },
    "coach": {
        "method": "POST",
        "path": "/api/coach/message",
        "body": {"message": "stress_test ping", "session_id": "stress-test", "language": "fr"},
        "auth": True,
    },
    "cv_analysis": {
        "method": "GET",
        "path": "/api/cv-analysis/status/stress-test-fake-id",
        "body": None,
        "auth": True,
    },
}


def _percentile(data: list[float], p: int) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * p / 100)
    return sorted_data[min(idx, len(sorted_data) - 1)]


async def _make_request(
    session: aiohttp.ClientSession,
    feature: str,
    token: str | None,
    results: list,
) -> None:
    """Fait une requête pour une feature et enregistre le résultat."""
    cfg = FEATURE_ENDPOINTS.get(feature, FEATURE_ENDPOINTS["auth"])
    url = f"{BACKEND_URL}{cfg['path']}"
    headers = {}
    if cfg["auth"] and token:
        headers["Authorization"] = f"Bearer {token}"

    start = time.monotonic()
    success = False
    try:
        if cfg["method"] == "GET":
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                success = resp.status < 500
        else:
            async with session.post(url, headers=headers, json=cfg["body"], timeout=aiohttp.ClientTimeout(total=10)) as resp:
                success = resp.status < 500
    except Exception:
        success = False

    elapsed_ms = (time.monotonic() - start) * 1000
    results.append({"feature": feature, "ms": elapsed_ms, "ok": success})


async def stress_test_task(
    ctx: dict,
    run_id: str,
    name: str,
    concurrency: int,
    duration_sec: int,
    ramp_up_sec: int,
    features: list[str],
    token: str | None = None,
) -> dict:
    """
    Tâche ARQ principale du stress test.
    Publie les métriques sur Redis channel stress:{run_id} toutes les 500ms.
    """
    from src.api.deps import get_supabase_client
    from src.utils.cache import get_redis, redis_check_cancel, redis_publish

    supabase = get_supabase_client()
    redis = await get_redis()

    # Marquer comme running en DB
    try:
        supabase.table("stress_test_runs").update({
            "status": "running",
            "updated_at": "now()",
        }).eq("id", run_id).execute()
    except Exception as e:
        logger.error(f"[stress] DB update running failed: {e}")

    metrics_timeseries = []
    total_ok = 0
    total_fail = 0
    start_time = time.monotonic()

    connector = aiohttp.TCPConnector(limit=min(concurrency + 10, 200))
    async with aiohttp.ClientSession(connector=connector) as session:
        tick_number = 0

        while True:
            tick_start = time.monotonic()
            elapsed = tick_start - start_time

            # Vérifier annulation
            if await redis_check_cancel(run_id):
                logger.info(f"[stress] run {run_id} cancelled")
                status = "cancelled"
                break

            # Vérifier durée
            if elapsed >= duration_sec:
                status = "completed"
                break

            # Calculer nb users actifs (ramp-up progressif)
            if ramp_up_sec > 0 and elapsed < ramp_up_sec:
                active_users = max(1, int(concurrency * elapsed / ramp_up_sec))
            else:
                active_users = concurrency

            # Lancer les requêtes concurrentes
            tick_results: list[dict] = []
            tasks = []
            for i in range(active_users):
                feature = features[i % len(features)]
                tasks.append(_make_request(session, feature, token, tick_results))

            await asyncio.gather(*tasks, return_exceptions=True)

            # Agréger
            latencies = [r["ms"] for r in tick_results]
            ok_count = sum(1 for r in tick_results if r["ok"])
            fail_count = len(tick_results) - ok_count
            total_ok += ok_count
            total_fail += fail_count

            # Stats par feature
            feature_stats: dict[str, Any] = {}
            for feat in features:
                feat_results = [r for r in tick_results if r["feature"] == feat]
                feature_stats[feat] = {
                    "active": len(feat_results),
                    "req_s": len(feat_results) * 2,  # tick toutes les 500ms → ×2
                    "errors": sum(1 for r in feat_results if not r["ok"]),
                }

            # ARQ queue depth
            arq_depth = 0
            if redis:
                try:
                    arq_depth = int(await redis.llen("arq:queue:default") or 0)
                except Exception:
                    pass

            snapshot = {
                "ts": int(time.time()),
                "elapsed_sec": int(elapsed),
                "req_per_sec": len(tick_results) * 2,
                "active_users": active_users,
                "latency": {
                    "p50": round(_percentile(latencies, 50), 1),
                    "p95": round(_percentile(latencies, 95), 1),
                    "p99": round(_percentile(latencies, 99), 1),
                    "max": round(max(latencies) if latencies else 0, 1),
                },
                "error_rate": round(fail_count / max(len(tick_results), 1), 4),
                "features": feature_stats,
                "infra": {"arq_queue_depth": arq_depth},
            }

            metrics_timeseries.append(snapshot)
            await redis_publish(f"stress:{run_id}", snapshot)

            tick_number += 1

            # Attendre jusqu'à la prochaine tick (500ms)
            elapsed_tick = time.monotonic() - tick_start
            sleep_time = max(0, 0.5 - elapsed_tick)
            await asyncio.sleep(sleep_time)

    # Calcul stats finales
    all_latencies = []
    for snap in metrics_timeseries:
        # approximation depuis p95 de chaque tick
        all_latencies.append(snap["latency"]["p95"])

    final_p95 = round(_percentile(all_latencies, 95), 1) if all_latencies else 0
    final_p99 = round(_percentile(all_latencies, 99), 1) if all_latencies else 0
    final_avg = round(statistics.mean(all_latencies), 1) if all_latencies else 0
    final_max = round(max(s["latency"]["max"] for s in metrics_timeseries), 1) if metrics_timeseries else 0

    # Persister en DB
    try:
        supabase.table("stress_test_runs").update({
            "status": status,
            "total_requests": total_ok + total_fail,
            "successful": total_ok,
            "failed": total_fail,
            "avg_response_ms": final_avg,
            "p95_response_ms": final_p95,
            "p99_response_ms": final_p99,
            "max_response_ms": final_max,
            "metrics_timeseries": json.dumps(metrics_timeseries),
            "completed_at": "now()",
            "updated_at": "now()",
        }).eq("id", run_id).execute()
    except Exception as e:
        logger.error(f"[stress] DB update final failed: {e}")

    # Signal de fin sur le channel SSE
    await redis_publish(f"stress:{run_id}", {"type": "done", "status": status})

    return {"run_id": run_id, "status": status, "total": total_ok + total_fail}
