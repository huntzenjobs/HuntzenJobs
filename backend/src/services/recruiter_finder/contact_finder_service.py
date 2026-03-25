"""
Contact Finder Service
=======================
Orchestrates Apollo (primary) -> SerpAPI/Groq (enrichment) -> Hunter (email)
with Supabase caching and guaranteed LinkedIn fallback.
"""

import asyncio
import logging
from typing import Any

from src.api.deps import get_supabase_client
from src.services.recruiter_finder.apollo import find_recruiters_apollo
from src.services.recruiter_finder.hunter import (
    build_linkedin_company_url,
    extract_domain,
    find_recruiters_for_job,
)
from src.services.recruiter_finder.insider_service import InsiderFinderService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

async def get_cached_result(company: str, city: str) -> dict | None:
    sb = get_supabase_client()
    if not sb:
        return None
    try:
        key_company = company.lower().strip()
        key_city = (city or "").lower().strip()
        result = sb.table("contact_finder_cache") \
            .select("response_data, created_at") \
            .eq("company_normalized", key_company) \
            .eq("city_normalized", key_city) \
            .gt("expires_at", "now()") \
            .maybe_single() \
            .execute()
        if result.data:
            data = result.data["response_data"]
            data["cached"] = True
            data["cached_at"] = result.data["created_at"][:10]
            return data
    except Exception as e:
        logger.warning(f"[ContactFinder] Cache read error: {e}")
    return None


async def set_cached_result(
    company: str, city: str, response: dict, sources: list[str], total: int
) -> None:
    if total == 0:
        return
    sb = get_supabase_client()
    if not sb:
        return
    try:
        key_company = company.lower().strip()
        key_city = (city or "").lower().strip()
        sb.table("contact_finder_cache") \
            .upsert(
                {
                    "company_normalized": key_company,
                    "city_normalized": key_city,
                    "response_data": response,
                    "sources_used": sources,
                    "total_found": total,
                },
                on_conflict="company_normalized,city_normalized",
            ) \
            .execute()
    except Exception as e:
        logger.warning(f"[ContactFinder] Cache write error: {e}")


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def dedup_contacts(contacts: list[dict]) -> list[dict]:
    """Deduplicate by LinkedIn URL or by (name, position) tuple."""
    seen_linkedin: set[str] = set()
    seen_identity: set[tuple[str, str]] = set()
    unique = []

    for c in contacts:
        linkedin = (c.get("linkedin_url") or "").lower().rstrip("/")
        name_key = c.get("name", "").lower().strip()
        position_key = (c.get("position") or "").lower().strip()
        identity = (name_key, position_key)

        if linkedin and linkedin in seen_linkedin:
            continue
        if name_key and identity in seen_identity:
            continue

        if linkedin:
            seen_linkedin.add(linkedin)
        if name_key:
            seen_identity.add(identity)
        unique.append(c)

    return unique


# ---------------------------------------------------------------------------
# Contact normalization
# ---------------------------------------------------------------------------

def _normalize_apollo_contact(c: dict) -> dict:
    return {
        "name": c.get("name", ""),
        "position": c.get("position"),
        "email": c.get("email") or None,
        "email_verified": c.get("email_verified", False),
        "linkedin_url": c.get("linkedin") or None,
        "confidence": c.get("confidence", 0),
        "category": c.get("role", "other"),
        "source": "apollo",
    }


def _normalize_insider_contact(c: dict) -> dict:
    category = c.get("category", "other")
    if category in ("recruiter", "recruiter_fr", "recruiter_en", "hr_manager"):
        category = "hr"
    elif category == "pair":
        category = "pair"
    elif category == "campus":
        category = "campus"
    else:
        category = "other"

    return {
        "name": c.get("name", ""),
        "position": c.get("title"),
        "email": None,
        "email_verified": False,
        "linkedin_url": c.get("link") or None,
        "confidence": 50,
        "category": category,
        "source": "serpapi",
    }


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

