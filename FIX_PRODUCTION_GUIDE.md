# 🚨 Guide d'Application du Fix Production - Table subscription_plans Manquante

**Issue:** [#9](https://github.com/huntzenjobs/HuntzenJobs/issues/9)
**Criticité:** CRITICAL - Bloque toutes les inscriptions
**Date:** 2026-02-11

## 🔍 Diagnostic

La table `subscription_plans` n'existe pas en production, causant l'erreur :
```
ERROR: relation "subscription_plans" does not exist (SQLSTATE 42P01)
500: Database error saving new user
```

## ✅ Solution - Application du Fix

### Option 1: Via Supabase Dashboard (Recommandé)

1. **Se connecter au Supabase Dashboard**
   - URL: https://supabase.com/dashboard
   - Projet: HuntzenJobs Production

2. **Ouvrir le SQL Editor**
   - Menu: SQL Editor
   - Créer une nouvelle query

3. **Copier-coller le contenu du fichier**
   ```bash
   cat fix_production_subscription_tables.sql
   ```

4. **Exécuter le script SQL**
   - Cliquer sur "Run"
   - Vérifier les messages de succès dans les logs

5. **Vérifier l'application**
   ```sql
   -- Vérifier les plans créés
   SELECT name, display_name, price_monthly
   FROM subscription_plans
   ORDER BY sort_order;

   -- Vérifier les abonnements actifs
   SELECT COUNT(*) as total_active_subscriptions
   FROM user_subscriptions
   WHERE status = 'active';

   -- Vérifier les utilisateurs avec plan
   SELECT
     COUNT(DISTINCT u.id) as total_users,
     COUNT(DISTINCT us.user_id) as users_with_subscription
   FROM auth.users u
   LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'active';
   ```

### Option 2: Via Supabase CLI

```bash
# 1. Se connecter au projet
supabase link --project-ref <PROJECT_ID>

# 2. Appliquer le fix
supabase db execute --file fix_production_subscription_tables.sql

# 3. Vérifier
supabase db execute --query "SELECT COUNT(*) FROM subscription_plans;"
```

### Option 3: Via Migration Supabase

Si vous préférez ajouter cela comme migration officielle :

```bash
# 1. Créer la migration
supabase migration new fix_missing_subscription_tables

# 2. Copier le contenu du fix dans le fichier de migration

# 3. Appliquer en production
supabase db push
```

## 🧪 Tests Post-Application

### 1. Vérifier les Tables
```sql
-- Les 3 tables doivent exister
\d subscription_plans
\d user_subscriptions
\d usage_quotas
```

### 2. Vérifier les Plans
```sql
SELECT name, display_name, price_monthly, is_active
FROM subscription_plans
ORDER BY sort_order;
```

**Résultat attendu :**
| name | display_name | price_monthly | is_active |
|------|--------------|---------------|-----------|
| free | Free | 0.00 | true |
| starter | Starter | 8.90 | true |
| pro | Pro | 13.90 | true |
| premium | Premium | 19.90 | true |

### 3. Vérifier les Abonnements Utilisateurs
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) as total
FROM user_subscriptions;
```

**Attendu:** Tous les utilisateurs doivent avoir un abonnement actif (Free par défaut)

### 4. Test d'Inscription Utilisateur

**Via Frontend :**
1. Ouvrir https://www.huntzenjobs.com/auth/signup
2. Créer un nouveau compte test
3. Vérifier que l'inscription réussit (pas d'erreur 500)
4. Vérifier que le nouvel utilisateur a bien le plan "Free"

**Via SQL :**
```sql
-- Après avoir créé un compte test
SELECT
  u.email,
  sp.name as plan_name,
  us.status,
  us.current_period_end
FROM auth.users u
JOIN user_subscriptions us ON u.id = us.user_id
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE u.email = 'test@example.com';
```

### 5. Test API /api/auth/me

```bash
# 1. S'authentifier et récupérer le token
# 2. Tester l'endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://huntzenjobs-production.up.railway.app/api/auth/me

# Vérifier que la réponse contient:
# - subscription.plan_name: "free"
# - subscription.plan_display_name: "Free"
# - subscription.status: "active"
```

## 📊 Métriques de Succès

- [ ] 4 plans créés dans `subscription_plans`
- [ ] Tous les utilisateurs existants ont un abonnement actif (plan Free)
- [ ] Les nouvelles inscriptions fonctionnent sans erreur 500
- [ ] L'API `/api/auth/me` retourne les données de subscription correctement
- [ ] Aucune erreur dans les logs Supabase après application

## 🔄 Rollback (si nécessaire)

Si le fix cause des problèmes inattendus :

```sql
BEGIN;

-- Supprimer les tables (⚠️ DESTRUCTIF)
DROP TABLE IF EXISTS usage_quotas CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- Supprimer les fonctions
DROP FUNCTION IF EXISTS get_user_plan_limits(UUID);
DROP FUNCTION IF EXISTS has_active_subscription(UUID);

COMMIT;
```

**Note:** Ce rollback supprimera toutes les données de subscription. Utiliser uniquement en cas d'urgence.

## 📞 Support

Si vous rencontrez des problèmes lors de l'application :

1. **Vérifier les logs Supabase**
   - Dashboard > Logs > Database Logs
   - Rechercher des erreurs liées aux tables

2. **Vérifier les permissions**
   - Le script utilise RLS (Row Level Security)
   - Assurez-vous que les policies sont bien appliquées

3. **Contacter l'équipe**
   - Issue GitHub: #9
   - Channel Slack: #huntzen-urgent

## ✅ Checklist de Clôture

Une fois le fix appliqué et vérifié :

- [ ] Marquer l'issue #9 comme résolue
- [ ] Mettre à jour le statut sur le channel Slack
- [ ] Documenter le problème dans MEMORY.md
- [ ] Supprimer les fichiers temporaires (`fix_production_subscription_tables.sql`, ce guide)
- [ ] Créer une alerte de monitoring pour détecter les tables manquantes à l'avenir
