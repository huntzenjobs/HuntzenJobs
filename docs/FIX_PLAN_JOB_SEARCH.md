# Fix Plan — Job Search Critical Bugs

> Branche : `fix/job-search-critical-bugs`
> Base : Production @ 02dc3c1
> Date plan : 2026-04-05

## Contexte

Suite à l'investigation approfondie (tests live prod + lecture code + validation multi-modèle Gemini 2.5 Flash + DeepSeek-R1), **11 bugs confirmés** dans le pipeline de recherche d'emploi. Les bugs cachent silencieusement 60 à 100% des résultats disponibles.

**Preuves factuelles collectées** (tests prod avec JWT `test-premium@huntzenjobs.com`) :

| Test | raw | final | sources | FT | Adzuna |
|---|---|---|---|---|---|
| RH seul (no city, no contract) | 55 | 30 | 7 | 3 | 15 |
| RH + Nantes (no contract) | 41 | 21 | 5 | **0** | 9 |
| RH + alternance (no city) | 29 | 6 | 2 | **0** | **0** |
| RH + Nantes + alternance (ticket) | 27 | 14 | 2 | **0** | **0** |
| comptable + Nantes + alternance | **0** | **0** | **0** | 0 | 0 |

**Refined queries observées (non-déterminisme confirmé)** :
- "RH" → "Recruitment" OU "Human Resources" OU "HR Assistant" (selon l'appel)
- "comptable" → "comptroller" (mot archaïque anglais)
- "ingenieur donnee" → "Data Engineer" (test unitaire le valide !)

## Les 11 bugs à fixer (ordre d'application)

### SPRINT 1 — Bugs critiques (8 fixes)

#### Fix #1 — Refiner contrainte langue + déterminisme
**Fichier** : `backend/prompts/job_scout_query_refiner.txt` + `backend/src/agents/job_scout/main_agent.py`
**Changement** :
1. Prompt : ajouter "If country is FR, KEEP output in French. Expand French abbreviations to French terms (RH→Ressources Humaines, NOT Recruitment)."
2. `_refine_query` : passer `country_code` au refiner pour contexte
3. `temperature=0.0` sur le query_refiner SubAgent (actuellement 0.1) pour déterminisme
**Impact attendu** : Adzuna FR et FT répondent aux queries françaises

#### Fix #2 — Query fan-out (original + refined en parallèle)
**Fichier** : `backend/src/agents/job_scout/main_agent.py` lignes 182-222
**Changement** :
1. Après `_refine_query`, si `refined != original` → lancer **2 appels** `aggregate_jobs` en parallèle (original + refined)
2. Fusionner les résultats avec dédup global
3. Variable de contrôle `enable_fan_out: bool = True`
**Impact attendu** : +30% à +40% de raw results

#### Fix #3 — France Travail : filtre géographique natif
**Fichiers** : `backend/src/services/job_providers/france_travail.py` + `backend/src/utils/geo.py` + `backend/src/api/routes/static_data.py`
**Changement** :
1. `search_cities_nominatim` retourne `{name, lat, lon, postcode, osm_id}` (déjà dispo dans réponse Nominatim)
2. `/api/cities/search` propage ces champs
3. Ajouter `city_lat`, `city_lon` dans `JobSearchRequest` schema
4. France Travail : si `city_lat` + `city_lon` → utiliser `latitude` + `longitude` + `distance=30` (km)
5. NE PLUS mélanger ville dans `motsCles`
**Impact attendu** : FT répond pour recherches géolocalisées

#### Fix #4 — Adzuna alternance : post-filter au lieu d'enrichir
**Fichier** : `backend/src/services/job_providers/adzuna.py` lignes 89-103
**Changement** :
1. Supprimer l'enrichissement `params["what"] = f"{what} alternance"`
2. Ajouter après réception : filtrer les résultats pour garder ceux dont titre OR description contient un signal alternance
3. Marquer `contract_type = "Alternance"` sur les jobs matchés
**Impact attendu** : Adzuna répond en alternance

#### Fix #5 — contract_types filter élargi
**Fichier** : `backend/src/api/routes/jobs.py` lignes 187-213 (`apply_advanced_filters`)
**Changement** :
1. Créer `CONTRACT_SIGNALS` dict (par type)
2. Fonction `matches_contract(job, target_types)` qui vérifie :
   - `job.contract_type` normalisé in target_types → OK
   - OU signaux présents dans titre + description → OK
   - OU `contract_type` vide (inchangé)
**Impact attendu** : +30% à +50% de jobs gardés

#### Fix #6 — Pre-filter relevance : accepter len<3
**Fichier** : `backend/src/agents/job_scout/main_agent.py` lignes 383-444
**Changement** :
1. Ligne 416 : supprimer `if len(qw) < 3: continue`
2. Ligne 399 : utiliser **union** des mots originaux + refined comme `query_words`
**Impact attendu** : RH/IT/UX/JS matchent en fuzzy

#### Fix #7 — `max_days = 120` par défaut, passé à tous les providers
**Fichiers** : `backend/src/models/schemas.py` + `backend/src/agents/job_scout/main_agent.py` + `backend/src/services/job_providers/aggregator.py` + chaque provider
**Changement** :
1. `schemas.py` : `max_days: int = Field(default=120, ge=1, le=180)`
2. `aggregator.py` ligne 70-71 : passer `max_days` à **tous** les providers, pas juste Adzuna
3. FT + JSearch + SerpAPI : accepter `max_days` dans signature et appliquer si supporté
**Impact attendu** : +50% à +100% d'offres anciennes valides

#### Fix #8 — Cleanup des filtres restants
**Fichier** : `backend/src/agents/job_scout/main_agent.py`
**Changement** :
1. Dédup fingerprint ligne 374 : utiliser titre complet + ville (plus strict)
2. `_filter_school_offers` : exiger 2+ signaux au lieu de 1
**Impact attendu** : +10% à +20% de faux négatifs évités

---

### SPRINT 2 — Bug bloquant à investiguer (1 fix)

#### Fix #9 — POST /api/jobs/search TypeError
**Fichier** : `backend/src/api/routes/jobs.py` lignes 283-480
**Investigation requise** :
1. Reproduire en local avec debug complet
2. OU lire les logs Railway pour la stack trace
3. Probable : sérialisation cache Redis ou mismatch Pydantic model
**Impact** : endpoint POST 100% cassé → actuellement utilisable par l'app mobile/autres clients

---

## Méthodologie d'application (stricte)

Pour **CHAQUE fix** :

1. **Lire** le fichier à modifier entièrement
2. **Vérifier** avec `localcoder find` si code similaire existe ailleurs
3. **Proposer** le diff (Edit tool, pas Write)
4. **Tester en prod** avec le JWT : comparer raw/final/sources AVANT/APRÈS
5. **Commit** avec message descriptif `fix(jobs): <description>`
6. **Ne jamais** passer au fix suivant sans avoir validé le précédent

## Commandes de test (réutilisables)

```bash
# Refresh JWT
SUPABASE_URL="https://ngiakfikbuyugqfqtfwp.supabase.co"
ANON_KEY="<voir env frontend>"
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"test-premium@huntzenjobs.com","password":"TestPremium2026!"}' \
  | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); open('/tmp/hz_jwt.txt','w').write(d['access_token'])"

# Reset quota (compte premium f30e8234-...)
python3 -c "
import httpx
SERVICE_KEY = '<voir env backend>'
httpx.patch(
    'https://ngiakfikbuyugqfqtfwp.supabase.co/rest/v1/usage_quotas?user_id=eq.f30e8234-0968-4745-a1c4-8ebee3e2d9be&quota_date=eq.2026-04-05',
    headers={'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}', 'Content-Type': 'application/json'},
    json={'job_searches_used': 0},
)"

# Test suite principal (à lancer après chaque fix)
JWT=$(cat /tmp/hz_jwt.txt)
API="https://huntzenjobs-production.up.railway.app"

run() {
    curl -sS --max-time 90 "$2" -H "Authorization: Bearer $JWT" -o /tmp/hz_resp.json
    python3 -c "
import json
d = json.load(open('/tmp/hz_resp.json'))
if 'detail' in d: print(f'  $1 -> ERROR: {d[\"detail\"]}'); exit()
m = d.get('metadata', {})
ft = sum(1 for j in d.get('jobs', []) if j.get('source') == 'france_travail')
adz = sum(1 for j in d.get('jobs', []) if j.get('source') == 'adzuna')
nantes = sum(1 for j in d.get('jobs', []) if 'nantes' in (j.get('location') or '').lower())
print(f'  $1')
print(f'    raw:{m.get(\"total_raw\")} final:{len(d.get(\"jobs\", []))} sources:{m.get(\"sources_used\")}')
print(f'    FT:{ft} | Adzuna:{adz} | Jobs à Nantes:{nantes}/{len(d.get(\"jobs\", []))}')
print(f'    refined: \"{m.get(\"refined_query\")}\"')"
}

run "RH Nantes alternance" "$API/api/jobs/search?q=RH&country=fr&city=Nantes&contract=alternance&limit=50"
run "comptable Nantes alternance" "$API/api/jobs/search?q=comptable&country=fr&city=Nantes&contract=alternance&limit=50"
run "marketing Nantes" "$API/api/jobs/search?q=marketing&country=fr&city=Nantes&limit=50"
```

## Baseline actuelle (à battre)

| Recherche | Raw | Final | Sources actives (sur 5) | Jobs à Nantes |
|---|---|---|---|---|
| RH Nantes alternance | 27 | 14 | 2 (jsearch, google_jobs) | 13 |
| comptable Nantes alternance | **0** | **0** | **0** | 0 |
| marketing Nantes | 41 | 21 | 5 | 9 |

## Objectif après Sprint 1

| Recherche | Raw cible | Final cible | Sources cible | Jobs à Nantes cible |
|---|---|---|---|---|
| RH Nantes alternance | ≥80 | ≥50 | ≥4 | ≥30 |
| comptable Nantes alternance | ≥50 | ≥30 | ≥4 | ≥20 |
| marketing Nantes | ≥100 | ≥70 | 5 | ≥40 |

## Notes importantes

- **NE PAS** augmenter le quota free (décision user)
- **NE PAS** mettre max_days=30 → **120 (4 mois)** direct (décision user)
- **Query fan-out** : solution préférée au lieu de supprimer le refiner (décision user)
- **CONVENTIONS.md** : respecter strictement — planifier, valider, vérifier, jamais casser le code existant

## Reprise de session

Pour reprendre dans une nouvelle session Claude Code, lire ce fichier + :
1. `git checkout fix/job-search-critical-bugs`
2. `localcoder index` (refresh memoire)
3. Commencer par Fix #1
4. Suivre la méthodologie stricte ci-dessus
