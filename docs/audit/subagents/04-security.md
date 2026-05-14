# Audit — Securite
Date : 2026-03-18
Score : 62/100

## Resume executif

L'application HuntZen presente une base de securite solide (RLS active sur la majorite des tables, verification de signature Stripe, utilisation de service_role cote backend, Docker non-root, SecretStr pour les secrets). Cependant, plusieurs failles importantes existent : **endpoints sans authentification ni rate limiting** exposant des services couteux (LLM, scraping), **une table `user_sessions` avec RLS `USING(true)` exposant les CV de tous les utilisateurs anonymes**, et **l'absence de headers de securite HTTP**. Quatre tables n'ont pas RLS active. La validation MIME des uploads CV n'est pas faite cote serveur.

---

## BLOQUANTS (failles critiques)

### SEC-01 : Table `user_sessions` — RLS USING(true) expose les CV de TOUS les utilisateurs anonymes
- **Fichier :** `supabase/migrations/20260204000015_fix_missing_rls_tables.sql:71-91`
- **Probleme :** Les policies SELECT, INSERT et UPDATE sur `user_sessions` utilisent `USING (true)` pour les roles `anon` et `authenticated`. Le commentaire dit "session_id matching done in app logic" mais cote Supabase, n'importe quel utilisateur (meme anonyme) peut lire TOUTES les sessions, y compris le champ `cv_text` (PII).
- **Impact :** Fuite de donnees personnelles (CV complets) de tous les utilisateurs anonymes. Un attaquant peut lister tous les CV stockes via un simple `SELECT * FROM user_sessions` avec la cle anon.
- **Fix :** Le backend accede a cette table uniquement via `service_role` — supprimer les policies `anon/authenticated` avec `USING(true)` et ne garder que la policy `service_role`. Si le frontend a besoin d'un acces direct, filtrer par `session_id` dans la policy RLS (pas dans le code applicatif).

