"""LinkedIn Jobs via RapidAPI - linkedin-jobs.p.rapidapi.com."""
import requests
import logging
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed
from job_finder.config import get_settings
from job_finder.utils.constants import ISO_COUNTRY_NAMES

logger = logging.getLogger(__name__)
settings = get_settings()

RAPIDAPI_HOST = "linkedin-jobs.p.rapidapi.com"

def call_linkedin_jobs(query: str, location: str, country_code: str = "fr") -> List[Dict]:
    """
    LinkedIn Jobs via RapidAPI.
    Host: linkedin-jobs.p.rapidapi.com
    1. Search jobs -> get list of job IDs
    2. Fetch details for each job (parallel)
    """
    if not settings.rapidapi_key:
        logger.debug("[LINKEDIN] Missing RapidAPI key")
        return []
    
    cc = country_code.lower()
    country_name = ISO_COUNTRY_NAMES.get(cc, country_code.upper())
    
    headers = {
        "X-RapidAPI-Key": settings.rapidapi_key,
        "X-RapidAPI-Host": RAPIDAPI_HOST
    }
    
    # Step 1: Search for jobs
    search_url = f"https://{RAPIDAPI_HOST}/jobs/search"
    search_location = f"{location}, {country_name}" if location else country_name
    
    params = {
        "keywords": query,
        "location": search_location,
        "count": 25  # API limit
    }
    
    try:
        response = requests.get(search_url, headers=headers, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
        
        hits = data.get("hits", [])
        if not hits:
            logger.info(f"[LINKEDIN] No jobs found for '{query}' in {search_location}")
            return []
        
        logger.info(f"[LINKEDIN] Found {len(hits)} job IDs, fetching details...")
        
        # Step 2: Fetch job details in parallel
        jobs = []
        
        def fetch_job_details(job_id: str) -> Dict:
            """Fetch details for a single job."""
            try:
                detail_url = f"https://{RAPIDAPI_HOST}/job/{job_id}"
                r = requests.get(detail_url, headers=headers, timeout=10)
                if r.status_code == 200:
                    return r.json()
            except:
                pass
            return None
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(fetch_job_details, str(hit["id"])): hit for hit in hits}
            
            for future in as_completed(futures, timeout=30):
                try:
                    detail = future.result()
                    if detail:
                        company_info = detail.get("company", {})
                        company_name = company_info.get("name") if isinstance(company_info, dict) else str(company_info)
                        
                        job_url = detail.get("apply_url") or f"https://linkedin.com/jobs/view/{detail.get('id', '')}"
                        
                        jobs.append({
                            "id": f"linkedin_{detail.get('id', hash(str(detail)))}",
                            "title": detail.get("job_title"),
                            "company": company_name,
                            "location": detail.get("location") or search_location,
                            "description": detail.get("description", "")[:500],
                            "url": job_url,
                            "source": "linkedin",
                            "salary": None,  # ⚠️ LinkedIn RapidAPI ne fournit pas de données salariales
                            "contract_type": detail.get("job_type"),
                            "posted_date": detail.get("posted_time_ago"),
                            "seniority": detail.get("job_seniority"),
                            "recruiter_name": detail.get("recruiter_name"),
                        })
                except Exception as e:
                    continue
        
        logger.info(f"[LINKEDIN] Got details for {len(jobs)} jobs")
        return jobs
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            logger.warning("[LINKEDIN] Rate limit exceeded")
        elif e.response.status_code == 403:
            logger.warning("[LINKEDIN] API access forbidden - check subscription")
        else:
            logger.error(f"[LINKEDIN] HTTP error: {e}")
        return []
    except Exception as e:
        logger.error(f"[LINKEDIN] Error: {e}")
        return []
