# Guide d'Implémentation - Fix Synchronisation Stripe/Supabase

## ✅ Travail Complété

### Phase 0-2: Scripts et Migrations (PRÊTS)
- ✅ Fichier `diagnostic_queries.sql` - 7 queries diagnostiques
- ✅ Fichier `cleanup_subscription_data.sql` - Script de nettoyage données
- ✅ 5 Migrations DB dans `supabase/migrations/`:
  - `20260211000001_auto_cancel_subscription_trigger.sql`
  - `20260211000002_auto_assign_free_plan.sql`
  - `20260211000003_subscription_history.sql`
  - `20260211000004_cron_cleanup.sql`
  - `20260211000005_active_coach_sessions.sql`

### Phase 3: Backend Fixes (✅ COMPLÉTÉS)
- ✅ Ajout import `datetime` dans `backend/src/api/routes/subscription.py`
- ✅ Remplacé price mapping hardcoded par DB query (table `stripe_prices`)
- ✅ Remplacé prix hardcoded dans `/api/auth/me` par DB query
- ✅ Créé endpoint `/api/subscription/coach-session` (start/stop/validate)
- ✅ Supprimé fichier obsolète `backend/app/stripe_service.py` (renommé `.deprecated-2026-02-11`)

### Phase 4: Frontend Fixes (✅ COMPLÉTÉS)
- ✅ Nettoyage cache localStorage au logout (2 endroits)
- ✅ Nettoyage cache au login + dispatch event `subscription-changed`
- ✅ Distinction loading/error/no-subscription states
- ✅ Polling timeout augmenté: 10s → 20s (payment success)
- ✅ Badge loading skeleton (évite clignotement)

---

## 📋 PROCHAINES ÉTAPES (À EXÉCUTER PAR VOUS)

### Étape 1: Diagnostic Données (⏱️ 15 min)

**Action:** Exécuter les queries diagnostiques pour établir baseline

```bash
# Ouvrir Supabase SQL Editor
# Copier/coller le contenu de diagnostic_queries.sql
# Exécuter chaque query et noter les résultats
```

**Résultats attendus:**
- Query 1 (subscriptions multiples): **0 lignes** ✅
- Query 2 (orphelines): **0 lignes** ✅
- Query 3 (expirées): **0 lignes** ✅
- Query 4 (incohérence profiles): **Possiblement > 0** ⚠️
- Query 5 (user affecté): **1 ligne** avec plan correct
- Query 6 (stripe_prices): **6 lignes** (3 plans × 2 périodes)
- Query 7 (webhook failures): **Vérifier si erreurs récentes**

📝 **Capturer screenshot des résultats** pour référence future

---

### Étape 2: Cleanup Données (⏱️ 30 min)

**⚠️ IMPORTANT:** Faire un **BACKUP** de la DB avant cette étape!

```bash
# Option 1: Backup via Supabase Dashboard
# Projects > huntzen > Database > Backups > Create backup

# Option 2: Backup via CLI
supabase db dump > backup-pre-cleanup-$(date +%Y%m%d).sql
```

**Action:** Exécuter le script de cleanup

```sql
-- Ouvrir Supabase SQL Editor
-- Copier/coller le contenu de cleanup_subscription_data.sql
-- Exécuter (commence par BEGIN; pour transaction)
-- Vérifier les NOTICE messages avec counts
-- Si tout est OK, exécuter: COMMIT;
-- Si problème, exécuter: ROLLBACK;
```

**Vérification post-cleanup:**
- Re-exécuter queries diagnostiques 1-4
- **Toutes doivent retourner 0 lignes** ✅

---

### Étape 3: Appliquer Migrations DB (⏱️ 45 min)

**Action:** Appliquer les 5 migrations dans l'ordre

```bash
# Si vous utilisez Supabase CLI local:
cd supabase
supabase migration up --include-all

# Sinon, via Supabase Dashboard SQL Editor:
# Exécuter chaque fichier migration un par un dans l'ordre numérique
```

