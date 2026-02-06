"""SerpAPI Provider - Google Jobs + Google Search fallback."""
import requests
import logging
import hashlib
from typing import List, Dict
from job_finder.config import get_settings
from job_finder.utils.constants import ISO_COUNTRY_NAMES

logger = logging.getLogger(__name__)
settings = get_settings()

def call_serpapi_jobs(query: str, location: str, country_code: str = "fr") -> List[Dict]:
    """
    Google Jobs API via SerpAPI.
    Structured job listings with apply links.
    """
    if not settings.serpapi_key:
        return []
    
    country_name = ISO_COUNTRY_NAMES.get(country_code.lower(), country_code.upper())
    search_location = f"{location} {country_name}".strip() if location else country_name
        
    url = "https://serpapi.com/search"
    params = {
        "engine": "google_jobs",
        "q": f"{query} {search_location}",
        "api_key": settings.serpapi_key,
        "num": 50,
        "hl": "fr"
    }
    
    try:
        response = requests.get(url, params=params, timeout=12)
        data = response.json()
        
        if "error" in data:
            logger.warning(f"[SERPAPI] API error: {data.get('error')}")
            return []
        
        jobs = []
        for item in data.get("jobs_results", []):
            job_location = item.get("location", "")

            # Filter out US jobs for non-US searches
            if country_code.lower() not in ["us", "usa"]:
                us_indicators = ["United States", "USA", ", NY", ", CA", ", TX", ", FL", ", WA", ", IL"]
                if any(ind in job_location for ind in us_indicators):
                    continue

            apply_links = item.get("apply_options", [])
            job_url = apply_links[0].get("link") if apply_links else None

            # Generate unique ID: use job_id if available, otherwise hash of title+company+location
            job_id = item.get('job_id')
            if not job_id:
                # Create unique hash from job details
                unique_str = f"{item.get('title', '')}_{item.get('company_name', '')}_{job_location}"
                job_id = hashlib.md5(unique_str.encode()).hexdigest()[:12]

            jobs.append({
                "id": f"serpapi_{job_id}",
                "title": item.get("title"),
                "company": item.get("company_name"),
                "location": job_location,
                "description": item.get("description"),
                "url": job_url,
                "source": "google_jobs",
                "salary": None,  # ⚠️ Google Jobs API ne fournit plus de données salariales (confirmé 2025)
                "contract_type": item.get("detected_extensions", {}).get("schedule_type"),
                "posted_date": item.get("detected_extensions", {}).get("posted_at")
            })
        
        logger.info(f"[SERPAPI] Found {len(jobs)} jobs for '{query}'")
        return jobs
        
    except Exception as e:
        logger.error(f"[SERPAPI] Error: {e}")
        return []


def call_google_search_jobs(query: str, country: str) -> List[Dict]:
    """
    Google Search fallback - scrapes job board links.
    Used when Google Jobs API has no results for a country.
    """
    if not settings.serpapi_key:
        return []
    
    search_query = f"{query} jobs {country} site:linkedin.com/jobs OR site:glassdoor.com OR site:indeed.com OR site:jobgether.com"
    
    url = "https://serpapi.com/search"
    params = {
        "engine": "google",
        "q": search_query,
        "api_key": settings.serpapi_key,
        "num": 50
    }
    
    try:
        response = requests.get(url, params=params, timeout=12)
        data = response.json()
        
        jobs = []
        job_indicators = ["/jobs/view/", "/job-listing/", "/viewjob", "/rc/clk", "/job/", "jk="]
        job_sites = ["linkedin.com/jobs", "glassdoor.com", "indeed.com", "jobgether.com"]
        
        for item in data.get("organic_results", []):
            link = item.get("link", "")
            title = item.get("title", "")
            snippet = item.get("snippet", "")
            
            # Must be from a job site
            if not any(site in link for site in job_sites):
                continue
            
            # Must be a direct job link
            if not any(x in link for x in job_indicators):
                continue

            # Parse title
            job_title = title.split(" - ")[0].strip() if " - " in title else title.split("|")[0].strip()
            company = ""
            if " - " in title and len(title.split(" - ")) > 1:
                company = title.split(" - ")[1].split("|")[0].strip()

            # Determine source
            source = "web"
            if "linkedin" in link:
                source = "linkedin"
            elif "glassdoor" in link:
                source = "glassdoor"
            elif "indeed" in link:
                source = "indeed"

            jobs.append({
                "id": f"gsearch_{hash(link)}",
                "title": job_title,
                "company": company,
                "location": country,
                "description": snippet,
                "url": link,
                "source": source,
                "contract_type": None
            })
        
        logger.info(f"[GOOGLE_SEARCH] Found {len(jobs)} jobs for '{query}' in {country}")
        return jobs
        
    except Exception as e:
        logger.error(f"[GOOGLE_SEARCH] Error: {e}")
        return []
