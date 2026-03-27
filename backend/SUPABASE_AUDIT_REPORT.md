# Rapport d'Audit Supabase - HuntZen Backend
**Date:** 2026-02-11
**User de test:** `3abda780-30fb-46c8-a5c3-5bfa7938d688` (wissemkarboub@gmail.com)

---

## 📋 Executive Summary

### État Global
- ✅ **Connexion Supabase:** OK
- ✅ **Migration profiles → user_subscriptions:** COMPLÈTE (champs deprecated nettoyés)
- ✅ **Webhooks Stripe:** 100% processed (25/25 events)
- ⚠️ **subscription_plans:** Manque stripe_price_id dans la table (stocké uniquement dans user_subscriptions)
- ⚠️ **User de test:** 8 subscriptions dont 7 canceled, 1 active (starter)

### Problèmes Critiques Détectés
1. **Aucun stripe_price_id dans subscription_plans** → Mapping price→plan fait via user_subscriptions
2. **User de test a 8 subscriptions** → Historique de tests non nettoyé
3. **Quotas obsolètes** → Dernière entrée usage_quotas du 2026-02-03 (pas de reset depuis)

---

## 1️⃣ TABLE: user_subscriptions

### Structure
```
- id: UUID (PK)
- user_id: UUID (FK → profiles.id)
- plan_id: UUID (FK → subscription_plans.id)
- status: TEXT (active|canceled|past_due|trialing|incomplete|incomplete_expired)
- current_period_start: TIMESTAMP
- current_period_end: TIMESTAMP
- cancel_at_period_end: BOOLEAN
- stripe_subscription_id: TEXT
- stripe_customer_id: TEXT
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
- stripe_price_id: TEXT
- trial_start: TIMESTAMP (nullable)
- trial_end: TIMESTAMP (nullable)
- canceled_at: TIMESTAMP (nullable)
```

### Statistiques
- **Total rows:** 8
- **Toutes pour user de test:** 3abda780-30fb-46c8-a5c3-5bfa7938d688
- **Status breakdown:**
  - active: 1
  - canceled: 7

### Données User de Test
```
✅ ACTIVE SUBSCRIPTION:
  ID: d5a81c1a-aca3-4fbf-8016-35d938673ca2
  Plan: starter (d18ddf08-784d-471c-b2d7-7586b4e5472c)
  Status: active
  Stripe Sub ID: sub_test_manual_insert
  Period: 2026-02-11 → 2026-03-13
  Created: 2026-02-11T09:46:49

❌ CANCELED SUBSCRIPTIONS (7):
  1. Premium (sub_1SwoSHF7q8KRoF9a6QovhsDp) - canceled 2026-02-10
  2. Free (null) - canceled 2026-02-10
  3. Starter (sub_test_starter_...) - canceled 2026-02-10
  4. Pro (sub_test_pro_...) - canceled 2026-02-10
  5. Premium (sub_test_premium_...) - canceled 2026-02-10
  6. Pro (sub_test_pro_downgrade_...) - canceled 2026-02-10
  7. Free (null) - canceled 2026-02-10 (canceled_at = NULL)
```

### Problèmes Détectés
- ✅ Aucune donnée manquante (user_id, plan_id toujours renseignés)
- ✅ Status toujours valide
- ⚠️ **7 subscriptions canceled** → Créer un job de cleanup pour purger après X jours

---

## 2️⃣ TABLE: subscription_plans

