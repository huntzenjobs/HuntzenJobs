# ✅ Production Domain Setup Checklist

**Nouveau domaine** : `huntzenjobs.com` (avec www)
**Ancien domaine** : `frontend-next-4zu60jeya-huntzen-jobs.vercel.app`

---

## 🔴 URGENT - À Faire MAINTENANT

### 1. Railway - CORS Configuration ⚠️ **BLOQUE TOUT**

**Status** : ❌ **À FAIRE**

**Action** :
1. Aller sur Railway Dashboard → HuntzenJobs → backend → Variables
2. Modifier `CORS_ORIGINS` :
```
https://www.huntzenjobs.com,https://huntzenjobs.com,https://frontend-next-4zu60jeya-huntzen-jobs.vercel.app,http://localhost:3001
```
3. Sauvegarder (redémarrage auto)

**Référence** : Voir `RAILWAY_FIX_CORS.md`

---

### 2. Supabase - Auth Redirect URLs

**Status** : ❌ **À FAIRE**

**Action** :
1. Supabase Dashboard → HuntZen Project → Authentication → URL Configuration
2. **Ajouter Redirect URLs** :
```
https://www.huntzenjobs.com/auth/callback
https://huntzenjobs.com/auth/callback
https://www.huntzenjobs.com/*
https://huntzenjobs.com/*
```
3. **Site URL** : `https://www.huntzenjobs.com`

---

### 3. Stripe - Webhook Endpoint

**Status** : ⚠️ **À VÉRIFIER**

**Action** :
1. Stripe Dashboard → Developers → Webhooks
2. Vérifier que le webhook endpoint existe :
```
https://huntzenjobs-production.up.railway.app/api/stripe/webhook
```
3. **Events à écouter** :
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

**Si webhook manquant** :
- Créer nouveau webhook
- Copier le `Signing Secret`
- Ajouter `STRIPE_WEBHOOK_SECRET` dans Railway

---

### 4. Vercel - Environment Variables

**Status** : ⚠️ **À VÉRIFIER**

**Action** :
1. Vercel Dashboard → HuntzenJobs → Settings → Environment Variables
2. Vérifier que `NEXT_PUBLIC_API_URL` pointe vers Railway :
```
NEXT_PUBLIC_API_URL=https://huntzenjobs-production.up.railway.app
```
3. Vérifier `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### 5. DNS Configuration

**Status** : ✅ **PROBABLEMENT OK** (si site accessible)

**À vérifier** :
```bash
dig www.huntzenjobs.com
dig huntzenjobs.com
```

**Records attendus** :
- `www.huntzenjobs.com` → CNAME vers Vercel (`cname.vercel-dns.com`)
- `huntzenjobs.com` → A record vers Vercel (76.76.21.21)

---

## 🧪 Tests Post-Configuration

### Test 1 : CORS Fonctionne

```bash
curl -X OPTIONS https://huntzenjobs-production.up.railway.app/api/auth/me \
  -H "Origin: https://www.huntzenjobs.com" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1 | grep "access-control-allow-origin"
```

**Attendu** : `< access-control-allow-origin: https://www.huntzenjobs.com`

---

### Test 2 : Frontend Login

1. Aller sur https://www.huntzenjobs.com
2. Cliquer "Se connecter"
3. Entrer email/password
4. ✅ Devrait se connecter sans erreur

**Console Browser** : Pas d'erreurs CORS

---

### Test 3 : API Calls

Ouvrir DevTools Console sur https://www.huntzenjobs.com :

```javascript
// Test 1: Auth
fetch('https://huntzenjobs-production.up.railway.app/api/auth/me', {
  credentials: 'include'
}).then(r => r.json()).then(console.log)

// Test 2: Countries
fetch('https://huntzenjobs-production.up.railway.app/api/countries')
  .then(r => r.json()).then(console.log)
```

**Attendu** : Réponses JSON, pas d'erreur CORS

---

### Test 4 : Stripe Checkout

1. Aller sur /pricing
2. Sélectionner un plan
3. Cliquer "S'abonner"
4. ✅ Redirection vers Stripe Checkout
5. Payer avec carte test : `4242 4242 4242 4242`
6. ✅ Retour sur site avec plan activé

---

### Test 5 : Webhook Stripe

Après paiement test :

1. Railway logs : `railway logs --service backend | grep STRIPE`
2. ✅ Voir : "Received Stripe webhook: checkout.session.completed"
3. ✅ Voir : "Subscription created for user..."

Stripe Dashboard :
1. Webhooks → Voir dernier event
2. ✅ Status 200 (success)

---

## 🔍 Troubleshooting

### Erreur : "Preflight response 400"

**Cause** : CORS_ORIGINS pas configuré dans Railway
**Fix** : Voir étape 1 ci-dessus

---

### Erreur : "Session expirée"

**Cause** : Supabase redirect URLs manquants
**Fix** : Voir étape 2 ci-dessus

---

### Erreur : "Failed to create checkout session"

**Causes possibles** :
1. CORS (voir étape 1)
2. Stripe webhook secret manquant (voir étape 3)
3. Backend crashé (vérifier Railway logs)

---

### Frontend charge mais API calls échouent

**Diagnostic** :
1. Ouvrir DevTools → Network
2. Chercher requêtes vers `huntzenjobs-production.up.railway.app`
3. Si **CORS error** : Fix étape 1
4. Si **404** : Backend route manquante
5. Si **500** : Backend error, check Railway logs

---

## 📊 Status Summary

| Service | Configuration | Status | Priority |
|---------|--------------|--------|----------|
| Railway CORS | `CORS_ORIGINS` | ❌ À FAIRE | 🔴 URGENT |
| Supabase Auth | Redirect URLs | ❌ À FAIRE | 🔴 URGENT |
| Stripe Webhook | Endpoint URL | ⚠️ À VÉRIFIER | 🟡 IMPORTANT |
| Vercel Env | API URLs | ⚠️ À VÉRIFIER | 🟡 IMPORTANT |
| DNS | A/CNAME records | ✅ OK | 🟢 OK |

---

## ⏱️ Estimated Time

- Railway config : 2 min
- Supabase config : 3 min
- Stripe verification : 5 min
- Testing : 10 min

**Total** : ~20 min pour tout configurer

---

## 🎯 Success Criteria

**Production ready quand** :
- [x] Domain accessible (huntzenjobs.com)
- [ ] CORS fonctionne (pas d'erreurs preflight)
- [ ] Login/signup fonctionne
- [ ] API calls réussissent
- [ ] Stripe checkout fonctionne
- [ ] Webhooks Stripe marchent
- [ ] Aucune erreur console

---

**COMMENCE PAR RAILWAY CORS - C'EST LE BLOQUEUR #1 !**
