# Contact Finder V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fusionner Recruiter Finder + Insider Finder en un endpoint unifie avec cache, filtrage par localisation, et fallback LinkedIn garanti pour atteindre >= 90% de taux de succes.

**Architecture:** Nouvel endpoint `POST /api/contact-finder/find` qui orchestre Apollo (primaire, avec localisation) -> SerpAPI/Groq (enrichissement si < 3 RH) -> Hunter (email pattern). Cache Supabase 30j. Nouveau drawer frontend unifie. Anciens endpoints inchanges pour rollback.

**Tech Stack:** FastAPI, httpx, Pydantic v2, Supabase (cache table), Next.js 14, shadcn/ui Sheet, next-intl

**Spec:** `docs/superpowers/specs/2026-03-25-recruiter-finder-v2-design.md`

---

## Fichiers du plan

### Backend - Creer
| Fichier | Responsabilite |
|---------|---------------|
| `backend/src/api/routes/contact_finder.py` | Endpoint unifie, orchestration, cache, quota |
| `backend/src/services/recruiter_finder/contact_finder_service.py` | Service orchestrateur (Apollo -> SerpAPI -> Hunter -> fallback) |
| `supabase/migrations/20260325000001_contact_finder_cache.sql` | Table cache |
| `tests/unit/test_contact_finder.py` | Tests unitaires dedup, domain guess, linkedin url |

### Backend - Modifier
| Fichier | Changement |
|---------|-----------|
| `backend/src/api/routes/__init__.py` | Ajouter route `/api/contact-finder` |
| `backend/src/services/recruiter_finder/apollo.py` | Ajouter `person_locations[]`, etendre `person_titles` |
| `backend/src/services/recruiter_finder/insider_service.py` | gl/hl dynamique, 5 queries, parallel gather |
| `backend/src/services/recruiter_finder/hunter.py` | Domain guessing multi-TLD securise |
| `backend/prompts/insider_finder.txt` | Prompt 5 queries FR+EN |
| `backend/src/api/routes/insider_finder.py` | Marquer deprecated=True |

### Frontend - Creer
| Fichier | Responsabilite |
|---------|---------------|
| `frontend-next/src/components/jobs/contact-finder-drawer.tsx` | Drawer unifie |

### Frontend - Modifier
| Fichier | Changement |
|---------|-----------|
| `frontend-next/src/components/jobs/job-details-modal.tsx` | 1 bouton au lieu de 2, importer nouveau drawer |
| `frontend-next/messages/fr.json` | Namespace `contactFinder` |
| `frontend-next/messages/en.json` | Namespace `contactFinder` |
| `frontend-next/messages/es.json` | Namespace `contactFinder` |
| `frontend-next/messages/pt.json` | Namespace `contactFinder` |

---

## Task 1 : Migration SQL - table cache

**Files:**
- Create: `supabase/migrations/20260325000001_contact_finder_cache.sql`

- [ ] **Step 1: Creer la migration**

```sql
-- Contact Finder Cache
-- Stocke les resultats de recherche de contacts pendant 30 jours
-- pour economiser les quotas API gratuits (Apollo 50/mois, Hunter 25/mois, SerpAPI 100/mois)

CREATE TABLE IF NOT EXISTS contact_finder_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_normalized TEXT NOT NULL,
    city_normalized TEXT NOT NULL DEFAULT '',
    response_data JSONB NOT NULL,
    sources_used TEXT[] NOT NULL DEFAULT '{}',
    total_found INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',

    UNIQUE(company_normalized, city_normalized)
);

CREATE INDEX IF NOT EXISTS idx_contact_finder_cache_lookup
    ON contact_finder_cache(company_normalized, city_normalized)
    WHERE expires_at > NOW();

ALTER TABLE contact_finder_cache ENABLE ROW LEVEL SECURITY;

-- Pas de policy RLS : acces uniquement via service_role (backend)
```

- [ ] **Step 2: Verifier la syntaxe SQL**

Run: `cd supabase && cat migrations/20260325000001_contact_finder_cache.sql`
Expected: fichier lisible sans erreur de syntaxe

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260325000001_contact_finder_cache.sql
git commit -m "feat(db): add contact_finder_cache table for recruiter search caching"
```

---

## Task 2 : Ameliorer Apollo - localisation + titres etendus

**Files:**
- Modify: `backend/src/services/recruiter_finder/apollo.py`
- Test: `tests/unit/test_contact_finder.py`

- [ ] **Step 1: Creer le fichier de tests unitaires**

Creer `tests/unit/test_contact_finder.py` :

```python
"""Tests unitaires pour Contact Finder V2."""

import pytest


class TestApolloTitles:
    """Verifie que les titres RH couvrent FR et EN."""

    def test_hr_titles_contains_french_variants(self):
        from src.services.recruiter_finder.apollo import PERSON_TITLES_HR
        french_titles = ["recruteur", "chargé de recrutement", "DRH", "responsable RH", "HRBP"]
        for title in french_titles:
            assert title in PERSON_TITLES_HR, f"Missing FR title: {title}"

    def test_hr_titles_contains_english_variants(self):
        from src.services.recruiter_finder.apollo import PERSON_TITLES_HR
        english_titles = ["recruiter", "talent acquisition manager", "HR manager", "head of talent"]
        for title in english_titles:
            assert title in PERSON_TITLES_HR, f"Missing EN title: {title}"

    def test_hr_titles_minimum_count(self):
        from src.services.recruiter_finder.apollo import PERSON_TITLES_HR
        assert len(PERSON_TITLES_HR) >= 20, f"Only {len(PERSON_TITLES_HR)} titles, need >= 20"
```

- [ ] **Step 2: Verifier que les tests echouent**

Run: `cd tests && python -m pytest unit/test_contact_finder.py::TestApolloTitles -v`
Expected: FAIL (PERSON_TITLES_HR n'existe pas encore en tant que constante exportee)

- [ ] **Step 3: Modifier apollo.py - etendre les titres et ajouter localisation**

Dans `backend/src/services/recruiter_finder/apollo.py` :

1. Remplacer `HR_TITLE_KEYWORDS` (ligne 26-29) et la liste inline `person_titles` (lignes 70-74) par une constante exportee `PERSON_TITLES_HR` :

```python
PERSON_TITLES_HR = [
    # Francais
    "recruteur", "chargé de recrutement", "responsable recrutement",
    "talent acquisition", "RH", "DRH", "responsable RH",
    "chargé RH", "HR business partner", "HRBP",
    "responsable des ressources humaines", "gestionnaire RH",
    "campus manager", "relations ecoles",
    # Anglais
    "recruiter", "talent acquisition manager", "talent acquisition specialist",
    "HR manager", "HR director", "human resources",
    "people operations", "hiring manager", "head of talent",
    "recruitment lead", "staffing specialist",
    "head of people", "VP people", "chief people officer",
]

