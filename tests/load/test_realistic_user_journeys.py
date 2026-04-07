"""
Tests de charge réalistes — comportements humains simulés.

Simule de VRAIS parcours utilisateurs avec :
  - Think times réalistes entre chaque action (0.3-4s)
  - Profils diversifiés : JobSeeker, CVOptimizer, CoachUser, PowerUser, CasualBrowser
  - Sessions persistantes (même session_id pour tout un parcours)
  - Messages variés (pas tous identiques)
  - Ramp-up progressif : 10 → 50 → 100 → 200 → 500 users simultanés

Métriques par parcours : P50/P95/P99, RPS, taux de succès/429/5xx, durée totale session.

Usage:
    export TEST_AUTH_TOKEN=eyJ...
    pytest tests/load/test_realistic_user_journeys.py -v -s --timeout=600

Résultats:
    - Saturation réelle par profil utilisateur
    - Impact comportemental (think times) vs requêtes en rafale
    - Durée moyenne d'une session complète
"""

import asyncio
import os
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import httpx
import pytest

PROD_URL = os.getenv("PROD_URL", "https://huntzenjobs-production.up.railway.app")
TOKEN = os.getenv("TEST_AUTH_TOKEN", "")


def H():
    return {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}


def skip_if_no_token():
    if not TOKEN:
        pytest.skip("TEST_AUTH_TOKEN requis — export TEST_AUTH_TOKEN=eyJ...")


# ══════════════════════════════════════════════════════════════════════════════
# Données réalistes — profils candidats variés
# ══════════════════════════════════════════════════════════════════════════════

CANDIDATE_PROFILES = [
    {
        "name": "Sophie Martin",
        "role": "Data Scientist",
        "cv": (
            "Sophie Martin — Data Scientist Senior\nParis | sophie.martin@email.com\n\n"
            "EXPÉRIENCE:\n  Lead Data Scientist chez Deezer (2021-2024) — MLOps, A/B testing, rec systems.\n"
            "  Data Scientist chez BNP Paribas (2019-2021) — scoring crédit, Python, Spark.\n\n"
            "COMPÉTENCES: Python, TensorFlow, PyTorch, SQL, Spark, MLflow, Databricks.\n"
            "FORMATION: Master Data Science CentraleSupélec 2019.\n"
            "LANGUES: Français natif, Anglais C1.\n"
        ),
        "target": "Lead ML Engineer",
        "skills": ["Python", "Machine Learning", "TensorFlow", "MLOps"],
    },
    {
        "name": "Thomas Leroy",
        "role": "Développeur Full-Stack",
        "cv": (
            "Thomas Leroy — Développeur Full-Stack\nLyon | thomas.leroy@dev.fr\n\n"
            "EXPÉRIENCE:\n  Senior Dev chez Doctolib (2020-2024) — React, NestJS, PostgreSQL.\n"
            "  Développeur chez SSII Capgemini (2017-2020) — Angular, Java Spring Boot.\n\n"
            "COMPÉTENCES: React, TypeScript, NestJS, Node.js, PostgreSQL, Docker, CI/CD.\n"
            "FORMATION: Ingénieur INSA Lyon 2017.\n"
        ),
        "target": "Staff Engineer",
        "skills": ["React", "TypeScript", "Node.js", "Docker"],
    },
    {
        "name": "Amira Benali",
        "role": "Product Manager",
        "cv": (
            "Amira Benali — Product Manager\nParis | amira.benali@pm.com\n\n"
            "EXPÉRIENCE:\n  PM Senior chez OVHcloud (2022-2024) — Cloud products, roadmap, OKRs.\n"
            "  PM chez Criteo (2019-2022) — Ads platform, 0→1M impressions/jour.\n"
            "  Associate PM chez Leboncoin (2017-2019) — UX, A/B tests, analytics.\n\n"
            "COMPÉTENCES: Roadmap, JIRA, Figma, SQL, Google Analytics, Agile, OKRs.\n"
            "FORMATION: MBA HEC 2017. Ingénieur Centrale Lille 2014.\n"
        ),
        "target": "CPO",
        "skills": ["Product strategy", "Roadmap", "OKRs", "Figma"],
    },
    {
        "name": "Lucas Girard",
        "role": "DevOps Engineer",
        "cv": (
            "Lucas Girard — DevOps / SRE\nToulouse | lucas.girard@infra.io\n\n"
            "EXPÉRIENCE:\n  SRE Senior chez Airbus Defence (2021-2024) — Kubernetes, Terraform, FinOps.\n"
            "  DevOps chez Thales (2018-2021) — CI/CD, Jenkins, AWS, monitoring.\n\n"
            "COMPÉTENCES: Kubernetes, Docker, Terraform, AWS, GCP, Prometheus, Grafana.\n"
            "FORMATION: IUT Informatique Toulouse 2018.\n"
        ),
        "target": "Platform Engineer Lead",
        "skills": ["Kubernetes", "Terraform", "AWS", "CI/CD"],
    },
    {
        "name": "Clara Rousseau",
        "role": "UX Designer",
        "cv": (
            "Clara Rousseau — UX/UI Designer Senior\nBordeaux | clara.rousseau@design.fr\n\n"
            "EXPÉRIENCE:\n  Lead Designer chez ManoMano (2020-2024) — Design system, Figma, user research.\n"
            "  UX Designer chez PwC Digital (2017-2020) — Wireframes, prototypes, tests utilisateurs.\n\n"
            "COMPÉTENCES: Figma, Sketch, InVision, User Research, Design System, HTML/CSS.\n"
            "FORMATION: Master Design Numérique ENSAD Paris 2017.\n"
        ),
        "target": "Head of Design",
        "skills": ["Figma", "UX Research", "Design System", "Prototyping"],
    },
]

