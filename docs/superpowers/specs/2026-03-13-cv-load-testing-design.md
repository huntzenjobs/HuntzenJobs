# Design Spec — Scénarios Load Test CV HuntZen

**Date :** 2026-03-13
**Statut :** Approuvé (v2 — blockers résolus)
**Fichier cible :** `load_test.py` (extension Option A)

---

## Contexte

Le backend Railway est stable et déployé. Les scénarios existants (`health`, `auth`, `coach`, `jobs`, `mixed`, `ramp`) couvrent les endpoints simples. Il manque les scénarios CV qui testent la chaîne la plus lourde : Modal (Docling PDF extraction) → Groq (adaptation LLM) → PgBouncer (quota).

**Objectif :** Trouver les limites exactes de l'infrastructure sous charge CV, vérifier que la queue gère sans crash, et produire un rapport archivable.

---

## Infrastructure cible

| Composant | Config | Limite connue |
|-----------|--------|---------------|
| Railway | 2–4 replicas, 4 workers/replica | Autoscaling CPU 60% |
| Supabase PgBouncer | transaction mode, pool_size=15, max_clients=200 | 200 connexions simultanées |
| Groq | llama-4-scout-17b + llama-3.3-70b-versatile | 300K TPM chacun |
| Modal | CV async processing (Docling) | Cold start ~30s, scalable |
| Redis Upstash | Rate limiting SlowAPI | swallow_errors=True |

---

## Schémas d'API exacts (extraits du code source)

### POST /api/cv-analysis/async
```
Content-Type: multipart/form-data
Headers: Authorization: Bearer <token>
Body:
  file: <PDF binary>         -- OU --
  cv_text: <str>             -- l'un des deux obligatoire
  job_description: <str>     -- optionnel
  language: "fr"             -- défaut "fr"

Response 200:
  {"success": true, "cv_id": "<uuid>", "status": "pending", "message": "...", "estimated_time_seconds": 15}
Response 401: token manquant
Response 400: ni file ni cv_text fourni
```

### GET /api/cv-analysis/status/{cv_id}
```
Headers: Authorization: Bearer <token>  (optionnel)

Response 200:
  {
    "cv_id": "<uuid>",
    "status": "pending" | "processing" | "completed" | "failed",
    "result": {...},          -- présent seulement si status="completed"
    "error": "...",           -- présent seulement si status="failed"
    "created_at": "...",
    "completed_at": "...",
    "processing_time_seconds": 12.5
  }

Condition terminaison poll: status == "completed" OR status == "failed"
```

### POST /api/cv-adapter/adapt
```
Content-Type: multipart/form-data
Headers: Authorization: Bearer <token>
Body:
  job_description: <str>     -- obligatoire, min 50 chars
  language: "fr"
  template: "ats"
  cv_text: <str>             -- min 100 chars, obligatoire si pas de file

Response 200:
  {"success": true, "cv_data": {...}, "match_score": ..., "job_analysis": ..., "fact_check": ...}
Response 400: cv_text < 100 chars ou job_description < 50 chars
```

### POST /api/cv-adapter/generate-cover-letter/json
```
Content-Type: application/json
Headers: Authorization: Bearer <token>
Body:
  {
    "cv_data": {...},          -- dict structuré (issu de /adapt)
    "job_description": "...",  -- min 50 chars
    "language": "fr",
    "company_name": "..."      -- optionnel
  }

Note: on utilise /json (pas /generate-cover-letter) pour éviter de recevoir
des PDF binaires de plusieurs MB en mémoire pendant le load test.

Response 200: JSON avec le contenu de la lettre
```

---

## CV Text réaliste hardcodé

Profil : **Karim Benali, développeur Full-Stack Python/React, 6 ans d'expérience, Paris**
Longueur : ~900 mots — suffisant pour déclencher le vrai processing Groq/Modal.

```
KARIM BENALI
Développeur Full-Stack Python / React — 6 ans d'expérience
Paris 75011 | karim.benali@gmail.com | +33 6 12 34 56 78
LinkedIn: linkedin.com/in/karimbenali | GitHub: github.com/kbenali

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÉSUMÉ PROFESSIONNEL
Développeur Full-Stack passionné avec 6 ans d'expérience dans la conception et
le développement d'applications web haute performance. Spécialisé dans les
architectures microservices Python/FastAPI côté backend et React/TypeScript
côté frontend. Expérience significative en traitement de données à grande
échelle, intégration d'APIs LLM (OpenAI, Anthropic, Groq), et déploiement
Cloud (GCP, AWS). Contributeur open source actif.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FORMATION

Master Informatique — Spécialité IHM et Applications Distribuées
Université Paris-Saclay, Orsay (2016–2018) — Mention Bien

Licence Informatique — Parcours Génie Logiciel
Université Claude Bernard Lyon 1 (2013–2016) — Major de promotion

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROJETS PERSONNELS

FastAPI-Starter (GitHub ★ 420)
Boilerplate production-ready FastAPI avec auth JWT, RBAC, rate limiting Redis,
tests pytest, Docker Compose, GitHub Actions. Utilisé par +300 projets.

LLM-Cost-Tracker (GitHub ★ 180)
Dashboard open source de suivi des coûts LLM (OpenAI, Anthropic, Groq).
React + FastAPI + SQLite. Feature flags, alertes email.

PGVector-Search (contribution)
Contribué à l'implémentation du similarity search pgvector pour le projet
django-pgvector — PR mergée, +150 stars sur le repo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CERTIFICATIONS
- Google Cloud Professional Data Engineer (2023)
- AWS Certified Solutions Architect — Associate (2021)
- Python Institute PCEP (2019)

LANGUES
- Français : natif
- Anglais : courant (TOEIC 945/990, 2020)
- Arabe : courant
```

