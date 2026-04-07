"""
Tests de saturation réelle — limites simultanées par fonctionnalité.

OBJECTIF : Trouver le point de saturation de chaque feature sous charge croissante.
           Valider que Redis/ARQ absorbe les pics sans crash 500.

Lancez avec :
    export TEST_AUTH_TOKEN=eyJ...
    export PROD_URL=https://huntzenjobs-production.up.railway.app
    pytest tests/load/test_saturation_limits.py -v --timeout=300 -s

Résultats affichés :
    - Requêtes/sec
    - P50 / P95 / P99 latence
    - Taux de succès / queue / 429 / 500
    - Point de saturation (premier 500 ou P95 > seuil)
"""

import os
import asyncio
import time
import uuid
import statistics
import pytest
import httpx
from typing import List, Dict, Tuple

PROD_URL = os.getenv("PROD_URL", "https://huntzenjobs-production.up.railway.app")
AUTH_TOKEN = os.getenv("TEST_AUTH_TOKEN", "")

CV_TEXT = (
    "Jean Dupont — Développeur Python Senior\n"
    "Paris | jean.dupont@email.com | +33 6 12 34 56 78\n\n"
    "EXPÉRIENCE:\n"
    "  Lead Dev Python chez TechSAS (2020-2024) — FastAPI, PostgreSQL, Docker, CI/CD.\n"
    "  Backend Engineer chez StartupXYZ (2018-2020) — Django, Redis, RabbitMQ.\n\n"
    "COMPÉTENCES: Python, FastAPI, Django, Redis, Docker, AWS, PostgreSQL, SQLAlchemy.\n\n"
    "FORMATION: Master Informatique Paris-Saclay 2018. Licence Informatique Paris 7 2016.\n\n"
    "CERTIFICATIONS: AWS Solutions Architect (2022), Docker Certified Associate (2021).\n"
)

JOB_DESC = "Dev Python senior, FastAPI, SQLAlchemy, Docker, 5+ ans expérience."


def headers():
    return {"Authorization": f"Bearer {AUTH_TOKEN}"} if AUTH_TOKEN else {}


# ── Utilitaires ──────────────────────────────────────────────────────────────

async def _timed_request(coro) -> Tuple[object, float]:
    t0 = time.monotonic()
    try:
        result = await coro
        return result, (time.monotonic() - t0) * 1000
    except Exception as e:
        return e, (time.monotonic() - t0) * 1000


def _stats(responses_with_timings: List[Tuple]) -> Dict:
    timings, success, queued, rate_429, errors_5xx, timeouts, errors_4xx = [], 0, 0, 0, 0, 0, 0

    for resp, ms in responses_with_timings:
        timings.append(ms)
        if isinstance(resp, Exception):
            timeouts += 1
            continue
        code = resp.status_code
        if code == 200:
            try:
                data = resp.json()
                if data.get("queued"):
                    queued += 1
                else:
                    success += 1
            except Exception:
                success += 1
        elif code == 429:
            rate_429 += 1
        elif code in (500, 503, 502):
            errors_5xx += 1
        elif 400 <= code < 500:
            errors_4xx += 1

    sorted_t = sorted(timings)
    n = len(sorted_t)
    return {
        "total": len(responses_with_timings),
        "success": success,
        "queued": queued,
        "rate_429": rate_429,
        "errors_5xx": errors_5xx,
        "errors_4xx": errors_4xx,
        "timeouts": timeouts,
        "rps": round(len(timings) / (max(timings) / 1000), 1) if timings else 0,
        "p50_ms": round(sorted_t[int(n * 0.50)]) if n else 0,
        "p95_ms": round(sorted_t[int(n * 0.95)]) if n else 0,
        "p99_ms": round(sorted_t[min(int(n * 0.99), n - 1)]) if n else 0,
        "success_rate_pct": round((success + queued) / max(len(timings), 1) * 100, 1),
    }


