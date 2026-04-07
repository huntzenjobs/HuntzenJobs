# Documentation Technique — HuntzenJobs

> Version 3.0.0 | Mise à jour : 6 avril 2026
> Plateforme d'aide à la recherche d'emploi

---

## 1. Vue d'ensemble

HuntzenJobs est une plateforme SaaS qui combine intelligence artificielle et agrégation multi-sources pour accompagner les chercheurs d'emploi. Le produit couvre l'intégralité du parcours : recherche d'offres, analyse de CV, adaptation de candidature, coaching carrière, simulation d'entretien et personal branding.

**Chiffres clés du projet :**

| Indicateur | Valeur |
|---|---|
| Commits | 1 013 |
| Durée de développement | 3,5 mois (janv. 2026 → avr. 2026) |
| Pull requests mergées | 165 |
| Endpoints API | 90+ |
| Sources d'offres intégrées | 5 (Adzuna, SerpAPI, France Travail, JSearch, RemoteOK) |
| Langues supportées | 4 (FR, EN, ES, PT) |
| Tests | 274 (au dernier audit) |

---

## 2. Architecture technique

```
┌─────────────────────────────────────────────────┐
│                    Utilisateurs                  │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │   Vercel (CDN + SSR)    │
          │   Next.js 14 — Paris    │
          │   7 crons planifiés     │
          └────────────┬────────────┘
                       │ HTTPS
          ┌────────────▼────────────┐
          │   Railway (Backend)     │
          │   FastAPI + Gunicorn    │
          │   2-4 replicas auto     │
          ├─────────────────────────┤
          │   ARQ Worker (Redis)    │
          │   Tâches async (coach,  │
          │   CV, cover letter)     │
          └────────┬───┬───┬────────┘
                   │   │   │
       ┌───────────┘   │   └───────────┐
       ▼               ▼               ▼
  ┌─────────┐   ┌───────────┐   ┌──────────┐
  │Supabase │   │   Groq    │   │  Modal   │
  │PostgreSQL│   │  LLM x2  │   │  Labs    │
  │Auth+RLS │   │Llama 4/3.3│   │  PDF/OCR │
  │Storage  │   └───────────┘   └──────────┘
  │Realtime │
  └─────────┘
```

### Stack technique

| Couche | Technologie | Détails |
|---|---|---|
| **Frontend** | Next.js 14.2 (App Router) | TypeScript, Tailwind CSS, shadcn/ui, Framer Motion |
| **Backend** | FastAPI (Python 3.11) | LangChain, Pydantic v2, async/await |
| **Base de données** | PostgreSQL 17 (Supabase) | RLS activé sur toutes les tables, 30+ tables |
| **Cache / Queue** | Redis (Railway) | Cache API (15 min), rate limiting, file d'attente ARQ |
| **LLM** | Groq | Llama 4 Scout 17B (rapide), Llama 3.3 70B (puissant) |
| **Paiement** | Stripe | 3 plans payants + consultation recruteur (50 €) |
| **Email** | Resend | Emails transactionnels FR/EN/ES/PT |
| **PDF** | Modal Labs (extraction), WeasyPrint (génération) | Docling pour OCR, 3 templates CV |
| **Monitoring** | Sentry + LangSmith | Erreurs, performance, traces LLM |
| **CI/CD** | GitHub Actions | Tests auto, build Docker, deploy |
| **Hébergement** | Vercel (front, Paris cdg1) + Railway (back, 2-4 replicas) | Autoscaling CPU 30-60% |

---

## 3. Fonctionnalités produit

### 3.1 Recherche d'emploi

Fonctionnalité principale. Le moteur de recherche (JobScoutAgent) agrège les offres de 5 providers et les trie par pertinence.

**Sources d'offres :**

| Provider | API | Couverture | Spécificités |
|---|---|---|---|
| **Adzuna** | REST API | International (FR, UK, US, DE, etc.) | Provider principal, max 50/page |
| **France Travail** | OAuth2 API | France uniquement | Codes ROME, géolocalisation lat/lon |
| **SerpAPI** | Google Jobs | International | Scraping Google for Jobs |
| **JSearch** | RapidAPI | International | Estimations salariales |
| **RemoteOK** | REST API | Remote uniquement | Exclu pour alternance/apprentissage |

