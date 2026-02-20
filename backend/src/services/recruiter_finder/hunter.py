"""
Hunter.io Recruiter Finder
===========================
Find the recruiter / decision-maker behind a job posting using Hunter.io.

Pipeline:
1. Extract domain from employer website
2. Search Hunter.io for contacts at that domain
3. Classify contacts (HR/Recruiter, Tech Lead, Other)
4. Return ranked results with email pattern
"""

import logging
import re
from typing import Any

import httpx

from src.config.settings import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Domain extraction helpers
# ---------------------------------------------------------------------------

def extract_domain(url_or_domain: str) -> str:
    """
    Extract clean domain from a URL or domain string.

    Examples:
        "https://www.happypal.fr/careers" → "happypal.fr"
        "www.nickel.eu" → "nickel.eu"
        "eleven-labs.com" → "eleven-labs.com"
    """
    d = url_or_domain.strip()
    d = re.sub(r'^https?://', '', d)
    d = d.split('/')[0]          # remove path
    d = d.split('?')[0]          # remove query
    d = re.sub(r'^www\.', '', d)  # remove www
    return d.lower()


# ---------------------------------------------------------------------------
# Contact classification
# ---------------------------------------------------------------------------

HR_KEYWORDS = {"human_resources", "hr", "management", "executive"}
TECH_KEYWORDS = {"it", "engineering", "technology"}

def _classify_contact(contact: dict) -> str:
    """Classify a Hunter.io contact into hr, tech, or other."""
    dept = (contact.get("department") or "").lower()
    title = (contact.get("position") or "").lower()

    # HR / Management keywords in department
    if any(kw in dept for kw in HR_KEYWORDS):
        return "hr"

    # HR keywords in title
    hr_title_kw = [
        "recruiter", "recruteur", "talent", "rh", "human resource",
        "people", "hiring", "staffing", "ceo", "cto", "coo",
        "vp", "director", "manager", "head of", "chef", "directeur",
    ]
    if any(kw in title for kw in hr_title_kw):
        return "hr"

    # Tech
    if any(kw in dept for kw in TECH_KEYWORDS):
        return "tech"

    return "other"


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

async def find_recruiters_for_job(
    company_name: str,
    company_domain: str = "",
    company_website: str = "",
    job_title: str = "",
) -> dict[str, Any]:
    """
    Find recruiters / decision-makers at a company using Hunter.io.

    Args:
        company_name: Name of the company (e.g. "HappyPal")
        company_domain: Domain (e.g. "happypal.fr") — preferred
        company_website: Full URL (e.g. "https://happypal.fr") — fallback
        job_title: The job posting title (for context)

    Returns:
        dict with keys:
            - company: str
            - domain: str
            - email_pattern: str | None
            - recruiters: list[dict]   (HR / decision-makers)
            - tech_team: list[dict]    (potential future colleagues)
            - all_contacts: list[dict] (everyone found)
            - total_found: int
    """
    api_key = settings.get_hunter_key()
    if not api_key:
        logger.warning("[RecruiterFinder] No Hunter.io API key configured")
        return _empty_result(company_name, "")

    # Resolve domain
    domain = ""
    if company_domain:
        domain = extract_domain(company_domain)
    elif company_website:
        domain = extract_domain(company_website)
    else:
        # Guess domain from company name (best effort)
        slug = re.sub(r'[^a-z0-9]', '', company_name.lower())
        domain = f"{slug}.com"
        logger.info(f"[RecruiterFinder] Guessing domain: {domain}")

    if not domain:
        return _empty_result(company_name, "")

    # Call Hunter.io Domain Search
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.hunter.io/v2/domain-search",
                params={
                    "domain": domain,
                    "api_key": api_key,
                    "limit": 10,
                },
            )

            if resp.status_code == 401:
                logger.error("[RecruiterFinder] Hunter.io: invalid API key")
                return _empty_result(company_name, domain)

            if resp.status_code == 429:
                logger.warning("[RecruiterFinder] Hunter.io: rate limit exceeded")
                return _empty_result(company_name, domain)

            if resp.status_code != 200:
                logger.warning(f"[RecruiterFinder] Hunter.io returned {resp.status_code}")
                return _empty_result(company_name, domain)

            data = resp.json().get("data", {})

    except Exception as e:
        logger.error(f"[RecruiterFinder] Hunter.io error: {e}")
        return _empty_result(company_name, domain)

    # Parse results
    raw_emails = data.get("emails", [])
    pattern = data.get("pattern")
    organization = data.get("organization") or company_name

    # Classify and format contacts
    recruiters = []
    tech_team = []
    all_contacts = []

    for e in raw_emails:
        first = e.get("first_name") or ""
        last = e.get("last_name") or ""
        if not first and not last:
            continue  # skip generic emails

        contact = {
            "name": f"{first} {last}".strip(),
            "email": e.get("value", ""),
            "position": e.get("position"),
            "department": e.get("department"),
            "seniority": e.get("seniority"),
            "confidence": e.get("confidence", 0),
            "linkedin": e.get("linkedin") or None,
        }

        role = _classify_contact(e)
        contact["role"] = role
        all_contacts.append(contact)

        if role == "hr":
            recruiters.append(contact)
        elif role == "tech":
            tech_team.append(contact)

    # Sort by confidence
    recruiters.sort(key=lambda c: c["confidence"], reverse=True)
    tech_team.sort(key=lambda c: c["confidence"], reverse=True)

    # Build email pattern hint
    email_pattern = None
    if pattern:
        email_pattern = f"{pattern}@{domain}"

    logger.info(
        f"[RecruiterFinder] {organization}: "
        f"{len(recruiters)} recruiter(s), {len(tech_team)} tech, "
        f"{len(all_contacts)} total"
    )

    return {
        "company": organization,
        "domain": domain,
        "email_pattern": email_pattern,
        "recruiters": recruiters,
        "tech_team": tech_team,
        "all_contacts": all_contacts,
        "total_found": len(all_contacts),
    }


def _empty_result(company: str, domain: str) -> dict:
    """Return an empty result structure."""
    return {
        "company": company,
        "domain": domain,
        "email_pattern": None,
        "recruiters": [],
        "tech_team": [],
        "all_contacts": [],
        "total_found": 0,
    }
