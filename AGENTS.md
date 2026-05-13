# AGENTS.md

Guide rapide pour les contributeurs du projet HuntZen. Ce fichier rassemble les conventions et les points d'entrée principaux. Pour les détails, consulter les documents référencés.

## Projet en deux phrases

HuntZen est une plateforme d'aide à la recherche d'emploi qui combine un backend FastAPI (agents LangChain, providers d'offres, services Stripe et Supabase) et un frontend Next.js 14 (App Router, Tailwind, shadcn/ui). La production tourne sur Vercel (frontend) et Railway (backend), avec Supabase pour la base de données.

## Démarrer

- [README.md](README.md) — présentation, stack, premier lancement.
- [DOCKER_USAGE.md](DOCKER_USAGE.md) — lancer le stack en local via Docker Compose.
- [DEPLOYMENT.md](DEPLOYMENT.md) — déploiement Vercel + Railway + Supabase.

## Contribuer

- [CONTRIBUTING.md](CONTRIBUTING.md) — workflow Git, conventions de commits, pull requests.
- [docs/README.md](docs/README.md) — index complet de la documentation technique.

## Conventions par sous-projet

- Frontend Next.js : voir [frontend-next/AGENTS.md](frontend-next/AGENTS.md) — patterns composants, hooks, auth Supabase SSR, i18n, tests Vitest.
- Backend FastAPI : suivre les patterns décrits dans le code (routes dans `backend/src/api/routes/`, agents dans `backend/src/agents/`, Pydantic v2 partout, type hints obligatoires).

## Règles de base

- Ne jamais committer sur la branche `Pre-production` directement. Toujours passer par une branche de feature ou de fix + pull request.
- Tester ses changements avant de pousser (lint backend `ruff check`, types frontend `npx tsc --noEmit`, tests `npm run test`).
- Ne pas commit de fichiers `.env` ou contenant des secrets. Le `.gitignore` est strict, vérifier `git status` avant chaque commit.
- Documenter les nouveaux endpoints dans Swagger (FastAPI le fait automatiquement à partir des modèles Pydantic).
