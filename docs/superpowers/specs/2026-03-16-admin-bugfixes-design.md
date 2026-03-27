# Design — Corrections admin centre de contrôle

**Date :** 2026-03-16
**Branche :** `feature/admin-realtime-tracking`
**Périmètre :** 6 corrections identifiées lors de l'audit des phases A–D

---

## Contexte

L'audit post-implémentation des phases A–D du centre de contrôle admin HuntZen a révélé 6 problèmes : 2 risques silencieux (backend), 1 fonctionnalité factice (backend), 2 comportements incorrects (frontend hooks), et 1 UI manquante. Tous sont corrigés en une session, du plus risqué au plus visible, via 3 phases séquentielles avec vérification syntaxe entre chaque.

---

## Approche retenue : Wave séquentielle stricte

Chaque phase est indépendante et se termine par `ast.parse()` (Python) ou `tsc --noEmit` (TypeScript) avant de passer à la suivante. `admin.py` est touché par 2 corrections dans la même phase pour éviter tout conflit d'éditions.

---

## Phase 1 — Backend (risques silencieux + fonctionnel cassé)

### Fix 1 — `admin_alerts.py` : throttle sans Redis

**Problème :** Si Redis est indisponible, le throttle est ignoré et les emails admin sont envoyés sans limitation. Risque de spam en cascade lors d'une panne Redis.

**Solution :** Ajouter une variable globale `_last_sent_fallback: dict[str, float]` pour le throttle en mémoire quand Redis est absent. TTL identique (3600s).

**Fichier :** `backend/src/services/admin_alerts.py`

**Changement :**
```python
_last_sent_fallback: dict[str, float] = {}

# Dans send_admin_alert(), si redis is None :
now = time.time()
if _last_sent_fallback.get(alert_key, 0) + 3600 > now:
    return  # throttle in-memory
_last_sent_fallback[alert_key] = now
```

---

### Fix 2 — `admin.py` `retry-job` : ré-enqueue ARQ réel

**Problème :** `POST /users/{id}/retry-job` loggue uniquement l'intention sans ré-enqueuer le job ARQ. Le bouton UI laisse croire que le retry fonctionne.

**Solution :** Accepter `function_name` + `kwargs` explicitement dans le body (on ne peut pas se fier à `user_events.properties` qui ne stocke pas forcément `arq_job_id`). Restreindre aux 4 fonctions enregistrées dans `WorkerSettings`. Utiliser `_get_redis_settings()` depuis `src.workers.settings` (ARQ attend `RedisSettings`, pas une URL string). Le keyword ARQ pour l'identifiant est `_job_id` (avec underscore).

**Fichier :** `backend/src/api/routes/admin.py`

**Endpoint :** `POST /users/{user_id}/retry-job`

**Body attendu :**
```json
{
  "function_name": "coach_task",
  "kwargs": { "message": "...", "session_id": "...", "language": "fr" }
}
```

**Fonctions valides :** `coach_task`, `assistant_task`, `cv_adapt_task`, `cover_letter_task`

**Comportement :**
1. Valider que `function_name` est dans la liste des 4 fonctions enregistrées → HTTP 422 sinon
2. `from src.workers.settings import _get_redis_settings`
3. `from arq.connections import create_pool`
4. `pool = await create_pool(_get_redis_settings())`
5. `job = await pool.enqueue_job(function_name, _job_id=str(uuid4()), **kwargs)`
6. `await pool.close()`
7. Logger l'action + retourner `{ "job_id": job.job_id }`

**Fallback :** Si Redis indisponible → HTTP 503 explicite

---

### Fix 3 — `admin.py` ban-ip : persistance DB

**Problème :** Les IPs bannies sont uniquement en Redis (TTL 30j). Si Redis est vidé, tous les bannissements sont perdus silencieusement.

**Solution :** Lors d'un `POST /ban-ip`, insérer aussi dans `security_events` via `log_security_event` RPC avec `event_type = "ip_banned"` et les métadonnées en `event_data`. Le `GET /banned-ips` reste basé sur Redis (source de vérité opérationnelle) — la DB sert de trace d'audit uniquement.

**Note :** La décision délibérée est de ne pas rebuilder depuis la DB au démarrage — cela alourdirait la startup et la DB n'est pas le bon endroit pour stocker l'état opérationnel d'un pare-feu. Le compromis : trace d'audit durable en DB, blocage actif en Redis.

**Fichier :** `backend/src/api/routes/admin.py` (endpoint `ban_ip` existant)

---

### Vérification Phase 1

```bash
python3 -c "import ast; ast.parse(open('backend/src/services/admin_alerts.py').read()); print('OK')"
python3 -c "import ast; ast.parse(open('backend/src/api/routes/admin.py').read()); print('OK')"
```

---

## Phase 2 — Frontend hooks (comportements silencieux)

