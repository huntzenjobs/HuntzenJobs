"""Adzuna Job Provider - Free tier, 15 countries supported."""
import requests
import logging
from typing import List, Dict
from job_finder.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Adzuna supported countries
ADZUNA_COUNTRIES = {
    "au", "at", "br", "ca", "de", "fr", "in", "it", "mx", 
    "nl", "nz", "pl", "ru", "sg", "za", "gb", "us"
}

def call_adzuna_api(query: str, location: str, country_code: str = "fr") -> List[Dict]:
    """
    Adzuna API - Free tier with 1000 requests/month.
    Best for: AU, AT, BR, CA, DE, FR, IN, IT, MX, NL, NZ, PL, RU, SG, ZA, GB, US
    """
    if not settings.adzuna_app_id or not settings.adzuna_api_key:
        logger.debug("[ADZUNA] Missing credentials")
        return []
    
    # Check if country is supported
    cc = country_code.lower()
    if cc not in ADZUNA_COUNTRIES:
        logger.debug(f"[ADZUNA] Country {cc} not supported")
        return []
        
    url = f"https://api.adzuna.com/v1/api/jobs/{cc}/search/1"
    params = {
        "app_id": settings.adzuna_app_id,
        "app_key": settings.adzuna_api_key,
        "what": query,
        "where": location,
        "results_per_page": 50,
        "content-type": "application/json"
    }
    
    try:
        response = requests.get(url, params=params, timeout=12)
        response.raise_for_status()
        data = response.json()

        # Currency map based on country code
        currency_map = {
            "fr": "EUR", "de": "EUR", "it": "EUR", "nl": "EUR", "at": "EUR",
            "us": "USD", "ca": "CAD", "au": "AUD", "gb": "GBP", "in": "INR",
            "br": "BRL", "mx": "MXN", "za": "ZAR", "sg": "SGD", "nz": "NZD",
            "pl": "PLN", "ru": "RUB"
        }
        currency = currency_map.get(cc, "EUR")

        jobs = []
        for item in data.get("results", []):
            # Extract and format salary
            salary_min = item.get("salary_min")
            salary_max = item.get("salary_max")
            salary_formatted = None

            if salary_min or salary_max:
                # Format salary with range and currency
                if salary_min and salary_max:
                    min_k = int(salary_min / 1000)
                    max_k = int(salary_max / 1000)
                    salary_formatted = f"{min_k}K - {max_k}K {currency}/an"
                elif salary_min:
                    min_k = int(salary_min / 1000)
                    salary_formatted = f"{min_k}K+ {currency}/an"
                elif salary_max:
                    max_k = int(salary_max / 1000)
                    salary_formatted = f"Jusqu'à {max_k}K {currency}/an"

            jobs.append({
                "id": f"adzuna_{item.get('id')}",
                "title": item.get("title"),
                "company": item.get("company", {}).get("display_name"),
                "location": item.get("location", {}).get("display_name"),
                "description": item.get("description"),
                "url": item.get("redirect_url"),
                "source": "adzuna",
                "salary": salary_formatted,
                "contract_type": item.get("contract_type"),
                "posted_date": item.get("created")
            })
        
        logger.info(f"[ADZUNA] Found {len(jobs)} jobs for '{query}' in {cc}")
        return jobs
        
    except requests.exceptions.Timeout:
        logger.warning("[ADZUNA] Request timeout")
        return []
    except Exception as e:
        logger.error(f"[ADZUNA] Error: {e}")
        return []
