# Spec : Recruiter Finder V2 - Fusion & 90% de taux de succes

> Date : 2026-03-25
> Objectif : Fusionner Recruiter Finder + Insider Finder en un systeme unifie avec taux de succes >= 90%
> Definition du succes : l'utilisateur repart avec AU MOINS 1 profil LinkedIn pertinent d'un recruteur/RH

---

## 1. Problemes actuels

| Probleme | Impact |
|----------|--------|
| Apollo.io sans filtre localisation | Recruteur Paris retourne pour un poste a Bordeaux |
| Seulement 10 titres RH dans Apollo | Rate des variantes FR/EN (HRBP, Charge de recrutement, etc.) |
| Hunter.io domain guessing naif (`{slug}.com`) | Echoue pour `.fr`, `.io`, `.eu`, `.org` |
| SerpAPI `gl: "fr"` hardcode | Ne trouve rien pour entreprises internationales |
| 2 drawers separes (Recruiter Finder + Insider Finder) | Experience utilisateur confuse |
| Pas de cache | Gaspille les quotas API gratuits (25 Hunter/mois, 50 Apollo/mois) |
| Ecran vide si rien trouve | L'utilisateur paie un quota pour zero resultat |
| Emails masques (fiabilite insuffisante) | Feature premium sans valeur differenciante |
| Pas de quota sur Insider Finder | Seul rate limit global 5/min |

---

## 2. Architecture cible

### 2.1 Flux unifie

```
POST /api/contact-finder/find
  |
  +-- 1. Auth + quota check (recruiter_search)
  |
  +-- 2. Check cache Supabase (company_normalized + city)
  |     +-- HIT (< 30 jours) --> retourner cache
  |
  +-- 3. Apollo.io (source PRIMAIRE - donnees structurees)
  |     +-- person_locations[]: ["Bordeaux, France"]  <-- NOUVEAU
  |     +-- person_titles[]: 25+ keywords FR+EN       <-- AMELIORE
  |     +-- Resultats --> contacts avec email + LinkedIn
  |
  +-- 4. SI Apollo < 3 recruteurs RH --> SerpAPI + Groq (ENRICHISSEMENT)
  |     +-- Prompt ameliore : 5 queries au lieu de 3
  |     +-- gl/hl dynamique selon pays de l'offre
  |     +-- Resultats LinkedIn --> merge + dedup avec Apollo
  |
  +-- 5. Hunter.io (enrichissement EMAIL optionnel)
  |     +-- SI on a des noms sans email --> chercher email pattern
  |     +-- N'utilise PAS de quota si aucun contact trouve
  |
  +-- 6. Fallback garanti : page LinkedIn entreprise
  |     +-- linkedin.com/company/{slug}/people/?keywords=recruteur
  |     +-- TOUJOURS present dans la reponse, meme si contacts trouves
  |
  +-- 7. Cache resultats en Supabase + increment quota
  |
  +-- 8. Retourner reponse unifiee
```

### 2.2 Decision tree : quand appeler quoi

```
Apollo OK (>= 3 HR contacts) ?
  OUI --> retourner Apollo seul (economise SerpAPI)
  NON --> Apollo a trouve des contacts mais < 3 HR ?
    OUI --> completer avec SerpAPI (merge)
    NON --> Apollo a retourne 0 ?
      OUI --> SerpAPI seul (source principale)
      NON --> impossible (couvert ci-dessus)

Contacts trouves ont des emails ?
  OUI --> afficher email si verified
  NON --> Hunter email pattern en enrichissement

Total contacts > 0 ?
  OUI --> afficher contacts + fallback LinkedIn page en bonus
  NON --> afficher fallback LinkedIn page SEUL (jamais ecran vide)
```

---

## 3. Backend : nouveau endpoint unifie

### 3.1 Route : `POST /api/contact-finder/find`

**Fichier :** `backend/src/api/routes/contact_finder.py` (NOUVEAU)