### Fix 4 — `use-admin-live.ts` : retry SSE automatique

**Problème :** Si la connexion SSE tombe, le hook reste `connected: false` sans tenter de se reconnecter. La page `/admin/live` se fige.

**Solution :** Backoff exponentiel avec `useRef` pour le timer. Délais : 1s → 2s → 4s → 8s → 16s → 30s (plafond). Reset du compteur à chaque connexion réussie.

**Fichier :** `frontend-next/src/hooks/admin/use-admin-live.ts`

**Implémentation :**

Le token Supabase est re-fetché à chaque tentative de connexion (pas capturé dans une closure) pour éviter d'utiliser un token expiré lors d'un retry tardif.

```typescript
const retryCount = useRef(0);
const retryTimer = useRef<NodeJS.Timeout>();
const destroyed = useRef(false);

const connect = useCallback(async () => {
  // Re-fetch token à chaque tentative (pas de closure sur token périmé)
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token || destroyed.current) return;

  const es = new EventSource(`${BACKEND_URL}/api/presence/admin/live?token=${token}`);
  es.onmessage = (e) => { retryCount.current = 0; /* parse + setPresence */ };
  es.onerror = () => {
    setConnected(false);
    es.close();
    if (destroyed.current) return;
    const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
    retryCount.current++;
    retryTimer.current = setTimeout(connect, delay);
  };
}, []);

useEffect(() => {
  destroyed.current = false;
  connect();
  return () => {
    destroyed.current = true;
    clearTimeout(retryTimer.current);
  };
}, [connect]);
```

Note : `destroyed.current` évite les retries après démontage du composant.

---

### Fix 5 — `live/page.tsx` : état maintenance au chargement

**Problème :** Le bouton maintenance affiche toujours "Activer" au rechargement, même si la maintenance est déjà active.

**Solution :** Dans le `useEffect` initial de la page, appeler `GET /api/admin/maintenance` et initialiser `useState` avec le résultat.

**Fichier :** `frontend-next/src/app/admin/live/page.tsx`

**Endpoint existant :** `GET /api/admin/maintenance` — retourne `{ active: bool }`

**Implémentation :**
```typescript
useEffect(() => {
  adminFetch("/api/admin/maintenance")
    .then((d) => setMaintenance(d.active ?? false))
    .catch(() => {}); // fail silently — état local conservé
}, []);
```

---

### Vérification Phase 2

```bash
cd frontend-next && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "use-admin-live|live/page" | head -10
```

---

## Phase 3 — UI (fonctionnalité manquante)

### Fix 6 — `user-actions-menu.tsx` : dialog set-custom-limits

**Problème :** `POST /users/{id}/set-custom-limits` est implémenté backend mais aucune UI ne l'expose.

**Solution :** Ajouter un item "Limites personnalisées" dans le `DropdownMenu` existant, qui ouvre un `Dialog` inline avec 3 champs numériques :

| Champ | Label | Placeholder |
|---|---|---|
| `cv_analyses_daily` | Analyses CV / jour | Plan par défaut |
| `coach_seconds_daily` | Secondes coach / jour | Plan par défaut |
| `job_searches_daily` | Recherches emploi / jour | Plan par défaut |

Champs optionnels — si laissé vide, le champ n'est pas envoyé (pas de reset involontaire). Valeur `null` = utiliser la limite du plan.

**Fichier :** `frontend-next/src/components/admin/users/user-actions-menu.tsx`

**Pattern suivi :** Identique à `GrantDaysDialog` et `ChangeEmailDialog` déjà présents dans le même fichier.

---

### Vérification Phase 3

```bash
cd frontend-next && npx tsc --noEmit --skipLibCheck 2>&1 | grep "user-actions-menu" | head -10
```

---

## Récapitulatif

| # | Fix | Fichier(s) | Phase |
|---|---|---|---|
| 1 | Throttle emails sans Redis | `admin_alerts.py` | 1 |
| 2 | retry-job ARQ réel | `admin.py` | 1 |
| 3 | Ban IP persistance audit DB | `admin.py` | 1 |
| 4 | Retry SSE automatique | `use-admin-live.ts` | 2 |
| 5 | Maintenance state au montage | `live/page.tsx` | 2 |
| 6 | UI set-custom-limits | `user-actions-menu.tsx` | 3 |

---

## Contraintes techniques rappelées

- Railway utilise `pyproject.toml` (pas `requirements.txt`)
- Redis via `from src.utils.cache import get_redis` (async)
- ARQ disponible dans le projet (utilisé dans `workers/tasks.py`)
- `AdminUserDep` sans `= None` par défaut
- Sentry : `new_scope()` pas `push_scope()`
- Pas de `Co-Authored-By` dans les commits
- Ne pas committer `docs/plans/` (local uniquement)
