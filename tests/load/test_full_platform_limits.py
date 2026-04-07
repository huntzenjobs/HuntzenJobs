"""
Tests de charge complète — TOUTES les features HuntZen.

Métriques par feature : P50/P95/P99, RPS, success rate, saturation point.
Valide que Redis/ARQ absorbe la charge sans crash 500.

Usage:
    export TEST_AUTH_TOKEN=eyJ...
    pytest tests/load/test_full_platform_limits.py -v -s --timeout=300 \
        --noconftest --override-ini="addopts="
"""

import os, asyncio, time, uuid, statistics
import pytest, httpx
from typing import List, Tuple, Dict

PROD_URL = os.getenv("PROD_URL", "https://huntzenjobs-production.up.railway.app")
TOKEN    = os.getenv("TEST_AUTH_TOKEN", "")

CV_TEXT = (
    "Marie Dupont — Product Manager Senior\n"
    "Lyon | marie.dupont@email.com | +33 6 11 22 33 44\n\n"
    "EXPÉRIENCE:\n"
    "  Head of Product chez ScaleupXYZ (2021-2024) — Roadmap produit, 0→1M users.\n"
    "  Product Manager chez TechCorp (2018-2021) — A/B testing, analytics, Scrum.\n"
    "  Junior PM chez AgencePM (2016-2018) — UX research, wireframes, Figma.\n\n"
    "COMPÉTENCES: Product strategy, Roadmap, JIRA, Figma, SQL, Python, Agile, OKRs.\n\n"
    "FORMATION: Master Management Paris HEC 2016. Licence Économie Sciences Po 2014.\n\n"
    "CERTIFICATIONS: Product School CPO (2022), Google Analytics (2021).\n"
    "LANGUES: Français natif, Anglais C2, Espagnol B2.\n"
)
JOB_DESC = "Product Manager senior, roadmap, data-driven, 5+ ans, Paris."

def H():
    return {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}

def skip_if_no_token():
    if not TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis")

# ─── Core metrics helper ───────────────────────────────────────────────────

async def _timed(coro) -> Tuple:
    t0 = time.monotonic()
    try:
        r = await coro
        return r, (time.monotonic() - t0) * 1000
    except Exception as e:
        return e, (time.monotonic() - t0) * 1000

def metrics(results: List[Tuple], label: str, n: int) -> Dict:
    ms_list, ok, queued, r429, r5xx, r4xx, timeout = [], 0, 0, 0, 0, 0, 0
    status_codes = []
    for r, ms in results:
        ms_list.append(ms)
        if isinstance(r, Exception):
            timeout += 1; continue
        status_codes.append(r.status_code)
        if r.status_code == 200:
            try:
                d = r.json()
                queued += 1 if d.get("queued") else 0
                ok     += 0 if d.get("queued") else 1
            except: ok += 1
        elif r.status_code == 429: r429 += 1
        elif r.status_code >= 500: r5xx += 1
        elif r.status_code >= 400: r4xx += 1

    ms_sorted = sorted(ms_list)
    _n = len(ms_sorted)
    p50 = ms_sorted[int(_n*.50)] if _n else 0
    p95 = ms_sorted[int(_n*.95)] if _n else 0
    p99 = ms_sorted[min(int(_n*.99),_n-1)] if _n else 0
    rps = round(n / (max(ms_list)/1000), 1) if ms_list and max(ms_list) > 0 else 0

    icon = "✅" if r5xx == 0 else "❌"
    print(f"\n{icon} [{label}] {n} users simultanés")
    print(f"   Succès: {ok} sync + {queued} queued | 429: {r429} | 4xx: {r4xx} | 5xx: {r5xx} | timeout: {timeout}")
    print(f"   P50: {p50:.0f}ms | P95: {p95:.0f}ms | P99: {p99:.0f}ms | {rps} req/s")
    return {"ok": ok, "queued": queued, "r429": r429, "r5xx": r5xx, "r4xx": r4xx,
            "timeout": timeout, "p50": p50, "p95": p95, "p99": p99, "rps": rps}


