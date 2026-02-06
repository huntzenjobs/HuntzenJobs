"""JSearch API via RapidAPI - Google Jobs aggregator."""
import requests
import logging
from typing import List, Dict
from job_finder.config import get_settings
from job_finder.utils.constants import ISO_COUNTRY_NAMES

logger = logging.getLogger(__name__)
settings = get_settings()

RAPIDAPI_HOST = "jsearch.p.rapidapi.com"

def call_jobsearch_api(query: str, location: str, country_code: str = "fr") -> List[Dict]:
    """
    JSearch API via RapidAPI.
    Aggregates from Google Jobs, LinkedIn, Indeed, Glassdoor, ZipRecruiter.
    Host: jsearch.p.rapidapi.com
    Note: Works best for US/UK/Canada jobs.
    """
    if not settings.rapidapi_key:
        logger.debug("[JSEARCH] Missing RapidAPI key")
        return []
    
    cc = country_code.lower()
    country_name = ISO_COUNTRY_NAMES.get(cc, country_code.upper())
    
    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": RAPIDAPI_HOST
    }
    
    # Build query string (JSearch uses natural language queries)
    search_query = f"{query} in {location}, {country_name}" if location else f"{query} in {country_name}"
    
    url = f"https://{RAPIDAPI_HOST}/search"
    params = {
        "query": search_query,
        "page": "1",
        "num_pages": "2"  # Get 2 pages (~20 jobs)
    }
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
        
        jobs = []
        results = data.get("data", [])
        
        if not isinstance(results, list):
            results = []
        
        for item in results[:50]:
            job_url = item.get("job_apply_link") or item.get("job_google_link")

            # Determine source from publisher
            publisher = (item.get("job_publisher") or "").lower()
            source = "jsearch"
            if "linkedin" in publisher:
                source = "linkedin"
            elif "indeed" in publisher:
                source = "indeed"
            elif "glassdoor" in publisher:
                source = "glassdoor"
            elif "ziprecruiter" in publisher:
                source = "ziprecruiter"

            # Location
            job_location = item.get("job_city") or ""
            if item.get("job_state"):
                job_location += f", {item.get('job_state')}"
            if item.get("job_country"):
                job_location += f", {item.get('job_country')}"
            if not job_location:
                job_location = location or country_name

            # Extract and format salary
            salary_min = item.get("job_min_salary")
            salary_max = item.get("job_max_salary")
            salary_period = item.get("job_salary_period", "YEAR")  # YEAR, MONTH, HOUR
            salary_currency = item.get("job_salary_currency", "USD")
            salary_formatted = None

            if salary_min or salary_max:
                # Determine period text
                if salary_period == "YEAR":
                    period_text = "/an"
                elif salary_period == "MONTH":
                    period_text = "/mois"
                elif salary_period == "HOUR":
                    period_text = "/h"
                else:
                    period_text = "/an"  # Default

                # Format salary with range
                if salary_min and salary_max:
                    # Convert to K if >= 1000
                    if salary_min >= 1000:
                        min_k = int(salary_min / 1000)
                        max_k = int(salary_max / 1000)
                        salary_formatted = f"{min_k}K - {max_k}K {salary_currency}{period_text}"
                    else:
                        salary_formatted = f"{int(salary_min)} - {int(salary_max)} {salary_currency}{period_text}"
                elif salary_min:
                    if salary_min >= 1000:
                        min_k = int(salary_min / 1000)
                        salary_formatted = f"{min_k}K+ {salary_currency}{period_text}"
                    else:
                        salary_formatted = f"{int(salary_min)}+ {salary_currency}{period_text}"
                elif salary_max:
                    if salary_max >= 1000:
                        max_k = int(salary_max / 1000)
                        salary_formatted = f"Jusqu'à {max_k}K {salary_currency}{period_text}"
                    else:
                        salary_formatted = f"Jusqu'à {int(salary_max)} {salary_currency}{period_text}"

            jobs.append({
                "id": f"jsearch_{item.get('job_id', hash(str(item)))}",
                "title": item.get("job_title"),
                "company": item.get("employer_name"),
                "location": job_location.strip(", "),
                "description": (item.get("job_description") or "")[:500],
                "url": job_url,
                "source": source,
                "salary": salary_formatted,
                "contract_type": item.get("job_employment_type"),
                "posted_date": item.get("job_posted_at_datetime_utc"),
                "company_logo": item.get("employer_logo"),
                "is_remote": item.get("job_is_remote")
            })
        
        logger.info(f"[JSEARCH] Found {len(jobs)} jobs for '{query}' in {country_name}")
        return jobs
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            logger.warning("[JOBSEARCH] Rate limit exceeded")
        else:
            logger.error(f"[JOBSEARCH] HTTP error: {e}")
        return []
    except Exception as e:
        logger.error(f"[JOBSEARCH] Error: {e}")
        return []
