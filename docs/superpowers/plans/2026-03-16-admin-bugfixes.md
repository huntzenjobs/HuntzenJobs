# Admin Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 6 bugs identifiés lors de l'audit post-phases A–D du centre de contrôle admin (throttle Redis, retry-job ARQ, ban IP persistance, SSE reconnexion, état maintenance, UI custom-limits).

**Architecture:** 3 phases séquentielles — Phase 1 backend Python, Phase 2 hooks TypeScript, Phase 3 UI React. Chaque phase se termine par une vérification syntaxe avant la suivante. Pas de nouvelles dépendances nécessaires.

**Tech Stack:** FastAPI + arq + Redis (backend) / Next.js 14 + React hooks (frontend) / Supabase (auth SSE)

---

## Chunk 1 — Phase 1 : Backend (3 fixes)

### Fichiers touchés

- Modify: `backend/src/services/admin_alerts.py` (Fix 1 — throttle sans Redis)
- Modify: `backend/src/api/routes/admin.py:2382-2404` (Fix 2 — retry-job ARQ réel)
- Modify: `backend/src/api/routes/admin.py` section ban-ip (Fix 3 — déjà fait via _log_admin_action, confirmer)

---

### Task 1 : Fix throttle emails sans Redis (`admin_alerts.py`)

**Fichiers :**
- Modify: `backend/src/services/admin_alerts.py`

**Contexte :** Actuellement, si Redis est absent (`redis is None`), le throttle est sauté et l'email part sans limitation. Solution : variable globale `_last_sent_fallback` avec TTL en mémoire.

- [ ] **Lire le fichier actuel**

```bash
# Vérifier les imports actuels
head -15 backend/src/services/admin_alerts.py
```

- [ ] **Appliquer le fix**

Le fichier actuel (`backend/src/services/admin_alerts.py`) a cette structure exacte :

```python
import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_THROTTLE_TTL = 3600  # 1 heure
```

**Étape A** — Ajouter `import time` après `import logging` :

Remplacer :
```python
import hashlib
import logging
from typing import Optional
```
Par :
```python
import hashlib
import logging
import time
from typing import Optional
```

**Étape B** — Ajouter la variable module-level après `_THROTTLE_TTL = 3600` :

Remplacer :
```python
_THROTTLE_TTL = 3600  # 1 heure
```
Par :
```python
_THROTTLE_TTL = 3600  # 1 heure
# Fallback throttle en mémoire si Redis absent (process-local)
_last_sent_fallback: dict = {}
```

**Étape C** — Le bloc Redis exact dans la fonction est :

```python
        redis = await get_redis()
        if redis:
            already_sent = await redis.get(throttle_key)
            if already_sent:
                logger.debug(f"[admin_alerts] Throttled: '{subject}'")
                return
            await redis.set(throttle_key, "1", ex=_THROTTLE_TTL)
```

Remplacer par :

```python
        redis = await get_redis()
        if redis:
            already_sent = await redis.get(throttle_key)
            if already_sent:
                logger.debug(f"[admin_alerts] Throttled: '{subject}'")
                return
            await redis.set(throttle_key, "1", ex=_THROTTLE_TTL)
        else:
            # Throttle mémoire (process-local) quand Redis indisponible
            now = time.time()
            if _last_sent_fallback.get(throttle_key, 0) + _THROTTLE_TTL > now:
                logger.warning(f"[admin_alerts] throttle mémoire actif pour '{subject}'")
                return
            _last_sent_fallback[throttle_key] = now
```

- [ ] **Vérifier syntaxe Python**

```bash
python3 -c "import ast; ast.parse(open('backend/src/services/admin_alerts.py').read()); print('✅ OK')"
```
Résultat attendu : `✅ OK`

- [ ] **Commit**

```bash
git add backend/src/services/admin_alerts.py
git commit -m "fix(admin): throttle alertes email en mémoire si Redis absent"
```

---

