# Filtre Alternance Intelligent — Design Spec

**Date :** 2026-03-18
**Statut :** Approuvé (v4 — corrigé après 3 reviews)
**Scope :** Backend (7 fichiers) + Frontend (2 fichiers)

---

## Contexte et Problème

Le type de contrat `"alternance"` est présent dans `static_data.py` mais ignoré dans toute la stack :

- `schemas.py:68` : absent du `Literal contract_type` → rejeté par Pydantic
- `france_travail.py:210` : `_normalize_contract()` sans labels alternance + FT ne reçoit pas `contract_type` via `aggregator.py`
- `adzuna.py:86` : aucun équivalent natif → alternance non transmis à l'API
- `jsearch.py:219` : `"apprenticeship"` non normalisé
- `serpapi.py:116` : `_extract_contract_type()` ignore les signaux alternance dans `detected_extensions`
- `aggregator.py:54` : `contract_type` transmis uniquement à Adzuna, pas à FT/JSearch/SerpAPI
- `main_agent.py:178` : RemoteOK non exclu pour alternance
- Frontend `jobs/page.tsx:939-944` : filtre client-side trop strict (exact match, rate les offres avec `contract_type=null`)

**Impact :** Un utilisateur cherchant de l'alternance reçoit des CDI/CDD/Freelance mélangés.

---

## Objectif

Faire de `"alternance"` un filtre **first-class** : un clic → uniquement des offres d'alternance.

---

## Architecture

```
Frontend → contract_type="alternance"
          ↓
Backend JobScoutAgent.run()
  ├── France Travail  → typeContrat=ALT dans params API + normalise labels textuels FT
  ├── Adzuna          → query enrichie : "{query} alternance"
  ├── JSearch         → query enrichie : "{query} alternance apprentissage"
  ├── SerpAPI         → query enrichie : "{query} alternance"
  └── RemoteOK        → EXCLU automatiquement
          ↓
aggregate_jobs() → transmet contract_type à TOUS les providers + déduplication
          ↓
post_filter_alternance() — dict-based — filet de sécurité
          ↓
Résultats 100% alternance
```

---

## Changements Détaillés

### 1. `backend/src/models/schemas.py`

Ajouter `"alternance"` et `"apprentissage"` au `Literal` de `contract_type` (ligne 68) :

```python
# Avant (ligne 68)
contract_type: Literal["", "cdi", "cdd", "freelance", "internship", "remote", "permanent", "contract"] = ""

# Après
contract_type: Literal[
    "", "cdi", "cdd", "freelance", "internship", "remote",
    "permanent", "contract", "alternance", "apprentissage"
] = ""
```

---

### 2. `backend/src/services/job_providers/france_travail.py`

**Deux modifications indépendantes :**

**2a — Filtre natif dans `search()` — extraire `contract_type` depuis `**kwargs` :**

La méthode `search()` (ligne 84) reçoit `**kwargs`. Ajouter après le bloc `if location:` (ligne 121) :

```python
# Après "if location: params["motsCles"] = ..."
contract_type = kwargs.get("contract_type", "")
if contract_type in ("alternance", "apprentissage"):
    params["typeContrat"] = "ALT"
```

**Rationale :** `typeContrat=ALT` est le code API officiel France Travail pour l'alternance/apprentissage. C'est un filtre natif — fiable et précis.

**2b — Normalisation des libellés textuels dans `_normalize_contract()` (ligne 210) :**

FT retourne `typeContratLibelle` comme libellé textuel (ex: "Contrat d'apprentissage"), pas le code technique. Le mapping doit utiliser les libellés :

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
        # Note : "ALT" est le code de requête API, jamais retourné dans typeContratLibelle.
        # Les libellés textuels ci-dessous sont les formes réelles retournées par l'API FT.
        "Contrat d'apprentissage": "alternance",
        "Apprentissage": "alternance",
        "Alternance": "alternance",
        "Contrat de professionnalisation": "alternance",
        "Contrat pro": "alternance",
    }
    return mapping.get(raw, raw)
