# HuntZen — Frontend

Application web HuntZen en Next.js 14 (App Router), TypeScript, Tailwind CSS et shadcn/ui. Déployée sur Vercel.

## Démarrer en local

```bash
npm install
npm run dev
```

L'app tourne sur http://localhost:3000. Elle a besoin du backend FastAPI sur le port 8000 (voir le README à la racine du repo) et d'un fichier `.env.local` (copier depuis `.env.example`).

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de dev (port 3000) |
| `npm run build` | Build de production |
| `npm run start` | Lancer le build de production |
| `npm run lint` | ESLint |
| `npm run test` | Tests Vitest (watch) |
| `npm run test:run` | Tests Vitest (une passe) |
| `npm run test:coverage` | Tests avec couverture |
| `npm run sync-translations` | Synchroniser les fichiers de traduction |

## Stack

- **Framework** : Next.js 14 (App Router)
- **Langage** : TypeScript
- **Styling** : Tailwind CSS + shadcn/ui + Radix
- **State** : Zustand + React Query + SWR
- **Auth** : Supabase SSR (`@supabase/ssr`)
- **i18n** : next-intl (fr, en, es, pt)
- **Tests** : Vitest + Playwright (E2E à la racine du repo)
- **Monitoring** : Sentry

## Conventions

Les patterns de code (composants, hooks, contexts, auth SSR, i18n) sont décrits dans [`AGENTS.md`](AGENTS.md).

## Structure

```
src/
├── app/           App Router (pages, layouts, route handlers)
├── components/    Composants React par domaine (ui, jobs, cv, coach, etc.)
├── hooks/         Hooks React custom
├── contexts/      Contexts (auth, subscription, theme)
├── lib/           Utilitaires, client API, sécurité
├── i18n/          Configuration next-intl
└── types/         Types TypeScript
```

Pour l'architecture complète et le déploiement, voir le [README à la racine](../README.md) et [docs/](../docs/).