async def find_contacts(
    company_name: str,
    company_domain: str | None = None,
    company_website: str | None = None,
    job_title: str | None = None,
    city: str | None = None,
    country_code: str | None = "fr",
    is_alternance: bool = False,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """
    Orchestrate contact search:
    1. Cache check
    2. Apollo (primary, with location)
    3. SerpAPI/Groq (if Apollo < 3 HR)
    4. Hunter (email enrichment)
    5. LinkedIn company page fallback (always)

    Global timeout: 20 seconds.
    """
    linkedin_url = build_linkedin_company_url(
        company_name, keywords="recruteur" if country_code == "fr" else "recruiter"
    )

    # 1. Cache check
    if not force_refresh:
        cached = await get_cached_result(company_name, city or "")
        if cached:
            cached["linkedin_company_url"] = linkedin_url
            logger.info(f"[ContactFinder] Cache HIT for {company_name}")
            return cached

    # 2-5. Orchestration with global timeout
    partial_result: dict[str, Any] = _empty_result(company_name, linkedin_url)

    async def _run_orchestration():
        nonlocal partial_result
        partial_result = await _orchestrate_search(
            company_name=company_name,
            company_domain=company_domain,
            company_website=company_website,
            job_title=job_title,
            city=city,
            country_code=country_code or "fr",
            is_alternance=is_alternance,
            linkedin_url=linkedin_url,
        )

    try:
        await asyncio.wait_for(_run_orchestration(), timeout=20)
    except TimeoutError:
        logger.warning(f"[ContactFinder] Global timeout for {company_name}, returning partial results")

    result = partial_result

    # Cache the result (skip empty results)
    sources = result.get("sources_used", [])
    total = result.get("total_found", 0)
    await set_cached_result(company_name, city or "", result, sources, total)

    return result


async def _orchestrate_search(
    company_name: str,
    company_domain: str | None,
    company_website: str | None,
    job_title: str | None,
    city: str | None,
    country_code: str,
    is_alternance: bool,
    linkedin_url: str,
) -> dict[str, Any]:
    """Orchestration logic (timeout handled by caller)."""
    all_contacts: list[dict] = []
    sources_used: list[str] = []
    strategy_text: str | None = None

    # Resolve domain
    domain = ""
    if company_domain:
        domain = extract_domain(company_domain)
    elif company_website:
        domain = extract_domain(company_website)

    # 2. Apollo (primary)
    apollo_result = await find_recruiters_apollo(
        company_name=company_name,
        company_domain=domain,
        job_title=job_title or "",
        city=city or "",
        country_code=country_code,
    )

    apollo_contacts = []
    for c in apollo_result.get("recruiters", []) + apollo_result.get("tech_team", []):
        apollo_contacts.append(_normalize_apollo_contact(c))

    for c in apollo_result.get("all_contacts", []):
        if c.get("role") == "other" and c.get("linkedin"):
            apollo_contacts.append(_normalize_apollo_contact(c))

    if apollo_contacts:
        sources_used.append("apollo")
        all_contacts.extend(apollo_contacts)

    # 3. SerpAPI if Apollo < 3 HR contacts
    hr_count = sum(1 for c in all_contacts if c.get("category") == "hr")
    if hr_count < 3:
        try:
            insider_svc = InsiderFinderService()
            insider_result = await insider_svc.find_insiders(
                job_title=job_title or company_name,
                company=company_name,
                city=city or "",
                is_alternance=is_alternance,
                country_code=country_code,
            )
            if insider_result.get("success"):
                strategy_text = insider_result.get("strategy")
                for c in insider_result.get("insiders", []):
                    all_contacts.append(_normalize_insider_contact(c))
                if insider_result.get("insiders"):
                    sources_used.append("serpapi")
        except Exception as e:
            logger.error(f"[ContactFinder] SerpAPI failed: {e}")

    # 4. Hunter email enrichment (if contacts without email)
    email_pattern = None
    contacts_without_email = [c for c in all_contacts if not c.get("email") and c.get("name")]
    if contacts_without_email and domain:
        try:
            hunter_result = await find_recruiters_for_job(
                company_name=company_name,
                company_domain=domain,
                job_title=job_title or "",
            )
            email_pattern = hunter_result.get("email_pattern")
            if hunter_result.get("total_found", 0) > 0:
                sources_used.append("hunter")
                hunter_emails = {
                    c.get("name", "").lower(): c
                    for c in hunter_result.get("all_contacts", [])
                    if c.get("email")
                }
                for contact in all_contacts:
                    name_lower = contact.get("name", "").lower()
                    if not contact.get("email") and name_lower in hunter_emails:
                        h = hunter_emails[name_lower]
                        contact["email"] = h.get("email")
                        contact["email_verified"] = h.get("confidence", 0) >= 80
                        contact["confidence"] = max(
                            contact.get("confidence", 0), h.get("confidence", 0)
                        )
        except Exception as e:
            logger.error(f"[ContactFinder] Hunter failed: {e}")

    # Dedup
    all_contacts = dedup_contacts(all_contacts)

    # Sort: HR first, then by confidence desc
    category_order = {"hr": 0, "pair": 1, "campus": 2, "tech": 3, "other": 4}
    all_contacts.sort(
        key=lambda c: (category_order.get(c.get("category", "other"), 9), -c.get("confidence", 0))
    )

    return {
        "company": company_name,
        "domain": domain or None,
        "email_pattern": email_pattern,
        "contacts": all_contacts,
        "total_found": len(all_contacts),
        "sources_used": sources_used,
        "linkedin_company_url": linkedin_url,
        "strategy": strategy_text,
        "cached": False,
        "cached_at": None,
    }


def _empty_result(company: str, linkedin_url: str) -> dict[str, Any]:
    return {
        "company": company,
        "domain": None,
        "email_pattern": None,
        "contacts": [],
        "total_found": 0,
        "sources_used": [],
        "linkedin_company_url": linkedin_url,
        "strategy": None,
        "cached": False,
        "cached_at": None,
    }
