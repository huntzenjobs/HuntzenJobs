"""
HuntZen — Load Test Production
================================
Usage:
  python load_test.py --token "eyJhbGc..." --scenario coach --users 50
  python load_test.py --token "eyJhbGc..." --scenario cv --users 20
  python load_test.py --token "eyJhbGc..." --scenario mixed --users 100
  python load_test.py --token "eyJhbGc..." --scenario health --users 200
"""

import asyncio
import aiohttp
import time
import argparse
import statistics
import json
from datetime import datetime
from collections import defaultdict

BASE_URL = "https://huntzenjobs-production.up.railway.app"

COACH_MESSAGES = [
    "J'ai un entretien chez Google demain matin, aide-moi à me préparer",
    "Comment négocier mon salaire en France pour un poste senior ?",
    "Mon CV est refusé par les ATS, qu'est-ce que je dois changer ?",
    "Quelles compétences dois-je acquérir pour passer de développeur à tech lead ?",
    "J'ai eu un retour négatif sur mon entretien, comment progresser ?",
    "Aide-moi à rédiger une lettre de motivation pour une startup fintech",
    "Quelle est la meilleure stratégie pour changer de secteur à 35 ans ?",
]

# ─── Données réalistes pour les scénarios CV ──────────────────────────────

CV_TEXT_REALISTE = """KARIM BENALI
Développeur Full-Stack Python / React — 6 ans d'expérience
Paris 75011 | karim.benali@gmail.com | +33 6 12 34 56 78
LinkedIn: linkedin.com/in/karimbenali | GitHub: github.com/kbenali

RÉSUMÉ PROFESSIONNEL
Développeur Full-Stack passionné avec 6 ans d'expérience dans la conception et
le développement d'applications web haute performance. Spécialisé dans les
architectures microservices Python/FastAPI côté backend et React/TypeScript
côté frontend. Expérience significative en traitement de données à grande
échelle, intégration d'APIs LLM (OpenAI, Anthropic, Groq), et déploiement
Cloud (GCP, AWS). Contributeur open source actif.

EXPÉRIENCES PROFESSIONNELLES

Ingénieur Logiciel Senior — Criteo S.A., Paris (Déc 2022 – Présent)
- Développement et maintenance de pipelines de données temps réel traitant
  +50 millions d'événements/jour (Python, Apache Kafka, Redis, PostgreSQL)
- Conception d'une API REST FastAPI servant 2000 req/s en production, avec
  load balancing HAProxy et autoscaling Kubernetes (GKE)
- Migration de 12 microservices legacy Flask vers FastAPI, gain de 35% sur
  les temps de réponse P95
- Implémentation d'un système de cache Redis multi-niveaux réduisant de 60%
  les appels DB en production
- Intégration LLM pour génération automatique de descriptions d'annonces
  publicitaires (OpenAI GPT-4, 10K générations/jour)
- Mentoring de 3 développeurs juniors, code reviews quotidiennes, rédaction
  de RFCs techniques
- Stack : Python 3.11, FastAPI, PostgreSQL 15, Redis 7, Kafka, Docker,
  Kubernetes, GCP (GKE, BigQuery, Cloud Storage), Terraform

Développeur Full-Stack — Lydia Solutions (Fintech), Paris (Juin 2020 – Nov 2022)
- Développement de l'interface de gestion de compte utilisateur (React 18,
  TypeScript, Redux Toolkit) — 3M utilisateurs actifs
- Création d'un système de notifications temps réel (WebSockets, Redis
  Pub/Sub) réduisant la latence de notification de 8s à 200ms
- Refactoring du module de paiement international (SEPA, SWIFT) en
  collaboration avec l'équipe compliance — zéro incident en production
- Mise en place d'une suite de tests automatisés (Jest, Playwright, pytest)
  portant la couverture de 40% à 82%
- Participation aux astreintes on-call, résolution d'incidents P1/P2
- Stack : React 18, TypeScript, Python 3.10, Django REST Framework,
  PostgreSQL, Redis, Docker Compose, AWS (ECS, RDS, S3), GitHub Actions

Développeur Backend — Sopra Steria (ESN), Nantes (Sept 2018 – Mai 2020)
- Développement d'APIs REST pour clients grands comptes (BNP Paribas, SNCF)
- Intégration de systèmes tiers via SOAP/REST (SAP, Salesforce)
- Mise en place CI/CD (Jenkins, SonarQube) sur 5 projets clients
- Stack : Python 2/3, Flask, Django, Oracle DB, Jenkins, Git

COMPÉTENCES TECHNIQUES

Langages    : Python (expert), TypeScript/JavaScript (avancé), SQL (avancé),
              Go (intermédiaire), Bash
Backend     : FastAPI, Django, Flask, SQLAlchemy, Alembic, Pydantic, Celery,
              asyncio, aiohttp
Frontend    : React 18, Next.js 14, Redux Toolkit, React Query, Tailwind CSS,
              shadcn/ui, Playwright
Données     : PostgreSQL, Redis, Elasticsearch, Apache Kafka, MongoDB,
              BigQuery, dbt
Cloud/Infra : GCP (GKE, Cloud Run, BigQuery, Pub/Sub), AWS (ECS, RDS, Lambda,
              S3), Docker, Kubernetes, Terraform, Helm
IA/LLM      : OpenAI API, Anthropic Claude, Groq (Llama), LangChain,
              RAG pipelines, embeddings, fine-tuning
Outils      : Git, GitHub Actions, GitLab CI, Jira, Notion, Datadog, Sentry

FORMATION

Master Informatique — Spécialité IHM et Applications Distribuées
Université Paris-Saclay, Orsay (2016–2018) — Mention Bien

Licence Informatique — Parcours Génie Logiciel
Université Claude Bernard Lyon 1 (2013–2016) — Major de promotion

PROJETS PERSONNELS

FastAPI-Starter (GitHub 420 stars)
Boilerplate production-ready FastAPI avec auth JWT, RBAC, rate limiting Redis,
tests pytest, Docker Compose, GitHub Actions. Utilisé par +300 projets.

LLM-Cost-Tracker (GitHub 180 stars)
Dashboard open source de suivi des coûts LLM (OpenAI, Anthropic, Groq).
React + FastAPI + SQLite. Feature flags, alertes email.

PGVector-Search (contribution)
Contribué à l'implémentation du similarity search pgvector pour le projet
django-pgvector — PR mergée, +150 stars sur le repo.

CERTIFICATIONS
- Google Cloud Professional Data Engineer (2023)
- AWS Certified Solutions Architect — Associate (2021)

LANGUES
Français : natif | Anglais : courant (TOEIC 945/990) | Arabe : courant
"""

