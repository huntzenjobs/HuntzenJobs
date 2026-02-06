"""Indeed Scraper via RapidAPI - Multi-country Indeed jobs."""
import requests
import logging
import re
from typing import List, Dict
from job_finder.config import get_settings
from job_finder.utils.constants import ISO_COUNTRY_NAMES

logger = logging.getLogger(__name__)
settings = get_settings()

# Indeed country domains
INDEED_DOMAINS = {
    "us": "www.indeed.com",
    "gb": "uk.indeed.com",
    "uk": "uk.indeed.com",
    "fr": "fr.indeed.com",
    "de": "de.indeed.com",
    "ca": "ca.indeed.com",
    "au": "au.indeed.com",
    "in": "in.indeed.com",
    "es": "es.indeed.com",
    "it": "it.indeed.com",
    "br": "br.indeed.com",
    "mx": "mx.indeed.com",
    "nl": "nl.indeed.com",
    "be": "be.indeed.com",
    "ch": "ch.indeed.com",
    "at": "at.indeed.com",
    "pl": "pl.indeed.com",
    "pt": "pt.indeed.com",
    "ae": "ae.indeed.com",
    "sg": "sg.indeed.com",
    "jp": "jp.indeed.com",
    "za": "za.indeed.com",
    "ng": "ng.indeed.com",
    "ke": "ke.indeed.com",
    "ma": "ma.indeed.com",
    "eg": "eg.indeed.com",
}

def call_indeed_scraper(query: str, location: str, country_code: str = "fr") -> List[Dict]:
    """
    Indeed Scraper API via RapidAPI (OpenWeb Ninja).
    Host: indeed-scraper-api.p.rapidapi.com
    """
    if not settings.rapidapi_key:
        logger.debug("[INDEED] Missing RapidAPI key")
        return []
    
    cc = country_code.lower()
    domain = INDEED_DOMAINS.get(cc, "www.indeed.com")
    country_name = ISO_COUNTRY_NAMES.get(cc, country_code.upper())
    
    # Build location string
    search_location = location if location else country_name
    
    # API: indeed12 on RapidAPI - Jobs Search endpoint
    url = "https://indeed12.p.rapidapi.com/jobs/search"
    
    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": "indeed12.p.rapidapi.com"
    }
    
    params = {
        "query": query,
        "location": search_location,
        "page_id": "1",
        "locality": cc.lower(),
        "fromage": "14",  # Last 14 days
        "radius": "50"
    }
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        jobs = []
        # indeed12 returns "hits" array
        results = data.get("hits", data.get("jobs", data.get("results", [])))
        
        if not isinstance(results, list):
            results = []
        
        for item in results[:50]:
            # indeed12 format: link, title, company_name, location, salary
            job_url = item.get("link") or item.get("url") or item.get("job_url")

            # Extract and normalize salary
            salary_raw = item.get("salary", {}).get("text") if isinstance(item.get("salary"), dict) else item.get("salary")
            salary_formatted = None

            if salary_raw and isinstance(salary_raw, str):
                salary_formatted = salary_raw.strip()
                # Add period indicator if missing
                if salary_formatted and not any(x in salary_formatted.lower() for x in ['/an', '/mois', 'year', 'month', 'annual', 'monthly', 'per year', 'per month', 'par an', 'par mois']):
                    # Heuristic: extract first number to determine if annual or monthly
                    numbers = re.findall(r'[\d,\.]+', salary_formatted.replace(' ', ''))
                    if numbers:
                        # Remove commas and dots to get pure number
                        first_num_str = numbers[0].replace(',', '').replace('.', '')
                        if first_num_str.isdigit():
                            amount = int(first_num_str)
                            # If amount > 5000, likely annual; otherwise monthly
                            if amount > 5000:
                                salary_formatted += "/an"
                            else:
                                salary_formatted += "/mois"

            jobs.append({
                "id": f"indeed_{item.get('id', hash(str(item)))}",
                "title": item.get("title") or item.get("job_title"),
                "company": item.get("company_name") or item.get("company"),
                "location": item.get("location") or search_location,
                "description": item.get("snippet") or item.get("description", ""),
                "url": job_url,
                "source": "indeed",
                "salary": salary_formatted,
                "contract_type": item.get("job_type") or "N/A",
                "posted_date": item.get("formatted_relative_time")
            })
        
        logger.info(f"[INDEED] Found {len(jobs)} jobs for '{query}' in {cc}")
        return jobs
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            logger.warning("[INDEED] Rate limit exceeded")
        else:
            logger.error(f"[INDEED] HTTP error: {e}")
        return []
    except requests.exceptions.Timeout:
        logger.warning(f"[INDEED] Timeout for '{query}'")
        return []
    except Exception as e:
        logger.error(f"[INDEED] Error: {e}")
        return []