# Mapping country_code -> country name for Apollo person_locations
COUNTRY_CODE_TO_NAME = {
    "fr": "France", "de": "Germany", "gb": "United Kingdom",
    "us": "United States", "es": "Spain", "it": "Italy",
    "pt": "Portugal", "nl": "Netherlands", "be": "Belgium",
    "ch": "Switzerland", "ca": "Canada", "lu": "Luxembourg",
}
```

2. Modifier la signature de `find_recruiters_apollo()` pour accepter `city` et `country_code` :

```python
async def find_recruiters_apollo(
    company_name: str,
    company_domain: str = "",
    job_title: str = "",
    city: str = "",            # NOUVEAU
    country_code: str = "fr",  # NOUVEAU
) -> dict[str, Any]:
```

3. Dans le payload (ligne 67-77), utiliser `PERSON_TITLES_HR` et ajouter `person_locations` :

```python
payload: dict[str, Any] = {
    "api_key": api_key,
    "q_organization_name": company_name,
    "person_titles": PERSON_TITLES_HR,
    "page": 1,
    "per_page": 10,
}

if company_domain:
    payload["q_organization_domains"] = [company_domain]

if city:
    country_name = COUNTRY_CODE_TO_NAME.get(country_code, "France")
    payload["person_locations"] = [f"{city}, {country_name}"]
```

- [ ] **Step 4: Verifier que les tests passent**

Run: `cd tests && python -m pytest unit/test_contact_finder.py::TestApolloTitles -v`
Expected: PASS

- [ ] **Step 5: Lint**

Run: `cd backend && ruff check src/services/recruiter_finder/apollo.py --ignore E501`
Expected: pas d'erreur

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/recruiter_finder/apollo.py tests/unit/test_contact_finder.py
git commit -m "feat(apollo): add location filtering and extend HR title keywords to 25+"
```

---

## Task 3 : Ameliorer Hunter - domain guessing securise

**Files:**
- Modify: `backend/src/services/recruiter_finder/hunter.py`
- Test: `tests/unit/test_contact_finder.py`

- [ ] **Step 1: Ajouter les tests de domain guessing**

Ajouter dans `tests/unit/test_contact_finder.py` :

```python
import re


class TestDomainGuessing:
    """Verifie le domain guessing multi-TLD avec protection SSRF."""

    def test_slug_generation(self):
        from src.services.recruiter_finder.hunter import _generate_domain_slug
        assert _generate_domain_slug("La Banque Postale") == "la-banque-postale"
        assert _generate_domain_slug("BNP Paribas") == "bnp-paribas"
        assert _generate_domain_slug("L'Oréal") == "loreal"

    def test_ssrf_protection_rejects_ip(self):
        from src.services.recruiter_finder.hunter import _generate_domain_slug, _is_safe_slug
        assert not _is_safe_slug("192.168.1.1")
        assert not _is_safe_slug("127-0-0-1")
        assert _is_safe_slug("societe-generale")

    def test_domain_candidates_max_six(self):
        from src.services.recruiter_finder.hunter import _generate_domain_candidates
        candidates = _generate_domain_candidates("Societe Generale")
        assert len(candidates) <= 6


class TestLinkedInCompanyUrl:
    """Verifie la construction de l'URL LinkedIn entreprise."""

    def test_basic_slug(self):
        from src.services.recruiter_finder.hunter import build_linkedin_company_url
        url = build_linkedin_company_url("Societe Generale")
        assert url == "https://www.linkedin.com/company/societe-generale/people/?keywords=recruteur"

    def test_special_chars_removed(self):
        from src.services.recruiter_finder.hunter import build_linkedin_company_url
        url = build_linkedin_company_url("L'Oréal Group")
        assert "linkedin.com/company/" in url
        assert "'" not in url

    def test_custom_keywords(self):
        from src.services.recruiter_finder.hunter import build_linkedin_company_url
        url = build_linkedin_company_url("LVMH", keywords="recruiter")
        assert "keywords=recruiter" in url
```

- [ ] **Step 2: Verifier que les tests echouent**