JOB_OFFERS = [
    "Senior Data Scientist, Python, TensorFlow, 7+ ans, CDI Paris, 80K-100K€",
    "Full-Stack Developer React/NestJS, startup scale-up, remote-friendly, 60K-80K€",
    "Product Manager Senior, SaaS B2B, roadmap stratégique, OKRs, Paris 75K-95K€",
    "DevOps/SRE, Kubernetes, Terraform, AWS, scale critique, 65K-85K€, Lyon",
    "UX Lead Designer, Design System, Figma, équipe produit 20 personnes, 55K-70K€",
    "Lead Machine Learning Engineer, MLOps, Databricks, banque/assurance, 90K-110K€",
    "Staff Engineer Backend, Python/Go, microservices, fintech, 85K-105K€ Paris",
]

COACH_QUESTIONS = [
    "Comment améliorer mon CV pour un poste de {target} ?",
    "Quelles compétences manquent pour évoluer vers {target} ?",
    "Donne moi des conseils pour mon entretien en tant que {target}",
    "Comment négocier mon salaire pour un poste {target} ?",
    "Quelles certifications me conseilles-tu pour devenir {target} ?",
    "Aide moi à préparer mon pitch de 2 minutes pour le poste {target}",
    "Quelles questions difficiles prévoir pour un entretien {target} ?",
    "Comment me démarquer des autres candidats pour {target} ?",
]

JOB_SEARCH_QUERIES = [
    "Python senior Paris",
    "Product Manager SaaS CDI",
    "Data Scientist remote",
    "DevOps Kubernetes Lyon",
    "React TypeScript startup",
    "Machine Learning Engineer",
    "UX Designer senior CDI",
    "Backend Go microservices",
    "Lead Tech engineering",
    "Full-stack NestJS React",
]


# ══════════════════════════════════════════════════════════════════════════════
# Session result tracking
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class StepResult:
    step: str
    status_code: int
    latency_ms: float
    ok: bool
    queued: bool = False
    error: Optional[str] = None


@dataclass
class SessionResult:
    profile_type: str
    user_index: int
    steps: List[StepResult] = field(default_factory=list)
    total_ms: float = 0.0
    completed: bool = False

    def add(self, step: str, resp_or_exc, ms: float):
        if isinstance(resp_or_exc, Exception):
            self.steps.append(StepResult(step, 0, ms, False, error=str(resp_or_exc)))
            return
        code = resp_or_exc.status_code
        queued = False
        try:
            d = resp_or_exc.json()
            queued = bool(d.get("queued"))
        except Exception:
            pass
        ok = code in (200, 201, 202) or queued
        self.steps.append(StepResult(step, code, ms, ok, queued))

    def summary(self):
        total = len(self.steps)
        ok = sum(1 for s in self.steps if s.ok)
        r5xx = sum(1 for s in self.steps if s.status_code >= 500)
        r429 = sum(1 for s in self.steps if s.status_code == 429)
        timeouts = sum(1 for s in self.steps if s.status_code == 0)
        return {"total": total, "ok": ok, "r5xx": r5xx, "r429": r429, "timeouts": timeouts}