# ══════════════════════════════════════════════════════════════════════════════
# 1. HEALTH / INFRA — baseline réseau Railway
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_01_health_baseline_500_users():
    """GET /health — 500 users. Mesure limite réseau pure Railway."""
    skip_if_no_token()
    N = 500
    async with httpx.AsyncClient(timeout=20.0) as c:
        results = await asyncio.gather(*[_timed(c.get(f"{PROD_URL}/health")) for _ in range(N)])
    m = metrics(results, "/health baseline", N)
    assert m["r5xx"] == 0, f"{m['r5xx']} erreurs 5xx sur {N}"


# ══════════════════════════════════════════════════════════════════════════════
# 2. AUTH — lecture profil simultanée
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_02_auth_me_concurrent():
    """GET /api/auth/me — 100 users. Charge Supabase auth."""
    skip_if_no_token()
    N = 100
    async with httpx.AsyncClient(timeout=15.0) as c:
        results = await asyncio.gather(*[_timed(c.get(f"{PROD_URL}/api/auth/me", headers=H())) for _ in range(N)])
    m = metrics(results, "GET /api/auth/me", N)
    assert m["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 3. COACH CHAT — feature principale, ARQ queue
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_03_coach_chat_progressive():
    """POST /api/coach/chat — paliers 10→25→50→100→150 users."""
    skip_if_no_token()
    print("\n\n[COACH CHAT — charge progressive]")
    for N in [10, 25, 50, 100, 150]:
        async with httpx.AsyncClient(timeout=45.0) as c:
            results = await asyncio.gather(*[
                _timed(c.post(f"{PROD_URL}/api/coach/chat",
                    json={"message": f"Bonjour coach {i}, aide moi pour ma recherche d'emploi.",
                          "session_id": str(uuid.uuid4())}, headers=H()))
                for i in range(N)
            ])
        m = metrics(results, f"coach/chat", N)
        assert m["r5xx"] == 0, f"❌ {m['r5xx']} crash 5xx à {N} users"
        await asyncio.sleep(2)


# ══════════════════════════════════════════════════════════════════════════════
# 4. COACH — endpoints secondaires
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_04_coach_secondary_endpoints():
    """POST /api/coach/training-recommendations + career-plan — 30 users chacun."""
    skip_if_no_token()
    N = 30
    async with httpx.AsyncClient(timeout=45.0) as c:
        # Training recommendations
        r1 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/coach/training-recommendations",
                json={"current_skills": ["Python", "FastAPI"], "target_role": "Lead Dev",
                      "session_id": str(uuid.uuid4())}, headers=H()))
            for _ in range(N)
        ])
        m1 = metrics(r1, "coach/training-recommendations", N)

        await asyncio.sleep(2)

        # Career plan
        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/coach/career-plan",
                json={"current_role": "Dev Python", "target_role": "CTO",
                      "session_id": str(uuid.uuid4())}, headers=H()))
            for _ in range(N)
        ])
        m2 = metrics(r2, "coach/career-plan", N)

    assert m1["r5xx"] == 0
    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 5. ASSISTANTS — tous les types
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_05_all_assistants_concurrent():
    """Tous les assistants (job-scout, cv-analyzer, interview-sim) — 30 users chacun."""
    skip_if_no_token()
    N = 30
    async with httpx.AsyncClient(timeout=45.0) as c:
        for assistant_type, msg in [
            ("job-scout",     "Trouve moi des offres Python senior à Paris"),
            ("cv-analyzer",   "Analyse mon CV"),
            ("interview-sim", "Prépare moi pour un entretien Product Manager"),
        ]:
            results = await asyncio.gather(*[
                _timed(c.post(f"{PROD_URL}/api/assistant/{assistant_type}",
                    json={"message": msg, "session_id": str(uuid.uuid4()),
                          "assistant_type": assistant_type}, headers=H()))
                for _ in range(N)
            ])
            m = metrics(results, f"assistant/{assistant_type}", N)
            assert m["r5xx"] == 0, f"❌ {m['r5xx']} crash sur {assistant_type}"
            await asyncio.sleep(2)


