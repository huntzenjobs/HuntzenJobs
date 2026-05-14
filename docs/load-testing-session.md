# HuntZen — Load Testing Session

## Contexte de la session précédente

Le backend Railway est maintenant **stable et déployé** après correction de plusieurs bugs critiques :

- `PORT=8000` settée dans Railway variables (Railway injectait 8080, causait mismatch avec target port 8000)
- `swallow_errors=True` sur SlowAPI + suppression handler `ConnectionError` global (Redis TCP_INVALID_SYN causait 503 sur chaque requête)
- `reset=no_reset` + `prepare_threshold=None` + `autocommit=True` sur psycopg_pool (incompatibilité avec PgBouncer transaction mode causait `available=0` et workers bloqués)

**Backend URL :** `https://huntzenjobs-production.up.railway.app`
**Config Railway :** 2 replicas min, 4 max (autoscaling CPU 60%), 4 workers/replica
**DB :** Supabase Micro (PgBouncer transaction mode, pool_size=15, max_clients=200)
**LLM :** Groq — llama-4-scout-17b (fast), llama-3.3-70b-versatile (powerful), 300K TPM chacun

---

## JWT Token (valide ~1h depuis génération)

Pour régénérer si expiré :
```bash
curl -s -X POST "https://ngiakfikbuyugqfqtfwp.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5naWFrZmlrYnV5dWdxZnF0ZndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MDI5MjcsImV4cCI6MjA4NTA3ODkyN30.rXCxu742sTGp5GKjU-BMlb1hyLHwwtfVAXhJ8EzOKMg" \
  -H "Content-Type: application/json" \
  -d '{"email":"wissemkarboubbb@gmail.com","password":"Wissem2002."}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
```

**Token actuel (généré session précédente) :**
```
eyJhbGciOiJFUzI1NiIsImtpZCI6IjJjZDYzOTVhLTJkZDEtNDVkOC1hYmM0LTVkNTg4MmQ4ZDVkYiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL25naWFrZmlrYnV5dWdxZnF0ZndwLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJjZTYyMGU3NS1iMzQ2LTQwY2MtODNlZS0xZGFiN2NiOWIzNDYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzczMzcxNDA2LCJpYXQiOjE3NzMzNjc4MDYsImVtYWlsIjoid2lzc2Vta2FyYm91YmJiQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJ3aXNzZW1rYXJib3ViYmJAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6Indpc3NlbW1tIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJjZTYyMGU3NS1iMzQ2LTQwY2MtODNlZS0xZGFiN2NiOWIzNDYifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3MzM2NzgwNn1dLCJzZXNzaW9uX2lkIjoiNTYyNDI1NjUtNDBhNS00ZGFkLTk5MTUtMWJlNWI2OWQyNjgyIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.aHtcL1YH4JCuW46XGugFw0C1VrU8rDka0ug0bUdGnzkP0CV5dcMZXw0S1R7sX2CC8I9M2wfYrNSSLZ9vDCJ7KQ
```

---

## Objectif des load tests

Mon boss veut connaître **les limites exactes de l'infrastructure** en simultané, en queue, et identifier tout crash ou problème user potentiel.

### Flows à tester simultanément

| Flow | Endpoint | Composant externe | Timeout |
|------|----------|-------------------|---------|
| Coach LLM | `POST /api/coach/chat` | Groq 70B | 60s |
| Auth/session | `GET /api/auth/me` | Supabase DB | 10s |
| Jobs search | `GET /api/jobs/search?q=...` | Adzuna API | 15s |
| Analyse CV async | `POST /api/cv-analysis` | Modal + Docling | 120s |
| Adapter CV | `POST /api/cv-adapter` | Groq + PDF | 90s |
| Génération LM | `POST /api/cv-adapter/generate-cover-letter` | Groq 70B | 60s |

### Scénarios à exécuter dans l'ordre

1. **Baseline** — `health --users 200` → vérifier que le backend tient
2. **Auth load** — `auth --users 50` puis `--users 100` → limites DB pool
3. **Coach LLM** — `coach --users 15` puis `--users 50` → limites Groq TPM
4. **Mixed réaliste** — `mixed --users 50` puis `--users 100` → simulation prod
5. **Ramp complet** — `ramp` → montée 10→50→100→200 users → trouver le point de rupture
6. **CV + LLM simultané** → scénario custom à créer dans `load_test.py`

---

## Prompt pour la nouvelle conversation

Colle ce prompt exactement dans la nouvelle conversation Claude Code :

---

```
Continue le load testing HuntZen en production. Lis ce fichier d'abord : docs/load-testing-session.md

Contexte critique :
- Backend Railway STABLE et déployé (fixes psycopg_pool + PORT + Redis tous appliqués)
- URL : https://huntzenjobs-production.up.railway.app
- Infrastructure : 2-4 replicas Railway, 4 workers/replica, Supabase Micro PgBouncer, Groq 300K TPM
- load_test.py existe à la racine du projet avec les scénarios health/coach/jobs/auth/mixed/ramp

Objectif : trouver les limites exactes de l'infrastructure pour un rapport complet au boss.
Les composants à challenger : Railway (workers/replicas), Supabase PgBouncer (pool 200 clients max), Groq API (TPM limits), Modal (CV processing), Redis Upstash (rate limiting).

Plan d'exécution dans l'ordre :
1. Régénère le JWT token (la commande est dans le .md)
2. Vérifie que le backend répond : curl /api/health/ping
3. Lance les scénarios dans l'ordre du .md (baseline → auth → coach → mixed → ramp)
4. Pour chaque scénario note : P50/P95/P99, taux de succès, erreurs par type
5. Après mixed et ramp, ajoute un scénario custom dans load_test.py qui simule des flows CV complets (upload + analyse + adaptation + génération LM) en simultané
6. Produis un rapport final avec : les limites trouvées par composant, les recommandations pour scaler, les risques identifiés

Important :
- Si un scénario plante le backend, diagnostique avant de relancer
- Les erreurs Groq 429 sont normales sous forte charge (TPM limit) — documente le seuil
- Surveille les logs Railway pendant les tests : railway logs --tail 50
- Le load_test.py frappe /health (pas /api/health/ping) — si timeout, c'est Redis qui bloque, passe directement au scénario auth
```