```

**Rationale :** L'API FT retourne `typeContratLibelle` (libellé textuel), pas le code. Le mapping code (ALT) est ajouté par précaution mais le libellé textuel est la forme normale.

---

### 3. `backend/src/services/job_providers/adzuna.py`

Adzuna n'a pas de type "alternance" natif. Enrichissement de query dans `search()` (bloc `if contract_type:` ligne 86) :

```python
if contract_type in ("alternance", "apprentissage"):
    # Enrichir la query — Adzuna filtre par mots-clés dans titre/description
    params["what"] = f"{params['what']} alternance".strip()
    # Ne pas passer contract_type à Adzuna (pas de mapping dispo)
elif contract_type:
    contract_map = {
        "cdi": "permanent",
        "cdd": "contract",
        "permanent": "permanent",
        "contract": "contract",
    }
    if contract_type.lower() in contract_map:
        params["contract_type"] = contract_map[contract_type.lower()]
```

---

### 4. `backend/src/services/job_providers/jsearch.py`

**4a — Normalisation dans `_normalize_contract_type()` (ligne 219) :**

```python
@staticmethod
def _normalize_contract_type(raw: str | None) -> str | None:
    if not raw:
        return None
    contract_str = raw.lower()
    alternance_keywords = {"alternance", "apprenticeship", "apprentissage", "work-study", "work study", "contrat pro"}
    if any(kw in contract_str for kw in alternance_keywords):
        return "alternance"
    # ... mapping existant (FULLTIME → cdi, etc.)
```

**4b — Enrichissement de query dans `search()` (ligne 57) :**

La signature de JSearch inclut déjà `**kwargs`. Le paramètre entrant s'appelle `query`. Ajouter après la construction de `search_query` (lignes 91-93) :

```python
# Lignes 91-93 existantes (inchangées)
if radius_km:
    search_query = f"{query} in {location_str} within {radius_km} km"
else:
    search_query = f"{query} in {location_str}"

# NOUVEAU — enrichissement si alternance (contract_type passé via **kwargs depuis aggregator)
# IMPORTANT : enrichir search_query (déjà construit), PAS query brut — préserve radius_km
contract_type = kwargs.get("contract_type", "")
if contract_type in ("alternance", "apprentissage"):
    search_query = f"alternance apprentissage {search_query}"
```

**Rationale :** `**kwargs` est déjà présent dans la signature JSearch. `aggregator.py` passe `contract_type` via `kwargs`. Enrichir `search_query` (pas `query`) préserve le `within {radius_km} km` si présent.

---

### 5. `backend/src/services/job_providers/serpapi.py`

**5a — Normalisation dans `_extract_contract_type()` (ligne 116) :**

La méthode reçoit `item` (dict complet) et lit `detected_extensions.schedule_type` :

```python
def _extract_contract_type(self, item: dict) -> str | None:
    """Extract contract type from extensions."""
    extensions = item.get("detected_extensions", {})
    schedule = extensions.get("schedule_type", "")
    if schedule:
        schedule_lower = schedule.lower()
        if any(kw in schedule_lower for kw in ("alternance", "apprenti", "apprenticeship", "work-study")):
            return "alternance"
        return schedule
    # Vérifier aussi le titre pour les signaux alternance
    title = item.get("title", "").lower()
    if "alternance" in title or "apprenti" in title:
        return "alternance"
    return None
```

**5b — Enrichissement de query dans `search()` :**

SerpAPI a `**kwargs` dans sa signature. Extraire `contract_type` et enrichir `params["q"]` :

```python
# Après la construction de params["q"] dans search()
contract_type = kwargs.get("contract_type", "")
if contract_type in ("alternance", "apprentissage"):
    params["q"] = f"{params['q']} alternance"
```

---

### 6. `backend/src/services/job_providers/aggregator.py`

**Deux modifications :**

**6a — Transmettre `contract_type` à TOUS les providers** (pas seulement Adzuna) :

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
        # (FT, JSearch, SerpAPI l'extraient avec kwargs.get("contract_type", ""))
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

**Rationale :** `max_days` reste conditionnel à Adzuna (seul provider qui l'accepte). `contract_type` est transmis à tous via `**kwargs` — chaque provider l'extrait avec `kwargs.get("contract_type", "")` dans sa propre méthode `search()`.

**6b — Post-filter de sécurité (dict-based) :**

Ajouter à la fin de `aggregate_jobs()`, avant le `return all_jobs` :

```python
ALTERNANCE_SIGNALS = {
    "alternance", "apprenti", "apprentissage",
    "contrat pro", "contrat d'apprentissage",
    "work-study", "work study"
}

