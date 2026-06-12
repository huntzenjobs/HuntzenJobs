# Guide d'onboarding HuntZen

> **Pour qui :** tout nouveau membre de l'équipe technique (backend, frontend, DevOps, product).
> **Objectif :** comprendre le projet en 15 min, être productif en 1 journée.
> **Comment lire ce guide :** suivre les sections dans l'ordre. Chaque doc référencé a une fiche dans la section [Fiches par document](#fiches-par-document).

---

## 1. Le projet en 30 secondes

**HuntZen** est une plateforme SaaS d'aide à la recherche d'emploi assistée par IA. Cinq piliers d'infrastructure :

| Pilier | Stack | Hébergement |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui | **Vercel** |
| Backend API | FastAPI Python 3.11 + LangChain (agents IA) + Groq LLM | **Railway** (branche `Production`) |
| CV Processor | Service serverless dédié — extraction PDF Docling + analyse LLM Groq | **Modal Labs** (`huntzen-cv-processor`) |
| Base de données | Supabase PostgreSQL (74+ migrations) + Auth + Storage | **Supabase Cloud** |
| Cache / Queue | Redis (cache 2h) + ARQ workers | **Upstash + Railway** |

> **Note Modal vs Railway :** Railway héberge le backend API principal (FastAPI). Modal Labs n'est utilisé que pour le **traitement asynchrone des CV** (upload PDF → spawn fonction Modal non-bloquante → polling depuis le frontend). Voir `backend/src/modal_integration.py`.

URLs prod : frontend `https://huntzenjobs.com`, backend `https://huntzenjobs-production.up.railway.app`.

Modèle : freemium + premium (Stripe). Multi-langues : fr, en, es, pt.

---

## 2. Parcours d'onboarding par durée

### ⏱ 15 minutes — Comprendre ce qu'on construit
1. Lire ce fichier (ONBOARDING.md) — sections 1, 2, 3
2. Lire [`README.md`](../README.md) — sections "Features" et "Tech Stack" uniquement
3. Lire [`docs/architecture/overview.md`](architecture/overview.md) — sections 1 et 2

### ⏱ 1 heure — Lancer le projet en local
1. Lire [`docs/setup/docker.md`](setup/docker.md) — section "Démarrage rapide"
2. Cloner, configurer `.env` (copier `.env.example`), lancer `npm run dev`
3. Vérifier que `http://localhost:3000` charge et que `http://localhost:8000/docs` affiche Swagger
4. Lire [`CONTRIBUTING.md`](../CONTRIBUTING.md) — sections "Workflow Git" et "Conventions"

### ⏱ 1 journée — Être autonome sur sa première PR
1. Lire complètement [`CONTRIBUTING.md`](../CONTRIBUTING.md) — règles projet et workflow Git
2. Selon ton rôle :
   - **Backend** → [`backend/AGENTS.md`](../backend/AGENTS.md) (stack, structure `src/`, patterns)
   - **Frontend** → [`frontend-next/AGENTS.md`](../frontend-next/AGENTS.md) (composants, hooks, auth SSR)
3. Lire [`docs/audit/MAP.md`](audit/MAP.md) en **diagonale** — sert d'index du code (119 composants, 157 endpoints, 36 tables)
4. Faire un tour du [`docs/RUNBOOK.md`](RUNBOOK.md) pour savoir où chercher en cas d'incident

### ⏱ 1 semaine — Maîtrise opérationnelle
1. Lire en détail [`docs/RUNBOOK.md`](RUNBOOK.md) — toutes les sections
2. Lire [`DEPLOYMENT.md`](../DEPLOYMENT.md) — pour comprendre la chaîne CI/CD (⚠️ **voir gap connu §5**)
3. Lire [`docs/architecture/scaling.md`](architecture/scaling.md) — capacités actuelles et limites
4. Selon besoin : audits ciblés dans `docs/audit/subagents/`

---

## 3. Hiérarchie des documents

### 🟢 Tier 1 — ESSENTIEL (lire avant de toucher au code)

