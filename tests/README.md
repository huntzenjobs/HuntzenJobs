# Load Testing avec k6

Tests de charge pour valider la capacité de l'infrastructure HuntZen en production.

## Installation k6

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Vérifier installation
k6 version
```

## Exécution des tests

### Test complet (17 minutes)
```bash
k6 run tests/load_test.js
```

### Test rapide (3 minutes)
```bash
k6 run tests/load_test.js --duration 3m --vus 500
```

### Test avec résultats détaillés
```bash
k6 run tests/load_test.js --out json=results.json
```

## Scénarios de test

Le script teste progressivement la charge :

1. **Warm-up** (1 min) : 0 → 100 utilisateurs
2. **Ramp-up** (2 min) : 100 → 500 utilisateurs
3. **Peak load** (2 min) : 500 → 1000 utilisateurs
4. **Sustained peak** (5 min) : 1000 utilisateurs constant
5. **Spike test** (1 min) : 1000 → 1500 utilisateurs
6. **Hold spike** (2 min) : 1500 utilisateurs
7. **Scale down** (2 min) : 1500 → 0

## Endpoints testés

- **80%** : `/api/jobs/search` (endpoint principal)
- **20%** : `/health` (monitoring)

## Métriques surveillées

### Thresholds (seuils à respecter)

| Métrique | Seuil | Description |
|----------|-------|-------------|
| P95 Latency | < 500ms | 95% des requêtes doivent répondre en moins de 500ms |
| Error Rate | < 0.1% | Moins de 1 erreur sur 1000 requêtes |
| HTTP Failures | < 5% | Moins de 5% d'échecs HTTP |
| Search P95 | < 600ms | Recherche de jobs en moins de 600ms |
| Health P95 | < 100ms | Health check ultra rapide |

### Résultats attendus

Avec l'infrastructure actuelle (2-4 replicas × 4 workers) :

- **Throughput** : 800-1,600 req/s
- **Concurrent users** : 1000-1500 sans dégradation
- **P95 latency** : 300-500ms
- **Error rate** : < 0.05%

## Interprétation des résultats

### ✅ Test réussi si :
- Tous les thresholds sont verts
- P95 < 500ms pendant toute la durée
- Error rate < 0.1%
- Aucun timeout ni 502/503

### ⚠️ Optimisations nécessaires si :
- P95 > 500ms pendant peak load
- Error rate > 0.1%
- Timeouts fréquents
- Scaling lent (> 60s)

### ❌ Problèmes critiques si :
- P95 > 1000ms
- Error rate > 1%
- 502/503 errors fréquents
- Workers crashent

## Surveillance pendant les tests

### Railway Dashboard
```
https://railway.app/dashboard
```
Surveiller :
- CPU usage (devrait trigger auto-scaling à 70%)
- Memory usage (stable < 80%)
- Number of replicas (devrait passer de 2 à 4)

### Sentry
```
https://sentry.io
```
Surveiller :
- Error rate (devrait rester stable)
- P95 latency (courbe de montée progressive)
- Aucune nouvelle erreur

## Troubleshooting

### "Backend unhealthy" au démarrage
```bash
curl https://huntzenjobs-production.up.railway.app/health
```
Vérifier que le backend répond avant de lancer k6.

### Trop d'erreurs 429 (Rate Limiting)
Le rate limiting SlowAPI peut bloquer. Deux options :
1. Augmenter la limite dans `backend/src/api/middleware.py`
2. Désactiver temporairement pour les tests

### Memory leak détecté
Si la mémoire monte continuellement, vérifier :
- Cache Redis (TTL correctement configuré ?)
- Connection pooling (connexions fermées ?)
- Workers recycling (`--max-requests` dans Gunicorn)

## Résultats sauvegardés

Les résultats sont automatiquement sauvegardés dans :
- `load_test_results.json` (métriques détaillées)
- Console output (résumé lisible)

## Prochaines étapes

Après validation du load test :
1. ✅ Documenter les résultats
2. 📊 Configurer monitoring continu (Sentry alerts)
3. 🚀 Activer en production
4. 📈 Surveiller metrics réels vs tests

## Contact

Pour questions ou problèmes : admin@huntzen.app
