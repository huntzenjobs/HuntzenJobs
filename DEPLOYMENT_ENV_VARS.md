# Variables d'environnement pour le déploiement en production

## 🚨 PROBLÈME RÉSOLU : Redirection OAuth vers localhost

Ce document liste toutes les variables d'environnement critiques qui doivent être configurées en production pour éviter les redirections vers localhost.

---

## 📋 Backend (Railway)

### Variables critiques pour les redirections

```bash
# IMPORTANT: URL(s) du frontend déployé (utilisée pour OAuth et Stripe redirects)
# Vous pouvez configurer PLUSIEURS URLs séparées par des virgules
# La PREMIÈRE URL sera utilisée pour les redirections OAuth et Stripe

# Option 1: Une seule URL (production uniquement)
FRONTEND_URL=https://frontend-next-five-wine.vercel.app

# Option 2: Plusieurs URLs (recommandé - production, staging, test)
FRONTEND_URL=https://frontend-next-five-wine.vercel.app,https://frontend-next-8l84ey0nv-huntzen-jobs.vercel.app,https://frontend-next-d1urcu9z9-huntzen-jobs.vercel.app
```

**Comment ça fonctionne :**
- ✅ Toutes les URLs listées sont **ajoutées au CORS**
- ✅ Le regex `*.vercel.app` accepte **TOUTES les preview URLs** automatiquement
- ✅ La **première URL** est utilisée pour les **redirections** (OAuth, Stripe)

### Vérification de la configuration actuelle

1. **Aller sur Railway Dashboard** : https://railway.app/
2. **Sélectionner le service backend**
3. **Variables → Vérifier que `FRONTEND_URL` est définie**

### Autres variables backend importantes

```bash
# Supabase
SUPABASE_URL=https://ngiakfikbuyugqfqtfwp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Database
DATABASE_URL=postgresql://postgres.ngiakfikbuyugqfqtfwp:...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RECRUITER_CONTACT_PRICE_ID=price_...

# Email (Resend)
RESEND_API_KEY=re_...
FROM_EMAIL=contact@huntzen.app
ADMIN_EMAIL=admin@huntzen.app

# Redis (Upstash)
REDIS_URL=https://epic-oyster-36349.upstash.io
REDIS_TOKEN=AY39AA...
REDIS_LIMITER_URL=redis://default:...@epic-oyster-36349.upstash.io:6379

# LLM
GROQ_API_KEY=gsk_...

# Job Sources
ADZUNA_APP_ID=8a85730a
ADZUNA_API_KEY=957035f3ea...
SERPAPI_KEY=820e42ea52de...
RAPIDAPI_KEY=b904cfd753msh...
HUNTER_API_KEY=5df58e5ca31...

# Modal
MODAL_WEBHOOK_URL=https://huntzenproject--huntzen-cv-processor-process-cv-webhook.modal.run

# Security
JWT_SECRET=c6ea228859898e0b6dbf4d2425dae631fc7927dc09f18455af355490e09f5cf9
JWT_ALGORITHM=HS256
JWT_EXPIRATION_DAYS=7
SENTRY_DSN=https://c1d34b26441d4201008f8cd24bce3fe0@o4510781569105920.ingest.de.sentry.io/4510781571465296
```

---

## 📋 Frontend (Vercel)

### Variables d'environnement

Les variables suivantes sont déjà configurées dans `.env.production` et doivent être synchronisées sur Vercel :

```bash
# Backend API
NEXT_PUBLIC_API_URL=https://huntzenjobs-production.up.railway.app
NEXT_PUBLIC_BACKEND_URL=https://huntzenjobs-production.up.railway.app

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ngiakfikbuyugqfqtfwp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Security
JWT_SECRET=c6ea228859898e0b6dbf4d2425dae631fc7927dc09f18455af355490e09f5cf9
NEXT_PUBLIC_SENTRY_DSN=https://c1d34b26441d4201008f8cd24bce3fe0@o4510781569105920.ingest.de.sentry.io/4510781571465296

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://epic-oyster-36349.upstash.io
UPSTASH_REDIS_REST_TOKEN=AY39AAIncDI2OTRmMzE2ZDAxNjE0Y2RmYTIyMmZiYjdkNGFhMGQ1NHAyMzYzNDk

# Webhook Supabase
SUPABASE_WEBHOOK_SECRET=22c93b18d2cf89ec8b5edf5aca2321345e4249459b48fecb670ef06c901453b0

# Feature Flags
NEXT_PUBLIC_FF_JOBS_V2=true
```

### Vérification de la configuration Vercel

1. **Aller sur Vercel Dashboard** : https://vercel.com/
2. **Sélectionner le projet**
3. **Settings → Environment Variables**
4. **Vérifier que toutes les variables ci-dessus sont définies**

---

## 🔧 Configuration Supabase OAuth

### Redirect URLs autorisées

Pour que l'OAuth fonctionne correctement, il faut configurer les URLs de redirection dans Supabase :

1. **Aller sur Supabase Dashboard** : https://supabase.com/dashboard/project/ngiakfikbuyugqfqtfwp
2. **Authentication → URL Configuration**
3. **Ajouter ces URLs dans "Redirect URLs"** :
   - `https://huntzen.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (pour le dev local)

### Site URL

Configurer le **Site URL** dans Supabase :
- Production : `https://huntzen.vercel.app`

---

## ✅ Checklist de déploiement

- [ ] Backend Railway : `FRONTEND_URL` définie avec l'URL Vercel
- [ ] Frontend Vercel : toutes les variables d'environnement synchronisées depuis `.env.production`
- [ ] Supabase : Redirect URLs configurées pour production
- [ ] Supabase : Site URL configurée
- [ ] Test OAuth : connexion Google redirige vers la bonne URL
- [ ] Test Stripe : redirection après paiement fonctionne correctement

---

## 🐛 Debugging

Si vous voyez encore des redirections vers `localhost:3000`, vérifiez :

1. **Backend Railway** : la variable `FRONTEND_URL` est bien définie
2. **Rebuild du backend** : après avoir modifié une variable d'env, redémarrez le service
3. **Clear cache** : videz le cache de votre navigateur
4. **Supabase Redirect URLs** : vérifiez qu'elles sont bien configurées
5. **Logs Railway** : vérifiez les logs pour voir quelle URL est utilisée

```bash
# Dans les logs Railway, vous devriez voir :
# CORS allowed origins: [..., 'https://huntzen.vercel.app']
```

---

## 📝 Notes

- Les fichiers `.env` locaux sont configurés avec localhost pour le développement
- Les variables d'environnement en production **surchargent** les valeurs par défaut
- Toujours tester après un déploiement pour vérifier les redirections
