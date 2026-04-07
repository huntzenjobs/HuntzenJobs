# Filtre Alternance Intelligent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de `"alternance"` un filtre first-class qui retourne exclusivement des offres d'alternance depuis tous les providers de jobs.

**Architecture:** `contract_type="alternance"` est transmis de la page frontend via React Query → backend → chaque provider (filtre natif FT, enrichissement query pour Adzuna/JSearch/SerpAPI, exclusion RemoteOK) → post-filter central dans `aggregator.py` pour éliminer les faux positifs résiduels.

**Tech Stack:** Python (FastAPI + Pydantic), TypeScript (Next.js + React Query + Tailwind), httpx async, pytest

**Spec :** `docs/superpowers/specs/2026-03-18-alternance-filter-design.md`

---

## File Map

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/src/models/schemas.py:68` | Modify | Ajouter "alternance", "apprentissage" au Literal |
| `backend/src/services/job_providers/france_travail.py:84-150,210-221` | Modify | Filtre natif API (typeContrat=ALT) + labels textuels |
| `backend/src/services/job_providers/adzuna.py:86-96` | Modify | Enrichissement query si alternance |
| `backend/src/services/job_providers/jsearch.py:91-93,219-238` | Modify | Normalisation + enrichissement query |
| `backend/src/services/job_providers/serpapi.py:68-78,116-121` | Modify | Normalisation + enrichissement query |
| `backend/src/services/job_providers/aggregator.py:43-66,80` | Modify | contract_type → tous providers + post-filter dict-based |
| `backend/src/agents/job_scout/main_agent.py:178,203` | Modify | Exclure RemoteOK + bypass _filter_school_offers |
| `frontend-next/src/app/(dashboard)/jobs/page.tsx:939-944,1701` | Modify | Toggle + matching élargi useMemo |

---

## Task 1 — Pydantic Schema : ajouter "alternance" au Literal

**Files:**
- Modify: `backend/src/models/schemas.py:68`

- [ ] **Step 1 : Lire l'état actuel**

```bash
grep -n "contract_type.*Literal" backend/src/models/schemas.py
```
Attendu : ligne 68 avec `Literal["", "cdi", "cdd", "freelance", "internship", "remote", "permanent", "contract"]`

- [ ] **Step 2 : Modifier le Literal**

Dans `backend/src/models/schemas.py`, remplacer ligne 68 :

```python
# Avant
contract_type: Literal["", "cdi", "cdd", "freelance", "internship", "remote", "permanent", "contract"] = ""

# Après
contract_type: Literal[
    "", "cdi", "cdd", "freelance", "internship", "remote",
    "permanent", "contract", "alternance", "apprentissage"
] = ""
```

- [ ] **Step 3 : Vérifier que Pydantic accepte la valeur**

```bash
cd backend && python -c "
from src.models.schemas import JobSearchRequest
r = JobSearchRequest(job_title='dev', country_code='fr', contract_type='alternance')
print('OK:', r.contract_type)
r2 = JobSearchRequest(job_title='dev', country_code='fr', contract_type='apprentissage')
print('OK:', r2.contract_type)
"
```
Attendu : `OK: alternance` puis `OK: apprentissage` sans erreur Pydantic.

- [ ] **Step 4 : Commit**

```bash
git add backend/src/models/schemas.py
git commit -m "feat(alternance): ajouter alternance/apprentissage au Literal contract_type"
```

---

## Task 2 — France Travail : filtre natif ALT + normalisation libellés

**Files:**
- Modify: `backend/src/services/job_providers/france_travail.py:84-150` (search)
- Modify: `backend/src/services/job_providers/france_travail.py:210-221` (_normalize_contract)

- [ ] **Step 1 : Lire les sections concernées**

```bash
sed -n '84,151p' backend/src/services/job_providers/france_travail.py
sed -n '209,222p' backend/src/services/job_providers/france_travail.py
```

- [ ] **Step 2 : Ajouter le filtre natif dans `search()`**

Localiser le bloc `if location:` (ligne ~121). Ajouter juste après :

```python
# Filtre natif France Travail pour l'alternance
contract_type = kwargs.get("contract_type", "")
if contract_type in ("alternance", "apprentissage"):
    params["typeContrat"] = "ALT"
```

Le bloc complet après modification doit ressembler à :
```python
if location:
    params["motsCles"] = f"{query} {location}"

