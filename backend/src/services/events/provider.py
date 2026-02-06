"""
Job Fairs / Professional Events Provider
=========================================
Scrapes job fairs and professional events from various French public sources.
Sources supported: France Travail, CCI France, APEC, L'Etudiant.

Follows PEP 8 standards and uses English for code/comments.
"""

import asyncio
import logging
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

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
    date_end: Optional[str]
    time_start: Optional[str]
    time_end: Optional[str]
    city: str
    region: str
    address: Optional[str]
    format: str     # physical, virtual, hybrid
    organizer: str
    description: Optional[str]
    url: str
    source: str
    registration_url: Optional[str] = None
    is_free: bool = True
    companies_count: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
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


async def scrape_france_travail_events(region: str = "", sector: str = "") -> List[JobFair]:
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


async def scrape_letudiant_salons() -> List[JobFair]:
    """Scrape student fairs from L'Etudiant."""
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
                salon_cards = soup.select(
                    '.salon-card, .event-item, .salon-item, article, .item-salon'
                )

                for card in salon_cards:
                    try:
                        title_el = card.select_one('h2, h3, .salon-title, .title')
                        date_el = card.select_one('.date, .salon-date, time')
                        location_el = card.select_one('.location, .salon-city, .city')
                        link_el = card.select_one('a[href]')

                        if not title_el:
                            continue

                        title = title_el.get_text(strip=True)
                        city = location_el.get_text(strip=True) if location_el else "Paris"

                        event = JobFair(
                            title=title,
                            event_type=classify_event_type(title),
                            public="students",
                            sector=classify_sector(title),
                            level=detect_level(title),
                            date_start=parse_french_date(
                                date_el.get_text(strip=True) if date_el else ""
                            ),
                            date_end=None,
                            time_start=None,
                            time_end=None,
                            city=city,
                            region=detect_region(city),
                            address=None,
                            format="physical",
                            organizer="L'Etudiant",
                            description=None,
                            url=link_el.get('href', target_url) if link_el else target_url,
                            source="letudiant"
                        )
                        events.append(event)
                    except Exception:
                        continue
    except Exception as e:
        logger.error(f"[Events] L'Etudiant scraping error: {e}")
    return events


async def scrape_apec_events() -> List[JobFair]:
    """Scrape specialized events from APEC for professionals."""
    events = []
    try:
        url = "https://www.apec.fr/candidat/nos-evenements.html"
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning(f"[Events] APEC returned {response.status_code}")
                return events

            soup = BeautifulSoup(response.text, 'html.parser')
            event_cards = soup.select(
                '.event-card, .evenement, article, .card, .block-evenement'
            )

            for card in event_cards:
                try:
                    title_el = card.select_one('h2, h3, .event-title, .card-title, .title')
                    if not title_el:
                        continue

                    title = title_el.get_text(strip=True)
                    # Filter out non-event text
                    if len(title) < 5 or any(kw in title.lower() for kw in ['error', 'cookie', 'mention']):
                        continue

                    date_el = card.select_one('.date, time, .card-date')
                    location_el = card.select_one('.location, .ville, .card-location')
                    link_el = card.select_one('a[href]')

                    event = JobFair(
                        title=title,
                        event_type=classify_event_type(title),
                        public="pros",
                        sector=classify_sector(title),
                        level="bac+5",
                        date_start=parse_french_date(
                            date_el.get_text(strip=True) if date_el else ""
                        ),
                        date_end=None,
                        time_start=None,
                        time_end=None,
                        city=location_el.get_text(strip=True) if location_el else "France",
                        region="France",
                        address=None,
                        format="physical",
                        organizer="APEC",
                        description=None,
                        url=link_el.get('href', url) if link_el else url,
                        source="apec"
                    )
                    events.append(event)
                except Exception:
                    continue
    except Exception as e:
        logger.error(f"[Events] APEC scraping error: {e}")
    return events


async def scrape_cci_events(region: str = "") -> List[JobFair]:
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
    include_mock: bool = False
) -> Dict[str, Any]:
    """Aggregate professional events from multiple sources."""
    tasks = [
        ("france_travail", scrape_france_travail_events(region, sector)),
        ("letudiant", scrape_letudiant_salons()),
        ("apec", scrape_apec_events()),
        ("cci", scrape_cci_events(region)),
    ]
    results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)

    all_events: List[JobFair] = []
    sources = []
    for (source_name, _), res in zip(tasks, results):
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

    # Sort chronological
    filtered.sort(key=lambda e: e.date_start)

    return {
        "success": True,
        "events": [e.to_dict() for e in filtered],
        "count": len(filtered),
        "sources": sources
    }
