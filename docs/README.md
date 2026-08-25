# Documentation HuntZen

> Point d'entrée. Carte de lecture organisée en parcours logiques.

---

## 🎯 Tu es nouveau ? Commence ici

👉 **[ONBOARDING.md](ONBOARDING.md)** — guide complet de compréhension (15 min → 1 semaine), hiérarchie des docs, parcours par rôle, premiers réflexes.

---

## 🗺 Roadmap de lecture par objectif

### 🟢 Comprendre le produit (15 min)

```
README.md (../) ─┐
                  ├──> architecture/overview.md §1-2 ──> ✅ Tu sais ce qu'on construit
ONBOARDING.md ───┘
```

### 🟢 Lancer le projet en local (1 h)

```
setup/docker.md ──> .env.example ──> npm run dev ──> ../CONTRIBUTING.md ──> ✅ Tu peux coder
```

### 🟢 Première PR (1 journée)

```
CONTRIBUTING.md (../) ──┐
                         ├──> audit/MAP.md (Ctrl+F) ──> code ──> tests ──> PR ──> ✅ Tu contribues
backend/AGENTS.md       │
   ou                   │
frontend/AGENTS.md      ┘
```

### 🟡 Comprendre un incident en prod (urgent)

```
RUNBOOK.md §8 ──> COMPTES_PASSATION.md ──> dashboards (Vercel/Railway/Supabase) ──> ✅ Tu débugges
```

### 🟡 Déployer ou modifier l'infra (avancé)

```
DEPLOYMENT.md ──> RUNBOOK.md §3 ──> architecture/scaling.md ──> ✅ Tu déploies
```

---

## 📚 Index complet par catégorie

### Démarrage rapide

- [README.md](../README.md) — Présentation produit, stack, quickstart
- [setup/docker.md](setup/docker.md) — Lancer le stack en local avec Docker Compose
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — Workflow Git, conventions de code, ouverture de PR

### Architecture et conception

- [architecture/overview.md](architecture/overview.md) — **Documentation technique complète** (17 sections : archi, features, agents IA, DB, sécurité, crons…)
- [architecture/scaling.md](architecture/scaling.md) — Guide de scaling : capacités, goulots, optimisations
- [architecture/scaling-flows.md](architecture/scaling-flows.md) — Simulations de charge par scénario utilisateur

### Cartographie du code

- [audit/MAP.md](audit/MAP.md) — **Carte exhaustive** : 119 composants UI, 157 endpoints, 36 tables. À consulter avant toute création
- [audit/admin-api-audit.md](audit/admin-api-audit.md) — Audit complet de l'API admin
- [audit/i18n-todo.md](audit/i18n-todo.md) — Travail i18n restant
- [audit/subagents/](audit/subagents/) — 10 audits dimensionnels (business, UI/UX, i18n, sécurité, DB, API, perf/SEO, accessibilité, code quality, features)

### Opérations et passation

- [RUNBOOK.md](RUNBOOK.md) — **Runbook opérationnel** : incidents, déploiement, rollback, monitoring (13 sections)
- [COMPTES_PASSATION.md](COMPTES_PASSATION.md) — Inventaire des comptes et accès pour la passation
- [../DEPLOYMENT.md](../DEPLOYMENT.md) — Guide de déploiement complet (Vercel + Railway + Modal + Supabase)

### Conventions par sous-projet

- [../backend/AGENTS.md](../backend/AGENTS.md) — Backend FastAPI : stack, structure `src/`, patterns routes, agents LangChain, ARQ workers
- [../frontend-next/AGENTS.md](../frontend-next/AGENTS.md) — Frontend Next.js 14 : composants, hooks, auth Supabase SSR, i18n, tests

### Tests et benchmarks

- [../tests/README.md](../tests/README.md) — Load testing k6 (⚠️ ne couvre pas pytest/vitest/playwright)
- [../e2e/bugs/README.md](../e2e/bugs/README.md) — Tests E2E Playwright ciblés bugs
- [../scripts/benchmarks/README.md](../scripts/benchmarks/README.md) — Scripts de benchmark de couverture providers

### Données techniques

- [../supabase/migrations/README_SUBSCRIPTION_MIGRATION.md](../supabase/migrations/README_SUBSCRIPTION_MIGRATION.md) — Migration du système de souscriptions
- [../frontend-next/src/lib/constants/README.md](../frontend-next/src/lib/constants/README.md) — Documentation z-index scale

### Historique

- `load-testing-reports/` — Rapports horodatés des burst tests CV (mars 2026)

---

## 🧭 Schéma de navigation

```
┌──────────────────────────────────────────────────────────────┐
│                    NOUVEAU SUR LE PROJET                      │
│                            ↓                                  │
│                    ONBOARDING.md                              │
│              (parcours 15 min → 1 semaine)                    │
└──────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
   ┌─────────┐         ┌─────────┐         ┌─────────┐
   │COMPRENDRE│        │  CODER  │         │  OPÉRER │
   └─────────┘         └─────────┘         └─────────┘
        │                   │                   │
   ┌────▼─────┐        ┌────▼──────┐       ┌────▼──────┐
   │README    │        │CONTRIBUTING│      │RUNBOOK    │
   │overview  │        │MAP.md      │      │DEPLOYMENT │
   │scaling   │        │backend/    │      │COMPTES    │
   │          │        │  AGENTS    │      │           │
   └──────────┘        └────────────┘      └───────────┘
```

---

## 📏 Hiérarchie résumée (4 tiers)

- **🟢 Tier 1 ESSENTIEL** : `README`, `CONTRIBUTING`, `architecture/overview`, `setup/docker`, `audit/MAP`
- **🟡 Tier 2 RÉFÉRENCE** : `RUNBOOK`, `DEPLOYMENT`, `scaling`, `scaling-flows`, `COMPTES_PASSATION`
- **🔵 Tier 3 SPÉCIALISÉ** : `backend/AGENTS`, `frontend-next/AGENTS`, `admin-api-audit`, `i18n-todo`, `subagents/`
- **⚪ Tier 4 HISTORIQUE** : `load-testing-reports/`

Détail dans [ONBOARDING.md §3](ONBOARDING.md#3-hiérarchie-des-documents).
