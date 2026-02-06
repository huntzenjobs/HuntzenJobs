"""
Salary Insight Service
=======================
Fetches real-time salary data using multiple providers:
1. Adzuna API (primary) — good for FR, UK, US, DE, AU, CA
2. JSearch /estimated-salary via RapidAPI (fallback) — global, Google for Jobs data

Strategy: Try Adzuna first. If it fails or returns no data, fallback to JSearch.
When both return data, combine for a more reliable range.
"""

import logging
from typing import Any, Dict, Optional

import httpx
from src.config.settings import settings

logger = logging.getLogger(__name__)


# ── Adzuna countries (ISO codes supported by their API) ──
_ADZUNA_COUNTRIES = {"gb", "us", "au", "ca", "de", "fr", "in", "pl", "za", "nz", "at", "br", "nl", "it"}

# ── Currency mapping ──
_CURRENCY_MAP = {
    "fr": "EUR", "de": "EUR", "at": "EUR", "it": "EUR", "nl": "EUR",
    "pl": "PLN", "be": "EUR", "ch": "CHF",
    "gb": "GBP", "uk": "GBP",
    "us": "USD", "ca": "CAD", "au": "AUD", "nz": "NZD",
    "ma": "MAD", "in": "INR", "br": "BRL", "za": "ZAR",
}


