import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
import threading

import httpx
from supabase import Client, create_client

from src.agents.recruiter_finder.agent import RecruiterFinderAgent
from src.config.settings import settings
from src.services.recruiter_finder.fresh_linkedin import FreshLinkedInProfileValidator

logger = logging.getLogger(__name__)

# Local Supabase singleton to avoid circular imports from src.api.deps
_supabase_client: Client | None = None
_supabase_lock = threading.Lock()


def get_supabase_client() -> Client:
    """Lightweight access to Supabase service role client."""
    global _supabase_client
    if _supabase_client is None:
        with _supabase_lock:
            if _supabase_client is None:
                _supabase_client = create_client(
                    settings.supabase_url,
                    settings.get_supabase_service_role_key()
                )
    return _supabase_client

LINKEDIN_HOST = "linkedin.com/in/"

QUERY_TEMPLATES = [
    "site:linkedin.com/in {company} {job_title} recruiter",
    "site:linkedin.com/in {company} talent acquisition {job_title}",
    "site:linkedin.com/in {company} RH recrutement",
    "site:linkedin.com/in {company} hiring manager",
]


_strategy_agent: RecruiterFinderAgent | None = None


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


def generate_company_slug(company_name: str) -> str:
    """Generate a consistent slug for company identification (normalized McDonald's -> mcdonalds)."""
    return FreshLinkedInProfileValidator._normalize(company_name)


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


def _fallback_queries(company: str, job_title: str | None) -> list[str]:
    queries: list[str] = []
    cleaned_company = company.strip()
    cleaned_job = (job_title or "recruitment").strip()
    for template in QUERY_TEMPLATES:
        queries.append(template.format(company=cleaned_company, job_title=cleaned_job))
    return queries


def _get_strategy_agent() -> RecruiterFinderAgent | None:
    global _strategy_agent
    if _strategy_agent is not None:
        return _strategy_agent

    try:
        groq_key = settings.get_groq_key()
    except Exception:  # pragma: no cover - defensive if secret not configured
        groq_key = ""

    if not groq_key:
        logger.info("[serpapi] GROQ_API_KEY missing — recruiter strategy agent disabled")
        _strategy_agent = None
        return None

    try:
        _strategy_agent = RecruiterFinderAgent()
        logger.info("[serpapi] Recruiter strategy agent ready")
    except Exception as exc:  # pragma: no cover - initialization failures
        logger.warning("[serpapi] Failed to init recruiter strategy agent: %s", exc)
        _strategy_agent = None
    return _strategy_agent


async def _build_queries(
    company: str,
    job_title: str | None,
    country_code: str,
) -> tuple[list[str], dict[str, Any] | None]:
    agent = _get_strategy_agent()
    if not agent:
        return _fallback_queries(company, job_title), None

    try:
        language = "fr" if country_code.lower() == "fr" else "en"
        agent_result = await agent.run(
            company=company,
            job_title=job_title or "",
            country=country_code.upper(),
            language=language,
        )
    except Exception as exc:  # pragma: no cover - LLM failures handled gracefully
        logger.warning("[serpapi] Recruiter strategy agent failed: %s", exc)
        return _fallback_queries(company, job_title), None

    queries: list[str] = []
    for item in agent_result.get("queries", []):
        query = (item.get("query") or "").strip()
        if query:
            queries.append(query)

    if not queries:
        logger.warning("[serpapi] Strategy agent returned no usable queries, falling back")
        return _fallback_queries(company, job_title), None

    return queries, agent_result


async def _get_cached_recruiters(slug: str) -> dict[str, Any] | None:
    """Retrieve recruiters from Supabase cache if not expired."""
    try:
        supabase = get_supabase_client()
        result = (
            supabase.table("recruiter_cache")
            .select("*")
            .eq("company_slug", slug)
            .execute()
        )
        if not result.data:
            return None
        
        row = result.data[0]
        # Check expiry
        expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            logger.info("[serpapi] Cache expired for %s", slug)
            return None
            
        logger.info("[serpapi] Cache HIT for %s", slug)
        return {
            "recruiters": row.get("recruiters") or [],
            "strategy": row.get("strategy_summary"),
            "queries": row.get("search_queries") or [],
            "source": "cache",
        }
    except Exception as e:
        logger.warning("[serpapi] Cache read failed: %s", e)
        return None


async def _save_to_cache(slug: str, company: str, recruiters: list[Any], strategy_info: dict[str, Any] | None):
    """Save found recruiters to Supabase cache with a 30-day TTL."""
    try:
        supabase = get_supabase_client()
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        
        data = {
            "company_slug": slug,
            "company_name": company,
            "recruiters": recruiters,
            "strategy_summary": strategy_info.get("strategy") if strategy_info else None,
            "search_queries": strategy_info.get("queries") if strategy_info else [],
            "expires_at": expires_at.isoformat(),
        }
        
        supabase.table("recruiter_cache").upsert(data).execute()
        logger.info("[serpapi] Saved recruiters to cache for %s", slug)
    except Exception as e:
        logger.warning("[serpapi] Cache write failed: %s", e)


async def find_recruiters_serpapi(
    company_name: str,
    company_domain: str = "",
    job_title: str = "",
    country_code: str = "fr",
    max_contacts: int = 15,
) -> dict[str, Any]:
    """Search LinkedIn profiles via SerpAPI for recruiter-style contacts (checked against Cache first)."""
    
    slug = generate_company_slug(company_name)
    if not slug:
        return _default_result(company_name, company_domain)

    # 1. Check Cache
    cache_hit = await _get_cached_recruiters(slug)
    if cache_hit:
        result = _default_result(company_name, company_domain)
        result["recruiters"] = cache_hit["recruiters"]
        result["total_found"] = len(cache_hit["recruiters"])
        result["source"] = "recruiter_vault" # For UI badging
        result["initial_candidates"] = len(cache_hit["recruiters"])
        result["search_strategy"] = cache_hit["strategy"]
        result["search_queries"] = cache_hit["queries"]
        return result

    # 2. Fresh Search (If not in cache)
    api_key = settings.get_serpapi_key()
    if not api_key:
        logger.warning("[serpapi] Missing SERPAPI_KEY — returning empty result")
        return _default_result(company_name, company_domain)

    queries, strategy_info = await _build_queries(company_name, job_title, country_code)
    seen_links: set[str] = set()
    contacts: list[dict[str, Any]] = []

    max_contacts = max(1, min(max_contacts, 25))

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

            if len(contacts) >= max_contacts:
                break

    result = _default_result(company_name, company_domain)
    validator = FreshLinkedInProfileValidator()
    validated, rejected, summary = await validator.validate_contacts(contacts, company_name)

    result["recruiters"] = validated
    result["all_contacts"] = contacts
    result["total_found"] = len(validated)
    result["initial_candidates"] = len(contacts)
    result["validation_summary"] = summary
    if strategy_info:
        result["search_strategy"] = strategy_info.get("strategy")
        result["search_queries"] = strategy_info.get("queries")

    # 3. Save to Cache for future users
    if validated or len(contacts) > 0:
        await _save_to_cache(slug, company_name, validated, strategy_info)

    if rejected and summary.get("enabled"):
        result["validation_summary"]["rejected_examples"] = [
            {
                "name": item.get("name"),
                "reason": item.get("validation_reason"),
                "linkedin": item.get("linkedin"),
                "company": (item.get("validation_details") or {}).get("company"),
            }
            for item in rejected[:5]
        ]

    return result