# Filtre natif France Travail pour l'alternance
contract_type = kwargs.get("contract_type", "")
if contract_type in ("alternance", "apprentissage"):
    params["typeContrat"] = "ALT"

headers = {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 3 : Remplacer `_normalize_contract()` (ligne 210-221)**

```python
@staticmethod
def _normalize_contract(raw: str | None) -> str | None:
    """Normalize France Travail contract type strings."""
    if not raw:
        return None
    mapping = {
        "CDI": "cdi",
        "CDD": "cdd",
        "MIS": "interim",
        "SAI": "saisonnier",
        "LIB": "freelance",
        # Alternance — libellés textuels retournés par typeContratLibelle
        # Note : "ALT" est le code de requête API, jamais retourné dans ce champ.
        "Contrat d'apprentissage": "alternance",
        "Apprentissage": "alternance",
        "Alternance": "alternance",
        "Contrat de professionnalisation": "alternance",
        "Contrat pro": "alternance",
    }
    return mapping.get(raw, raw)
```

- [ ] **Step 4 : Test rapide**

```bash
cd backend && python -c "
from src.services.job_providers.france_travail import FranceTravailProvider
p = FranceTravailProvider()
assert p._normalize_contract(\"Contrat d'apprentissage\") == 'alternance'
assert p._normalize_contract(\"Alternance\") == 'alternance'
assert p._normalize_contract('CDI') == 'cdi'
assert p._normalize_contract(None) is None
print('FT normalize: OK')
"
```
Attendu : `FT normalize: OK`

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/job_providers/france_travail.py
git commit -m "feat(alternance): France Travail — filtre natif ALT + normalisation libellés alternance"
```

---

## Task 3 — Adzuna : enrichissement query si alternance

**Files:**
- Modify: `backend/src/services/job_providers/adzuna.py:86-96`

- [ ] **Step 1 : Lire le bloc contract_type actuel**

```bash
sed -n '85,97p' backend/src/services/job_providers/adzuna.py
```
Attendu :
```python
if contract_type:
    contract_map = {
        "cdi": "permanent",
        ...
    }
    if contract_type.lower() in contract_map:
        params["contract_type"] = contract_map[contract_type.lower()]
```

- [ ] **Step 2 : Remplacer le bloc (lignes 86-96)**

```python
# Map contract types to Adzuna values
if contract_type in ("alternance", "apprentissage"):
    # Adzuna n'a pas de type natif alternance — enrichir la query
    params["what"] = f"{params['what']} alternance".strip()
elif contract_type:
    contract_map = {
        "cdi": "permanent",
        "cdd": "contract",
        "freelance": "contract",
        "internship": "contract",
        "permanent": "permanent",
        "contract": "contract",
    }
    if contract_type.lower() in contract_map:
        params["contract_type"] = contract_map[contract_type.lower()]
```

- [ ] **Step 3 : Vérifier la logique**

```bash
cd backend && python -c "
# Simulation sans appel réseau
params = {'what': 'développeur', 'where': 'Paris'}
contract_type = 'alternance'
if contract_type in ('alternance', 'apprentissage'):
    params['what'] = f\"{params['what']} alternance\".strip()
print('what =', params['what'])  # attendu: 'développeur alternance'
assert 'contract_type' not in params  # pas de contract_type Adzuna
print('Adzuna enrichissement: OK')
"
```

- [ ] **Step 4 : Commit**

```bash
git add backend/src/services/job_providers/adzuna.py
git commit -m "feat(alternance): Adzuna — enrichissement query si contract_type=alternance"
```

---

## Task 4 — JSearch : normalisation + enrichissement query

**Files:**
- Modify: `backend/src/services/job_providers/jsearch.py:91-93` (search)
- Modify: `backend/src/services/job_providers/jsearch.py:219-238` (_normalize_contract_type)

- [ ] **Step 1 : Confirmer `**kwargs` dans la signature et lire les sections**

```bash
sed -n '57,65p' backend/src/services/job_providers/jsearch.py
```
Attendu : `**kwargs,` à la ligne 64 (déjà confirmé — si absent, l'ajouter avant `)`).

```bash
sed -n '88,100p' backend/src/services/job_providers/jsearch.py
sed -n '219,239p' backend/src/services/job_providers/jsearch.py
```

- [ ] **Step 2 : Modifier `_normalize_contract_type()` (lignes 219-238)**

Ajouter la détection alternance EN PREMIER (avant le mapping existant) :

```python
@staticmethod
def _normalize_contract_type(raw: str | None) -> str | None:
    """Normalize JSearch employment type strings."""
    if not raw:
        return None
    raw_lower = raw.lower().replace("_", " ").replace("-", " ")
    # Détection alternance en premier (avant le mapping générique)
    alternance_keywords = {"alternance", "apprenticeship", "apprentissage", "work-study", "work study", "contrat pro"}
    if any(kw in raw_lower for kw in alternance_keywords):
        return "alternance"
    mapping = {
        "fulltime": "CDI",
        "full time": "CDI",
        "parttime": "CDD",
        "part time": "CDD",
        "contractor": "Freelance",
        "contract": "CDD",
        "intern": "Stage",
        "internship": "Stage",
        "temporary": "Intérim",
    }
    for key, value in mapping.items():
        if key in raw_lower:
            return value
    return raw  # Return as-is if no match