def _is_alternance_job(job: dict) -> bool:
    """Retourne True si l'offre présente un signal alternance clair."""
    text = f"{job.get('title', '')} {job.get('description', '') or ''}".lower()
    return (
        job.get("contract_type") == "alternance"
        or any(signal in text for signal in ALTERNANCE_SIGNALS)
    )

# Dans aggregate_jobs(), avant return all_jobs :
if contract_type in ("alternance", "apprentissage"):
    before = len(all_jobs)
    all_jobs = [j for j in all_jobs if _is_alternance_job(j)]
    # Normaliser le contract_type des offres retenues
    for j in all_jobs:
        if j.get("contract_type") != "alternance":
            j["contract_type"] = "alternance"
    logger.info(f"[Aggregator] Post-filter alternance: {before} → {len(all_jobs)} jobs")

return all_jobs
```

**Note :** `_is_alternance_job` est une fonction module-level (ou inner function dans `aggregate_jobs`). Elle travaille avec des `dict`, pas des objets Pydantic `Job`.

---

### 7. `backend/src/agents/job_scout/main_agent.py`

**Deux modifications dans `main_agent.py` :**

**7a — Exclure RemoteOK si alternance** (après le bloc `include_remote` existant, ligne ~178) :

```python
# Existant (lignes 177-179)
if not include_remote:
    active_providers = [p for p in active_providers if p.name != "remoteok"]

# NOUVEAU — exclure RemoteOK si alternance (remote ≠ alternance)
if contract_type in ("alternance", "apprentissage"):
    active_providers = [p for p in active_providers if p.name != "remoteok"]
    # Prioriser France Travail : asyncio.gather retourne les résultats dans l'ordre
    # des tâches input, donc sorted() place effectivement FT en tête de all_jobs.
    # FT retourne automatiquement [] si country_code != "fr".
    active_providers = sorted(
        active_providers,
        key=lambda p: 0 if p.name == "france_travail" else 1
    )
```

**7b — Désactiver `_filter_school_offers` si alternance** (ligne ~202-203) :

```python
# Existant (ligne 202-203)
# Step 3.6: Filter school/training-org offers disguised as employers
filtered_jobs = self._filter_school_offers(filtered_jobs)
```

Remplacer par :

```python
# Step 3.6: Filter school/training-org offers (skip pour alternance)
# _SCHOOL_CONTENT_PATTERNS contient "programme de formation en alternance" (ligne 60)
# ce qui supprimerait des offres alternance légitimes.
if contract_type not in ("alternance", "apprentissage"):
    filtered_jobs = self._filter_school_offers(filtered_jobs)
```

**Rationale :** `_SCHOOL_CONTENT_PATTERNS` (ligne 60) inclut `"programme de formation en alternance"`. En mode alternance, ce pattern apparaît dans les descriptions des CFA et PME proposant de vraies offres — les supprimer serait un faux positif systématique.

**Cache Redis :** `@redis_cache(ttl=900, prefix="jobs")` sur `run()` (ligne 129) utilise les arguments comme cache key. `contract_type` est un paramètre nommé → cache key différente entre `contract_type=""` et `contract_type="alternance"`. Pas de collision.

---

### 8. `frontend-next/src/app/(dashboard)/jobs/page.tsx`

**Le toggle alternance va dans `jobs/page.tsx`**, pas dans `search-form-inline.tsx`.

**Pourquoi :** `SearchParams` (interface de `search-form-inline.tsx`) ne contient pas `contract_type`. La state `contractType` est gérée dans `jobs/page.tsx` et transmise au search à la ligne 639. Le toggle doit donc vivre au niveau page.

**8a — Bouton toggle dans la zone des quick filters :**

`contractType` est déjà dans le `queryKey` à la ligne 627 — `setContractType(next)` seul déclenche un refetch React Query automatique. Pas besoin d'appeler `handleSearch`.

```tsx
{/* Toggle alternance — first-class, avant les autres quick filters */}
<button
  type="button"
  onClick={() => {
    const next = contractType === "alternance" ? "" : "alternance";
    setContractType(next);
    setCurrentPage(1); // reset pagination
  }}
  className={cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
    contractType === "alternance"
      ? "bg-blue-500 text-white border-blue-500 shadow-sm"
      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  )}
>
  🎓 Alternance