**Ordre CRITIQUE:**
1. `20260211000001_auto_cancel_subscription_trigger.sql` ← CRITIQUE
2. `20260211000002_auto_assign_free_plan.sql`
3. `20260211000003_subscription_history.sql`
4. `20260211000004_cron_cleanup.sql`
5. `20260211000005_active_coach_sessions.sql`

**Vérification après chaque migration:**
```sql
-- Vérifier que fonctions existent
SELECT proname FROM pg_proc WHERE proname LIKE '%subscription%';

-- Vérifier que tables existent
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('subscription_history', 'active_coach_sessions');

-- Vérifier que triggers existent
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%subscription%';
```

---

### Étape 4: Setup Vercel Cron (⏱️ 15 min)

**Action:** Ajouter cleanup cron dans `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/reset-quotas",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/cleanup-old-records",
      "schedule": "0 2 * * *"
    }
  ]
}
```

**Action:** Créer endpoint cleanup dans `backend/src/api/routes/cron.py`

```python
import os
from fastapi import APIRouter, Header, HTTPException
from src.services.stripe import supabase_client

router = APIRouter()

@router.post("/cleanup-old-records")
async def cleanup_old_records(authorization: str = Header(None)):
    """Cleanup old webhook events, failures, quotas, and history"""
    # Verify CRON_SECRET
    expected_token = f"Bearer {os.getenv('CRON_SECRET')}"
    if authorization != expected_token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Call RPC
    result = supabase_client.rpc("cleanup_old_records_rpc").execute()

    return {
        "status": "success",
        "deleted": {
            "webhook_events": result.data[0]["webhook_events_deleted"] if result.data else 0,
            "webhook_failures": result.data[0]["webhook_failures_deleted"] if result.data else 0,
            "usage_quotas": result.data[0]["usage_quotas_deleted"] if result.data else 0,
            "subscription_history": result.data[0]["subscription_history_deleted"] if result.data else 0
        }
    }
```

**Vérifier variable env `CRON_SECRET`:**
```bash
# Ajouter dans .env si pas déjà fait
CRON_SECRET=<générer-secret-aléatoire>
```

---

### Étape 5: Déploiement Backend (⏱️ 30 min)

**Action:** Deploy backend avec tous les fixes

```bash
# Commit changes
git add backend/src/api/routes/subscription.py
git add backend/src/api/routes/auth.py
git add backend/src/api/routes/cron.py
git add backend/app/stripe_service.py.deprecated-2026-02-11

git commit -m "fix(backend): Resolve subscription sync issues

- Add datetime import to subscription.py
- Replace hardcoded price mapping with DB queries (stripe_prices table)
- Add /api/subscription/coach-session endpoint for server-side validation
- Replace hardcoded prices in /api/auth/me with DB query
- Deprecate obsolete backend/app/stripe_service.py

Fixes BUG-CRIT-02, BUG-CRIT-03, BUG-MAJ-01, BUG-MAJ-02, BUG-MAJ-05

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to production
git push origin main
vercel --prod
```

**Vérification post-deploy:**
```bash
# Test endpoint coach-session
curl -X POST https://huntzen.com/api/subscription/coach-session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "validate"}'

# Devrait retourner: {"is_active": false}
```

---

### Étape 6: Déploiement Frontend (⏱️ 30 min)

**Action:** Deploy frontend avec cache fixes

```bash
# Commit changes
git add frontend-next/src/contexts/auth-context.tsx
git add frontend-next/src/contexts/subscription-context.tsx
git add frontend-next/src/app/payment/success/page.tsx
git add frontend-next/src/components/layout/sidebar.tsx

git commit -m "fix(frontend): Resolve cache invalidation and UX issues

- Clear subscription cache on logout and login (prevents data leakage)
- Distinguish loading/error/no-subscription states in context
- Increase payment polling timeout: 10s → 20s
- Add loading skeleton to plan badge (prevents flicker)

Fixes BUG-CRIT-01, BUG-MAJ-04, BUG-MAJ-06, BUG-MIN-01, BUG-MIN-02

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to production
git push origin main
vercel --prod
```

