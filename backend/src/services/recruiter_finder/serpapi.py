"""SerpAPI-based recruiter finder returning LinkedIn profiles only."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from src.config.settings import settings

logger = logging.getLogger(__name__)

LINKEDIN_HOST = "linkedin.com/in/"

QUERY_TEMPLATES = [
    "site:linkedin.com/in {company} {job_title} recruiter",
    "site:linkedin.com/in {company} talent acquisition {job_title}",
    "site:linkedin.com/in {company} RH recrutement",
    "site:linkedin.com/in {company} hiring manager",
]


def extract_domain(url_or_domain: str) -> str:
    """Extract clean domain from URL or raw domain string."""
    if not url_or_domain:
        return ""
    d = url_or_domain.strip()
    d = re.sub(r"^https?://", "", d)
    d = d.split("/")[0]
    d = d.split("?")[0]
    d = re.sub(r"^www\.", "", d)
    return d.lower()


def _default_result(company_name: str, domain: str) -> dict[str, Any]:
    return {
        "company": company_name,
        "domain": domain,
        "email_pattern": None,
        "recruiters": [],
        "tech_team": [],
        "all_contacts": [],
        "total_found": 0,
        "source": "serpapi",
    }


def _build_queries(company: str, job_title: str | None) -> list[str]:
    queries: list[str] = []
    cleaned_company = company.strip()
    cleaned_job = (job_title or "recruitment").strip()
    for template in QUERY_TEMPLATES:
        queries.append(template.format(company=cleaned_company, job_title=cleaned_job))
    return queries


async def find_recruiters_serpapi(
    company_name: str,
    company_domain: str = "",
    job_title: str = "",
    country_code: str = "fr",
) -> dict[str, Any]:
    """Search LinkedIn profiles via SerpAPI for recruiter-style contacts."""

    api_key = settings.get_serpapi_key()
    if not api_key:
        logger.warning("[serpapi] Missing SERPAPI_KEY — returning empty result")
        return _default_result(company_name, company_domain)

    queries = _build_queries(company_name, job_title)
    seen_links: set[str] = set()
    contacts: list[dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for query in queries:
            params = {
                "engine": "google",
                "q": query,
                "api_key": api_key,
                "gl": country_code.lower(),
                "hl": "fr",
                "num": "10",
            }
            try:
                resp = await client.get("https://serpapi.com/search", params=params)
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "[serpapi] Request failed (%s) for query '%s': %s",
                    exc.response.status_code,
                    query,
                    exc.response.text[:200],
                )
                continue
            except Exception as exc:  # pragma: no cover
                logger.error("[serpapi] Unexpected error for query '%s': %s", query, exc)
                continue

            data = resp.json()
            organic_results = data.get("organic_results", [])
            for item in organic_results:
                link = (item.get("link") or "").strip()
                if LINKEDIN_HOST not in link:
                    continue
                if link in seen_links:
                    continue
                seen_links.add(link)

                title = item.get("title") or ""
                name = title.split(" - ")[0].strip() or title
                snippet = item.get("snippet") or ""

                contact = {
                    "name": name,
                    "email": "",
                    "position": snippet or title,
                    "department": None,
                    "seniority": None,
                    "confidence": 0,
                    "linkedin": link,
                    "role": "hr",
                    "source": "serpapi",
                    "email_verified": False,
                }
                contacts.append(contact)

            if len(contacts) >= 15:
                break

    result = _default_result(company_name, company_domain)
    result["recruiters"] = contacts
    result["all_contacts"] = contacts
    result["total_found"] = len(contacts)
    return result
