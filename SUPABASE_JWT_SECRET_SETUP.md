# Configuration Supabase JWT Secret

## ⚠️ ACTION REQUISE

Le backend doit utiliser le **JWT Secret de Supabase** pour vérifier les tokens d'authentification.

## 📍 Où trouver le JWT Secret

1. **Aller sur Supabase Dashboard:**
   ```
   https://supabase.com/dashboard/project/ngiakfikbuyugqfqtfwp/settings/api
   ```

2. **Trouver la section "JWT Settings"**
   - Défiler jusqu'à "JWT Settings"
   - Copier la valeur de **"JWT Secret"**

3. **Ajouter au fichier `.env`**
   ```bash
   # Dans /Users/wissem/HuntzenIA/huntzen_jobsearch/.env
   # Ajouter cette ligne:
   SUPABASE_JWT_SECRET=votre-secret-ici
   ```

## 🔧 Configuration Rapide (CLI)

```bash
# 1. Ouvrir le fichier .env
nano .env

# 2. Ajouter cette ligne (remplacer par le vrai secret):
SUPABASE_JWT_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 3. Sauvegarder (Ctrl+O puis Ctrl+X)

# 4. Redémarrer le backend
python main.py
```

## ✅ Vérification

Une fois configuré, tester:

```bash
# Dans le browser DevTools (F12) > Console
const supabase = window.supabase || createClient(...)
const { data: { session } } = await supabase.auth.getSession()
console.log('Token:', session?.access_token)

# Copier le token et tester l'API:
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer VOTRE_TOKEN_ICI"
```

**Résultat attendu:**
```json
{
  "success": true,
  "user": {...},
  "subscription": {...},
  "quotas": {...}
}
```

## 🚨 Erreur commune

**Si vous voyez:**
```json
{
  "detail": "Invalid authentication token."
}
```

**C'est que:**
- Le JWT_SECRET dans le backend ne correspond pas au secret Supabase
- Le token est expiré
- Le token n'a pas été envoyé correctement

## 📝 Note Technique

**Différence entre les secrets:**

| Variable | Usage |
|----------|-------|
| `JWT_SECRET` | Secret custom (ne pas utiliser pour Supabase!) |
| `SUPABASE_JWT_SECRET` | ✅ Secret Supabase pour vérifier les tokens Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service (admin API, pas pour JWT verification) |

Le code dans `main.py` utilise maintenant:
```python
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET") or os.getenv("JWT_SECRET", "")
```

Donc il essaiera d'abord `SUPABASE_JWT_SECRET`, puis tombera sur `JWT_SECRET` si non trouvé (pour rétrocompatibilité).

---

**Une fois configuré, l'upload de CV devrait fonctionner! 🚀**
