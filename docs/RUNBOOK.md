# Runbook opérationnel HuntZen

Guide pratique pour exploiter, surveiller, dépanner. Complète [`architecture/overview.md`](architecture/overview.md) qui couvre l'architecture. Ici, les *gestes du quotidien*.

## 1. Cartographie rapide

| Service | URL | Plateforme | Branche déployée |
|---|---|---|---|
| Frontend | https://www.huntzenjobs.com | Vercel | `Production` |
| Backend API | https://huntzenjobs-production.up.railway.app | Railway | `Production` |
| Worker ARQ | (interne Railway) | Railway | `Production` |
| Base de données | `ngiakfikbuyugqfqtfwp.supabase.co` | Supabase | n/a |
| Redis | Upstash + Railway interne | Upstash + Railway | n/a |

## 1bis. Toutes les URLs du projet

### Public

| Quoi | URL |
|---|---|
| Site (prod) | https://huntzenjobs.com (redirige vers `www.`) |
| API backend (prod) | https://huntzenjobs-production.up.railway.app |
| Documentation API (Swagger) | https://huntzenjobs-production.up.railway.app/docs |
| Staging (Pre-production) | Déployé sur Vercel depuis la branche `Pre-production`. Pas forcément à jour. Utilise le même backend Railway que la prod. URL à retrouver dans le dashboard Vercel. |

### Diagnostic et santé

| Quoi | URL |
|---|---|
| Health check backend | https://huntzenjobs-production.up.railway.app/health |
| Version déployée backend | https://huntzenjobs-production.up.railway.app/api/auth/test-debug |
| Ping santé | https://huntzenjobs-production.up.railway.app/api/health/ping |

### Code et déploiement

| Quoi | URL |
|---|---|
| Dépôt GitHub | https://github.com/huntzenjobs/HuntzenJobs |
| Issues | https://github.com/huntzenjobs/HuntzenJobs/issues |
| Dashboard Railway | https://railway.app |
| Dashboard Vercel | https://vercel.com |

### Dashboards des services

Les URLs de tous les services tiers (Supabase, Stripe, Groq, Sentry, Resend, etc.) sont dans [`COMPTES_PASSATION.md`](COMPTES_PASSATION.md).

### Pages du site

La liste complète des pages déployées (publiques, app, admin, paiement, SEO) est dans [`architecture/overview.md`](architecture/overview.md) section 14bis. Quelques pages utiles pour vérifier la prod : `/` (home), `/pricing`, `/jobs`, `/login`, `/admin`.

## 2. Comptes et propriété

| Plateforme | Compte propriétaire | Où récupérer les credentials |
|---|---|---|
| Railway | `huntzenproject@gmail.com` | Dashboard Railway → Variables |
| Vercel | `<à compléter>` | Dashboard Vercel → Settings → Environment Variables |
| Supabase | `<à compléter>` | Dashboard Supabase → Settings → API |
| Stripe | `<à compléter>` (compte LIVE) | Dashboard Stripe → Developers → API keys |
| Sentry | DSN dans `.env` | Dashboard Sentry → Settings → Projects |
| Jina AI | Clé sans compte, voir section 9 | Clé portée par `JINA_API_KEY` dans Railway |
| Groq | Compte LLM principal | Dashboard Groq → API keys |
| Upstash Redis | `<à compléter>` | Dashboard Upstash |
| Modal Labs | Compte Modal pour extraction PDF | Dashboard Modal |
| Resend | Compte email transactionnel | Dashboard Resend |

> Sources externes : Adzuna, SerpAPI, France Travail OAuth, RapidAPI, Apollo, Hunter — clés dans `.env` Railway, comptes à inventorier.

## 3. Déploiement et redémarrage

### Redéploiement automatique

- **Railway** : push sur la branche `Production` déclenche un redéploiement auto (backend + worker). L'ajout/modif d'une variable d'environnement déclenche aussi un redeploy.
- **Vercel** : push sur la branche connectée déclenche un redéploiement auto du frontend.

### Forcer un redéploiement Railway