| Doc | Pourquoi | Quand |
|---|---|---|
| [`README.md`](../README.md) | Présentation produit, stack, quickstart | Tout nouveau dev |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Workflow Git, conventions, ouverture de PR | Tout nouveau dev |
| [`docs/architecture/overview.md`](architecture/overview.md) | Vue d'ensemble technique (17 sections) | Tout nouveau dev |
| [`docs/setup/docker.md`](setup/docker.md) | Lancer le stack en local | Avant 1ère exécution |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Workflow Git, conventions, PR | Avant 1ère PR |
| [`docs/audit/MAP.md`](audit/MAP.md) | **Cartographie exhaustive du code** (composants, endpoints, tables) | Avant créer/modifier |

### 🟡 Tier 2 — RÉFÉRENCE (consulter selon le besoin)

| Doc | Quand le consulter |
|---|---|
| [`docs/RUNBOOK.md`](RUNBOOK.md) | Incident prod, déploiement, monitoring, crons |
| [`DEPLOYMENT.md`](../DEPLOYMENT.md) | Déployer ou modifier l'infra (Railway + Modal + Vercel + Supabase) |
| [`docs/architecture/scaling.md`](architecture/scaling.md) | Comprendre capacités / goulots / chiffres prod |
| [`docs/architecture/scaling-flows.md`](architecture/scaling-flows.md) | Simuler la charge d'un scénario utilisateur |
| [`docs/COMPTES_PASSATION.md`](COMPTES_PASSATION.md) | Lister les comptes / accès lors d'une passation |

### 🔵 Tier 3 — SPÉCIALISÉ par rôle

**Backend dev**
- [`backend/AGENTS.md`](../backend/AGENTS.md) — stack, structure `src/`, patterns routes, agents LangChain, ARQ
- [`docs/audit/admin-api-audit.md`](audit/admin-api-audit.md) — référence API admin
- [`supabase/migrations/README_SUBSCRIPTION_MIGRATION.md`](../supabase/migrations/README_SUBSCRIPTION_MIGRATION.md) — migration souscriptions

**Frontend dev**
- [`frontend-next/AGENTS.md`](../frontend-next/AGENTS.md) — composants, hooks, auth Supabase SSR, i18n, tests
- [`frontend-next/src/lib/constants/README.md`](../frontend-next/src/lib/constants/README.md) — z-index scale
- [`docs/audit/i18n-todo.md`](audit/i18n-todo.md) — i18n restant à faire

**QA / Tests**
- [`tests/README.md`](../tests/README.md) — load testing k6 (⚠️ ne couvre PAS pytest/vitest/playwright)
- [`e2e/bugs/README.md`](../e2e/bugs/README.md) — tests E2E Playwright ciblés bugs
- [`scripts/benchmarks/README.md`](../scripts/benchmarks/README.md) — benchmarks couverture providers

**Product / Audit**
- [`docs/audit/subagents/`](audit/subagents/) — 10 audits dimensionnels (sécurité, perf, a11y, i18n, code quality, etc.)

### ⚪ Tier 4 — HISTORIQUE (contexte uniquement)

- `docs/load-testing-reports/` — 3 rapports horodatés des burst tests CV (mars 2026)

---

## 4. Que lire selon ta question

| Tu cherches… | Va voir |
|---|---|
| Comment lancer le projet | `docs/setup/docker.md` ou `README.md` § "Getting Started" |
| Où est la logique X dans le code | `docs/audit/MAP.md` (recherche `Ctrl+F`) |
| Comment déployer / rollback | `docs/RUNBOOK.md` §3 + ⚠️ `DEPLOYMENT.md` |
| Quelle variable d'env utiliser | `.env.example` (134 vars) + `docs/RUNBOOK.md` §6 |
| Pourquoi telle décision a été prise | `docs/audit/MAP.md` ou `docs/audit/subagents/` |
| Quels comptes existent (Stripe, Supabase, etc.) | `docs/COMPTES_PASSATION.md` |
| Comment ouvrir une PR | `CONTRIBUTING.md` (racine) |
| Convention de code TypeScript / Python | `frontend-next/AGENTS.md` ou `backend/AGENTS.md` |
| Architecture des agents IA | `docs/architecture/overview.md` §4 (5 chatbots) + `backend/AGENTS.md` |
| Schéma base de données | `docs/audit/MAP.md` §4 + `supabase/migrations/` |
| Capacités / limites de scaling | `docs/architecture/scaling.md` |
| Incident en prod | `docs/RUNBOOK.md` §8 (procédures incident) |
| Crons configurés | `docs/RUNBOOK.md` §4 + `vercel.json` |
| API endpoints disponibles | `docs/architecture/overview.md` §14 + Swagger sur `/docs` |