**cv_data hardcodé** (pour le scénario cover-letter seul — 10% de cv_realistic) :
```json
{
  "personal_info": {"name": "Karim Benali", "email": "karim.benali@gmail.com", "phone": "+33 6 12 34 56 78", "location": "Paris 75011"},
  "summary": "Développeur Full-Stack Python/React, 6 ans d'expérience, spécialisé FastAPI, microservices et intégration LLM.",
  "experiences": [
    {"company": "Criteo", "title": "Ingénieur Logiciel Senior", "duration": "2022–présent", "highlights": ["Pipelines Kafka 50M events/day", "API FastAPI 2000 req/s", "Migration microservices +35% perf"]},
    {"company": "Lydia Solutions", "title": "Développeur Full-Stack", "duration": "2020–2022", "highlights": ["React 18 / 3M users", "WebSockets temps réel 200ms", "Tests 40%→82%"]},
    {"company": "Sopra Steria", "title": "Développeur Backend", "duration": "2018–2020", "highlights": ["APIs REST grands comptes BNP/SNCF", "CI/CD Jenkins"]}
  ],
  "skills": ["Python", "FastAPI", "React", "TypeScript", "PostgreSQL", "Redis", "Kafka", "Docker", "Kubernetes", "GCP", "AWS", "LLM/AI"],
  "education": [{"degree": "Master Informatique", "school": "Université Paris-Saclay", "year": "2018"}]
}
```

**job_description hardcodé** (réaliste, 200+ mots) :
```
Développeur Backend Python Senior — FinTech Scale-up, Paris

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
- Salaire : 65–80K€ selon profil
- Full remote possible (1 jour/semaine présentiel à Paris 9e)
- 10% du temps dédié à la R&D et projets perso
- Budget formation 3000€/an
- Tickets resto, mutuelle premium, BSPCE
```

---

## Nouveaux scénarios

### 1. `cv_sequential`

Flow complet séquentiel par user. Chaque user fait les 4 étapes dans l'ordre, avec les données passées entre étapes.

**Étapes :**
```
1. POST /api/cv-analysis/async
   Body: multipart, file=test_cv.pdf, language="fr"
   → Extrait: cv_id

2. GET /api/cv-analysis/status/{cv_id}
   Poll toutes les 3s jusqu'à status=="completed" ou "failed"
   Timeout: 150s (120s processing + 30s cold start marge)
   Si status=="failed" ou timeout → loggue erreur, skip étapes 3 et 4

3. POST /api/cv-adapter/adapt
   Body: multipart, cv_text=CV_TEXT_REALISTE, job_description=JOB_DESC, language="fr", template="ats"
   → Extrait: cv_data (dict depuis response["cv_data"])

4. POST /api/cv-adapter/generate-cover-letter/json
   Body: JSON, cv_data=cv_data (step 3), job_description=JOB_DESC, language="fr", company_name="Fintech Scale-up Paris"
```

**Concurrence :** 5 → 10 → 20 → 50 users
**Règle adaptive :** si P95 étape 2 (poll) < 90s → monter au niveau suivant automatiquement

---

### 2. `cv_realistic`

Mix comportemental (modulo comme le scénario `mixed` existant).

| user_id % 10 | Segment | Étapes | Endpoint |
|--------------|---------|--------|----------|
| 0–5 (60%) | Analyse only | POST /api/cv-analysis/async (cv_text, pas file) + poll | Modal, PgBouncer |
| 6–8 (30%) | Adapt only | POST /api/cv-adapter/adapt (cv_text hardcodé) | Groq, PgBouncer |
| 9 (10%) | Cover letter only | POST /api/cv-adapter/generate-cover-letter/json (cv_data hardcodé) | Groq 70B |

Note: segment "Analyse only" utilise `cv_text` (pas file upload) pour éviter le cold start Modal — teste uniquement la chaîne LLM d'analyse.

**Concurrence :** 10 → 25 → 50 users

---

### 3. `cv_stress`

Worst case absolu — tous les users lancent **toutes** les étapes simultanément (pas séquentiellement).
Chaque user fait les 4 appels en parallèle (`asyncio.gather`).