### SEC-02 : Endpoints publics sans auth NI rate limiting exposant des services couteux
- **Fichiers :**
  - `backend/src/api/routes/insider_finder.py:42` — `POST /api/insider-finder/find` (appels Google/SerpAPI, pas d'auth, pas de rate limit)
  - `backend/src/api/routes/jobs.py:313` — `POST /api/jobs/analyze-query` (appel LLM Groq, pas d'auth, pas de rate limit)
  - `backend/src/api/routes/jobs.py:331` — `GET /api/jobs/market-insights` (appel LLM Groq, pas d'auth, pas de rate limit)
  - `backend/src/api/routes/jobs.py:431` — `POST /api/jobs/track-view` (pas d'auth, pas de rate limit, pas de validation Pydantic)
  - `backend/src/api/routes/jobs.py:463` — `POST /api/jobs/find-recruiter` (appels Hunter.io, pas d'auth, pas de rate limit)
  - `backend/src/api/routes/coach.py:245` — `POST /api/coach/training-recommendations` (appel LLM, pas d'auth)
  - `backend/src/api/routes/coach.py:274` — `POST /api/coach/career-plan` (appel LLM, pas d'auth)
- **Probleme :** Ces endpoints n'exigent ni authentification ni rate limiting. Un bot peut epuiser les quotas API Groq/SerpAPI/Hunter.io en quelques minutes, generant des couts importants.
- **Impact :** Abus de couts API (Groq, SerpAPI, Hunter.io), potentiel deni de service via epuisement des quotas API tiers.
- **Fix :** Ajouter `@limiter.limit("10/minute")` au minimum sur chaque endpoint. Exiger l'authentification ou au moins un `client_id` pour les endpoints qui appellent des APIs payantes.

### SEC-03 : Endpoint `/api/auth/welcome` — envoi d'emails sans authentification
- **Fichier :** `backend/src/api/routes/auth.py:337`
- **Probleme :** `POST /api/auth/welcome` accepte un email et un nom en body sans aucune authentification ni rate limiting. Un attaquant peut envoyer des milliers d'emails de bienvenue a des adresses arbitraires via ce endpoint.
- **Impact :** Abus du service email Resend (couts + reputation domaine), spam potentiel, le domaine `huntzenjobs.com` pourrait etre blackliste par les fournisseurs email.
- **Fix :** Ajouter un rate limit strict (`3/minute` par IP) et valider que l'email correspond a un utilisateur recemment inscrit dans Supabase.

---

## IMPORTANTS

### SEC-04 : Absence de validation MIME cote serveur pour les uploads CV
- **Fichier :** `backend/src/api/routes/assistant.py:488`
- **Probleme :** La validation d'upload dans `attach-cv` verifie uniquement l'extension du fichier (`.pdf`) et la taille (10MB). Il n'y a pas de validation du Content-Type/MIME reel du fichier. Un attaquant pourrait upload un fichier malveillant renomme en `.pdf`.
- **Impact :** Risque faible car le fichier est traite uniquement par pypdf/Docling (pas execute), mais c'est une defense en profondeur manquante.
- **Fix :** Ajouter une verification `file.content_type == "application/pdf"` et eventuellement verifier les magic bytes du fichier (`%PDF-`).

### SEC-05 : Pas de headers de securite HTTP
- **Fichier :** `backend/src/api/middleware.py` (absent)
- **Probleme :** Aucun header de securite n'est configure : pas de `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy`.
- **Impact :** Vulnerabilite au clickjacking (iframe), MIME sniffing, et absence de HSTS.
- **Fix :** Ajouter un middleware qui injecte ces headers sur toutes les reponses :
  ```
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Referrer-Policy: strict-origin-when-cross-origin
  ```

### SEC-06 : CORS avec `*` possible en production
- **Fichier :** `backend/src/config/settings.py:121` et `backend/src/api/middleware.py:184`
- **Probleme :** La valeur par defaut de `cors_origins_str` est `"*"`. Si la variable d'environnement `CORS_ORIGINS` n'est pas definie en production, tous les domaines sont autorises. Le code gere correctement le cas `credentials=False` quand `*` est utilise, mais c'est quand meme trop permissif.
- **Impact :** Tout site web peut faire des requetes API cross-origin vers le backend. L'impact est attenue car `allow_credentials=False` quand `*` est configure.
- **Fix :** Changer la valeur par defaut en production pour n'autoriser que `https://huntzenjobs.com` et les domaines de preview Vercel. Verifier que `CORS_ORIGINS` est configure en production sur Railway.

### SEC-07 : `request.json()` brut sans validation Pydantic
- **Fichiers :**
  - `backend/src/api/routes/jobs.py:374` — `/description` endpoint
  - `backend/src/api/routes/jobs.py:440` — `/track-view` endpoint
  - `backend/src/api/routes/jobs.py:479` — `/find-recruiter` endpoint
- **Probleme :** Ces endpoints utilisent `await request.json()` au lieu de modeles Pydantic, ce qui bypass la validation automatique de FastAPI.
- **Impact :** Risque d'injection de donnees inattendues, pas de documentation OpenAPI automatique, pas de validation de types.
- **Fix :** Creer des modeles Pydantic pour chaque endpoint et les utiliser comme parametres de route.

### SEC-08 : Tables sans RLS activee
- **Tables identifiees :**
  - `webhook_failures` — `20260210000000_webhook_failures.sql` — pas de `ENABLE ROW LEVEL SECURITY`
  - `stripe_webhook_events` — `20260210000002_webhook_idempotency.sql` — pas de RLS
  - `stripe_prices` — `20260210000003_stripe_price_config.sql` — pas de RLS
  - `assistant_suggestions` — `20260317000002_assistant_suggestions.sql` — pas de RLS
- **Impact :** Sans RLS, ces tables sont accessibles en lecture/ecriture via la cle `anon` de Supabase. `webhook_failures` et `stripe_webhook_events` contiennent potentiellement des payloads Stripe (donnees client). `stripe_prices` est moins sensible (prix publics). `assistant_suggestions` contient du texte de suggestion (faible risque).
- **Fix :** Activer RLS sur ces 4 tables et ajouter des policies `service_role` only (ces tables ne doivent etre accessibles que par le backend).

### SEC-09 : Endpoints de session assistant sans authentification
- **Fichiers :**
  - `backend/src/api/routes/assistant.py:592` — `POST /api/assistant/new-session` (pas d'auth)
  - `backend/src/api/routes/assistant.py:598` — `DELETE /api/assistant/session/{session_id}` (pas d'auth)
  - `backend/src/api/routes/coach.py:304` — `POST /api/coach/new-session` (pas d'auth)
  - `backend/src/api/routes/coach.py:311` — `DELETE /api/coach/session/{session_id}` (pas d'auth)
- **Probleme :** N'importe qui peut creer des sessions ou supprimer les sessions d'autres utilisateurs en devinant le UUID.
- **Impact :** Un attaquant pourrait supprimer les sessions de chat d'autres utilisateurs (perte de contexte de conversation).
- **Fix :** Ajouter `CurrentUserDep` sur ces endpoints et verifier que la session appartient bien a l'utilisateur.

### SEC-10 : Endpoint `test-debug` expose le hash de commit git
- **Fichier :** `backend/src/api/routes/auth.py:24-42`
- **Probleme :** `GET /api/auth/test-debug` est accessible sans auth et execute `subprocess.check_output(['git', 'rev-parse', ...])`. Bien que le risque d'injection soit nul (pas d'input utilisateur), cet endpoint expose des informations de version en production.
- **Impact :** Faible — information leakage mineure.
- **Fix :** Proteger derriere `AdminUserDep` ou supprimer en production.

---

## AMELIORATIONS

### SEC-11 : Branding endpoint sans authentification
- **Fichier :** `backend/src/api/routes/branding.py:43`
- **Probleme :** L'endpoint `POST /api/branding/chat` a un rate limit mais pas d'authentification visible dans les 40 premieres lignes. A verifier si `CurrentUserDep` est utilise plus bas.
- **Fix :** Verifier et ajouter `CurrentUserDep` si absent.

### SEC-12 : Le health check webhook est public
- **Fichier :** `backend/src/api/routes/health.py:26`
- **Probleme :** `GET /api/health/webhooks` expose des statistiques de webhook (taux de succes, echecs recents) sans authentification.
- **Impact :** Information leakage mineure — un attaquant peut surveiller l'etat des webhooks.
- **Fix :** Ajouter `AdminUserDep`.

### SEC-13 : Endpoint `/api/stats/plan-distribution` expose la repartition des plans
- **Fichier :** `backend/src/api/routes/stats.py:35`
- **Probleme :** Endpoint public qui retourne le nombre exact d'abonnements par plan. Intentionnel pour le marketing (popup "67% choisissent Pro"), mais expose des donnees business.
- **Impact :** Faible — donnees business publiques.
- **Fix :** Acceptable si intentionnel. Considerer retourner uniquement les pourcentages, pas les counts absolus.

### SEC-14 : Queue status accessible sans verifier l'ownership du job
- **Fichier :** `backend/src/api/routes/queue.py:17`
- **Probleme :** `GET /api/queue/status/{job_id}` accepte un header auth optionnel mais ne verifie pas que le job appartient a l'utilisateur.
- **Impact :** Un utilisateur pourrait voir le resultat d'un job ARQ d'un autre utilisateur en devinant le `job_id` (UUID, donc difficile en pratique).
- **Fix :** Stocker le `user_id` dans les metadonnees du job ARQ et verifier l'ownership.

---

## CE QUI EST SECURISE

- **Stripe webhook** : `stripe.Webhook.construct_event` est utilise correctement pour verifier la signature (`backend/src/services/stripe.py:421`). Le webhook secret manquant bloque le traitement (ligne 417).
- **Idempotence webhook** : Les events Stripe sont verifies via `is_webhook_event_processed` avant traitement (ligne 439).
- **Admin routes** : Toutes les routes `/api/admin/*` utilisent `AdminUserDep` qui verifie `is_admin = TRUE` dans la table `profiles` via `get_current_admin()` (`backend/src/api/deps.py:469`). Les tentatives d'acces non autorise sont loguees dans `security_events`.
- **Authentification** : `get_current_user()` valide le JWT via `supabase.auth.get_user(token)` sur le client anon (pas service_role), ce qui est correct (`backend/src/api/deps.py:376`).
- **Stripe checkout** : Les price IDs sont recuperes depuis la base de donnees via `get_stripe_price_id` RPC, jamais depuis le client. Le `plan_name` est un `Literal["starter", "pro", "premium"]` (`backend/src/services/stripe.py:136`).
- **Annulation Stripe** : Utilise `cancel_at_period_end=True` uniquement, jamais `Subscription.delete()` — protection contre la suppression accidentelle.
- **Storage Supabase** : Les buckets `cvs-adaptes` et `lettres-motivation` sont prives (`public: false`) avec des policies RLS qui verifient `auth.uid()` dans le dossier (`supabase/migrations/20260223135527_create_storage_buckets_for_documents.sql`).
- **Docker non-root** : Le Dockerfile cree un utilisateur `huntzen` et l'utilise pour l'execution (`Dockerfile:28,82`).
- **Secrets en SecretStr** : Toutes les cles API dans `settings.py` utilisent `pydantic.SecretStr`, empechant le logging accidentel.
- **Pas de secrets hardcodes** : Aucune cle `sk_`, `pk_`, ou token JWT hardcode detecte dans le code source.
- **Pas de SQL brut** : Le backend utilise exclusivement le client Supabase (ORM-like) — pas de `execute(f"...")` ou `format(` dans les requetes.
- **RLS active sur tables critiques** : `user_subscriptions`, `profiles`, `cv_analyses`, `usage_quotas`, `saved_jobs`, `user_documents`, `coach_conversations`, `user_notifications`, `support_tickets` ont toutes RLS activee.
- **Rate limiting distribue** : SlowAPI avec Redis pour le rate limiting cross-workers (`backend/src/api/middleware.py:60`).
- **Ban IP** : Middleware `BanIPMiddleware` bloque les IPs bannies via Redis (`backend/src/api/middleware.py:145`).
- **Callback Modal securise** : L'endpoint `/api/cv-analysis/callback` verifie le header `X-Modal-Secret` (`backend/src/api/routes/cv_analysis.py:316`).
- **Cron securise** : Les endpoints cron verifient `CRON_SECRET` via bearer token (`backend/src/api/routes/cron.py:24`).
- **Frontend middleware** : Les routes protegees (`/dashboard`, `/profile`, `/saved-jobs`, `/admin`) redirigent vers `/login` si non authentifie (`frontend-next/src/middleware.ts:194`).
- **Referral code valide** : Le code referral est valide par regex `^HZN-[A-Z0-9]{6}$` avant d'etre stocke (`frontend-next/src/middleware.ts:153`).

---

## Annexe : Tables sans RLS

| Table | RLS Active | Justification acceptable ? |
|---|---|---|
| `webhook_failures` | NON | NON — contient des payloads Stripe potentiellement sensibles |
| `stripe_webhook_events` | NON | NON — contient des event IDs et payloads Stripe |
| `stripe_prices` | NON | PARTIEL — donnees publiques (prix), mais devrait avoir RLS service_role only |
| `assistant_suggestions` | NON | PARTIEL — donnees publiques (texte de suggestions), faible risque |

---

## Annexe : Endpoints publics intentionnels

| Endpoint | Auth | Rate Limit | Justification |
|---|---|---|---|
| `GET /health` | Non | Non | Healthcheck infra |
| `GET /api/auth/test-debug` | Non | Non | Debug deployment |
| `GET /api/public/plans` | Non | Non | Page pricing |
| `GET /api/stats/plan-distribution` | Non | Non | Pop-up marketing |
| `POST /api/jobs/search` (POST) | Optionnel | 50/min | Freemium feature |
| `GET /api/jobs/search` | Optionnel | 10/min | Freemium feature |
| `POST /api/referrals/track-click` | Non | Non | Tracking referral |
| `POST /api/referrals/register` | Non | Non | Enregistrement referral |
| `POST /api/stripe/webhook` | Signature | Non | Webhook Stripe |

---

## Calcul du score

| Critere | Deduction | Raison |
|---|---|---|
| SEC-01 : user_sessions USING(true) | -20 | Un user peut acceder aux CV d'autres users |
| SEC-02 : Endpoints sans auth/rate limit | -5 | Abus couts API possibles |
| SEC-03 : Welcome email sans auth | -3 | Abus email |
| SEC-04 : Pas de validation MIME | -2 | Defense en profondeur |
| SEC-05 : Pas de headers securite | -2 | Clickjacking, MIME sniffing |
| SEC-06 : CORS * par defaut | -1 | Credentials=false attenue |
| SEC-07 : request.json() brut | -1 | Validation bypassee |
| SEC-08 : 4 tables sans RLS | -2 | Donnees webhook exposees |
| SEC-09 : Sessions sans auth | -1 | Suppression sessions |
| SEC-10 : test-debug public | -1 | Info leak mineure |
| **Total** | **-38** | **Score : 62/100** |
