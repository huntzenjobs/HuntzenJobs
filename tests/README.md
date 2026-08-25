# Tests HuntZen

Ce dossier contient les tests backend (pytest) et les scripts de load testing (k6). Les tests frontend (Vitest) sont dans `frontend-next/`, les tests E2E (Playwright) dans `e2e/`.

## Vue d'ensemble

| Type | Outil | Emplacement | Commande |
|---|---|---|---|
| Backend unitaire | pytest | `tests/` | `npm run test:backend` |
| Frontend unitaire | Vitest | `frontend-next/` | `npm run test:frontend` |
| End-to-end | Playwright | `e2e/` | `npm run test:e2e` |
| Charge | k6 | `tests/load_test.js` | `k6 run tests/load_test.js` |

Tout lancer d'un coup : `npm run test:all` (backend + frontend + E2E).

## Tests backend (pytest)

```bash
npm run test:backend          # pytest -v
npm run test:backend:cov      # avec couverture HTML
```

## Tests frontend (Vitest)

```bash
npm run test:frontend         # une passe
npm run test:frontend:watch   # mode watch
npm run test:frontend:cov     # avec couverture
```

## Tests E2E (Playwright)

```bash
npm run test:e2e              # local
npm run test:e2e:ui          # interface graphique
npm run test:e2e:production  # contre la prod
npm run test:bugs            # tests ciblés bugs (e2e/bugs)
```

---

## Load testing (k6)

Tests de charge pour valider la capacité de l'infrastructure en production.

### Installation

```bash
# macOS
brew install k6

# Vérifier
k6 version
```

### Exécution

```bash
# Test complet (17 minutes)
k6 run tests/load_test.js

# Test rapide (3 minutes)
k6 run tests/load_test.js --duration 3m --vus 500

# Avec export JSON
k6 run tests/load_test.js --out json=results.json
```

### Scénario

Montée en charge progressive : warm-up (0 → 100), ramp-up (100 → 500), peak (500 → 1000), sustained peak (1000 pendant 5 min), spike (1000 → 1500), puis scale down.

Endpoints testés : `/api/jobs/search` (80%) et `/health` (20%).

### Seuils à respecter

| Métrique | Seuil |
|---|---|
| P95 latency | < 500 ms |
| Error rate | < 0.1% |
| HTTP failures | < 5% |
| Search P95 | < 600 ms |
| Health P95 | < 100 ms |

### Résultats attendus

Avec l'infra actuelle (2-4 replicas × 4 workers) : throughput 800-1600 req/s, 1000-1500 utilisateurs concurrents sans dégradation, P95 300-500 ms, error rate < 0.05%.

### Surveillance pendant les tests

- **Railway** : CPU (auto-scaling à 70%), mémoire (< 80%), nombre de replicas (2 → 4)
- **Sentry** : error rate stable, P95 latency, nouvelles erreurs

### Troubleshooting

- **Backend unhealthy** : vérifier `curl https://huntzenjobs-production.up.railway.app/health` avant de lancer k6
- **Erreurs 429** : rate limiting SlowAPI, ajuster dans `backend/src/api/middleware.py`
- **Memory leak** : vérifier TTL cache Redis, connection pooling, recyclage des workers Gunicorn