JOB_DESC_REALISTE = """Développeur Backend Python Senior — FinTech Scale-up, Paris

Nous recherchons un Développeur Backend Python Senior pour rejoindre notre
équipe engineering de 25 personnes. Vous travaillerez sur notre plateforme
de paiement B2B traitant +10M de transactions par mois.

Missions principales :
- Concevoir et développer des APIs REST haute performance (FastAPI/Python)
- Optimiser nos pipelines de traitement de données temps réel (Kafka, Redis)
- Participer à la migration vers une architecture microservices cloud-native
- Collaborer avec l'équipe Data pour l'intégration de features ML en production
- Assurer la qualité via code reviews, tests automatisés (>80% coverage)
- Participer aux astreintes on-call (rotation 1 semaine/6)

Profil recherché :
- 5+ ans d'expérience Python backend en production
- Maîtrise FastAPI ou Django REST Framework
- Expérience PostgreSQL avancée (query optimization, indexing)
- Expérience Redis (cache, pub/sub, rate limiting)
- Bonnes pratiques : CI/CD, Docker, tests, monitoring (Datadog/Sentry)
- Expérience GCP ou AWS appréciée
- Anglais professionnel requis (équipe internationale)

Ce que nous offrons :
- Salaire : 65–80K EUR selon profil
- Full remote possible (1 jour/semaine présentiel à Paris 9e)
- 10% du temps dédié à la R&D et projets perso
- Budget formation 3000 EUR/an
- Tickets resto, mutuelle premium, BSPCE
"""

CV_DATA_HARDCODED = {
    "personal_info": {
        "name": "Karim Benali",
        "email": "karim.benali@gmail.com",
        "phone": "+33 6 12 34 56 78",
        "location": "Paris 75011",
    },
    "summary": (
        "Développeur Full-Stack Python/React, 6 ans d'expérience, "
        "spécialisé FastAPI, microservices et intégration LLM."
    ),
    "experiences": [
        {
            "company": "Criteo",
            "title": "Ingénieur Logiciel Senior",
            "duration": "2022–présent",
            "highlights": [
                "Pipelines Kafka 50M events/day",
                "API FastAPI 2000 req/s",
                "Migration microservices +35% perf",
            ],
        },
        {
            "company": "Lydia Solutions",
            "title": "Développeur Full-Stack",
            "duration": "2020–2022",
            "highlights": [
                "React 18 / 3M users",
                "WebSockets temps réel 200ms",
                "Tests 40%→82%",
            ],
        },
        {
            "company": "Sopra Steria",
            "title": "Développeur Backend",
            "duration": "2018–2020",
            "highlights": ["APIs REST grands comptes BNP/SNCF", "CI/CD Jenkins"],
        },
    ],
    "skills": [
        "Python", "FastAPI", "React", "TypeScript",
        "PostgreSQL", "Redis", "Kafka", "Docker",
        "Kubernetes", "GCP", "AWS", "LLM/AI",
    ],
    "education": [
        {
            "degree": "Master Informatique",
            "school": "Université Paris-Saclay",
            "year": "2018",
        }
    ],
}

RESULTS = defaultdict(list)
ERRORS = defaultdict(int)
START_TIME = None


async def hit_health(session, user_id):
    start = time.time()
    try:
        async with session.get(f"{BASE_URL}/api/health/ping", timeout=aiohttp.ClientTimeout(total=10)) as r:
            elapsed = time.time() - start
            RESULTS["health"].append(elapsed)
            status = "✅" if r.status == 200 else "❌"
            print(f"  [user {user_id:03d}] health {status} {r.status} — {elapsed:.2f}s")
    except Exception as e:
        ERRORS["health"] += 1
        print(f"  [user {user_id:03d}] health 💀 {str(e)[:50]}")


