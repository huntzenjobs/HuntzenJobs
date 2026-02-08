"""
Job Fairs / Salons Emploi — Hybrid Provider
============================================
Sources:
  1. France Travail API officielle (OAuth2, accès libre, ~15 000 events)
  2. L'Étudiant scraping (salons étudiants, ~14-118 salons/saison)

Zéro mock, zéro APEC, zéro CCI.
"""

import asyncio
import os
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)


# ==========================================
# DATA MODEL
# ==========================================

@dataclass
class JobFair:
    """Structure normalisée d'un salon emploi"""
    title: str
    event_type: str  # salon, forum, job_dating, webinar
    public: str  # etudiants, pros, tous, seniors, reconversion
    sector: str  # tech, industrie, sante, tous, etc.
    level: str  # tous, bac, bac+2, bac+5, etc.
    date_start: str  # YYYY-MM-DD
    date_end: Optional[str]
    time_start: Optional[str]
    time_end: Optional[str]
    city: str
    region: str
    address: Optional[str]
    format: str  # physique, virtuel, hybride
    organizer: str
    description: Optional[str]
    url: str
    source: str
    registration_url: Optional[str] = None
    is_free: bool = True
    companies_count: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ==========================================
# FRANCE TRAVAIL — API OFFICIELLE
# ==========================================

_ft_token: Optional[str] = None
_ft_token_expires: float = 0


async def _get_france_travail_token() -> str:
    """
    Obtient un access_token OAuth2 via client_credentials.
    Scope: api_mesevenementsemploiv1
    """
    global _ft_token, _ft_token_expires

    if _ft_token and time.time() < _ft_token_expires - 60:
        return _ft_token

    client_id = os.getenv("CLIENT_ID", "")
    client_secret = os.getenv("CLIENT_SECRET", "")

    if not client_id or not client_secret:
        raise ValueError(
            "CLIENT_ID et CLIENT_SECRET manquants dans .env. "
            "Créez une app sur https://francetravail.io"
        )

    token_url = "https://entreprise.francetravail.fr/connexion/oauth2/access_token"

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            token_url,
            params={"realm": "/partenaire"},
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "evenements",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if response.status_code != 200:
            logger.error(f"[FT_API] OAuth2 token error {response.status_code}: {response.text}")
            raise ValueError(f"France Travail OAuth2 failed: {response.status_code}")

        data = response.json()
        _ft_token = data["access_token"]
        _ft_token_expires = time.time() + data.get("expires_in", 1500)
        logger.info("[FT_API] OAuth2 token obtained successfully")
        return _ft_token


async def fetch_france_travail_events(
    region: str = "",
    sector: str = "",
    event_type: str = "",
) -> List[JobFair]:
    """
    API officielle France Travail — Mes événements emploi.
    Base: https://api.francetravail.io/partenaire/evenements/v1
    """
    events: List[JobFair] = []

    try:
        token = await _get_france_travail_token()
    except ValueError as e:
        logger.warning(f"[FT_API] Auth failed: {e}")
        return events

    api_base = "https://api.francetravail.io/partenaire/evenements/v1"

    body: Dict[str, Any] = {}
    if region:
        body["lieuEvenement"] = region
    if sector:
        body["thematique"] = sector

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{api_base}/evenements",
                json=body,
                headers=headers,
            )

            if response.status_code != 200:
                logger.warning(f"[FT_API] /evenements returned {response.status_code}: {response.text[:200]}")
                # Fallback: GET /salonsEnLigne
                response = await client.get(f"{api_base}/salonsEnLigne", headers=headers)
                if response.status_code != 200:
                    logger.error(f"[FT_API] Fallback also failed: {response.status_code}")
                    return events

            data = response.json()

            if isinstance(data, list):
                raw_events = data
            elif isinstance(data, dict):
                raw_events = data.get("resultats", data.get("evenements", data.get("results", [])))
                if not raw_events and "titre" in data:
                    raw_events = [data]
            else:
                raw_events = []

            logger.info(f"[FT_API] Got {len(raw_events)} raw events from API")

            for raw in raw_events:
                try:
                    event = _parse_ft_event(raw)
                    if event:
                        events.append(event)
                except Exception as e:
                    logger.debug(f"[FT_API] Skip event parse error: {e}")

    except httpx.TimeoutException:
        logger.warning("[FT_API] Request timeout")
    except Exception as e:
        logger.error(f"[FT_API] Error: {e}")

    return events


