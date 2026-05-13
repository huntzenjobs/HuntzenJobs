# Documentation HuntZen

Point d'entrée pour la documentation technique du projet HuntZen. Ce dossier complète les fichiers de référence à la racine et dans chaque sous-projet.

## Pour bien démarrer

- [README.md](../README.md) — Présentation générale du projet, stack technique, comment lancer le projet.
- [DEPLOYMENT.md](../DEPLOYMENT.md) — Guide complet de déploiement (Vercel pour le frontend, Railway pour le backend, Supabase pour la base de données).
- [DOCKER_USAGE.md](../DOCKER_USAGE.md) — Lancer le stack en local avec Docker Compose.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Workflow Git, conventions de code, ouverture de pull requests.

## Conventions par sous-projet

- [frontend-next/AGENTS.md](../frontend-next/AGENTS.md) — Conventions et patterns pour le frontend Next.js 14 (composants, hooks, auth Supabase SSR, i18n, tests Vitest).
- [frontend-next/README.md](../frontend-next/README.md) — README court du sous-projet frontend.

## Rapports et analyses

Documents de référence sur l'état du backend, des tests et des migrations base de données.

### Backend

- [BUGS_IDENTIFIED.md](../backend/BUGS_IDENTIFIED.md) — Bugs connus côté backend, avec contexte et reproduction.
- [QA_REPORT.md](../backend/QA_REPORT.md) — Rapport de qualité backend.
- [SUPABASE_AUDIT_REPORT.md](../backend/SUPABASE_AUDIT_REPORT.md) — Audit complet de l'usage Supabase côté backend.

### Frontend

- [TEST_FIXES_SUMMARY.md](../frontend-next/TEST_FIXES_SUMMARY.md) — Résumé des fixes appliqués aux tests frontend.
- [TEST_SUMMARY.md](../frontend-next/TEST_SUMMARY.md) — Synthèse des tests frontend.
- [src/lib/constants/README.md](../frontend-next/src/lib/constants/README.md) — Documentation des constantes partagées.

### Base de données et migrations

- [MIGRATION_PHASE_8_SUCCESS.md](../supabase/MIGRATION_PHASE_8_SUCCESS.md) — Compte rendu de la migration de phase 8.
- [migrations/README_SUBSCRIPTION_MIGRATION.md](../supabase/migrations/README_SUBSCRIPTION_MIGRATION.md) — Documentation de la migration du système de souscriptions.

### Tests

- [tests/README.md](../tests/README.md) — Comment lancer les tests (backend pytest, frontend Vitest, E2E Playwright).

## Archives

Le sous-dossier `audit/` contient des audits techniques historiques et des analyses produites au fil du projet. Ces documents ne sont pas maintenus à jour mais restent disponibles pour comprendre les décisions passées.