class AdzunaProvider:
    """Salary data from Adzuna API (history endpoint)."""

    BASE_URL = "https://api.adzuna.com/v1/api/jobs"

    @classmethod
    async def get_salary(
        cls, job_title: str, country_code: str = "fr", location: str = ""
    ) -> Optional[Dict[str, Any]]:
        app_id = settings.adzuna_app_id
        app_key = settings.get_adzuna_key()

        if not app_id or not app_key:
            logger.debug("[Adzuna] Missing credentials, skipping")
            return None

        cc = country_code.lower()
        if cc not in _ADZUNA_COUNTRIES:
            logger.debug(f"[Adzuna] Country '{cc}' not supported")
            return None

        url = f"{cls.BASE_URL}/{cc}/history"
        params = {
            "app_id": app_id,
            "app_key": app_key,
            "what": job_title,
            "where": location,
            "content-type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)

                if response.status_code != 200:
                    logger.warning(f"[Adzuna] HTTP {response.status_code}")
                    return None

                data = response.json()
                history = data.get("month", {})
                if not history:
                    return None

                sorted_months = sorted(history.keys(), reverse=True)
                latest_avg = history[sorted_months[0]] if sorted_months else 0

                trend = "stable"
                if len(sorted_months) > 1:
                    trend = "up" if history[sorted_months[0]] > history[sorted_months[1]] else "down"

                return {
                    "source": "adzuna",
                    "average_salary": round(latest_avg),
                    "currency": _CURRENCY_MAP.get(cc, "EUR"),
                    "trend": trend,
                }
        except Exception as e:
            logger.warning(f"[Adzuna] Error: {e}")
            return None


class JSearchProvider:
    """Salary data from JSearch /estimated-salary (RapidAPI — Google for Jobs data)."""

    BASE_URL = "https://jsearch.p.rapidapi.com/estimated-salary"

    @classmethod
    async def get_salary(
        cls, job_title: str, country_code: str = "fr", location: str = ""
    ) -> Optional[Dict[str, Any]]:
        rapidapi_key = settings.get_rapidapi_key()

        if not rapidapi_key:
            logger.debug("[JSearch] Missing RapidAPI key, skipping")
            return None

        # JSearch needs a location string like "Paris, France" or "New York, US"
        location_query = location if location else country_code.upper()

        headers = {
            "X-RapidAPI-Key": rapidapi_key,
            "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        }
        params = {
            "job_title": job_title,
            "location": location_query,
            "radius": "100",  # km
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                response = await client.get(cls.BASE_URL, headers=headers, params=params)

                if response.status_code != 200:
                    logger.warning(f"[JSearch] HTTP {response.status_code}: {response.text[:200]}")
                    return None

                result = response.json()
                data = result.get("data", [])
                if not data:
                    return None

                # JSearch returns a list of salary estimates; take the first/best match
                entry = data[0]
                min_salary = entry.get("min_salary", 0)
                max_salary = entry.get("max_salary", 0)
                median_salary = entry.get("median_salary", 0)
                salary_period = entry.get("salary_period", "YEAR")
                publisher = entry.get("publisher_name", "Google for Jobs")

                # Normalize to annual if needed
                if salary_period == "MONTH" and median_salary:
                    min_salary = (min_salary or 0) * 12
                    max_salary = (max_salary or 0) * 12
                    median_salary = median_salary * 12
                elif salary_period == "HOUR" and median_salary:
                    min_salary = (min_salary or 0) * 1750  # ~35h/week × 50 weeks
                    max_salary = (max_salary or 0) * 1750
                    median_salary = median_salary * 1750

                cc = country_code.lower()
                return {
                    "source": "jsearch",
                    "publisher": publisher,
                    "min_salary": round(min_salary),
                    "max_salary": round(max_salary),
                    "median_salary": round(median_salary),
                    "average_salary": round(median_salary),  # unified field
                    "currency": _CURRENCY_MAP.get(cc, "USD"),
                    "salary_period": "YEAR",
                }
        except Exception as e:
            logger.warning(f"[JSearch] Error: {e}")
            return None


class SalaryService:
    """
    Multi-provider salary service.
    Strategy: Adzuna first → JSearch fallback → combine when both available.
    """

    @classmethod
    async def get_salary_stats(
        cls,
        job_title: str,
        country_code: str = "fr",
        location: str = "",
    ) -> Dict[str, Any]:
        cc = country_code.lower()

        # Try both providers
        adzuna_data = await AdzunaProvider.get_salary(job_title, cc, location)
        jsearch_data = await JSearchProvider.get_salary(job_title, cc, location)

        # ── Both available → combine for richer data ──
        if adzuna_data and jsearch_data:
            logger.info(f"[SalaryService] Both providers returned data for '{job_title}' in {location or cc}")
            return {
                "job_title": job_title,
                "country": cc,
                "location": location,
                "average_salary": round((adzuna_data["average_salary"] + jsearch_data["average_salary"]) / 2),
                "salary_range": {
                    "min": jsearch_data.get("min_salary", adzuna_data["average_salary"]),
                    "max": jsearch_data.get("max_salary", adzuna_data["average_salary"]),
                    "median": jsearch_data.get("median_salary", adzuna_data["average_salary"]),
                },
                "currency": adzuna_data.get("currency", jsearch_data.get("currency", "EUR")),
                "trend": adzuna_data.get("trend", "stable"),
                "sources": ["adzuna", "jsearch"],
                "confidence": "high",
            }

        # ── Only Adzuna ──
        if adzuna_data:
            return {
                "job_title": job_title,
                "country": cc,
                "location": location,
                "average_salary": adzuna_data["average_salary"],
                "currency": adzuna_data["currency"],
                "trend": adzuna_data.get("trend", "stable"),
                "sources": ["adzuna"],
                "confidence": "medium",
            }

        # ── Only JSearch ──
        if jsearch_data:
            return {
                "job_title": job_title,
                "country": cc,
                "location": location,
                "average_salary": jsearch_data["average_salary"],
                "salary_range": {
                    "min": jsearch_data.get("min_salary"),
                    "max": jsearch_data.get("max_salary"),
                    "median": jsearch_data.get("median_salary"),
                },
                "currency": jsearch_data["currency"],
                "sources": ["jsearch"],
                "confidence": "medium",
            }

        # ── Neither worked ──
        logger.warning(f"[SalaryService] No salary data for '{job_title}' in {location or cc}")
        return {
            "job_title": job_title,
            "country": cc,
            "location": location,
            "message": f"No salary data found for '{job_title}' in {location or cc}. "
                       "The salary advisor will use its internal knowledge.",
            "sources": [],
            "confidence": "low",
        }


async def get_realtime_salary(title: str, country: str = "fr", location: str = "") -> Dict[str, Any]:
    """Helper function for salary lookup."""
    return await SalaryService.get_salary_stats(title, country, location)
