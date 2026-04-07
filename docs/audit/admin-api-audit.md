# Audit API Admin Production - HuntZen

**Date** : 2026-03-23
**Cible** : `https://huntzenjobs-production.up.railway.app`
**Auth** : Token admin via Supabase magic link (admin@huntzenjobs.com)
**Total endpoints testes** : 43

---

## Resume executif

- **40 endpoints OK (200)** sur 43 testes
- **1 endpoint 404** : `/api/admin/logs/webhook-failures` (mauvais path, le bon est `/api/admin/logs/webhooks`)
- **1 incoherence data** : `paying_users` = 3 dans `/stats` vs `total_paying_users` = 1 dans `/analytics/revenue`
- **1 incoherence data** : `mrr-trend` retourne 0.0 pour tous les jours alors que MRR = 19.9
- **0 erreur 500** sur les endpoints testes

---

## 1. User Management

### GET /api/admin/users

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | 25 users (page 1/2), total = 39 |
| Pagination | Fonctionne (page=2 retourne 14 users restants) |

**Champs retournes par user** :
- `id`, `email`, `full_name`, `status`, `is_admin`, `created_at`
- `suspended_at`, `suspended_reason`
- `plan` (avec `subscription_plans.name`, `display_name`, `price_monthly`)
- `usage_30d` (cv_analyses, assistant_messages, job_searches, job_views)
- `total_paid`

**Observations** :
- Les users sans subscription dans `user_subscriptions` retournent `plan: null`, `usage_30d: {}`, `total_paid: 0` -- c'est correct
- 2 users avec plan actif : free (test-debug-create) et premium (test-premium)
- La plupart des users reels n'ont pas de `plan` car pas d'entree dans `user_subscriptions` -- ils sont sur le plan free par defaut cote frontend mais n'ont pas de ligne en DB
- `total_paid` = 19.9 pour test-premium, 0 pour tous les autres

**Verdict** : OK - Donnees coherentes

---

### GET /api/admin/users/{user_id}

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| User teste | `183bbd1b` (test-premium@huntzenjobs.com) |

**Donnees retournees** :
- `profile` : complet avec tous les champs (y compris `onboarding_data` JSON)
- `subscription` : plan premium, status active, `stripe_subscription_id: "admin_granted"`
- `subscription_history` : 3 entrees (creation free, annulation free, creation premium)
- `usage_30d` : 1 entree avec details quotidiens (job_views: 9, reste a 0)
- `security_events` : 2 events (2 logins success)
- `last_login_at` : null (champ dans profiles, non mis a jour -- utiliser security_events)
- `stripe_customer_id` : null (car admin_granted, pas Stripe reel)
- `total_paid` : 0.0 (correct car pas de paiement Stripe reel)

**Observations** :
- Le champ `total_paid` dans la vue detail = 0.0, mais dans la liste users = 19.9. Incoherence entre les deux endpoints sur la methode de calcul
- `last_login_at` est null malgre des logins enregistres dans security_events

**Verdict** : OK avec reserves (incoherence `total_paid` entre list et detail)

---

## 2. Plans

### GET /api/admin/plans

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Nombre de plans | 4 |

**Plans retournes** :

| Plan | Display Name | Prix/mois | Prix/an | Stripe Prices | sort_order |
|------|-------------|-----------|---------|---------------|------------|
| free | Exploration | 0.00 | 0.00 | 0 prices | 1 |
| starter | Recherche Active | 8.90 | 85.00 | 2 prices (monthly + yearly) | 2 |
| pro | Accelerateur | 13.90 | 133.00 | 2 prices (monthly + yearly) | 3 |
| premium | Carriere | 19.90 | 191.00 | 2 prices (monthly + yearly) | 4 |

**Chaque plan inclut** :
- `limits` : cv_adapt, job_views, saved_jobs, cv_analyses, cover_letter, job_searches, jobs_visible, coach_seconds, assistant_messages, recruiter_searches
- `features` / `features_excluded` : listes de textes
- `feature_flags` : 22 flags booleens
- `translations` : en, es, pt (complets)
- `stripe_prices` : price_ids avec billing_period