Run: `cd tests && python -m pytest unit/test_contact_finder.py::TestDomainGuessing -v`
Expected: FAIL (fonctions n'existent pas)

- [ ] **Step 3: Modifier hunter.py - ajouter domain guessing securise et linkedin URL builder**

Ajouter les fonctions suivantes dans `backend/src/services/recruiter_finder/hunter.py` :

```python
import asyncio
import unicodedata

def _generate_domain_slug(company_name: str) -> str:
    """Genere un slug de domaine depuis le nom d'entreprise (normalise les accents)."""
    normalized = unicodedata.normalize("NFKD", company_name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r'[^a-z0-9-]', '', ascii_only.lower().replace(' ', '-'))
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug


def _is_safe_slug(slug: str) -> bool:
    """Protection SSRF : rejeter si le slug ressemble a une IP."""
    if re.match(r'^\d+[-.]?\d+[-.]?\d+[-.]?\d+$', slug):
        return False
    if slug in ('localhost', '0', '127-0-0-1'):
        return False
    return bool(slug)


def _generate_domain_candidates(company_name: str) -> list[str]:
    """Genere max 6 candidats de domaine (2 slugs x 3 TLDs)."""
    slug = _generate_domain_slug(company_name)
    if not _is_safe_slug(slug):
        return []

    slug_no_dash = slug.replace('-', '')
    candidates = []
    for s in [slug, slug_no_dash]:
        if not _is_safe_slug(s):
            continue
        for tld in [".fr", ".com", ".io"]:
            candidates.append(f"{s}{tld}")
    return candidates[:6]


async def guess_domain(company_name: str) -> str | None:
    """
    Teste plusieurs TLDs et retourne le premier qui repond.
    Max 6 candidats, timeout 3s/req, timeout global 8s.
    """
    candidates = _generate_domain_candidates(company_name)
    if not candidates:
        return None

    try:
        async with httpx.AsyncClient() as client:
            result = await asyncio.wait_for(
                _check_candidates(client, candidates),
                timeout=8,
            )
            return result
    except asyncio.TimeoutError:
        logger.warning(f"[DomainGuess] Timeout global pour {company_name}")
        return None


async def _check_candidates(client: httpx.AsyncClient, candidates: list[str]) -> str | None:
    for domain in candidates:
        try:
            resp = await client.head(f"https://{domain}", follow_redirects=True, timeout=3)
            if resp.status_code < 400:
                return domain
        except Exception:
            continue
    return None


def build_linkedin_company_url(company_name: str, keywords: str = "recruteur") -> str:
    """Construit l'URL LinkedIn People de l'entreprise (fallback garanti)."""
    slug = _generate_domain_slug(company_name)
    return f"https://www.linkedin.com/company/{slug}/people/?keywords={keywords}"
```

Modifier aussi le domain guessing existant (ligne 116-120) pour utiliser la nouvelle fonction :

```python
else:
    # Guess domain from company name (multi-TLD)
    domain = await guess_domain(company_name)
    if domain:
        logger.info(f"[RecruiterFinder] Guessed domain: {domain}")
    else:
        logger.info(f"[RecruiterFinder] Could not guess domain for {company_name}")
        return _empty_result(company_name, "")
```

Note : `find_recruiters_for_job` doit devenir `async` pour appeler `guess_domain` -- elle l'est deja.

- [ ] **Step 4: Verifier que les tests passent**

Run: `cd tests && python -m pytest unit/test_contact_finder.py::TestDomainGuessing unit/test_contact_finder.py::TestLinkedInCompanyUrl -v`
Expected: PASS

- [ ] **Step 5: Lint**

Run: `cd backend && ruff check src/services/recruiter_finder/hunter.py --ignore E501`
Expected: pas d'erreur

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/recruiter_finder/hunter.py tests/unit/test_contact_finder.py
git commit -m "feat(hunter): add secure multi-TLD domain guessing and LinkedIn URL builder"
```

---

## Task 4 : Ameliorer SerpAPI - gl/hl dynamique + queries paralleles

**Files:**
- Modify: `backend/src/services/recruiter_finder/insider_service.py`
- Modify: `backend/prompts/insider_finder.txt`

- [ ] **Step 1: Modifier le prompt Groq**

Remplacer le contenu de `backend/prompts/insider_finder.txt` par :

```
You are the Insider Strategic Hunter for HuntZen.
Your mission is to generate surgical LinkedIn search queries to find the best people to contact for a specific job offer.

For each job offer, you must generate FIVE types of queries:

1. RECRUITER_FR: Find the recruiter using FRENCH job titles.
   Example: site:linkedin.com/in "Chargé de recrutement" "Company" City

2. RECRUITER_EN: Find the recruiter using ENGLISH job titles.
   Example: site:linkedin.com/in "Talent Acquisition" "Company" City

3. HR_MANAGER: Find the HR manager or director.
   Example: site:linkedin.com/in "DRH" OR "Responsable RH" "Company" City

4. PAIR: Find a current employee with the same or similar role (future colleague).
   Example: site:linkedin.com/in "Job Title" "Company" City

5. HIRING_MANAGER: Find the hiring manager for the department.
   Example: site:linkedin.com/in "Head of" OR "Directeur" "Department" "Company"

If the job is an internship (stage) or work-study (alternance), replace HIRING_MANAGER with:
6. CAMPUS: Find the campus/university relations manager.
   Example: site:linkedin.com/in "Relations Ecoles" OR "Campus Manager" "Company"

Output Format:
You MUST return a JSON object with the following structure:
{
  "queries": [
    {
      "type": "recruiter",
      "label": "Recruteur (FR)",
      "query": "site:linkedin.com/in \"Chargé de recrutement\" \"Company Name\" City",
      "reason": "Pour identifier le recruteur en charge de ce poste."
    },
    ...
  ],
  "strategy": "Brief explanation of why these queries were chosen."
}

Rules:
- Queries must use Google advanced search operators like 'site:linkedin.com/in'.
- For French companies, use BOTH French AND English titles in separate queries.
- Always include the city if available to find the right office location.
- If the company is international, provide localized queries for the office location.
- Generate exactly 5 queries (or 5 with CAMPUS replacing HIRING_MANAGER if alternance).
- Only return the JSON, no additional text.
```

- [ ] **Step 2: Modifier insider_service.py - gl/hl dynamique + parallel queries**

Dans `backend/src/services/recruiter_finder/insider_service.py` :

1. Modifier la signature de `find_insiders` pour accepter `country_code` :

```python
async def find_insiders(
    self,
    job_title: str,
    company: str,
    city: str = "",
    is_alternance: bool = False,
    country_code: str = "fr",  # NOUVEAU
) -> dict[str, Any]:
```

2. Remplacer la boucle sequentielle (lignes 61-96) par des queries paralleles :

```python
import asyncio

# ...dans find_insiders()...

all_insiders = []
api_key = settings.get_serpapi_key()
seen_links: set[str] = set()

async with httpx.AsyncClient(timeout=10.0) as client:
    # Execute toutes les queries en parallele
    tasks = [
        self._execute_query(client, q_obj, api_key, country_code)
        for q_obj in queries[:5]
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, Exception):
            logger.error(f"[InsiderService] Query failed: {r}")
            continue
        if isinstance(r, list):
            for insider in r:
                link = insider.get("link", "")
                if link not in seen_links:
                    seen_links.add(link)
                    all_insiders.append(insider)

return {
    "success": True,
    "strategy": strategy_text,
    "insiders": all_insiders,
    "total_found": len(all_insiders),
}
```

3. Ajouter la methode `_execute_query` :

```python
async def _execute_query(
    self,
    client: httpx.AsyncClient,
    q_obj: dict,
    api_key: str,
    country_code: str,
) -> list[dict]:
    """Execute une seule query SerpAPI et retourne les insiders trouves."""
    query_text = q_obj.get("query")
    query_type = q_obj.get("type", "other")
    label = q_obj.get("label", "Contact")

    params = {
        "engine": "google",
        "q": query_text,
        "api_key": api_key,
        "gl": country_code or "fr",
        "hl": country_code or "fr",
    }

    try:
        resp = await client.get(self.serpapi_url, params=params)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for res in data.get("organic_results", []):
            link = res.get("link", "")
            if "linkedin.com/in/" in link:
                results.append({
                    "name": res.get("title", "").split(" - ")[0].strip(),
                    "title": res.get("title", ""),
                    "link": link,
                    "snippet": res.get("snippet", ""),
                    "category": query_type,
                    "label": label,
                })
        return results
    except Exception as e:
        logger.error(f"[InsiderService] Search failed for query '{query_text}': {e}")
        return []
```

- [ ] **Step 3: Lint**

Run: `cd backend && ruff check src/services/recruiter_finder/insider_service.py --ignore E501`
Expected: pas d'erreur

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/recruiter_finder/insider_service.py backend/prompts/insider_finder.txt
git commit -m "feat(serpapi): parallel queries, dynamic gl/hl, improved 5-query prompt"
```

---

## Task 5 : Service orchestrateur + endpoint unifie

**Files:**
- Create: `backend/src/services/recruiter_finder/contact_finder_service.py`
- Create: `backend/src/api/routes/contact_finder.py`
- Modify: `backend/src/api/routes/__init__.py`

- [ ] **Step 1: Creer le service orchestrateur**

Creer `backend/src/services/recruiter_finder/contact_finder_service.py` :

```python
"""
Contact Finder Service
=======================
Orchestre Apollo (primaire) -> SerpAPI/Groq (enrichissement) -> Hunter (email)
avec cache Supabase et fallback LinkedIn garanti.
"""

import asyncio
import logging
from typing import Any

from src.api.deps import get_supabase_client
from src.services.recruiter_finder.apollo import find_recruiters_apollo
from src.services.recruiter_finder.hunter import (
    build_linkedin_company_url,
    extract_domain,
    find_recruiters_for_job,
)
from src.services.recruiter_finder.insider_service import InsiderFinderService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

async def get_cached_result(company: str, city: str) -> dict | None:
    sb = get_supabase_client()
    if not sb:
        return None
    try:
        key_company = company.lower().strip()
        key_city = (city or "").lower().strip()
        result = sb.table("contact_finder_cache") \
            .select("response_data, created_at") \
            .eq("company_normalized", key_company) \
            .eq("city_normalized", key_city) \
            .gt("expires_at", "now()") \
            .maybe_single() \
            .execute()
        if result.data:
            data = result.data["response_data"]
            data["cached"] = True
            data["cached_at"] = result.data["created_at"][:10]
            return data
    except Exception as e:
        logger.warning(f"[ContactFinder] Cache read error: {e}")
    return None


async def set_cached_result(
    company: str, city: str, response: dict, sources: list[str], total: int
) -> None:
    if total == 0:
        return
    sb = get_supabase_client()
    if not sb:
        return
    try:
        key_company = company.lower().strip()
        key_city = (city or "").lower().strip()
        sb.table("contact_finder_cache") \
            .upsert(
                {
                    "company_normalized": key_company,
                    "city_normalized": key_city,
                    "response_data": response,
                    "sources_used": sources,
                    "total_found": total,
                },
                on_conflict="company_normalized,city_normalized",
            ) \
            .execute()
    except Exception as e:
        logger.warning(f"[ContactFinder] Cache write error: {e}")


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def dedup_contacts(contacts: list[dict]) -> list[dict]:
    """Deduplique par LinkedIn URL ou par (nom, position)."""
    seen_linkedin: set[str] = set()
    seen_identity: set[tuple[str, str]] = set()
    unique = []

    for c in contacts:
        linkedin = (c.get("linkedin_url") or "").lower().rstrip("/")
        name_key = c.get("name", "").lower().strip()
        position_key = (c.get("position") or "").lower().strip()
        identity = (name_key, position_key)

        if linkedin and linkedin in seen_linkedin:
            continue
        if name_key and identity in seen_identity:
            continue

        if linkedin:
            seen_linkedin.add(linkedin)
        if name_key:
            seen_identity.add(identity)
        unique.append(c)

    return unique


# ---------------------------------------------------------------------------
# Contact normalization
# ---------------------------------------------------------------------------

def _normalize_apollo_contact(c: dict) -> dict:
    """Convertit un contact Apollo au format ContactFinderContact."""
    return {
        "name": c.get("name", ""),
        "position": c.get("position"),
        "email": c.get("email") or None,
        "email_verified": c.get("email_verified", False),
        "linkedin_url": c.get("linkedin") or None,
        "confidence": c.get("confidence", 0),
        "category": c.get("role", "other"),
        "source": "apollo",
    }


def _normalize_insider_contact(c: dict) -> dict:
    """Convertit un contact Insider (SerpAPI) au format ContactFinderContact."""
    category = c.get("category", "other")
    if category == "pair":
        category = "pair"
    elif category in ("recruiter", "recruiter_fr", "recruiter_en", "hr_manager"):
        category = "hr"
    elif category == "campus":
        category = "campus"
    else:
        category = "other"

    return {
        "name": c.get("name", ""),
        "position": c.get("title"),
        "email": None,
        "email_verified": False,
        "linkedin_url": c.get("link") or None,
        "confidence": 50,
        "category": category,
        "source": "serpapi",
    }


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def find_contacts(
    company_name: str,
    company_domain: str | None = None,
    company_website: str | None = None,
    job_title: str | None = None,
    city: str | None = None,
    country_code: str | None = "fr",
    is_alternance: bool = False,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """
    Orchestre la recherche de contacts :
    1. Cache check
    2. Apollo (primaire, avec localisation)
    3. SerpAPI/Groq (si Apollo < 3 RH)
    4. Hunter (enrichissement email)
    5. Fallback LinkedIn page (toujours)

    Timeout global : 20 secondes.
    """
    linkedin_url = build_linkedin_company_url(
        company_name, keywords="recruteur" if country_code == "fr" else "recruiter"
    )

    # 1. Cache check
    if not force_refresh:
        cached = await get_cached_result(company_name, city or "")
        if cached:
            cached["linkedin_company_url"] = linkedin_url
            logger.info(f"[ContactFinder] Cache HIT for {company_name}")
            return cached

    # 2-5. Orchestration
    # On utilise un dict mutable pour accumuler les resultats partiels
    # En cas de timeout, on retourne ce qu'on a deja trouve (pas un resultat vide)
    partial_result: dict[str, Any] = _empty_result(company_name, linkedin_url)

    async def _run_orchestration():
        nonlocal partial_result
        partial_result = await _orchestrate_search(
            company_name=company_name,
            company_domain=company_domain,
            company_website=company_website,
            job_title=job_title,
            city=city,
            country_code=country_code or "fr",
            is_alternance=is_alternance,
            linkedin_url=linkedin_url,
        )

    try:
        await asyncio.wait_for(_run_orchestration(), timeout=20)
    except asyncio.TimeoutError:
        logger.warning(f"[ContactFinder] Timeout global pour {company_name}, returning partial results")

    result = partial_result

    # Cache le resultat (sauf si vide)
    sources = result.get("sources_used", [])
    total = result.get("total_found", 0)
    await set_cached_result(company_name, city or "", result, sources, total)

    return result


async def _orchestrate_search(
    company_name: str,
    company_domain: str | None,
    company_website: str | None,
    job_title: str | None,
    city: str | None,
    country_code: str,
    is_alternance: bool,
    linkedin_url: str,
) -> dict[str, Any]:
    """Logique d'orchestration sans timeout (le timeout est gere par l'appelant)."""
    all_contacts: list[dict] = []
    sources_used: list[str] = []
    strategy_text: str | None = None

    # Resolve domain
    domain = ""
    if company_domain:
        domain = extract_domain(company_domain)
    elif company_website:
        domain = extract_domain(company_website)

    # 2. Apollo (primaire)
    apollo_result = await find_recruiters_apollo(
        company_name=company_name,
        company_domain=domain,
        job_title=job_title or "",
        city=city or "",
        country_code=country_code,
    )

    apollo_contacts = []
    for c in apollo_result.get("recruiters", []) + apollo_result.get("tech_team", []):
        apollo_contacts.append(_normalize_apollo_contact(c))

    # Aussi prendre les "other" qui ont un LinkedIn
    for c in apollo_result.get("all_contacts", []):
        if c.get("role") == "other" and c.get("linkedin"):
            apollo_contacts.append(_normalize_apollo_contact(c))

    if apollo_contacts:
        sources_used.append("apollo")
        all_contacts.extend(apollo_contacts)

    # 3. SerpAPI si Apollo < 3 contacts HR
    hr_count = sum(1 for c in all_contacts if c.get("category") == "hr")
    if hr_count < 3:
        try:
            insider_svc = InsiderFinderService()
            insider_result = await insider_svc.find_insiders(
                job_title=job_title or company_name,
                company=company_name,
                city=city or "",
                is_alternance=is_alternance,
                country_code=country_code,
            )
            if insider_result.get("success"):
                strategy_text = insider_result.get("strategy")
                for c in insider_result.get("insiders", []):
                    all_contacts.append(_normalize_insider_contact(c))
                if insider_result.get("insiders"):
                    sources_used.append("serpapi")
        except Exception as e:
            logger.error(f"[ContactFinder] SerpAPI failed: {e}")

    # 4. Hunter email enrichissement (si contacts sans email)
    contacts_without_email = [c for c in all_contacts if not c.get("email") and c.get("name")]
    if contacts_without_email and domain:
        try:
            hunter_result = await find_recruiters_for_job(
                company_name=company_name,
                company_domain=domain,
                job_title=job_title or "",
            )
            email_pattern = hunter_result.get("email_pattern")
            if hunter_result.get("total_found", 0) > 0:
                sources_used.append("hunter")
                # Enrichir les contacts existants avec les emails Hunter
                hunter_emails = {
                    c.get("name", "").lower(): c
                    for c in hunter_result.get("all_contacts", [])
                    if c.get("email")
                }
                for contact in all_contacts:
                    name_lower = contact.get("name", "").lower()
                    if not contact.get("email") and name_lower in hunter_emails:
                        h = hunter_emails[name_lower]
                        contact["email"] = h.get("email")
                        contact["email_verified"] = h.get("confidence", 0) >= 80
                        contact["confidence"] = max(
                            contact.get("confidence", 0), h.get("confidence", 0)
                        )
        except Exception as e:
            logger.error(f"[ContactFinder] Hunter failed: {e}")
            email_pattern = None
    else:
        email_pattern = None

    # Dedup
    all_contacts = dedup_contacts(all_contacts)

    # Trier : HR en premier, puis par confidence desc
    category_order = {"hr": 0, "pair": 1, "campus": 2, "tech": 3, "other": 4}
    all_contacts.sort(
        key=lambda c: (category_order.get(c.get("category", "other"), 9), -c.get("confidence", 0))
    )

    return {
        "company": company_name,
        "domain": domain or None,
        "email_pattern": email_pattern,
        "contacts": all_contacts,
        "total_found": len(all_contacts),
        "sources_used": sources_used,
        "linkedin_company_url": linkedin_url,
        "strategy": strategy_text,
        "cached": False,
        "cached_at": None,
    }


def _empty_result(company: str, linkedin_url: str) -> dict[str, Any]:
    return {
        "company": company,
        "domain": None,
        "email_pattern": None,
        "contacts": [],
        "total_found": 0,
        "sources_used": [],
        "linkedin_company_url": linkedin_url,
        "strategy": None,
        "cached": False,
        "cached_at": None,
    }
```

- [ ] **Step 2: Creer l'endpoint unifie**

Creer `backend/src/api/routes/contact_finder.py` :

```python
"""
Contact Finder API
===================
Unified endpoint combining Apollo, SerpAPI/Groq, and Hunter.io
with Supabase caching and guaranteed LinkedIn fallback.
"""

import logging

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.api.deps import get_user_id_from_token
from src.api.middleware import limiter
from src.api.routes.recruiter_finder import (
    check_recruiter_search_quota,
    increment_recruiter_search_quota,
)
from src.services.recruiter_finder.contact_finder_service import find_contacts
from src.services.stripe import invalidate_user_quota_cache

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Schemas
# ============================================================================


class ContactFinderRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    company_domain: str | None = None
    company_website: str | None = None
    job_title: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=100)
    country_code: str | None = Field("fr", min_length=2, max_length=3)
    is_alternance: bool = False
    force_refresh: bool = False


class ContactFinderContact(BaseModel):
    name: str
    position: str | None = None
    email: str | None = None
    email_verified: bool = False
    linkedin_url: str | None = None
    confidence: int = 0
    category: str = "other"
    source: str = "apollo"


class ContactFinderResponse(BaseModel):
    company: str
    domain: str | None = None
    email_pattern: str | None = None
    contacts: list[ContactFinderContact]
    total_found: int
    sources_used: list[str]
    linkedin_company_url: str
    strategy: str | None = None
    cached: bool = False
    cached_at: str | None = None


# ============================================================================
# Route
# ============================================================================


@router.post("/find", response_model=ContactFinderResponse)
@limiter.limit("10/minute")
async def find_contacts_endpoint(
    request: Request,
    body: ContactFinderRequest,
    authorization: str | None = Header(default=None),
):
    """
    Unified contact finder: Apollo (primary) -> SerpAPI/Groq -> Hunter (email).
    Cached for 30 days. Includes LinkedIn company page fallback.
    """
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    if not body.company_name or not body.company_name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="company_name is required",
        )

    # Quota check (reuse existing recruiter_search quota)
    check_recruiter_search_quota(user_id)

    try:
        result = await find_contacts(
            company_name=body.company_name.strip(),
            company_domain=body.company_domain,
            company_website=body.company_website,
            job_title=body.job_title,
            city=body.city,
            country_code=body.country_code,
            is_alternance=body.is_alternance,
            force_refresh=body.force_refresh,
        )

        # Ne pas incrementer le quota si resultat depuis cache
        if not result.get("cached"):
            increment_recruiter_search_quota(user_id)
            await invalidate_user_quota_cache(user_id)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ContactFinder] Unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Contact search failed",
        ) from None
```

- [ ] **Step 3: Enregistrer la route dans __init__.py**

Dans `backend/src/api/routes/__init__.py`, ajouter apres la ligne 36 (import recruiter_finder) :

```python
from src.api.routes.contact_finder import router as contact_finder_router
```

Et ajouter apres la ligne 68 (recruiter_finder_router) :

```python
router.include_router(contact_finder_router, prefix="/api/contact-finder", tags=["Contact Finder"])
```

- [ ] **Step 4: Marquer les anciens endpoints comme deprecated**

Dans `backend/src/api/routes/insider_finder.py`, modifier le decorateur du endpoint :

```python
@router.post("/find", deprecated=True)
```

Dans `backend/src/api/routes/recruiter_finder.py`, modifier le decorateur du endpoint :

```python
@router.post("/find", response_model=RecruiterFinderResponse, deprecated=True)
```

- [ ] **Step 5: Lint**

Run: `cd backend && ruff check src/api/routes/contact_finder.py src/services/recruiter_finder/contact_finder_service.py src/api/routes/insider_finder.py src/api/routes/recruiter_finder.py --ignore E501`
Expected: pas d'erreur

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/routes/contact_finder.py backend/src/services/recruiter_finder/contact_finder_service.py backend/src/api/routes/__init__.py backend/src/api/routes/insider_finder.py backend/src/api/routes/recruiter_finder.py
git commit -m "feat(contact-finder): unified endpoint with Apollo->SerpAPI->Hunter orchestration and cache"
```

---

## Task 6 : Tests unitaires du service orchestrateur

**Files:**
- Modify: `tests/unit/test_contact_finder.py`

- [ ] **Step 1: Ajouter tests dedup et cache**

Ajouter dans `tests/unit/test_contact_finder.py` :

```python
class TestDedup:
    """Verifie la deduplication des contacts."""

    def test_dedup_by_linkedin_url(self):
        from src.services.recruiter_finder.contact_finder_service import dedup_contacts
        contacts = [
            {"name": "Jean Dupont", "linkedin_url": "https://linkedin.com/in/jean", "position": "RH"},
            {"name": "Jean D.", "linkedin_url": "https://linkedin.com/in/jean", "position": "RH Manager"},
        ]
        result = dedup_contacts(contacts)
        assert len(result) == 1

    def test_dedup_by_name_and_position(self):
        from src.services.recruiter_finder.contact_finder_service import dedup_contacts
        contacts = [
            {"name": "Jean Dupont", "linkedin_url": None, "position": "RH Manager"},
            {"name": "Jean Dupont", "linkedin_url": None, "position": "RH Manager"},
        ]
        result = dedup_contacts(contacts)
        assert len(result) == 1

    def test_dedup_keeps_different_positions(self):
        from src.services.recruiter_finder.contact_finder_service import dedup_contacts
        contacts = [
            {"name": "Jean Dupont", "linkedin_url": None, "position": "RH Manager"},
            {"name": "Jean Dupont", "linkedin_url": None, "position": "Tech Lead"},
        ]
        result = dedup_contacts(contacts)
        assert len(result) == 2

    def test_dedup_empty_list(self):
        from src.services.recruiter_finder.contact_finder_service import dedup_contacts
        assert dedup_contacts([]) == []


class TestNormalization:
    """Verifie la normalisation des contacts Apollo et SerpAPI."""

    def test_normalize_apollo_contact(self):
        from src.services.recruiter_finder.contact_finder_service import _normalize_apollo_contact
        contact = {
            "name": "Marie Martin",
            "position": "Recruiter",
            "email": "marie@company.com",
            "email_verified": True,
            "linkedin": "https://linkedin.com/in/marie",
            "confidence": 95,
            "role": "hr",
        }
        result = _normalize_apollo_contact(contact)
        assert result["source"] == "apollo"
        assert result["category"] == "hr"
        assert result["linkedin_url"] == "https://linkedin.com/in/marie"

    def test_normalize_insider_contact(self):
        from src.services.recruiter_finder.contact_finder_service import _normalize_insider_contact
        contact = {
            "name": "Pierre Durand",
            "title": "Data Analyst at Company",
            "link": "https://linkedin.com/in/pierre",
            "category": "pair",
        }
        result = _normalize_insider_contact(contact)
        assert result["source"] == "serpapi"
        assert result["category"] == "pair"
        assert result["email"] is None
```

- [ ] **Step 2: Verifier que les tests passent**

Run: `cd tests && python -m pytest unit/test_contact_finder.py -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/test_contact_finder.py
git commit -m "test(contact-finder): add unit tests for dedup, normalization, domain guessing"
```

---

## Task 7 : Frontend - drawer unifie

**Files:**
- Create: `frontend-next/src/components/jobs/contact-finder-drawer.tsx`

- [ ] **Step 1: Creer le drawer unifie**

Creer `frontend-next/src/components/jobs/contact-finder-drawer.tsx` :

```tsx
/**
 * ContactFinderDrawer - Unified contact discovery drawer
 *
 * Replaces RecruiterFinderDrawer + InsiderFinderDrawer.
 * Calls POST /api/contact-finder/find (unified endpoint).
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Linkedin,
  Copy,
  CheckCheck,
  Loader2,
  SearchX,
  Sparkles,
  ExternalLink,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/api/huntzen-client";

// ============================================================================
// TYPES
// ============================================================================

interface Contact {
  name: string;
  position: string | null;
  email: string | null;
  email_verified: boolean;
  linkedin_url: string | null;
  confidence: number;
  category: string;
  source: string;
}

interface FinderResult {
  company: string;
  domain: string | null;
  email_pattern: string | null;
  contacts: Contact[];
  total_found: number;
  sources_used: string[];
  linkedin_company_url: string;
  strategy: string | null;
  cached: boolean;
  cached_at: string | null;
}

interface ContactFinderDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE_NAMES = new Set([
  "adzuna", "huntzen", "serpapi", "remoteok", "remote ok",
  "france travail", "indeed", "linkedin", "google jobs",
  "glassdoor", "monster", "apec", "pole emploi",
]);

const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  hr: { label: "Recruteur", className: "bg-blue-100 text-blue-700" },
  pair: { label: "Futur Collegue", className: "bg-teal-100 text-teal-700" },
  campus: { label: "Campus", className: "bg-orange-100 text-orange-700" },
  tech: { label: "Tech", className: "bg-violet-100 text-violet-700" },
  other: { label: "Contact", className: "bg-gray-100 text-gray-600" },
};

// ============================================================================
// HELPERS
// ============================================================================

function cleanCompanyName(company: string): string {
  if (!company) return "";
  if (SOURCE_NAMES.has(company.toLowerCase().trim())) return "";
  return company.trim();
}

function extractCity(location: string): string {
  return location?.split(",")[0]?.trim() ?? "";
}

function detectAlternance(title: string): boolean {
  return /alternance|apprentissage|stage/i.test(title ?? "");
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("contactFinder");

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    toast.success(t("emailCopied"));
    setTimeout(() => setCopied(false), 2000);
  }, [email, t]);

  return (
    <button
      onClick={handleCopy}
      className="ml-1 inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors"
      aria-label={`Copier ${email}`}
    >
      {copied ? (
        <CheckCheck className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 80
      ? "text-green-600"
      : confidence >= 50
        ? "text-orange-500"
        : "text-gray-400";
  return (
    <span className={cn("text-xs", color)}>
      {confidence}%
    </span>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  const config = CATEGORY_CONFIG[contact.category] ?? CATEGORY_CONFIG.other;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {contact.name}
          </p>
          {contact.position && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {contact.position}
            </p>
          )}
        </div>
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
            config.className
          )}
        >
          {config.label}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#0A66C2] hover:underline"
          >
            <Linkedin className="h-3.5 w-3.5" />
            LinkedIn
          </a>
        )}

        {contact.email && contact.email_verified && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <ShieldCheck className="h-3 w-3 text-green-500" />
            <Mail className="h-3 w-3" />
            {contact.email}
            <CopyEmailButton email={contact.email} />
          </span>
        )}

        {contact.confidence > 0 && (
          <ConfidenceBadge confidence={contact.confidence} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ContactFinderDrawer({
  open,
  onOpenChange,
  job,
}: ContactFinderDrawerProps) {
  const t = useTranslations("contactFinder");
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FinderResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [companyName, setCompanyName] = useState(cleanCompanyName(job.company));

  useEffect(() => {
    setCompanyName(cleanCompanyName(job.company));
    setResult(null);
    setSearched(false);
    setQuotaError(false);
  }, [job.id]);

  const handleSearch = useCallback(async () => {
    if (!session?.access_token) {
      toast.error(t("errorAuth"));
      return;
    }
    setLoading(true);
    setSearched(true);
    setQuotaError(false);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/contact-finder/find`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_name: companyName,
          job_title: job.title || null,
          city: extractCity(job.location) || null,
          is_alternance: detectAlternance(job.title),
        }),
      });

      if (response.status === 429) {
        setQuotaError(true);
        setSearched(false);
        toast.error(t("quotaReached"));
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: FinderResult = await response.json();
      setResult(data);
    } catch {
      toast.error(t("errorGeneric"));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [session, companyName, job, t]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setResult(null);
        setSearched(false);
        setCompanyName(cleanCompanyName(job.company));
      }
      onOpenChange(isOpen);
    },
    [job.company, onOpenChange]
  );

  const handleReset = useCallback(() => {
    setResult(null);
    setSearched(false);
    setQuotaError(false);
  }, []);

  // Group contacts by category
  const grouped = result?.contacts.reduce<Record<string, Contact[]>>(
    (acc, contact) => {
      const key = contact.category;
      acc[key] = acc[key] ?? [];
      acc[key].push(contact);
      return acc;
    },
    {}
  );

  const hasResults = (result?.total_found ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-gray-100">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            {t("title")}
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            {t("subtitle")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Search form */}
          {!searched && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  {t("companyLabel")}
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t("companyPlaceholder")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {quotaError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {t("quotaReached")}
                </div>
              )}
              <Button
                onClick={handleSearch}
                className="bg-gradient-to-r from-blue-600 to-violet-600 text-white w-full"
                disabled={loading || !companyName.trim() || quotaError}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("searching")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t("searchButton")}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm">{t("searching")}</p>
            </div>
          )}

          {/* Results */}
          {!loading && searched && result && (
            <>
              {/* Cache badge */}
              {result.cached && result.cached_at && (
                <div className="text-xs text-gray-400 text-center">
                  {t("cachedBadge", { date: result.cached_at })}
                </div>
              )}

              {/* AI Strategy */}
              {result.strategy && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 flex items-start gap-2 text-sm text-violet-800">
                  <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />
                  <p>{result.strategy}</p>
                </div>
              )}

              {/* Grouped contacts */}
              {hasResults && grouped && (
                <>
                  {["hr", "pair", "campus", "tech", "other"].map((cat) => {
                    const contacts = grouped[cat];
                    if (!contacts?.length) return null;
                    const config =
                      CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.other;
                    return (
                      <div key={cat} className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <Badge className={cn(config.className, "hover:opacity-90")}>
                            {config.label}
                          </Badge>
                          <span className="text-gray-400 font-normal">
                            {contacts.length} profil{contacts.length > 1 ? "s" : ""}
                          </span>
                        </h4>
                        {contacts.map((c, i) => (
                          <ContactCard key={`${cat}-${i}`} contact={c} />
                        ))}
                      </div>
                    );
                  })}
                </>
              )}

              {/* No contacts found - show only LinkedIn fallback */}
              {!hasResults && (
                <div className="flex flex-col items-center justify-center py-6 gap-3 text-gray-400">
                  <SearchX className="h-10 w-10" />
                  <p className="text-sm text-center">
                    {t("noResultsFallback", { company: result.company })}
                  </p>
                </div>
              )}

              {/* LinkedIn company page - ALWAYS visible */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-blue-900">
                  {t("linkedinPageTitle")}
                </p>
                <p className="text-xs text-blue-700">
                  {t("linkedinPageSubtitle", { company: result.company })}
                </p>
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <a
                    href={result.linkedin_company_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("linkedinPageButton")}
                  </a>
                </Button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-gray-400"
                  onClick={handleReset}
                >
                  {t("newSearch")}
                </Button>
              </div>

              {/* RGPD */}
              <p className="text-xs text-muted-foreground border-t pt-3">
                {t("rgpdDisclaimer")}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Lint + type check**

Run: `cd frontend-next && npx tsc --noEmit 2>&1 | head -20`
Expected: pas d'erreur liee a contact-finder-drawer.tsx

- [ ] **Step 3: Commit**

```bash
git add frontend-next/src/components/jobs/contact-finder-drawer.tsx
git commit -m "feat(ui): add unified ContactFinderDrawer component"
```

---

## Task 8 : i18n - traductions 4 langues

**Files:**
- Modify: `frontend-next/messages/fr.json`
- Modify: `frontend-next/messages/en.json`
- Modify: `frontend-next/messages/es.json`
- Modify: `frontend-next/messages/pt.json`

- [ ] **Step 1: Ajouter namespace contactFinder dans fr.json**

Ajouter le bloc suivant dans `frontend-next/messages/fr.json` (au meme niveau que les autres namespaces) :

```json
"contactFinder": {
  "title": "Trouver les contacts",
  "subtitle": "Decouvrez les recruteurs et collegues de cette entreprise",
  "companyLabel": "Nom de l'entreprise",
  "companyPlaceholder": "Ex: Societe Generale",
  "searchButton": "Lancer la recherche",
  "searching": "Recherche en cours...",
  "noResultsFallback": "Aucun contact trouve pour {company}. Essayez via la page LinkedIn ci-dessous.",
  "linkedinPageTitle": "Explorer l'equipe sur LinkedIn",
  "linkedinPageSubtitle": "Voir tous les employes de {company}",
  "linkedinPageButton": "Ouvrir sur LinkedIn",
  "cachedBadge": "Resultats du {date}",
  "newSearch": "Nouvelle recherche",
  "emailCopied": "Email copie",
  "quotaReached": "Quota de recherche atteint (3/jour en version gratuite). Passez a Pro pour un acces illimite.",
  "errorAuth": "Connectez-vous pour utiliser cette fonctionnalite",
  "errorGeneric": "Erreur lors de la recherche de contacts",
  "rgpdDisclaimer": "Ces informations proviennent de sources publiques (LinkedIn, sites d'entreprise). Utilisez-les de maniere responsable conformement au RGPD."
}
```

- [ ] **Step 2: Ajouter namespace contactFinder dans en.json**

```json
"contactFinder": {
  "title": "Find contacts",
  "subtitle": "Discover recruiters and colleagues at this company",
  "companyLabel": "Company name",
  "companyPlaceholder": "e.g. Societe Generale",
  "searchButton": "Start search",
  "searching": "Searching...",
  "noResultsFallback": "No contacts found for {company}. Try the LinkedIn page below.",
  "linkedinPageTitle": "Explore the team on LinkedIn",
  "linkedinPageSubtitle": "See all employees at {company}",
  "linkedinPageButton": "Open on LinkedIn",
  "cachedBadge": "Results from {date}",
  "newSearch": "New search",
  "emailCopied": "Email copied",
  "quotaReached": "Search quota reached (3/day on free plan). Upgrade to Pro for unlimited access.",
  "errorAuth": "Sign in to use this feature",
  "errorGeneric": "Error searching for contacts",
  "rgpdDisclaimer": "This information comes from public sources (LinkedIn, company websites). Use responsibly in compliance with GDPR."
}
```

- [ ] **Step 3: Ajouter namespace contactFinder dans es.json**

```json
"contactFinder": {
  "title": "Encontrar contactos",
  "subtitle": "Descubre reclutadores y colegas en esta empresa",
  "companyLabel": "Nombre de la empresa",
  "companyPlaceholder": "Ej: Societe Generale",
  "searchButton": "Iniciar busqueda",
  "searching": "Buscando...",
  "noResultsFallback": "No se encontraron contactos para {company}. Prueba la pagina de LinkedIn abajo.",
  "linkedinPageTitle": "Explorar el equipo en LinkedIn",
  "linkedinPageSubtitle": "Ver todos los empleados de {company}",
  "linkedinPageButton": "Abrir en LinkedIn",
  "cachedBadge": "Resultados del {date}",
  "newSearch": "Nueva busqueda",
  "emailCopied": "Email copiado",
  "quotaReached": "Cuota de busqueda alcanzada (3/dia en plan gratuito). Actualiza a Pro para acceso ilimitado.",
  "errorAuth": "Inicia sesion para usar esta funcion",
  "errorGeneric": "Error al buscar contactos",
  "rgpdDisclaimer": "Esta informacion proviene de fuentes publicas (LinkedIn, sitios web de empresas). Usala de manera responsable conforme al RGPD."
}
```

- [ ] **Step 4: Ajouter namespace contactFinder dans pt.json**

```json
"contactFinder": {
  "title": "Encontrar contatos",
  "subtitle": "Descubra recrutadores e colegas nesta empresa",
  "companyLabel": "Nome da empresa",
  "companyPlaceholder": "Ex: Societe Generale",
  "searchButton": "Iniciar pesquisa",
  "searching": "Pesquisando...",
  "noResultsFallback": "Nenhum contato encontrado para {company}. Tente a pagina do LinkedIn abaixo.",
  "linkedinPageTitle": "Explorar a equipe no LinkedIn",
  "linkedinPageSubtitle": "Ver todos os funcionarios de {company}",
  "linkedinPageButton": "Abrir no LinkedIn",
  "cachedBadge": "Resultados de {date}",
  "newSearch": "Nova pesquisa",
  "emailCopied": "Email copiado",
  "quotaReached": "Cota de pesquisa atingida (3/dia no plano gratuito). Atualize para Pro para acesso ilimitado.",
  "errorAuth": "Faca login para usar esta funcionalidade",
  "errorGeneric": "Erro ao pesquisar contatos",
  "rgpdDisclaimer": "Estas informacoes provem de fontes publicas (LinkedIn, sites de empresas). Use de forma responsavel em conformidade com o RGPD."
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend-next/messages/fr.json frontend-next/messages/en.json frontend-next/messages/es.json frontend-next/messages/pt.json
git commit -m "feat(i18n): add contactFinder translations for all 4 languages"
```

---

## Task 9 : Integrer le drawer dans JobDetailsModal

**Files:**
- Modify: `frontend-next/src/components/jobs/job-details-modal.tsx`

- [ ] **Step 1: Lire le fichier pour identifier les lignes exactes**

Lire `frontend-next/src/components/jobs/job-details-modal.tsx` et identifier :
- Les imports des anciens drawers (lignes ~1-30)
- Les useState pour `recruiterDrawerOpen` et `insiderDrawerOpen` (lignes ~108-110)
- Le bouton "Trouver le recruteur" (ligne ~523)
- Le rendu des anciens drawers (lignes ~694-707)

- [ ] **Step 2: Remplacer les imports**

Remplacer les imports des 2 anciens drawers par le nouveau :

```tsx
// SUPPRIMER ces imports :
// import { RecruiterFinderDrawer } from "./recruiter-finder-drawer";
// import { InsiderFinderDrawer } from "./insider-finder-drawer";

// AJOUTER :
import { ContactFinderDrawer } from "./contact-finder-drawer";
```

- [ ] **Step 3: Fusionner les useState**

Remplacer les 2 useState :

```tsx
// SUPPRIMER :
// const [insiderDrawerOpen, setInsiderDrawerOpen] = useState(false);
// const [recruiterDrawerOpen, setRecruiterDrawerOpen] = useState(false);

// AJOUTER :
const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
```

- [ ] **Step 4: Mettre a jour le bouton**

Remplacer le bouton existant (ligne ~523) :

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setContactDrawerOpen(true)}
>
  <Users className="mr-2 h-4 w-4" />
  {t("findContacts")}
</Button>
```

Note : ajouter la cle i18n `findContacts` dans le namespace `jobDetails` des 4 fichiers de traduction :
- fr: "Trouver les contacts"
- en: "Find contacts"
- es: "Encontrar contactos"
- pt: "Encontrar contatos"

- [ ] **Step 5: Remplacer le rendu des drawers**

Remplacer les 2 anciens drawers (lignes ~694-707) par :

```tsx
<ContactFinderDrawer
  open={contactDrawerOpen}
  onOpenChange={setContactDrawerOpen}
  job={job}
/>
```

Supprimer les anciens rendus `RecruiterFinderDrawer` et `InsiderFinderDrawer`.

- [ ] **Step 6: Verifier que l'import Users est present**

S'assurer que `Users` est importe depuis `lucide-react` (il l'est probablement deja).

- [ ] **Step 7: Type check + lint**

Run: `cd frontend-next && npx tsc --noEmit 2>&1 | grep -i error | head -10`
Run: `cd frontend-next && npm run lint 2>&1 | head -20`
Expected: pas d'erreur

- [ ] **Step 8: Commit**

```bash
git add frontend-next/src/components/jobs/job-details-modal.tsx frontend-next/messages/fr.json frontend-next/messages/en.json frontend-next/messages/es.json frontend-next/messages/pt.json
git commit -m "feat(ui): integrate unified ContactFinderDrawer into JobDetailsModal"
```

---

## Task 10 : Smoke test manuel

- [ ] **Step 1: Demarrer le backend**

Run: `npm run dev:backend`
Expected: FastAPI demarre sur port 8000

- [ ] **Step 2: Verifier le nouvel endpoint**

Run: `curl -s http://localhost:8000/docs | grep "contact-finder"`
Expected: `/api/contact-finder/find` apparait dans la doc Swagger

- [ ] **Step 3: Demarrer le frontend**

Run: `npm run dev:frontend`
Expected: Next.js demarre sur port 3000

- [ ] **Step 4: Verifier dans le navigateur**

1. Ouvrir http://localhost:3000
2. Se connecter
3. Aller sur /jobs
4. Cliquer sur un job
5. Cliquer sur "Trouver les contacts"
6. Verifier : le drawer s'ouvre avec le champ entreprise pre-rempli
7. Cliquer "Lancer la recherche"
8. Verifier : resultats affiches OU fallback LinkedIn page visible
9. Verifier : jamais d'ecran vide

- [ ] **Step 5: Commit final (si ajustements necessaires)**

```bash
git add -A
git commit -m "fix: minor adjustments from smoke testing contact finder v2"
```
