"""
Job Fairs / Salons Emploi Scraper
Scrape les salons d'emploi depuis des sources publiques françaises.

Sources supportées:
- Pôle Emploi / France Travail
- CCI France
- APEC
- Salons étudiants (L'Etudiant)
- Régions / Métropoles
- Calendriers événementiels
"""
import asyncio
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import httpx
from bs4 import BeautifulSoup
import logging

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
# SCRAPERS PAR SOURCE
# ==========================================

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}


async def scrape_pole_emploi_events(region: str = "", sector: str = "") -> List[JobFair]:
    """
    Scrape les événements France Travail (ex Pôle Emploi).
    Source très fiable et légale (données publiques).
    """
    events = []
    
    try:
        # API événements France Travail
        url = "https://candidat.francetravail.fr/evenements/evenements"
        
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                logger.warning(f"[JOB_FAIRS] France Travail returned {response.status_code}")
                return events
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Chercher les cartes d'événements
            event_cards = soup.select('.event-card, .evenement-item, article.event')
            
            for card in event_cards[:20]:  # Limiter à 20
                try:
                    title_el = card.select_one('h2, h3, .event-title, .titre')
                    date_el = card.select_one('.date, .event-date, time')
                    location_el = card.select_one('.location, .lieu, .ville')
                    link_el = card.select_one('a[href]')
                    
                    if not title_el:
                        continue
                    
                    title = title_el.get_text(strip=True)
                    
                    # Parser la date
                    date_text = date_el.get_text(strip=True) if date_el else ""
                    date_start = parse_french_date(date_text)
                    
                    # Ville
                    city = location_el.get_text(strip=True) if location_el else "France"
                    
                    # Déterminer le type
                    event_type = classify_event_type(title)
                    public = classify_public(title)
                    detected_sector = classify_sector(title)
                    
                    event = JobFair(
                        title=title,
                        event_type=event_type,
                        public=public,
                        sector=detected_sector if not sector else sector,
                        level="tous",
                        date_start=date_start,
                        date_end=None,
                        time_start=None,
                        time_end=None,
                        city=city,
                        region=region or detect_region(city),
                        address=None,
                        format="physique",
                        organizer="France Travail",
                        description=None,
                        url=link_el.get('href', url) if link_el else url,
                        source="france_travail",
                        is_free=True
                    )
                    events.append(event)
                    
                except Exception as e:
                    logger.debug(f"[JOB_FAIRS] Error parsing event: {e}")
                    continue
                    
    except Exception as e:
        logger.error(f"[JOB_FAIRS] France Travail scraping error: {e}")
    
    return events


async def scrape_letudiant_salons(public: str = "etudiants") -> List[JobFair]:
    """
    Scrape les salons depuis L'Etudiant.
    Excellente source pour étudiants et jeunes diplômés.
    """
    events = []
    
    try:
        url = "https://www.letudiant.fr/etudes/salons.html"
        
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                return events
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Cartes de salons
            salon_cards = soup.select('.salon-card, .event-item, .salon-item')
            
            for card in salon_cards[:15]:
                try:
                    title_el = card.select_one('h2, h3, .salon-title')
                    date_el = card.select_one('.date, .salon-date')
                    location_el = card.select_one('.location, .salon-city')
                    link_el = card.select_one('a[href]')
                    
                    if not title_el:
                        continue
                    
                    title = title_el.get_text(strip=True)
                    date_text = date_el.get_text(strip=True) if date_el else ""
                    city = location_el.get_text(strip=True) if location_el else "Paris"
                    
                    event = JobFair(
                        title=title,
                        event_type=classify_event_type(title),
                        public="etudiants",
                        sector=classify_sector(title),
                        level=detect_level(title),
                        date_start=parse_french_date(date_text),
                        date_end=None,
                        time_start=None,
                        time_end=None,
                        city=city,
                        region=detect_region(city),
                        address=None,
                        format="physique",
                        organizer="L'Etudiant",
                        description=None,
                        url=link_el.get('href', url) if link_el else url,
                        source="letudiant"
                    )
                    events.append(event)
                    
                except Exception as e:
                    continue
                    
    except Exception as e:
        logger.error(f"[JOB_FAIRS] L'Etudiant scraping error: {e}")
    
    return events


