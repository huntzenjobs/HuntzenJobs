"""RemoteOK Provider - Free API for remote jobs."""
import requests
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

def call_remoteok_api(query: str, expanded_query: str = "") -> List[Dict]:
    """
    RemoteOK API - Free, no auth required.
    Only returns remote/worldwide jobs.
    """
    try:
        url = "https://remoteok.com/api"
        headers = {"User-Agent": "HuntZen JobSearch/1.0"}
        
        response = requests.get(url, headers=headers, timeout=12)
        data = response.json()
        
        # Skip first item (metadata)
        if data and isinstance(data, list):
            data = data[1:] if len(data) > 1 else []
        
        jobs = []
        
        # Build search terms
        search_terms = set()
        if expanded_query:
            # Parse expanded query like "(python OR data OR engineer)"
            terms = expanded_query.lower().replace("(", "").replace(")", "").split(" or ")
            search_terms.update(t.strip() for t in terms if t.strip())
        else:
            search_terms.add(query.lower())
        
        for item in data[:500]:  # Check first 500 listings
            position = item.get("position", "")
            company = item.get("company", "")
            tags = item.get("tags", [])
            
            # Build searchable text
            full_text = f"{position} {company} {' '.join(tags)}".lower()
            
            # Check if any search term matches
            if any(term in full_text for term in search_terms):
                # Extract and normalize salary
                salary_raw = item.get("salary")
                salary_formatted = None

                if salary_raw:
                    if isinstance(salary_raw, str):
                        salary_formatted = salary_raw.strip()
                        # Add period if missing (RemoteOK salaries are typically annual)
                        if salary_formatted and not any(x in salary_formatted.lower() for x in ['/an', '/year', 'annual', '/mois', '/month']):
                            salary_formatted += "/an"
                    elif isinstance(salary_raw, (int, float)):
                        # Convert numeric salary to formatted string
                        if salary_raw >= 1000:
                            salary_k = int(salary_raw / 1000)
                            salary_formatted = f"{salary_k}K USD/an"
                        else:
                            salary_formatted = f"{int(salary_raw)} USD/an"

                jobs.append({
                    "id": f"remoteok_{item.get('id')}",
                    "title": position,
                    "company": company,
                    "location": "Remote / Worldwide",
                    "description": item.get("description", "")[:500],
                    "url": item.get("url"),
                    "source": "remoteok",
                    "salary": salary_formatted,
                    "contract_type": "Remote",
                    "tags": tags,
                    "posted_date": item.get("date")
                })
        
        logger.info(f"[REMOTEOK] Found {len(jobs)} remote jobs for '{query}'")
        return jobs
        
    except Exception as e:
        logger.error(f"[REMOTEOK] Error: {e}")
        return []
