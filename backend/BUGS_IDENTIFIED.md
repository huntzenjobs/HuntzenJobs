# Bugs Identifiés - Webhooks Stripe

**Date:** 2026-02-11
**Fichier:** `/Users/wissem/HuntzenIA/huntzen_jobsearch/backend/src/services/stripe.py`

---

## 🔴 BUG #1: KeyError 'current_period_start' dans checkout.session.completed

### Description
Le webhook handler `handle_checkout_completed()` tente d'accéder `stripe_subscription["current_period_start"]` sur un objet Subscription qui peut ne pas avoir ces champs.

### Root Cause
```python
# Line 566-570
stripe_subscription = stripe.Subscription.retrieve(stripe_subscription_id)
...
period_start = stripe_subscription.get("current_period_start")
period_end = stripe_subscription.get("current_period_end")
```

**Problème:** Si la subscription n'est pas encore fully provisioned par Stripe, ou si `stripe_subscription_id` est None, alors:
1. `stripe.Subscription.retrieve(None)` échoue
2. Ou la subscription retournée n'a pas encore les champs `current_period_start`/`current_period_end`

### Occurrences
- **2 failures** détectées dans `webhook_failures` table
- Event IDs:
  - `evt_1SzaZZF7q8KRoF9a26QO6AZB` (2026-02-11 10:23)
  - `evt_1SzaADF7q8KRoF9aiqkLzxfP` (2026-02-11 09:56)

### Stacktrace
```
File "/app/src/services/stripe.py", line 570, in handle_checkout_completed
  stripe_subscription["current_period_start"],
KeyError: 'current_period_start'
```

### Fix Recommandé

#### Option A: Vérifier existence des champs (SAFE)
```python
# Line 566-589
if stripe_subscription_id:
    stripe_subscription = stripe.Subscription.retrieve(stripe_subscription_id)

    # Vérifier que les champs existent
    period_start = stripe_subscription.get("current_period_start")
    period_end = stripe_subscription.get("current_period_end")

    if not period_start or not period_end:
        # Subscription pas encore fully provisioned
        # Attendre le webhook customer.subscription.created
        logger.warning(
            f"Subscription {stripe_subscription_id} not fully provisioned yet. "
            f"Skipping checkout handler, will process in subscription.created webhook."
        )
        return  # Exit gracefully, let subscription.created handle it

    current_period_start = datetime.fromtimestamp(period_start, tz=timezone.utc)
    current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)
else:
    # Pas de subscription_id dans le checkout (one-time payment?)
    logger.error(f"No subscription_id in checkout session {session.get('id')}")
    raise HTTPException(
        status_code=400,
        detail="Checkout session missing subscription_id"
    )
```

#### Option B: Utiliser customer.subscription.created au lieu de checkout.session.completed
Le webhook `customer.subscription.created` est le meilleur moment pour créer la subscription en DB car à ce stade, Stripe garantit que tous les champs sont présents.

**Workflow recommandé:**
1. `checkout.session.completed` → Créer une entrée provisoire ou ne rien faire
2. `customer.subscription.created` → Créer/update la subscription avec toutes les données
3. `invoice.payment_succeeded` → Confirmer le paiement

### Impact
- **Sévérité:** HAUTE
- **Fréquence:** 2 occurrences sur 7 checkout.session.completed (28%)
- **User impact:** Subscription pas créée en DB, user reste sur plan free

---

## 🔴 BUG #2: Missing user_id in checkout session metadata

### Description
Le webhook handler `handle_checkout_completed()` raise une HTTPException 400 si `user_id` manque dans les metadata du checkout session.

### Root Cause
```python
# Line 524-529
user_id = metadata.get("user_id")

if not user_id:
    logger.error(f"Missing user_id in checkout session metadata. Session ID: {session.get('id')}")
    raise HTTPException(status_code=400, detail="Missing user_id in session metadata")
```

**Problème:** Le code frontend ou backend qui crée le checkout session n'a pas inclus `user_id` dans les metadata.

### Occurrences
- **1 failure** détectée
- Event ID: `evt_1SzSCbF7q8KRoF9ayyXw3csh` (2026-02-11 01:26)

### Stacktrace
```
File "/app/src/services/stripe.py", line 529, in handle_checkout_completed
  raise HTTPException(status_code=400, detail="Missing user_id in session metadata")
fastapi.exceptions.HTTPException: 400: Missing user_id in session metadata
```

### Fix Recommandé

#### 1. Backend: Vérifier création checkout session
Fichier probable: `backend/src/services/subscription_service.py` ou `backend/src/api/routes/subscription.py`

Chercher tous les appels à `stripe.checkout.Session.create()` et s'assurer que:
```python
stripe.checkout.Session.create(
    # ...
    metadata={
        "user_id": user.id,  # ✅ OBLIGATOIRE
        "plan_name": plan_name,
        # ...
    }
)
```