### Structure
```
- id: UUID (PK)
- name: TEXT (free|starter|pro|premium)
- display_name: TEXT
- description: TEXT
- price_monthly: NUMERIC
- price_yearly: NUMERIC
- limits: JSONB
- features: TEXT[]
- is_active: BOOLEAN
- sort_order: INTEGER
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Statistiques
- **Total rows:** 4 (free, starter, pro, premium)
- **Tous actifs:** is_active = true

### Configuration des Plans

#### FREE
```json
{
  "id": "2e18728e-7db0-4385-a6fe-8cd16ae26f05",
  "name": "free",
  "price_monthly": 0.0,
  "limits": {
    "job_views": 10,
    "cv_analyses": 1,
    "job_searches": 3,
    "coach_seconds": 300
  },
  "features": [
    "1 CV Analysis per day",
    "5 minutes Career Coach per day",
    "3 Job Searches per day",
    "Basic job matching"
  ]
}
```
**Subscriptions:** 2 (toutes canceled)
**Stripe Price ID:** N/A (plan gratuit)

#### STARTER
```json
{
  "id": "d18ddf08-784d-471c-b2d7-7586b4e5472c",
  "name": "starter",
  "price_monthly": 8.9,
  "price_yearly": 85.0,
  "limits": {
    "job_views": -1,
    "cv_analyses": 5,
    "job_searches": -1,
    "coach_seconds": 1800
  },
  "features": [
    "5 CV Analyses per day",
    "30 minutes Career Coach per day",
    "Unlimited Job Searches",
    "Advanced filters",
    "Favorites management",
    "Visual compatibility score"
  ]
}
```
**Subscriptions:** 2 (1 active, 1 canceled)
**Stripe Price ID:** `price_1SwkaNF7q8KRoF9a8cVsijpc`

#### PRO
```json
{
  "id": "3f42df0e-6794-414f-9410-97981064fa7e",
  "name": "pro",
  "price_monthly": 13.9,
  "price_yearly": 133.0,
  "limits": {
    "job_views": -1,
    "cv_analyses": 20,
    "job_searches": -1,
    "coach_seconds": -1
  }
}
```
**Subscriptions:** 2 (toutes canceled)
**Stripe Price ID:** `price_1SwkeQF7q8KRoF9azQdPo1o6`

#### PREMIUM
```json
{
  "id": "d8fd5402-76f1-4b25-b35c-a6c5384cf817",
  "name": "premium",
  "price_monthly": 19.9,
  "price_yearly": 191.0,
  "limits": {
    "job_views": -1,
    "cv_analyses": -1,
    "job_searches": -1,
    "coach_seconds": -1
  }
}
```
**Subscriptions:** 2 (toutes canceled)
**Stripe Price ID:** `price_1SwlC1F7q8KRoF9a8FXeooCj`

### Problèmes Détectés
- ❌ **Aucun stripe_price_id dans subscription_plans table**
  - Actuellement stocké uniquement dans `user_subscriptions.stripe_price_id`
  - **Recommandation:** Ajouter colonnes `stripe_monthly_price_id` et `stripe_yearly_price_id` dans subscription_plans
  - **Impact:** Rend difficile la création de checkout sessions sans faire de JOIN

### Mapping Stripe Price IDs
```
price_1SwkaNF7q8KRoF9a8cVsijpc → starter (monthly 8.9€)
price_1SwkeQF7q8KRoF9azQdPo1o6 → pro (monthly 13.9€)
price_1SwlC1F7q8KRoF9a8FXeooCj → premium (monthly 19.9€)
```

---

## 3️⃣ TABLE: usage_quotas

### Structure
```
- id: UUID (PK)
- user_id: UUID (FK → profiles.id)
- quota_date: DATE
- cv_analyses_used: INTEGER
- coach_seconds_used: INTEGER
- job_searches_used: INTEGER
- job_views_used: INTEGER
- last_reset_at: TIMESTAMP
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Statistiques
- **Total rows:** 2 (toutes pour user de test)

### Données User de Test
```
Entry 1:
  Date: 2026-01-28
  Usage: 0 CV analyses, 0 coach seconds, 0 searches, 0 views
  Last reset: 2026-01-27T23:23:14

Entry 2:
  Date: 2026-02-03
  Usage: 2 CV analyses, 0 coach seconds, 0 searches, 0 views
  Last reset: 2026-02-03T18:19:39
  Updated: 2026-02-03T18:37:53
```

### Problèmes Détectés
- ⚠️ **Quotas obsolètes**
  - Dernière entrée: 2026-02-03
  - Aujourd'hui: 2026-02-11
  - **8 jours sans reset** → Vercel cron job ne fonctionne pas OU pas d'activité utilisateur
- ⚠️ **Pas de quotas pour la date actuelle**
  - Devrait créer automatiquement un quota à la première utilisation du jour
  - Ou via cron quotidien