async def hit_coach(session, token, user_id):
    import random, uuid
    msg = random.choice(COACH_MESSAGES)
    session_id = str(uuid.uuid4())
    start = time.time()
    try:
        async with session.post(
            f"{BASE_URL}/api/coach/chat",
            json={"message": msg, "session_id": session_id, "language": "fr"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as r:
            elapsed = time.time() - start
            body = await r.text()
            RESULTS["coach"].append(elapsed)
            if r.status == 200:
                print(f"  [user {user_id:03d}] coach ✅ {r.status} — {elapsed:.2f}s")
            elif r.status == 429:
                ERRORS["groq_429"] += 1
                print(f"  [user {user_id:03d}] coach ⚠️  429 Groq rate-limit — {elapsed:.2f}s")
            else:
                ERRORS[f"coach_{r.status}"] += 1
                print(f"  [user {user_id:03d}] coach ❌ {r.status} — {elapsed:.2f}s | {body[:80]}")
    except asyncio.TimeoutError:
        ERRORS["coach_timeout"] += 1
        print(f"  [user {user_id:03d}] coach 💀 TIMEOUT (>60s)")
    except Exception as e:
        ERRORS["coach_error"] += 1
        print(f"  [user {user_id:03d}] coach 💀 {str(e)[:60]}")


async def hit_jobs(session, token, user_id):
    import random
    queries = ["développeur python paris", "data scientist remote", "product manager startup"]
    q = random.choice(queries)
    start = time.time()
    try:
        async with session.get(
            f"{BASE_URL}/api/jobs/search?q={q}&limit=10",
            headers={"Authorization": f"Bearer {token}"},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as r:
            elapsed = time.time() - start
            RESULTS["jobs"].append(elapsed)
            status = "✅" if r.status == 200 else "❌"
            print(f"  [user {user_id:03d}] jobs {status} {r.status} — {elapsed:.2f}s")
    except asyncio.TimeoutError:
        ERRORS["jobs_timeout"] += 1
        print(f"  [user {user_id:03d}] jobs 💀 TIMEOUT")
    except Exception as e:
        ERRORS["jobs_error"] += 1
        print(f"  [user {user_id:03d}] jobs 💀 {str(e)[:50]}")


async def hit_auth(session, token, user_id):
    start = time.time()
    try:
        async with session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=aiohttp.ClientTimeout(total=25),
        ) as r:
            elapsed = time.time() - start
            RESULTS["auth"].append(elapsed)
            status = "✅" if r.status == 200 else "❌"
            print(f"  [user {user_id:03d}] auth {status} {r.status} — {elapsed:.2f}s")
    except Exception as e:
        ERRORS["auth_error"] += 1
        print(f"  [user {user_id:03d}] auth 💀 {str(e)[:50]}")


async def hit_cv_sequential(session, token, user_id):
    """
    Flow complet séquentiel par user :
    1. POST /api/cv-analysis/async (upload PDF)
    2. GET  /api/cv-analysis/status/{cv_id} (poll jusqu'à completed)
    3. POST /api/cv-adapter/adapt (cv_text + job_description)
    4. POST /api/cv-adapter/generate-cover-letter/json (cv_data + job)
    """
    headers = {"Authorization": f"Bearer {token}"}

    # ── Étape 1 : upload CV ───────────────────────────────────────────────
    start = time.time()
    cv_id = None
    try:
        cv_pdf_path = "tests/load/test_cv.pdf"
        with open(cv_pdf_path, "rb") as f:
            pdf_bytes = f.read()

        form = aiohttp.FormData()
        form.add_field("file", pdf_bytes, filename="test_cv.pdf", content_type="application/pdf")
        form.add_field("language", "fr")

        async with session.post(
            f"{BASE_URL}/api/cv-analysis/async",
            data=form,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as r:
            elapsed = time.time() - start
            RESULTS["cv_upload"].append(elapsed)
            if r.status == 200:
                body = await r.json()
                cv_id = body.get("cv_id")
                print(f"  [user {user_id:03d}] cv_upload ✅ {r.status} cv_id={str(cv_id)[:8]}… — {elapsed:.2f}s")
            else:
                ERRORS[f"cv_upload_{r.status}"] += 1
                text = await r.text()
                print(f"  [user {user_id:03d}] cv_upload ❌ {r.status} — {elapsed:.2f}s | {text[:80]}")
                return
    except asyncio.TimeoutError:
        ERRORS["cv_upload_timeout"] += 1
        print(f"  [user {user_id:03d}] cv_upload 💀 TIMEOUT")
        return
    except FileNotFoundError:
        ERRORS["cv_upload_file_missing"] += 1
        print(f"  [user {user_id:03d}] cv_upload 💀 tests/load/test_cv.pdf introuvable — lancer depuis la racine")
        return
    except Exception as e:
        ERRORS["cv_upload_error"] += 1
        print(f"  [user {user_id:03d}] cv_upload 💀 {str(e)[:60]}")
        return

    if not cv_id:
        ERRORS["cv_upload_no_id"] += 1
        return

    # ── Étape 2 : poll status ─────────────────────────────────────────────
    poll_start = time.time()
    poll_timeout = 150
    poll_interval = 3
    final_status = None

    while time.time() - poll_start < poll_timeout:
        await asyncio.sleep(poll_interval)
        try:
            async with session.get(
                f"{BASE_URL}/api/cv-analysis/status/{cv_id}",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as r:
                if r.status == 200:
                    body = await r.json()
                    final_status = body.get("status")
                    if final_status in ("completed", "failed"):
                        break
                else:
                    ERRORS[f"cv_poll_{r.status}"] += 1
        except Exception:
            pass

    poll_elapsed = time.time() - poll_start
    RESULTS["cv_poll"].append(poll_elapsed)

    if final_status == "completed":
        print(f"  [user {user_id:03d}] cv_poll ✅ completed — {poll_elapsed:.1f}s")
    elif final_status == "failed":
        ERRORS["cv_poll_failed"] += 1
        print(f"  [user {user_id:03d}] cv_poll ❌ failed — {poll_elapsed:.1f}s")
        return
    else:
        ERRORS["cv_poll_timeout"] += 1
        print(f"  [user {user_id:03d}] cv_poll 💀 TIMEOUT ({poll_timeout}s)")
        return

    # ── Étape 3 : adapter CV ──────────────────────────────────────────────
    start = time.time()
    cv_data = None
    try:
        form = aiohttp.FormData()
        form.add_field("cv_text", CV_TEXT_REALISTE)
        form.add_field("job_description", JOB_DESC_REALISTE)
        form.add_field("language", "fr")
        form.add_field("template", "ats")

        async with session.post(
            f"{BASE_URL}/api/cv-adapter/adapt",
            data=form,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=90),
        ) as r:
            elapsed = time.time() - start
            RESULTS["cv_adapt"].append(elapsed)
            if r.status == 200:
                body = await r.json()
                cv_data = body.get("cv_data")
                print(f"  [user {user_id:03d}] cv_adapt ✅ {r.status} — {elapsed:.2f}s")
            elif r.status == 429:
                ERRORS["cv_adapt_429"] += 1
                print(f"  [user {user_id:03d}] cv_adapt ⚠️  429 rate-limit — {elapsed:.2f}s")
                return
            else:
                ERRORS[f"cv_adapt_{r.status}"] += 1
                text = await r.text()
                print(f"  [user {user_id:03d}] cv_adapt ❌ {r.status} — {elapsed:.2f}s | {text[:80]}")
                return
    except asyncio.TimeoutError:
        ERRORS["cv_adapt_timeout"] += 1
        print(f"  [user {user_id:03d}] cv_adapt 💀 TIMEOUT (>90s)")
        return
    except Exception as e:
        ERRORS["cv_adapt_error"] += 1
        print(f"  [user {user_id:03d}] cv_adapt 💀 {str(e)[:60]}")
        return

    if not cv_data:
        ERRORS["cv_adapt_no_data"] += 1
        return

    # ── Étape 4 : générer lettre de motivation ────────────────────────────
    start = time.time()
    try:
        payload = {
            "cv_data": cv_data,
            "job_description": JOB_DESC_REALISTE,
            "language": "fr",
            "company_name": "FinTech Scale-up Paris",
        }
        async with session.post(
            f"{BASE_URL}/api/cv-adapter/generate-cover-letter/json",
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=60),
        ) as r:
            elapsed = time.time() - start
            RESULTS["cv_cover_letter"].append(elapsed)
            if r.status == 200:
                print(f"  [user {user_id:03d}] cv_cover_letter ✅ {r.status} — {elapsed:.2f}s")
            elif r.status == 429:
                ERRORS["cv_cover_429"] += 1
                print(f"  [user {user_id:03d}] cv_cover_letter ⚠️  429 — {elapsed:.2f}s")
            else:
                ERRORS[f"cv_cover_{r.status}"] += 1
                text = await r.text()
                print(f"  [user {user_id:03d}] cv_cover_letter ❌ {r.status} — {elapsed:.2f}s | {text[:80]}")
    except asyncio.TimeoutError:
        ERRORS["cv_cover_timeout"] += 1
        print(f"  [user {user_id:03d}] cv_cover_letter 💀 TIMEOUT (>60s)")
    except Exception as e:
        ERRORS["cv_cover_error"] += 1
        print(f"  [user {user_id:03d}] cv_cover_letter 💀 {str(e)[:60]}")


async def hit_cv_realistic(session, token, user_id):
    """
    Mix comportemental réaliste (par modulo) :
    - 60% : analyse async avec cv_text (pas file) + poll
    - 30% : adapt directement avec cv_text
    - 10% : generate-cover-letter/json avec cv_data hardcodé
    """
    headers = {"Authorization": f"Bearer {token}"}
    segment = user_id % 10

    if segment <= 5:
        # 60% — Analyse LLM async (cv_text, pas file — évite cold start Modal)
        start = time.time()
        cv_id = None
        try:
            form = aiohttp.FormData()
            form.add_field("cv_text", CV_TEXT_REALISTE)
            form.add_field("language", "fr")
            async with session.post(
                f"{BASE_URL}/api/cv-analysis/async",
                data=form,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as r:
                elapsed = time.time() - start
                RESULTS["cv_upload"].append(elapsed)
                if r.status == 200:
                    body = await r.json()
                    cv_id = body.get("cv_id")
                    print(f"  [user {user_id:03d}] realistic/upload ✅ — {elapsed:.2f}s")
                else:
                    ERRORS[f"cv_upload_{r.status}"] += 1
                    print(f"  [user {user_id:03d}] realistic/upload ❌ {r.status} — {elapsed:.2f}s")
                    return
        except Exception as e:
            ERRORS["cv_upload_error"] += 1
            print(f"  [user {user_id:03d}] realistic/upload 💀 {str(e)[:50]}")
            return

        if not cv_id:
            return

        poll_start = time.time()
        for _ in range(50):  # max 150s (50 × 3s)
            await asyncio.sleep(3)
            try:
                async with session.get(
                    f"{BASE_URL}/api/cv-analysis/status/{cv_id}",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as r:
                    if r.status == 200:
                        body = await r.json()
                        st = body.get("status")
                        if st == "completed":
                            break
                        if st == "failed":
                            ERRORS["cv_poll_failed"] += 1
                            return
            except Exception:
                pass
        RESULTS["cv_poll"].append(time.time() - poll_start)
        print(f"  [user {user_id:03d}] realistic/poll ✅ — {time.time() - poll_start:.1f}s")

    elif segment <= 8:
        # 30% — Adapt direct
        start = time.time()
        try:
            form = aiohttp.FormData()
            form.add_field("cv_text", CV_TEXT_REALISTE)
            form.add_field("job_description", JOB_DESC_REALISTE)
            form.add_field("language", "fr")
            form.add_field("template", "ats")
            async with session.post(
                f"{BASE_URL}/api/cv-adapter/adapt",
                data=form,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=90),
            ) as r:
                elapsed = time.time() - start
                RESULTS["cv_adapt"].append(elapsed)
                icon = "✅" if r.status == 200 else ("⚠️ " if r.status == 429 else "❌")
                print(f"  [user {user_id:03d}] realistic/adapt {icon} {r.status} — {elapsed:.2f}s")
                if r.status == 429:
                    ERRORS["cv_adapt_429"] += 1
                elif r.status != 200:
                    ERRORS[f"cv_adapt_{r.status}"] += 1
        except asyncio.TimeoutError:
            ERRORS["cv_adapt_timeout"] += 1
            print(f"  [user {user_id:03d}] realistic/adapt 💀 TIMEOUT")
        except Exception as e:
            ERRORS["cv_adapt_error"] += 1
            print(f"  [user {user_id:03d}] realistic/adapt 💀 {str(e)[:50]}")

    else:
        # 10% — Cover letter directe (cv_data hardcodé)
        start = time.time()
        try:
            payload = {
                "cv_data": CV_DATA_HARDCODED,
                "job_description": JOB_DESC_REALISTE,
                "language": "fr",
                "company_name": "FinTech Scale-up Paris",
            }
            async with session.post(
                f"{BASE_URL}/api/cv-adapter/generate-cover-letter/json",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as r:
                elapsed = time.time() - start
                RESULTS["cv_cover_letter"].append(elapsed)
                icon = "✅" if r.status == 200 else ("⚠️ " if r.status == 429 else "❌")
                print(f"  [user {user_id:03d}] realistic/cover {icon} {r.status} — {elapsed:.2f}s")
                if r.status == 429:
                    ERRORS["cv_cover_429"] += 1
                elif r.status != 200:
                    ERRORS[f"cv_cover_{r.status}"] += 1
        except asyncio.TimeoutError:
            ERRORS["cv_cover_timeout"] += 1
            print(f"  [user {user_id:03d}] realistic/cover 💀 TIMEOUT")
        except Exception as e:
            ERRORS["cv_cover_error"] += 1
            print(f"  [user {user_id:03d}] realistic/cover 💀 {str(e)[:50]}")


async def hit_cv_stress(session, token, user_id):
    """
    Worst case : toutes les étapes en parallèle pour chaque user.
    Intentionnellement pas de chaînage cv_id→poll : chaque sous-fonction
    est indépendante pour stresser Modal + Groq + PgBouncer simultanément.
    """
    headers = {"Authorization": f"Bearer {token}"}

    async def _upload():
        start = time.time()
        try:
            cv_pdf_path = "tests/load/test_cv.pdf"
            with open(cv_pdf_path, "rb") as f:
                pdf_bytes = f.read()
            form = aiohttp.FormData()
            form.add_field("file", pdf_bytes, filename="test_cv.pdf", content_type="application/pdf")
            form.add_field("language", "fr")
            async with session.post(
                f"{BASE_URL}/api/cv-analysis/async",
                data=form, headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as r:
                elapsed = time.time() - start
                RESULTS["cv_upload"].append(elapsed)
                icon = "✅" if r.status == 200 else "❌"
                print(f"  [user {user_id:03d}] stress/upload {icon} {r.status} — {elapsed:.2f}s")
                if r.status != 200:
                    ERRORS[f"cv_upload_{r.status}"] += 1
        except Exception as e:
            ERRORS["cv_upload_error"] += 1
            print(f"  [user {user_id:03d}] stress/upload 💀 {str(e)[:50]}")

    async def _adapt():
        start = time.time()
        try:
            form = aiohttp.FormData()
            form.add_field("cv_text", CV_TEXT_REALISTE)
            form.add_field("job_description", JOB_DESC_REALISTE)
            form.add_field("language", "fr")
            form.add_field("template", "ats")
            async with session.post(
                f"{BASE_URL}/api/cv-adapter/adapt",
                data=form, headers=headers,
                timeout=aiohttp.ClientTimeout(total=90),
            ) as r:
                elapsed = time.time() - start
                RESULTS["cv_adapt"].append(elapsed)
                icon = "✅" if r.status == 200 else ("⚠️" if r.status == 429 else "❌")
                print(f"  [user {user_id:03d}] stress/adapt {icon} {r.status} — {elapsed:.2f}s")
                if r.status == 429:
                    ERRORS["cv_adapt_429"] += 1
                elif r.status != 200:
                    ERRORS[f"cv_adapt_{r.status}"] += 1
        except asyncio.TimeoutError:
            ERRORS["cv_adapt_timeout"] += 1
            print(f"  [user {user_id:03d}] stress/adapt 💀 TIMEOUT")
        except Exception as e:
            ERRORS["cv_adapt_error"] += 1
            print(f"  [user {user_id:03d}] stress/adapt 💀 {str(e)[:50]}")

    async def _cover():
        start = time.time()
        try:
            payload = {
                "cv_data": CV_DATA_HARDCODED,
                "job_description": JOB_DESC_REALISTE,
                "language": "fr",
                "company_name": "FinTech Scale-up Paris",
            }
            async with session.post(
                f"{BASE_URL}/api/cv-adapter/generate-cover-letter/json",
                json=payload, headers=headers,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as r:
                elapsed = time.time() - start
                RESULTS["cv_cover_letter"].append(elapsed)
                icon = "✅" if r.status == 200 else ("⚠️" if r.status == 429 else "❌")
                print(f"  [user {user_id:03d}] stress/cover {icon} {r.status} — {elapsed:.2f}s")
                if r.status == 429:
                    ERRORS["cv_cover_429"] += 1
                elif r.status != 200:
                    ERRORS[f"cv_cover_{r.status}"] += 1
        except asyncio.TimeoutError:
            ERRORS["cv_cover_timeout"] += 1
            print(f"  [user {user_id:03d}] stress/cover 💀 TIMEOUT")
        except Exception as e:
            ERRORS["cv_cover_error"] += 1
            print(f"  [user {user_id:03d}] stress/cover 💀 {str(e)[:50]}")

    await asyncio.gather(_upload(), _adapt(), _cover(), return_exceptions=True)


CV_TEXT = """
Développeur Full Stack Senior — 8 ans d'expérience
Python, FastAPI, React, TypeScript, PostgreSQL, Docker, AWS
Expériences :
- Lead Dev chez TechStartup (2021-2024) : migration microservices, équipe 6 devs
- Senior Dev chez FinTech SA (2019-2021) : API paiement haute dispo 99.9%
- Dev Backend chez AgencyX (2016-2019) : Django, PostgreSQL, Redis
Formation : Master Informatique Paris 6
Langues : Français natif, Anglais C1
"""

JOB_DESCRIPTION = """
Nous recherchons un Développeur Backend Senior Python/FastAPI pour rejoindre notre équipe.
Compétences requises : Python 3.10+, FastAPI, PostgreSQL, Docker, expérience microservices.
Nice to have : Kubernetes, Redis, AWS Lambda.
Poste à Paris, remote 3j/semaine, salaire 65-80k€.
"""


async def hit_cv_adapt(session, token, user_id):
    """Scénario CV complet : adaptation + génération lettre de motivation"""
    import random
    start = time.time()

    # Étape 1 : adapter le CV
    try:
        async with session.post(
            f"{BASE_URL}/api/cv-adapter",
            json={"cv_text": CV_TEXT, "job_description": JOB_DESCRIPTION, "language": "fr"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=90),
        ) as r:
            elapsed_adapt = time.time() - start
            body = await r.json() if r.status == 200 else {}
            if r.status == 200:
                RESULTS["cv_adapt"].append(elapsed_adapt)
                print(f"  [user {user_id:03d}] cv_adapt ✅ — {elapsed_adapt:.2f}s")
            else:
                body_text = await r.text() if not body else str(body)[:80]
                ERRORS[f"cv_adapt_{r.status}"] += 1
                print(f"  [user {user_id:03d}] cv_adapt ❌ {r.status} — {elapsed_adapt:.2f}s | {str(body_text)[:80]}")
                return
    except asyncio.TimeoutError:
        ERRORS["cv_adapt_timeout"] += 1
        print(f"  [user {user_id:03d}] cv_adapt 💀 TIMEOUT (>90s)")
        return
    except Exception as e:
        ERRORS["cv_adapt_error"] += 1
        print(f"  [user {user_id:03d}] cv_adapt 💀 {str(e)[:60]}")
        return

    # Étape 2 : générer lettre de motivation
    start_lm = time.time()
    try:
        async with session.post(
            f"{BASE_URL}/api/cv-adapter/generate-cover-letter",
            json={"cv_text": CV_TEXT, "job_description": JOB_DESCRIPTION, "language": "fr"},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as r:
            elapsed_lm = time.time() - start_lm
            if r.status == 200:
                RESULTS["cover_letter"].append(elapsed_lm)
                print(f"  [user {user_id:03d}] cover_letter ✅ — {elapsed_lm:.2f}s")
            elif r.status == 429:
                ERRORS["groq_429"] += 1
                print(f"  [user {user_id:03d}] cover_letter ⚠️  429 Groq TPM — {elapsed_lm:.2f}s")
            else:
                ERRORS[f"cover_letter_{r.status}"] += 1
                print(f"  [user {user_id:03d}] cover_letter ❌ {r.status} — {elapsed_lm:.2f}s")
    except asyncio.TimeoutError:
        ERRORS["cover_letter_timeout"] += 1
        print(f"  [user {user_id:03d}] cover_letter 💀 TIMEOUT (>60s)")
    except Exception as e:
        ERRORS["cover_letter_error"] += 1
        print(f"  [user {user_id:03d}] cover_letter 💀 {str(e)[:60]}")


def print_report(scenario, n_users, duration):
    print("\n" + "═" * 60)
    print(f"  RAPPORT — {scenario.upper()} | {n_users} users | {duration:.1f}s")
    print("═" * 60)

    for name, times in RESULTS.items():
        if not times:
            continue
        p50 = statistics.median(times)
        p95 = sorted(times)[int(len(times) * 0.95)] if len(times) > 1 else times[0]
        p99 = sorted(times)[int(len(times) * 0.99)] if len(times) > 1 else times[0]
        success_rate = (len(times) / (len(times) + sum(v for k, v in ERRORS.items() if name in k))) * 100

        status = "✅" if p95 < 15 else ("⚠️ " if p95 < 45 else "❌")
        print(f"\n  [{name.upper()}]")
        print(f"  Requêtes OK  : {len(times)}")
        print(f"  P50 latence  : {p50:.2f}s")
        print(f"  P95 latence  : {p95:.2f}s  {status}")
        print(f"  P99 latence  : {p99:.2f}s")
        print(f"  Min / Max    : {min(times):.2f}s / {max(times):.2f}s")

    if ERRORS:
        print(f"\n  ERREURS :")
        for k, v in ERRORS.items():
            print(f"  {k}: {v}")

    total_req = sum(len(t) for t in RESULTS.values()) + sum(ERRORS.values())
    print(f"\n  TOTAL requêtes : {total_req}")
    print(f"  Taux succès    : {(sum(len(t) for t in RESULTS.values()) / total_req * 100):.1f}%")
    print(f"  Throughput     : {total_req / duration:.1f} req/s")
    print("═" * 60 + "\n")


# ─── Rapport auto-sauvegardé ──────────────────────────────────────────────

REPORTS_DIR = "docs/load-testing-reports"


def _compute_error_rate() -> float:
    total_ok = sum(len(t) for t in RESULTS.values())
    total_err = sum(ERRORS.values())
    total = total_ok + total_err
    return total_err / total if total > 0 else 0.0


def _percentile(times: list, p: float) -> float:
    if not times:
        return 0.0
    sorted_t = sorted(times)
    idx = int(len(sorted_t) * p)
    return sorted_t[min(idx, len(sorted_t) - 1)]


def _build_report(scenario: str, mode: str, n_users: int, duration: float) -> dict:
    steps = {}
    for name, times in RESULTS.items():
        total_step = len(times) + sum(v for k, v in ERRORS.items() if name in k)
        ok_rate = len(times) / total_step if total_step > 0 else 0.0
        step_errors = {k: v for k, v in ERRORS.items() if name in k}
        steps[name] = {
            "p50": round(_percentile(times, 0.50), 3),
            "p95": round(_percentile(times, 0.95), 3),
            "p99": round(_percentile(times, 0.99), 3),
            "success_rate": round(ok_rate, 3),
            "count": len(times),
            "errors": step_errors,
        }

    error_rate = _compute_error_rate()
    breakdown_level = n_users if error_rate > 0.20 else None

    bottleneck = None
    if steps:
        bottleneck = max(steps, key=lambda k: steps[k]["p95"])

    recommendations = []
    if "cv_poll" in steps and steps["cv_poll"]["p95"] > 90:
        recommendations.append("Modal cold start trop lent — envisager warm-up ou Modal dedicated workers.")
    if any(v for k, v in ERRORS.items() if "429" in k):
        recommendations.append("Groq rate limit (429) atteint — réduire concurrence ou passer à Groq Batch API.")
    if any(v for k, v in ERRORS.items() if "timeout" in k and "poll" in k):
        recommendations.append("Timeout Modal détecté — augmenter timeout poll ou réduire concurrence CV async.")
    if error_rate > 0.20:
        recommendations.append(f"Taux d'erreur {error_rate:.0%} > 20% à {n_users} users — seuil de rupture identifié.")
    if not recommendations:
        recommendations.append("Infrastructure stable à ce niveau de charge.")

    return {
        "meta": {
            "scenario": scenario,
            "mode": mode,
            "users": n_users,
            "date": datetime.now().isoformat(),
            "duration_s": round(duration, 1),
        },
        "steps": steps,
        "breakdown_level": breakdown_level,
        "bottleneck": bottleneck,
        "error_rate": round(error_rate, 3),
        "recommendations": recommendations,
    }


def save_report(scenario: str, mode: str, n_users: int, duration: float) -> None:
    import os
    os.makedirs(REPORTS_DIR, exist_ok=True)

    report = _build_report(scenario, mode, n_users, duration)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    base = f"{timestamp}_{scenario}_{mode}"

    json_path = os.path.join(REPORTS_DIR, f"{base}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    md_path = os.path.join(REPORTS_DIR, f"{base}.md")
    lines = [
        f"# Rapport Load Test — {scenario} / {mode}",
        f"",
        f"**Date :** {report['meta']['date']}  ",
        f"**Users :** {n_users}  ",
        f"**Durée :** {report['meta']['duration_s']}s  ",
        f"**Taux d'erreur :** {report['error_rate']:.1%}  ",
        f"**Seuil de rupture :** {report['breakdown_level'] or 'Non atteint'}  ",
        f"**Bottleneck :** {report['bottleneck'] or 'N/A'}  ",
        f"",
        f"## Métriques par étape",
        f"",
        f"| Étape | P50 | P95 | P99 | Succès | Erreurs |",
        f"|-------|-----|-----|-----|--------|---------|",
    ]
    for step_name, s in report["steps"].items():
        err_str = ", ".join(f"{k}:{v}" for k, v in s["errors"].items()) or "—"
        lines.append(
            f"| {step_name} | {s['p50']}s | {s['p95']}s | {s['p99']}s "
            f"| {s['success_rate']:.1%} | {err_str} |"
        )
    lines += ["", "## Recommandations", ""]
    for r in report["recommendations"]:
        lines.append(f"- {r}")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\n  💾 Rapport sauvegardé : {json_path}")
    print(f"  💾 Rapport sauvegardé : {md_path}")


async def run_scenario(scenario, token, n_users, delay_between_users=0):
    """
    Lance N users en parallèle (ou avec délai entre chaque)
    delay_between_users=0 → tous en même temps (vrai simultané)
    delay_between_users=0.1 → 10 users/sec (montée progressive)
    """
    connector = aiohttp.TCPConnector(limit=n_users + 10, limit_per_host=n_users + 10)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        for i in range(n_users):
            if scenario == "health":
                task = hit_health(session, i + 1)
            elif scenario == "coach":
                task = hit_coach(session, token, i + 1)
            elif scenario == "jobs":
                task = hit_jobs(session, token, i + 1)
            elif scenario == "auth":
                task = hit_auth(session, token, i + 1)
            elif scenario == "cv":
                task = hit_cv_adapt(session, token, i + 1)
            elif scenario == "mixed":
                # Mix réaliste: 40% coach, 30% jobs, 30% auth
                if i % 10 < 4:
                    task = hit_coach(session, token, i + 1)
                elif i % 10 < 7:
                    task = hit_jobs(session, token, i + 1)
                else:
                    task = hit_auth(session, token, i + 1)

            if delay_between_users > 0:
                tasks.append(asyncio.create_task(asyncio.sleep(i * delay_between_users)))

            tasks.append(asyncio.create_task(task))

        await asyncio.gather(*tasks, return_exceptions=True)


async def ramp_scenario(scenario, token, max_users, stages):
    """
    Montée en charge progressive
    stages = [(n_users, duration_sec), ...]
    Ex: [(10, 30), (50, 60), (200, 60), (0, 30)]
    """
    for n_users, duration in stages:
        if n_users == 0:
            print(f"\n⏳ Cooldown {duration}s...")
            await asyncio.sleep(duration)
            continue

        print(f"\n{'─'*60}")
        print(f"  VAGUE : {n_users} users simultanés pendant {duration}s")
        print(f"{'─'*60}")

        end_time = time.time() + duration
        wave_num = 0
        while time.time() < end_time:
            wave_num += 1
            wave_start = time.time()
            print(f"\n  [Vague {wave_num} — T+{wave_start - START_TIME:.0f}s]")
            await run_scenario(scenario, token, n_users)
            wave_elapsed = time.time() - wave_start
            # Attendre avant la prochaine vague si on est dans le temps
            if time.time() < end_time:
                sleep_time = max(0, 5 - wave_elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)


async def run_cv_levels(scenario: str, token: str, mode: str, levels: list, adaptive: bool = False):
    """
    Lance un scénario CV sur plusieurs niveaux de concurrence progressifs.
    Entre chaque niveau : crash detection → pause si >20%, stop si >50%.
    """
    p95_ok_to_advance = {
        "cv_sequential": 90.0,
        "cv_realistic": 60.0,
        "cv_stress": 80.0,
    }

    for n_users in levels:
        RESULTS.clear()
        ERRORS.clear()

        print(f"\n{'━'*60}")
        print(f"  🚀 {scenario.upper()} / {mode.upper()} — {n_users} users")
        print(f"{'━'*60}")

        level_start = time.time()

        connector = aiohttp.TCPConnector(limit=n_users + 20, limit_per_host=n_users + 20)
        async with aiohttp.ClientSession(connector=connector) as session:

            if mode == "burst":
                tasks = []
                for i in range(n_users):
                    if scenario == "cv_sequential":
                        tasks.append(hit_cv_sequential(session, token, i + 1))
                    elif scenario == "cv_realistic":
                        tasks.append(hit_cv_realistic(session, token, i + 1))
                    else:
                        tasks.append(hit_cv_stress(session, token, i + 1))
                await asyncio.gather(*tasks, return_exceptions=True)

            elif mode == "ramp":
                tasks = []
                for i in range(n_users):
                    await asyncio.sleep(1.0)
                    if scenario == "cv_sequential":
                        t = asyncio.create_task(hit_cv_sequential(session, token, i + 1))
                    elif scenario == "cv_realistic":
                        t = asyncio.create_task(hit_cv_realistic(session, token, i + 1))
                    else:
                        t = asyncio.create_task(hit_cv_stress(session, token, i + 1))
                    tasks.append(t)
                await asyncio.gather(*tasks, return_exceptions=True)

            elif mode == "wave":
                end_time = time.time() + 180  # 3 minutes
                wave_num = 0
                while time.time() < end_time:
                    wave_num += 1
                    print(f"\n  [Vague {wave_num} — T+{time.time() - level_start:.0f}s]")
                    tasks = []
                    for i in range(n_users):
                        if scenario == "cv_sequential":
                            tasks.append(hit_cv_sequential(session, token, i + 1))
                        elif scenario == "cv_realistic":
                            tasks.append(hit_cv_realistic(session, token, i + 1))
                        else:
                            tasks.append(hit_cv_stress(session, token, i + 1))
                    await asyncio.gather(*tasks, return_exceptions=True)
                    if time.time() < end_time:
                        await asyncio.sleep(10)

        level_duration = time.time() - level_start
        print_report(scenario, n_users, level_duration)
        save_report(scenario, mode, n_users, level_duration)

        # ── Crash detection ────────────────────────────────────────────────
        error_rate = _compute_error_rate()

        if error_rate > 0.50:
            print(f"\n  🛑 CRASH DÉTECTÉ — taux d'erreur {error_rate:.0%} > 50% à {n_users} users")
            print(f"  Diagnostic backend :")
            try:
                import aiohttp as _ah
                async with _ah.ClientSession() as diag_session:
                    async with diag_session.get(
                        f"{BASE_URL}/api/health/ping",
                        timeout=_ah.ClientTimeout(total=5)
                    ) as r:
                        print(f"  GET /api/health/ping → {r.status}")
            except Exception as e:
                print(f"  GET /api/health/ping → ERREUR ({e})")
            print(f"  ⚠️  Arrêt des niveaux suivants pour ce scénario.")
            break

        elif error_rate > 0.20:
            print(f"\n  ⚠️  DÉGRADATION — taux d'erreur {error_rate:.0%} > 20% à {n_users} users")
            print(f"  Pause 30s avant le niveau suivant...")
            await asyncio.sleep(30)

        # ── Adaptive ──────────────────────────────────────────────────────
        if adaptive:
            poll_times = RESULTS.get("cv_poll", [])
            if poll_times:
                p95_poll = _percentile(poll_times, 0.95)
                threshold = p95_ok_to_advance.get(scenario, 90.0)
                if p95_poll >= threshold:
                    print(f"\n  📊 Adaptive: P95 poll = {p95_poll:.1f}s ≥ {threshold}s — stop à {n_users} users")
                    break
                else:
                    print(f"\n  📊 Adaptive: P95 poll = {p95_poll:.1f}s < {threshold}s — montée au niveau suivant")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=False, default="", help="JWT Bearer token")
    parser.add_argument("--scenario", default="health",
                        choices=["health", "coach", "jobs", "auth", "mixed", "ramp",
                                 "cv_sequential", "cv_realistic", "cv_stress"],
                        help="Scénario à tester")
    parser.add_argument("--users", type=int, default=10, help="Nombre d'utilisateurs simultanés")
    parser.add_argument("--ramp", action="store_true", help="Montée progressive: 10→50→100→200")
    parser.add_argument(
        "--mode", default="burst", choices=["burst", "ramp", "wave"],
        help="Mode CV: burst (tous en même temps), ramp (1/sec), wave (vagues/10s)",
    )
    parser.add_argument(
        "--adaptive", action="store_true",
        help="Mode adaptatif: monte au niveau suivant si P95 < seuil",
    )
    args = parser.parse_args()

    global START_TIME
    START_TIME = time.time()

    print(f"\n{'═'*60}")
    print(f"  🚀 HuntZen Load Test")
    print(f"  URL      : {BASE_URL}")
    print(f"  Scénario : {args.scenario}")
    print(f"  Users    : {args.users}")
    print(f"  Début    : {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'═'*60}\n")

    if args.scenario == "health":
        print(f"  → {args.users} users frappent /health en même temps\n")
        await run_scenario("health", args.token, args.users)

    elif args.scenario in ("coach", "jobs", "auth", "mixed", "cv"):
        if not args.token:
            print("❌ --token requis pour ce scénario (récupère-le dans les DevTools)")
            return
        print(f"  → {args.users} users simultanés sur [{args.scenario}]\n")
        await run_scenario(args.scenario, args.token, args.users)

    elif args.scenario == "ramp":
        if not args.token:
            print("❌ --token requis")
            return
        stages = [
            (10,  30),   # 10 users pendant 30s
            (50,  60),   # 50 users pendant 60s
            (100, 60),   # 100 users pendant 60s
            (200, 60),   # 200 users pendant 60s (le vrai test)
            (0,   20),   # cooldown
        ]
        print("  → Montée progressive: 10 → 50 → 100 → 200 users\n")
        await ramp_scenario("mixed", args.token, 200, stages)

    elif args.scenario in ("cv_sequential", "cv_realistic", "cv_stress"):
        if not args.token:
            print("❌ --token requis pour les scénarios CV")
            return

        levels_map = {
            "cv_sequential": [5, 10, 20, 50],
            "cv_realistic":  [10, 25, 50],
            "cv_stress":     [10, 20],
        }
        # If --users was explicitly set (not default 10), use only that level
        if args.users != 10:
            levels = [args.users]
        else:
            levels = levels_map[args.scenario]

        print(f"  → Niveaux : {levels} | Mode : {args.mode}")
        if args.adaptive:
            print(f"  → Mode adaptatif activé")

        await run_cv_levels(
            scenario=args.scenario,
            token=args.token,
            mode=args.mode,
            levels=levels,
            adaptive=args.adaptive,
        )
        duration = time.time() - START_TIME
        # Note: print_report already called inside run_cv_levels per level
        # Just print total duration
        print(f"\n  ⏱️  Durée totale : {duration:.1f}s")
        return

    duration = time.time() - START_TIME
    print_report(args.scenario, args.users, duration)


if __name__ == "__main__":
    asyncio.run(main())