def _parse_ft_event(raw: Dict[str, Any]) -> Optional[JobFair]:
    """Parse un événement brut de l'API France Travail en JobFair."""
    title = raw.get("titre") or raw.get("intitule") or raw.get("libelle") or ""
    if not title:
        return None

    date_start_raw = raw.get("dateDebut") or raw.get("dateEvenement") or raw.get("date") or ""
    date_end_raw = raw.get("dateFin") or ""
    date_start = _parse_iso_date(date_start_raw)
    date_end = _parse_iso_date(date_end_raw) if date_end_raw else None

    time_start = raw.get("heureDebut") or raw.get("heure") or None
    time_end = raw.get("heureFin") or None

    lieu = raw.get("lieu") or raw.get("lieuEvenement") or {}
    if isinstance(lieu, str):
        city, address, region_name = lieu, None, detect_region(lieu)
    else:
        city = lieu.get("ville") or lieu.get("commune") or lieu.get("libelle") or raw.get("ville") or raw.get("codePostal", "")
        address = lieu.get("adresse") or lieu.get("rue") or None
        region_name = lieu.get("region") or detect_region(city)

    format_raw = str(raw.get("typeEvenement") or raw.get("modalite") or raw.get("format") or "").lower()
    if "ligne" in format_raw or "distanciel" in format_raw or "virtuel" in format_raw:
        event_format = "virtuel"
    elif "hybride" in format_raw or "mixte" in format_raw:
        event_format = "hybride"
    else:
        event_format = "physique"

    organizer = raw.get("organisateur") or raw.get("organisme") or raw.get("structure") or "France Travail"
    if isinstance(organizer, dict):
        organizer = organizer.get("nom") or organizer.get("libelle") or "France Travail"

    description = raw.get("description") or raw.get("contenu") or raw.get("descriptif") or None
    url = raw.get("url") or raw.get("urlDetailEvenement") or raw.get("lien") or "https://mesevenementsemploi.francetravail.fr/mes-evenements-emploi/evenements"

    full_text = title + " " + (description or "")

    return JobFair(
        title=title.strip(),
        event_type=classify_event_type(title),
        public=classify_public(full_text),
        sector=classify_sector(full_text),
        level="tous",
        date_start=date_start,
        date_end=date_end,
        time_start=time_start,
        time_end=time_end,
        city=city,
        region=region_name,
        address=address,
        format=event_format,
        organizer=organizer if isinstance(organizer, str) else "France Travail",
        description=description,
        url=url,
        source="france_travail",
        is_free=True,
    )


# ==========================================
# L'ÉTUDIANT — SCRAPING
# ==========================================

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}