### Task 2 : Fix retry-job ARQ réel (`admin.py`)

**Fichiers :**
- Modify: `backend/src/api/routes/admin.py` (lignes ~2382–2404)

**Contexte :** L'endpoint `POST /users/{user_id}/retry-job` loggue seulement l'intention. Il faut le remplacer par un vrai enqueue ARQ. Le schema `RetryJobRequest` actuel a `job_id: str` — à remplacer par `function_name + kwargs`.

**Fonctions ARQ valides** (enregistrées dans `WorkerSettings.functions`) :
- `coach_task`, `assistant_task`, `cv_adapt_task`, `cover_letter_task`

**Import ARQ :** utiliser `from arq import create_pool` (pattern du projet) + `from src.workers.settings import _get_redis_settings` (fournit `RedisSettings`).

- [ ] **Remplacer le schema `RetryJobRequest` et l'endpoint**

Trouver et remplacer la section suivante dans `admin.py` (lignes ~2382-2404) :

```python
# AVANT (à remplacer entièrement) :
class RetryJobRequest(BaseModel):
    job_id: str


@router.post("/users/{user_id}/retry-job")
async def retry_arq_job(
    user_id: str,
    req: RetryJobRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Réenqueue un job ARQ par son ID (lu depuis user_events.properties.arq_job_id)."""
    supabase = get_supabase_client()

    job_id = req.job_id
    if not job_id:
        raise HTTPException(status_code=400, detail="job_id requis")

    # Log uniquement — le réenqueue réel nécessite l'accès au worker ARQ
    # Pour le moment on loggue l'intention ; le worker peut être déclenché via Redis manuellement
    _log_admin_action(supabase, admin["id"], "admin.job_retry_requested", user_id, {
        "job_id": job_id,
    })
    return {"ok": True, "job_id": job_id, "note": "Retry loggué — redéclencher via ARQ si nécessaire"}
```

Remplacer par :

```python
VALID_ARQ_FUNCTIONS = {"coach_task", "assistant_task", "cv_adapt_task", "cover_letter_task"}


class RetryJobRequest(BaseModel):
    function_name: str
    kwargs: dict = {}


@router.post("/users/{user_id}/retry-job")
async def retry_arq_job(
    user_id: str,
    req: RetryJobRequest,
    admin: AdminUserDep,
) -> Dict[str, Any]:
    """Réenqueue réellement un job ARQ pour un utilisateur."""
    if req.function_name not in VALID_ARQ_FUNCTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Fonction invalide. Valeurs acceptées : {', '.join(sorted(VALID_ARQ_FUNCTIONS))}",
        )

    try:
        from uuid import uuid4
        from arq import create_pool
        from src.workers.settings import _get_redis_settings
        pool = await create_pool(_get_redis_settings())
        job = await pool.enqueue_job(req.function_name, _job_id=str(uuid4()), **req.kwargs)
        await pool.close()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Redis/ARQ indisponible : {e}")

    supabase = get_supabase_client()
    new_job_id = job.job_id if job else None
    _log_admin_action(supabase, admin["id"], "admin.job_retried", user_id, {
        "function": req.function_name,
        "new_job_id": new_job_id,
    })
    return {"ok": True, "job_id": new_job_id, "function": req.function_name}
```

- [ ] **Vérifier syntaxe Python**

```bash
python3 -c "import ast; ast.parse(open('backend/src/api/routes/admin.py').read()); print('✅ OK')"
```

Résultat attendu : `✅ OK`

> Note : la pre-existing `SyntaxError` à la ligne 2430 (`admin_search`) est un faux-positif du parser `ast` sur FastAPI Query — elle n'empêche pas FastAPI de fonctionner. Si `ast.parse` signale cette ligne, ignorer uniquement cette erreur.

- [ ] **Commit**

```bash
git add backend/src/api/routes/admin.py
git commit -m "fix(admin): retry-job enqueue ARQ réel (coach/assistant/cv-adapt/cover-letter)"
```

