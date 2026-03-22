"""
Apollo.io Recruiter Finder
===========================
Find the recruiter / decision-maker behind a job posting using Apollo.io.

Pipeline:
1. Accept company name, domain, and optional job title
2. Search Apollo.io People Search API for HR/recruiting contacts
3. Classify contacts (HR/Recruiter, Tech Lead, Other)
4. Return ranked results with emails and LinkedIn profiles
"""

import logging
from typing import Any

import httpx

from src.config.settings import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Contact classification keywords
# ---------------------------------------------------------------------------

HR_TITLE_KEYWORDS = [
    "recruit", "rh", "human", "talent", "hiring",
    "people", "drh", "staffing", "ressources humaines",
]

# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------


async def find_recruiters_apollo(
    company_name: str,
    company_domain: str = "",
    job_title: str = "",
) -> dict[str, Any]:
    """
    Find recruiters at a company using Apollo.io People Search API.

    Args:
        company_name: Name of the company (e.g. "HappyPal")
        company_domain: Domain (e.g. "happypal.fr")
        job_title: The job posting title (for context)

    Returns:
        dict with keys:
            - company: str
            - domain: str
            - email_pattern: None (Apollo doesn't return patterns)
            - recruiters: list[dict]   (HR / decision-makers)
            - tech_team: list[dict]    (potential future colleagues)
            - all_contacts: list[dict] (everyone found)
            - total_found: int
            - source: str ("apollo")
    """
    api_key = settings.get_apollo_key()
    if not api_key:
        logger.warning("[Apollo] No API key configured")
        return _empty_result(company_name, company_domain)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            payload: dict[str, Any] = {
                "api_key": api_key,
                "q_organization_name": company_name,
                "person_titles": [
                    "recruteur", "recruiter", "talent acquisition",
                    "RH", "human resources", "DRH", "hiring manager",
                    "people", "HR manager", "responsable recrutement",
                ],
                "page": 1,
                "per_page": 10,
            }

            if company_domain:
                payload["q_organization_domains"] = [company_domain]

            resp = await client.post(
                "https://api.apollo.io/api/v1/mixed_people/search",
                headers={
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                },
                json=payload,
            )

            if resp.status_code == 401:
                logger.error("[Apollo] Invalid API key")
                return _empty_result(company_name, company_domain)

            if resp.status_code == 429:
                logger.warning("[Apollo] Rate limit exceeded")
                result = _empty_result(company_name, company_domain)
                result["rate_limited"] = True
                return result

            if resp.status_code != 200:
                logger.warning(f"[Apollo] API returned {resp.status_code}: {resp.text[:200]}")
                return _empty_result(company_name, company_domain)

            data = resp.json()
            people = data.get("people", [])

    except Exception as e:
        logger.error(f"[Apollo] Error: {e}")
        return _empty_result(company_name, company_domain)

    # Parse and classify contacts
    recruiters: list[dict[str, Any]] = []
    tech_team: list[dict[str, Any]] = []
    all_contacts: list[dict[str, Any]] = []

    for person in people:
        first = person.get("first_name") or ""
        last = person.get("last_name") or ""
        if not first and not last:
            continue  # skip generic entries

        contact: dict[str, Any] = {
            "name": f"{first} {last}".strip(),
            "email": person.get("email", ""),
            "email_status": person.get("email_status", ""),
            "position": person.get("title", ""),
            "department": None,
            "seniority": person.get("seniority"),
            "confidence": _email_status_to_confidence(person.get("email_status", "")),
            "linkedin": person.get("linkedin_url") or None,
            "phone": person.get("phone_number") or None,
            "company": (person.get("organization") or {}).get("name", company_name),
            "source": "apollo",
            "email_verified": person.get("email_status") == "verified",
        }

        # Classify: HR/recruiter vs tech vs other
        title_lower = (person.get("title") or "").lower()
        if any(kw in title_lower for kw in HR_TITLE_KEYWORDS):
            contact["role"] = "hr"
            recruiters.append(contact)
        elif any(kw in title_lower for kw in ["engineer", "developer", "devops", "cto", "tech"]):
            contact["role"] = "tech"
            tech_team.append(contact)
        else:
            contact["role"] = "other"

        all_contacts.append(contact)

    # Sort by confidence (verified emails first)
    recruiters.sort(key=lambda c: c["confidence"], reverse=True)
    tech_team.sort(key=lambda c: c["confidence"], reverse=True)

    logger.info(
        f"[Apollo] {company_name}: "
        f"{len(recruiters)} recruiter(s), {len(tech_team)} tech, "
        f"{len(all_contacts)} total"
    )

    return {
        "company": company_name,
        "domain": company_domain,
        "email_pattern": None,
        "recruiters": recruiters,
        "tech_team": tech_team,
        "all_contacts": recruiters + tech_team + [c for c in all_contacts if c["role"] == "other"],
        "total_found": len(all_contacts),
        "source": "apollo",
        "rate_limited": False,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _email_status_to_confidence(status: str) -> int:
    """Convert Apollo email_status to a confidence score (0-100)."""
    status_map = {
        "verified": 95,
        "guessed": 50,
        "unavailable": 0,
        "bounced": 0,
        "pending_manual_fulfillment": 30,
    }
    return status_map.get(status, 0)


def _empty_result(company: str, domain: str) -> dict[str, Any]:
    """Return an empty result structure."""
    return {
        "company": company,
        "domain": domain,
        "email_pattern": None,
        "recruiters": [],
        "tech_team": [],
        "all_contacts": [],
        "total_found": 0,
        "source": "apollo",
        "rate_limited": False,
    }