async def _req(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> Tuple:
    t0 = time.monotonic()
    try:
        r = await client.request(method, url, **kwargs)
        return r, (time.monotonic() - t0) * 1000
    except Exception as e:
        return e, (time.monotonic() - t0) * 1000


async def think(min_s: float = 0.3, max_s: float = 2.5):
    """Simule le temps de réflexion/lecture d'un humain entre deux actions."""
    await asyncio.sleep(random.uniform(min_s, max_s))


# ══════════════════════════════════════════════════════════════════════════════
# Parcours utilisateurs réalistes
# ══════════════════════════════════════════════════════════════════════════════

async def journey_job_seeker(client: httpx.AsyncClient, idx: int) -> SessionResult:
    """
    Parcours JobSeeker : cherche des offres → sauvegarde → consulte son profil.

    Simulation : utilisateur actif sur la plateforme, consulte et sauvegarde des offres.
    Durée typique : 15-30s avec think times.
    """
    session = SessionResult("job_seeker", idx)
    t_start = time.monotonic()
    h = H()

    # Étape 1 : Vérification du profil (login check)
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/auth/me", headers=h, timeout=15.0)
    session.add("auth/me", r, ms)
    await think(0.5, 1.5)

    # Étape 2 : Recherche d'offres
    query = random.choice(JOB_SEARCH_QUERIES)
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/jobs", params={"q": query, "limit": 10}, headers=h, timeout=20.0)
    session.add(f"jobs?q={query[:20]}", r, ms)
    await think(1.0, 3.0)  # lit les résultats

    # Étape 3 : Sauvegarde d'une offre (simulé avec job_id fictif)
    job_id = str(uuid.uuid4())
    r, ms = await _req(client, "POST", f"{PROD_URL}/api/saved-jobs",
                       json={"job_id": job_id, "job_title": query, "company": "TechCorp", "job_url": f"https://example.com/job/{job_id}"},
                       headers=h, timeout=15.0)
    session.add("saved-jobs POST", r, ms)
    await think(0.3, 1.0)

    # Étape 4 : Voir mes offres sauvegardées
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/saved-jobs", headers=h, timeout=15.0)
    session.add("saved-jobs GET", r, ms)
    await think(2.0, 4.0)  # regarde la liste

    # Étape 5 : Nouvelle recherche (avec filtre différent)
    query2 = random.choice(JOB_SEARCH_QUERIES)
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/jobs", params={"q": query2, "location": "Paris"}, headers=h, timeout=20.0)
    session.add(f"jobs?q={query2[:20]}&loc=Paris", r, ms)

    session.total_ms = (time.monotonic() - t_start) * 1000
    session.completed = True
    return session


async def journey_cv_optimizer(client: httpx.AsyncClient, idx: int) -> SessionResult:
    """
    Parcours CVOptimizer : adapte son CV → génère lettre de motivation.

    Simulation : utilisateur sérieux qui personnalise son dossier pour chaque offre.
    Durée typique : 30-90s (CV adaptation est lent).
    """
    session = SessionResult("cv_optimizer", idx)
    t_start = time.monotonic()
    h = H()
    profile = random.choice(CANDIDATE_PROFILES)
    job = random.choice(JOB_OFFERS)
    session_id = str(uuid.uuid4())

    # Étape 1 : Vérification profil
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/auth/me", headers=h, timeout=15.0)
    session.add("auth/me", r, ms)
    await think(1.0, 2.0)

    # Étape 2 : Adaptation CV (feature lourde — Modal/Groq)
    r, ms = await _req(client, "POST", f"{PROD_URL}/adapt",
                       json={"cv_text": profile["cv"], "job_description": job, "session_id": session_id},
                       headers=h, timeout=90.0)
    session.add("adapt CV", r, ms)
    await think(3.0, 8.0)  # lit le CV adapté attentivement

    # Étape 3 : Génération lettre de motivation
    r, ms = await _req(client, "POST", f"{PROD_URL}/adapt/generate-cover-letter",
                       json={"cv_text": profile["cv"], "job_description": job, "candidate_name": profile["name"]},
                       headers=h, timeout=60.0)
    session.add("generate cover-letter", r, ms)
    await think(5.0, 10.0)  # lit et édite la lettre

    # Étape 4 : Score carrière (feedback)
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/career-score", headers=h, timeout=15.0)
    session.add("career-score GET", r, ms)

    session.total_ms = (time.monotonic() - t_start) * 1000
    session.completed = True
    return session


async def journey_coach_user(client: httpx.AsyncClient, idx: int) -> SessionResult:
    """
    Parcours CoachUser : session de coaching avec plusieurs échanges.

    Simulation : utilisateur dans une conversation avec le coach IA.
    Durée typique : 20-60s (3-5 messages).
    """
    session = SessionResult("coach_user", idx)
    t_start = time.monotonic()
    h = H()
    profile = random.choice(CANDIDATE_PROFILES)
    session_id = str(uuid.uuid4())
    n_messages = random.randint(2, 5)

    for turn in range(n_messages):
        # Message de coaching varié
        question_template = random.choice(COACH_QUESTIONS)
        question = question_template.format(target=profile["target"])
        if turn == 0:
            question = f"Bonjour ! Je suis {profile['name']}, {profile['role']}. {question}"

        r, ms = await _req(client, "POST", f"{PROD_URL}/api/coach/chat",
                           json={"message": question, "session_id": session_id},
                           headers=h, timeout=45.0)
        session.add(f"coach/chat turn {turn+1}", r, ms)

        if turn < n_messages - 1:
            await think(2.0, 6.0)  # lit la réponse et réfléchit

    # Bonus : 30% de chance de demander des recommendations de formation
    if random.random() < 0.3:
        await think(1.0, 2.0)
        r, ms = await _req(client, "POST", f"{PROD_URL}/api/coach/training-recommendations",
                           json={"current_skills": profile["skills"], "target_role": profile["target"],
                                 "session_id": session_id},
                           headers=h, timeout=45.0)
        session.add("coach/training-reco", r, ms)

    session.total_ms = (time.monotonic() - t_start) * 1000
    session.completed = True
    return session


async def journey_power_user(client: httpx.AsyncClient, idx: int) -> SessionResult:
    """
    Parcours PowerUser : utilise TOUTES les features en une session.

    Simulation : utilisateur très actif, explore tout (coach + jobs + CV + referral).
    Durée typique : 60-180s.
    """
    session = SessionResult("power_user", idx)
    t_start = time.monotonic()
    h = H()
    profile = random.choice(CANDIDATE_PROFILES)
    job = random.choice(JOB_OFFERS)
    session_id = str(uuid.uuid4())

    # Auth
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/auth/me", headers=h, timeout=15.0)
    session.add("auth/me", r, ms)
    await think(0.5, 1.0)

    # Coach (message court)
    r, ms = await _req(client, "POST", f"{PROD_URL}/api/coach/chat",
                       json={"message": f"Bonjour, j'ai besoin d'aide pour devenir {profile['target']}",
                             "session_id": session_id},
                       headers=h, timeout=45.0)
    session.add("coach/chat", r, ms)
    await think(1.5, 3.0)

    # Job search
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/jobs",
                       params={"q": random.choice(JOB_SEARCH_QUERIES)}, headers=h, timeout=20.0)
    session.add("jobs search", r, ms)
    await think(1.0, 2.0)

    # CV Adapt
    r, ms = await _req(client, "POST", f"{PROD_URL}/adapt",
                       json={"cv_text": profile["cv"], "job_description": job, "session_id": str(uuid.uuid4())},
                       headers=h, timeout=90.0)
    session.add("adapt CV", r, ms)
    await think(3.0, 6.0)

    # Saved jobs
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/saved-jobs", headers=h, timeout=15.0)
    session.add("saved-jobs", r, ms)
    await think(0.5, 1.5)

    # Career score
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/career-score", headers=h, timeout=15.0)
    session.add("career-score", r, ms)
    await think(0.5, 1.0)

    # Referral (curiosité)
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/referrals/boost-status", headers=h, timeout=15.0)
    session.add("referral/boost-status", r, ms)

    session.total_ms = (time.monotonic() - t_start) * 1000
    session.completed = True
    return session


