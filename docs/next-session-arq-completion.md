# Prochaine session — Complétion ARQ HuntZen

## Contexte de la session précédente

On a implémenté un système de queue ARQ (async Redis queue Python) pour absorber les pics Groq (429 rate limit) sous forte charge. Deux couches de protection :

1. **Groq retry backoff** — déjà déployé et actif, retry 1s→2s→4s sur 429
2. **ARQ queue** — infrastructure créée, **MAIS** seulement `coach.py` enqueue dans ARQ. Il faut faire la même chose pour `assistant.py` et `cv_adapter.py`.

---

## Architecture en place (NE PAS MODIFIER)

```
Request → FastAPI endpoint
              ↓
         [Compteur Redis groq:active_coach]
         si active > 12 → enqueue ARQ → return {queued: true, job_id}
         si active ≤ 12 → traitement synchrone direct Groq
              ↓
         GET /api/queue/status/{job_id}  ← client poll pour récupérer résultat
              ↓
         ARQ Worker (service Railway séparé, à créer dans Railway Dashboard)
              → traite coach_task, assistant_task, cv_adapt_task, cover_letter_task
```

**Fichiers existants — LIRE AVANT TOUT :**

| Fichier | Rôle |
|---|---|
| `backend/src/workers/tasks.py` | 4 tasks ARQ déjà écrites |
| `backend/src/workers/settings.py` | WorkerSettings ARQ (Upstash SSL) |
| `backend/src/api/routes/coach.py` | **MODÈLE** — copier ce pattern pour assistant.py et cv_adapter.py |
| `backend/src/api/routes/queue.py` | Endpoint GET /api/queue/status/{job_id} |
| `backend/src/api/routes/assistant.py` | À modifier |
| `backend/src/api/routes/cv_adapter.py` | À modifier |
| `backend/src/utils/groq_retry.py` | Retry backoff (NE PAS TOUCHER) |
| `backend/src/agents/base.py` | Double protection retry (NE PAS TOUCHER) |
| `backend/Procfile.worker` | Commande Railway worker |

---

## Ce qu'il reste à faire (SEULEMENT ça, rien d'autre)

### Tâche 1 — Modifier `assistant.py` pour enqueue ARQ

Lire d'abord `backend/src/api/routes/coach.py` en entier pour comprendre le pattern exact.

Ensuite, dans `backend/src/api/routes/assistant.py`, repérer les endpoints qui appellent Groq :
- `POST /api/assistant/job-scout` → `job_scout_chat()`
- `POST /api/assistant/cv-analyzer` → `cv_analyzer_chat()`
- `POST /api/assistant/cv-adapter` → `cv_adapter_chat()`
- `POST /api/assistant/interview-sim` → `interview_sim_chat()`

Pour **chacun de ces endpoints**, appliquer le même pattern que `coach.py` :
- Si `active > ASSISTANT_SYNC_THRESHOLD` (12) → `pool.enqueue_job("assistant_task", ..., assistant_type="job-scout")` → return `{"queued": True, "job_id": ...}`
- Sinon → traitement synchrone existant (ne rien changer au code sync)
- Fallback si ARQ indisponible → traitement synchrone (jamais de perte)

**Le compteur Redis** doit utiliser une clé différente : `groq:active_assistant` (pas `groq:active_coach`).

### Tâche 2 — Modifier `cv_adapter.py` pour enqueue ARQ

