# CV Load Testing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter 3 scénarios CV (`cv_sequential`, `cv_realistic`, `cv_stress`) à `load_test.py` avec modes burst/ramp/wave, crash detection automatique, et sauvegarde rapport JSON+MD après chaque run.

**Architecture:** Extension directe de `load_test.py` existant — on ajoute des constantes (CV text réaliste, job description, cv_data hardcodé), 3 fonctions `hit_cv_*`, une fonction `save_report()`, et on étend `run_scenario()` + le CLI. Aucun nouveau fichier Python créé.

**Tech Stack:** Python 3.11, asyncio, aiohttp, argparse, json, pathlib — tout déjà importé ou stdlib.

**Spec:** `docs/superpowers/specs/2026-03-13-cv-load-testing-design.md`

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `load_test.py` | Modifier | +constantes réalistes, +3 hit_cv_*, +save_report(), +crash detection, +modes, +CLI étendu |
| `docs/load-testing-reports/` | Créé auto | Rapports JSON/MD (gitignored) |
| `test_load_helpers.py` | Créer (racine) | Tests unitaires save_report() + crash detection logic |

Note : le fichier de test est à la racine (pas dans `tests/`) car `tests/conftest.py` fait `from main import app` qui n'existe pas à la racine → plante à l'import.

---

## Chunk 1 — Constantes réalistes + save_report()

### Task 1: Constantes CV_TEXT, JOB_DESC, CV_DATA_HARDCODED

**Files:**
- Modify: `load_test.py` — ajouter après la ligne `COACH_MESSAGES = [...]`

- [ ] **Step 1: Ajouter les constantes après `COACH_MESSAGES`**

Ouvrir `load_test.py`. Après le bloc `COACH_MESSAGES = [...]` (ligne ~31), ajouter :

```python
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
```

- [ ] **Step 2: Vérifier que les constantes sont présentes et non-vides**

```bash
python -c "
import load_test as lt
assert len(lt.CV_TEXT_REALISTE) > 500, 'CV_TEXT_REALISTE trop court'
assert len(lt.JOB_DESC_REALISTE) > 100, 'JOB_DESC_REALISTE trop court'
assert isinstance(lt.CV_DATA_HARDCODED, dict), 'CV_DATA_HARDCODED doit être un dict'
assert 'personal_info' in lt.CV_DATA_HARDCODED
assert 'experiences' in lt.CV_DATA_HARDCODED
print(f'OK — CV_TEXT: {len(lt.CV_TEXT_REALISTE)} chars, JOB_DESC: {len(lt.JOB_DESC_REALISTE)} chars')
"
```
Attendu : `OK — CV_TEXT: 1200+ chars, JOB_DESC: 600+ chars`

---

### Task 2: Fonction save_report()

**Files:**
- Modify: `load_test.py` — ajouter après `print_report()`
- Create: `tests/test_load_helpers.py`

- [ ] **Step 1: Écrire le test unitaire d'abord**