</button>
```

**8b — Matching élargi dans le `useMemo` `quickFilteredJobs` (lignes 939-944) :**

Remplacer le bloc `if (quickFilters.contractTypes.length > 0)` existant :

```tsx
// Avant (lignes 939-944)
if (quickFilters.contractTypes.length > 0) {
  result = result.filter(
    (j) =>
      j.contract_type &&
      quickFilters.contractTypes.includes(j.contract_type),
  );
}

// Après
if (quickFilters.contractTypes.length > 0) {
  const hasAlternance = quickFilters.contractTypes.includes("alternance");
  result = result.filter((j) => {
    // Matching élargi pour alternance (certaines offres ont contract_type=null mais "alternance" dans le titre)
    if (hasAlternance) {
      const text = `${j.title ?? ""} ${j.description ?? ""}`.toLowerCase();
      const isAlternance =
        j.contract_type === "alternance" ||
        text.includes("alternance") ||
        text.includes("apprenti");
      // Si alternance est le seul filtre actif
      if (quickFilters.contractTypes.length === 1) return isAlternance;
      // Si mix avec d'autres types
      return isAlternance || (j.contract_type != null && quickFilters.contractTypes.includes(j.contract_type));
    }
    return j.contract_type != null && quickFilters.contractTypes.includes(j.contract_type);
  });
}
```

---

## Fichiers Modifiés

| # | Fichier | Changement principal |
|---|---|---|
| 1 | `backend/src/models/schemas.py` | Ajouter "alternance", "apprentissage" au Literal |
| 2 | `backend/src/services/job_providers/france_travail.py` | typeContrat=ALT dans search() + labels textuels dans _normalize_contract() |
| 3 | `backend/src/services/job_providers/adzuna.py` | Enrichissement query si alternance |
| 4 | `backend/src/services/job_providers/jsearch.py` | Normalisation + enrichissement query |
| 5 | `backend/src/services/job_providers/serpapi.py` | Normalisation dans _extract_contract_type() + enrichissement query |
| 6 | `backend/src/services/job_providers/aggregator.py` | contract_type → tous providers + post-filter dict-based |
| 7 | `backend/src/agents/job_scout/main_agent.py` | Exclure RemoteOK + prioriser FT + bypass _filter_school_offers |
| 8 | `frontend-next/src/app/(dashboard)/jobs/page.tsx` | Toggle alternance + matching élargi useMemo |

**Total : 8 fichiers modifiés (search-form-inline.tsx non modifié — toggle dans page.tsx), 0 créés**

---

## Vérification End-to-End

1. **Cas nominal :** "développeur" + toggle 🎓 Alternance → tous résultats ont "alternance" dans titre OU `contract_type="alternance"`, aucun CDI/CDD
2. **France Travail :** Recherche Paris → `typeContrat=ALT` dans les params → offres FT alternance remontent
3. **Adzuna :** Query devient "développeur alternance" → résultats Adzuna filtrés par mots-clés
4. **JSearch :** Query devient "développeur alternance apprentissage in Paris" → signaux reconnus
5. **Post-filter :** Aucune offre sans signal alternance dans titre/description ne passe
6. **Edge case international :** Alternance + `country=gb` → FT retourne [] automatiquement → JSearch/SerpAPI avec query enrichie
7. **Quick filter pill :** Matching élargi → offres avec `contract_type=null` mais "alternance" dans titre incluses
8. **Cache :** Recherche CDI puis alternance → deux cache keys différentes (contract_type inclus dans key)
9. **Pydantic :** `contract_type="alternance"` accepté → pas de ValidationError

---

## Trade-offs et Décisions

| Décision | Alternative | Raison |
|---|---|---|
| Toggle dans `jobs/page.tsx` (pas `search-form-inline.tsx`) | Modifier `SearchParams` interface | `contractType` state déjà dans page.tsx — minimal blast radius |
| `_is_alternance_job` sur dict (pas Pydantic Job) | Créer un modèle intermédiaire | aggregator.py travaille avec des dicts — cohérence codebase |
| Transmettre `contract_type` via `**kwargs` à FT et JSearch | Ajouter paramètre explicite à `search()` | Évite de modifier la signature de base `BaseJobProvider.search()` |
| Post-filter centralisé dans aggregator | Post-filter dans chaque provider | Une seule logique à maintenir, s'applique à tous les providers |
| Priorisation FT par sorted() | Réordonner la liste `active_providers` à la main | Lisible, extensible, no-op si FT absent |