**Pipeline technique :**

| Étape | Traitement | IA |
|---|---|---|
| 1. Raffinement | QueryRefiner corrige et développe la requête (Llama 4 Scout, temp=0.0) | Oui |
| 2. Fan-out | Recherche parallèle avec l'abréviation ET la forme développée | Non |
| 3. Agrégation | 5 providers interrogés en parallèle via `asyncio.gather` | Non |
| 4. Déduplication | Suppression des doublons par titre + entreprise | Non |
| 5. Pré-filtrage | Mots-clés + fuzzy matching pour éliminer les résultats hors-sujet | Non |
| 6. Filtrage écoles | Suppression des offres de formation déguisées en emploi | Non |
| 7. Scoring | Top 20 scorés par IA (Llama 3.3 70B), reste scoré par mots-clés | Oui |
| 8. Résultat | Tri par score, limitation à max_results (200 max) | Non |

**Fonctionnalités utilisateur :**
- Filtres avancés : type de contrat, horaires, jours, salaire, taille entreprise (Premium)
- Cartes d'offres avec détails en modal, sauvegarde, candidature
- Historique de recherche avec reprise rapide
- Cache Redis 15 minutes par recherche

### 3.2 Analyse de CV

Pipeline d'analyse automatique de CV avec scoring ATS.

| Étape | Traitement | IA |
|---|---|---|
| 1. Upload | PDF envoyé vers Supabase Storage | Non |
| 2. Extraction | Modal Labs extrait le texte (IBM Docling / OCR) | Non |
| 3. Score ATS | ATSScorer note sur 100 : format, mots-clés, expérience, compétences (Llama 3.3 70B) | Oui |
| 4. Compétences | SkillExtractor catégorise les compétences (Llama 4 Scout) | Oui |
| 5. Matching | JobMatcher compare le CV à l'offre cible (Llama 3.3 70B) | Oui |
| 6. Suggestions | ImprovementAdvisor génère des améliorations concrètes (Llama 4 Scout) | Oui |

Traitement asynchrone via ARQ (Redis) avec polling de statut côté frontend.

### 3.3 Adaptation de CV

Pipeline de réécriture de CV ciblée pour une offre spécifique, avec contrôle de véracité.

| Étape | Traitement | IA |
|---|---|---|
| 1. Analyse offre | JobAnalyzer extrait les exigences, mots-clés et ton de l'offre | Oui |
| 2. Mapping | CVMapper associe chaque expérience aux exigences de l'offre | Oui |
| 3. Réécriture | CVRewriter reformule avec le vocabulaire de l'offre (Llama 3.3 70B) | Oui |
| 4. Fact-check | FactChecker vérifie qu'aucune information n'a été inventée (Llama 3.3 70B) | Oui |
| 5. PDF | WeasyPrint génère le CV final (3 templates : ATS, Moderne, Classique) | Non |

Génère aussi des lettres de motivation personnalisées avec prévisualisation HTML.

### 3.4 Recherche de recruteurs

Orchestration de 3 sources pour trouver les contacts RH d'une entreprise :
1. **Apollo.io** — Recherche de personnes par entreprise/poste
2. **SerpAPI + Groq** — Recherche Google avec extraction IA des profils LinkedIn
3. **Hunter.io** — Recherche d'emails par domaine

Résultats cachés 30 jours en base.

### 3.5 Salons et forums emploi

Agrégation d'événements depuis 6 sources publiques françaises : France Travail, CCI France, APEC, L'Étudiant, Studyrama, CIDJ. Filtres par région, secteur, type d'événement, format.

### 3.6 Guide expatriation

Guide par pays avec coût de la vie, comparaison salariale, checklist des démarches administratives. Données disponibles en 4 langues.

### 3.7 Suivi de candidatures

Pipeline de suivi : Candidaté → Consulté → Entretien → Refusé → Offre. Statistiques par statut, email de confirmation à chaque candidature.