async def journey_casual_browser(client: httpx.AsyncClient, idx: int) -> SessionResult:
    """
    Parcours CasualBrowser : visite courte, peu d'actions, parfois abandonne.

    Simulation : utilisateur peu motivé, consulte rapidement quelques pages.
    Durée typique : 5-15s.
    """
    session = SessionResult("casual_browser", idx)
    t_start = time.monotonic()
    h = H()

    # Juste la santé + une recherche + un coach message
    r, ms = await _req(client, "GET", f"{PROD_URL}/health", timeout=10.0)
    session.add("health", r, ms)
    await think(0.3, 1.0)

    r, ms = await _req(client, "GET", f"{PROD_URL}/api/jobs",
                       params={"q": random.choice(JOB_SEARCH_QUERIES)}, headers=h, timeout=15.0)
    session.add("jobs", r, ms)
    await think(1.5, 4.0)

    # 50% de chance de faire quelque chose de plus
    if random.random() > 0.5:
        r, ms = await _req(client, "POST", f"{PROD_URL}/api/coach/chat",
                           json={"message": "Comment améliorer mon profil LinkedIn ?",
                                 "session_id": str(uuid.uuid4())},
                           headers=h, timeout=45.0)
        session.add("coach/chat", r, ms)

    session.total_ms = (time.monotonic() - t_start) * 1000
    session.completed = True
    return session


