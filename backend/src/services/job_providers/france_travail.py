"""
France Travail Job Provider
==============================
Official French public employment service API.
https://francetravail.io

Features:
- France-only (métropole + DOM-TOM)
- OAuth2 authentication (client_credentials)
- High-quality data: detailed descriptions, salaries, competencies
- Free: 10 requests/second
- Best source for French job market
"""

import logging
from typing import Any

import httpx

from src.config.settings import settings
from src.services.job_providers.base import BaseJobProvider, handle_provider_errors

logger = logging.getLogger(__name__)


class FranceTravailProvider(BaseJobProvider):
    """
    France Travail (ex-Pôle Emploi) API provider.

    Uses OAuth2 client_credentials flow to obtain an access token,
    then queries the Offres d'emploi v2 API.

    Only activated when country_code == "fr".
    """

    name = "france_travail"
    supported_countries = {"fr"}

    AUTH_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire"
    SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
    SCOPE = "api_offresdemploiv2 o2dsoffre"

    def __init__(self):
        super().__init__()
        self._access_token: str | None = None

    async def _get_token(self) -> str | None:
        """
        Obtain an OAuth2 access token using client_credentials grant.

        Tokens are cached in memory for the lifetime of the provider instance.
        France Travail tokens typically last 1500 seconds (25 min).
        """
        if self._access_token:
            return self._access_token

        client_id = settings.france_travail_client_id
        client_secret = settings.france_travail_client_secret

        if not client_id or not client_secret:
            logger.debug(f"[{self.name}] Missing France Travail credentials")
            return None

        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": self.SCOPE,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(self.AUTH_URL, data=data, headers=headers)

            if resp.status_code != 200:
                logger.error(f"[{self.name}] Auth failed ({resp.status_code}): {resp.text}")
                return None

            self._access_token = resp.json().get("access_token")
            logger.info(f"[{self.name}] OAuth2 token obtained successfully")
            return self._access_token

    @handle_provider_errors
    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "fr",
        max_results: int = 50,
        **kwargs,
    ) -> list[dict[str, Any]]:
        """
        Search France Travail for jobs.

        Args:
            query: Job title or keywords
            location: City or region (used as keyword, not code)
            country_code: Must be "fr" (only France supported)
            max_results: Maximum results (max 150 per request)

        Returns:
            List of normalized job listings
        """
        # France only
        if country_code.lower() != "fr":
            return []

        # Get token
        token = await self._get_token()
        if not token:
            return []

        # Build search params
        params: dict[str, str] = {
            "motsCles": query,
            "range": f"0-{min(max_results, 149)}",
        }

        # Add location as keyword if provided (France Travail uses INSEE codes,
        # but motsCles also matches location text)
        if location:
            params["motsCles"] = f"{query} {location}"

        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(self.SEARCH_URL, headers=headers, params=params)

            # 204 = no results (valid response)
            if resp.status_code == 204:
                logger.info(f"[{self.name}] No results for '{query}' in {location or 'France'}")
                return []

            # 401 = token expired, retry once
            if resp.status_code == 401:
                logger.warning(f"[{self.name}] Token expired, refreshing...")
                self._access_token = None
                token = await self._get_token()
                if not token:
                    return []
                headers = {"Authorization": f"Bearer {token}"}
                resp = await client.get(self.SEARCH_URL, headers=headers, params=params)

            resp.raise_for_status()
            data = resp.json()

        results = data.get("resultats", [])
        jobs = [self._normalize_ft_job(item) for item in results]

        logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}' in {location or 'France'}")
        return jobs

    def _normalize_ft_job(self, item: dict) -> dict[str, Any]:
        """Normalize a France Travail job to the standard format."""
        # Location
        lieu = item.get("lieuTravail", {})
        location = lieu.get("libelle", "France")

        # Company
        entreprise = item.get("entreprise", {})
        company = entreprise.get("nom", "Entreprise confidentielle")

        # Salary
        salary = self._format_salary(item)

        # Contract type
        contract = self._normalize_contract(item.get("typeContratLibelle"))

        # URL (always available via France Travail candidate portal)
        job_id = item.get("id", "")
        url = f"https://candidat.francetravail.fr/offres/recherche/detail/{job_id}"
        url_is_direct = False

        # Use origineOffre URL if available (direct employer posting)
        origine = item.get("origineOffre", {})
        if origine.get("urlOrigine"):
            url = origine["urlOrigine"]
            url_is_direct = True

        return {
            "id": f"ft_{job_id}",
            "title": item.get("intitule", ""),
            "company": company,
            "location": location,
            "description": (item.get("description") or "")[:5000],
            "url": url,
            "salary": salary,
            "contract_type": contract,
            "source": self.name,
            "posted_date": item.get("dateCreation"),
            "url_is_direct": url_is_direct,
        }

    @staticmethod
    def _format_salary(item: dict) -> str | None:
        """Format salary from France Travail response."""
        salaire = item.get("salaire", {})

        libelle = salaire.get("libelle")
        if libelle:
            return libelle

        commentaire = salaire.get("commentaire")
        if commentaire:
            return commentaire

        return None

    @staticmethod
    def _normalize_contract(raw: str | None) -> str | None:
        """Normalize France Travail contract type strings."""
        if not raw:
            return None
        mapping = {
            "CDI": "CDI",
            "CDD": "CDD",
            "MIS": "Intérim",
            "SAI": "Saisonnier",
            "LIB": "Freelance",
        }
        return mapping.get(raw, raw)