# ══════════════════════════════════════════════════════════════════════════════
# 6. CV ADAPTER — feature la plus lourde
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_06_cv_adapter_progressive():
    """POST /api/cv-adapter/adapt — paliers 10→25→50→75 users."""
    skip_if_no_token()
    print("\n\n[CV ADAPTER — charge progressive]")
    for N in [10, 25, 50, 75]:
        async with httpx.AsyncClient(timeout=90.0) as c:
            results = await asyncio.gather(*[
                _timed(c.post(f"{PROD_URL}/api/cv-adapter/adapt",
                    data={"cv_text": CV_TEXT, "job_description": JOB_DESC,
                          "language": "fr", "template": "ats"}, headers=H()))
                for _ in range(N)
            ])
        m = metrics(results, "cv-adapter/adapt", N)
        assert m["r5xx"] == 0, f"❌ {m['r5xx']} crash 5xx à {N} users"
        await asyncio.sleep(3)


# ══════════════════════════════════════════════════════════════════════════════
# 7. CV ADAPTER — endpoints secondaires
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_07_cv_adapter_cover_letter_and_templates():
    """Cover letter JSON + templates — 25 users chacun."""
    skip_if_no_token()
    N = 25
    async with httpx.AsyncClient(timeout=60.0) as c:
        # Templates (GET léger)
        r1 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/cv-adapter/templates", headers=H()))
            for _ in range(N)
        ])
        metrics(r1, "cv-adapter/templates (GET)", N)

        await asyncio.sleep(1)

        # Cover letter JSON
        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/cv-adapter/generate-cover-letter/json",
                json={"cv_data": {"full_name": "Marie Dupont", "email": "marie@email.com",
                                  "phone": "+33611223344", "skills": ["Python", "FastAPI"],
                                  "experience": [{"company": "TechCorp", "role": "PM", "duration": "3 ans"}]},
                      "job_description": JOB_DESC, "language": "fr"}, headers=H()))
            for _ in range(N)
        ])
        m2 = metrics(r2, "cv-adapter/generate-cover-letter/json", N)

    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 8. JOBS SEARCH — multi-sources (Adzuna, France Travail)
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_08_jobs_search_progressive():
    """POST /api/jobs/search — paliers 10→25→50→100 users."""
    skip_if_no_token()
    print("\n\n[JOBS SEARCH — charge progressive]")
    for N in [10, 25, 50, 100]:
        async with httpx.AsyncClient(timeout=30.0) as c:
            results = await asyncio.gather(*[
                _timed(c.post(f"{PROD_URL}/api/jobs/search",
                    json={"job_title": "Product Manager", "country_code": "fr", "city": "Paris"},
                    headers=H()))
                for _ in range(N)
            ])
        m = metrics(results, "jobs/search", N)
        assert m["r5xx"] == 0, f"❌ {m['r5xx']} crash 5xx à {N} users"
        await asyncio.sleep(2)