```bash
git checkout Production
git pull
git commit --allow-empty -m "chore: trigger redeploy"
git push origin Production
```

Vérifier la version backend déployée :

```bash
curl https://huntzenjobs-production.up.railway.app/api/auth/test-debug
```

Si Railway a désactivé l'auto-deploy : aller dans Railway dashboard, sélectionner le service, onglet `Deployments` → bouton "Redeploy".

### Redémarrer un service sans redéployer

Dans Railway dashboard → service → menu `...` → **Restart**. Utile après changement de variable d'env si l'auto-redeploy n'a pas eu lieu.

## 4. Crons planifiés

8 crons définis dans `frontend-next/vercel.json` (route Next.js qui relaie vers le backend, protégée par `CRON_SECRET`).

| Horaire (UTC) | Endpoint | Tâche |
|---|---|---|
| `0 0 * * *` | `/api/cron/reset-quotas` | Purge quotas > 7 jours |
| `0 0 * * *` | `/api/cron/daily-admin-digest` | Email récap admin (signups, MRR) |
| `0 3 * * *` | `/api/cron/cleanup` | Purge événements > 30 jours |
| `0 8 * * *` | `/api/cron/job-alerts` | Digest matchs offres |
| `0 8 * * *` | `/api/cron/notify-expiring-plans` | Notification plans J-7 |
| `0 10 * * *` | `/api/cron/retention-notifications` | Relance utilisateurs inactifs |
| `0 9 * * 1` | `/api/cron/weekly-summary` | Récap hebdo activité |
| `0 3 * * 1` | `/api/cron/expat-refresh` | Re-scrape des sources Expadation (12 pays httpx) |

### Déclencher un cron manuellement

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' backend/.env | cut -d= -f2-)
curl -X POST "https://huntzenjobs-production.up.railway.app/api/cron/expat-refresh" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Cron Expadation — comportement attendu

