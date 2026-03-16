# Spec — Admin Stress Testing Dashboard

**Date :** 2026-03-16
**Statut :** Approuvé
**Branche cible :** feature/admin-stress-testing → Production

---

## Contexte

Avant la commercialisation de HuntZen, l'administrateur doit pouvoir lancer des tests de charge directement depuis l'UI admin, observer les métriques en temps réel, et conserver un historique complet des runs. La feature sert trois cas d'usage : validation pré-déploiement, surveillance quotidienne des limites infra, et exploration ad-hoc de scénarios spécifiques.

---

## Architecture

```
Admin UI (/admin/stress)
    │
    ├─ POST /admin/stress/run ──────────────────► ARQ queue "stress_test"
    │                                                    │
    │                                           Worker dédié Railway
    │                                           (asyncio concurrent requests)
    │                                                    │
    │                                           Redis Pub/Sub
    │                                           channel: stress:{run_id}
    │                                                    │
    ├─ GET /admin/stress/stream/{run_id} ◄──── SSE (pattern /admin/live)
    │   (métriques toutes les 500ms)
    │
    └─ GET /admin/stress/runs          ──────► Supabase stress_test_runs
       GET /admin/stress/runs/{run_id}          (historique complet)
```

### Composants nouveaux

| Composant | Localisation | Rôle |
|-----------|-------------|------|
| `stress_worker.py` | `backend/src/workers/` | Worker ARQ queue dédiée |
| `routes/stress.py` | `backend/src/api/routes/` | 5 endpoints admin |
| `stress_test_runs` | Supabase migration | Persistance runs + métriques |
| `admin/stress/page.tsx` | `frontend-next/src/app/admin/stress/` | Page UI 3 onglets |
| `use-stress-test.ts` | `frontend-next/src/hooks/admin/` | Hook SSE + state |

### Isolation des workers

La queue `stress_test` est séparée de la queue principale. Le worker dédié tourne avec `functions = [stress_test_task]` uniquement, sans impact sur les jobs users (coach, CV-adapt, cover-letter).

**Déploiement Railway :** Un second service Railway `worker-stress` avec `startCommand = "python -m arq src.workers.stress_settings.StressWorkerSettings"`. Fichier `backend/src/workers/stress_settings.py` dédié (mirror de `settings.py` mais avec `functions = [stress_test_task]` uniquement).

---

## Backend

### Endpoints (5)

```
POST   /admin/stress/run              Enqueue un test
DELETE /admin/stress/run/{run_id}     Annuler un test en cours
GET    /admin/stress/stream/{run_id}  SSE métriques live (500ms)
GET    /admin/stress/runs             Historique paginé
GET    /admin/stress/runs/{run_id}    Détail complet d'un run
```

#### POST /admin/stress/run — Payload

```json
{
  "name": "Coach Stress 200",
  "concurrency": 200,
  "duration_sec": 120,
  "ramp_up_sec": 30,
  "features": ["coach", "jobs", "cv_analysis", "auth"]
}
```

#### Scénarios pré-définis

| Nom | Users | Durée | Ramp-up | Features |
|-----|-------|-------|---------|----------|
| Baseline 50 | 50 | 60s | 10s | coach, jobs, auth |
| Coach Stress 200 | 200 | 120s | 30s | coach |
| CV Stress 100 | 100 | 90s | 20s | cv_analysis |
| Auth Spike 300 | 300 | 60s | 10s | auth |
| Full Platform 500 | 500 | 120s | 45s | tous |

### Worker `stress_test_task`

1. Reçoit la config depuis ARQ
2. Met à jour `stress_test_runs.status = 'running'`
3. Lance `N` coroutines asyncio concurrentes (ramp-up progressif)
4. Chaque 500ms :
   - Vérifie `redis.get(f"cancel:{run_id}")` → si présent, interrompt la boucle et passe à l'étape 6
   - Agrège latences (p50/p95/p99), req/s, taux erreur par feature
   - Écrit le snapshot dans `redis.set(f"stress:metrics:{run_id}", json.dumps(snapshot), ex=600)`
5. Appende le snapshot à la liste in-memory `metrics_timeseries`
6. À la fin (ou annulation) : persiste `metrics_timeseries` JSONB en DB, met à jour `status`

**Mécanisme d'annulation :** Le DELETE endpoint écrit `redis.set(f"cancel:{run_id}", "1", ex=300)`. Le worker vérifie cette clé à chaque tick (500ms) et s'arrête proprement. ARQ ne supporte pas l'interruption mid-job nativement.