**Concurrence :** 10 → 20 users

---

## Modes d'exécution

Tous les scénarios CV supportent `--mode` :

| Mode | Comportement | `delay_between_users` | Teste |
|------|-------------|----------------------|-------|
| `burst` | Tous les users partent en même temps | 0 | Spike / lancement viral |
| `ramp` | 1 user/sec | 1.0 | Queue soutenue, no crash |
| `wave` | Vague de N users toutes les 10s pendant 3 min | 0 (vague) | Recovery entre vagues |

**Défaut :** `--mode burst` (comportement identique aux scénarios existants)

---

## Authentification

**Token unique** pour tous les users virtuels simultanés (le `--token` existant).

Implication : le rate limiting backend est par-IP (SlowAPI + Redis), pas par-user sur ces endpoints CV. 50 users simultanés avec le même token = 50 connexions PgBouncer depuis Railway, pas 50 users distincts. Cela teste les limites d'infrastructure (workers, DB pool, Groq TPM) correctement.

---

## Détection crash / dégradation automatique

Évaluée après chaque niveau de concurrence (pas après chaque requête) :

```python
error_rate = errors / total_requests

if error_rate > 0.50:
    # ARRÊT immédiat du niveau en cours
    # Diagnostic: GET /api/health/ping
    # Log état avant de passer au niveau suivant
    break_level = current_users

elif error_rate > 0.20:
    # WARNING dans rapport
    # Pause 30s (attente fin des coroutines en vol, stop nouveaux spawns)
    # Continue au niveau suivant avec flag "dégradé"
```

La pause 30s = `asyncio.sleep(30)` après `asyncio.gather()` — les coroutines en vol terminent normalement, les nouveaux spawns sont bloqués.

---

## Métriques et rapport

**Fenêtre de calcul :** percentiles calculés sur l'ensemble du niveau de concurrence entier (pas par vague). En mode `wave`, les percentiles sont calculés par vague ET globalement.

**Seuil de rupture :** premier niveau de concurrence (`n_users`) où `error_rate > 0.20` OU `P95 > timeout_seuil` :
- `cv_sequential` : P95 > 150s
- `cv_realistic` : P95 > 90s
- `cv_stress` : P95 > 120s

**Fichiers générés :**
```
docs/load-testing-reports/
  2026-03-13_14-30_cv_sequential_burst.json
  2026-03-13_14-30_cv_sequential_burst.md
  2026-03-13_14-31_cv_realistic_ramp.json
  2026-03-13_14-31_cv_realistic_ramp.md
  ...
```

**Contenu JSON :**
```json
{
  "meta": {"scenario": "cv_sequential", "mode": "burst", "users": 20, "date": "...", "duration_s": 45.2},
  "steps": {
    "upload": {"p50": 1.2, "p95": 3.1, "p99": 5.0, "success_rate": 0.95, "errors": {}},
    "poll": {"p50": 22.0, "p95": 87.0, "p99": 130.0, "success_rate": 0.90, "errors": {"timeout": 2}},
    "adapt": {"p50": 8.5, "p95": 25.0, "p99": 40.0, "success_rate": 0.95, "errors": {"groq_429": 1}},
    "cover_letter": {"p50": 4.0, "p95": 12.0, "p99": 20.0, "success_rate": 1.0, "errors": {}}
  },
  "breakdown_level": null,
  "bottleneck": "modal_poll",
  "recommendations": ["..."]
}
```

**Contenu MD :** tableau lisible pour présentation au boss.

---

## CLI étendu

```bash
# Scénario séquentiel, burst de 20 users
python load_test.py --token "..." --scenario cv_sequential --users 20 --mode burst

# Scénario réaliste, ramp 50 users
python load_test.py --token "..." --scenario cv_realistic --users 50 --mode ramp

# Stress test, wave 20 users
python load_test.py --token "..." --scenario cv_stress --users 20 --mode wave

# Lancer tous les niveaux automatiquement (5→10→20→50)
python load_test.py --token "..." --scenario cv_sequential --mode burst --adaptive
```

---

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `load_test.py` | +3 fonctions hit_cv_* (+~250 lignes), +3 modes, +save_report(), +crash detection, +cv_text/cv_data/job_desc réalistes |
| `docs/load-testing-reports/` | Créé automatiquement au premier run |

---

## Critères de succès

- [ ] Les 3 scénarios s'exécutent sans exception Python non gérée
- [ ] Le chaînage cv_sequential passe les données entre étapes (cv_id → poll → cv_data → cover letter)
- [ ] Les rapports JSON et MD sont créés dans `docs/load-testing-reports/` après chaque run
- [ ] La crash detection loggue et continue proprement sans planter le script
- [ ] Le cv_text réaliste (~900 mots) déclenche le vrai processing Groq
- [ ] Les niveaux de concurrence poussent jusqu'aux limites mesurées (seuil de rupture identifié par composant)
- [ ] Le mode `--adaptive` monte automatiquement si P95 < seuil