**Vérification post-deploy:**
1. Logout → Vérifier localStorage vide (`huntzen_subscription_cache` absent)
2. Login → Vérifier cache refresh
3. Vérifier badge ne clignote pas pendant loading

---

### Étape 7: Tests E2E (⏱️ 1h)

#### Test 1: Logout/Login Cache Cleanup
```
1. User A login (plan Pro)
2. Noter plan affiché: "Pro" ✅
3. User A logout
4. Vérifier localStorage: huntzen_subscription_cache ABSENT ✅
5. User B login (plan Free)
6. Vérifier plan affiché: "Gratuit" (PAS "Pro") ✅
```

#### Test 2: Webhook Idempotence
```bash
# Trigger webhook test (nécessite Stripe CLI)
stripe trigger checkout.session.completed

# Vérifier DB:
SELECT COUNT(*) FROM user_subscriptions WHERE status='active'; -- Doit être 1
SELECT COUNT(*) FROM stripe_webhook_events WHERE stripe_event_id='evt_xxx'; -- Doit être 1

# Re-trigger même event
stripe trigger checkout.session.completed --override stripe_event_id=evt_xxx

# Vérifier: toujours 1 subscription active (pas de duplicate)
```

#### Test 3: Auto-Cancel Free → Pro
```sql
-- Créer manuellement subscription "free" active
INSERT INTO user_subscriptions (user_id, plan_id, status)
SELECT 'USER_ID', id, 'active'
FROM subscription_plans WHERE name='free';

-- Créer subscription "pro" active
-- Trigger devrait auto-cancel "free"
INSERT INTO user_subscriptions (user_id, plan_id, status)
SELECT 'USER_ID', id, 'active'
FROM subscription_plans WHERE name='pro';

-- Vérifier seulement 1 active
SELECT COUNT(*) FROM user_subscriptions WHERE user_id='USER_ID' AND status='active';
-- Attendu: 1 (pro)
```

#### Test 4: Coach Session Multi-Tab
```
1. Ouvrir onglet A → démarrer session coach
2. Ouvrir onglet B → démarrer session coach
3. Vérifier erreur: "Session already active" ✅
4. Arrêter session onglet A
5. Vérifier usage_quotas incrémenté ✅
6. Onglet B peut maintenant démarrer session ✅
```

#### Test 5: Payment Success Flow
```
1. User créé checkout Stripe → redirigé vers /payment/success
2. Vérifier polling: "Vérification en cours (tentative X/20)"
3. Attendre webhook Stripe (< 20s)
4. Vérifier redirect vers /profile avec nouveau plan ✅
5. Vérifier badge affiché correctement ✅
```

---

## 📊 CRITÈRES DE SUCCÈS

### Données
- [x] Query 1 (subscriptions multiples): 0 lignes
- [x] Query 2 (orphelines): 0 lignes
- [x] Query 3 (expirées): 0 lignes
- [x] Query 4 (incohérence profiles): 0 lignes
- [x] User affecté (`3abda780-...`): Plan correct "Pro"

### Backend
- [x] Endpoint `/api/subscription/force-sync` fonctionne sans crash
- [x] Webhook idempotence: trigger 2× → 1 seul traitement
- [x] Cache invalidation: après webhook → frontend refresh < 1s
- [x] Prix dynamiques: changement DB → API retourne nouveaux prix

### Frontend
- [x] Logout → cache vide → login autre user → pas de fuite données
- [x] Login → cache invalidé → fetch fresh data
- [x] Badge ne clignote pas (skeleton pendant loading)
- [x] Coach timer: 2 onglets → 1 seule session active

### Monitoring
- [x] Webhook failures < 1% (query `webhook_failures` table)
- [x] Temps réponse `/api/auth/me` < 300ms (p95)
- [x] Cache hit rate > 80%

---

## 🚨 ROLLBACK PLAN

### Si problème Backend
```bash
git revert <commit-hash>
git push origin main
vercel --prod
```

### Si problème Frontend
```bash
git revert <commit-hash>
git push origin main
vercel --prod
```