# ══════════════════════════════════════════════════════════════════════════════
# 9. JOBS — endpoints secondaires
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_09_jobs_secondary():
    """Market insights + analyze-query + job-fairs — 30 users chacun."""
    skip_if_no_token()
    N = 30
    async with httpx.AsyncClient(timeout=30.0) as c:
        r1 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/jobs/market-insights", headers=H()))
            for _ in range(N)
        ])
        metrics(r1, "jobs/market-insights", N)

        await asyncio.sleep(1)

        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/jobs/analyze-query",
                json={"query": "développeur python senior Paris CDI"}, headers=H()))
            for _ in range(N)
        ])
        m2 = metrics(r2, "jobs/analyze-query", N)

        await asyncio.sleep(1)

        r3 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/job-fairs/search?sector=tech&region=ile-de-france", headers=H()))
            for _ in range(N)
        ])
        m3 = metrics(r3, "job-fairs/search", N)

    assert m2["r5xx"] == 0
    assert m3["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 10. SAVED JOBS — CRUD concurrent
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_10_saved_jobs_crud():
    """GET + POST /api/saved-jobs — 50 users simultanés."""
    skip_if_no_token()
    N = 50
    async with httpx.AsyncClient(timeout=15.0) as c:
        r1 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/saved-jobs", headers=H()))
            for _ in range(N)
        ])
        m1 = metrics(r1, "saved-jobs GET", N)

        await asyncio.sleep(1)

        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/saved-jobs",
                json={"external_job_id": f"job-load-test-{i}", "title": "Load Test Job",
                      "company": "TestCo", "location": "Paris", "url": "https://example.com",
                      "source": "test", "country_code": "fr"}, headers=H()))
                for i in range(N)
        ])
        m2 = metrics(r2, "saved-jobs POST", N)

    assert m1["r5xx"] == 0
    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 11. APPLICATIONS TRACKER
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_11_applications_crud():
    """GET + POST /api/applications — 50 users."""
    skip_if_no_token()
    N = 50
    async with httpx.AsyncClient(timeout=15.0) as c:
        r1 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/applications", headers=H()))
            for _ in range(N)
        ])
        m1 = metrics(r1, "applications GET", N)

        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/applications",
                json={"job_title": f"Dev Python {i}", "company": "TestCo",
                      "status": "applied", "applied_at": "2026-03-15"}, headers=H()))
            for i in range(N)
        ])
        m2 = metrics(r2, "applications POST", N)

    assert m1["r5xx"] == 0
    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 12. DOCUMENTS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_12_documents():
    """GET /api/documents — 50 users."""
    skip_if_no_token()
    N = 50
    async with httpx.AsyncClient(timeout=15.0) as c:
        results = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/documents", headers=H()))
            for _ in range(N)
        ])
    m = metrics(results, "documents GET", N)
    assert m["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 13. CAREER SCORE
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_13_career_score():
    """GET + POST /api/career-score — 50 users."""
    skip_if_no_token()
    N = 50
    async with httpx.AsyncClient(timeout=30.0) as c:
        r1 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/career-score", headers=H()))
            for _ in range(N)
        ])
        m1 = metrics(r1, "career-score GET", N)

        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/career-score/xp-event",
                json={"event_type": "cv_uploaded", "points": 10}, headers=H()))
            for _ in range(N)
        ])
        m2 = metrics(r2, "career-score/xp-event POST", N)

    assert m1["r5xx"] == 0
    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 14. REFERRALS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_14_referrals():
    """GET /api/referrals/my-code + boost-status — 50 users."""
    skip_if_no_token()
    N = 50
    async with httpx.AsyncClient(timeout=15.0) as c:
        r1 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/referrals/my-code", headers=H()))
            for _ in range(N)
        ])
        m1 = metrics(r1, "referrals/my-code GET", N)

        r2 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/referrals/boost-status", headers=H()))
            for _ in range(N)
        ])
        m2 = metrics(r2, "referrals/boost-status GET", N)

    assert m1["r5xx"] == 0
    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 15. BRANDING ASSISTANT
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_15_branding_chat():
    """POST /api/branding/chat — 30 users."""
    skip_if_no_token()
    N = 30
    async with httpx.AsyncClient(timeout=45.0) as c:
        results = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/branding/chat",
                json={"message": "Aide moi à améliorer mon profil LinkedIn",
                      "session_id": str(uuid.uuid4())}, headers=H()))
            for _ in range(N)
        ])
    m = metrics(results, "branding/chat", N)
    assert m["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 16. SUBSCRIPTION & STRIPE (lecture seule)
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_16_subscription_reads():
    """GET /api/subscription/current — 100 users."""
    skip_if_no_token()
    N = 100
    async with httpx.AsyncClient(timeout=15.0) as c:
        results = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/subscription/current", headers=H()))
            for _ in range(N)
        ])
    m = metrics(results, "subscription/current GET", N)
    assert m["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 17. QUEUE / REDIS — stabilité sous charge
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_17_queue_stats_under_full_load():
    """
    50 coach + 50 cv-adapter + 50 queue/all-stats simultanés.
    Redis doit répondre < 500ms sous charge totale.
    """
    skip_if_no_token()
    N = 50
    async with httpx.AsyncClient(timeout=90.0) as c:
        coach = [_timed(c.post(f"{PROD_URL}/api/coach/chat",
            json={"message": f"Redis test {i}", "session_id": str(uuid.uuid4())},
            headers=H())) for i in range(N)]
        cv = [_timed(c.post(f"{PROD_URL}/api/cv-adapter/adapt",
            data={"cv_text": CV_TEXT, "job_description": JOB_DESC, "language": "fr", "template": "ats"},
            headers=H())) for _ in range(N)]
        queue = [_timed(c.get(f"{PROD_URL}/api/queue/all-stats", headers=H()))
                 for _ in range(N)]

        all_r = await asyncio.gather(*(coach + cv + queue))

    m_coach = metrics(all_r[:N],    "coach sous charge totale", N)
    m_cv    = metrics(all_r[N:2*N], "cv-adapter sous charge totale", N)
    m_queue = metrics(all_r[2*N:],  "queue/all-stats sous charge totale", N)

    assert m_coach["r5xx"] == 0, f"Coach: {m_coach['r5xx']} crashes"
    assert m_cv["r5xx"]    == 0, f"CV: {m_cv['r5xx']} crashes"
    assert m_queue["r5xx"] == 0, f"Queue: {m_queue['r5xx']} crashes"
    assert m_queue["p95"]  < 500, f"Redis trop lent: P95={m_queue['p95']:.0f}ms > 500ms"


# ══════════════════════════════════════════════════════════════════════════════
# 18. SUPPORT
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_18_support():
    """GET /api/support/tickets/me + POST /api/support/chatbot — 30 users."""
    skip_if_no_token()
    N = 30
    async with httpx.AsyncClient(timeout=30.0) as c:
        r1 = await asyncio.gather(*[
            _timed(c.get(f"{PROD_URL}/api/support/tickets/me", headers=H()))
            for _ in range(N)
        ])
        m1 = metrics(r1, "support/tickets/me GET", N)

        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/support/chatbot",
                json={"message": "Comment changer mon abonnement ?"}, headers=H()))
            for _ in range(N)
        ])
        m2 = metrics(r2, "support/chatbot POST", N)

    assert m1["r5xx"] == 0
    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 19. RECRUITER FINDER + INSIDER FINDER
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_19_recruiter_and_insider_finder():
    """POST /api/recruiter-finder/find + insider-finder/find — 20 users chacun."""
    skip_if_no_token()
    N = 20
    async with httpx.AsyncClient(timeout=30.0) as c:
        r1 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/recruiter-finder/find",
                json={"company_name": "Google", "location": "Paris"}, headers=H()))
            for _ in range(N)
        ])
        m1 = metrics(r1, "recruiter-finder/find", N)

        r2 = await asyncio.gather(*[
            _timed(c.post(f"{PROD_URL}/api/insider-finder/find",
                json={"company_name": "Amazon", "target_role": "Software Engineer"}, headers=H()))
            for _ in range(N)
        ])
        m2 = metrics(r2, "insider-finder/find", N)

    assert m1["r5xx"] == 0
    assert m2["r5xx"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 20. TEST FINAL — PLATEFORME COMPLÈTE 200 USERS SIMULTANÉS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_20_full_platform_200_users():
    """
    🔥 TEST FINAL : 200 users simultanés — TOUTES les features en même temps.

    Répartition réaliste :
      60  coach/chat
      30  assistant/job-scout
      30  cv-adapter/adapt
      25  jobs/search
      20  saved-jobs GET
      15  queue/all-stats
      10  auth/me
      10  career-score GET

    CRITÈRE : 0 erreur 500/502/503 sur 200 requêtes.
    ARQ + Redis doivent absorber sans aucun crash.
    """
    skip_if_no_token()
    print("\n\n" + "="*70)
    print("  🔥 TEST FINAL — 200 USERS SIMULTANÉS — TOUTES FEATURES")
    print("="*70)

    async with httpx.AsyncClient(timeout=90.0) as c:
        batch = [
            # 60 coach
            *[_timed(c.post(f"{PROD_URL}/api/coach/chat",
                json={"message": f"Final load test {i}", "session_id": str(uuid.uuid4())},
                headers=H())) for i in range(60)],
            # 30 job-scout
            *[_timed(c.post(f"{PROD_URL}/api/assistant/job-scout",
                json={"message": "Scout final test", "session_id": str(uuid.uuid4()),
                      "assistant_type": "job-scout"}, headers=H())) for _ in range(30)],
            # 30 cv-adapter
            *[_timed(c.post(f"{PROD_URL}/api/cv-adapter/adapt",
                data={"cv_text": CV_TEXT, "job_description": JOB_DESC,
                      "language": "fr", "template": "ats"}, headers=H())) for _ in range(30)],
            # 25 jobs/search
            *[_timed(c.post(f"{PROD_URL}/api/jobs/search",
                json={"job_title": "Python developer", "country_code": "fr"},
                headers=H())) for _ in range(25)],
            # 20 saved-jobs
            *[_timed(c.get(f"{PROD_URL}/api/saved-jobs", headers=H())) for _ in range(20)],
            # 15 queue stats
            *[_timed(c.get(f"{PROD_URL}/api/queue/all-stats", headers=H())) for _ in range(15)],
            # 10 auth/me
            *[_timed(c.get(f"{PROD_URL}/api/auth/me", headers=H())) for _ in range(10)],
            # 10 career-score
            *[_timed(c.get(f"{PROD_URL}/api/career-score", headers=H())) for _ in range(10)],
        ]
        all_r = await asyncio.gather(*batch)

    idx = 0
    slices = [("coach/chat",        60),
              ("assistant/job-scout",30),
              ("cv-adapter/adapt",  30),
              ("jobs/search",        25),
              ("saved-jobs GET",     20),
              ("queue/all-stats",    15),
              ("auth/me",            10),
              ("career-score GET",   10)]

    total_5xx = 0
    for label, n in slices:
        m = metrics(all_r[idx:idx+n], label, n)
        total_5xx += m["r5xx"]
        idx += n

    m_all = metrics(all_r, "PLATEFORME COMPLÈTE", 200)

    print(f"\n{'='*70}")
    print(f"  VERDICT FINAL : {total_5xx} erreurs 5xx sur 200 requêtes simultanées")
    if total_5xx == 0:
        print("  ✅ SYSTÈME STABLE — Redis/ARQ absorbe 200 users sans crash")
    else:
        print("  ❌ BUGS DÉTECTÉS — voir Sentry pour les stack traces")
    print(f"  P95 global : {m_all['p95']:.0f}ms | Débit : {m_all['rps']} req/s")
    print("="*70 + "\n")

    assert total_5xx == 0, (
        f"❌ {total_5xx} erreurs 500/502/503 sur 200 users simultanés — "
        f"vérifier Sentry: sentry-cli issues list --query 'lastSeen:>-5m'"
    )