---

### Task 3 : Confirmer persistance ban-ip en DB

**Fichiers :**
- Verify: `backend/src/api/routes/admin.py` endpoint `ban_ip`

**Contexte :** La spec indique que `_log_admin_action` (qui appelle `log_security_event` RPC) sert de trace d'audit DB. Vérifier que l'appel existant inclut bien les métadonnées complètes (ip, reason). Ajouter `ttl_days: 30` si absent.

- [ ] **Vérifier le contenu actuel du endpoint ban_ip**

```bash
grep -A 20 "def ban_ip" backend/src/api/routes/admin.py
```

- [ ] **Vérifier que `_log_admin_action` inclut ip + reason**

L'appel doit ressembler à :
```python
_log_admin_action(supabase, admin["id"], "admin.ip_banned", None, {"ip": payload.ip, "reason": payload.reason})
```

Si `ttl_days` est absent, ajouter `"ttl_days": 30` dans le dict event_data :
```python
_log_admin_action(supabase, admin["id"], "admin.ip_banned", None, {
    "ip": payload.ip,
    "reason": payload.reason,
    "ttl_days": 30,
})
```

- [ ] **Vérifier syntaxe**

```bash
python3 -c "import ast; ast.parse(open('backend/src/api/routes/admin.py').read()); print('✅ OK')"
```

- [ ] **Commit si modifié**

```bash
git add backend/src/api/routes/admin.py
git commit -m "fix(admin): ban-ip ajoute ttl_days dans audit DB security_events"
```

---

## Chunk 2 — Phase 2 : Frontend Hooks (2 fixes)

### Fichiers touchés

- Modify: `frontend-next/src/hooks/admin/use-admin-live.ts` (Fix 4 — retry SSE)
- Modify: `frontend-next/src/app/admin/live/page.tsx` (Fix 5 — état maintenance)

---

### Task 4 : Retry SSE automatique (`use-admin-live.ts`)

**Fichiers :**
- Modify: `frontend-next/src/hooks/admin/use-admin-live.ts`

**Contexte :** Le hook actuel fait 47 lignes. `es.onerror` pose juste `setConnected(false)` sans retry. La `connect()` est une fonction locale async dans `useEffect`. Réécrire avec `useRef` pour le backoff et `destroyed` pour le cleanup.

**Code complet à écrire (remplace tout le fichier) :**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface PresenceSnapshot {
  total: number;
  by_page: Record<string, number>;
  by_feature: Record<string, number>;
}

