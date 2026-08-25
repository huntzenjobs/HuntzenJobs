# Audit — API & Integrations
Date : 2026-03-18
Score : 62/100

## Resume executif

Le backend HuntZen a une architecture technique globalement correcte avec Sentry configure sur les 3 couches (backend FastAPI, frontend client/server/edge), des workers ARQ bien structures avec retry, et des job providers avec un pattern de graceful degradation. Cependant, plusieurs faiblesses techniques importantes ont ete identifiees : absence de rate limiting sur la majorite des endpoints, response models Pydantic manquants sur ~80% des routes, pas de source maps Sentry uploadees, idempotence webhook simplifiee par rapport aux best practices, et des emails uniquement en francais.

---

## BLOQUANTS

### B1. Stripe routes sans rate limiting
**Fichier:** `backend/src/api/routes/stripe.py` (toutes les routes)
**Probleme:** Aucun `@limiter.limit()` sur les 5 endpoints Stripe (`create-checkout-session`, `cancel-subscription`, `reactivate-subscription`, `create-portal-session`). Le webhook est correctement sans rate limit (verifie par signature).
**Impact:** Un attaquant peut spammer la creation de sessions Checkout ou les annulations sans limitation.

### B2. Majorite des endpoints sans rate limiting
**Fichier:** `backend/src/api/routes/` (multiple fichiers)
**Probleme:** Sur ~120 endpoints recenses, seuls 7 ont un `@limiter.limit()` explicite :
- `auth.py:85` — `/api/auth/me` (60/min)
- `coach.py:126` — `/chat` (30/min)
- `branding.py:43` — `/chat` (30/min)
- `jobs.py:176,257,364` — `/search` (50/min), GET `/search` (10/min), `/description` (15/min)
- `support.py:159` — `/chatbot` (10/min)

Endpoints critiques SANS rate limit : `cv_analysis.py` (upload CV), `assistant.py` (4 chat endpoints), `cv_adapter.py` (8 endpoints de generation), `saved_jobs.py`, `applications.py`, `referrals.py`, `subscription.py`, `notifications.py`, tous les endpoints admin.
**Impact:** Abus possible des endpoints IA (Groq), uploads CV (Modal Labs), et manipulations admin.

### B3. Sentry source maps non uploadees (frontend)
**Fichier:** `frontend-next/next.config.js`, `frontend-next/sentry.client.config.ts`
**Probleme:** Pas de `withSentryConfig()` wrapping dans `next.config.js`, pas de `widenClientFileUpload`, pas d'upload de source maps. Les stack traces Sentry en production seront minifiees et illisibles.
**Impact:** Le debugging en production est serieusement compromis — les erreurs Sentry ne montreront que du code minifie sans reference aux fichiers source.

### B4. Sentry client n'envoie PAS les events en dev (code commente)
**Fichier:** `frontend-next/sentry.client.config.ts:72`
**Probleme:** Le `return null` dans `beforeSend` en dev est commente (`// return null // TEMPORARILY COMMENTED`). En dev, les events sont logges mais quand meme envoyes a Sentry, polluant les donnees prod.
**Impact:** Pollution des metriques Sentry avec des events de dev. Ou bien le commentaire est un oubli et les events dev ne devraient pas etre envoyes.

---

## IMPORTANTS

### I1. ~80% des endpoints sans response_model Pydantic
**Fichier:** `backend/src/api/routes/` (multiple)
**Probleme:** Sur ~120 endpoints, seuls ~17 ont un `response_model` defini. Les endpoints Stripe, auth, cv_analysis, saved_jobs, applications, notifications, subscription, referrals, documents, cron, queue, cv_adapter retournent des `dict` bruts.
**Impact:** Pas de validation de sortie, pas de documentation OpenAPI precise, risque de fuite de donnees sensibles dans les reponses.