def _print_stats(label: str, n: int, s: Dict):
    ok_icon = "✅" if s["errors_5xx"] == 0 else "❌"
    print(f"\n{'─'*60}")
    print(f"  {ok_icon}  {label} — {n} utilisateurs simultanés")
    print(f"{'─'*60}")
    print(f"  Succès        : {s['success']} sync + {s['queued']} queued  ({s['success_rate_pct']}%)")
    print(f"  429 rate-limit: {s['rate_429']}")
    print(f"  4xx user err  : {s['errors_4xx']}")
    print(f"  500/502/503   : {s['errors_5xx']}  ← BUGS RÉELS")
    print(f"  Timeouts réseau: {s['timeouts']}")
    print(f"  Latence P50   : {s['p50_ms']}ms")
    print(f"  Latence P95   : {s['p95_ms']}ms")
    print(f"  Latence P99   : {s['p99_ms']}ms")
    print(f"  Débit         : {s['rps']} req/s")


# ── Tests par feature ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.load
async def test_saturation_health_check():
    """
    BASELINE : /health sous charge massive (200 users).
    Doit absorber 200/200 sans aucun 500. Mesure la limite Railway HTTP.
    """
    if not AUTH_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

    N = 200
    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [_timed_request(client.get(f"{PROD_URL}/health")) for _ in range(N)]
        results = await asyncio.gather(*tasks)

    s = _stats(results)
    _print_stats("/health (baseline)", N, s)
    assert s["errors_5xx"] == 0, f"❌ {s['errors_5xx']} erreurs 5xx sur {N} requêtes /health"
    assert s["success_rate_pct"] >= 95, f"❌ Taux succès trop bas: {s['success_rate_pct']}%"


@pytest.mark.asyncio
@pytest.mark.load
async def test_saturation_coach_progressive():
    """
    COACH : Charge progressive 10 → 25 → 50 → 100 users simultanés.
    Trouve le point de saturation ARQ (quand P95 explose ou 500 apparaît).
    """
    if not AUTH_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

    print(f"\n\n{'='*60}")
    print("  SATURATION COACH /api/coach/chat — charge progressive")
    print(f"{'='*60}")

    for N in [10, 25, 50, 100]:
        async with httpx.AsyncClient(timeout=45.0) as client:
            tasks = [
                _timed_request(client.post(
                    f"{PROD_URL}/api/coach/chat",
                    json={"message": f"Test saturation {i}", "session_id": str(uuid.uuid4())},
                    headers=headers(),
                ))
                for i in range(N)
            ]
            results = await asyncio.gather(*tasks)

        s = _stats(results)
        _print_stats("coach/chat", N, s)
        assert s["errors_5xx"] == 0, f"❌ {s['errors_5xx']} erreurs 5xx à {N} users simultanés"
        await asyncio.sleep(2)  # laisser Railway respirer entre paliers


@pytest.mark.asyncio
@pytest.mark.load
async def test_saturation_cv_adapter_progressive():
    """
    CV ADAPTER (texte) : 10 → 25 → 50 → 75 users.
    Feature la plus lourde (Groq 70B). Valide que ARQ queue absorbe.
    """
    if not AUTH_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

    print(f"\n\n{'='*60}")
    print("  SATURATION CV ADAPTER /api/cv-adapter/adapt — charge progressive")
    print(f"{'='*60}")

    for N in [10, 25, 50, 75]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            tasks = [
                _timed_request(client.post(
                    f"{PROD_URL}/api/cv-adapter/adapt",
                    data={"cv_text": CV_TEXT, "job_description": JOB_DESC, "language": "fr", "template": "ats"},
                    headers=headers(),
                ))
                for _ in range(N)
            ]
            results = await asyncio.gather(*tasks)

        s = _stats(results)
        _print_stats("cv-adapter/adapt", N, s)
        assert s["errors_5xx"] == 0, f"❌ {s['errors_5xx']} erreurs 5xx à {N} users simultanés"
        await asyncio.sleep(3)