**Observations** :
- Les 4 plans sont `is_active: true`
- Les traductions sont completes (en, es, pt) pour tous les plans
- Les features FR contiennent des accents corrects
- Les stripe_price_ids sont presents pour starter, pro, premium (pas pour free, c'est normal)

**Verdict** : OK - Complet et coherent

---

## 3. Coaches

### GET /api/public/coaches

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Nombre de coaches | 5 |

**Coaches retournes** :

| ID | Persona Name | Short Name (FR) | Color |
|----|-------------|----------------|-------|
| nova | Nova | Coach Carriere | #7C3AED |
| maria | Maria | Recherche d'Emploi | #0D9488 |
| sofia | Sofia | Expert CV | #EC4899 |
| lucas | Lucas | Coach Entretien | #EA580C |
| david | David | Personal Branding | #DC2626 |

**Accents FR** : Corrects ("Carriere" dans les descriptions, "competences", "Preparation")
**Note** : Le persona "Jeff" mentionne dans MEMORY.md a ete remplace par "David"

### GET /api/public/coaches?locale=en

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Traduction | Complete pour les 5 coaches |

**Exemples de traduction correcte** :
- "Coach Carriere" -> "Career Coach"
- "Expert CV" -> "CV Expert"
- "Recherche d'Emploi" -> "Job Search"

**Verdict** : OK - 5 coaches, FR avec accents, EN traduit correctement

---

## 4. Stats / Analytics

### GET /api/admin/stats

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |

```json
{
  "total_users": 39,
  "webhook_failures_pending": 0,
  "mrr": 19.9,
  "paying_users": 3,
  "new_users_today": 5,
  "new_users_7d": 13,
  "churn_30d": 1,
  "arpu": 6.63
}
```

**Observation** : `paying_users: 3` mais seulement 1 user (test-premium) a un plan payant actif. Les 2 autres comptent probablement les users avec `total_paid > 0` historiquement.

### GET /api/stats/plan-distribution

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |

```json
{
  "total": 0,
  "distribution": {},
  "pro_percent": 67,
  "error": "data_unavailable"
}
```

**BUG** : Retourne `error: "data_unavailable"` et `total: 0` alors qu'il y a bien des users. Le `pro_percent: 67` semble hardcode ou calcule incorrectement. Cet endpoint utilise probablement un cache memoire qui n'est pas alimente.

### GET /api/admin/analytics/churn

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | `churned: [], total: 0, period_days: 30` |

**Verdict** : OK (pas de churn reel)

### GET /api/admin/analytics/usage

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |

- `active_users: 15` (users avec au moins un quota_date dans les 30j)
- `top_users` : 10 users listes, tous avec 0 usage
- `totals` : cv_analyses=0, coach_seconds=0, job_searches=0

**Observation** : Aucune utilisation reelle enregistree dans les quotas. Les job_views ne sont pas inclus dans les totaux.

### GET /api/admin/analytics/revenue

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |

```json
{
  "mrr": 19.9,
  "arr": 238.8,
  "by_plan": [{"name": "premium", "display_name": "Carriere", "count": 1, "mrr": 19.9}],
  "total_paying_users": 1,
  "total_users": 39
}
```

**INCOHERENCE** : `total_paying_users: 1` ici vs `paying_users: 3` dans `/stats`. La methode de comptage differe entre les deux endpoints.

### GET /api/admin/analytics/subscriptions

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | `breakdown: {free: 2, premium: 1}` |

**Verdict** : OK (3 users avec des entrees dans user_subscriptions)

### GET /api/admin/analytics/usage-heatmap

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | 24 heures avec counts, total=62 events sur 30j |

**Verdict** : OK - Pics d'activite a 14h (8 events), 21-23h (6-7 events)

### GET /api/admin/analytics/growth

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | 30 jours de donnees, cumulative de 17 a 39 |

**Verdict** : OK - Croissance visible, 22 nouveaux users en 30 jours

### GET /api/admin/analytics/mrr-trend

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Periode | 90 jours |

**BUG** : Tous les jours retournent `mrr: 0.0, paying_users: 0`, y compris le 2026-03-23 ou il y a 1 paying user avec MRR 19.9. Le calcul du trend historique ne prend pas en compte les subscriptions admin_granted.

### GET /api/admin/analytics/funnel

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |

```json
{
  "funnel": [
    {"step": 1, "label": "Inscrits", "count": 22, "pct_of_previous": 100.0},
    {"step": 2, "label": "A utilise CV", "count": 0, "pct_of_previous": 0.0},
    {"step": 3, "label": "A utilise Coach", "count": 0, "pct_of_previous": 0},
    {"step": 4, "label": "A souscrit", "count": 3, "pct_of_previous": 0},
    {"step": 5, "label": "A renouvele", "count": 0, "pct_of_previous": 0.0}
  ]
}
```

**Observation** : 22 inscrits sur 30j, 0 ont utilise CV ou Coach, 3 ont souscrit (mais 0% du step precedent -- logique cassee car step 3 = 0). Les % inter-steps sont faux quand le step precedent est 0.

### GET /api/admin/analytics/cohorts

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | 6 cohortes mensuelles |

**Observations** :
- Cohortes Oct-Dec 2025 : total=0 (normal, pas de users)
- Cohorte Jan 2026 : 24 users, retention M1=0%, M2=0%
- Cohorte Mar 2026 : 15 users, pas encore de retention
- Cohorte Feb 2026 : MANQUANTE (pas dans la liste)

**BUG MINEUR** : La cohorte "2025-12" apparait 2 fois avec total=0

### GET /api/admin/analytics/mrr-forecast

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |

```json
{
  "current_mrr": 19.9,
  "forecast": [
    {"month": "2026-04", "mrr_projected": 20.34},
    {"month": "2026-05", "mrr_projected": 20.77},
    {"month": "2026-06", "mrr_projected": 21.21}
  ],
  "trend_pct": 2.2,
  "slope_daily": 0.01
}
```

**Verdict** : OK - Forecast base sur le MRR actuel avec une croissance de 2.2%

---

## 5. Events / Logs

### GET /api/admin/events

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | Liste d'events avec categories auth (sign_in, sign_out) |

**Champs par event** : id, created_at, event_name, event_label, category, feature, severity, user_id, properties, email

**Verdict** : OK - Events bien structures avec labels FR

### GET /api/admin/logs/security

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | Events auth (login_success, login_failed, logout) |

**Champs par event** : id, event_type, severity, user_id, ip_address (null), created_at, event_data, profiles (join)

**Observation** : `ip_address` est toujours null -- le tracking IP n'est pas implemente

### GET /api/admin/logs/webhook-failures

| Champ | Valeur |
|-------|--------|
| HTTP Status | **404 Not Found** |
| Reponse | `{"detail":"Not Found"}` |

**ERREUR** : Cet endpoint n'existe pas. Le bon endpoint est `/api/admin/logs/webhooks`

### GET /api/admin/logs/webhooks

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | `failures: [], total: 0` |

**Verdict** : OK - Pas de webhook failures en prod

### GET /api/admin/users/{user_id}/events

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Donnees | 2 events pour test-premium (2 logins) |

**Verdict** : OK

### GET /api/admin/logs/users/{user_id}

Non teste (meme fonctionnalite que users/{id}/events)

---

## 6. Alert Preferences

### GET /api/admin/alert-preferences

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Nombre de categories | 11 |

**Categories retournees** :

| Key | Label | Enabled |
|-----|-------|---------|
| payment_received | Paiement recu | true |
| payment_failed | Paiement echoue | true |
| new_subscription | Nouvelle souscription | true |
| cancellation | Annulation | true |
| new_user | Nouvel utilisateur | true |
| new_contact | Nouveau message contact | true |
| new_support_ticket | Nouveau ticket support | true |
| new_recruiter_request | Demande consultation recruteur | true |
| cv_analysis_completed | Analyse CV terminee | true |
| coach_used | Coach utilise | true |
| error | Erreurs critiques | true |

**Observations** :
- Tous les alerts sont `enabled: true`
- Les descriptions sont en francais (sans accents -- "recu" au lieu de "recu")
- Manque les accents dans les descriptions (ex: "echoue" au lieu de "echoue")

**Verdict** : OK - Fonctionnel mais accents manquants dans les labels

---

## 7. Cron Endpoints

### POST /api/cron/daily-admin-digest

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Auth | Bearer CRON_SECRET |

```json
{
  "success": true,
  "signups": 5,
  "new_subscriptions": 1,
  "revenue_today": 19.9,
  "mrr": 19.9,
  "active_users": 6
}
```

**Verdict** : OK - Digest genere avec succes

### POST /api/cron/retention-notifications

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |
| Auth | Bearer CRON_SECRET |

```json
{
  "success": true,
  "sent": 0,
  "total_inactive": 0
}
```

**Verdict** : OK - Pas d'utilisateurs inactifs a notifier

---

## 8. Autres Endpoints Admin

### GET /api/admin/health

| Champ | Valeur |
|-------|--------|
| HTTP Status | **200 OK** |

```json
{
  "status": "ok",
  "services": [
    {"name": "Backend", "status": "ok", "latency_ms": 0},
    {"name": "Supabase", "status": "ok", "latency_ms": 76},
    {"name": "Stripe", "status": "ok", "latency_ms": 341},
    {"name": "Email (Resend)", "status": "ok", "latency_ms": 185}
  ]
}
```

**Verdict** : OK - Tous les services UP

### GET /api/admin/search?q=wissem

| HTTP Status | **200 OK** |
|-------------|------------|
| Resultats | 6 users trouves |

**Verdict** : OK - Recherche full-text fonctionne

### GET /api/admin/export/users

| HTTP Status | **200 OK** |
|-------------|------------|
| Format | CSV |
| Colonnes | id, email, full_name, status, is_admin, created_at |

**Verdict** : OK - Export CSV fonctionnel

### GET /api/admin/coaches

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | 5 coaches avec traductions (en, es, pt) |

**Verdict** : OK - Donnees completes avec toutes les traductions

### GET /api/admin/suggestions

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | 5 assistants avec 3-4 suggestions chacun |

**Verdict** : OK

### GET /api/admin/prompts

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | Liste de prompts avec nom, display_name, updated_at |

**Verdict** : OK

### GET /api/admin/promo-codes

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `coupons: [], total: 0` |

**Verdict** : OK (aucun promo code cree)

### GET /api/admin/coupons

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `coupons: [], total: 0` |

**Verdict** : OK (aucun coupon cree)

### GET /api/admin/recruiter-requests

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `requests: [], total: 0` |

**Verdict** : OK (aucune demande)

### GET /api/admin/banned-ips

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `ips: []` |

**Verdict** : OK

### GET /api/admin/blacklisted-emails

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `emails: []` |

**Verdict** : OK

### GET /api/admin/users/{id}/payments

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `payments: [], total: 0` |

**Verdict** : OK (pas de paiements Stripe reels)

### GET /api/admin/users/{id}/feature-overrides

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | 11 features listees, aucune override |

**Verdict** : OK

### GET /api/admin/users/{id}/notes

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `notes: []` |

**Verdict** : OK

---

## 9. Segments

### GET /api/admin/segments/at-risk

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `users: [], total: 0` |

**Verdict** : OK (pas de users at-risk)

### GET /api/admin/segments/about-to-churn

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `users: [], total: 0` |

**Verdict** : OK

### GET /api/admin/segments/never-converted

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | `users: [], total: 0` |

**Verdict** : OK

---

## 10. Referrals

### GET /api/admin/referrals/leaderboard

| HTTP Status | **200 OK** |
|-------------|------------|
| Donnees | 6 referrers, 2 signups total, 0 conversions |

**Verdict** : OK

### GET /api/admin/referrals/stats

| HTTP Status | **200 OK** |
|-------------|------------|

```json
{
  "total_referrers": 6,
  "total_signups": 2,
  "total_conversions": 0,
  "total_rewards_applied": 1
}
```

**Verdict** : OK

### GET /api/admin/referrals/config

| HTTP Status | **200 OK** |
|-------------|------------|

4 tiers configures : Bronze (1 ami, 3j), Argent (3 amis, 7j), Or (5 amis, 14j), Ambassadeur (10 amis, 30j)

**Verdict** : OK

---

## Problemes identifies

### BUGS

| # | Severite | Endpoint | Description |
|---|----------|----------|-------------|
| 1 | ORANGE | `/api/stats/plan-distribution` | Retourne `error: "data_unavailable"` et `total: 0` avec un `pro_percent: 67` qui semble hardcode. Le cache memoire n'est pas alimente. |
| 2 | ORANGE | `/api/admin/analytics/mrr-trend` | Retourne MRR=0.0 pour tous les 90 jours alors que le MRR actuel est 19.9. Ne prend pas en compte les subscriptions `admin_granted`. |
| 3 | JAUNE | `/api/admin/stats` vs `/api/admin/analytics/revenue` | `paying_users=3` dans stats vs `total_paying_users=1` dans revenue. Methodes de comptage differentes. |
| 4 | JAUNE | `/api/admin/users` vs `/api/admin/users/{id}` | `total_paid=19.9` dans la liste vs `total_paid=0.0` dans le detail pour le meme user (test-premium). |
| 5 | JAUNE | `/api/admin/analytics/cohorts` | Cohorte "2025-12" dupliquee. Cohorte Feb 2026 manquante. |
| 6 | JAUNE | `/api/admin/analytics/funnel` | `pct_of_previous` retourne 0 quand le step precedent est 0 au lieu de "N/A" ou null. |
| 7 | MINEUR | `/api/admin/logs/security` | `ip_address` toujours null -- tracking IP pas implemente. |
| 8 | MINEUR | `/api/admin/alert-preferences` | Labels FR sans accents ("recu", "echoue", "terminee" au lieu de formes accentuees). |
| 9 | MINEUR | User detail | `last_login_at` toujours null malgre des logins enregistres dans security_events. |
| 10 | INFO | `/api/admin/logs/webhook-failures` | 404 -- endpoint n'existe pas. Le bon path est `/api/admin/logs/webhooks`. |

### Endpoints NON testes (actions destructives/modificatives)

Les endpoints suivants n'ont pas ete appeles pour eviter de modifier les donnees de production :

- PATCH `/users/{id}/suspend` et `/reactivate`
- POST `/users/{id}/reset-password`
- DELETE `/users/{id}`
- POST `/users/{id}/force-plan`
- POST `/users/create`
- PATCH `/plans/{id}/limits`, `/features`, `/wording`, `/price`
- POST `/plans/{id}/translate`, `/stripe-price`
- POST `/users/{id}/reset-usage`
- POST `/users/{id}/send-email`
- POST `/users/bulk-email`
- POST `/users/{id}/impersonate`
- POST `/users/{id}/feature-overrides`
- DELETE `/users/{id}/feature-overrides/{feature}`
- PUT `/prompts/{name}`
- POST `/coupons`
- DELETE `/coupons/{id}`
- POST `/users/{id}/apply-coupon`
- POST `/users/{id}/ban` et `/unban`
- POST `/users/{id}/force-signout`
- PUT `/users/{id}/email`
- POST `/users/{id}/add-note`
- POST `/users/{id}/grant-days`
- POST `/users/{id}/set-custom-limits`
- POST `/broadcast-notification`
- POST `/ban-ip`, DELETE `/ban-ip/{ip}`
- POST `/blacklist-email`
- POST/PATCH/DELETE `/suggestions/{id}`
- PATCH `/referrals/config`
- POST `/referrals/grant-reward/{id}`
- PATCH `/recruiter-requests/{id}/status`
- POST `/logs/webhooks/{id}/retry` et `/resolve`
- PATCH `/coaches/{id}`
- POST `/coaches/{id}/translate`
- POST/PATCH/DELETE `/promo-codes`
- PUT `/alert-preferences`

---

## Score global

| Categorie | Score |
|-----------|-------|
| Endpoints fonctionnels | 40/41 (97.5%) |
| Coherence donnees | 7/10 (3 incoherences data) |
| Completude donnees | 9/10 (IP manquant, last_login null) |
| Securite auth admin | 10/10 (tous protege par is_admin check) |
| **Total** | **8.5/10** |

---

## Actions recommandees

1. **Fixer `/api/stats/plan-distribution`** : le cache memoire n'est pas alimente, l'endpoint retourne une erreur
2. **Fixer `/api/admin/analytics/mrr-trend`** : ne prend pas en compte les subscriptions admin_granted
3. **Harmoniser `paying_users`** entre `/stats` et `/analytics/revenue` pour utiliser la meme methode de comptage
4. **Harmoniser `total_paid`** entre la liste users et le detail user
5. **Fixer la duplication de cohorte** Dec 2025 et la cohorte Feb 2026 manquante
6. **Ajouter les accents** dans les labels d'alert-preferences
7. **Implementer le tracking IP** dans les security events (optionnel)