async def scrape_apec_events() -> List[JobFair]:
    """
    Scrape les événements APEC.
    Excellent pour cadres et managers.
    """
    events = []
    
    try:
        url = "https://www.apec.fr/evenements.html"
        
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                return events
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            event_cards = soup.select('.event-card, .evenement, article')
            
            for card in event_cards[:15]:
                try:
                    title_el = card.select_one('h2, h3, .event-title')
                    date_el = card.select_one('.date, time')
                    location_el = card.select_one('.location, .ville')
                    link_el = card.select_one('a[href]')
                    format_el = card.select_one('.format, .type')
                    
                    if not title_el:
                        continue
                    
                    title = title_el.get_text(strip=True)
                    event_format = "virtuel" if format_el and "ligne" in format_el.get_text().lower() else "physique"
                    
                    event = JobFair(
                        title=title,
                        event_type=classify_event_type(title),
                        public="pros",
                        sector=classify_sector(title),
                        level="bac+5",
                        date_start=parse_french_date(date_el.get_text(strip=True) if date_el else ""),
                        date_end=None,
                        time_start=None,
                        time_end=None,
                        city=location_el.get_text(strip=True) if location_el else "En ligne",
                        region="France",
                        address=None,
                        format=event_format,
                        organizer="APEC",
                        description=None,
                        url=link_el.get('href', url) if link_el else url,
                        source="apec"
                    )
                    events.append(event)
                    
                except Exception as e:
                    continue
                    
    except Exception as e:
        logger.error(f"[JOB_FAIRS] APEC scraping error: {e}")
    
    return events


async def scrape_cci_events(region: str = "") -> List[JobFair]:
    """
    Scrape les événements CCI France.
    Source institutionnelle très fiable.
    """
    events = []
    
    # Liste des CCI régionales avec leurs URLs
    cci_urls = [
        ("https://www.cci-paris-idf.fr/evenements", "Île-de-France"),
        ("https://www.lyon-metropole.cci.fr/evenements", "Auvergne-Rhône-Alpes"),
        ("https://www.ccimbo.fr/evenements", "Bretagne"),
    ]
    
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            for url, cci_region in cci_urls:
                if region and region.lower() not in cci_region.lower():
                    continue
                    
                try:
                    response = await client.get(url)
                    if response.status_code != 200:
                        continue
                    
                    soup = BeautifulSoup(response.text, 'html.parser')
                    event_cards = soup.select('.event, .evenement, article')
                    
                    for card in event_cards[:10]:
                        try:
                            title_el = card.select_one('h2, h3, .title')
                            if not title_el:
                                continue
                            
                            title = title_el.get_text(strip=True)
                            
                            # Filtrer pour garder seulement les événements emploi
                            if not any(kw in title.lower() for kw in ['emploi', 'recrutement', 'job', 'alternance', 'stage', 'carrière']):
                                continue
                            
                            event = JobFair(
                                title=title,
                                event_type=classify_event_type(title),
                                public="tous",
                                sector=classify_sector(title),
                                level="tous",
                                date_start=datetime.now().strftime("%Y-%m-%d"),
                                date_end=None,
                                time_start=None,
                                time_end=None,
                                city=cci_region.split('-')[0] if '-' in cci_region else cci_region,
                                region=cci_region,
                                address=None,
                                format="physique",
                                organizer=f"CCI {cci_region}",
                                description=None,
                                url=url,
                                source="cci"
                            )
                            events.append(event)
                            
                        except Exception:
                            continue
                            
                except Exception:
                    continue
                    
    except Exception as e:
        logger.error(f"[JOB_FAIRS] CCI scraping error: {e}")
    
    return events


# ==========================================
# MOCK DATA (fallback si scraping échoue)
# ==========================================