@pytest.mark.asyncio
@pytest.mark.load
async def test_saturation_jobs_search_progressive():
    """
    JOBS SEARCH : 10 → 25 → 50 → 100 users.
    Valide le circuit breaker Adzuna/France Travail sous charge.
    """
    if not AUTH_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

    print(f"\n\n{'='*60}")
    print("  SATURATION JOBS SEARCH /api/jobs/search — charge progressive")
    print(f"{'='*60}")

    for N in [10, 25, 50, 100]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [
                _timed_request(client.post(
                    f"{PROD_URL}/api/jobs/search",
                    json={"job_title": "Développeur Python", "country_code": "fr", "city": "Paris"},
                    headers=headers(),
                ))
                for _ in range(N)
            ]
            results = await asyncio.gather(*tasks)

        s = _stats(results)
        _print_stats("jobs/search", N, s)
        assert s["errors_5xx"] == 0, f"❌ {s['errors_5xx']} erreurs 5xx à {N} users simultanés"
        await asyncio.sleep(2)


@pytest.mark.asyncio
@pytest.mark.load
async def test_saturation_queue_stats_under_load():
    """
    QUEUE STATS : Valide que Redis/ARQ répond sous charge simultanée coach+queue.
    50 coach + 50 polls /api/queue/all-stats en même temps.
    """
    if not AUTH_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

    print(f"\n\n{'='*60}")
    print("  SATURATION QUEUE — 50 coach + 50 queue/all-stats simultanés")
    print(f"{'='*60}")

    async with httpx.AsyncClient(timeout=45.0) as client:
        coach_tasks = [
            _timed_request(client.post(
                f"{PROD_URL}/api/coach/chat",
                json={"message": "Queue test", "session_id": str(uuid.uuid4())},
                headers=headers(),
            ))
            for _ in range(50)
        ]
        queue_tasks = [
            _timed_request(client.get(f"{PROD_URL}/api/queue/all-stats", headers=headers()))
            for _ in range(50)
        ]
        all_results = await asyncio.gather(*(coach_tasks + queue_tasks))

    coach_results = all_results[:50]
    queue_results = all_results[50:]

    s_coach = _stats(coach_results)
    s_queue = _stats(queue_results)

    _print_stats("coach/chat (sous charge queue)", 50, s_coach)
    _print_stats("queue/all-stats (simultané coach)", 50, s_queue)

    assert s_coach["errors_5xx"] == 0, f"❌ Coach: {s_coach['errors_5xx']} erreurs 5xx"
    assert s_queue["errors_5xx"] == 0, f"❌ Queue stats: {s_queue['errors_5xx']} erreurs 5xx"
    # Redis doit répondre en < 1s même sous charge
    assert s_queue["p95_ms"] < 1000, f"❌ Redis/queue stats trop lent: P95={s_queue['p95_ms']}ms"


@pytest.mark.asyncio
@pytest.mark.load
async def test_saturation_assistant_progressive():
    """
    ASSISTANTS (job-scout, interview-coach) : 10 → 25 → 50 users.
    """
    if not AUTH_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

    print(f"\n\n{'='*60}")
    print("  SATURATION ASSISTANTS /api/assistant/job-scout — charge progressive")
    print(f"{'='*60}")

    for N in [10, 25, 50]:
        async with httpx.AsyncClient(timeout=45.0) as client:
            tasks = [
                _timed_request(client.post(
                    f"{PROD_URL}/api/assistant/job-scout",
                    json={"message": f"Test scout {i}", "session_id": str(uuid.uuid4()), "assistant_type": "job-scout"},
                    headers=headers(),
                ))
                for i in range(N)
            ]
            results = await asyncio.gather(*tasks)

        s = _stats(results)
        _print_stats("assistant/job-scout", N, s)
        assert s["errors_5xx"] == 0, f"❌ {s['errors_5xx']} erreurs 5xx à {N} users"
        await asyncio.sleep(2)