**Remplace :**
- `POST /api/recruiter-finder/find` (deprece, redirige)
- `POST /api/insider-finder/find` (deprece, redirige)

**Signature endpoint :**
```python
@router.post("/find", response_model=ContactFinderResponse)
@limiter.limit("10/minute")
async def find_contacts(
    request: Request,                              # OBLIGATOIRE pour SlowAPI
    body: ContactFinderRequest,
    authorization: str | None = Header(None),
):
```

**Timeout global :** Le flux complet (Apollo + SerpAPI + Hunter + domain guessing) est encadre par un `asyncio.wait_for(timeout=20)`. Si le timeout est atteint, on retourne les resultats partiels + fallback LinkedIn page. Jamais de timeout visible pour l'utilisateur.

### 3.2 Request schema

```python
class ContactFinderRequest(BaseModel):
    company_name: str
    company_domain: str | None = None   # None par defaut (pas "")
    company_website: str | None = None
    job_title: str | None = None
    city: str | None = None             # NOUVEAU - pour filtrer par localisation
    country_code: str | None = "fr"     # NOUVEAU - pour SerpAPI gl/hl
    is_alternance: bool = False         # NOUVEAU - pour query CAMPUS
    force_refresh: bool = False         # NOUVEAU - ignorer le cache
```

### 3.3 Response schema

```python
class ContactFinderContact(BaseModel):
    name: str
    position: str | None = None
    email: str | None = None          # None si pas trouve
    email_verified: bool = False
    linkedin_url: str | None = None
    confidence: int = 0               # 0-100
    category: str = "other"           # "hr", "tech", "pair", "campus", "other"
    source: str = "apollo"            # "apollo", "serpapi", "hunter"

class ContactFinderResponse(BaseModel):
    company: str
    domain: str | None = None
    email_pattern: str | None = None
    contacts: list[ContactFinderContact]    # UNIFIE - plus de recruiters/tech_team separes
    total_found: int
    sources_used: list[str]                 # ["apollo", "serpapi", "hunter"]
    linkedin_company_url: str               # TOUJOURS present - fallback garanti
    strategy: str | None = None             # Explication IA (depuis Groq)
    cached: bool = False                    # True si resultats depuis cache
    cached_at: str | None = None             # ISO date si cache (ex: "2026-03-25")
```

### 3.4 Ameliorations Apollo

**Fichier modifie :** `backend/src/services/recruiter_finder/apollo.py`

Changements :
1. Ajouter `person_locations[]` depuis `city` + `country_code`
2. Etendre `person_titles` de 10 a 25+ keywords :

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
```

3. Ajouter parametre `person_locations` :
```python
if city:
    # Apollo attend le format "City, Country"
    country_name = COUNTRY_CODE_TO_NAME.get(country_code, "France")
    payload["person_locations"] = [f"{city}, {country_name}"]
```

### 3.5 Ameliorations SerpAPI / Groq

**Fichier modifie :** `backend/src/services/recruiter_finder/insider_service.py`

Changements :
1. `gl` et `hl` dynamiques depuis `country_code` (pas hardcode "fr")
2. Augmenter limite queries de 3 a 5
3. Prompt Groq ameliore (voir section 3.6)

```python
params = {
    "engine": "google",
    "q": query_text,
    "api_key": api_key,
    "gl": country_code or "fr",  # Dynamique
    "hl": country_code or "fr",  # Dynamique
}

