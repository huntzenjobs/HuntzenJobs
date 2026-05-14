# Benchmarks

Scripts pour mesurer la couverture des offres d'emploi entre différents pays.

## fr-vs-us.py

Benchmark live qui compare la couverture des providers entre la France et les États-Unis sur des requêtes équivalentes.

### Fonctionnement

1. Crée un utilisateur temporaire en plan Premium via service_role Supabase
2. Signe un JWT Supabase valide pour cet utilisateur
3. Appelle /api/jobs/search en production avec 6 requêtes (3 par pays, espacées de 7s pour le rate limit)
4. Affiche le breakdown par provider et compare le total FR vs US
5. Nettoie l'utilisateur temporaire à la fin

### Prérequis

Variables d'environnement dans `.env` (racine du projet) :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

### Exécution

Le script exécute des opérations contre la production (création d'un user temporaire, appels `/api/jobs/search`). Il faut donc activer explicitement le garde-fou :

```bash
ALLOW_PROD_BENCHMARK=1 ./venv/bin/python scripts/benchmarks/fr-vs-us.py
```

Durée : environ 1 minute (6 requêtes espacées de 7s + lookup + cleanup).

### Sortie

Tableau avec colonnes : QUERY, COUNTRY, TOTAL, CACHE, BREAKDOWN. Plus un résumé global comparant FR et US.

### Quotas

Le script consomme 6 ticks de quota `job_search` sur l'utilisateur temporaire (qui est en Premium donc quota illimité).