def get_mock_job_fairs() -> List[JobFair]:
    """Données de test / fallback"""
    now = datetime.now()
    
    return [
        JobFair(
            title="Forum Emploi Paris 2026",
            event_type="forum",
            public="tous",
            sector="tous",
            level="tous",
            date_start=(now + timedelta(days=15)).strftime("%Y-%m-%d"),
            date_end=(now + timedelta(days=16)).strftime("%Y-%m-%d"),
            time_start="09:00",
            time_end="18:00",
            city="Paris",
            region="Île-de-France",
            address="Parc des Expositions, Porte de Versailles",
            format="physique",
            organizer="Paris pour l'Emploi",
            description="Plus de 200 entreprises qui recrutent",
            url="https://www.paris.fr/emploi",
            source="mock",
            companies_count=200,
            is_free=True
        ),
        JobFair(
            title="Salon de l'Alternance Lyon",
            event_type="salon",
            public="etudiants",
            sector="tous",
            level="bac+2",
            date_start=(now + timedelta(days=30)).strftime("%Y-%m-%d"),
            date_end=None,
            time_start="10:00",
            time_end="17:00",
            city="Lyon",
            region="Auvergne-Rhône-Alpes",
            address="Cité Internationale",
            format="physique",
            organizer="L'Etudiant",
            description="Trouvez votre alternance parmi 150 entreprises",
            url="https://www.letudiant.fr/salons/lyon",
            source="mock",
            companies_count=150,
            is_free=True
        ),
        JobFair(
            title="Job Dating Tech - 100% Remote",
            event_type="job_dating",
            public="pros",
            sector="tech",
            level="bac+5",
            date_start=(now + timedelta(days=7)).strftime("%Y-%m-%d"),
            date_end=None,
            time_start="14:00",
            time_end="18:00",
            city="En ligne",
            region="France",
            address=None,
            format="virtuel",
            organizer="Welcome to the Jungle",
            description="Rencontrez 30 startups tech en visio",
            url="https://www.welcometothejungle.com/events",
            source="mock",
            companies_count=30,
            is_free=True
        ),
        JobFair(
            title="Forum Emploi Seniors & Reconversion",
            event_type="forum",
            public="seniors",
            sector="tous",
            level="tous",
            date_start=(now + timedelta(days=45)).strftime("%Y-%m-%d"),
            date_end=None,
            time_start="09:00",
            time_end="17:00",
            city="Marseille",
            region="Provence-Alpes-Côte d'Azur",
            address="Palais du Pharo",
            format="physique",
            organizer="France Travail",
            description="Événement dédié aux +45 ans et reconversions",
            url="https://www.francetravail.fr/evenements",
            source="mock",
            companies_count=80,
            is_free=True
        ),
        JobFair(
            title="Salon Industrie & BTP Toulouse",
            event_type="salon",
            public="tous",
            sector="industrie",
            level="tous",
            date_start=(now + timedelta(days=60)).strftime("%Y-%m-%d"),
            date_end=(now + timedelta(days=61)).strftime("%Y-%m-%d"),
            time_start="08:30",
            time_end="18:00",
            city="Toulouse",
            region="Occitanie",
            address="MEETT - Parc des Expositions",
            format="physique",
            organizer="CCI Occitanie",
            description="Métiers de l'industrie, BTP et aéronautique",
            url="https://www.toulouse.cci.fr",
            source="mock",
            companies_count=120,
            is_free=True
        ),
        JobFair(
            title="Forum Santé & Médico-Social Nantes",
            event_type="forum",
            public="tous",
            sector="sante",
            level="tous",
            date_start=(now + timedelta(days=20)).strftime("%Y-%m-%d"),
            date_end=None,
            time_start="09:00",
            time_end="17:00",
            city="Nantes",
            region="Pays de la Loire",
            address="Cité des Congrès",
            format="physique",
            organizer="ARS Pays de la Loire",
            description="Hôpitaux, EHPAD, cliniques recrutent",
            url="https://www.ars.sante.fr/evenements",
            source="mock",
            companies_count=60,
            is_free=True
        ),
    ]


# ==========================================
# HELPERS
# ==========================================

def parse_french_date(text: str) -> str:
    """Parse une date française vers YYYY-MM-DD"""
    if not text:
        return datetime.now().strftime("%Y-%m-%d")
    
    text = text.lower().strip()
    
    # Mois français
    months = {
        'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4,
        'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8,
        'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12,
        'janv': 1, 'févr': 2, 'avr': 4, 'juil': 7,
        'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12
    }
    
    # Pattern: "15 janvier 2026" ou "15/01/2026"
    for month_name, month_num in months.items():
        if month_name in text:
            match = re.search(r'(\d{1,2})\s*' + month_name + r'\s*(\d{4})?', text)
            if match:
                day = int(match.group(1))
                year = int(match.group(2)) if match.group(2) else datetime.now().year
                return f"{year}-{month_num:02d}-{day:02d}"
    
    # Pattern numérique
    match = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', text)
    if match:
        day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if year < 100:
            year += 2000
        return f"{year}-{month:02d}-{day:02d}"
    
    return datetime.now().strftime("%Y-%m-%d")


def classify_event_type(title: str) -> str:
    """Détermine le type d'événement"""
    title_lower = title.lower()
    
    if 'job dating' in title_lower or 'jobdating' in title_lower:
        return 'job_dating'
    elif 'webinar' in title_lower or 'visio' in title_lower or 'en ligne' in title_lower:
        return 'webinar'
    elif 'forum' in title_lower:
        return 'forum'
    elif 'salon' in title_lower:
        return 'salon'
    else:
        return 'salon'