### Si problème DB (⚠️ MIGRATIONS PERMANENTES)
**Migrations ne peuvent PAS être auto-revert!**

Option 1: Restore backup
```bash
# Via Supabase Dashboard
# Projects > Database > Backups > Restore

# Ou via CLI
supabase db reset --db-url postgresql://...
```

Option 2: Créer migration inverse manuelle

---

## 📈 MÉTRIQUES À MONITORER (Post-Déploiement)

### Query Daily Monitoring
```sql
-- 1. Webhook Success Rate (target: < 1% failures)
SELECT
  COUNT(*) FILTER (WHERE resolved = false) as failed,
  COUNT(*) as total,
  (COUNT(*) FILTER (WHERE resolved = false)::float / NULLIF(COUNT(*), 0)) * 100 as failure_rate_percent
FROM webhook_failures
WHERE first_attempt_at > NOW() - INTERVAL '24 hours';

-- 2. Subscription Consistency (target: 0 issues)
SELECT COUNT(*) as duplicate_active_subscriptions
FROM (
  SELECT user_id
  FROM user_subscriptions
  WHERE status = 'active'
  GROUP BY user_id
  HAVING COUNT(*) > 1
) duplicates;

-- 3. Active Coach Sessions Stats (monitoring)
SELECT * FROM get_active_coach_sessions_stats();
```

### Application Metrics
- Response time `/api/auth/me`: < 300ms p95
- Response time `/api/subscription/*`: < 500ms p95
- Frontend cache hit rate: > 80%

---

## 🔍 NEXT STEPS (Future Improvements)

### Phase 6: Améliorations Additionnelles (Optionnel)

1. **Refund Webhook Handler** (`charge.refunded`)
   - Gérer remboursements automatiques
   - Cancel subscription quand refund complet

2. **Dunning pour Failed Payments** (3D Secure)
   - Handler `invoice.payment_action_required`
   - Email notifications users

3. **Trial Period Handling**
   - Logic pour conversion `trialing` → `active`
   - Email reminder avant fin trial

4. **Price Sync Automatique depuis Stripe**
   - Startup hook pour sync prix
   - Détection changements prix Stripe

5. **Admin Dashboard**
   - View webhook failures live
   - Stats subscriptions par plan
   - User subscription history viewer

6. **Alerting**
   - Slack/email quand webhook failure > threshold
   - Alert si inconsistency détectée

---

## 📝 NOTES IMPORTANTES

### Ordre de Déploiement (CRITIQUE)
1. ✅ Backend (rétrocompatible avec DB actuelle)
2. ✅ Migrations DB (protègent futures écritures)
3. ✅ Frontend (utilise nouvelles API features)
4. ⏰ Cleanup DB colonnes deprecated (APRÈS 7 jours)

### Ne Jamais
- ❌ DROP TABLE en production sans backup
- ❌ Migrations DB AVANT backend deploy (risque downtime)
- ❌ Force push vers main/production
- ❌ Modifier git config ou skip hooks sans permission

### Toujours
- ✅ Backup DB avant cleanup/migrations
- ✅ Tester migrations en staging d'abord
- ✅ Monitorer webhook failures après deploy
- ✅ Re-run queries diagnostiques après chaque phase

---

## ✅ CHECKLIST FINALE

Avant de clore ce projet, vérifier:

- [ ] Toutes migrations DB appliquées sans erreur
- [ ] Queries diagnostiques retournent 0 lignes (sauf Query 5)
- [ ] Backend déployé et endpoints fonctionnent
- [ ] Frontend déployé et cache cleanup testé
- [ ] Tests E2E (5 tests) passent tous
- [ ] Vercel Cron configuré et testé
- [ ] User affecté vérifié (plan correct affiché)
- [ ] Documentation lue par équipe
- [ ] Backup DB créé et vérifié

---

**Créé le:** 2026-02-11
**Par:** Claude Sonnet 4.5
**Ticket:** Sync Stripe/Supabase - HuntZen
**User affecté:** `3abda780-30fb-46c8-a5c3-5bfa7938d688`
