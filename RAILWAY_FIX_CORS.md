# 🚨 FIX URGENT - CORS Configuration Railway

**Date**: 2026-02-11
**Problème**: Backend ne retourne pas `Access-Control-Allow-Origin` header
**Impact**: Frontend huntzenjobs.com ne peut pas appeler l'API

---

## ❌ Problème Diagnostiqué

Test effectué :
```bash
curl -X OPTIONS https://huntzenjobs-production.up.railway.app/api/auth/me \
  -H "Origin: https://www.huntzenjobs.com" \
  -H "Access-Control-Request-Method: GET"
```

**Résultat actuel** :
```
HTTP/2 400
access-control-allow-credentials: true
access-control-allow-headers: ...
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
# ❌ MANQUANT: access-control-allow-origin: https://www.huntzenjobs.com
```

**Cause** :
La variable d'environnement `CORS_ORIGINS` dans Railway ne contient pas le nouveau domaine `huntzenjobs.com`.

---

## ✅ Solution - Mettre à Jour Railway

### Étape 1 : Aller sur Railway Dashboard

1. Va sur https://railway.app
2. Sélectionne le projet **HuntzenJobs**
3. Sélectionne le service **backend** (Production)
4. Va dans l'onglet **Variables**

### Étape 2 : Modifier CORS_ORIGINS

**Cherche la variable `CORS_ORIGINS`** et mets cette valeur :

```
https://www.huntzenjobs.com,https://huntzenjobs.com,https://frontend-next-4zu60jeya-huntzen-jobs.vercel.app,http://localhost:3001
```

**Explications** :
- `https://www.huntzenjobs.com` - Domaine principal avec www
- `https://huntzenjobs.com` - Domaine sans www (redirect)
- `https://frontend-next-4zu60jeya-huntzen-jobs.vercel.app` - Preview Vercel (pour tests)
- `http://localhost:3001` - Développement local

### Étape 3 : Redémarrer le Service

Railway va automatiquement **redémarrer** le backend après la modification. Attends ~1-2 min.

---

## 🧪 Vérification

Après le redémarrage Railway, teste :

```bash
curl -X OPTIONS https://huntzenjobs-production.up.railway.app/api/auth/me \
  -H "Origin: https://www.huntzenjobs.com" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1 | grep "access-control-allow-origin"
```

**Résultat attendu** :
```
< access-control-allow-origin: https://www.huntzenjobs.com
```

---

## 🔄 Aussi à Faire : Supabase

### Redirect URLs à Ajouter

1. Va sur https://supabase.com/dashboard
2. Sélectionne le projet HuntZen
3. Va dans **Authentication → URL Configuration**
4. Ajoute ces **Redirect URLs** :

```
https://www.huntzenjobs.com/auth/callback
https://huntzenjobs.com/auth/callback
https://www.huntzenjobs.com/*
https://huntzenjobs.com/*
```

5. **Site URL** : `https://www.huntzenjobs.com`

---

## 📝 Variables d'Environnement Railway (Référence Complète)

Si tu dois recréer la config :

```bash
# CORS (URGENT - FIX PRODUCTION)
CORS_ORIGINS=https://www.huntzenjobs.com,https://huntzenjobs.com,https://frontend-next-4zu60jeya-huntzen-jobs.vercel.app,http://localhost:3001

# Frontend URL
FRONTEND_URL=https://www.huntzenjobs.com

# Supabase (pas de changement)
SUPABASE_URL=https://fiksdukygkqffvbqikkt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<existing-key>

# Stripe (vérifier webhook URL)
STRIPE_SECRET_KEY=<existing-key>
STRIPE_WEBHOOK_SECRET=<existing-secret>

# LLMs (pas de changement)
GROQ_API_KEY=<existing-key>

# Redis (pas de changement si configuré)
REDIS_URL=<existing-url>
REDIS_TOKEN=<existing-token>
```

---

## ⏱️ Timeline

1. **Maintenant** : Update `CORS_ORIGINS` dans Railway ← **URGENT**
2. **Maintenant** : Update Redirect URLs dans Supabase
3. **Attendre 2 min** : Railway redéploie automatiquement
4. **Tester** : Aller sur https://www.huntzenjobs.com et login

---

## 🚀 Après le Fix

**Frontend devrait fonctionner** :
- ✅ Login/Signup
- ✅ Fetch subscription data
- ✅ Create checkout session (payment)
- ✅ All API calls

**Si ça ne marche toujours pas** :
- Vérifier les logs Railway : `railway logs --service backend`
- Clear cache browser (Cmd+Shift+R)
- Tester en navigation privée

---

**PRIORITÉ ABSOLUE : METTRE À JOUR CORS_ORIGINS DANS RAILWAY !**