def classify_public(title: str) -> str:
    """Détermine le public cible"""
    title_lower = title.lower()
    
    if any(kw in title_lower for kw in ['étudiant', 'etudiant', 'jeune diplômé', 'alternance', 'stage']):
        return 'etudiants'
    elif any(kw in title_lower for kw in ['senior', '+45', '+50', 'reconversion']):
        return 'seniors'
    elif any(kw in title_lower for kw in ['cadre', 'manager', 'dirigeant']):
        return 'pros'
    else:
        return 'tous'


def classify_sector(title: str) -> str:
    """Détermine le secteur"""
    title_lower = title.lower()
    
    sectors = {
        'tech': ['tech', 'it', 'développeur', 'data', 'cyber', 'numérique', 'digital', 'startup'],
        'industrie': ['industrie', 'btp', 'construction', 'aéronautique', 'automobile', 'mécanique'],
        'sante': ['santé', 'médical', 'hôpital', 'ehpad', 'paramédical', 'infirmier'],
        'commerce': ['commerce', 'vente', 'retail', 'distribution'],
        'finance': ['banque', 'finance', 'assurance', 'comptabilité'],
        'public': ['fonction publique', 'territorial', 'état', 'collectivité'],
    }
    
    for sector, keywords in sectors.items():
        if any(kw in title_lower for kw in keywords):
            return sector
    
    return 'tous'


def detect_level(title: str) -> str:
    """Détecte le niveau d'études"""
    title_lower = title.lower()
    
    if 'bac+5' in title_lower or 'master' in title_lower or 'ingénieur' in title_lower:
        return 'bac+5'
    elif 'bac+3' in title_lower or 'licence' in title_lower:
        return 'bac+3'
    elif 'bac+2' in title_lower or 'bts' in title_lower or 'dut' in title_lower:
        return 'bac+2'
    elif 'bac' in title_lower:
        return 'bac'
    else:
        return 'tous'


def detect_region(city: str) -> str:
    """Détecte la région depuis la ville"""
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


# ==========================================
# MAIN AGGREGATOR
# ==========================================

async def search_job_fairs(
    region: str = "",
    sector: str = "",
    public: str = "",
    event_type: str = "",
    format_type: str = "",
    include_mock: bool = True
) -> Dict[str, Any]:
    """
    Recherche agrégée de salons d'emploi.
    
    Args:
        region: Filtrer par région (ex: "Île-de-France")
        sector: Filtrer par secteur (tech, industrie, sante, etc.)
        public: Filtrer par public (etudiants, pros, seniors, tous)
        event_type: Filtrer par type (salon, forum, job_dating, webinar)
        format_type: Filtrer par format (physique, virtuel, hybride)
        include_mock: Inclure les données mock si scraping échoue
    
    Returns:
        Dict avec events, count, sources, filters
    """
    all_events: List[JobFair] = []
    sources_used = []
    errors = []
    
    # Lancer les scrapers en parallèle
    tasks = [
        ("france_travail", scrape_pole_emploi_events(region, sector)),
        ("letudiant", scrape_letudiant_salons(public)),
        ("apec", scrape_apec_events()),
        ("cci", scrape_cci_events(region)),
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
    
    # Fallback sur mock si peu de résultats
    if len(all_events) < 3 and include_mock:
        mock_events = get_mock_job_fairs()
        all_events.extend(mock_events)
        sources_used.append("mock")
        logger.info(f"[JOB_FAIRS] Added {len(mock_events)} mock events")
    
    # Appliquer les filtres
    filtered_events = all_events
    
    if region:
        filtered_events = [e for e in filtered_events if region.lower() in e.region.lower() or region.lower() in e.city.lower()]
    
    if sector and sector != "tous":
        filtered_events = [e for e in filtered_events if e.sector == sector or e.sector == "tous"]
    
    if public and public != "tous":
        filtered_events = [e for e in filtered_events if e.public == public or e.public == "tous"]
    
    if event_type:
        filtered_events = [e for e in filtered_events if e.event_type == event_type]
    
    if format_type:
        filtered_events = [e for e in filtered_events if e.format == format_type]
    
    # Trier par date
    filtered_events.sort(key=lambda e: e.date_start)
    
    return {
        "success": True,
        "events": [e.to_dict() for e in filtered_events],
        "count": len(filtered_events),
        "total_scraped": len(all_events),
        "sources": sources_used,
        "errors": errors if errors else None,
        "filters_applied": {
            "region": region or None,
            "sector": sector or None,
            "public": public or None,
            "event_type": event_type or None,
            "format": format_type or None
        }
    }


# ==========================================
# CLI TEST
# ==========================================

if __name__ == "__main__":
    import json
    
    async def test():
        result = await search_job_fairs(region="", sector="", public="")
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    asyncio.run(test())