async def scrape_letudiant_salons() -> List[JobFair]:
    """
    Scrape les salons depuis L'Étudiant.
    Sélecteur: <article class="tw-group/sal-card"> cards.
    Title in <h3>, URL in <a href="*.salon.letudiant.fr">, city from URL slug.
    """
    events: List[JobFair] = []

    url = "https://www.letudiant.fr/etudes/salons.html"

    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning(f"[LETUDIANT] {url} returned {response.status_code}")
                return events

            soup = BeautifulSoup(response.text, "html.parser")

            # Each salon is an <article class="tw-group/sal-card ...">
            articles = soup.find_all("article", class_=re.compile(r"sal-card"))

            for article in articles:
                try:
                    # Get salon link
                    salon_link = article.find("a", href=re.compile(r"salon\.letudiant\.fr"))
                    if not salon_link:
                        continue
                    href = salon_link.get("href", "")
                    if not href:
                        continue

                    # Title from h3 — clean out date digits that leak in
                    h3 = article.find(["h3", "h2", "h4"])
                    if h3:
                        raw_title = h3.get_text(" ", strip=True)
                        # Remove trailing date fragments like "07\n\nfévrier"
                        raw_title = re.sub(r"\s*\d{1,2}\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s*$", "", raw_title, flags=re.IGNORECASE).strip()
                        title = raw_title if len(raw_title) > 5 else ""
                    else:
                        title = ""

                    if not title:
                        # Fallback: build title from URL slug
                        slug_match = re.search(r"https?://([^.]+)\.salon\.letudiant\.fr", href)
                        if slug_match:
                            title = slug_match.group(1).replace("-", " ").title()
                        else:
                            continue

                    # City from URL slug (last word before .salon.letudiant.fr)
                    city_match = re.search(r"-([a-z]+(?:-[a-z]+)?)\.salon\.letudiant\.fr", href)
                    city = "Paris"
                    if city_match:
                        city = city_match.group(1).replace("-", " ").title()

                    # Also try from title "à Nice" pattern
                    title_city = re.search(r"à\s+([A-ZÀ-Ü][a-zà-ü]+(?:[\s-][A-ZÀ-Ü][a-zà-ü]+)*)", title)
                    if title_city:
                        city = title_city.group(1).strip()

                    # Date from card text
                    block_text = article.get_text(" ", strip=True)
                    date_start = _extract_date_from_text(block_text)
                    date_end = _extract_end_date_from_text(block_text, date_start)

                    if not href.startswith("http"):
                        href = "https:" + href if href.startswith("//") else "https://www.letudiant.fr" + href

                    event = JobFair(
                        title=title,
                        event_type="salon",
                        public="etudiants",
                        sector=classify_sector(title),
                        level=detect_level(title),
                        date_start=date_start,
                        date_end=date_end,
                        time_start=None,
                        time_end=None,
                        city=city,
                        region=detect_region(city),
                        address=None,
                        format="physique",
                        organizer="L'Étudiant",
                        description=None,
                        url=href,
                        source="letudiant",
                        is_free=True,
                    )
                    events.append(event)
                except Exception as e:
                    logger.debug(f"[LETUDIANT] Parse error: {e}")
                    continue

    except Exception as e:
        logger.error(f"[LETUDIANT] Scraping error: {e}")

    # Deduplicate by title
    seen = set()
    unique = []
    for ev in events:
        key = ev.title.lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(ev)

    logger.info(f"[LETUDIANT] Scraped {len(unique)} unique salons")
    return unique


# ==========================================
# HELPERS
# ==========================================

def _parse_iso_date(text: str) -> str:
    if not text:
        return datetime.now().strftime("%Y-%m-%d")
    if "T" in text or re.match(r"\d{4}-\d{2}-\d{2}", text):
        return text[:10]
    match = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", text)
    if match:
        d, m, y = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if y < 100:
            y += 2000
        return f"{y}-{m:02d}-{d:02d}"
    return parse_french_date(text)


def _extract_date_from_text(text: str) -> str:
    months_fr = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "february": 2, "march": 3, "january": 1, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
    }
    text_lower = text.lower()
    for month_name, month_num in months_fr.items():
        match = re.search(r"(\d{1,2})\s*" + month_name, text_lower)
        if match:
            day = int(match.group(1))
            year = datetime.now().year
            try:
                dt = datetime(year, month_num, day)
                if dt < datetime.now():
                    year += 1
            except ValueError:
                pass
            return f"{year}-{month_num:02d}-{day:02d}"
    return datetime.now().strftime("%Y-%m-%d")