Créer `test_load_helpers.py` à la racine du projet (PAS dans `tests/` — le conftest.py de ce dossier importe `main.py` qui n'existe pas à la racine) :

```python
"""Tests unitaires pour les helpers load_test.py."""
import json
import os
import sys
import tempfile
from pathlib import Path
from collections import defaultdict

# Importer depuis la racine (ce fichier EST à la racine)
sys.path.insert(0, str(Path(__file__).parent))


def test_save_report_creates_json_and_md(monkeypatch, tmp_path):
    """save_report() doit créer un .json ET un .md dans le répertoire cible."""
    import load_test as lt

    # Patcher le répertoire de sortie
    monkeypatch.setattr(lt, "REPORTS_DIR", str(tmp_path))

    # Simuler des résultats
    lt.RESULTS.clear()
    lt.ERRORS.clear()
    lt.RESULTS["upload"] = [1.0, 1.2, 0.9, 2.0, 1.5]
    lt.RESULTS["poll"] = [20.0, 25.0, 30.0, 22.0, 28.0]
    lt.ERRORS["poll_timeout"] = 1

    lt.save_report("cv_sequential", "burst", n_users=5, duration=45.0)

    files = list(tmp_path.iterdir())
    json_files = [f for f in files if f.suffix == ".json"]
    md_files = [f for f in files if f.suffix == ".md"]

    assert len(json_files) == 1, "Doit créer exactement 1 fichier JSON"
    assert len(md_files) == 1, "Doit créer exactement 1 fichier MD"

    data = json.loads(json_files[0].read_text())
    assert data["meta"]["scenario"] == "cv_sequential"
    assert data["meta"]["mode"] == "burst"
    assert data["meta"]["users"] == 5
    assert "upload" in data["steps"]
    assert "p50" in data["steps"]["upload"]
    assert "p95" in data["steps"]["upload"]


def test_save_report_detects_breakdown_level():
    """save_report() doit identifier le seuil de rupture si error_rate > 20%.

    Calcul: _compute_error_rate() = ERRORS_total / (RESULTS_total + ERRORS_total)
    Setup: 8 succès + 3 erreurs = 11 total → 3/11 ≈ 27.3% > 20% → breakdown_level non-None
    """
    import load_test as lt

    lt.RESULTS.clear()
    lt.ERRORS.clear()
    # 8 succès dans RESULTS (dénominateur = 8+3 = 11)
    lt.RESULTS["upload"] = [1.0, 1.1, 0.9, 1.2, 0.8, 1.0, 1.3, 0.95]  # 8 items
    lt.ERRORS["upload_error"] = 3  # 3 erreurs → 3/11 ≈ 27% > 20%

    report = lt._build_report("cv_sequential", "burst", n_users=11, duration=10.0)
    assert report["breakdown_level"] is not None, (
        f"breakdown_level doit être non-None quand error_rate={3/11:.1%} > 20%"
    )


def test_crash_detection_threshold():
    """_compute_error_rate() doit retourner le bon ratio."""
    import load_test as lt

    lt.RESULTS.clear()
    lt.ERRORS.clear()
    lt.RESULTS["coach"] = [1.0] * 80
    lt.ERRORS["coach_timeout"] = 20  # 20/100 = 20% exact

    rate = lt._compute_error_rate()
    assert abs(rate - 0.20) < 0.01
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue (fonctions pas encore créées)**

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
python -m pytest test_load_helpers.py -v --no-header 2>&1 | head -30
```
Attendu : `ImportError` ou `AttributeError` — normal, `save_report` n'existe pas encore.

- [ ] **Step 3: Implémenter save_report() + helpers dans load_test.py**

Ajouter après `print_report()` (vers ligne ~151) :

```python
# ─── Rapport auto-sauvegardé ──────────────────────────────────────────────

REPORTS_DIR = "docs/load-testing-reports"


def _compute_error_rate() -> float:
    """Calcule le taux d'erreur global sur toutes les métriques courantes."""
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
    """Construit le dict rapport sans écrire sur disque."""
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

    # Détecter le bottleneck : l'étape avec le plus grand P95
    bottleneck = None
    if steps:
        bottleneck = max(steps, key=lambda k: steps[k]["p95"])

    # Recommandations automatiques
    recommendations = []
    if "poll" in steps and steps["poll"]["p95"] > 90:
        recommendations.append("Modal cold start trop lent — envisager un warm-up ou passer à Modal dedicated workers.")
    if any(v for k, v in ERRORS.items() if "429" in k):
        recommendations.append("Groq rate limit (429) atteint — réduire la concurrence coach/adapt ou passer à Groq Batch API.")
    if any(v for k, v in ERRORS.items() if "timeout" in k and "poll" in k):
        recommendations.append("Timeout Modal détecté — augmenter le timeout poll ou réduire la concurrence CV async.")
    if error_rate > 0.20:
        recommendations.append(f"Taux d'erreur {error_rate:.0%} > 20% à {n_users} users — c'est le seuil de rupture identifié.")
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
    """Sauvegarde le rapport courant en JSON + MD dans REPORTS_DIR."""
    import os
    os.makedirs(REPORTS_DIR, exist_ok=True)

    report = _build_report(scenario, mode, n_users, duration)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
    base = f"{timestamp}_{scenario}_{mode}"

    # JSON
    json_path = os.path.join(REPORTS_DIR, f"{base}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Markdown
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

    lines += [
        f"",
        f"## Recommandations",
        f"",
    ]
    for r in report["recommendations"]:
        lines.append(f"- {r}")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\n  💾 Rapport sauvegardé : {json_path}")
    print(f"  💾 Rapport sauvegardé : {md_path}")
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
python -m pytest test_load_helpers.py -v --no-header
```
Attendu :
```
PASSED tests/test_load_helpers.py::test_save_report_creates_json_and_md
PASSED tests/test_load_helpers.py::test_save_report_detects_breakdown_level
PASSED tests/test_load_helpers.py::test_crash_detection_threshold
```

- [ ] **Step 5: Vérifier que le fichier parse toujours**

```bash
python -c "import load_test; print('OK')"
```

---

## Chunk 2 — Fonctions hit_cv_sequential() + hit_cv_realistic() + hit_cv_stress()

### Task 3: hit_cv_sequential()

**Files:**
- Modify: `load_test.py` — ajouter après `hit_auth()`

- [ ] **Step 1: Implémenter hit_cv_sequential()**

Ajouter après `hit_auth()` (vers ligne ~119) :

```python
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
                print(f"  [user {user_id:03d}] cv_upload ✅ {r.status} cv_id={cv_id[:8]}… — {elapsed:.2f}s")
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
        print(f"  [user {user_id:03d}] cv_upload 💀 test_cv.pdf introuvable — lancer depuis la racine du projet")
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
    poll_timeout = 150  # 120s processing + 30s cold start marge
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
```

- [ ] **Step 2: Vérifier que le fichier parse**

```bash
python -c "import load_test; print('hit_cv_sequential:', load_test.hit_cv_sequential)"
```
Attendu : `hit_cv_sequential: <function hit_cv_sequential at 0x...>`

---

### Task 4: hit_cv_realistic() + hit_cv_stress()

**Files:**
- Modify: `load_test.py` — ajouter après `hit_cv_sequential()`

- [ ] **Step 1: Implémenter hit_cv_realistic()**

```python
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
        # 60% — Analyse LLM async
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

        # Poll status
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
                status_icon = "✅" if r.status == 200 else ("⚠️ " if r.status == 429 else "❌")
                print(f"  [user {user_id:03d}] realistic/adapt {status_icon} {r.status} — {elapsed:.2f}s")
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
                status_icon = "✅" if r.status == 200 else ("⚠️ " if r.status == 429 else "❌")
                print(f"  [user {user_id:03d}] realistic/cover {status_icon} {r.status} — {elapsed:.2f}s")
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
```

- [ ] **Step 2: Implémenter hit_cv_stress()**

```python
async def hit_cv_stress(session, token, user_id):
    """
    Worst case : toutes les étapes en parallèle pour chaque user.
    asyncio.gather() lance les 4 appels simultanément.
    """
    # Pour le stress test : adapter + cover letter en parallèle (pas de chaînage)
    # car l'upload→poll est séquentiel par nature — on stresse Groq + Modal en même temps
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

    # Tout en parallèle — c'est le stress test
    await asyncio.gather(_upload(), _adapt(), _cover(), return_exceptions=True)
```

- [ ] **Step 3: Vérifier que les 3 fonctions sont définies**

```bash
python -c "
import load_test as lt
print('hit_cv_sequential:', callable(lt.hit_cv_sequential))
print('hit_cv_realistic:', callable(lt.hit_cv_realistic))
print('hit_cv_stress:', callable(lt.hit_cv_stress))
"
```
Attendu : `True` pour les 3.

---

## Chunk 3 — Mode support + crash detection + run_scenario() étendu

### Task 5: Modes burst/ramp/wave + crash detection dans run_scenario()

**Files:**
- Modify: `load_test.py` — remplacer `run_scenario()` et ajouter `run_cv_levels()`

- [ ] **Step 1: Ajouter `run_cv_levels()` après `ramp_scenario()`**

Cette fonction gère les niveaux progressifs avec crash detection entre chaque niveau.

```python
async def run_cv_levels(scenario: str, token: str, mode: str, levels: list, adaptive: bool = False):
    """
    Lance un scénario CV sur plusieurs niveaux de concurrence progressifs.
    Entre chaque niveau : crash detection → pause si >20%, stop si >50%.

    Args:
        scenario: "cv_sequential" | "cv_realistic" | "cv_stress"
        token: JWT Bearer
        mode: "burst" | "ramp" | "wave"
        levels: liste de n_users à tester ex. [5, 10, 20, 50]
        adaptive: si True, monte au niveau suivant seulement si P95 < seuil
    """
    # Seuils P95 par scénario (en secondes)
    p95_thresholds = {
        "cv_sequential": 150.0,
        "cv_realistic": 90.0,
        "cv_stress": 120.0,
    }
    p95_ok_to_advance = {
        "cv_sequential": 90.0,  # poll P95 < 90s → monter
        "cv_realistic": 60.0,
        "cv_stress": 80.0,
    }

    for n_users in levels:
        # Reset métriques pour ce niveau
        RESULTS.clear()
        ERRORS.clear()

        print(f"\n{'━'*60}")
        print(f"  🚀 {scenario.upper()} / {mode.upper()} — {n_users} users")
        print(f"{'━'*60}")

        level_start = time.time()

        connector = aiohttp.TCPConnector(limit=n_users + 20, limit_per_host=n_users + 20)
        async with aiohttp.ClientSession(connector=connector) as session:

            if mode == "burst":
                # Tous en même temps
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
                # 1 user/sec
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
                # Vague de n_users toutes les 10s pendant 3 minutes
                end_time = time.time() + 180
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

        # ── Adaptive: vérifier si on doit monter ──────────────────────────
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
```

- [ ] **Step 2: Vérifier que le fichier parse**

```bash
python -c "import load_test; print('run_cv_levels:', callable(load_test.run_cv_levels))"
```
Attendu : `True`

---

## Chunk 4 — CLI étendu + intégration main()

### Task 6: Étendre main() avec les nouveaux scénarios et options --mode / --adaptive

**Files:**
- Modify: `load_test.py` — modifier `main()` et les `argparse` args

- [ ] **Step 1: Étendre argparse dans main()**

Dans `main()`, remplacer le bloc `parser = argparse.ArgumentParser()` par :

```python
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=False, default="", help="JWT Bearer token")
    parser.add_argument(
        "--scenario", default="health",
        choices=["health", "coach", "jobs", "auth", "mixed", "ramp",
                 "cv_sequential", "cv_realistic", "cv_stress"],
        help="Scénario à tester",
    )
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
```

- [ ] **Step 2: Ajouter les branches CV dans main()**

Après le bloc `elif args.scenario == "ramp":` existant, ajouter :

```python
    elif args.scenario in ("cv_sequential", "cv_realistic", "cv_stress"):
        if not args.token:
            print("❌ --token requis pour les scénarios CV")
            return

        # Niveaux de concurrence selon le scénario
        levels_map = {
            "cv_sequential": [5, 10, 20, 50],
            "cv_realistic":  [10, 25, 50],
            "cv_stress":     [10, 20],
        }
        # Si --users fourni explicitement, utiliser seulement ce niveau
        default_levels = levels_map[args.scenario]
        if args.users != 10:  # 10 = valeur par défaut → l'user n'a pas spécifié
            levels = [args.users]
        else:
            levels = default_levels

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
        # Le rapport est déjà sauvegardé par run_cv_levels après chaque niveau
        return  # Évite le print_report final (déjà fait dans run_cv_levels)
```

Note : mettre ce bloc **avant** l'appel final `print_report(args.scenario, args.users, duration)`.

- [ ] **Step 3: Ajouter `import json` si pas déjà présent**

Vérifier en tête de fichier. Si `import json` manque, l'ajouter avec les autres imports.

```bash
head -20 load_test.py | grep json
```
Si absent : ajouter `import json` ligne ~17.

- [ ] **Step 4: Smoke test avec 1 user (vrai appel prod)**

**IMPORTANT : le JWT expire en ~1h. Le régénérer avant ce test.**

```bash
# Régénérer le token
TOKEN=$(curl -s -X POST "https://ngiakfikbuyugqfqtfwp.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5naWFrZmlrYnV5dWdxZnF0ZndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MDI5MjcsImV4cCI6MjA4NTA3ODkyN30.rXCxu742sTGp5GKjU-BMlb1hyLHwwtfVAXhJ8EzOKMg" \
  -H "Content-Type: application/json" \
  -d '{"email":"wissemkarboubbb@gmail.com","password":"Wissem2002."}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Smoke test cv_sequential — 1 user seulement pour valider le chaînage
python load_test.py --token "$TOKEN" --scenario cv_sequential --users 1 --mode burst
```

Attendu : voir les 4 étapes `cv_upload ✅ → cv_poll ✅ → cv_adapt ✅ → cv_cover_letter ✅` et un rapport MD créé dans `docs/load-testing-reports/`.

Si cv_upload échoue avec 404 → vérifier que le backend répond : `curl https://huntzenjobs-production.up.railway.app/api/health/ping`

- [ ] **Step 5: Smoke test cv_realistic — 1 user**

```bash
python load_test.py --token "$TOKEN" --scenario cv_realistic --users 1 --mode burst
```
Attendu : 1 des 3 segments exécuté (selon user_id % 10 = 1 → segment upload+poll).

- [ ] **Step 6: Lancer les vrais tests dans l'ordre du plan**

```bash
# 1. Baseline
python load_test.py --token "$TOKEN" --scenario health --users 200

# 2. Auth
python load_test.py --token "$TOKEN" --scenario auth --users 50
python load_test.py --token "$TOKEN" --scenario auth --users 100

# 3. Coach
python load_test.py --token "$TOKEN" --scenario coach --users 15
python load_test.py --token "$TOKEN" --scenario coach --users 50

# 4. Mixed
python load_test.py --token "$TOKEN" --scenario mixed --users 50
python load_test.py --token "$TOKEN" --scenario mixed --users 100

# 5. Ramp
python load_test.py --token "$TOKEN" --scenario ramp

# 6. CV Sequential — tous niveaux adaptatifs
python load_test.py --token "$TOKEN" --scenario cv_sequential --mode burst --adaptive

# 7. CV Realistic
python load_test.py --token "$TOKEN" --scenario cv_realistic --mode burst
python load_test.py --token "$TOKEN" --scenario cv_realistic --mode ramp

# 8. CV Stress
python load_test.py --token "$TOKEN" --scenario cv_stress --mode burst
```

- [ ] **Step 7: Vérifier les rapports générés**

```bash
ls -la docs/load-testing-reports/
```
Attendu : un `.json` et `.md` par run CV.

---

## Récapitulatif des fichiers modifiés

| Fichier | Lignes ajoutées | Changement |
|---------|----------------|-----------|
| `load_test.py` | ~280 lignes | Constantes + 3 hit_cv_* + run_cv_levels() + save_report() + helpers + CLI |
| `test_load_helpers.py` | ~55 lignes | Tests unitaires helpers (racine, hors tests/conftest.py) |
| `docs/load-testing-reports/` | — | Créé auto au premier run |

## Ordre d'exécution

```
Chunk 1 → Task 1 (constantes) → Task 2 (save_report + tests) → tests passent
Chunk 2 → Task 3 (cv_sequential) → Task 4 (cv_realistic + cv_stress) → parse OK
Chunk 3 → Task 5 (run_cv_levels + modes) → parse OK
Chunk 4 → Task 6 (CLI + intégration) → smoke test 1 user → vrais tests prod
```