@pytest.mark.asyncio
@pytest.mark.load
async def test_saturation_full_platform_150_users():
    """
    TEST FINAL : 150 users simultanés sur TOUTES les features en même temps.

    Répartition réaliste d'un pic de trafic :
      - 50 coach (chat)
      - 30 job-scout (assistant)
      - 30 cv-adapter (texte)
      - 20 jobs/search
      - 20 queue/all-stats (monitoring)

    CRITÈRE : 0 erreur 500/502/503 — ARQ/Redis absorbe tout.
    """
    if not AUTH_TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

    print(f"\n\n{'='*60}")
    print("  🔥 TEST FINAL — 150 users simultanés toutes features")
    print(f"{'='*60}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        coach = [
            _timed_request(client.post(
                f"{PROD_URL}/api/coach/chat",
                json={"message": f"Full load {i}", "session_id": str(uuid.uuid4())},
                headers=headers(),
            ))
            for i in range(50)
        ]
        scout = [
            _timed_request(client.post(
                f"{PROD_URL}/api/assistant/job-scout",
                json={"message": f"Scout {i}", "session_id": str(uuid.uuid4()), "assistant_type": "job-scout"},
                headers=headers(),
            ))
            for i in range(30)
        ]
        cv = [
            _timed_request(client.post(
                f"{PROD_URL}/api/cv-adapter/adapt",
                data={"cv_text": CV_TEXT, "job_description": JOB_DESC, "language": "fr", "template": "ats"},
                headers=headers(),
            ))
            for _ in range(30)
        ]
        jobs = [
            _timed_request(client.post(
                f"{PROD_URL}/api/jobs/search",
                json={"job_title": "Développeur Python", "country_code": "fr"},
                headers=headers(),
            ))
            for _ in range(20)
        ]
        queue = [
            _timed_request(client.get(f"{PROD_URL}/api/queue/all-stats", headers=headers()))
            for _ in range(20)
        ]

        all_results = await asyncio.gather(*(coach + scout + cv + jobs + queue))

    # Découper les résultats par feature
    i = 0
    r_coach = all_results[i:i+50];  i += 50
    r_scout = all_results[i:i+30];  i += 30
    r_cv    = all_results[i:i+30];  i += 30
    r_jobs  = all_results[i:i+20];  i += 20
    r_queue = all_results[i:i+20]

    s_coach = _stats(r_coach)
    s_scout = _stats(r_scout)
    s_cv    = _stats(r_cv)
    s_jobs  = _stats(r_jobs)
    s_queue = _stats(r_queue)
    s_all   = _stats(all_results)

    _print_stats("coach/chat (50)", 50, s_coach)
    _print_stats("assistant/job-scout (30)", 30, s_scout)
    _print_stats("cv-adapter/adapt (30)", 30, s_cv)
    _print_stats("jobs/search (20)", 20, s_jobs)
    _print_stats("queue/all-stats (20)", 20, s_queue)

    print(f"\n{'='*60}")
    print("  📊 RÉSUMÉ GLOBAL — 150 users simultanés")
    _print_stats("PLATEFORME COMPLÈTE", 150, s_all)
    print(f"{'='*60}\n")

    # Critère : AUCUN crash 500
    total_5xx = s_coach["errors_5xx"] + s_scout["errors_5xx"] + s_cv["errors_5xx"] + s_jobs["errors_5xx"] + s_queue["errors_5xx"]
    assert total_5xx == 0, (
        f"❌ {total_5xx} erreurs 5xx sur 150 requêtes simultanées\n"
        f"  Coach: {s_coach['errors_5xx']}, Scout: {s_scout['errors_5xx']}, "
        f"CV: {s_cv['errors_5xx']}, Jobs: {s_jobs['errors_5xx']}, Queue: {s_queue['errors_5xx']}"
    )