---

## 5. ⚠️ Incohérences et gaps connus

| Problème | Détail | Statut |
|---|---|---|
| ~~`DEPLOYMENT.md` parle de Modal comme backend~~ | Corrigé : Railway = backend API, Modal = CV processor serverless dédié | ✅ Résolu |
| ~~`README.md` mentionnait Modal comme backend principal~~ | Corrigé : section infrastructure clarifiée + commande `git push origin Production` documentée | ✅ Résolu |
| ~~`frontend-next/README.md` est le boilerplate Next.js~~ | Réécrit avec stack, scripts et structure du projet | ✅ Résolu |
| ~~`tests/README.md` ne couvre QUE k6~~ | Enrichi : pytest, Vitest, Playwright et k6 | ✅ Résolu |
| **Aucun diagramme visuel** (PNG/SVG/Mermaid) | Tout est en ASCII art | 🟢 Amélioration future : diagrammes Mermaid auth/paiement/agents |

---

## 6. Fiches par document

### Racine du repo (3 fichiers)

**`README.md`** — 481 lignes — *Présentation publique du projet*
Sections : Features, Architecture, Tech Stack, Getting Started, Configuration, Development, API Documentation, Deployment. En anglais. Bonne base de découverte du projet.

**`CONTRIBUTING.md`** — 666 lignes — *Guide de contribution*
Workflow Git, conventions de commits, ouverture de PR, code of conduct, testing requirements.

**`DEPLOYMENT.md`** — ~640 lignes — *Guide de déploiement complet*
Couvre Vercel (frontend) + Railway (backend FastAPI) + Modal Labs (CV processor serverless) + Supabase (DB/auth) + Monitoring + CI/CD.

### `docs/` (8 fichiers + sous-dossiers)

**`docs/README.md`** — 52 lignes — *Index navigable de la doc*
Point d'entrée. Liens vers tous les autres docs organisés par thème.

**`docs/RUNBOOK.md`** — 364 lignes — *Runbook opérationnel* ⭐
13 sections : cartographie, comptes, déploiement, crons, monitoring, env vars, migrations, incidents, Expadation, couverture pays, tests, vigilance, liens. **À avoir sous la main en permanence quand on est d'astreinte.**

**`docs/COMPTES_PASSATION.md`** — 316 lignes — *Inventaire des comptes pour passation*
Template à remplir avec tous les accès (Vercel, Railway, Supabase, Stripe, Resend, etc.). À ne JAMAIS commiter rempli.

**`docs/architecture/overview.md`** — 538 lignes — *Documentation technique complète* ⭐
17 sections couvrant : vue d'ensemble, archi, 9 features produit, 5 chatbots IA, monétisation, admin, DB, sécurité, emails, crons, i18n, perf, CI/CD, endpoints, historique, services externes, agent Expadation. **Le document de référence technique.**

**`docs/architecture/scaling.md`** — 379 lignes — *Guide complet de scaling*
Analyse mars 2026 avec métriques mesurées en production (pas estimées). Goulots, optimisations, capacités.

**`docs/architecture/scaling-flows.md`** — 661 lignes — *Simulations de charge par cas utilisateur*
Détail par scénario : ce qui se passe réellement à 10/100/1000 utilisateurs concurrents.

### `docs/audit/` (3 + 10 sous-agents)

**`docs/audit/MAP.md`** — 799 lignes — *Cartographie exhaustive du code* ⭐⭐
**Document le plus important du repo.** Liste tous les composants UI (119), endpoints backend (157), tables Supabase (36). À utiliser en `Ctrl+F` avant toute création pour éviter les doublons.

**`docs/audit/admin-api-audit.md`** — 723 lignes — Audit complet de l'API admin (sécurité, endpoints, rôles).