### I2. Stripe webhook sans idempotence veritable (RPC best-effort)
**Fichier:** `backend/src/services/stripe.py:436-480`
**Probleme:** L'idempotence est implementee via `is_webhook_event_processed` / `mark_webhook_event_processed` mais :
1. Le check est best-effort (`try/except` qui continue en cas d'echec, ligne 452)
2. Le marquage est best-effort aussi (ligne 479)
3. Pas de transaction atomique entre le traitement et le marquage — race condition possible entre deux retries Stripe simultanes.
**Impact:** En cas de retry rapide par Stripe, le meme event pourrait etre traite deux fois, creant potentiellement des doublons dans `user_subscriptions`.

### I3. Sentry middleware set_user avec scope ephemere
**Fichier:** `backend/src/api/middleware.py:120-121`
**Probleme:** Le user context Sentry est defini avec `sentry_sdk.new_scope()` au lieu de `sentry_sdk.configure_scope()`. Un `new_scope` cree un scope isole qui ne propage pas au reste de la requete. Les erreurs capturees plus tard dans le meme request handler n'auront PAS le user_id attache.
**Impact:** Les erreurs Sentry backend n'ont probablement pas le user_id attache, rendant le debugging par utilisateur impossible.

### I4. Emails uniquement en francais
**Fichier:** `backend/src/services/email.py` (tout le fichier)
**Probleme:** Tous les 10 templates email (welcome, CV analysis, job alerts, weekly summary, recruiter confirmation, support ticket, etc.) sont hardcodes en francais. Aucun parametre `language` n'est accepte, aucun systeme de templates i18n.
**Impact:** Les utilisateurs non-francophones (EN, ES, PT supportes par le frontend) recoivent des emails en francais — experience incoherente pour un SaaS international.

### I5. Pas d'email de confirmation de paiement Stripe
**Fichier:** `backend/src/services/stripe.py:494-713`, `backend/src/services/email.py`
**Probleme:** Apres `checkout.session.completed`, aucun email de confirmation d'abonnement n'est envoye a l'utilisateur. Le `send_admin_alert` est appele, mais pas d'email user. Seul le recruiter checkout envoie un email de confirmation (`send_recruiter_request_confirmation`).
**Impact:** L'utilisateur paie mais ne recoit aucune confirmation par email — mauvaise experience, manque de confiance, risque de chargeback.

### I6. Pas d'email d'annulation d'abonnement
**Fichier:** `backend/src/services/stripe.py:777-818`
**Probleme:** `handle_subscription_deleted()` ne declenche aucun email a l'utilisateur pour confirmer l'annulation. Seul un event tracking et une alerte admin sont logues.
**Impact:** L'utilisateur annule mais ne recoit pas de confirmation — experience incomplete.

### I7. Erreurs exposant des details internes dans les reponses HTTP
**Fichier:** `backend/src/api/routes/stripe.py:83`, `stripe.py:114`, `stripe.py:179`, `stripe.py:242`, `stripe.py:294`
**Probleme:** Les `except Exception as e` retournent `str(e)` dans le detail HTTP 500 : `detail=f"Failed to create checkout: {str(e)}"`. Cela peut exposer des traces Stripe internes, des noms de tables DB, ou des messages d'erreur Python.
**Impact:** Fuite d'informations internes vers le client (security concern).

---

## AMELIORATIONS

### A1. Job providers — pas de retry sur 429 (rate limit)
**Fichier:** `backend/src/services/job_providers/base.py:28-43`
**Probleme:** Le decorateur `handle_provider_errors` catch `httpx.HTTPStatusError` mais ne distingue pas les 429. Pas de backoff exponentiel, pas de retry — retourne simplement une liste vide.
**Impact:** Si Adzuna ou SerpAPI retourne un 429, le provider est silencieusement ignore pour cette requete au lieu de retenter.

### A2. Job providers — pas de cache Redis
**Fichier:** `backend/src/services/job_providers/aggregator.py`
**Probleme:** Chaque recherche identique (meme query, location, country) declenche de nouveaux appels a tous les providers. Pas de cache Redis malgre Redis disponible dans l'infra.
**Impact:** Consommation inutile des quotas API (Adzuna 1000/mois, SerpAPI 100/mois), latence augmentee, risque de rate limiting.

### A3. France Travail — token cache en memoire uniquement
**Fichier:** `backend/src/services/job_providers/france_travail.py:46`
**Probleme:** `self._access_token` est cache en memoire sur l'instance. Avec Gunicorn multi-worker, chaque worker redemande un token independamment. Pas de cache Redis partage.
**Impact:** Multiplexage inutile des demandes d'auth OAuth2 (mineur, tokens durent 25min).

### A4. Workers ARQ — pas de persistence des erreurs en DB
**Fichier:** `backend/src/workers/tasks.py`
**Probleme:** Les 4 taches ARQ (`coach_task`, `assistant_task`, `cv_adapt_task`, `cover_letter_task`) n'ont pas de gestion d'exception explicite. ARQ catch les exceptions et les stocke dans Redis (`keep_result=3600`), mais aucune persistence en DB pour audit ulterieur.
**Impact:** Les erreurs des taches async sont perdues apres 1h (TTL Redis). Pas de visibilite long-terme sur les echecs.

### A5. Sentry defaultIntegrations: false sur client et serveur
**Fichier:** `frontend-next/sentry.client.config.ts:65`, `sentry.server.config.ts:35`
**Probleme:** `defaultIntegrations: false` desactive TOUTES les integrations par defaut (GlobalHandlers, LinkedErrors, Dedupe, etc.). Seules `browserTracingIntegration`, `breadcrumbsIntegration` et `replayIntegration` sont ajoutees manuellement cote client. Cote serveur, seul `httpIntegration` est ajoute.
**Impact:** Des erreurs non capturees (unhandled promise rejections, uncaught errors) pourraient etre manquees cote serveur. Cote client, `GlobalHandlers` manque.

### A6. Endpoint `/api/auth/test-debug` execute subprocess en prod
**Fichier:** `backend/src/api/routes/auth.py:24-42`
**Probleme:** L'endpoint `test-debug` execute `subprocess.check_output(['git', 'rev-parse', ...])` a chaque requete. Pas de rate limit, pas d'auth, bare `except:` (ligne 36).
**Impact:** Leger risque de DoS via subprocess spawning, et `except:` avale silencieusement toutes les erreurs.

### A7. `/api/auth/welcome` sans rate limiting ni verification
**Fichier:** `backend/src/api/routes/auth.py:336-344`
**Probleme:** L'endpoint `POST /api/auth/welcome` n'a ni rate limiting ni verification que l'email correspond a un utilisateur reel. N'importe qui peut declencher l'envoi d'un email de bienvenue a n'importe quelle adresse.
**Impact:** Potentiel abus pour du spam via le service Resend de HuntZen.

### A8. Groq retry non visible depuis les routes
**Fichier:** `backend/src/utils/groq_retry.py` (reference dans `backend/AGENTS.md` mais pas audite en detail ici)
**Probleme:** La logique de retry Groq est dans `groq_retry.py` avec rotation de cles. Le coach route (`coach.py:194-203`) catch les rate limits Groq pour retourner 429, mais les autres assistants ne le font pas — ils retournent 500 generique.
**Impact:** Experience utilisateur incoherente entre coach et les autres assistants lors de saturation Groq.

---

## CE QUI EST SOLIDE

### S1. Sentry backend bien configure
**Fichier:** `backend/src/main.py:34-45`
- Initialise conditionnellement (`if settings.sentry_dsn`)
- `traces_sample_rate=0.3` (bon ratio perf/visibilite)
- `profiles_sample_rate=0.1`
- Integrations FastAPI + Starlette explicites
- `send_default_pii=False` (protection donnees)

### S2. Sentry frontend triple config (client/server/edge)
**Fichier:** `frontend-next/sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- 3 configs separees avec sample rates adaptes (50% client, 5% serveur, 1% edge)
- Session Replay active (10% normal, 100% erreurs)
- Filtrage des erreurs non-actionnables (browser extensions, network errors)
- Sanitisation des donnees sensibles dans URLs et breadcrumbs
- User context attache cote frontend (`auth-context.tsx:123-128`)

### S3. Modal Labs bien securise
**Fichier:** `backend/src/api/routes/cv_analysis.py:314-327`, `backend/src/services/modal_pdf_extractor.py`
- Callback securise par `MODAL_CALLBACK_SECRET` (header `X-Modal-Secret`)
- Timeout explicite de 120s sur les appels Modal (`MODAL_TIMEOUT_SECONDS`)
- Taille max 10MB validee
- Gestion des erreurs utilisateur vs serveur (`user_error` flag)
- Fallback pypdf si Modal echoue
- Extraction minimale validee (100 chars min)

### S4. Job providers — graceful degradation
**Fichier:** `backend/src/services/job_providers/base.py`, `aggregator.py`
- Decorateur `handle_provider_errors` retourne liste vide en cas d'echec (pas de crash)
- Recherche parallele via `asyncio.gather`
- Timeouts explicites sur tous les providers : Adzuna 25s, FranceTravail 15s (auth 10s), RemoteOK 15s, SerpAPI 20s
- France Travail retry automatique sur 401 (token expire)

### S5. Stripe webhook — signature verifiee
**Fichier:** `backend/src/services/stripe.py:416-429`
- Verification obligatoire de la signature Stripe
- Rejet si `STRIPE_WEBHOOK_SECRET` non configure (pas de bypass)
- Distinction `SignatureVerificationError` vs erreur generique

### S6. ARQ workers bien configures
**Fichier:** `backend/src/workers/settings.py`
- `max_tries=3` (retry automatique)
- `job_timeout=120` (2min, coherent avec les appels Groq)
- `retry_jobs=True`
- `keep_result=3600` (1h de cache resultat)
- `max_jobs=750` (dimensionne pour le throughput Groq)
- Startup/shutdown propres (DB pool + Redis)

### S7. Middleware bien structure
**Fichier:** `backend/src/api/middleware.py`
- Rate limiting distribue via Redis (fallback in-memory)
- IP banning via Redis
- GZip compression
- Logging avec timing (`X-Response-Time`)
- CORS configure correctement (credentials vs wildcard)
- `swallow_errors=True` sur le limiter (fail-open si Redis down)

### S8. Global exception handler avec CORS
**Fichier:** `backend/src/main.py:122-145`
- Les erreurs 500 non gerees incluent les headers CORS pour que le navigateur puisse lire la reponse
- Logging avec `exc_info=True` pour les stack traces completes
- Message generique ("Internal server error") retourne au client

---

## Etat Sentry

| Composant | Init | Sample Rate | User Context | Source Maps | Note |
|-----------|------|-------------|--------------|-------------|------|
| Backend FastAPI | OK (`main.py:38`) | 30% traces, 10% profiling | Partiel (middleware new_scope) | N/A | User context ne propage pas correctement |
| Frontend Client | OK (`sentry.client.config.ts`) | 50% traces | OK (`auth-context.tsx:123`) | NON uploadees | Stack traces minifiees en prod |
| Frontend Server | OK (`sentry.server.config.ts`) | 5% traces | Non | N/A | defaultIntegrations: false risque |
| Frontend Edge | OK (`sentry.edge.config.ts`) | 1% traces | Non | N/A | Config minimale, correct pour edge |

**Verdict Sentry : 60%** — Init presente partout, mais source maps manquantes et user context backend defaillant degradent fortement l'utilite en production.

---

## Etat emails transactionnels

| Email | Implemente | Template FR | Template EN | Retry | Note |
|-------|-----------|-------------|-------------|-------|------|
| Welcome (signup) | OUI (`send_welcome`) | OUI | NON | NON | Appele depuis `/api/auth/welcome` |
| Confirmation paiement | **NON** | — | — | — | Manquant dans `handle_checkout_completed` |
| Annulation abonnement | **NON** | — | — | — | Manquant dans `handle_subscription_deleted` |
| Analyse CV prete | OUI (`send_cv_analysis_complete`) | OUI | NON | NON | Appele depuis le callback Modal |
| Document genere | OUI (`send_document_generated`) | OUI | NON | NON | |
| Job alerts | OUI (`send_job_alerts`) | OUI | NON | NON | |
| Weekly summary | OUI (`send_weekly_summary`) | OUI | NON | NON | |
| Application confirmation | OUI (`send_application_confirmation`) | OUI | NON | NON | |
| Status change (interview/offer) | OUI (`send_application_status_change`) | OUI | NON | NON | |
| Recruiter request (user) | OUI (`send_recruiter_request_confirmation`) | OUI | NON | NON | |
| Recruiter request (admin) | OUI (`send_recruiter_request_notification`) | OUI | NON | NON | |
| Support ticket (admin) | OUI (`send_support_ticket_notification`) | OUI | NON | NON | |
| Support reply (user) | OUI (`send_support_ticket_reply`) | OUI | NON | NON | |

**Verdict emails : 45%** — Bonne couverture fonctionnelle (11/13 cas couverts) mais zero template EN, pas de retry sur echec d'envoi, et 2 emails critiques manquants (confirmation paiement, confirmation annulation).

---

## Calcul du score

| Critere | Deduction | Raison |
|---------|-----------|--------|
| Source maps Sentry non uploadees | -10 | Debugging prod compromis |
| Sentry user context backend defaillant | -5 | new_scope au lieu de configure_scope |
| Stripe endpoints sans rate limiting | -10 | 5 endpoints critiques non proteges |
| Emails transactionnels sans EN | -5 | SaaS international, emails FR only |
| Emails paiement/annulation manquants | -5 | 2 emails critiques absents |
| Pas de cache Redis sur job providers | -5 | Gaspillage quotas API |
| Response models manquants (~80%) | -5 | Fuite potentielle de donnees |
| Erreurs Stripe exposant str(e) | -3 | Fuite d'infos internes |
| Pas de retry 429 sur job providers | -3 | Resilience incomplete |
| defaultIntegrations: false | -2 | Risque d'erreurs non capturees |

**Base : 100 - 10 - 5 - 10 - 5 - 5 - 5 - 5 - 3 - 3 - 2 = 47**

**Bonus (ce qui est bien fait) :**
- Modal Labs bien securise et avec timeout : +3
- Job providers graceful degradation + timeouts : +3
- ARQ workers bien configures avec retry : +3
- Stripe webhook signature + idempotence (meme partielle) : +3
- Global exception handler avec CORS : +1
- Sentry init sur toutes les couches : +2

**Score final : 47 + 15 = 62/100**