À chaque exécution, le cron itère sur les ~22 sources httpx du `SOURCE_REGISTRY` (les 8 pays SPA n'y sont pas — voir Évolution Playwright). Pour chaque source :
- Statut `unchanged` si le hash SHA-256 du Markdown extrait correspond au hash en base.
- Statut `ingested` si le contenu a changé : ré-embedding via Jina, remplacement des chunks.
- Statut `skipped` si le scraping retourne du Markdown vide.
- Statut `error` si une exception remonte.

Les logs sont visibles dans Railway → service worker → onglet Logs, filtrer `expat_refresh`.

## 5. Monitoring

### Sentry

DSN configuré dans `backend/.env` (`SENTRY_DSN`) et `frontend-next/.env.local` (`NEXT_PUBLIC_SENTRY_DSN`). Dashboard accessible via https://sentry.io → projet HuntZen. Surveiller les erreurs `500` backend et les erreurs JavaScript frontend.

### Logs Railway

Dashboard Railway → service backend ou worker → onglet Logs. Filtrage par mot-clé. Les logs sont structurés (structlog) avec champs `extra` (user_id, request_id...).

### Logs Vercel

Dashboard Vercel → projet → onglet Logs. Inclut les logs des routes Next.js (notamment les routes cron).

### Consommation Jina

Pas de tableau de bord dédié (la clé Jina n'est rattachée à aucun compte utilisateur). Pour vérifier le solde de tokens restants :

1. Aller sur https://jina.ai → onglet API
2. Coller la clé `JINA_API_KEY` (récupérable dans Railway dashboard)
3. La page affiche : *"You have X tokens left in the API key below"*

Initialement la clé démarre avec 10 M tokens gratuits. Recharge possible (carte bancaire) si besoin.

### Quota Groq

Dashboard Groq → API keys → page d'utilisation. Surveiller les rate limits et erreurs 429.

## 6. Variables d'environnement critiques

> Stockées dans Railway (backend + worker) et Vercel (frontend). Ne pas committer.

### Backend (Railway)

| Variable | Usage | Notes |
|---|---|---|
| `SUPABASE_URL` | URL projet Supabase | |
| `SUPABASE_SERVICE_ROLE_KEY` | Accès admin DB | Sensible, bypass RLS |
| `SUPABASE_JWT_SECRET` | Validation tokens utilisateurs | |
| `DATABASE_URL` | Connexion Postgres directe (pooler) | |
| `GROQ_API_KEY` | LLM | Rotation possible |
| `JINA_API_KEY` | Embeddings Agent Expadation | |
| `STRIPE_SECRET_KEY` | Paiements (LIVE en production) | |
| `STRIPE_WEBHOOK_SECRET` | Validation webhook | |
| `RESEND_API_KEY` | Emails transactionnels | |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Cache + rate limit | |
| `REDIS_URL` | Broker ARQ worker | Railway interne |
| `CRON_SECRET` | Auth crons | Partagé avec Vercel |
| `SENTRY_DSN` | Monitoring | |
| `MODAL_CALLBACK_SECRET` | Auth callbacks Modal PDF | |
| `ADZUNA_APP_ID` + `ADZUNA_API_KEY` | Recherche emploi | |
| `SERPAPI_KEY` | Recherche emploi + Events | |
| `RAPIDAPI_KEY` | JSearch | |
| `HUNTER_API_KEY` | Recherche emails | |
| `APOLLO_API_KEY` | Recherche contacts | |
| `CLIENT_ID` + `CLIENT_SECRET` | OAuth France Travail | |
| `LANGCHAIN_API_KEY` | Tracing LangSmith | Optionnel |

### Frontend (Vercel)

| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase (publique) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase (publique) |
| `SUPABASE_SERVICE_ROLE_KEY` | Routes API serveur Next.js |
| `NEXT_PUBLIC_BACKEND_URL` | URL backend Railway |
| `JWT_SECRET` | Validation JWT côté routes Next |
| `NEXT_PUBLIC_SENTRY_DSN` | Monitoring frontend |
| `CRON_SECRET` | Auth crons (relai vers backend) |

## 7. Migrations de base de données

Les migrations sont versionnées dans `supabase/migrations/`. Elles sont **appliquées manuellement** sur la prod via le SQL Editor du dashboard Supabase (le CLI `supabase db push` n'est pas branché actuellement).

### Procédure d'application

1. Aller sur https://supabase.com/dashboard → projet HuntZen → SQL Editor → New query
2. Coller le contenu du fichier `.sql`
3. Cliquer Run
4. Vérifier le résultat (tables, fonctions...) via REST API ou SQL Editor

### Vérifier qu'une migration est appliquée

```bash
SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' backend/.env | cut -d= -f2-)
SURL=$(grep '^SUPABASE_URL=' backend/.env | cut -d= -f2-)

# Existence d'une table
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  "$SURL/rest/v1/<table_name>?limit=1" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
# 200 OK = table existe, 404 = absente
```

## 8. Procédures d'incident

### Le backend ne répond plus

1. `curl https://huntzenjobs-production.up.railway.app/api/auth/test-debug` → si 5xx ou timeout, problème Railway
2. Vérifier les déploiements récents dans Railway → onglet Deployments → tout est `Success` ?
3. Vérifier les logs (filtrer `ERROR` et `CRITICAL`)
4. Vérifier que les variables d'env sont bien posées
5. Redémarrer le service Railway si besoin
6. Si le problème persiste : rollback vers le déploiement précédent (Railway → Deployments → ancienne version → "Redeploy")

### Le cron Expadation ne tourne pas

1. Vérifier l'exécution dans Vercel → projet frontend → onglet Crons (historique d'exécution)
2. Si l'appel HTTP a réussi mais aucune action visible : vérifier les logs du worker Railway, filtrer `expat_refresh`
3. Si le worker ne traite pas : vérifier que la queue ARQ est consommée (`REDIS_URL` correct, worker démarré, pas d'erreur d'authentification Redis)
4. Tester en local : `cd backend && ../venv/bin/python -c "import asyncio; from src.services.expat.ingest import ingest_all; print(asyncio.run(ingest_all()))"`

### Quota Jina épuisé

Symptôme : erreurs 429 dans les logs `Jina API`, retours `embedding failed` dans `ingest_source`.

1. Vérifier le solde sur jina.ai (section 5)
2. Si proche de zéro : recharger via Jina (paiement) ou générer une nouvelle clé free tier et la mettre dans Railway
3. Tant que la base vectorielle est peuplée, les recherches (requête utilisateur) continuent de fonctionner — seuls les ré-embeddings du cron sont impactés

### Webhook Stripe en erreur

Logs : `webhook_failures` table Supabase contient les échecs avec stack trace.

1. Récupérer le `stripe_webhook_event_id` du payload
2. Renvoyer manuellement depuis Stripe Dashboard → Developers → Webhooks → événement → "Resend"
3. Vérifier l'idempotence via la table `stripe_webhook_events`

## 9. Procédures Expadation spécifiques

### Ajouter un pays au registre

1. Vérifier que le site officiel se scrape :
   ```bash
   cd backend
   ../venv/bin/python -c "
   import asyncio
   from src.services.expat.scraper import scrape_url
   r = asyncio.run(scrape_url('https://...', content_selector=''))
   print('len markdown:', len(r['markdown']))
   "
   ```
2. Si markdown > 600 caractères et contient du texte pertinent : ajouter dans `SOURCE_REGISTRY` (`backend/src/services/expat/scraper.py`)
3. Ajouter le code pays dans `_COUNTRY_CODE_MAP` (`backend/src/agents/expat/main_agent.py`)
4. Commit, push, déployer
5. Déclencher le cron manuellement (section 4) ou attendre lundi 03h UTC

### Re-scraper manuellement après un changement de registre

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' backend/.env | cut -d= -f2-)
curl -X POST "https://huntzenjobs-production.up.railway.app/api/cron/expat-refresh" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Évolution Playwright — refresh des 8 pays SPA

Les pays NL, AU, DK, SG, LU, AT, ES, PT ont été ingérés une fois via Playwright local (leurs sites sont en SPA JavaScript). Le cron httpx ne les rafraîchit pas. Si l'équipe veut un refresh auto :

1. Ajouter `playwright` à `backend/requirements.txt`
2. Modifier `backend/Dockerfile` pour installer chromium :
   ```dockerfile
   RUN playwright install --with-deps chromium
   ```
3. Créer une tâche ARQ `expat_refresh_spa_task` qui utilise Playwright + `ingest_source(prefetched_html=...)` (le seam est déjà en place)
4. Ajouter le cron correspondant dans `vercel.json`

Voir l'issue GitHub correspondante pour le détail.

## 10. Couverture pays — Recherche d'offres d'emploi

La recherche d'offres interroge **8 providers en parallèle** via l'agrégateur `backend/src/services/job_providers/aggregator.py`. Chaque provider déclare quels pays il supporte ; l'agrégateur ne route la requête qu'aux providers compatibles avec le pays demandé. Le sélecteur de pays côté UI expose les **250 pays ISO** (via `pycountry`) ; la densité de résultats dépend de la couverture des providers.

### 22 pays avec providers natifs / spécialisés

| Pays | Code ISO | Providers natifs |
|---|---|---|
| Afrique du Sud | ZA | Adzuna |
| Allemagne | DE | Adzuna · Careerjet |
| Australie | AU | Adzuna · Careerjet |
| Autriche | AT | Adzuna · Careerjet |
| Belgique | BE | Le Forem · Adzuna · Careerjet |
| Brésil | BR | Adzuna |
| Canada | CA | Adzuna · Careerjet |
| Espagne | ES | Careerjet |
| États-Unis | US | Adzuna · Careerjet |
| France | FR | France Travail · Adzuna · Careerjet |
| Inde | IN | Adzuna |
| Italie | IT | Adzuna · Careerjet |
| Luxembourg | LU | Careerjet |
| Mexique | MX | Adzuna |
| Nouvelle-Zélande | NZ | Adzuna |
| Pays-Bas | NL | Adzuna · Careerjet |
| Pologne | PL | Adzuna |
| Portugal | PT | Careerjet |
| Royaume-Uni | GB | Adzuna · Careerjet |
| Russie | RU | Adzuna |
| Singapour | SG | Adzuna |
| Suisse | CH | Adzuna · Careerjet |

### Reste du monde — via agrégateurs

Pour les pays hors des 22 listés ci-dessus, la recherche est servie par les agrégateurs mondiaux :

- **Jooble** — revendique 70+ pays, qualité variable selon le marché
- **JSearch / RapidAPI** — revendique 250+ pays via Google
- **SerpAPI Google Jobs** — environ 150 pays où Google Jobs est indexé

Résultats moins denses qu'avec un provider natif, mais existants.

### RemoteOK

**RemoteOK** est interrogé en plus, sans filtre pays, pour les offres remote globales.

### Densité de couverture pratique

| Niveau | Pays | Caractéristique |
|---|---|---|
| **Très dense** | France, Belgique, USA, Royaume-Uni, Allemagne, Canada | 3+ providers natifs |
| **Dense** | Suisse, Pays-Bas, Italie, Espagne, Portugal, Autriche, Australie, Luxembourg | 1-2 providers spécialisés |
| **Moyenne** | Brésil, Inde, Singapour, Afrique du Sud, Mexique, Nouvelle-Zélande, Pologne, Russie | 1 provider Adzuna + agrégateurs |
| **Faible** | Reste du monde | Agrégateurs uniquement (Google Jobs, JSearch, Jooble) |

### Zones où la couverture est la plus limitée

Asie (hors Singapour, Inde), Afrique (hors Afrique du Sud), Amérique latine (hors Brésil, Mexique), Moyen-Orient. Les résultats remontent essentiellement de Google Jobs via SerpAPI ; la qualité dépend de l'indexation Google locale.

### Ajouter un nouveau provider

Pour étendre la couverture sur un marché spécifique :

1. Créer `backend/src/services/job_providers/<provider>.py` héritant de `BaseJobProvider`
2. Définir `supported_countries = {"<code>"}` ou `set()` pour une couverture worldwide
3. Implémenter `async def search(query, location, country_code, max_results, ...)`
4. Exporter dans `backend/src/services/job_providers/__init__.py`
5. Instancier le provider dans la route `/api/jobs` ; l'agrégateur le branche automatiquement

---

## 11. Lancement des tests

```bash
# Backend (lance pytest avec le contournement du conftest racine cassé)
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
PYTHONPATH=backend venv/bin/python -m pytest tests/unit/ --confcutdir=tests/unit -v
PYTHONPATH=backend venv/bin/python -m pytest tests/integration/test_expat_ingest_source.py --confcutdir=tests/integration -v

# Frontend
cd frontend-next && npm test

# E2E Playwright (frontend)
cd frontend-next && npm run test:e2e
```

> Le `conftest.py` racine importe un module `main` inexistant (dette pré-existante). À nettoyer dans un futur sprint.

## 12. Points de vigilance connus

- `pricing-modal.tsx` contient encore un `console.log("[PRICING MODAL DEBUG]")` en production
- `ENABLE_INTERVIEW_SIMULATOR=false` : bouton micro caché côté UI (feature Voice Layer non livrée, roadmap)
- Stripe webhook contient un workaround sur `KeyError: current_period_start`
- `profiles.subscription_*` est **DEPRECATED** — utiliser `user_subscriptions` uniquement
- Docling est pinné à `2.70.0` (compatibilité API PdfPipelineOptions). Ne pas mettre à jour sans valider l'extraction PDF

## 13. Liens utiles

- **Documentation technique complète** : [`architecture/overview.md`](architecture/overview.md)
- **CONTRIBUTING.md** racine : workflow Git, conventions, PR
- **backend/AGENTS.md** : conventions backend spécifiques
- **frontend-next/AGENTS.md** : conventions frontend spécifiques
- **Migrations** : `supabase/migrations/`
- **Cartographie du code** : [`audit/MAP.md`](audit/MAP.md)