#### 2. Frontend: Vérifier appels API
Chercher dans `frontend-client/src` les appels qui créent des checkout sessions:
- `/api/subscription/create-checkout-session`
- `/api/subscription/checkout`

S'assurer que le user est authentifié AVANT de créer le checkout.

### Impact
- **Sévérité:** HAUTE
- **Fréquence:** 1 occurrence (rare mais bloquant)
- **User impact:** Impossible de souscrire (paiement échoue)

---

## 📊 Statistiques Globales

### Webhook Events Processing
```
Total events: 25
Processed: 25/25 (100%)
Failed: 3 (12%)
```

### Distribution des Failures
```
checkout.session.completed:
  - KeyError 'current_period_start': 2
  - Missing user_id: 1
Total: 3
```

### Retry Status
```
Failure #1: retry_count=1, resolved=false
Failure #2: retry_count=2, resolved=false
Failure #3: retry_count=3, resolved=false
```

**⚠️ Aucune failure résolue automatiquement** → Pas de retry automatique implémenté

---

## 🔧 Actions Prioritaires

### 1. Fix BUG #1 (KeyError current_period_start)
- [ ] Modifier `handle_checkout_completed()` pour vérifier existence des champs
- [ ] OU migrer la logique vers `customer.subscription.created` webhook
- [ ] Ajouter tests unitaires pour subscription non-provisioned

### 2. Fix BUG #2 (Missing user_id)
- [ ] Auditer tous les `stripe.checkout.Session.create()` dans le backend
- [ ] S'assurer que `metadata.user_id` est TOUJOURS présent
- [ ] Ajouter validation TypeScript/Pydantic pour forcer user_id

### 3. Implémenter Retry Automatique
- [ ] Créer un cron job qui retry les webhook_failures non-resolved
- [ ] Stratégie: Exponential backoff (1h, 2h, 4h, 8h, 24h)
- [ ] Alerte après 5 retries échoués

### 4. Monitoring et Alerting
- [ ] Intégrer Sentry pour tracker webhook failures
- [ ] Email alert si failure_count > 5 pour un event_type
- [ ] Dashboard Grafana pour monitoring webhook health

---

## 📁 Fichiers à Modifier

### Backend
1. **`src/services/stripe.py`**
   - Ligne 566-589: Fix KeyError current_period_start
   - Ligne 524-529: Améliorer message d'erreur Missing user_id

2. **`src/services/subscription_service.py`** (ou équivalent)
   - Vérifier tous les `stripe.checkout.Session.create()`
   - Ajouter `metadata={"user_id": user.id}` partout

3. **`src/api/routes/subscription.py`**
   - Endpoint `/create-checkout-session`
   - Valider user_id AVANT de créer le checkout

### Frontend
4. **`frontend-client/src/services/subscriptionService.ts`**
   - Vérifier appels à l'API subscription
   - S'assurer que user est authentifié

### Database
5. **Nouvelle migration** (optionnelle)
```sql
-- Ajouter colonne pour tracking retry attempts
ALTER TABLE webhook_failures
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;

-- Index pour le cron job de retry
CREATE INDEX IF NOT EXISTS idx_webhook_failures_retry
  ON webhook_failures(resolved, next_retry_at)
  WHERE resolved = false;
```

---

## 🧪 Tests de Régression

### Scenario 1: Checkout session sans subscription_id
```python
async def test_checkout_without_subscription():
    session = {
        "id": "cs_test_123",
        "customer": "cus_123",
        "subscription": None,  # ❌ Missing
        "metadata": {"user_id": "user_123", "plan_name": "pro"}
    }

    with pytest.raises(HTTPException) as exc:
        await handle_checkout_completed(session)

    assert exc.value.status_code == 400
    assert "subscription_id" in exc.value.detail
```

### Scenario 2: Checkout session sans user_id
```python
async def test_checkout_without_user_id():
    session = {
        "id": "cs_test_123",
        "metadata": {"plan_name": "pro"}  # ❌ Missing user_id
    }

    with pytest.raises(HTTPException) as exc:
        await handle_checkout_completed(session)

    assert exc.value.status_code == 400
    assert "user_id" in exc.value.detail
```

### Scenario 3: Subscription non-provisioned
```python
async def test_subscription_not_provisioned():
    # Mock Stripe API to return subscription without periods
    mock_subscription = {
        "id": "sub_123",
        "status": "incomplete",
        # ❌ Missing current_period_start/end
    }

    # Should handle gracefully without KeyError
    result = await handle_checkout_completed(session)
    # Should return early or schedule retry
```

---

## 📞 Contact

Pour questions sur ce rapport:
- **Backend Lead:** Vérifier implementation webhooks
- **DevOps:** Configurer monitoring/alerting
- **QA:** Tester scenarios de régression

**Dernière mise à jour:** 2026-02-11
