"""
Salary Insight Service
=======================
Fetches real-time salary data using Adzuna API.
Supports salary histograms and average salary data for various countries.
"""

import logging
from typing import Any, Dict, Optional

import httpx
from src.config.settings import settings

logger = logging.getLogger(__name__)

class SalaryService:
    """Service to fetch real-time salary statistics."""
    
    BASE_URL = "https://api.adzuna.com/v1/api/jobs"
    
    @classmethod
    async def get_salary_stats(
        cls, 
        job_title: str, 
        country_code: str = "fr", 
        location: str = ""
    ) -> Dict[str, Any]:
        """
        Fetch salary statistics from Adzuna.
        
        Args:
            job_title: Job title (e.g., 'Data Engineer')
            country_code: ISO country code (fr, us, gb, etc.)
            location: Optional city or region
            
        Returns:
            Dictionary with average salary, max, and histogram data.
        """
        app_id = settings.adzuna_app_id
        app_key = settings.get_adzuna_key()
        
        if not app_id or not app_key:
            logger.warning("[SalaryService] Missing Adzuna credentials")
            return {"error": "Missing credentials"}
            
        cc = country_code.lower()
        url = f"{cls.BASE_URL}/{cc}/history"
        
        params = {
            "app_id": app_id,
            "app_key": app_key,
            "what": job_title,
            "where": location,
            "content-type": "application/json"
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    # Adzuna history returns a dictionary with months as keys
                    # We can calculate average from the most recent months
                    history = data.get("month", {})
                    if not history:
                        return {"message": f"No specific salary history found for {job_title} in {location or cc}"}
                        
                    # Get most recent month value
                    sorted_months = sorted(history.keys(), reverse=True)
                    latest_avg = history[sorted_months[0]] if sorted_months else 0
                    
                    return {
                        "job_title": job_title,
                        "country": cc,
                        "location": location,
                        "average_salary": latest_avg,
                        "currency": "EUR" if cc in ["fr", "de", "at", "it", "nl", "pl"] else "USD",
                        "trend": "up" if len(sorted_months) > 1 and history[sorted_months[0]] > history[sorted_months[1]] else "stable"
                    }
                else:
                    return {"error": f"Adzuna API error: {response.status_code}"}
                    
        except Exception as e:
            logger.error(f"[SalaryService] Error: {e}")
            return {"error": str(e)}

async def get_realtime_salary(title: str, country: str = "fr", location: str = "") -> Dict[str, Any]:
    """Helper function for salary lookup."""
    return await SalaryService.get_salary_stats(title, country, location)