### Métriques publiées (Redis → SSE)

```json
{
  "ts": 1742140800,
  "elapsed_sec": 45,
  "req_per_sec": 847,
  "active_users": 187,
  "latency": { "p50": 145, "p95": 342, "p99": 589, "max": 1203 },
  "error_rate": 0.008,
  "features": {
    "coach":       { "active": 87, "req_s": 420, "errors": 3 },
    "jobs":        { "active": 34, "req_s": 200, "errors": 1 },
    "cv_analysis": { "active": 12, "req_s": 89,  "errors": 0 }
  },
  "infra": {
    "arq_queue_depth": 23
  }
}
```

### Helpers Redis à ajouter (`utils/cache.py`)

```python
async def redis_publish(channel: str, message: dict) -> None:
    redis = await get_redis()
    if redis:
        await redis.publish(channel, json.dumps(message))

async def redis_subscribe_generator(channel: str):
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            yield json.loads(message["data"])
```

Le SSE endpoint souscrit au channel `stress:{run_id}` et yield chaque message publié par le worker (toutes les 500ms).

---

## Base de données

### Migration `20260316000004_stress_test_runs.sql`

```sql
CREATE TABLE stress_test_runs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_by_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  status              TEXT CHECK (status IN ('pending','running','completed','failed','cancelled')) DEFAULT 'pending',
  config              JSONB NOT NULL,
  total_requests      INT DEFAULT 0,
  successful          INT DEFAULT 0,
  failed              INT DEFAULT 0,
  avg_response_ms     FLOAT,
  p95_response_ms     FLOAT,
  p99_response_ms     FLOAT,
  max_response_ms     FLOAT,
  metrics_timeseries  JSONB,
  errors_log          JSONB,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_stress_test_runs_status     ON stress_test_runs(status);
CREATE INDEX idx_stress_test_runs_created_at ON stress_test_runs(created_at DESC);

ALTER TABLE stress_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON stress_test_runs
  FOR ALL TO service_role USING (true);
```

---

## Frontend

### Page `/admin/stress` — 3 onglets

#### Onglet 1 — Lancer

- Grille de 5 scénarios pré-définis (cards cliquables)
- Card "Custom" ouvre le builder
- Builder : sliders (users 10→500, durée 30s→5min, ramp-up 0→60s) + checkboxes features
- Bouton "Lancer le test" → POST /admin/stress/run → redirect auto vers onglet Live

#### Onglet 2 — Live

- S'active automatiquement quand un test est en cours
- KPIs temps réel : req/s, latence p95, taux erreur, users actifs
- Deux courbes (recharts) : latence p50/p95/p99 + req/s avec erreurs superposées
- Tableau features : coach actifs, CV analyses, jobs searches, ARQ queue depth
- Jauge infra : ARQ queue depth (seule métrique infra fiable disponible)
- Bouton "Stop" → DELETE /admin/stress/run/{run_id}
- Barre de progression durée totale

#### Onglet 3 — Historique

- Tableau paginé : date, nom, users, durée, p95, erreurs, statut + badge couleur
- Clic sur un run → vue détail avec courbes reconstituées depuis `metrics_timeseries`
- Bouton "Relancer" → pré-remplit le builder avec la même config

### Hook `use-stress-test.ts`

- SSE vers `/admin/stress/stream/{run_id}`
- Reconnexion exponentielle (pattern identique à `use-admin-live.ts`)
- Token re-fetché à chaque reconnexion
- State : `metrics[]`, `status`, `currentRun`

---

## Patterns respectés

- `AdminUserDep` sans `= None` pour tous les endpoints
- SSE auth via query param `?token=xxx`
- Redis via `get_redis()` (async, lazy singleton)
- ARQ via `create_pool` + `_get_redis_settings()`
- `sse-starlette` + `EventSourceResponse` + header `X-Accel-Buffering: no`
- Sentry : `new_scope()` pour les erreurs worker

---

## Critères de succès (UAT)

- [ ] Lancer "Baseline 50" depuis l'UI → test démarre, métriques apparaissent en < 2s
- [ ] Les jobs coach/CV des vrais users ne sont pas bloqués pendant le test
- [ ] Annuler un test en cours → statut `cancelled` en DB + SSE s'arrête
- [ ] Historique : le run terminé est consultable avec les courbes complètes
- [ ] Builder custom : slider 200 users, 2min, coach only → test se lance correctement
- [ ] ARQ queue depth visible et mis à jour pendant le test
