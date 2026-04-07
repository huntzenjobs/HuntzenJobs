"""Fresh LinkedIn Profile Data (RapidAPI) validator for SerpAPI contacts."""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any, Tuple

import httpx

from src.config.settings import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://fresh-linkedin-profile-data.p.rapidapi.com/enrich-lead"
DEFAULT_PARAMS = {
    "include_skills": "false",
    "include_certifications": "false",
    "include_publications": "false",
    "include_honors": "false",
    "include_volunteers": "false",
    "include_projects": "false",
    "include_patents": "false",
    "include_courses": "false",
    "include_organizations": "false",
    "include_profile_status": "false",
    "include_company_public_url": "false",
}

HR_KEYWORDS = [
    "recruit", "talent", "people", "human resources", "hr",
    "ressources humaines", "acquisition", "staffing", "people ops",
    "people operations", "drh", "talent partner", "sourcing",
]


class FreshLinkedInProfileValidator:
    """Validate LinkedIn contacts using Fresh LinkedIn Profile Data (RapidAPI)."""

    def __init__(self, api_key: str | None = None, timeout: float = 25.0) -> None:
        self.api_key = api_key or settings.get_rapidapi_key()
        self.timeout = timeout
        self._headers = {
            "x-rapidapi-key": self.api_key,
            "x-rapidapi-host": "fresh-linkedin-profile-data.p.rapidapi.com",
        } if self.api_key else {}

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def validate_contacts(
        self,
        contacts: list[dict[str, Any]],
        expected_company: str,
    ) -> Tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
        """Return (validated, rejected, summary) tuples."""
        if not contacts:
            return [], [], {"enabled": self.enabled, "validated": 0, "rejected": 0}

        if not self.enabled:
            return contacts, [], {
                "enabled": False,
                "validated": len(contacts),
                "rejected": 0,
                "reason": "rapidapi_key_missing",
            }

        validated: list[dict[str, Any]] = []
        rejected: list[dict[str, Any]] = []

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for contact in contacts:
                enriched, failure_reason = await self._enrich_contact(
                    client,
                    contact,
                    expected_company,
                )
                if enriched and failure_reason is None:
                    validated.append(enriched)
                else:
                    rejected_contact = enriched or contact.copy()
                    rejected_contact["validation_reason"] = failure_reason or "unknown"
                    rejected.append(rejected_contact)

        summary = {
            "enabled": True,
            "validated": len(validated),
            "rejected": len(rejected),
        }
        return validated, rejected, summary

    async def _enrich_contact(
        self,
        client: httpx.AsyncClient,
        contact: dict[str, Any],
        expected_company: str,
    ) -> tuple[dict[str, Any] | None, str | None]:
        linkedin_url = contact.get("linkedin")
        if not linkedin_url:
            return None, "missing_linkedin"

        params = {"linkedin_url": linkedin_url, **DEFAULT_PARAMS}
        try:
            resp = await client.get(BASE_URL, params=params, headers=self._headers)
        except Exception as exc:  # pragma: no cover - network/runtime errors
            logger.warning("[rapidapi] Request error for %s: %s", linkedin_url, exc)
            return None, "request_failed"

        if resp.status_code == 404:
            return None, "not_found"
        if resp.status_code >= 500:
            logger.warning("[rapidapi] %s returned %s", BASE_URL, resp.status_code)
            return None, "provider_error"
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "[rapidapi] Unexpected status %s for %s: %s",
                exc.response.status_code,
                linkedin_url,
                exc.response.text[:200],
            )
            return None, "unexpected_status"

        payload = resp.json().get("data") or {}
        if not payload:
            return None, "empty_payload"

        company_name = payload.get("company") or payload.get("company_name") or ""
        match_company = self._company_matches(expected_company, company_name)
        is_hr = self._role_matches(contact, payload)
        
        enriched_contact = contact.copy()
        enriched_contact.setdefault("validation_details", {})
        enriched_contact["validation_details"].update(
            {
                "company": company_name or payload.get("current_company"),
                "headline": payload.get("headline") or payload.get("title"),
                "city": payload.get("city"),
                "is_in_hr": is_hr
            }
        )
        enriched_contact["validation_source"] = "fresh_linkedin_profile_data"

        if match_company:
            # We succeed if the company matches, regardless of role (as per user request)
            enriched_contact["confidence"] = max(enriched_contact.get("confidence", 0), 70)
            if is_hr:
                enriched_contact["confidence"] = 90
            enriched_contact["company_validated"] = True
            enriched_contact["hr_validated"] = is_hr
            return enriched_contact, None

        return enriched_contact, "company_mismatch"

    def _company_matches(self, expected: str, actual: str) -> bool:
        """Smart match for company names handling common legal noise and partials."""
        if not expected or not actual:
            return False
        
        # Helper to clean and tokenize a raw company name
        def get_clean_tokens(text: str) -> list[str]:
            # 1. Soft normalize (accents + lowercase only, keep spaces)
            t = unicodedata.normalize("NFKD", text or "")
            t = t.encode("ascii", "ignore").decode("ascii").lower()
            # 2. Tokenize on any non-alphanumeric
            tokens = [tok for tok in re.split(r"[^a-z0-9]+", t) if len(tok) >= 3]
            # 3. Filter legal noise
            legal_noise = {"groupe", "group", "sas", "snc", "services", "france", "europe", "solutions", "international", "inc", "corp", "holding"}
            return [t for t in tokens if t not in legal_noise]

        exp_tokens = get_clean_tokens(expected)
        act_tokens = get_clean_tokens(actual)
        
        if not exp_tokens or not act_tokens:
            return False

        # Strong Norm strings for direct containment checks
        norm_exp = "".join(exp_tokens)
        norm_act = "".join(act_tokens)

        # 1. Exact match or direct containment
        if norm_exp == norm_act or norm_exp in norm_act or norm_act in norm_exp:
            return True

        # 2. Distinctive token match (e.g. 'Streiff' matches 'Pierre Streiff' and 'Groupe Streiff')
        # A token is distinctive if it is long (>= 6) and present in the other's set
        for t in exp_tokens:
            if len(t) >= 6 and t in act_tokens:
                return True
        
        # 3. Minority/Majority match (Score based)
        matches = [t for t in exp_tokens if t in act_tokens]
        score = len(matches) / len(exp_tokens) if exp_tokens else 0
        
        return score >= 0.6 # Lowered threshold slightly for groups

    def _role_matches(self, contact: dict[str, Any], profile: dict[str, Any]) -> bool:
        text = " ".join(
            part
            for part in [
                contact.get("position"),
                contact.get("name"),
                profile.get("headline"),
                profile.get("title"),
            ]
            if part
        ).lower()
        return any(keyword in text for keyword in HR_KEYWORDS)

    @staticmethod
    def _normalize(value: str | None) -> str:
        if not value:
            return ""
        # Keep for backward compat or internal IDs
        normalized = unicodedata.normalize("NFKD", value)
        ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
        return re.sub(r"[^a-z0-9]", "", ascii_only.lower())