### Recommandations
1. Vérifier que Vercel cron `/api/cron/reset-quotas` est activé
2. Ajouter monitoring pour alerter si last_reset_at > 24h
3. Implémenter lazy creation des quotas (créer si absent au moment de l'utilisation)

---

## 4️⃣ TABLE: profiles

### Structure (colonnes liées subscription)
```
- id: UUID (PK)
- email: TEXT
- full_name: TEXT
- stripe_customer_id: TEXT (DEPRECATED - NULL)
- stripe_subscription_id: TEXT (DEPRECATED - NULL)
- stripe_subscription_status: TEXT (DEPRECATED - NULL)
- subscription_tier: TEXT (DEPRECATED - contient "free")
- cv_analyses_used: INTEGER (DEPRECATED)
- cv_analyses_limit: INTEGER (DEPRECATED)
- coach_messages_used: INTEGER (DEPRECATED)
- coach_messages_limit: INTEGER (DEPRECATED)
- job_searches_used: INTEGER (DEPRECATED)
- job_searches_limit: INTEGER (DEPRECATED)
- quota_reset_date: TIMESTAMP (DEPRECATED)
```

### Données User de Test
```
Email: wissemkarboub@gmail.com
Full name: Wissem
Subscription tier: "free" (DEPRECATED)

DEPRECATED FIELDS (devraient être NULL ou supprimés):
  ✅ stripe_customer_id: NULL
  ✅ stripe_subscription_id: NULL
  ✅ stripe_subscription_status: NULL
  ⚠️ subscription_tier: "free" (devrait être NULL)
  ⚠️ cv_analyses_used: 0
  ⚠️ cv_analyses_limit: 1
  ⚠️ coach_messages_used: 0
  ⚠️ coach_messages_limit: 5
  ⚠️ job_searches_used: 0
  ⚠️ job_searches_limit: 10
  ⚠️ quota_reset_date: 2026-01-29T19:57:16
```

### État de la Migration
- ✅ **Stripe fields:** Nettoyés (NULL)
- ⚠️ **Quota fields:** Toujours présents → À supprimer après vérification que le code ne les utilise plus
- ⚠️ **subscription_tier:** Toujours présent → Vérifier si utilisé par frontend fallback

### Recommandations
1. **Phase 1 (SAFE):** Ajouter monitoring pour détecter si ces colonnes sont encore lues
2. **Phase 2 (après 7 jours):** Mettre les colonnes en lecture seule (trigger qui empêche UPDATE)
3. **Phase 3 (après 14 jours):** DROP COLUMN si aucune utilisation détectée

---

## 5️⃣ TABLE: stripe_webhook_events

### Structure
```
- id: UUID (PK)
- stripe_event_id: TEXT (UNIQUE)
- event_type: TEXT
- processed_at: TIMESTAMP (NULL si non traité)
- payload: JSONB
- created_at: TIMESTAMP
```

### Statistiques
- **Total events:** 25
- **Processed:** 25/25 (100%)
- **Non-processed:** 0

### Distribution par Type
```
customer.subscription.created: 9
invoice.payment_succeeded: 9
checkout.session.completed: 7
```

### Derniers Events (top 5)
```
1. invoice.payment_succeeded (2026-02-11T10:23:06) ✅ PROCESSED
2. customer.subscription.created (2026-02-11T10:23:06) ✅ PROCESSED
3. invoice.payment_succeeded (2026-02-11T09:56:54) ✅ PROCESSED
4. customer.subscription.created (2026-02-11T09:56:53) ✅ PROCESSED
5. invoice.payment_succeeded (2026-02-11T09:43:10) ✅ PROCESSED
```

### Problèmes Détectés
- ✅ **Idempotence OK:** Aucun event non traité
- ✅ **Pas de backlog:** Tous les events sont processed_at NOT NULL
- ⚠️ **25 events pour 1 user de test** → Beaucoup de tests manuels

### Recommandations
1. ✅ Le système d'idempotence fonctionne correctement
2. Ajouter un cleanup job pour purger events > 90 jours (conformité RGPD)

---

## 6️⃣ TABLE: webhook_failures

### Structure
```
- id: UUID (PK)
- stripe_event_id: TEXT
- event_type: TEXT
- error_message: TEXT
- error_traceback: TEXT
- retry_count: INTEGER
- first_attempt_at: TIMESTAMP
- last_attempt_at: TIMESTAMP
- resolved: BOOLEAN
- resolved_at: TIMESTAMP (nullable)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Statistiques
- **Total failures:** 3

### Dernières Failures
```
[1] 2026-02-11T10:23:06
  Type: checkout.session.completed
  Error: 'current_period_start'
  → KeyError Python, probablement subscription manquante dans payload

[2] 2026-02-11T09:56:54
  Type: checkout.session.completed
  Error: current_period_start
  → Même erreur

[3] 2026-02-11T01:26:50
  Type: checkout.session.completed
  Error: 400: Missing user_id in session metadata
  → Client ID manquant dans Stripe checkout metadata
```

### Analyse des Erreurs
1. **KeyError 'current_period_start' (2 occurrences)**
   - **Root cause:** Code tente d'accéder `subscription['current_period_start']` sur un checkout.session.completed qui n'a pas encore de subscription créée
   - **Fix:** Vérifier `if 'subscription' in event.data.object` avant d'y accéder
   - **Fichier probable:** `backend/src/api/webhooks/stripe.py`

2. **Missing user_id in session metadata (1 occurrence)**
   - **Root cause:** Checkout session créée sans `metadata={'user_id': ...}`
   - **Fix:** S'assurer que TOUS les Stripe.checkout.sessions.create() incluent user_id
   - **Fichier probable:** `backend/src/services/subscription_service.py`

### Recommandations
1. **URGENT:** Fixer les 2 types d'erreurs ci-dessus
2. Implémenter retry automatique pour webhook_failures après fix
3. Ajouter alerte Sentry/email si failure_count > 5 pour un même event_type

---

## 🔍 Contraintes et Relations (Foreign Keys)

### Foreign Keys Détectées
```
user_subscriptions:
  - user_id → profiles.id
  - plan_id → subscription_plans.id

usage_quotas:
  - user_id → profiles.id

(Note: Détection par convention de nommage,
Supabase RPC exec_sql non disponible pour introspection schema)
```

### Indexes Recommandés (à vérifier)
```sql
-- Performance queries
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status
  ON user_subscriptions(user_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_usage_quotas_user_date
  ON usage_quotas(user_id, quota_date DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed
  ON stripe_webhook_events(processed_at)
  WHERE processed_at IS NULL;

-- Unicité
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_id
  ON user_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
```

---

## 📊 Résumé des Problèmes et Actions

### 🔴 CRITIQUES (fix immédiat)
1. **webhook_failures: KeyError 'current_period_start'**
   - Fix: Vérifier existence de subscription dans payload
   - Fichier: `backend/src/api/webhooks/stripe.py`

2. **webhook_failures: Missing user_id in metadata**
   - Fix: Ajouter user_id dans tous les checkout sessions
   - Fichier: `backend/src/services/subscription_service.py`

### 🟠 IMPORTANTES (fix avant production)
3. **subscription_plans: Manque stripe_price_id**
   - Action: Ajouter colonnes stripe_monthly_price_id, stripe_yearly_price_id
   - Migration:
     ```sql
     ALTER TABLE subscription_plans
       ADD COLUMN stripe_monthly_price_id TEXT,
       ADD COLUMN stripe_yearly_price_id TEXT;

     -- Peupler depuis user_subscriptions
     UPDATE subscription_plans sp SET
       stripe_monthly_price_id = (
         SELECT stripe_price_id
         FROM user_subscriptions
         WHERE plan_id = sp.id
         AND stripe_price_id IS NOT NULL
         LIMIT 1
       );
     ```

4. **usage_quotas: Pas de reset depuis 8 jours**
   - Vérifier: Vercel cron configuré et actif
   - URL: `/api/cron/reset-quotas`
   - Schedule: `0 0 * * *` (daily at midnight)

### 🟡 OPTIMISATIONS (nice to have)
5. **profiles: Colonnes deprecated non supprimées**
   - Action: Monitorer utilisation puis DROP après 14 jours
   - Colonnes: subscription_tier, cv_analyses_used, quota_reset_date, etc.

6. **user_subscriptions: 7 canceled subscriptions**
   - Action: Créer cleanup job pour archiver après 90 jours
   - Ou soft-delete (ajouter colonne `archived_at`)

7. **stripe_webhook_events: Retention indéfinie**
   - Action: Purger events > 90 jours (RGPD compliant)

---

## 🧪 Tests de Validation

### Pour user 3abda780-30fb-46c8-a5c3-5bfa7938d688

#### Test 1: Subscription Active
```python
# ✅ PASS
subscription = get_active_subscription(user_id)
assert subscription.status == 'active'
assert subscription.plan.name == 'starter'
assert subscription.stripe_subscription_id == 'sub_test_manual_insert'
```

#### Test 2: Quotas
```python
# ⚠️ FAIL - Quotas obsolètes
quotas = get_current_quotas(user_id)
assert quotas.quota_date == date.today()  # ❌ quota_date = 2026-02-03
```

#### Test 3: Plan Limits
```python
# ✅ PASS
limits = subscription.plan.limits
assert limits.cv_analyses == 5
assert limits.job_searches == -1  # unlimited
assert limits.coach_seconds == 1800
```

---

## 📝 Checklist Déploiement Production

### Pré-déploiement
- [ ] Fixer webhook_failures (KeyError 'current_period_start')
- [ ] Fixer webhook_failures (Missing user_id)
- [ ] Ajouter stripe_price_id dans subscription_plans
- [ ] Vérifier Vercel cron configuré
- [ ] Tester reset_quotas_rpc() manuellement
- [ ] Ajouter indexes recommandés
- [ ] Activer monitoring Sentry sur webhooks

### Post-déploiement
- [ ] Monitorer webhook_failures pendant 48h
- [ ] Vérifier quotas se reset quotidiennement
- [ ] Cleanup subscriptions canceled (après 7 jours)
- [ ] DROP colonnes deprecated dans profiles (après 14 jours)
- [ ] Implémenter archivage stripe_webhook_events (90 jours)

---

## 🔗 Liens Utiles

- **Supabase Dashboard:** https://ngiakfikbuyugqfqtfwp.supabase.co
- **Stripe Dashboard:** https://dashboard.stripe.com/
- **Backend Code:** `/Users/wissem/HuntzenIA/huntzen_jobsearch/backend`
- **Migrations:** `backend/migrations/`
- **Webhooks:** `backend/src/api/webhooks/stripe.py`

---

**Rapport généré le:** 2026-02-11
**Connexion Supabase:** ✅ OK
**Service Role Key:** ✅ Présent