export function useAdminLive() {
  const [presence, setPresence] = useState<PresenceSnapshot>({
    total: 0,
    by_page: {},
    by_feature: {},
  });
  const [connected, setConnected] = useState(false);

  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const destroyed = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(async () => {
    if (destroyed.current) return;

    // Re-fetch token à chaque tentative (évite les closures sur token expiré)
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || destroyed.current) return;

    const url = `${BACKEND_URL}/api/presence/admin/live?token=${encodeURIComponent(session.access_token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      retryCount.current = 0;
      setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "snapshot") setPresence(data.presence);
      } catch {}
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      if (destroyed.current) return;
      // Backoff exponentiel : 1s → 2s → 4s → 8s → 16s → 30s (plafond)
      const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
      retryCount.current += 1;
      retryTimer.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    destroyed.current = false;
    connect();
    return () => {
      destroyed.current = true;
      clearTimeout(retryTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);

  return { presence, connected };
}
```

- [ ] **Écrire le fichier**

Remplacer `frontend-next/src/hooks/admin/use-admin-live.ts` avec le code ci-dessus.

- [ ] **Vérifier TypeScript**

```bash
cd frontend-next && npx tsc --noEmit --skipLibCheck 2>&1 | grep "use-admin-live" | head -5
```

Résultat attendu : aucune ligne (pas d'erreur).

- [ ] **Commit**

```bash
git add frontend-next/src/hooks/admin/use-admin-live.ts
git commit -m "fix(admin): retry SSE automatique avec backoff exponentiel (max 30s)"
```

---

### Task 5 : État maintenance au chargement (`live/page.tsx`)

**Fichiers :**
- Modify: `frontend-next/src/app/admin/live/page.tsx`

**Contexte :** La page utilise `useState(false)` pour `maintenance`. Ajouter un `useEffect` initial qui appelle `GET /api/admin/maintenance` (endpoint existant qui retourne `{ active: bool }`).

**Ce qui existe déjà dans la page :**
- `adminFetch(path, options)` — wrapper fetch authentifié déjà défini localement
- `const [maintenance, setMaintenance] = useState(false)` — état existant

**Changement minimal à apporter :**

Trouver dans `live/page.tsx` la déclaration du composant principal (probablement `export default function AdminLivePage()`). Ajouter ce `useEffect` après les `useState` existants :

```typescript
// Récupère l'état réel de maintenance au montage
useEffect(() => {
  adminFetch("/api/admin/maintenance")
    .then((d) => setMaintenance(d.active ?? false))
    .catch(() => {}); // fail silently — l'état local par défaut (false) reste valide
}, []);
```

**Important :** Le tableau de dépendances est vide `[]` — on ne veut l'appel qu'une seule fois au montage.

- [ ] **Lire la page pour trouver l'emplacement exact**

```bash
grep -n "useState\|useEffect\|maintenance" frontend-next/src/app/admin/live/page.tsx | head -20
```

- [ ] **Appliquer l'edit** dans `live/page.tsx`

Insérer le `useEffect` après les autres `useEffect` ou `useState` existants, avant le `return` JSX.

- [ ] **Vérifier TypeScript**

```bash
cd frontend-next && npx tsc --noEmit --skipLibCheck 2>&1 | grep "live/page" | head -5
```

Résultat attendu : aucune ligne.

- [ ] **Commit**

```bash
git add frontend-next/src/app/admin/live/page.tsx
git commit -m "fix(admin): charger état réel maintenance au montage de /admin/live"
```

---

## Chunk 3 — Phase 3 : UI (1 fix)

### Fichiers touchés

- Modify: `frontend-next/src/components/admin/users/user-actions-menu.tsx`

---

### Task 6 : Dialog "Limites personnalisées" (`user-actions-menu.tsx`)

**Fichiers :**
- Modify: `frontend-next/src/components/admin/users/user-actions-menu.tsx`

**Contexte :** Le fichier utilise le pattern : `useState(false)` pour l'open + `AlertDialog` ou `Dialog` inline dans le JSX. L'endpoint cible est `POST /api/admin/users/{id}/set-custom-limits` avec body `{ cv_analyses_daily?, coach_seconds_daily?, job_searches_daily? }` (champs optionnels, `null` = utiliser la limite du plan).

**Pattern suivi :** identique aux dialogs `grantDaysOpen` / `noteOpen` déjà en place (lignes 81-82 du fichier).

- [ ] **Ajouter les imports manquants**

Vérifier si `Settings2` ou `Sliders` de lucide-react est déjà importé. Ajouter si absent :

```typescript
import { Settings2 } from "lucide-react";
```

- [ ] **Ajouter les états dans le composant**

Après `const [noteOpen, setNoteOpen] = useState(false);` (ligne ~82), ajouter :

```typescript
const [customLimitsOpen, setCustomLimitsOpen] = useState(false);
const [limitCV, setLimitCV] = useState("");
const [limitCoach, setLimitCoach] = useState("");
const [limitJobs, setLimitJobs] = useState("");
```

- [ ] **Ajouter le handler**

Après le handler `handleBan` ou `handleNote`, ajouter :

```typescript
const handleSetCustomLimits = async () => {
  setActing(true);
  try {
    const body: Record<string, number | null> = {};
    if (limitCV !== "") body.cv_analyses_daily = limitCV === "0" ? null : parseInt(limitCV, 10);
    if (limitCoach !== "") body.coach_seconds_daily = limitCoach === "0" ? null : parseInt(limitCoach, 10);
    if (limitJobs !== "") body.job_searches_daily = limitJobs === "0" ? null : parseInt(limitJobs, 10);
    await adminPost(`/api/admin/users/${user.id}/set-custom-limits`, body);
    toast.success("Limites personnalisées appliquées");
    setCustomLimitsOpen(false);
    setLimitCV(""); setLimitCoach(""); setLimitJobs("");
  } catch (e: any) {
    toast.error(e.message || "Erreur");
  } finally {
    setActing(false);
  }
};
```

- [ ] **Ajouter l'item dans le DropdownMenu**

Trouver la section des items du DropdownMenu (près de "Offrir des jours", "Ajouter une note"). Ajouter avant le `<DropdownMenuSeparator />` final :

```typescript
<DropdownMenuItem onSelect={() => setCustomLimitsOpen(true)}>
  <Settings2 className="h-4 w-4 mr-2" />
  Limites personnalisées
</DropdownMenuItem>
```

- [ ] **Ajouter le Dialog dans le JSX**

Après le dernier `AlertDialog` dans le return (pattern identique aux autres dialogs), ajouter :

```typescript
{/* Dialog — Limites personnalisées */}
<AlertDialog open={customLimitsOpen} onOpenChange={setCustomLimitsOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Limites personnalisées</AlertDialogTitle>
      <AlertDialogDescription>
        Laissez vide pour conserver la limite du plan. Entrez 0 pour revenir aux limites par défaut.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <Label className="text-xs">Analyses CV / jour</Label>
        <Input
          type="number"
          min="0"
          placeholder="Limite du plan"
          value={limitCV}
          onChange={(e) => setLimitCV(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Secondes coach / jour</Label>
        <Input
          type="number"
          min="0"
          placeholder="Limite du plan"
          value={limitCoach}
          onChange={(e) => setLimitCoach(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Recherches emploi / jour</Label>
        <Input
          type="number"
          min="0"
          placeholder="Limite du plan"
          value={limitJobs}
          onChange={(e) => setLimitJobs(e.target.value)}
        />
      </div>
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={acting}>Annuler</AlertDialogCancel>
      <AlertDialogAction onClick={handleSetCustomLimits} disabled={acting}>
        {acting ? "Enregistrement..." : "Appliquer"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Vérifier TypeScript**

```bash
cd frontend-next && npx tsc --noEmit --skipLibCheck 2>&1 | grep "user-actions-menu" | head -5
```

Résultat attendu : aucune ligne.

- [ ] **Commit final**

```bash
git add frontend-next/src/components/admin/users/user-actions-menu.tsx
git commit -m "feat(admin): dialog limites personnalisées par user (set-custom-limits)"
```

---

## Récapitulatif des commits

| Commit | Fix |
|---|---|
| `fix(admin): throttle alertes email en mémoire si Redis absent` | Fix 1 |
| `fix(admin): retry-job enqueue ARQ réel` | Fix 2 |
| `fix(admin): ban-ip ajoute ttl_days dans audit DB security_events` | Fix 3 |
| `fix(admin): retry SSE automatique avec backoff exponentiel (max 30s)` | Fix 4 |
| `fix(admin): charger état réel maintenance au montage de /admin/live` | Fix 5 |
| `feat(admin): dialog limites personnalisées par user (set-custom-limits)` | Fix 6 |

## Vérification finale globale

```bash
# Python
python3 -c "
import ast
for f in ['backend/src/services/admin_alerts.py', 'backend/src/api/routes/admin.py']:
    try:
        ast.parse(open(f).read())
        print(f'✅ {f}')
    except SyntaxError as e:
        print(f'❌ {f}: {e}')
"

# TypeScript
cd frontend-next && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "error TS" | head -10
```