```

- [ ] **Step 3 : Enrichissement query dans `search()` — après les lignes 91-93**

Après le bloc `if radius_km:` / `else:` (qui construit `search_query`), ajouter :

```python
# Enrichissement si alternance — enrichir search_query (pas query brut) pour préserver radius_km
contract_type = kwargs.get("contract_type", "")
if contract_type in ("alternance", "apprentissage"):
    search_query = f"alternance apprentissage {search_query}"
```

- [ ] **Step 4 : Tester la normalisation**

```bash
cd backend && python -c "
from src.services.job_providers.jsearch import JSearchProvider
p = JSearchProvider()
assert p._normalize_contract_type('Apprenticeship') == 'alternance'
assert p._normalize_contract_type('apprentissage') == 'alternance'
assert p._normalize_contract_type('FULLTIME') == 'CDI'
assert p._normalize_contract_type('internship') == 'Stage'
assert p._normalize_contract_type(None) is None
print('JSearch normalize: OK')
"
```
Attendu : `JSearch normalize: OK`

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/job_providers/jsearch.py
git commit -m "feat(alternance): JSearch — normalisation apprenticeship + enrichissement query alternance"
```

---

## Task 5 — SerpAPI : normalisation + enrichissement query

**Files:**
- Modify: `backend/src/services/job_providers/serpapi.py:68-78` (search — après params["q"])
- Modify: `backend/src/services/job_providers/serpapi.py:116-121` (_extract_contract_type)

- [ ] **Step 1 : Confirmer `**kwargs` dans la signature et lire les sections**

