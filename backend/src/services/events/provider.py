"""
Job Fairs / Professional Events Provider
=========================================
Scrapes job fairs and professional events from various French public sources.
    Sources supported: France Travail, CCI France, APEC, L'Etudiant, Studyrama, CIDJ.

Follows PEP 8 standards and uses English for code/comments.
"""

import asyncio
import logging
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Data Model
# ------------------------------------------------------------------------------

@dataclass
class JobFair:
    """Normalized structure for a job fair or professional event."""
    title: str
    event_type: str  # salon, forum, job_dating, webinar
    public: str      # students, pros, all, seniors, transition
    sector: str      # tech, industry, health, all, etc.
    level: str       # all, bac, bac+2, bac+5, etc.
    date_start: str  # YYYY-MM-DD
    date_end: str | None
    time_start: str | None
    time_end: str | None
    city: str
    region: str
    address: str | None
    format: str     # physical, virtual, hybrid
    organizer: str
    description: str | None
    url: str
    source: str
    registration_url: str | None = None
    is_free: bool = True
    companies_count: int | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert dataclass to dictionary."""
        return asdict(self)


# ------------------------------------------------------------------------------
# Scrapers
# ------------------------------------------------------------------------------

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}


async def scrape_france_travail_events(region: str = "", sector: str = "") -> list[JobFair]:
    """Scrape events from France Travail (formerly Pôle Emploi)."""
    events = []
    try:
        url = "https://mesevenementsemploi.francetravail.fr/mes-evenements-emploi/evenements"
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning(f"[Events] France Travail returned {response.status_code}")
                return events

            soup = BeautifulSoup(response.text, 'html.parser')
            event_cards = soup.select(
                '.event-card, .evenement-item, article.event, .card-evenement, article'
            )

            for card in event_cards:
                try:
                    title_el = card.select_one('h2, h3, .event-title, .titre')
                    date_el = card.select_one('.date, .event-date, time')
                    location_el = card.select_one('.location, .lieu, .ville')
                    link_el = card.select_one('a[href]')

                    if not title_el:
                        continue

                    title = title_el.get_text(strip=True)
                    date_start = parse_french_date(
                        date_el.get_text(strip=True) if date_el else ""
                    )
                    city = location_el.get_text(strip=True) if location_el else "France"

                    event = JobFair(
                        title=title,
                        event_type=classify_event_type(title),
                        public=classify_public(title),
                        sector=classify_sector(title) if not sector else sector,
                        level="all",
                        date_start=date_start,
                        date_end=None,
                        time_start=None,
                        time_end=None,
                        city=city,
                        region=region or detect_region(city),
                        address=None,
                        format="physical",
                        organizer="France Travail",
                        description=None,
                        url=link_el.get('href', url) if link_el else url,
                        source="france_travail",
                        is_free=True
                    )
                    events.append(event)
                except Exception:
                    continue
    except Exception as e:
        logger.error(f"[Events] France Travail scraping error: {e}")
    return events


async def scrape_letudiant_salons() -> list[JobFair]:
    """
    Scrape student fairs from L'Etudiant.

    Structure: <article> tags with <time datetime="YYYY-MM-DD"> for date.
    City is extracted from the title pattern: "Salon ... à Lyon".
    """
    events = []
    try:
        base_url = "https://www.letudiant.fr/etudes/salons.html"
        urls = [base_url, "https://www.letudiant.fr/etudes/salons/orientation.html"]

        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            for target_url in urls:
                response = await client.get(target_url)
                if response.status_code != 200:
                    continue

                soup = BeautifulSoup(response.text, 'html.parser')
                salon_cards = soup.select('article')

                for card in salon_cards:
                    try:
                        # Get title from full card text (filter out date/button noise)
                        full_text = card.get_text(' ', strip=True)

                        # Extract title: pattern "Le Salon de l'Etudiant ... à CityName"
                        title_match = re.search(
                            r'((?:Le )?Salon[^\d]+?)(?:\d|Découvrir|Ajouter)', full_text
                        )
                        title = title_match.group(1).strip() if title_match else ""
                        if not title or len(title) < 10:
                            continue

                        # Extract city from title: "... à Lyon" → "Lyon"
                        city = "Paris"
                        city_match = re.search(r'à\s+([A-ZÀ-Ü][a-zà-ÿ-]+(?:\s+[a-zà-ÿ-]+)?)', title)
                        if city_match:
                            city = city_match.group(1).strip()

                        # Clean title (remove trailing city repetition)
                        title = re.sub(r'\d{1,2}\s*[-–]?\s*\d{0,2}\s*$', '', title).strip()

                        # Date from <time datetime="YYYY-MM-DD">
                        time_el = card.select_one('time[datetime]')
                        date_start = time_el.get('datetime', '') if time_el else ""
                        if not date_start:
                            date_start = parse_french_date(full_text)

                        # Link
                        link_el = card.select_one('a[href]')
                        href = ""
                        if link_el:
                            href = link_el.get('href', '')
                            if href and not href.startswith('http'):
                                href = f"https://www.letudiant.fr{href}"

                        event = JobFair(
                            title=title,
                            event_type=classify_event_type(title),
                            public="students",
                            sector=classify_sector(title),
                            level=detect_level(title),
                            date_start=date_start,
                            date_end=None,
                            time_start=None,
                            time_end=None,
                            city=city,
                            region=detect_region(city),
                            address=None,
                            format="physical",
                            organizer="L'Etudiant",
                            description=None,
                            url=href or target_url,
                            source="letudiant"
                        )
                        events.append(event)
                    except Exception:
                        continue

        logger.info(f"[Events] L'Etudiant: found {len(events)} salons")
    except Exception as e:
        logger.error(f"[Events] L'Etudiant scraping error: {e}")
    return events


async def scrape_studyrama_salons() -> list[JobFair]:
    """
    Scrape salons from Studyrama.

    Page: /salons/tous-les-salons
    Structure: Each .salon is an <a> tag with href to individual salon page.
    Contains .city, .label (h3), and .date sub-elements.
    """
    events = []
    try:
        url = "https://www.studyrama.com/salons/tous-les-salons"
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning(f"[Events] Studyrama returned {response.status_code}")
                return events

            soup = BeautifulSoup(response.text, 'html.parser')
            # Each .salon is an <a> tag: <a class="salon physique" href="/salons/...">
            salon_cards = soup.select('a.salon')

            for card in salon_cards:
                try:
                    label_el = card.select_one('.label h3, .label')
                    city_el = card.select_one('.city')
                    date_el = card.select_one('.date')

                    title = label_el.get_text(strip=True) if label_el else ""
                    city = city_el.get_text(strip=True) if city_el else ""
                    date_text = date_el.get_text(strip=True) if date_el else ""

                    # Skip noise: must have a title and a city
                    if not title or len(title) < 5 or not city:
                        continue

                    # The card itself is the <a> tag with the individual salon URL
                    href = card.get('href', '')
                    if href and not href.startswith('http'):
                        href = f"https://www.studyrama.com{href}"

                    event = JobFair(
                        title=title,
                        event_type=classify_event_type(title),
                        public="students",
                        sector=classify_sector(title),
                        level=detect_level(title),
                        date_start=parse_french_date(date_text),
                        date_end=None,
                        time_start=None,
                        time_end=None,
                        city=city,
                        region=detect_region(city),
                        address=None,
                        format="physical",
                        organizer="Studyrama",
                        description=None,
                        url=href or url,
                        source="studyrama",
                        is_free=True
                    )
                    events.append(event)
                except Exception:
                    continue

        logger.info(f"[Events] Studyrama: found {len(events)} salons")
    except Exception as e:
        logger.error(f"[Events] Studyrama scraping error: {e}")
    return events


async def scrape_cidj_events() -> list[JobFair]:
    """
    Scrape events from CIDJ (Centre d'Information et Documentation Jeunesse).

    Page: /agenda
    Structure: .content-item-post-card with date and location text.
    Events include forums, salons, and orientation sessions.
    """
    events = []
    try:
        url = "https://www.cidj.com/agenda"
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning(f"[Events] CIDJ returned {response.status_code}")
                return events

            soup = BeautifulSoup(response.text, 'html.parser')
            cards = soup.select('.views-row.item-post-card')

            for card in cards:
                try:
                    # Title: p.title-post-card > a
                    title_el = card.select_one('p.title-post-card a, .title-post-card a')
                    if not title_el:
                        continue

                    title = title_el.get_text(strip=True)
                    href = title_el.get('href', '')
                    if href and not href.startswith('http'):
                        href = f"https://www.cidj.com{href}"

                    # Skip noise
                    if not title or len(title) < 5:
                        continue

                    # City: span.adress-item-post-card → "Paris (75)", "Montreuil (93)"
                    city = "France"
                    addr_el = card.select_one('span.adress-item-post-card, .adress-item-post-card')
                    if addr_el:
                        addr_text = addr_el.get_text(strip=True)
                        city_match = re.search(r'([A-ZÀ-Üa-zà-ÿ][a-zà-ÿA-ZÀ-Ü\s-]+)\s*\(\d{2,3}\)', addr_text)
                        if city_match:
                            city = city_match.group(1).strip()

                    # Date: p.date-range-post-card → "Du19/02/2026Au19/02/2026"
                    date_el = card.select_one('p.date-range-post-card, .date-range-post-card')
                    date_text = date_el.get_text(strip=True) if date_el else ""
                    date_match = re.search(r'Du(\d{2}/\d{2}/\d{4})', date_text)
                    date_end_match = re.search(r'Au(\d{2}/\d{2}/\d{4})', date_text)
                    date_start = parse_french_date(date_match.group(1)) if date_match else datetime.now().strftime("%Y-%m-%d")
                    date_end = parse_french_date(date_end_match.group(1)) if date_end_match else None

                    event = JobFair(
                        title=title,
                        event_type=classify_event_type(title),
                        public="students",
                        sector=classify_sector(title),
                        level="all",
                        date_start=date_start,
                        date_end=date_end,
                        time_start=None,
                        time_end=None,
                        city=city,
                        region=detect_region(city),
                        address=None,
                        format="physical",
                        organizer="CIDJ",
                        description=None,
                        url=href,
                        source="cidj",
                        is_free=True
                    )
                    events.append(event)
                except Exception:
                    continue

        # Deduplicate CIDJ results (cards can have nested duplicates)
        seen = set()
        unique = []
        for e in events:
            key = (e.title, e.city)
            if key not in seen:
                seen.add(key)
                unique.append(e)
        events = unique

        logger.info(f"[Events] CIDJ: found {len(events)} events")
    except Exception as e:
        logger.error(f"[Events] CIDJ scraping error: {e}")
    return events


async def scrape_apec_events() -> list[JobFair]:
    """
    Fetch events from APEC internal JSON API.

    Endpoint: POST /cms/webservices/rechercheEvenement
    Returns structured JSON with title, date, city, type, public, etc.
    Typically 500+ professional events (ateliers, webconférences, forums).
    """
    events = []

    # APEC internal codes → our model
    PUBLIC_MAP = {
        101961: "pros",      # Candidat
        101962: "pros",      # Recruteur / Partenaire
    }
    _MODALITE_MAP = {
        102070: "virtual",   # À distance
        102072: "physical",  # Présentiel
        102071: "hybrid",    # Hybride
    }
    TYPE_MAP = {
        20474: "webinar",    # Webconférence
        101936: "webinar",   # Web Atelier
        20475: "salon",      # Atelier présentiel
        20473: "forum",      # Forum
        20467: "job_dating", # Job Dating
        20468: "salon",      # Parcours
    }

    try:
        api_url = "https://www.apec.fr/cms/webservices/rechercheEvenement"
        api_headers = {
            **HEADERS,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Referer": "https://www.apec.fr/nos-evenements.html/liste",
        }

        async with httpx.AsyncClient(timeout=20, headers=api_headers, follow_redirects=True) as client:
            # POST with empty body returns all events
            response = await client.post(api_url, json={})
            if response.status_code != 200:
                logger.warning(f"[Events] APEC API returned {response.status_code}")
                return events

            data = response.json()
            resultats = data.get("resultats", [])

            for item in resultats:
                try:
                    title = item.get("titre_evenement", "").strip()
                    if not title or len(title) < 5:
                        continue

                    # Date: "2026-02-20T13:00:00.000+0000" → "2026-02-20"
                    date_raw = item.get("date_debut", "")
                    date_start = date_raw[:10] if date_raw else datetime.now().strftime("%Y-%m-%d")

                    # City from libelle_ville: "Paris 12 - 75" → "Paris"
                    libelle_ville = item.get("libelle_ville", "")
                    if libelle_ville == "A distance" or not libelle_ville:
                        city = "En ligne"
                        event_format = "virtual"
                    else:
                        # "Paris 12 - 75" → "Paris", "Puteaux - 92" → "Puteaux"
                        city = re.sub(r'\s*\d*\s*-\s*\d+$', '', libelle_ville).strip()
                        city = re.sub(r'\s+\d+$', '', city).strip()
                        city = city.rstrip(' -')  # clean trailing separator
                        event_format = "physical"

                    # Map codes
                    id_public = item.get("id_nom_public", 0)
                    id_type = item.get("id_nom_type", 0)

                    event_public = PUBLIC_MAP.get(id_public, "pros")
                    event_type = TYPE_MAP.get(id_type, classify_event_type(title))

                    # Build detail URL
                    id_doc = item.get("id_document", "")
                    detail_url = f"https://www.apec.fr/nos-evenements.html/detail?idDocument={id_doc}" if id_doc else "https://www.apec.fr/nos-evenements.html"

                    event = JobFair(
                        title=title,
                        event_type=event_type,
                        public=event_public,
                        sector=classify_sector(title),
                        level="bac+5",
                        date_start=date_start,
                        date_end=None,
                        time_start=None,
                        time_end=None,
                        city=city,
                        region=detect_region(city),
                        address=None,
                        format=event_format,
                        organizer="APEC",
                        description=item.get("titre_accroche", None),
                        url=detail_url,
                        source="apec"
                    )
                    events.append(event)
                except Exception:
                    continue

        logger.info(f"[Events] APEC API: found {len(events)} events")
    except Exception as e:
        logger.error(f"[Events] APEC API error: {e}")
    return events


async def scrape_cci_events(region: str = "") -> list[JobFair]:
    """Scrape events from CCI France regional sites."""
    events = []
    cci_urls = [
        ("https://www.cci-paris-idf.fr/evenements", "Île-de-France"),
        ("https://www.lyon-metropole.cci.fr/evenements", "Auvergne-Rhône-Alpes"),
        ("https://www.ccimbo.fr/evenements", "Bretagne"),
        ("https://www.nouvelle-aquitaine.cci.fr/evenements", "Nouvelle-Aquitaine"),
        ("https://www.grandest.cci.fr/evenements", "Grand Est"),
    ]
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            for url, cci_region in cci_urls:
                if region and region.lower() not in cci_region.lower():
                    continue
                try:
                    response = await client.get(url)
                    if response.status_code != 200:
                        continue
                    soup = BeautifulSoup(response.text, 'html.parser')
                    event_cards = soup.select('.event, .evenement, article')
                    for card in event_cards:
                        title_el = card.select_one('h2, h3, .title')
                        if not title_el:
                            continue
                        title = title_el.get_text(strip=True)
                        # Keep only professional/career events
                        if not any(kw in title.lower() for kw in [
                            'emploi', 'recrutement', 'job', 'alternance', 'stage', 'carrière'
                        ]):
                            continue
                        event = JobFair(
                            title=title,
                            event_type=classify_event_type(title),
                            public="all",
                            sector=classify_sector(title),
                            level="all",
                            date_start=datetime.now().strftime("%Y-%m-%d"),
                            date_end=None,
                            time_start=None,
                            time_end=None,
                            city=cci_region.split('-')[0] if '-' in cci_region else cci_region,
                            region=cci_region,
                            address=None,
                            format="physical",
                            organizer=f"CCI {cci_region}",
                            description=None,
                            url=url,
                            source="cci"
                        )
                        events.append(event)
                except Exception:
                    continue
    except Exception as e:
        logger.error(f"[Events] CCI scraping error: {e}")
    return events


# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

def parse_french_date(text: str) -> str:
    """Parse French date strings into YYYY-MM-DD."""
    if not text:
        return datetime.now().strftime("%Y-%m-%d")

    text = text.lower().strip()
    months = {
        'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4,
        'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8,
        'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12,
        'janv': 1, 'févr': 2, 'avr': 4, 'juil': 7,
        'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12
    }

    for month_name, month_num in months.items():
        if month_name in text:
            match = re.search(r'(\d{1,2})\s*' + month_name + r'\s*(\d{4})?', text)
            if match:
                day = int(match.group(1))
                year = int(match.group(2)) if match.group(2) else datetime.now().year
                return f"{year}-{month_num:02d}-{day:02d}"

    match = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', text)
    if match:
        day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if year < 100:
            year += 2000
        return f"{year}-{month:02d}-{day:02d}"

    return datetime.now().strftime("%Y-%m-%d")


def classify_event_type(title: str) -> str:
    """Determine event type from title."""
    title_lower = title.lower()
    if 'job dating' in title_lower or 'jobdating' in title_lower:
        return 'job_dating'
    elif any(kw in title_lower for kw in ['webinar', 'visio', 'en ligne']):
        return 'webinar'
    elif 'forum' in title_lower:
        return 'forum'
    return 'salon'


def classify_public(title: str) -> str:
    """Classify target public from title."""
    title_lower = title.lower()
    if any(kw in title_lower for kw in ['étudiant', 'alternance', 'stage', 'apprentissage', 'jeune']):
        return 'students'
    elif any(kw in title_lower for kw in ['senior', '+45', '+50', 'reconversion', 'entreprendre']):
        return 'seniors'
    elif any(kw in title_lower for kw in [
        'cadre', 'manager', 'dirigeant', 'expert', 'professionnel', 'chef', 'responsable'
    ]):
        return 'pros'
    return 'all'


def classify_sector(title: str) -> str:
    """Detect industry sector from title."""
    title_lower = title.lower()
    sectors = {
        'tech': ['tech', 'it', 'développeur', 'data', 'cyber', 'numérique', 'digital'],
        'industry': ['industrie', 'btp', 'construction', 'aéronautique', 'automobile'],
        'health': ['santé', 'médical', 'hôpital', 'ehpad', 'paramédical'],
        'retail': ['commerce', 'vente', 'retail', 'distribution'],
        'finance': ['banque', 'finance', 'assurance', 'comptabilité'],
        'public': ['fonction publique', 'territorial', 'état', 'collectivité'],
    }
    for sector, keywords in sectors.items():
        if any(kw in title_lower for kw in keywords):
            return sector
    return 'all'


def detect_level(title: str) -> str:
    """Detect study levels mentioned in title."""
    title_lower = title.lower()
    if any(kw in title_lower for kw in ['bac+5', 'master', 'ingénieur']):
        return 'bac+5'
    elif any(kw in title_lower for kw in ['bac+3', 'licence']):
        return 'bac+3'
    elif any(kw in title_lower for kw in ['bac+2', 'bts', 'dut']):
        return 'bac+2'
    return 'all'


def detect_region(city: str) -> str:
    """Detect French region from city name."""
    city_lower = city.lower()
    regions = {
        'Île-de-France': ['paris', 'boulogne', 'nanterre', 'versailles', 'créteil'],
        'Auvergne-Rhône-Alpes': ['lyon', 'grenoble', 'saint-étienne', 'clermont'],
        'Provence-Alpes-Côte d\'Azur': ['marseille', 'nice', 'toulon', 'aix'],
        'Occitanie': ['toulouse', 'montpellier', 'nîmes', 'perpignan'],
        'Nouvelle-Aquitaine': ['bordeaux', 'limoges', 'poitiers', 'pau'],
        'Pays de la Loire': ['nantes', 'angers', 'le mans', 'saint-nazaire'],
        'Bretagne': ['rennes', 'brest', 'lorient', 'quimper'],
        'Hauts-de-France': ['lille', 'amiens', 'dunkerque', 'calais'],
        'Grand Est': ['strasbourg', 'metz', 'nancy', 'reims'],
        'Normandie': ['rouen', 'le havre', 'caen', 'cherbourg'],
    }
    for region, cities in regions.items():
        if any(c in city_lower for c in cities):
            return region
    return 'France'


# ------------------------------------------------------------------------------
# Main Aggregator
# ------------------------------------------------------------------------------

async def search_job_fairs(
    region: str = "",
    sector: str = "",
    public: str = "",
    event_type: str = "",
    format_type: str = "",
    country: str = "",
    include_mock: bool = False
) -> dict[str, Any]:
    """Aggregate professional events from multiple sources."""

    # ── FR→EN mapping: translate frontend French values to backend English ──
    PUBLIC_MAP = {
        "etudiants": "students", "étudiants": "students",
        "pros": "pros", "professionnels": "pros",
        "seniors": "seniors",
        "reconversion": "seniors",   # reconversion maps to seniors target
        "tous": "all", "all": "all",
    }
    FORMAT_MAP = {
        "physique": "physical", "physical": "physical",
        "virtuel": "virtual", "virtual": "virtual",
        "hybride": "hybrid", "hybrid": "hybrid",
    }
    SECTOR_MAP = {
        "tous": "all", "all": "all",
        "sante": "health", "santé": "health", "health": "health",
        "commerce": "retail", "retail": "retail",
        "industrie": "industry", "industry": "industry",
        "education": "all", "hotellerie": "all",
        "construction": "industry", "transport": "all",
        "communication": "all",
        "tech": "tech", "finance": "finance", "public": "public",
    }

    # Normalize filter values
    public = PUBLIC_MAP.get(public.lower().strip(), public) if public else ""
    format_type = FORMAT_MAP.get(format_type.lower().strip(), format_type) if format_type else ""
    sector = SECTOR_MAP.get(sector.lower().strip(), sector) if sector else ""

    # International mode: use SerpAPI for the requested country
    if country and country.lower() != "france":
        from src.services.events.serpapi import fetch_events_for_country
        international = await fetch_events_for_country(country)
        filtered_intl = international

        today = datetime.now().strftime("%Y-%m-%d")
        filtered_intl = [e for e in filtered_intl if (e.get("date_start") or "") >= today]

        if sector and sector != "all":
            filtered_intl = [e for e in filtered_intl if e.get("sector") in (sector, "all")]
        if public and public != "all":
            filtered_intl = [e for e in filtered_intl if e.get("public") in (public, "all")]
        if event_type:
            filtered_intl = [e for e in filtered_intl if e.get("event_type") == event_type]
        if format_type:
            filtered_intl = [e for e in filtered_intl if e.get("format") == format_type]

        filtered_intl.sort(key=lambda e: e.get("date_start", ""))
        return {
            "success": True,
            "events": filtered_intl,
            "count": len(filtered_intl),
            "sources": ["serpapi"],
        }

    tasks = [
        ("france_travail", scrape_france_travail_events(region, sector)),
        ("letudiant", scrape_letudiant_salons()),
        ("studyrama", scrape_studyrama_salons()),
        ("cidj", scrape_cidj_events()),
        ("apec", scrape_apec_events()),
        ("cci", scrape_cci_events(region)),
    ]
    results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)

    all_events: list[JobFair] = []
    sources = []
    for (source_name, _), res in zip(tasks, results, strict=False):
        if not isinstance(res, Exception) and res:
            all_events.extend(res)
            sources.append(source_name)

    # Filtering
    filtered = all_events
    if region:
        filtered = [
            e for e in filtered
            if region.lower() in e.region.lower() or region.lower() in e.city.lower()
        ]
    if sector and sector != "all":
        filtered = [e for e in filtered if e.sector == sector or e.sector == "all"]
    if public and public != "all":
        filtered = [e for e in filtered if e.public == public or e.public == "all"]
    if event_type:
        filtered = [e for e in filtered if e.event_type == event_type]
    if format_type:
        filtered = [e for e in filtered if e.format == format_type]

    # Filter by date (only upcoming)
    today = datetime.now().strftime("%Y-%m-%d")
    filtered = [e for e in filtered if e.date_start >= today]

    # Deduplicate across sources (same title + same city = same event)
    seen_keys: set = set()
    deduped: list[JobFair] = []
    for event in filtered:
        key = (event.title.lower().strip(), event.city.lower().strip())
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(event)
    filtered = deduped

    # Sort chronological
    filtered.sort(key=lambda e: e.date_start)

    return {
        "success": True,
        "events": [e.to_dict() for e in filtered],
        "count": len(filtered),
        "sources": sources
    }
