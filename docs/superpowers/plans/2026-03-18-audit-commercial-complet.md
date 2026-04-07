# Audit Commercial Complet HuntZen — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire un rapport d'audit exhaustif de HuntZen (score /100 par dimension) puis corriger tous les 🔴 bloquants avant le lancement commercial en 1 semaine.

**Architecture:** Phase 0 (cartographie) → Phase 1 (10 subagents Opus en parallèle) → Phase 2 (consolidation) → Phase 3 (corrections par sprint). Chaque phase est gatée par une validation humaine. Rien n'est supposé — chaque finding est lié à un fichier:ligne réel.

**Tech Stack:** claude-opus-4-6 (tous les subagents d'audit), Next.js 14 + FastAPI + Supabase + Stripe + Groq

**Spec :** `docs/superpowers/specs/2026-03-18-audit-commercial-complet-design.md`

---

## Structure des outputs

```
docs/audit/
├── MAP.md                          # Output Phase 0 — cartographie totale
├── AUDIT_COMMERCIAL_COMPLET.md    # Output Phase 2 — rapport final consolidé
└── subagents/
    ├── 01-business-logic.md
    ├── 02-ui-ux.md
    ├── 03-i18n.md
    ├── 04-security.md
    ├── 05-database.md
    ├── 06-api-integrations.md
    ├── 07-performance-seo.md
    ├── 08-accessibility.md
    ├── 09-code-quality.md
    └── 10-missing-features.md
```

---

## PHASE 0 — Cartographie totale

### Task 1 : Subagent cartographie

**Files:**
- Create: `docs/audit/MAP.md`

- [ ] **Step 1 : Lancer le subagent cartographie (Opus)**

```bash
claude --model claude-opus-4-6 --print "
Tu es un expert en audit de codebase. Explore TOUT le projet HuntZen situé dans le répertoire courant.
Lis chaque dossier et fichier important. Ne suppose rien — vérifie tout dans le code réel.

Produis un fichier MAP.md structuré avec EXACTEMENT ces 7 sections :

# MAP — HuntZen Codebase
Date : $(date +%Y-%m-%d)

## 1. Pages Frontend (App Router)
Pour chaque page dans frontend-next/src/app/ :
| Chemin | Route URL | Type (SSR/SSG/CSR) | Auth requise | Metadata définie |
|--------|-----------|-------------------|--------------|-----------------|

## 2. Composants UI par catégorie
Pour chaque dossier dans frontend-next/src/components/ :
Liste les composants avec leur chemin exact.

## 3. Endpoints Backend
Pour chaque route dans backend/src/api/routes/ :
| Méthode | Chemin | Auth | Rate limit | Fichier:ligne |
|---------|--------|------|-----------|---------------|

## 4. Tables Supabase
Pour chaque migration dans supabase/migrations/ :
| Table | Colonnes clés | RLS activée | Index présents |
|-------|--------------|-------------|----------------|

## 5. Variables d'environnement
Lis backend/src/config/settings.py et frontend-next/.env.example :
| Variable | Service | Obligatoire | Valeur par défaut |
|----------|---------|-------------|------------------|

## 6. Intégrations tierces
| Service | Usage dans le code | Variable d'env | Feature flag |
|---------|-------------------|----------------|--------------|

## 7. Fichiers de traduction
Lis frontend-next/messages/fr.json et en.json :
- Nombre de clés en FR : X
- Nombre de clés en EN : X
- Clés présentes en FR manquantes en EN : [liste]
- Clés présentes en EN manquantes en FR : [liste]

Sauvegarde le résultat dans docs/audit/MAP.md
" > docs/audit/MAP.md
```

- [ ] **Step 2 : Vérifier que MAP.md est complet**

```bash
wc -l docs/audit/MAP.md
# Attendu : > 100 lignes (carte complète)
cat docs/audit/MAP.md | head -50
```

- [ ] **Step 3 : Présenter MAP.md à Wissem pour validation**

Afficher le contenu de docs/audit/MAP.md et demander :
> "La cartographie est complète. Tu veux ajouter ou corriger quelque chose avant de lancer les 10 subagents d'audit ?"

**⛔ GATE : Attendre la validation de Wissem avant de continuer.**

---

## PHASE 1 — 10 Subagents d'audit en parallèle

> Lancer tous les subagents en parallèle via superpowers:dispatching-parallel-agents.
> Chaque subagent lit les fichiers réels. Modèle : claude-opus-4-6.
> Chaque subagent produit son rapport dans docs/audit/subagents/[nom].md.

### Task 2 : Subagent 1 — Business Logic

**Files:**
- Read: `backend/src/api/routes/auth.py`, `stripe.py`, `subscription.py`, `cv_analysis.py`, `jobs.py`, `coach.py`
- Read: `frontend-next/src/contexts/auth-context.tsx`, `subscription-context.tsx`
- Read: `frontend-next/src/hooks/use-subscription-api.ts`
- Create: `docs/audit/subagents/01-business-logic.md`

- [ ] **Step 1 : Lancer le subagent business-logic (Opus)**

Prompt exact pour ce subagent :

```
Tu es un auditeur expert en logique métier SaaS.
Modèle : claude-opus-4-6.
Répertoire de travail : [racine du projet HuntZen]

MISSION : Auditer TOUTE la logique métier de HuntZen. Lis les fichiers réels. Ne suppose RIEN.

PÉRIMÈTRE — CORRECTION FONCTIONNELLE (est-ce que les flows font ce qu'ils sont censés faire ?)

--- AUTHENTIFICATION ---
Lis middleware.ts, contexts/auth-context.tsx, routes/auth.py

Vérifie :
1. Signup email/password : flux complet ? email de confirmation envoyé ?
2. Signup OAuth Google : configuré ? flux complet ?
3. Login : session créée correctement ? cookie sécurisé ?
4. Logout : state frontend nettoyé ? session Supabase invalidée ?
5. Token refresh : géré automatiquement ?
6. Session expirée : redirect vers /login correct ?
7. Reset password : flux complet implémenté ?
8. Routes protégées : middleware en place sur toutes les pages dashboard ?
9. Pages publiques correctement définies (pas de redirect en boucle) ?

--- PLANS ET LIMITES ---
Lis routes/subscription.py, contexts/subscription-context.tsx, services/stripe.py

Vérifie :
1. Plan Free : quelles limites EXACTES dans le code ? (lignes de code précises)
2. Plan Pro : quelles features EXACTEMENT débloquées ?
3. Les limites sont-elles vérifiées côté BACKEND (pas seulement frontend) ?
4. Un user peut-il bypass les limites via l'API directement ?
5. Le quota est-il décrémenté correctement après usage ?
6. Reset mensuel des quotas : implémenté comment et où ?

--- FLUX CV ANALYSIS ---
Lis routes/cv_analysis.py, workers/, services/

Vérifie :
1. Upload : formats acceptés, taille max, validation server-side ?
2. Processing : synchrone ou async ? via Modal Labs ?
3. Frontend notifié quand terminé : polling ou webhook ?
4. Résultat : structure exacte retournée ?
5. Erreur processing : gérée et affichée à l'utilisateur ?
6. Limite plan vérifiée AVANT upload ?

--- FLUX STRIPE COMPLET ---
Lis routes/stripe.py, services/stripe.py

Vérifie (chaque webhook event) :
1. checkout.session.completed → sync Supabase user_subscriptions ?
2. customer.subscription.updated → plan mis à jour ?
3. customer.subscription.deleted → accès retiré ?
4. invoice.payment_failed → user notifié ?
5. Signature webhook vérifiée avec construct_event ?
6. Idempotence via stripe_webhook_events table ?
7. Upgrade plan : proration correcte ?
8. Annulation : cancel_at_period_end ou immédiat ?
9. Accès retiré EXACTEMENT quand ?

FORMAT DU RAPPORT (docs/audit/subagents/01-business-logic.md) :
# Audit — Business Logic
Score : X/100

## 🔴 BLOQUANTS
### [Titre]
- Fichier : path/to/file.py:ligne
- Problème : description précise
- Impact client : ce que voit le user
- Fix : solution exacte

## 🟠 IMPORTANTS
[même format]

## 🟡 AMÉLIORATIONS
[même format]

## ✅ CE QUI FONCTIONNE
[liste]

Sauvegarde dans docs/audit/subagents/01-business-logic.md
```

- [ ] **Step 2 : Vérifier que le rapport existe et est non-vide**

```bash
wc -l docs/audit/subagents/01-business-logic.md
# Attendu : > 50 lignes
```

---

### Task 3 : Subagent 2 — UI/UX

**Files:**
- Read: `frontend-next/src/app/` (toutes les pages)
- Read: `frontend-next/src/components/` (tous les composants)
- Create: `docs/audit/subagents/02-ui-ux.md`

- [ ] **Step 1 : Lancer le subagent ui-ux (Opus)**

Prompt exact :

```
Tu es un auditeur expert en UI/UX pour SaaS.
Modèle : claude-opus-4-6.

MISSION : Auditer TOUTE l'interface utilisateur de HuntZen.
Lis chaque fichier de page et composant. Ne suppose RIEN.

PÉRIMÈTRE :

--- PAGES (app router) ---
Pour CHAQUE page dans frontend-next/src/app/ :
1. Title/metadata défini ?
2. État loading présent (skeleton ou spinner) ?
3. État error présent (message + bouton retry) ?
4. État empty présent (message + CTA, pas juste "Aucun résultat") ?
5. État success feedback (toast, animation) ?
6. Formulaires : validation temps réel + messages d'erreur clairs ?
7. Boutons disabled pendant loading ?
8. Responsive mobile 320px (pas de scroll horizontal) ?
9. Touch targets ≥ 44px sur mobile ?

--- NAVIGATION ---
1. Menu principal : tous les liens actifs ?
2. Menu mobile : hamburger fonctionnel, tous les liens présents ?
3. Liens href="#" ou href vide présents ? (mort links)
4. Redirects après action (login → dashboard, paiement → confirmation) ?

--- MOBILE & iOS ---
1. Viewport meta correct ?
2. Comportements iOS Safari spécifiques (input zoom, bottom bar, etc.) ?
3. Sticky elements sur mobile (nav, CTA) ?

--- MODAUX ---
1. Fermeture Escape/clic extérieur ?
2. Focus trapped dans le modal ?
3. Scroll lock sur le body ?

--- DASHBOARD ---
1. Données réelles affichées ou données mockées ?
2. Widgets : tous fonctionnels ?

--- PRICING PAGE ---
1. Plans affichés correctement ?
2. Plan actuel de l'utilisateur mis en évidence ?
3. CTA mène bien au checkout Stripe ?

FORMAT identique au subagent 1 — Score /100 + 🔴/🟠/🟡/✅
Sauvegarde dans docs/audit/subagents/02-ui-ux.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/02-ui-ux.md
```

---

### Task 4 : Subagent 3 — i18n

**Files:**
- Read: `frontend-next/messages/fr.json`, `en.json`, `es.json`, `pt.json`
- Read: tous les fichiers `.tsx` dans `frontend-next/src/`
- Create: `docs/audit/subagents/03-i18n.md`

- [ ] **Step 1 : Lancer le subagent i18n (Opus)**

Prompt exact :

```
Tu es un expert en internationalisation React/Next.js.
Modèle : claude-opus-4-6.

MISSION : Scanner CHAQUE fichier .tsx du projet et trouver TOUS les textes hardcodés.
Lis les fichiers messages/fr.json et messages/en.json pour comparer.

SCAN EXHAUSTIF — cherche dans CHAQUE fichier frontend-next/src/ :
1. Texte entre balises : <p>texte</p>, <h1>titre</h1>, <span>label</span>
2. Attributs : placeholder="...", title="...", alt="...", aria-label="..."
3. Props : label="...", message="...", description="...", tooltip="..."
4. Toasts : toast("..."), toast.success("..."), toast.error("...")
5. Messages d'erreur UI visibles
6. Métadonnées : title, description, og:title
7. Template literals avec texte : `Bonjour ${name}`
8. Constantes textuelles : const LABEL = "Mon texte"

Pour chaque string hardcodé trouvé, note :
- Fichier:ligne
- Le texte exact
- Clé i18n suggérée (ex: "jobs.search.placeholder")

ANALYSE fr.json vs en.json :
1. Nombre total de clés en FR
2. Nombre total de clés en EN
3. Liste des clés FR manquantes en EN
4. Liste des clés EN manquantes en FR
5. Valeurs identiques (FR = EN, probablement non traduit)

COHÉRENCE WORDING :
1. "HuntZen" orthographié pareil partout ?
2. Tutoiement/vouvoiement cohérent ?
3. Noms des plans cohérents (Free/Gratuit/Freemium — lequel ?)
4. "CV" vs "resume" — cohérent ?

FORMAT :
# Audit — i18n
Score : X/100

## Strings hardcodés trouvés (N total)
| Fichier:ligne | Texte | Clé i18n suggérée |
|---------------|-------|-------------------|
...

## Clés manquantes
...

## Incohérences wording
...

## ✅ Ce qui est bien i18n-isé
...

Sauvegarde dans docs/audit/subagents/03-i18n.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/03-i18n.md
```

---

### Task 5 : Subagent 4 — Sécurité

**Files:**
- Read: `backend/src/api/routes/` (tous les fichiers)
- Read: `backend/src/api/middleware.py`
- Read: `supabase/migrations/` (RLS policies)
- Read: `frontend-next/src/middleware.ts`
- Create: `docs/audit/subagents/04-security.md`

- [ ] **Step 1 : Lancer le subagent security (Opus)**

Prompt exact :

```
Tu es un expert en sécurité web et SaaS.
Modèle : claude-opus-4-6.
FOCUS : ACCÈS et DONNÉES (pas l'implémentation technique — c'est le subagent api-integrations).

MISSION : Identifier toutes les failles de sécurité dans HuntZen.

--- AUTH GUARDS ---
Pour CHAQUE endpoint dans backend/src/api/routes/ :
1. A-t-il un Depends(get_current_user) ou équivalent ?
2. Les routes admin ont-elles une vérification is_admin séparée ?
3. Les JWT sont-ils vérifiés avec la bonne clé Supabase ?

--- RLS SUPABASE ---
Lis TOUTES les migrations supabase/migrations/*.sql :
1. Quelles tables ont RLS activée (ENABLE ROW LEVEL SECURITY) ?
2. Quelles tables N'ont PAS RLS activée ?
3. Les policies SELECT permettent-elles à un user de voir les données d'un autre ?
4. Les policies INSERT/UPDATE/DELETE sont-elles correctes ?
5. Les policies admin sont-elles trop permissives ?

--- VALIDATION DES INPUTS ---
1. Tous les endpoints valident-ils avec Pydantic ?
2. Upload fichier : type MIME vérifié server-side ?
3. Upload fichier : taille max vérifiée server-side ?
4. Requêtes SQL raw sans paramétrage (injection SQL possible) ?
5. Path traversal possible sur le storage Supabase ?

--- SECRETS ET DONNÉES SENSIBLES ---
1. Clés API hardcodées dans le code source ?
2. Fichiers .env commités par erreur dans git ?
3. Données sensibles dans les logs (console.log avec tokens, emails) ?
4. Données sensibles exposées dans les réponses API (tokens, clés internes) ?

--- STRIPE ---
1. Signature webhook vérifiée avec stripe.construct_event ?
2. Montants jamais calculés côté client ?
3. Price IDs vérifiés côté serveur avant création session ?

--- CORS ET HEADERS ---
1. CORS configuré avec origins spécifiques (pas de * en prod) ?
2. Rate limiting sur les endpoints publics (SlowAPI) ?
3. Headers de sécurité présents (CSP, HSTS, X-Frame-Options) ?

--- STORAGE ---
1. Signed URLs utilisées pour les CVs privés ?
2. Durée d'expiration des signed URLs correcte ?
3. Bucket CVs configuré en private (pas public) ?

FORMAT identique — Score /100 + 🔴/🟠/🟡/✅
IMPORTANT : score 🔴 si un user peut accéder aux données d'un autre.
Sauvegarde dans docs/audit/subagents/04-security.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/04-security.md
```

---

### Task 6 : Subagent 5 — Database

**Files:**
- Read: `supabase/migrations/` (tous les fichiers SQL)
- Read: `backend/src/models/` (modèles Pydantic)
- Create: `docs/audit/subagents/05-database.md`

- [ ] **Step 1 : Lancer le subagent database (Opus)**

Prompt exact :

```
Tu es un expert PostgreSQL et Supabase.
Modèle : claude-opus-4-6.

MISSION : Auditer le schéma complet de la base de données HuntZen.
Lis TOUTES les migrations dans supabase/migrations/ dans l'ordre chronologique.

--- SCHÉMA COMPLET ---
Pour chaque table identifiée dans les migrations :
1. Nom de la table et ses colonnes avec types
2. Contraintes NOT NULL manquantes (colonnes qui devraient être NOT NULL)
3. Valeurs par défaut manquantes
4. Clés étrangères : ON DELETE correct (CASCADE vs SET NULL vs RESTRICT) ?
5. Index présents vs index manquants (pour les colonnes filtrées souvent)

--- TABLES CRITIQUES ---
Vérifie spécifiquement :
- user_subscriptions : liée correctement à Stripe (stripe_customer_id, stripe_subscription_id) ?
- usage_quotas : tracking par user ET par période ?
- cv_analyses : status, résultats, timestamps, user_id ?
- user_notifications : realtime activé ?
- referral_config : tiers JSONB bien structuré ?

--- MIGRATIONS ---
1. Les migrations sont-elles ordonnées correctement (timestamps) ?
2. Y a-t-il des migrations conflictuelles ou qui s'annulent mutuellement ?
3. Les migrations sont-elles idempotentes (IF NOT EXISTS, etc.) ?
4. Y a-t-il des migrations qui modifient des données sans backup ?

--- PERFORMANCES DB ---
1. Colonnes user_id indexées sur toutes les tables ?
2. Jointures fréquentes sans index sur la colonne jointe ?
3. Colonnes de filtre fréquent (status, plan_name, created_at) sans index ?
4. Tables sans clause de nettoyage (accumulation infinie possible) ?

--- RLS ---
1. Liste complète : tables AVEC RLS vs tables SANS RLS
2. Y a-t-il des tables sensibles sans RLS ?

FORMAT identique — Score /100 + 🔴/🟠/🟡/✅
Sauvegarde dans docs/audit/subagents/05-database.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/05-database.md
```

---

### Task 7 : Subagent 6 — API & Intégrations

**Files:**
- Read: `backend/src/api/routes/` (tous les fichiers)
- Read: `backend/src/services/` (tous les services)
- Read: `backend/src/workers/` (ARQ workers)
- Create: `docs/audit/subagents/06-api-integrations.md`

- [ ] **Step 1 : Lancer le subagent api-integrations (Opus)**

Prompt exact :

```
Tu es un expert en API REST et intégrations tierces.
Modèle : claude-opus-4-6.
FOCUS : IMPLÉMENTATION TECHNIQUE (error handling, idempotence, timeouts).
Ne pas re-auditer la logique fonctionnelle (déjà couverte par business-logic).

MISSION : Auditer la qualité technique des endpoints et intégrations.

--- ENDPOINTS FASTAPI ---
Pour CHAQUE endpoint :
1. Response model Pydantic défini ?
2. Codes HTTP corrects (200/201/400/401/403/404/422/500) ?
3. Gestion des erreurs explicite (try/except avec messages utiles) ?
4. Timeout configuré pour les appels externes ?
5. Logging correct (pas de données sensibles dans les logs) ?

--- MODAL LABS (CV Processing async) ---
1. Callback URL sécurisée (MODAL_CALLBACK_SECRET vérifié) ?
2. Retry en cas d'échec configuré ?
3. Timeout correctement géré ?
4. Résultat sauvegardé en DB même en cas d'erreur partielle ?
5. Frontend notifié quand terminé (polling ou webhook) ?

--- RAPIDAPI / JOB PROVIDERS ---
1. Gestion du rate limit (429 errors) ?
2. Cache Redis pour éviter les appels répétés ?
3. Fallback si une API est indisponible ?
4. France Travail : descriptions tronquées à 500 chars (bug connu) ?

--- ARQ WORKERS ---
1. Tasks définies et enregistrées correctement ?
2. Gestion des erreurs dans les workers ?
3. Retry policy configurée ?
4. Résultats persistés en DB ?

--- EMAILS (Resend) ---
1. Email confirmation inscription envoyé ?
2. Email confirmation paiement envoyé ?
3. Email annulation abonnement envoyé ?
4. Email quota limite atteinte envoyé ?
5. Templates email existent en FR et EN ?

--- SENTRY ---
1. Sentry SDK initialisé côté frontend (next.config.js ou _app) ?
2. Sentry SDK initialisé côté backend ?
3. User context attaché aux erreurs (user_id, email) ?
4. Source maps uploadés pour le frontend ?
5. Alert rules configurées (error rate, new issues) ?

FORMAT identique — Score /100 + 🔴/🟠/🟡/✅
Sauvegarde dans docs/audit/subagents/06-api-integrations.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/06-api-integrations.md
```

---

### Task 8 : Subagent 7 — Performance & SEO

**Files:**
- Read: `frontend-next/src/app/` (layout, pages, metadata)
- Read: `frontend-next/next.config.js`
- Read: `frontend-next/src/app/sitemap.ts`
- Read: `frontend-next/src/app/robots.ts`
- Create: `docs/audit/subagents/07-performance-seo.md`

- [ ] **Step 1 : Lancer le subagent performance-seo (Opus)**

Prompt exact :

```
Tu es un expert Next.js performance et SEO technique.
Modèle : claude-opus-4-6.

MISSION : Auditer les performances et le SEO de HuntZen.

--- METADATA SEO ---
Pour CHAQUE page dans frontend-next/src/app/ :
1. export const metadata ou generateMetadata défini ?
2. title unique et descriptif (pas juste "HuntZen") ?
3. description unique (pas la même sur toutes les pages) ?
4. Open Graph (og:title, og:description, og:image) ?
5. Canonical URL définie ?

--- SEO TECHNIQUE ---
1. sitemap.ts : toutes les pages publiques incluses ? pages dynamiques (jobs) ?
2. robots.ts : routes admin et API excluses ?
3. hreflang FR/EN défini (next-intl config) ?
4. Pages emploi en SSR ou SSG (crawlable par Google) ?
5. URLs descriptives (slug) ou IDs numériques ?
6. Structured data JSON-LD sur les offres d'emploi ?

--- IMAGES ---
1. next/image utilisé partout (pas de <img> natif) ?
2. Images avec width/height définis (pas de CLS) ?
3. Images above-the-fold avec priority={true} ?
4. Alt text présent sur toutes les images ?

--- FONTS ---
1. next/font utilisé (pas de Google Fonts via <link>) ?
2. Font display: swap ou similaire ?

--- BUNDLE ---
1. Imports de librairies entières au lieu de named imports ?
   (ex: import _ from 'lodash' au lieu de import { debounce } from 'lodash')
2. Composants lourds sans dynamic import + loading fallback ?
3. next.config.js : optimisations activées ?

--- RENDERING ---
1. Pages statiques marquées correctement (generateStaticParams) ?
2. Server Components utilisés par défaut (pas de 'use client' inutile) ?
3. Loading.tsx présent pour les pages dashboard ?
4. Error.tsx présent pour les pages dashboard ?

FORMAT identique — Score /100 + 🔴/🟠/🟡/✅
Sauvegarde dans docs/audit/subagents/07-performance-seo.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/07-performance-seo.md
```

---

### Task 9 : Subagent 8 — Accessibilité

**Files:**
- Read: tous les composants `.tsx` dans `frontend-next/src/components/`
- Read: `frontend-next/tailwind.config.ts` (couleurs/contraste)
- Create: `docs/audit/subagents/08-accessibility.md`

- [ ] **Step 1 : Lancer le subagent accessibility (Opus)**

Prompt exact :

```
Tu es un expert accessibilité web WCAG 2.1 AA.
Modèle : claude-opus-4-6.

MISSION : Auditer l'accessibilité de HuntZen.

--- CONTRASTE ---
Lis tailwind.config.ts pour identifier les couleurs utilisées.
1. Couleurs de texte primaire sur fond blanc/dark : ratio ≥ 4.5:1 ?
2. Boutons CTA : texte sur fond coloré : ratio ≥ 4.5:1 ?
3. Texte placeholder : ratio ≥ 3:1 ?
4. Liens : distinguables sans couleur seule ?

--- NAVIGATION CLAVIER ---
1. Tous les éléments interactifs ont-ils tabIndex correct ?
2. Focus visible sur buttons, inputs, links (pas de outline: none sans alternative) ?
3. Modaux : focus trapped et retour au trigger à la fermeture ?
4. Dropdowns : navigables avec flèches clavier ?

--- ARIA ET SÉMANTIQUE ---
1. Icônes seules (sans texte) : aria-label ou aria-hidden={true} ?
2. Images décoratives : aria-hidden={true} ?
3. Formulaires : <label> lié à chaque <input> (htmlFor/id) ?
4. Champs requis : aria-required="true" ?
5. Messages d'erreur : aria-describedby lié au champ ?
6. Boutons de chargement : aria-busy="true" pendant loading ?
7. Régions live : aria-live pour les mises à jour dynamiques ?
8. Structure de titres : h1 → h2 → h3 sans sauts ?

--- FORMULAIRES ---
1. Tous les inputs ont-ils un label visible ou aria-label ?
2. Erreurs de validation : annoncées au screen reader ?
3. Submit : feedback accessible après soumission ?

FORMAT identique — Score /100 + 🔴/🟠/🟡/✅
Note : les problèmes d'accessibilité sont 🟡 sauf s'ils bloquent complètement l'usage.
Sauvegarde dans docs/audit/subagents/08-accessibility.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/08-accessibility.md
```

---

### Task 10 : Subagent 9 — Code Quality

**Files:**
- Read: tout le codebase frontend + backend
- Create: `docs/audit/subagents/09-code-quality.md`

- [ ] **Step 1 : Lancer le subagent code-quality (Opus)**

Prompt exact :

```
Tu es un expert qualité de code TypeScript et Python.
Modèle : claude-opus-4-6.

MISSION : Identifier la dette technique dans HuntZen.

--- FRONTEND (TypeScript/TSX) ---
Cherche dans frontend-next/src/ :
1. `any` TypeScript : fichier:ligne (liste exhaustive)
2. `console.log` oubliés : fichier:ligne (liste exhaustive)
3. TODO et FIXME : fichier:ligne (liste exhaustive)
4. Code commenté (blocs de code en commentaire)
5. Imports inutilisés (variables importées non utilisées)
6. Fichiers > 300 lignes : liste avec taille
7. Fonctions > 50 lignes : liste avec localisation
8. Props drilling > 3 niveaux : composants concernés
9. Magic strings/numbers non nommés
10. `as unknown as X` (double cast suspect)

--- BACKEND (Python) ---
Cherche dans backend/src/ :
1. `print()` statements oubliés : fichier:ligne
2. TODO et FIXME : fichier:ligne
3. Type hints manquants sur fonctions publiques
4. Fonctions > 50 lignes
5. Variables non utilisées
6. `except Exception` trop large (sans re-raise ni logging)

--- DÉPENDANCES ---
1. Lis frontend-next/package.json : packages installés non utilisés ?
2. Lis backend/requirements.txt : packages installés non importés ?
3. Packages avec vulnérabilités connues (npm audit / pip-audit) ?
4. Packages très outdated (version majeure derrière) ?

--- SENTRY MONITORING ---
1. Sentry correctement initialisé dans frontend-next/sentry.*.config.ts ?
2. User context attaché (Sentry.setUser) après login ?
3. Erreurs personnalisées capturées (Sentry.captureException) aux points clés ?
4. Performance monitoring activé ?

FORMAT identique — Score /100 + 🔴/🟠/🟡/✅
Les console.log en prod sont 🟠. Les any TypeScript sont 🟡 sauf si dans du code de sécurité.
Sauvegarde dans docs/audit/subagents/09-code-quality.md
```

- [ ] **Step 2 : Vérifier rapport**
```bash
wc -l docs/audit/subagents/09-code-quality.md
```

---

### Task 11 : Subagent 10 — Features manquantes

**Files:**
- Read: `CLAUDE.md`, `frontend-next/CLAUDE.md`, `backend/CLAUDE.md`
- Read: `docs/superpowers/plans/2026-03-17-huntzen-master-plan.md`
- Read: `frontend-next/src/app/` (pages existantes)
- Read: `frontend-next/src/app/terms/`, `privacy/`, `faq/`
- Create: `docs/audit/subagents/10-missing-features.md`

- [ ] **Step 1 : Lancer le subagent missing-features (Opus)**

Prompt exact :

```
Tu es un Product Manager senior pour un SaaS B2C en France.
Modèle : claude-opus-4-6.

MISSION : Identifier ce qui MANQUE dans HuntZen pour un lancement commercial en France.

--- LÉGAL ET CONFORMITÉ (OBLIGATOIRE EN FRANCE) ---
Vérifie l'existence et le contenu de :
1. frontend-next/src/app/terms/ — CGU : existe ? complètes ?
2. frontend-next/src/app/privacy/ — Politique RGPD : existe ? complète ?
3. Mentions légales (éditeur, hébergeur, SIRET) : page dédiée ?
4. Bannière cookies RGPD avec consentement granulaire : implémentée ?
5. Droit à l'oubli / suppression de compte : implémenté ?
6. Export des données personnelles (RGPD art. 20) : implémenté ?

--- STRIPE CUSTOMER PORTAL ---
1. Lien vers le customer portal Stripe dans les settings utilisateur ?
2. L'utilisateur peut-il gérer son abonnement sans contacter le support ?

--- ONBOARDING ---
1. Tour produit au premier login ?
2. Email de bienvenue avec guide de démarrage ?
3. Page "getting started" ou checklist d'onboarding ?

--- SUPPORT ---
1. Page FAQ : existe ? couvre les questions fréquentes ?
2. Moyen de contact (email, chat) clairement visible ?
3. Système de support tickets : implémenté (vu dans migrations) ?

--- FEATURES BACKEND SANS UI ---
D'après CLAUDE.md, ces features existent en backend mais manquent d'UI :
- POST /adapt/generate-cover-letter (LM generator)
- POST /adapt (CV adapté pour une offre)
- Simulateur entretien (ENABLE_INTERVIEW_SIMULATOR=false)
- Hunter.io / Apollo.io (recruiter finder)
Pour chaque feature : valeur commerciale ? effort d'intégration estimé ?

FORMAT identique — Score /100 + 🔴/🟠/🟡/✅
🔴 = bloquant légal (CGU, RGPD, mentions légales)
🟠 = bloquant commercial (customer portal, support)
🟡 = nice to have (onboarding avancé, features cachées)
Sauvegarde dans docs/audit/subagents/10-missing-features.md
```

- [ ] **Step 2 : Vérifier tous les rapports subagents**
```bash
ls -la docs/audit/subagents/
# Attendu : 10 fichiers .md
wc -l docs/audit/subagents/*.md
```

---

## PHASE 2 — Consolidation

### Task 12 : Rapport final consolidé

**Files:**
- Read: `docs/audit/subagents/*.md` (10 fichiers)
- Create: `docs/audit/AUDIT_COMMERCIAL_COMPLET.md`

- [ ] **Step 1 : Lancer le subagent consolidation (Opus)**

Prompt exact :

```
Tu es un auditeur senior SaaS.
Modèle : claude-opus-4-6.

MISSION : Synthétiser les 10 rapports d'audit partiels en un rapport final exhaustif.

Lis TOUS ces fichiers :
- docs/audit/subagents/01-business-logic.md
- docs/audit/subagents/02-ui-ux.md
- docs/audit/subagents/03-i18n.md
- docs/audit/subagents/04-security.md
- docs/audit/subagents/05-database.md
- docs/audit/subagents/06-api-integrations.md
- docs/audit/subagents/07-performance-seo.md
- docs/audit/subagents/08-accessibility.md
- docs/audit/subagents/09-code-quality.md
- docs/audit/subagents/10-missing-features.md

Produis le rapport final selon ce format EXACT :

---
# AUDIT COMMERCIAL COMPLET — HuntZen
Date : $(date +%Y-%m-%d)
Auditeur : Claude Opus 4.6

## SCORES PAR DIMENSION (pondérés pour le lancement)

| Dimension | Score | Poids | Score pondéré | Statut |
|-----------|-------|-------|---------------|--------|
| Sécurité | X/100 | 20% | X.X | 🔴/🟠/🟡/🟢 |
| Logique métier | X/100 | 20% | X.X | |
| API & Intégrations | X/100 | 15% | X.X | |
| Interface utilisateur | X/100 | 15% | X.X | |
| Internationalisation | X/100 | 10% | X.X | |
| Base de données | X/100 | 10% | X.X | |
| Performance & SEO | X/100 | 5% | X.X | |
| Accessibilité | X/100 | 2% | X.X | |
| Qualité du code | X/100 | 2% | X.X | |
| Features produit | X/100 | 1% | X.X | |

**SCORE GLOBAL PONDÉRÉ : XX/100**
**PRÊT POUR LANCEMENT COMMERCIAL : OUI / NON / PARTIELLEMENT**

---

## 🔴 BLOQUANTS — À corriger AVANT tout lancement (N problèmes)
### 1. [Titre précis]
- **Dimension :** [sécurité / logique métier / etc.]
- **Fichier :** `path/to/file.ext:ligne`
- **Problème :** description précise de ce qui ne va pas
- **Impact client :** ce que voit ou vit un vrai client
- **Fix exact :** solution précise à implémenter

[répéter pour chaque bloquant]

---

## 🟠 IMPORTANTS — À corriger dans la semaine (N problèmes)
[même format]

---

## 🟡 AMÉLIORATIONS — V2 (N problèmes)
[même format]

---

## ✅ CE QUI FONCTIONNE BIEN
[liste complète des points positifs]

---

## 📋 PLAN D'ACTION — 7 JOURS

### Jour 1-2 : Sprint Sécurité + Auth + Stripe (objectif : 0 🔴)
- [ ] [tâche concrète avec fichier]
- [ ] ...

### Jour 3-4 : Sprint UI + i18n
- [ ] ...

### Jour 5-6 : Sprint SEO + Performance + Qualité
- [ ] ...

### Jour 7 : Buffer + validation finale
- [ ] Tests E2E du parcours complet
- [ ] Vérification score final
- [ ] Go/No-go lancement

---

## 📊 ANNEXES

### A. Strings hardcodés exhaustifs
[reprendre la liste complète du subagent i18n]

### B. Failles sécurité exhaustives
[reprendre la liste complète du subagent security]

### C. Dette technique exhaustive
[reprendre la liste complète du subagent code-quality]

---

Sauvegarde dans docs/audit/AUDIT_COMMERCIAL_COMPLET.md
```

- [ ] **Step 2 : Vérifier le rapport final**
```bash
wc -l docs/audit/AUDIT_COMMERCIAL_COMPLET.md
# Attendu : > 200 lignes
```

- [ ] **Step 3 : Présenter le rapport à Wissem**

Afficher le score global et les 🔴 bloquants.

**⛔ GATE : Attendre la validation de Wissem avant de lancer les corrections.**

---

## PHASE 3 — Corrections

> Cette phase est planifiée APRÈS validation du rapport par Wissem.
> Le plan détaillé des corrections sera créé à partir des findings réels.

### Task 13 : Sprint 1 — Sécurité + Auth + Stripe

- [ ] **Step 1 : Lister tous les 🔴 des dimensions sécurité, logique métier, API**
```bash
grep -A 10 "🔴" docs/audit/AUDIT_COMMERCIAL_COMPLET.md | head -100
```

- [ ] **Step 2 : Créer un plan de correction dédié**
```bash
# Créer docs/superpowers/plans/2026-03-XX-corrections-sprint1.md
# avec /superpowers:write-plan sur les findings réels
```

- [ ] **Step 3 : Exécuter via superpowers:execute-plan**

### Task 14 : Sprint 2 — UI + i18n

- [ ] **Step 1 : GSD pour strings hardcodés (sans risque)**

Pour chaque string hardcodé listé dans l'annexe A :
```bash
# Déplacer dans messages/fr.json et messages/en.json
# Remplacer dans le composant par useTranslations()
```

- [ ] **Step 2 : Corrections UI complexes via superpowers:execute-plan**

### Task 15 : Sprint 3 — SEO + Performance + Qualité

- [ ] **Step 1 : GSD pour console.log et imports inutilisés**
- [ ] **Step 2 : Metadata manquantes via superpowers:execute-plan**

### Task 16 : Validation finale

- [ ] **Step 1 : Relancer tous les subagents d'audit modifiés**
- [ ] **Step 2 : Vérifier score ≥ 85/100**
- [ ] **Step 3 : Tests E2E parcours complet**
```bash
npm run test:e2e
```
- [ ] **Step 4 : Go/No-go lancement**

---

## Commandes de référence

```bash
# Vérifier backend déployé
curl https://huntzenjobs-production.up.railway.app/api/auth/test-debug

# Type check frontend
cd frontend-next && npx tsc --noEmit

# Lint backend
ruff check . --ignore E501

# Tests backend
cd tests && python -m pytest -v --tb=short

# Tests frontend
cd frontend-next && vitest run

# Tests E2E
npm run test:e2e
```

---

## Contraintes obligatoires

- Modèle Opus (`claude-opus-4-6`) pour TOUS les subagents d'audit
- Jamais committer les docs/plans/ (CLAUDE.md rule)
- Pas de Co-Authored-By dans les commits
- Toujours sur branche Production
- Chaque finding doit avoir un fichier:ligne réel
- Corriger les erreurs TypeScript/ruff AVANT de passer à l'étape suivante