def _extract_end_date_from_text(text: str, start_date: str) -> Optional[str]:
    months_fr = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "february": 2, "march": 3, "january": 1, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
    }
    text_lower = text.lower()
    for month_name, month_num in months_fr.items():
        match = re.search(r"(\d{1,2})\s*[-–]\s*(\d{1,2})\s*" + month_name, text_lower)
        if match:
            end_day = int(match.group(2))
            try:
                year = int(start_date[:4])
            except (ValueError, IndexError):
                year = datetime.now().year
            return f"{year}-{month_num:02d}-{end_day:02d}"
    return None


def parse_french_date(text: str) -> str:
    if not text:
        return datetime.now().strftime("%Y-%m-%d")
    text = text.lower().strip()
    months = {
        "janvier": 1, "février": 2, "mars": 3, "avril": 4,
        "mai": 5, "juin": 6, "juillet": 7, "août": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        "janv": 1, "févr": 2, "avr": 4, "juil": 7,
        "sept": 9, "oct": 10, "nov": 11, "déc": 12,
    }
    for month_name, month_num in months.items():
        if month_name in text:
            match = re.search(r"(\d{1,2})\s*" + month_name + r"\s*(\d{4})?", text)
            if match:
                day = int(match.group(1))
                year = int(match.group(2)) if match.group(2) else datetime.now().year
                return f"{year}-{month_num:02d}-{day:02d}"
    match = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})", text)
    if match:
        day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if year < 100:
            year += 2000
        return f"{year}-{month:02d}-{day:02d}"
    return datetime.now().strftime("%Y-%m-%d")


def classify_event_type(title: str) -> str:
    t = title.lower()
    if "job dating" in t or "jobdating" in t:
        return "job_dating"
    elif "webinar" in t or "visio" in t or "en ligne" in t or "webinaire" in t:
        return "webinar"
    elif "forum" in t:
        return "forum"
    elif "salon" in t:
        return "salon"
    elif "atelier" in t or "réunion" in t or "information" in t:
        return "forum"
    return "salon"


def classify_public(title: str) -> str:
    t = title.lower()
    if any(kw in t for kw in ["étudiant", "etudiant", "jeune diplômé", "alternance", "stage", "apprenti"]):
        return "etudiants"
    elif any(kw in t for kw in ["senior", "+45", "+50", "reconversion"]):
        return "seniors"
    elif any(kw in t for kw in ["cadre", "manager", "dirigeant", "ingénieur"]):
        return "pros"
    elif any(kw in t for kw in ["handicap", "rqth", "cap emploi"]):
        return "handicap"
    return "tous"


def classify_sector(title: str) -> str:
    t = title.lower()
    sectors = {
        "tech": ["tech", "it", "développeur", "data", "cyber", "numérique", "digital", "startup", "informatique"],
        "industrie": ["industrie", "btp", "construction", "aéronautique", "automobile", "mécanique", "travaux publics"],
        "sante": ["santé", "médical", "hôpital", "ehpad", "paramédical", "infirmier", "médico-social", "aide-soignant"],
        "commerce": ["commerce", "vente", "retail", "distribution", "vendeur"],
        "finance": ["banque", "finance", "assurance", "comptabilité"],
        "hotellerie": ["hôtellerie", "restauration", "tourisme", "hrt"],
        "transport": ["transport", "logistique", "supply chain"],
        "education": ["éducation", "formation", "enseignement"],
        "public": ["fonction publique", "territorial", "état", "collectivité"],
    }
    for sector, keywords in sectors.items():
        if any(kw in t for kw in keywords):
            return sector
    return "tous"


def detect_level(title: str) -> str:
    t = title.lower()
    if "bac+5" in t or "master" in t or "ingénieur" in t:
        return "bac+5"
    elif "bac+3" in t or "licence" in t:
        return "bac+3"
    elif "bac+2" in t or "bts" in t or "dut" in t:
        return "bac+2"
    elif "bac" in t and "bac+" not in t:
        return "bac"
    return "tous"