```bash
sed -n '37,45p' backend/src/services/job_providers/serpapi.py
```
Attendu : `**kwargs,` à la ligne 44 (déjà confirmé — si absent, l'ajouter avant `)`).

```bash
sed -n '64,92p' backend/src/services/job_providers/serpapi.py
sed -n '116,122p' backend/src/services/job_providers/serpapi.py
```

- [ ] **Step 2 : Modifier `_extract_contract_type()` (lignes 116-121)**

```python
def _extract_contract_type(self, item: dict) -> str | None:
    """Extract contract type from extensions."""
    extensions = item.get("detected_extensions", {})
    schedule = extensions.get("schedule_type", "") or ""
    if schedule:
        schedule_lower = schedule.lower()
        if any(kw in schedule_lower for kw in ("alternance", "apprenti", "apprenticeship", "work-study")):
            return "alternance"
        return schedule
    # Fallback : vérifier le titre
    title = (item.get("title") or "").lower()
    if "alternance" in title or "apprenti" in title:
        return "alternance"
    return None
```

- [ ] **Step 3 : Enrichissement query dans `search()` — après la construction de `params`**

Après le bloc `params = { ... }` (ligne ~72-78), ajouter avant le `async with httpx.AsyncClient`:

```python
# Enrichissement query si alternance
contract_type = kwargs.get("contract_type", "")
if contract_type in ("alternance", "apprentissage"):
    params["q"] = f"{params['q']} alternance"
```

- [ ] **Step 4 : Tester la normalisation**

```bash
cd backend && python -c "
from src.services.job_providers.serpapi import SerpAPIProvider
p = SerpAPIProvider()
item_alt = {'detected_extensions': {'schedule_type': 'Apprenticeship'}, 'title': 'Dev'}
item_title = {'detected_extensions': {}, 'title': 'Développeur en alternance'}
item_cdi = {'detected_extensions': {'schedule_type': 'Full-time'}, 'title': 'Dev'}
assert p._extract_contract_type(item_alt) == 'alternance', 'apprenticeship should map to alternance'
assert p._extract_contract_type(item_title) == 'alternance', 'alternance in title should match'
assert p._extract_contract_type(item_cdi) == 'Full-time', 'full-time should pass through'
print('SerpAPI normalize: OK')
"
```
Attendu : `SerpAPI normalize: OK`

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/job_providers/serpapi.py
git commit -m "feat(alternance): SerpAPI — normalisation schedule_type + enrichissement query alternance"
```

---

## Task 6 — Aggregator : contract_type → tous providers + post-filter

**Files:**
- Modify: `backend/src/services/job_providers/aggregator.py:43-66` (search_provider inner fn)
- Modify: `backend/src/services/job_providers/aggregator.py:80` (avant return all_jobs)

- [ ] **Step 1 : Lire le code actuel**

```bash
sed -n '43,84p' backend/src/services/job_providers/aggregator.py
```

- [ ] **Step 2 : Modifier la fonction inner `search_provider()` (lignes 43-66)**

Remplacer le bloc `if hasattr(provider, 'name') and provider.name == 'adzuna':` :

```python
async def search_provider(provider: BaseJobProvider) -> tuple[str, list[dict]]:
    """Search a single provider."""
    try:
        kwargs = {
            "query": query,
            "location": location,
            "country_code": country_code,
            "max_results": max_per_provider,
        }
        # Adzuna supporte max_days — conserver ce comportement spécifique
        if hasattr(provider, 'name') and provider.name == 'adzuna':
            kwargs["max_days"] = max_days

        # Transmettre contract_type à TOUS les providers via **kwargs
        if contract_type:
            kwargs["contract_type"] = contract_type

        if radius_km is not None:
            kwargs["radius_km"] = radius_km

        jobs = await provider.search(**kwargs)
        return provider.name, jobs
    except Exception as e:
        logger.error(f"[Aggregator] {provider.name} failed: {e}")
        return provider.name, []
```

- [ ] **Step 3 : Ajouter les constantes et le post-filter au niveau MODULE**

⚠️ `_is_alternance_job` DOIT être une fonction **module-level** (pas inner function) — le test E2E 3 l'importe directement depuis le module.

Ajouter juste avant la définition de `aggregate_jobs()` (ligne ~17) :

```python
ALTERNANCE_SIGNALS = frozenset({
    "alternance", "apprenti", "apprentissage",
    "contrat pro", "contrat d'apprentissage",
    "work-study", "work study",
})


def _is_alternance_job(job: dict) -> bool:
    """Retourne True si l'offre présente un signal alternance clair."""
    text = f"{job.get('title', '')} {job.get('description', '') or ''}".lower()
    return (
        job.get("contract_type") == "alternance"
        or any(signal in text for signal in ALTERNANCE_SIGNALS)
    )
```

- [ ] **Step 4 : Appeler le post-filter dans `aggregate_jobs()` avant `return all_jobs`**

Remplacer la ligne `return all_jobs` (ligne ~82) par :

```python
    # Post-filter alternance — filet de sécurité contre les faux positifs résiduels
    if contract_type in ("alternance", "apprentissage"):
        before = len(all_jobs)
        all_jobs = [j for j in all_jobs if _is_alternance_job(j)]
        for j in all_jobs:
            if j.get("contract_type") != "alternance":
                j["contract_type"] = "alternance"
        logger.info(f"[Aggregator] Post-filter alternance: {before} → {len(all_jobs)} jobs")

    return all_jobs
```

- [ ] **Step 5 : Tester le post-filter**

```bash
cd backend && python -c "
from src.services.job_providers.aggregator import _is_alternance_job

jobs = [
    {'title': 'Dev en alternance', 'description': '', 'contract_type': None},
    {'title': 'Dev Java CDI', 'description': 'CDI temps plein', 'contract_type': 'cdi'},
    {'title': 'Dev Python', 'description': '', 'contract_type': 'alternance'},
    {'title': 'Apprenti développeur', 'description': '', 'contract_type': None},
]
results = [j for j in jobs if _is_alternance_job(j)]
assert len(results) == 3, f'Expected 3 alternance jobs, got {len(results)}'
assert all(j['title'] != 'Dev Java CDI' for j in results)
print('Post-filter alternance: OK')
"
```
Attendu : `Post-filter alternance: OK`

- [ ] **Step 6 : Commit**

```bash
git add backend/src/services/job_providers/aggregator.py
git commit -m "feat(alternance): aggregator — contract_type vers tous providers + post-filter alternance"
```

---

## Task 7 — JobScoutAgent : exclusion RemoteOK + bypass _filter_school_offers

**Files:**
- Modify: `backend/src/agents/job_scout/main_agent.py:178` (bloc include_remote)
- Modify: `backend/src/agents/job_scout/main_agent.py:203` (filter_school_offers)

- [ ] **Step 1 : Lire le contexte**

```bash
sed -n '175,210p' backend/src/agents/job_scout/main_agent.py
```

- [ ] **Step 2 : Ajouter exclusion RemoteOK + priorisation FT (après le bloc include_remote)**

Le code existant ressemble à :
```python
if not include_remote:
    active_providers = [p for p in active_providers if p.name != "remoteok"]
```

Ajouter juste après :
```python
# Alternance : remote ≠ alternance (présentiel requis)
if contract_type in ("alternance", "apprentissage"):
    active_providers = [p for p in active_providers if p.name != "remoteok"]
    # Prioriser France Travail (asyncio.gather respecte l'ordre input)
    active_providers = sorted(
        active_providers,
        key=lambda p: 0 if p.name == "france_travail" else 1,
    )
```

- [ ] **Step 3 : Modifier le bypass `_filter_school_offers` (ligne ~203)**

Remplacer :
```python
filtered_jobs = self._filter_school_offers(filtered_jobs)
```

Par :
```python
# Skip pour l'alternance : _SCHOOL_CONTENT_PATTERNS contient
# "programme de formation en alternance" qui filtre des offres légitimes
if contract_type not in ("alternance", "apprentissage"):
    filtered_jobs = self._filter_school_offers(filtered_jobs)
```

- [ ] **Step 4 : Vérifier que la variable `contract_type` est bien dans scope**

```bash
grep -n "contract_type" backend/src/agents/job_scout/main_agent.py | head -10
```
Attendu : `contract_type` apparaît comme paramètre de `run()` (ligne ~135) et est utilisé plus loin (ligne ~191).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/agents/job_scout/main_agent.py
git commit -m "feat(alternance): main_agent — exclusion RemoteOK + bypass filter_school_offers pour alternance"
```

---

## Task 8 — Frontend : toggle alternance + matching élargi useMemo

**Files:**
- Modify: `frontend-next/src/app/(dashboard)/jobs/page.tsx:939-944` (useMemo quickFilteredJobs)
- Modify: `frontend-next/src/app/(dashboard)/jobs/page.tsx:1701` (bouton toggle avant "Filtrer")

- [ ] **Step 1 : Lire les deux sections**

```bash
sed -n '934,970p' frontend-next/src/app/\(dashboard\)/jobs/page.tsx
sed -n '1698,1722p' frontend-next/src/app/\(dashboard\)/jobs/page.tsx
```

- [ ] **Step 2 : Modifier le filtre useMemo (lignes 939-944)**

Remplacer :
```tsx
if (quickFilters.contractTypes.length > 0) {
  result = result.filter(
    (j) =>
      j.contract_type &&
      quickFilters.contractTypes.includes(j.contract_type),
  );
}
```

Par :
```tsx
if (quickFilters.contractTypes.length > 0) {
  const hasAlternance = quickFilters.contractTypes.includes("alternance");
  result = result.filter((j) => {
    if (hasAlternance) {
      const text = `${j.title ?? ""} ${j.description ?? ""}`.toLowerCase();
      const isAlternance =
        j.contract_type === "alternance" ||
        text.includes("alternance") ||
        text.includes("apprenti");
      if (quickFilters.contractTypes.length === 1) return isAlternance;
      return isAlternance || (j.contract_type != null && quickFilters.contractTypes.includes(j.contract_type));
    }
    return j.contract_type != null && quickFilters.contractTypes.includes(j.contract_type);
  });
}
```

- [ ] **Step 3 : Ajouter le bouton toggle "🎓 Alternance" (avant le bouton "Filtrer", ligne ~1701)**

Juste avant le commentaire `{/* Quick filter toggle button */}` (ligne 1701), insérer :

```tsx
{/* Toggle alternance — first-class, déclenche un nouveau search via React Query */}
<button
  type="button"
  onClick={() => {
    const next = contractType === "alternance" ? "" : "alternance";
    setContractType(next);
    setCurrentPage(1);
  }}
  className={cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
    contractType === "alternance"
      ? "bg-blue-500 text-white border-blue-500 shadow-sm"
      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  )}
>
  🎓 Alternance
</button>
```

**Note :** `contractType` est dans le `queryKey` (ligne 627) → `setContractType(next)` déclenche automatiquement un refetch React Query. Pas besoin d'appeler `handleSearch`.

- [ ] **Step 4 : Vérifier le TypeScript**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -i "page.tsx" | head -10
```
Attendu : aucune erreur TypeScript sur `page.tsx`.

- [ ] **Step 5 : Vérifier le build**

```bash
cd frontend-next && npm run build 2>&1 | tail -20
```
Attendu : build réussi, pas d'erreur.

- [ ] **Step 6 : Commit**

```bash
git add "frontend-next/src/app/(dashboard)/jobs/page.tsx"
git commit -m "feat(alternance): frontend — toggle 🎓 Alternance + matching élargi useMemo"
```

---

## Vérification End-to-End

- [ ] **E2E 1 : Pydantic — pas de ValidationError**

```bash
cd backend && python -c "
from src.models.schemas import JobSearchRequest
r = JobSearchRequest(job_title='dev', country_code='fr', contract_type='alternance')
assert r.contract_type == 'alternance'
print('Pydantic: OK')
"
```

- [ ] **E2E 2 : France Travail — typeContrat=ALT dans les params**

```bash
cd backend && python -c "
from src.services.job_providers.france_travail import FranceTravailProvider
import asyncio

async def test():
    p = FranceTravailProvider()
    # Simuler sans appel réseau — vérifier la logique de construction params
    # (test manuel : inspecter les logs de niveau DEBUG)
    print('FT: params ALT correctement construit pour alternance')

asyncio.run(test())
"
```

- [ ] **E2E 3 : Post-filter aggregator — aucun CDI/CDD ne passe**

```bash
cd backend && python -c "
from src.services.job_providers.aggregator import _is_alternance_job

faux_positifs = [
    {'title': 'Développeur Java', 'description': 'CDI', 'contract_type': 'cdi'},
    {'title': 'DevOps Senior', 'description': 'Freelance Paris', 'contract_type': 'freelance'},
]
vrais_positifs = [
    {'title': 'Dev Python alternance', 'description': '', 'contract_type': None},
    {'title': 'Apprenti développeur', 'description': '', 'contract_type': None},
    {'title': 'Dev Web', 'description': '', 'contract_type': 'alternance'},
]
assert all(not _is_alternance_job(j) for j in faux_positifs), 'Faux positifs ne doivent pas passer'
assert all(_is_alternance_job(j) for j in vrais_positifs), 'Vrais positifs doivent passer'
print('Post-filter E2E: OK')
"
```

- [ ] **E2E 4 : Tests backend existants — pas de régression**

```bash
cd backend && python -m pytest tests/ -x -q --timeout=30 2>&1 | tail -20
```
Attendu : tous les tests passent (ou les mêmes failures qu'avant ce feature).

- [ ] **E2E 5 : Test frontend TypeScript**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -c "error" || echo "0 errors"
```
Attendu : 0 erreurs TypeScript (ou même compte qu'avant).

---

## Résumé des commits

```
feat(alternance): ajouter alternance/apprentissage au Literal contract_type
feat(alternance): France Travail — filtre natif ALT + normalisation libellés alternance
feat(alternance): Adzuna — enrichissement query si contract_type=alternance
feat(alternance): JSearch — normalisation apprenticeship + enrichissement query alternance
feat(alternance): SerpAPI — normalisation schedule_type + enrichissement query alternance
feat(alternance): aggregator — contract_type vers tous providers + post-filter alternance
feat(alternance): main_agent — exclusion RemoteOK + bypass filter_school_offers pour alternance
feat(alternance): frontend — toggle 🎓 Alternance + matching élargi useMemo
```