for q_obj in queries[:5]:  # 5 au lieu de 3
```

### 3.6 Prompt Groq ameliore

**Fichier modifie :** `backend/prompts/insider_finder.txt`

Ajouts au prompt :
- Generer 5 queries au lieu de 3 (RECRUITER_FR, RECRUITER_EN, HR_MANAGER, PAIR, HIRING_MANAGER)
- Variantes FR + EN des titres RH
- Instruction explicite : toujours inclure la ville si disponible
- Si `is_alternance` : ajouter query CAMPUS
- Nouvelle instruction : generer un `company_linkedin_slug` (ex: "societe-generale")

### 3.7 Amelioration domain guessing

**Fichier modifie :** `backend/src/services/recruiter_finder/hunter.py`

Changement dans `find_recruiters_for_job()` quand pas de domain :

```python
# AVANT (naif)
slug = re.sub(r'[^a-z0-9]', '', company_name.lower())
domain = f"{slug}.com"

# APRES (multi-TLD avec protection SSRF et timeout global)
async def guess_domain(company_name: str) -> str | None:
    """
    Teste plusieurs TLDs et retourne le premier qui repond.

    Securite :
    - Validation SSRF : pas d'IP, pas de localhost, pas de port
    - Max 6 candidats (2 slugs x 3 TLDs prioritaires)
    - Timeout 3s par requete, timeout global 8s
    """
    slug = re.sub(r'[^a-z0-9-]', '', company_name.lower().replace(' ', '-'))
    slug = re.sub(r'-+', '-', slug).strip('-')
    slug_no_dash = slug.replace('-', '')

    # Protection SSRF : rejeter si le slug ressemble a une IP ou contient des chars suspects
    if re.match(r'^\d+[-.]?\d+[-.]?\d+[-.]?\d+$', slug):
        return None

    # Max 6 candidats pour limiter la latence
    candidates = []
    for s in [slug, slug_no_dash]:
        for tld in [".fr", ".com", ".io"]:  # 3 TLDs prioritaires
            candidates.append(f"{s}{tld}")

    async def check_domain(client: httpx.AsyncClient, domain: str) -> str | None:
        try:
            resp = await client.head(f"https://{domain}", follow_redirects=True, timeout=3)
            if resp.status_code < 400:
                return domain
        except Exception:
            pass
        return None

    # Timeout global de 8 secondes pour tout le domain guessing
    try:
        async with httpx.AsyncClient() as client:
            for domain in candidates:
                result = await asyncio.wait_for(
                    check_domain(client, domain), timeout=3
                )
                if result:
                    return result
    except asyncio.TimeoutError:
        logger.warning(f"[DomainGuess] Timeout global pour {company_name}")

    return None
```

### 3.8 Construction du LinkedIn company URL (fallback garanti)

```python
def build_linkedin_company_url(company_name: str, keywords: str = "recruteur") -> str:
    """Construit l'URL LinkedIn People de l'entreprise."""
    slug = re.sub(r'[^a-z0-9-]', '-', company_name.lower().strip())
    slug = re.sub(r'-+', '-', slug).strip('-')
    return f"https://www.linkedin.com/company/{slug}/people/?keywords={keywords}"
```

Ce fallback est **toujours** inclus dans la reponse, meme si des contacts sont trouves.

### 3.9 Cache Supabase

**Nouvelle table :** `contact_finder_cache`

```sql
CREATE TABLE contact_finder_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_normalized TEXT NOT NULL,     -- lower(trim(company_name))
    city_normalized TEXT NOT NULL DEFAULT '',
    response_data JSONB NOT NULL,         -- ContactFinderResponse serialisee
    sources_used TEXT[] NOT NULL DEFAULT '{}',
    total_found INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',

    UNIQUE(company_normalized, city_normalized)
);

CREATE INDEX idx_cache_lookup ON contact_finder_cache(company_normalized, city_normalized)
    WHERE expires_at > NOW();