def detect_region(city: str) -> str:
    c = city.lower()
    regions = {
        "Île-de-France": ["paris", "boulogne", "nanterre", "versailles", "créteil", "saint-denis", "montreuil"],
        "Auvergne-Rhône-Alpes": ["lyon", "grenoble", "saint-étienne", "clermont", "annecy", "valence", "vaulx"],
        "Provence-Alpes-Côte d'Azur": ["marseille", "nice", "toulon", "aix", "avignon", "cannes", "brignoles"],
        "Occitanie": ["toulouse", "montpellier", "nîmes", "perpignan", "béziers"],
        "Nouvelle-Aquitaine": ["bordeaux", "limoges", "poitiers", "pau", "bayonne", "la rochelle"],
        "Pays de la Loire": ["nantes", "angers", "le mans", "saint-nazaire", "laval"],
        "Bretagne": ["rennes", "brest", "lorient", "quimper", "vannes"],
        "Hauts-de-France": ["lille", "amiens", "dunkerque", "calais", "roubaix", "tourcoing"],
        "Grand Est": ["strasbourg", "metz", "nancy", "reims", "mulhouse", "colmar"],
        "Normandie": ["rouen", "le havre", "caen", "cherbourg", "dieppe"],
        "Centre-Val de Loire": ["tours", "orléans", "bourges", "blois", "chartres"],
        "Bourgogne-Franche-Comté": ["dijon", "besançon", "auxerre", "belfort", "chalon"],
        "Corse": ["ajaccio", "bastia"],
    }
    for region, cities in regions.items():
        if any(v in c for v in cities):
            return region
    return "France"


# ==========================================
# MAIN AGGREGATOR
# ==========================================

async def search_job_fairs(
    region: str = "",
    sector: str = "",
    public: str = "",
    event_type: str = "",
    format_type: str = "",
) -> Dict[str, Any]:
    """Recherche agrégée: France Travail API + L'Étudiant scraping."""
    all_events: List[JobFair] = []
    sources_used: List[str] = []
    errors: List[str] = []

    tasks = [
        ("france_travail", fetch_france_travail_events(region, sector, event_type)),
        ("letudiant", scrape_letudiant_salons()),
    ]

    results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)

    for (source_name, _), result in zip(tasks, results):
        if isinstance(result, Exception):
            errors.append(f"{source_name}: {str(result)}")
            logger.warning(f"[JOB_FAIRS] {source_name} failed: {result}")
        elif result:
            all_events.extend(result)
            sources_used.append(source_name)
            logger.info(f"[JOB_FAIRS] {source_name}: {len(result)} events")
        else:
            logger.info(f"[JOB_FAIRS] {source_name}: 0 events")

    filtered = all_events

    if region:
        r = region.lower()
        filtered = [e for e in filtered if r in e.region.lower() or r in e.city.lower()]
    if sector and sector != "tous":
        filtered = [e for e in filtered if e.sector == sector or e.sector == "tous"]
    if public and public != "tous":
        filtered = [e for e in filtered if e.public == public or e.public == "tous"]
    if event_type:
        filtered = [e for e in filtered if e.event_type == event_type]
    if format_type:
        filtered = [e for e in filtered if e.format == format_type]

    filtered.sort(key=lambda e: e.date_start)

    return {
        "success": True,
        "events": [e.to_dict() for e in filtered],
        "count": len(filtered),
        "total_scraped": len(all_events),
        "sources": sources_used,
        "errors": errors if errors else None,
        "filters_applied": {
            "region": region or None,
            "sector": sector or None,
            "public": public or None,
            "event_type": event_type or None,
            "format": format_type or None,
        },
    }


# ==========================================
# CLI TEST
# ==========================================

if __name__ == "__main__":
    import json

    async def test():
        print("Testing job fairs scraper...")
        result = await search_job_fairs()
        print(f"\nTotal: {result['count']} events")
        print(f"Sources: {result['sources']}")
        if result.get("errors"):
            print(f"Errors: {result['errors']}")
        for e in result["events"][:5]:
            print(f"  [{e['source']}] {e['title']}")
            print(f"    {e['date_start']} | {e['city']} ({e['region']})")

    asyncio.run(test())