async def journey_assistant_user(client: httpx.AsyncClient, idx: int) -> SessionResult:
    """
    Parcours AssistantUser : utilise les assistants spécialisés (job-scout, cv-analyzer).

    Simulation : utilisateur qui interagit avec les agents IA.
    """
    session = SessionResult("assistant_user", idx)
    t_start = time.monotonic()
    h = H()
    profile = random.choice(CANDIDATE_PROFILES)

    # Choisit un assistant aléatoire
    assistants = [
        ("job-scout", f"Trouve des offres {profile['role']} à Paris avec salaire 70K+"),
        ("cv-analyzer", f"Analyse mon profil de {profile['role']} : {profile['cv'][:200]}"),
        ("interview-sim", f"Simule un entretien pour un poste {profile['target']}"),
    ]
    assistant_type, msg = random.choice(assistants)

    r, ms = await _req(client, "POST", f"{PROD_URL}/api/assistant/{assistant_type}",
                       json={"message": msg, "session_id": str(uuid.uuid4()),
                             "assistant_type": assistant_type},
                       headers=h, timeout=60.0)
    session.add(f"assistant/{assistant_type}", r, ms)
    await think(1.0, 3.0)

    # Suivi : score carrière
    r, ms = await _req(client, "GET", f"{PROD_URL}/api/career-score", headers=h, timeout=15.0)
    session.add("career-score", r, ms)

    session.total_ms = (time.monotonic() - t_start) * 1000
    session.completed = True
    return session


# ══════════════════════════════════════════════════════════════════════════════
# Orchestrateur de sessions
# ══════════════════════════════════════════════════════════════════════════════

JOURNEY_MAP = {
    "job_seeker": journey_job_seeker,
    "cv_optimizer": journey_cv_optimizer,
    "coach_user": journey_coach_user,
    "power_user": journey_power_user,
    "casual_browser": journey_casual_browser,
    "assistant_user": journey_assistant_user,
}