Endpoints à modifier (ceux qui appellent Groq — les générateurs PDF purs n'en ont pas besoin) :
- `POST /api/cv-adapter/adapt` → `adapt_cv()`
- `POST /api/cv-adapter/generate-cover-letter/json` → `generate_cover_letter_json()`

Pattern identique : seuil 12, clé Redis `groq:active_cv_adapt`, enqueue `cv_adapt_task` ou `cover_letter_task`.

### Tâche 3 — Configurer le service Railway worker

**Ne pas toucher au code pour ça** — c'est une action dans le Railway Dashboard :

1. Aller sur Railway Dashboard → projet HuntZen
2. "New Service" → "GitHub Repo" → même repo
3. Configurer :
   - Root Directory : `backend`
   - Start Command : `python -m arq src.workers.settings.WorkerSettings`
   - Variables d'env : copier TOUTES les variables de l'API service (UPSTASH_REDIS_URL, DATABASE_URL, GROQ_API_KEY, etc.)
4. Déployer

### Tâche 4 — Nettoyage (optionnel, après validation)

Supprimer `backend/src/utils/queue_workers.py` (ancienne implémentation custom, plus utilisée).

---

## Vérifications obligatoires avant chaque modification

**Avant de modifier un fichier :**
1. Lire le fichier en entier
2. Identifier toutes les dépendances (imports, Depends FastAPI)
3. Vérifier que le pattern ARQ de `coach.py` s'applique bien

**Après chaque modification :**
```bash
cd backend && python3 -c "import ast; ast.parse(open('src/api/routes/FICHIER.py').read()); print('OK')"
```

**Après tous les commits :**
```bash
# Régénérer token
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5naWFrZmlrYnV5dWdxZnF0ZndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MDI5MjcsImV4cCI6MjA4NTA3ODkyN30.rXCxu742sTGp5GKjU-BMlb1hyLHwwtfVAXhJ8EzOKMg"
TOKEN=$(curl -s -X POST "https://ngiakfikbuyugqfqtfwp.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"wissemkarboubbb@gmail.com","password":"Wissem2002."}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "$TOKEN" > /tmp/huntzen_token.txt

# Attendre déploiement Railway (~90s après push)
# Vérifier que le backend démarre sans erreur
curl -s -H "Authorization: Bearer $TOKEN" \
  https://huntzenjobs-production.up.railway.app/api/auth/me | python3 -m json.tool

# Vérifier que la queue répond
curl -s -H "Authorization: Bearer $TOKEN" \
  https://huntzenjobs-production.up.railway.app/api/queue/all-stats
```

---

## Gardes fous — Ce qu'il NE FAUT PAS faire

### Over-engineering interdit
- **NE PAS** créer de nouveaux fichiers utilitaires (le code ARQ est déjà dans `queue.py`, `workers/`)
- **NE PAS** refactoriser les endpoints existants au-delà du pattern ARQ
- **NE PAS** toucher aux endpoints qui ne font pas d'appels Groq (ex: `list_templates`, `generate-pdf`, `generate-cover-letter/pdf-from-data`)
- **NE PAS** modifier `workers/tasks.py` (les 4 tasks sont complètes)
- **NE PAS** modifier `workers/settings.py`
- **NE PAS** modifier `groq_retry.py` ni `base.py`
- **NE PAS** créer d'autres systèmes de monitoring, métriques, alertes — c'est hors scope

### Ne pas casser l'existant
- **Le fallback sync DOIT toujours fonctionner** si ARQ ou Redis est down — c'est la règle n°1
- **Ne jamais supprimer** le bloc `try/except` autour de ARQ dans les endpoints
- **Ne jamais lever d'exception** vers le client si ARQ échoue — toujours fallback sync

### Pattern exact à reproduire (depuis coach.py)

```python
# Au top du fichier — imports ARQ
from arq import create_pool
_arq_pool = None

async def _get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        try:
            from src.workers.settings import _get_redis_settings
            _arq_pool = await create_pool(_get_redis_settings())
        except Exception as e:
            logger.warning(f"[endpoint] ARQ pool init failed: {e}")
            _arq_pool = None
    return _arq_pool

# Compteur Redis (clé DIFFÉRENTE par fonctionnalité)
_GROQ_ACTIVE_KEY = "groq:active_FEATURE"  # remplacer FEATURE
_GROQ_ACTIVE_TTL = 120
SYNC_THRESHOLD = 12

async def _incr_active() -> int:
    from src.utils.cache import get_redis
    redis = await get_redis()
    if not redis:
        return 0
    count = await redis.incr(_GROQ_ACTIVE_KEY)
    await redis.expire(_GROQ_ACTIVE_KEY, _GROQ_ACTIVE_TTL)
    return count

async def _decr_active() -> None:
    from src.utils.cache import get_redis
    redis = await get_redis()
    if redis:
        val = await redis.decr(_GROQ_ACTIVE_KEY)
        if val < 0:
            await redis.set(_GROQ_ACTIVE_KEY, 0)

# Dans l'endpoint :
try:
    active = await _incr_active()
except Exception:
    active = 0

if active > SYNC_THRESHOLD:
    await _decr_active()
    pool = await _get_arq_pool()
    if pool:
        try:
            job = await pool.enqueue_job("NOM_TASK", **payload)
            return {"queued": True, "job_id": job.job_id, "estimated_wait_seconds": active * 8}
        except Exception as e:
            logger.warning(f"ARQ enqueue failed ({e}) — fallback sync")
    await _incr_active()  # ré-incrémenter pour le fallback sync

# Code sync existant (inchangé)
try:
    # ... traitement Groq existant ...
finally:
    await _decr_active()
```

---

## Commit guidelines

- Un commit par fichier modifié (pas de commit global)
- Messages : `feat(arq): enqueue ARQ dans assistant.py` et `feat(arq): enqueue ARQ dans cv_adapter.py`
- Push vers `origin Production` après chaque commit
- **Pas de `Co-Authored-By`** dans les commits (préférence du projet)

---

## Load test final (après tout déployé + worker Railway actif)

```bash
TOKEN=$(cat /tmp/huntzen_token.txt)
# Coach doit passer à ~100% succès (queued pour l'overflow)
python load_test.py --token "$TOKEN" --scenario coach --users 100

# Mixed : coach + jobs + auth simultanément
python load_test.py --token "$TOKEN" --scenario mixed --users 100
```

Objectif : **taux succès > 95%** pour tous les scénarios @ 100 users.