-- RLS : service_role uniquement (pas d'acces direct user)
ALTER TABLE contact_finder_cache ENABLE ROW LEVEL SECURITY;
```

**Logique cache :**
```python
async def get_cached_result(company: str, city: str) -> dict | None:
    key_company = company.lower().strip()
    key_city = (city or "").lower().strip()
    result = supabase.table("contact_finder_cache") \
        .select("response_data, created_at") \
        .eq("company_normalized", key_company) \
        .eq("city_normalized", key_city) \
        .gt("expires_at", "now()") \
        .maybe_single() \
        .execute()
    if result.data:
        data = result.data["response_data"]
        data["cached"] = True
        data["cached_at"] = result.data["created_at"][:10]  # "2026-03-25"
        return data
    return None

async def set_cached_result(company: str, city: str, response: dict, sources: list[str], total: int):
    """
    Cache les resultats. Ne cache PAS les resultats vides (total_found == 0)
    pour permettre un retry immediat.
    """
    if total == 0:
        return  # Pas de cache pour les resultats vides

    key_company = company.lower().strip()
    key_city = (city or "").lower().strip()
    supabase.table("contact_finder_cache") \
        .upsert({
            "company_normalized": key_company,
            "city_normalized": key_city,
            "response_data": response,
            "sources_used": sources,
            "total_found": total,
        }, on_conflict="company_normalized,city_normalized") \
        .execute()
```

### 3.10 Deduplication des contacts

Quand on merge Apollo + SerpAPI :

```python
def dedup_contacts(contacts: list[dict]) -> list[dict]:
    """
    Deduplique par LinkedIn URL ou par (nom + position) normalise.
    Note : dedup par nom seul est trop agressive (homonymes possibles),
    on utilise donc la combinaison nom + position pour eviter les faux positifs.
    """
    seen_linkedin = set()
    seen_identity = set()  # (name, position) tuple
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
```

---

## 4. Frontend : drawer unifie

### 4.1 Nouveau composant

**Fichier :** `frontend-next/src/components/jobs/contact-finder-drawer.tsx` (NOUVEAU)

Remplace :
- `recruiter-finder-drawer.tsx` (deprece)
- `insider-finder-drawer.tsx` (deprece)

### 4.2 Changements UI

| Avant | Apres |
|-------|-------|
| 2 boutons separes dans JobDetailsModal | 1 seul bouton "Trouver les contacts" |
| Drawer Recruiter Finder (bleu) | Drawer unifie "Trouver les contacts" |
| Drawer Insider Finder (violet) | (fusionne ci-dessus) |
| Ecran vide si 0 resultats | Fallback LinkedIn page TOUJOURS visible |
| Groupes : HR/Tech/Other + Pair/Recruiter/Campus | Groupes unifies : Recruteur, Futur Collegue, Campus, Autre |
| Emails masques | Emails affiches SI `email_verified == true` |

### 4.3 Sections du drawer

```
+-----------------------------------------------+
| Trouver les contacts                    [X]    |
| Decouvrez les recruteurs et collegues          |
+-----------------------------------------------+
|                                               |
| [Input: Nom de l'entreprise] (pre-rempli)     |
|                                               |
| [Bouton: Lancer la recherche]                 |
|                                               |
+-----------------------------------------------+

          |  (apres recherche)  |

+-----------------------------------------------+
| Strategie IA                                   |
| "Cette strategie cible d'abord..."            |
+-----------------------------------------------+
|                                               |
| --- Recruteurs (3 profils) ---                |
| [ContactCard: nom, poste, LinkedIn, email?]   |
| [ContactCard: ...]                            |
|                                               |
| --- Futurs Collegues (2 profils) ---          |
| [ContactCard: ...]                            |
|                                               |
| --- Page LinkedIn entreprise ---              |
| [Lien direct vers la page People]             |
|                                               |
| [Badge: Resultats depuis cache / live]         |
| [RGPD disclaimer]                             |
+-----------------------------------------------+
```

### 4.4 ContactCard unifie

```
+-------------------------------------------+
| Jean Dupont              [Recruteur]       |
| Charge de recrutement - Bordeaux          |
|                                           |
| [LinkedIn] [Email: j.dupont@sg.fr] [Copy] |
| Confiance: 95%  |  Source: Apollo          |
+-------------------------------------------+
```

- Email visible uniquement si `email_verified == true`
- Badge de confiance (vert >= 80, orange >= 50, gris < 50)
- Source discrete en footer

### 4.5 Fallback LinkedIn page

Toujours visible en bas du drawer, meme si des contacts sont trouves :

```
+-------------------------------------------+
| Explorer l'equipe sur LinkedIn             |
| Voir tous les employes de {company}       |
| [Bouton: Ouvrir sur LinkedIn ->]           |
+-------------------------------------------+
```

---

## 5. Migration

### 5.1 Anciens endpoints

Les anciens endpoints restent fonctionnels tels quels (pas de redirect ni proxy).
Ils ne sont PAS modifies car le frontend est migre en meme temps.
Ils seront supprimes dans une version future une fois la migration validee en prod.

```python
# recruiter_finder.py - marquer deprecated dans docstring uniquement
@router.post("/find", deprecated=True)
async def find_recruiters(body: RecruiterFinderRequest, ...):
    """DEPRECATED - Use POST /api/contact-finder/find instead.
    Kept as-is for rollback safety. Will be removed in a future release."""
    # Code existant inchange
    ...
```

### 5.2 Migration des quotas

Le feature name reste `recruiter_search` dans la table `usage_quotas`.
Pas de migration SQL necessaire pour les quotas -- le nouveau endpoint utilise
les memes fonctions `check_recruiter_search_quota()` et `increment_recruiter_search_quota()`.

### 5.3 Frontend : mise a jour du trigger

Dans `JobDetailsModal` (ou equivalent) :
- Remplacer les 2 boutons par 1 seul
- Importer `ContactFinderDrawer` au lieu des 2 anciens

### 5.4 i18n

Ajouter les nouvelles cles dans les **4 fichiers** : `fr.json`, `en.json`, `es.json`, `pt.json` :

Namespace `contactFinder` :
- `title`, `subtitle`, `searchButton`, `searching`
- `strategyLabel`, `recruiterGroup`, `pairGroup`, `campusGroup`, `otherGroup`
- `linkedinPageTitle`, `linkedinPageButton`
- `noResultsFallback`, `cachedBadge`, `liveBadge`
- `emailCopied`, `rgpdDisclaimer`
- `quotaReached`, `errorGeneric`

---

## 6. Fichiers impactes

### Backend (modifier)
| Fichier | Action |
|---------|--------|
| `backend/src/api/routes/contact_finder.py` | CREER - nouveau endpoint unifie |
| `backend/src/api/routes/__init__.py` | Ajouter route `/api/contact-finder` |
| `backend/src/services/recruiter_finder/apollo.py` | MODIFIER - ajouter `person_locations`, etendre titres |
| `backend/src/services/recruiter_finder/insider_service.py` | MODIFIER - gl/hl dynamique, 5 queries |
| `backend/src/services/recruiter_finder/hunter.py` | MODIFIER - domain guessing multi-TLD |
| `backend/prompts/insider_finder.txt` | MODIFIER - prompt ameliore 5 queries |
| `backend/src/api/routes/recruiter_finder.py` | MODIFIER - marquer deprecated |
| `backend/src/api/routes/insider_finder.py` | MODIFIER - marquer deprecated |

### Frontend (modifier)
| Fichier | Action |
|---------|--------|
| `frontend-next/src/components/jobs/contact-finder-drawer.tsx` | CREER - drawer unifie |
| `frontend-next/src/components/jobs/recruiter-finder-drawer.tsx` | DEPRECER (garder pour compatibilite) |
| `frontend-next/src/components/jobs/insider-finder-drawer.tsx` | DEPRECER (garder pour compatibilite) |
| Composant qui trigger les drawers (JobDetailsModal ou similar) | MODIFIER - 1 bouton au lieu de 2 |
| `frontend-next/messages/fr.json` | MODIFIER - ajouter namespace contactFinder |
| `frontend-next/messages/en.json` | MODIFIER - ajouter namespace contactFinder |

### Database
| Fichier | Action |
|---------|--------|
| `supabase/migrations/2026XXXX_contact_finder_cache.sql` | CREER - table cache |

---

## 7. Estimation du taux de succes

| Scenario | Avant | Apres | Explication |
|----------|-------|-------|-------------|
| Grande entreprise (CAC40) | ~65% | ~95% | Apollo + localisation precise |
| ETI / Grosse PME | ~40% | ~85% | Apollo + SerpAPI complementaire |
| PME francaise | ~25% | ~80% | SerpAPI LinkedIn en primaire |
| Entreprise internationale | ~55% | ~90% | Apollo international + gl dynamique |
| Startup < 20 personnes | ~15% | ~70% | SerpAPI + fallback LinkedIn page |
| **Global pondere** | **~40-50%** | **~85-90%** | |
| **Avec fallback LinkedIn page** | - | **100%** | Jamais ecran vide |

---

## 8. Contraintes et risques

| Risque | Mitigation |
|--------|-----------|
| Quotas gratuits limites (25 Hunter, 50 Apollo, 100 SerpAPI /mois) | Cache 30 jours + decision tree pour eviter appels inutiles |
| Apollo rate limit 429 | Retry apres 1h, SerpAPI en fallback |
| SerpAPI retourne des profils non pertinents | Scoring de pertinence par le prompt Groq + dedup |
| Domain guessing HEAD requests lents | Max 6 candidats, timeout 3s/req, timeout global 8s, protection SSRF |
| LinkedIn company slug incorrect | Best effort, l'utilisateur peut corriger le nom |
| RGPD : stockage de contacts en cache | Cache anonymise (pas lie a un user), TTL 30j, disclaimer |
| Latence totale trop longue (Apollo+SerpAPI+Hunter sequentiel) | Timeout global 20s sur tout le flux, resultats partiels retournes si timeout |
| Cache de resultats vides bloque les retries | Resultats avec total_found=0 ne sont PAS caches |

---

## 9. Queries SerpAPI en parallele

Les 5 queries SerpAPI sont executees en parallele via `asyncio.gather` pour
reduire la latence de 5 x 3-5s a 3-5s total :

```python
async def execute_queries_parallel(queries: list[dict], api_key: str, country_code: str) -> list[dict]:
    """Execute les queries SerpAPI en parallele."""
    async with httpx.AsyncClient(timeout=10) as client:
        tasks = [
            _execute_single_query(client, q, api_key, country_code)
            for q in queries[:5]
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        all_insiders = []
        for r in results:
            if isinstance(r, list):
                all_insiders.extend(r)
        return all_insiders
```

---

## 10. Tests

| Test | Type | Description |
|------|------|-------------|
| `test_dedup_contacts` | Unit | Dedup par LinkedIn URL et par (nom, position) |
| `test_guess_domain_ssrf` | Unit | Rejeter IPs, localhost, ports dans le slug |
| `test_guess_domain_found` | Unit | Mock httpx, trouver le bon TLD |
| `test_build_linkedin_url` | Unit | Slugification correcte |
| `test_cache_empty_not_stored` | Unit | Resultats vides pas caches |
| `test_cache_hit` | Unit | Resultats caches retournes avec `cached=True` |
| `test_contact_finder_flow` | Integration | Mock Apollo+SerpAPI+Hunter, verifier le merge |
| `test_timeout_returns_partial` | Integration | Timeout global 20s retourne resultats partiels |

---

## 11. Hors scope (Phase 2)

- Message personnalise genere par IA pour contacter le recruteur
- Historique des recherches par utilisateur
- Passage aux plans payants Apollo/Hunter
- Scoring de pertinence avance avec embedding
- Warm cache via cron sur les entreprises des offres actives
