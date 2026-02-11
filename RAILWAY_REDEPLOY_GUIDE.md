# Comment Forcer le Redéploiement Railway

## ⚠️ URGENT: Railway Backend Obsolète

**Actuellement:** `df2ef1f` (vieux de plusieurs jours)
**Devrait être:** `0b87ba6` ou plus récent

Railway n'a **pas** auto-déployé après le push vers `Production`.

## Solution Rapide: Forcer Redeploy via Dashboard

### Option 1: Redeploy Manuel (Recommandé)

1. Allez sur [Railway Dashboard](https://railway.app/)
2. Sélectionnez votre projet "HuntZen"
3. Cliquez sur le service "backend"
4. Allez dans l'onglet **"Deployments"**
5. Trouvez le dernier déploiement en haut de la liste
6. Cliquez sur les 3 points **"⋮"** à droite
7. Sélectionnez **"Redeploy"**
8. Attendez 2-3 minutes

### Option 2: Nouveau Déploiement

1. Sur la page Deployments
2. Cliquez sur **"Deploy"** en haut à droite
3. Railway va créer un nouveau déploiement depuis la branche Production
4. Attendez 2-3 minutes

### Option 3: Via Railway CLI (si configuré)

```bash
# Lier le projet (interactif)
railway link

# Déployer
railway up -d
```

## Vérification du Redéploiement

Une fois le redéploiement lancé, vérifiez toutes les 30 secondes:

```bash
curl -s https://huntzenjobs-production.up.railway.app/api/auth/test-debug | python3 -m json.tool
```

**Attendu:**
```json
{
  "commit": "0b87ba6"  // ou plus récent
}
```

## Activer Auto-Deploy (Éviter ce problème à l'avenir)

1. Railway Dashboard → Projet HuntZen → Service backend
2. Allez dans **"Settings"**
3. Section **"Deploy"**
4. **Source**: Vérifiez que c'est bien `huntzenjobs/HuntzenJobs`
5. **Branch**: Vérifiez que c'est bien `Production`
6. **Auto Deploy**: ✅ Activez si désactivé
7. **Watch Paths**: Laissez vide (ou ajoutez `backend/**` pour ne déployer que les changements backend)

## Pourquoi Railway N'a Pas Auto-Déployé?

Causes possibles:
1. ❌ Auto-deploy désactivé dans les settings
2. ❌ Railway surveille la mauvaise branche
3. ❌ Webhook GitHub → Railway cassé ou expiré
4. ❌ Build en échec (vérifier logs)

## Commits Manquants sur Railway

Railway doit déployer ces 6 commits critiques:

```
0b87ba6 - chore: Trigger Railway redeploy (diagnostic tools)
1fdd74b - fix(cors): Parse CORS_ORIGINS from comma-separated env var
7f92c75 - fix(stripe): Add metadata validation in webhook handler
a06b92a - fix(stripe): Redirect to polling page
7904e65 - fix: Implement centralized token refresh service
784b634 - fix(auth): Improve sign-out error handling
```

## Après le Redéploiement

1. **Vérifier la version déployée**
   ```bash
   curl https://huntzenjobs-production.up.railway.app/api/auth/test-debug
   ```

2. **Tester l'authentification**
   - Aller sur https://huntzenjobs.vercel.app
   - Logout complet
   - Login à nouveau
   - Vérifier qu'il n'y a plus d'erreur "Session expirée"

3. **Tester le flux complet**
   - ✅ Login → Devrait fonctionner
   - ✅ Voir plan d'abonnement → Devrait afficher le bon plan
   - ✅ Upgrade/Downgrade → Devrait rediriger vers Stripe
   - ✅ Webhook Stripe → Devrait mettre à jour l'abonnement

## Variables d'Environnement à Vérifier

Pendant que vous êtes sur Railway Dashboard, vérifiez ces variables:

```env
SUPABASE_URL=https://ngiakfikbuyugqfqtfwp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CORS_ORIGINS=https://frontend-next-five-wine.vercel.app,https://huntzenjobs.vercel.app
FRONTEND_URL=https://huntzenjobs.vercel.app
```

Si `CORS_ORIGINS` n'existe pas, ajoutez-la (multi-domain support).

## Logs de Déploiement

Pour vérifier si le build passe:

1. Railway Dashboard → Service backend → Deployments
2. Cliquez sur le déploiement en cours
3. Regardez les logs en temps réel
4. Cherchez les erreurs (en rouge)

Erreurs communes:
- ❌ `requirements.txt` - Dépendances Python manquantes
- ❌ `railway.json` - Configuration invalide
- ❌ Build timeout (> 10 min)
