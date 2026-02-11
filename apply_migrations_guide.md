# Guide d'application des migrations manquantes

## Problème

L'erreur "Impossible de récupérer vos informations d'abonnement" est causée par des migrations SQL non appliquées sur Supabase en production.

## Solution

### Étape 1: Diagnostic

Ouvrez le Supabase SQL Editor et exécutez le fichier `fix_missing_migrations.sql` pour diagnostiquer les fonctions manquantes.

### Étape 2: Appliquer les migrations dans l'ordre

Allez sur: https://supabase.com/dashboard/project/[PROJECT_ID]/sql/new

Exécutez **une par une** les migrations suivantes dans cet ordre:

1. `supabase/migrations/20260128000000_subscription_infrastructure.sql`
   - Crée les tables: user_subscriptions, subscription_plans, usage_quotas

2. `supabase/migrations/20260128000100_quota_functions.sql`
   - Crée les fonctions: get_quota_status(), increment_usage()

3. `supabase/migrations/20260210000001_deprecate_profiles_subscription.sql`
   - ⚠️ **CRITIQUE**: Crée la fonction `get_user_current_subscription()`
   - Crée la vue `user_subscription_unified`

4. `supabase/migrations/20260210000002_webhook_idempotency.sql`
   - Crée la table stripe_webhook_events (évite doublons webhooks)

5. `supabase/migrations/20260210000003_stripe_price_config.sql`
   - Crée la table stripe_prices (mapping Stripe price_id → plan)

6. `supabase/migrations/20260211000002_auto_assign_free_plan.sql`
   - Crée le trigger d'auto-assignation du plan free
   - Backfill les users existants sans subscription

### Étape 3: Vérification

Après avoir appliqué toutes les migrations, vérifiez que tout fonctionne:

```sql
-- Test 1: Fonction existe
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'get_user_current_subscription';

-- Test 2: Appeler la fonction pour votre user_id
SELECT * FROM get_user_current_subscription('YOUR-USER-ID-HERE');

-- Test 3: Vérifier que tous les users ont une subscription
SELECT 
  COUNT(*) AS total_users,
  COUNT(DISTINCT us.user_id) AS users_with_subscription
FROM auth.users u
LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'active';
```

### Étape 4: Test frontend

Une fois les migrations appliquées:

1. Reconnectez-vous sur l'application
2. L'erreur devrait disparaître
3. Vous devriez voir votre plan actuel (Free, Starter, Pro, etc.)

## Alternative: Supabase CLI

Si Docker est installé et configuré:

```bash
# 1. Pull remote changes
supabase db pull

# 2. Reset local database (warning: destructive)
supabase db reset

# 3. Push migrations to remote
supabase db push
```

⚠️ **Attention**: `db push` est destructif et peut causer des pertes de données. Préférez l'application manuelle via Dashboard pour la production.