### 3.8 Gestion de documents

CRUD complet sur les profils CV, les CV générés et les lettres de motivation. Prévisualisation, édition, téléchargement PDF.

### 3.9 Score carrière (gamification)

Score d'employabilité sur 100 composé de :
- Score d'activité (0-40) : basé sur l'usage de la plateforme
- Score IA (0-40) : évaluation par l'IA du profil
- Score XP (0-20) : points d'expérience accumulés

---

## 4. Chatbots IA (5 assistants conversationnels)

Les utilisateurs interagissent avec 5 chatbots spécialisés. Chaque chatbot est une interface conversationnelle — il conseille, oriente et répond aux questions. Les traitements lourds (recherche d'offres, analyse de CV, etc.) sont gérés par les pipelines décrits en section 3.

| Persona | Spécialité | Modèle | Premium |
|---|---|---|---|
| **Nova** | Coaching carrière, orientation, reconversion, négociation salariale | Llama 4 Scout | Non |
| **Maria** | Conseils stratégie de recherche d'emploi, insights marché | Llama 3.3 70B | Non |
| **Sofia** | Conseils optimisation CV, bonnes pratiques ATS | Llama 3.3 70B | Non |
| **Lucas** | Simulation d'entretien avec feedback (méthode STAR) | Llama 3.3 70B | Oui |
| **David** | Stratégie LinkedIn et personal branding | Llama 3.3 70B | Oui |

Chaque chatbot a son propre historique de conversation, ses suggestions contextuelles, et supporte l'upload de CV en cours de discussion.

### Nova — Détail des sous-agents

Nova (Career Coach) est le chatbot le plus complexe. Il détecte les situations (licenciement, burnout, reconversion) et fait appel à des sous-agents spécialisés :

| Sous-agent | Rôle | Modèle |
|---|---|---|
| TrainingAdvisor | Recommandations formations/certifications | Llama 4 Scout |
| CareerPlanner | Plan de carrière long terme | Llama 4 Scout |
| SkillAnalyzer | Analyse des compétences et lacunes | Llama 4 Scout |
| SalaryAdvisor | Données salariales temps réel (Adzuna) + négociation | Llama 3.3 70B |
| ParameterExtractor | Extraction poste/ville/contrat depuis la conversation | Llama 4 Scout |

---

## 5. Système de monétisation

### 5.1 Plans tarifaires

| Plan | Prix/mois | Recherches/jour | Messages coach | Analyses CV | Fonctionnalités |
|---|---|---|---|---|---|
| **Free** | 0 € | 3 | 5 | 1 | Fonctions de base |
| **Starter** | 8,90 € | 15 | 30 | 5 | Filtres avancés |
| **Pro** | 13,90 € | 50 | Illimité | 15 | + Export PDF, lettre de motivation |
| **Premium** | 19,90 € | Illimité | Illimité | Illimité | + Simulation entretien, branding |

Les plans sont gérés en base de données (`subscription_plans`) avec limites JSONB et feature flags. L'admin peut modifier les plans, les limites et le wording depuis le panel d'administration.

### 5.2 Quotas

Un système de quotas journaliers (`usage_quotas`) suit l'utilisation par fonctionnalité. Reset automatique chaque nuit à minuit via cron Vercel. Le cache Redis est invalidé à chaque changement de plan.

### 5.3 Système de parrainage

- Code unique par utilisateur (format : HZN-XXXXXX)
- Tracking des clics, inscriptions et conversions
- Récompenses par palier : jours gratuits, bonus de quota, coupons Stripe
- Opérations atomiques en base pour éviter les race conditions
- Page dédiée avec progression des paliers et liste des filleuls

### 5.4 Codes promo

Validation et application de codes promotionnels. Génération automatique de coupons Stripe pour des scénarios spécifiques (rétention, win-back).

---

## 6. Panel d'administration

Le panel admin (`/admin/*`) est protégé par une vérification `is_admin` côté serveur. Il couvre :

| Section | Fonctionnalités |
|---|---|
| **Dashboard** | KPIs temps réel, signups, revenue, MRR |
| **Utilisateurs** | Liste paginée, recherche, détail, suspension, ban IP, assignation de plan, reset mot de passe, suppression, notes admin |
| **Plans** | Édition des plans (limites, features, prix), configuration Stripe |
| **Prompts IA** | CRUD sur les prompts des agents (table `ai_prompts`) |
| **Coaches** | Configuration des assistants (persona, comportement, traduction auto) |
| **Parrainages** | Gestion du programme, stats, rewards |
| **Support** | Tickets utilisateurs, réponse admin, changement de statut |
| **Notifications** | Gestion des notifications in-app |
| **Coupons** | Génération de coupons Stripe |
| **Logs** | Audit de sécurité, événements |
| **Live** | Monitoring temps réel des utilisateurs connectés (SSE) |
| **Stress test** | Outil de load testing intégré avec métriques live |
| **Bannière** | Gestion de la bannière site-wide (Redis) |
| **Maintenance** | Mode maintenance activable/désactivable |

---

## 7. Base de données

PostgreSQL 17 hébergé sur Supabase avec RLS (Row Level Security) activé sur chaque table.

### Tables principales (30+)

| Catégorie | Tables |
|---|---|
| **Utilisateurs** | `profiles`, `coach_conversations`, `active_coach_sessions` |
| **Abonnements** | `subscription_plans`, `user_subscriptions`, `usage_quotas`, `stripe_prices`, `subscription_history` |
| **CV / Documents** | `cv_analyses`, `cv_profiles`, `user_documents` |
| **Emploi** | `saved_jobs`, `user_applications` |
| **Parrainage** | `referrals`, `referral_signups`, `referral_rewards`, `referral_config` |
| **Communication** | `user_notifications`, `user_notification_preferences`, `recruiter_requests`, `support_tickets` |
| **Sécurité** | `security_audit_log`, `security_events`, `webhook_failures`, `stripe_webhook_events`, `email_blacklist` |
| **Admin** | `admin_notes`, `user_events`, `user_career_score`, `user_xp_events`, `stress_test_runs` |
| **Config** | `ai_prompts`, `user_feature_overrides`, `assistant_suggestions`, `translation_memory`, `contact_finder_cache` |

### Fonctions et triggers clés

- `handle_new_user()` — Création automatique du profil + abonnement free + quotas à l'inscription
- `track_subscription_changes()` — Historique complet des changements d'abonnement
- `check_user_quota()` / `increment_usage()` — Gestion des quotas journaliers
- `get_or_create_referral_code()` — Génération de code parrainage
- `reset_daily_quotas()` — Nettoyage des quotas > 7 jours
- `cleanup_stale_coach_sessions()` — Suppression des sessions > 24h

### Stockage fichiers (Supabase Storage)

| Bucket | Usage | Limite |
|---|---|---|
| `cvs` | PDF uploadés | 10 MB, PDF uniquement |
| `avatars` | Photos de profil | 2 MB, JPEG/PNG/WebP |
| `support-attachments` | Pièces jointes tickets | Privé |

---

## 8. Sécurité

| Mesure | Détail |
|---|---|
| **Authentification** | Supabase Auth (email/password + Google OAuth), JWT |
| **Autorisation** | RLS PostgreSQL sur chaque table, middleware admin côté serveur |
| **Rate limiting** | SlowAPI + Redis (300 req/min défaut), ban IP automatique |
| **Headers** | X-Frame-Options DENY, HSTS, X-Content-Type-Options, CSP, Referrer-Policy |
| **Compression** | GZip (> 1000 bytes) |
| **Audit** | `security_audit_log` pour les opérations sensibles |
| **Webhooks** | Idempotence Stripe, tracking des échecs avec retry |
| **Prompts IA** | Protocol FORTRESS anti-injection, isolation des inputs utilisateur |
| **Données** | Sanitization à l'insertion (triggers), GDPR export/delete |
| **Anti-abus** | Détection de multi-onglet (sessions coach), sliding window heartbeat |

---

## 9. Emails transactionnels

17 types d'emails gérés via Resend, tous traduits en 4 langues :

| Email | Déclencheur |
|---|---|
| Bienvenue | Inscription |
| Analyse CV terminée | Fin de traitement Modal |
| Document généré | Génération CV/LM |
| Confirmation paiement | Checkout Stripe réussi |
| Échec de paiement | Invoice payment_failed |
| Annulation abonnement | Annulation Stripe |
| Facture PDF | Paiement avec pièce jointe PDF (max 5 MB) |
| Alertes emploi | Cron quotidien 8h |
| Résumé hebdomadaire | Cron lundi 9h |
| Confirmation candidature | Candidature enregistrée |
| Changement statut candidature | Mise à jour pipeline |
| Demande recruteur | Consultation payante créée |
| Ticket support | Nouveau ticket |
| Réponse support | Réponse admin |
| Contact | Formulaire de contact |
| Plan expirant | J-7 avant expiration |
| Rétention | Inactivité 7-14 jours |

---

## 10. Crons planifiés

7 tâches automatisées via Vercel Cron :

| Horaire | Tâche | Description |
|---|---|---|
| Chaque jour 00h00 | Reset quotas | Supprime les quotas > 7 jours |
| Chaque jour 00h00 | Admin digest | Email récap (signups, revenue, MRR) |
| Chaque jour 03h00 | Cleanup | Purge événements > 30 jours |
| Chaque jour 08h00 | Alertes emploi | Digest des nouvelles offres matchées |
| Chaque jour 08h00 | Plans expirants | Notification J-7 |
| Chaque jour 10h00 | Rétention | Notification utilisateurs inactifs |
| Lundi 09h00 | Résumé hebdo | Récap d'activité de la semaine |

---

## 11. Internationalisation

La plateforme supporte 4 langues : français (défaut), anglais, espagnol, portugais.

- **Frontend** : `next-intl` avec fichiers de traduction JSON par locale
- **Détection automatique** : Header Vercel `x-vercel-ip-country` → mapping pays/langue
- **Override manuel** : Cookie `LOCALE_MANUAL` via le sélecteur de langue
- **Backend** : Emails traduits, plans traduits, coaches traduits
- **Données** : Guide expat en 4 langues, suggestions assistants configurables

---

## 12. Performance et scaling

| Composant | Configuration |
|---|---|
| **Backend** | 2-4 replicas Railway, autoscaling CPU 30-60%, Gunicorn + Uvicorn |
| **Cache** | Redis : 15 min recherches, 30s auth/me, 1h stats, 24h score carrière, 30j contacts recruteurs |
| **LLM** | Sémaphore 5 appels Groq simultanés par worker, rotation de clés API, retry exponentiel sur 429 |
| **PDF** | Traitement déchargé sur Modal Labs (serverless, pas d'OOM Railway) |
| **Frontend** | SSR + Static generation, standalone output, PWA avec cache offline |
| **DB** | Connection pooling psycopg3 (20 connexions, 30s timeout) |
| **Compression** | GZip sur les réponses > 1 KB |

---

## 13. CI/CD et tests

### Pipeline GitHub Actions

1. **Backend** : Python 3.11, Ruff (lint), Pytest (tests unitaires + coverage)
2. **Frontend** : Node 20, ESLint, TypeScript check, build, Vitest (tests + coverage)
3. **Docker** : Build des deux images
4. **E2E** : Playwright (Chromium) sur les PRs

### Structure des tests

| Répertoire | Contenu |
|---|---|
| `backend/tests/` | Tests unitaires agents (JobScout, Coach, CV Analyzer) |
| `backend/tests/unit/` | Tests BaseAgent, SubAgent, config, prompts |
| `tests/integration/` | Workflows complets (recherche, CV, coach, Stripe) |
| `tests/unit/` | 16+ fichiers de tests frontend |
| `e2e/` | Tests Playwright (paiements, bugs) |

**Couverture minimale requise** : 80% (convention projet).

---

## 14. Endpoints API — Résumé par domaine

| Domaine | Endpoints | Auth |
|---|---|---|
| Authentification / Compte | 8 | Mixte |
| Career Coach | 6 | Oui |
| Multi-Assistant (5 bots) | 7 | Oui |
| Recherche d'emploi | 7 | Oui |
| Analyse CV | 4 | Oui |
| Adaptation CV / LM | 10 | Mixte |
| Personal Branding | 3 | Oui |
| Recruteurs (contact + consultation) | 7 | Oui |
| Stripe / Paiements | 5 | Mixte |
| Abonnements | 3 | Oui |
| Offres sauvegardées | 4 | Oui |
| Candidatures | 4 | Oui |
| Documents | 5 | Oui |
| Salons / Événements | 5 | Non |
| Notifications | 4 | Mixte |
| Score carrière | 3 | Oui |
| Parrainage | 5 | Mixte |
| Codes promo / Coupons | 3 | Mixte |
| Support | 5 | Mixte |
| Admin | 30+ | Admin |
| Crons | 4 | Secret |
| Health / Monitoring | 4 | Non |
| Stats / Public | 7 | Non |
| **Total** | **~95** | |

---

## 15. Historique de développement

| Phase | Période | Réalisations principales |
|---|---|---|
| **Phase 0 — Fondation** | Déc. 2025 | Scaffold multi-agents, agrégation d'offres (Adzuna, RemoteOK) |
| **Phase 1 — Expansion sources** | Janv. 2026 | JSearch, SerpAPI, LinkedIn, recherche de recruteurs, analyse CV |
| **Phase 2 — Architecture** | Janv. 2026 | Docker, Docling PDF, OAuth Google, Redis quotas, Modal Labs |
| **Phase 3 — Production** | Fév. 2026 | Stripe, Railway multi-worker, rate limiting, email Resend, k6 load tests |
| **Phase 4 — Audit qualité** | Mars 2026 | 8 sprints d'audit (sécurité, RGPD, a11y, SEO, DB, code quality), 274 tests OK |
| **Phase 5 — Business** | Mars 2026 | Admin panel, onboarding, parrainage, codes promo, filtres avancés, i18n 4 langues |
| **Phase 6 — UX** | Mars 2026 | Freemium timer, recruiter redesign, correction 8 bugs Sentry |
| **Phase 7 — Contact Finder** | Mars 2026 | Orchestration Apollo/SerpAPI/Hunter, cache 30j, fix race conditions parrainage |
| **Phase 8 — Facturation** | Mars 2026 | Factures PDF Stripe en email, assistant hub, welcome email i18n |
| **Phase 9 — Recherche** | Avr. 2026 | Fix 11 bugs pipeline recherche, fan-out queries, préservation FR, +400% résultats |

---

## 16. Services externes

| Service | Usage | Intégration |
|---|---|---|
| **Supabase** | BDD, Auth, Storage, Realtime | SDK Python + JS |
| **Railway** | Hébergement backend + workers + Redis | Docker, autoscaling |
| **Vercel** | Hébergement frontend + crons | Next.js, region Paris |
| **Groq** | Inférence LLM (Llama 4 + 3.3) | LangChain + rotation de clés |
| **Stripe** | Paiements et abonnements | SDK Python, webhooks idempotents |
| **Modal Labs** | Extraction PDF serverless | Webhook callback |
| **Resend** | Emails transactionnels | SDK Python |
| **Sentry** | Monitoring erreurs et performance | SDK Python + Next.js |
| **LangSmith** | Tracing des agents LLM | LangChain integration |
| **Adzuna** | Offres d'emploi + données salariales | REST API |
| **France Travail** | Offres d'emploi françaises | OAuth2 API |
| **SerpAPI** | Google Jobs + recherche Google | REST API |
| **JSearch / RapidAPI** | Offres + estimations salariales | REST API |
| **RemoteOK** | Offres remote | REST API |
| **Apollo.io** | Recherche de contacts professionnels | REST API |
| **Hunter.io** | Recherche d'emails | REST API |
| **OpenStreetMap / Nominatim** | Géocodage villes | REST API |

---