**`docs/audit/i18n-todo.md`** — 499 lignes — Travail i18n restant (chaînes hardcodées à extraire).

**`docs/audit/subagents/`** — 10 audits dimensionnels (01-business-logic à 10-missing-features). À consulter par dimension.

### Sous-projets

**`backend/AGENTS.md`** — 649 lignes — *Conventions backend* ⭐
Stack précise (versions pinnées), structure complète de `src/`, commandes, patterns routes FastAPI, agents LangChain, workers ARQ. **À lire avant tout dev backend.**

**`frontend-next/AGENTS.md`** — 431 lignes — *Conventions frontend* ⭐
Patterns composants, hooks (21 customs), auth Supabase SSR, contexts, i18n next-intl, tests Vitest. **À lire avant tout dev frontend.**

**`frontend-next/README.md`** — 36 lignes — ⚠️ Boilerplate Next.js par défaut. À ignorer.

**`frontend-next/src/lib/constants/README.md`** — 55 lignes — Documentation z-index scale (système hiérarchique pour éviter les conflits de superposition).

### Tests & scripts

**`tests/README.md`** — 152 lignes — Load testing **k6 uniquement** (pas pytest/vitest/playwright).

**`e2e/bugs/README.md`** — 156 lignes — Tests E2E Playwright ciblés bugs avec contournements.

**`scripts/benchmarks/README.md`** — 41 lignes — Scripts mesure couverture providers FR vs US.

### Supabase

**`supabase/migrations/README_SUBSCRIPTION_MIGRATION.md`** — 254 lignes — Documentation de la migration du système de souscriptions (table `user_subscriptions` qui remplace `profiles.subscription_*`).

---

## 7. Commandes les plus utiles

```bash
# Démarrage complet local
npm run dev                              # backend (8000) + frontend (3000)

# Tests
npm run test:backend                     # pytest
npm run test:frontend                    # vitest
npm run test:e2e                         # Playwright

# Qualité
cd frontend-next && npx tsc --noEmit     # type check TS
ruff check . --ignore E501               # lint Python

# Vérifier version backend prod
curl https://huntzenjobs-production.up.railway.app/api/auth/test-debug

# Forcer un redeploy Railway
git commit --allow-empty -m "chore: trigger redeploy" && git push origin Production

# Régénérer types TypeScript depuis Supabase
supabase gen types typescript --local > frontend-next/src/types/database.types.ts
```

---

## 8. Conventions de branches

| Branche | Rôle |
|---|---|
| `Production` | Branche déployée Railway (backend) — PR uniquement via merge |
| `Pre-production` | Staging — ne JAMAIS commit direct |
| `feat/*`, `fix/*`, `chore/*` | Branches de travail, base = `Pre-production` ou `Production` selon urgence |

Workflow : `feat/...` → PR vers `Pre-production` → validation → merge vers `Production` → auto-deploy.

---

## 9. Ressources externes utiles

- **Swagger backend** : `https://huntzenjobs-production.up.railway.app/docs`
- **Dashboard Vercel** : projets HuntZen
- **Dashboard Railway** : services backend + worker
- **Dashboard Supabase** : base de données + auth + logs
- **Dashboard Stripe** : paiements + webhooks
- **Dashboard Upstash** : Redis cache + queue

Comptes/accès → voir `docs/COMPTES_PASSATION.md`.

---

## 10. Premiers réflexes

| Situation | Réflexe |
|---|---|
| Avant de créer un composant / endpoint | `grep` dans `docs/audit/MAP.md` |
| Avant de toucher la DB | Lire la dernière migration dans `supabase/migrations/` |
| Avant de toucher auth/Stripe | Re-lire les patterns dans `backend/AGENTS.md` |
| Avant de créer un commit | `git status` + vérifier qu'aucun secret ne passe |
| Avant d'ouvrir une PR | `npm run test` + `npx tsc --noEmit` + `ruff check` |
| Bug en prod | `docs/RUNBOOK.md` §8 (procédures incident) |

---

*Document à mettre à jour quand l'architecture évolue. Dernière révision : 2026-05-27.*