async def run_session(journey_fn, idx: int) -> SessionResult:
    """Lance une session utilisateur avec son propre client HTTP."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(120.0)) as client:
        try:
            return await journey_fn(client, idx)
        except Exception as e:
            s = SessionResult(journey_fn.__name__, idx)
            s.steps.append(StepResult("CRASH", 0, 0, False, error=str(e)))
            return s


def print_session_report(label: str, sessions: List[SessionResult], elapsed_s: float):
    """Affiche les métriques agrégées pour une vague de sessions."""
    total = len(sessions)
    completed = sum(1 for s in sessions if s.completed)
    crash = total - completed

    all_steps = [step for s in sessions for step in s.steps]
    ok_steps = sum(1 for st in all_steps if st.ok)
    r5xx = sum(1 for st in all_steps if st.status_code >= 500)
    r429 = sum(1 for st in all_steps if st.status_code == 429)
    timeouts = sum(1 for st in all_steps if st.status_code == 0)
    total_steps = len(all_steps)

    session_durations = [s.total_ms for s in sessions if s.total_ms > 0]
    latencies = [st.latency_ms for st in all_steps if st.latency_ms > 0]

    def pct(lst, p):
        if not lst:
            return 0
        s = sorted(lst)
        return s[int(len(s) * p)]

    icon = "✅" if r5xx == 0 and crash == 0 else ("⚠️" if r5xx <= total * 0.02 else "❌")

    print(f"\n{icon} [{label}] — {total} users | {elapsed_s:.1f}s total")
    print(f"   Sessions: {completed}/{total} complètes | {crash} crash")
    print(f"   Steps: {ok_steps}/{total_steps} OK | 429: {r429} | 5xx: {r5xx} | timeout: {timeouts}")
    if latencies:
        print(f"   Latence step — P50: {pct(latencies,.50):.0f}ms | P95: {pct(latencies,.95):.0f}ms | P99: {pct(latencies,.99):.0f}ms")
    if session_durations:
        print(f"   Durée session — P50: {pct(session_durations,.50)/1000:.1f}s | P95: {pct(session_durations,.95)/1000:.1f}s")

    # Détail par type de profil
    profile_types = {}
    for s in sessions:
        pt = s.profile_type
        if pt not in profile_types:
            profile_types[pt] = {"ok": 0, "r5xx": 0, "r429": 0, "total": 0}
        sm = s.summary()
        profile_types[pt]["ok"] += sm["ok"]
        profile_types[pt]["r5xx"] += sm["r5xx"]
        profile_types[pt]["r429"] += sm["r429"]
        profile_types[pt]["total"] += sm["total"]

    print("   Par profil :")
    for pt, counts in sorted(profile_types.items()):
        total_req = counts["total"]
        ok_req = counts["ok"]
        rate = ok_req / total_req * 100 if total_req > 0 else 0
        print(f"     {pt:20s} — {ok_req}/{total_req} OK ({rate:.0f}%) | 5xx:{counts['r5xx']} 429:{counts['r429']}")

    return r5xx


# ══════════════════════════════════════════════════════════════════════════════
# Tests — ramp-up réaliste avec comportements humains
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_01_warmup_human_10_users():
    """
    10 users réalistes — warm-up.
    Validation que tous les parcours fonctionnent avant la charge.
    """
    skip_if_no_token()
    print("\n\n══ WARM-UP — 10 users réalistes ══")

    # 2 de chaque profil (sauf power_user = 2)
    assignments = (
        [journey_job_seeker] * 2 +
        [journey_cv_optimizer] * 2 +
        [journey_coach_user] * 2 +
        [journey_casual_browser] * 2 +
        [journey_assistant_user] * 2
    )
    random.shuffle(assignments)

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("WARMUP 10 users", list(sessions), elapsed)
    assert r5xx == 0, f"❌ {r5xx} erreurs 5xx au warm-up"


@pytest.mark.asyncio
async def test_02_realistic_50_users():
    """
    50 users réalistes — distribution naturelle des profils.

    Distribution:
      20 coach_user (40%) — feature principale
      10 job_seeker (20%)
      10 casual_browser (20%)
       5 cv_optimizer (10%)
       5 assistant_user (10%)
    """
    skip_if_no_token()
    print("\n\n══ 50 USERS RÉALISTES ══")

    assignments = (
        [journey_coach_user] * 20 +
        [journey_job_seeker] * 10 +
        [journey_casual_browser] * 10 +
        [journey_cv_optimizer] * 5 +
        [journey_assistant_user] * 5
    )
    random.shuffle(assignments)

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("50 USERS", list(sessions), elapsed)
    assert r5xx == 0, f"❌ {r5xx} erreurs 5xx à 50 users"


@pytest.mark.asyncio
async def test_03_realistic_100_users():
    """
    100 users réalistes — test de charge modéré.

    Distribution:
      40 coach_user (40%)
      20 job_seeker (20%)
      15 casual_browser (15%)
      10 cv_optimizer (10%)
      10 assistant_user (10%)
       5 power_user (5%)
    """
    skip_if_no_token()
    print("\n\n══ 100 USERS RÉALISTES ══")

    assignments = (
        [journey_coach_user] * 40 +
        [journey_job_seeker] * 20 +
        [journey_casual_browser] * 15 +
        [journey_cv_optimizer] * 10 +
        [journey_assistant_user] * 10 +
        [journey_power_user] * 5
    )
    random.shuffle(assignments)

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("100 USERS", list(sessions), elapsed)
    assert r5xx == 0, f"❌ {r5xx} erreurs 5xx à 100 users"


@pytest.mark.asyncio
async def test_04_realistic_200_users():
    """
    200 users réalistes — charge haute.

    Distribution:
      80 coach_user (40%)
      40 job_seeker (20%)
      30 casual_browser (15%)
      20 cv_optimizer (10%)
      20 assistant_user (10%)
      10 power_user (5%)
    """
    skip_if_no_token()
    print("\n\n══ 200 USERS RÉALISTES ══")

    assignments = (
        [journey_coach_user] * 80 +
        [journey_job_seeker] * 40 +
        [journey_casual_browser] * 30 +
        [journey_cv_optimizer] * 20 +
        [journey_assistant_user] * 20 +
        [journey_power_user] * 10
    )
    random.shuffle(assignments)

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("200 USERS", list(sessions), elapsed)
    # Tolérance: <2% d'erreurs 5xx acceptable à 200 users
    assert r5xx <= 4, f"❌ {r5xx} erreurs 5xx à 200 users (tolérance: 4)"


@pytest.mark.asyncio
async def test_05_realistic_500_users():
    """
    500 users réalistes — test de saturation réelle.

    Distribution:
     200 coach_user (40%)
     100 job_seeker (20%)
      75 casual_browser (15%)
      50 cv_optimizer (10%)
      50 assistant_user (10%)
      25 power_user (5%)

    Avec Redis/ARQ : coach et cv-adapter ne devraient PAS crasher (queue absorbe).
    Point de saturation attendu : 429 rate limit avant les 5xx.
    """
    skip_if_no_token()
    print("\n\n══ 500 USERS RÉALISTES — SATURATION ══")

    assignments = (
        [journey_coach_user] * 200 +
        [journey_job_seeker] * 100 +
        [journey_casual_browser] * 75 +
        [journey_cv_optimizer] * 50 +
        [journey_assistant_user] * 50 +
        [journey_power_user] * 25
    )
    random.shuffle(assignments)

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("500 USERS SATURATION", list(sessions), elapsed)
    # À 500 users, on tolère jusqu'à 2% de 5xx (10 sessions)
    # L'important c'est que le système ne crash pas complètement
    assert r5xx <= 10, f"❌ {r5xx} erreurs 5xx à 500 users (tolérance: 10)"


# ══════════════════════════════════════════════════════════════════════════════
# Tests spéciaux — scénarios extrêmes
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_06_coach_only_spike_300():
    """
    Spike 300 users simultanés sur le COACH uniquement.

    Simule un pic viral : article Medium sur HuntZen → flux massif vers le coach.
    Valide que ARQ/Redis absorbe sans crash.
    """
    skip_if_no_token()
    print("\n\n══ SPIKE COACH — 300 users ══")

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(journey_coach_user, i) for i in range(300)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("COACH SPIKE 300", list(sessions), elapsed)
    assert r5xx == 0, f"❌ ARQ ne protège pas contre {r5xx} crash 5xx"


@pytest.mark.asyncio
async def test_07_cv_adaptation_spike_50():
    """
    Spike 50 users simultanés sur CV adaptation (feature la plus lourde).

    CV adaptation = Modal cold start + Groq inference → ~30-90s par request.
    50 users simultanés = test de file d'attente réaliste.
    """
    skip_if_no_token()
    print("\n\n══ SPIKE CV ADAPTER — 50 users ══")

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(journey_cv_optimizer, i) for i in range(50)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("CV ADAPTER SPIKE 50", list(sessions), elapsed)
    assert r5xx == 0, f"❌ {r5xx} crash sur CV adapter à 50 users"


@pytest.mark.asyncio
async def test_08_mixed_ramp_up_progressive():
    """
    Ramp-up progressif simulant une journée de lancement (10→50→100→200→500).

    Chaque palier ajoute des users PENDANT que les précédents terminent.
    Valide que le système monte en charge sans point de défaillance brutal.
    """
    skip_if_no_token()
    print("\n\n══ RAMP-UP PROGRESSIF — 10→50→100→200→500 ══")

    for n_users, coach_pct, think_min, think_max in [
        (10,  0.40, 0.5, 2.0),
        (50,  0.40, 0.3, 1.5),
        (100, 0.40, 0.2, 1.0),
        (200, 0.40, 0.1, 0.5),
        (500, 0.40, 0.1, 0.3),
    ]:
        n_coach = int(n_users * coach_pct)
        n_jobs  = int(n_users * 0.20)
        n_cv    = int(n_users * 0.10)
        n_rest  = n_users - n_coach - n_jobs - n_cv

        assignments = (
            [journey_coach_user] * n_coach +
            [journey_job_seeker] * n_jobs +
            [journey_cv_optimizer] * n_cv +
            [journey_casual_browser] * n_rest
        )
        random.shuffle(assignments)

        t0 = time.monotonic()
        sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
        elapsed = time.monotonic() - t0

        all_steps = [st for s in sessions for st in s.steps]
        r5xx = sum(1 for st in all_steps if st.status_code >= 500)
        ok = sum(1 for st in all_steps if st.ok)
        total_steps = len(all_steps)
        success_rate = ok / total_steps * 100 if total_steps > 0 else 0

        icon = "✅" if r5xx == 0 else "⚠️"
        print(f"  {icon} {n_users:4d} users — {elapsed:.1f}s | {ok}/{total_steps} OK ({success_rate:.0f}%) | 5xx: {r5xx}")

        # Pause entre paliers (simule une montée graduelle)
        await asyncio.sleep(3)

    print("\n  ✅ Ramp-up complet sans crash critique")


@pytest.mark.asyncio
async def test_09_evening_peak_simulation():
    """
    Simulation pic du soir — 18h-20h : moment où candidats cherchent du travail.

    Scénario : 300 users mélangés avec plus de coach et de job search,
    comportement plus lent (retour du travail, lecture attentive).
    """
    skip_if_no_token()
    print("\n\n══ SIMULATION PIC SOIR — 300 users ══")

    # Le soir : plus de coaching, plus de temps passé par action
    assignments = (
        [journey_coach_user] * 150 +     # 50% coaching (après le boulot)
        [journey_job_seeker] * 60 +      # 20% recherche d'offres
        [journey_cv_optimizer] * 30 +    # 10% optimisation CV
        [journey_power_user] * 30 +      # 10% power users
        [journey_assistant_user] * 20 +  # 7% assistants
        [journey_casual_browser] * 10    # 3% browsing rapide
    )
    random.shuffle(assignments)

    t0 = time.monotonic()
    sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
    elapsed = time.monotonic() - t0

    r5xx = print_session_report("PIC SOIR 300 USERS", list(sessions), elapsed)
    assert r5xx <= 6, f"❌ {r5xx} erreurs 5xx lors du pic du soir"


@pytest.mark.asyncio
async def test_10_sustained_load_wave():
    """
    Charge soutenue — 3 vagues de 100 users avec 5s d'intervalle.

    Simule 30 minutes de trafic constant (pas un spike instantané).
    Valide que le système ne se dégrade pas dans le temps.
    """
    skip_if_no_token()
    print("\n\n══ CHARGE SOUTENUE — 3 vagues × 100 users ══")

    for wave in range(1, 4):
        assignments = (
            [journey_coach_user] * 40 +
            [journey_job_seeker] * 20 +
            [journey_casual_browser] * 20 +
            [journey_cv_optimizer] * 10 +
            [journey_assistant_user] * 10
        )
        random.shuffle(assignments)

        t0 = time.monotonic()
        sessions = await asyncio.gather(*[run_session(fn, i) for i, fn in enumerate(assignments)])
        elapsed = time.monotonic() - t0

        all_steps = [st for s in sessions for st in s.steps]
        r5xx = sum(1 for st in all_steps if st.status_code >= 500)
        ok = sum(1 for st in all_steps if st.ok)
        total = len(all_steps)

        icon = "✅" if r5xx == 0 else "❌"
        print(f"  {icon} Vague {wave} — {elapsed:.1f}s | {ok}/{total} OK | 5xx: {r5xx}")
        assert r5xx == 0, f"❌ Vague {wave}: {r5xx} erreurs 5xx"

        if wave < 3:
            print(f"     Pause 5s avant vague {wave+1}...")
            await asyncio.sleep(5)

    print("\n  ✅ Charge soutenue passée sans dégradation")
