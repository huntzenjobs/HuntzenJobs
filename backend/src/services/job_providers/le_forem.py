"""
Le Forem Job Provider
======================
Open Data API from the Walloon public employment service.
https://leforem-digitalwallonia.opendatasoft.com/

Features:
- Belgium only (Wallonia + aggregates VDAB/Actiris)
- No API key required (public Open Data)
- ~25,000 active listings
- GPS coordinates included
- Contract type, employer, education level available
"""

import logging
from typing import Any

import httpx

from src.services.job_providers.base import (
    BaseJobProvider,
    handle_provider_errors,
    normalize_contract_type,
)

logger = logging.getLogger(__name__)

# Mapping des types de contrat Le Forem → format normalisé
_FOREM_CONTRACT_MAP = {
    "Durée indéterminée": "CDI",
    "Durée déterminée": "CDD",
    "Intérim": "Interim",
    "Indépendant": "Freelance",
    "ACS": "CDD",
    "Convention premier emploi": "Alternance",
    "PFI": "Stage",
}


class LeForemProvider(BaseJobProvider):
    """
    Le Forem (Wallonia, Belgium) Open Data provider.

    Uses the OpenDataSoft Explore API v2.1 — free, no API key needed.
    Covers Wallonia and aggregates VDAB (Flanders) + Actiris (Brussels).
    """

    name = "le_forem"
    supported_countries = {"be"}

    BASE_URL = "https://leforem-digitalwallonia.opendatasoft.com/api/explore/v2.1/catalog/datasets/offres-d-emploi-forem/records"

    @handle_provider_errors
    async def search(
        self,
        query: str,
        location: str = "",
        country_code: str = "be",
        max_results: int = 50,
        **kwargs,
    ) -> list[dict[str, Any]]:
        """Search Le Forem Open Data for Belgian jobs."""
        if country_code.lower() != "be":
            return []

        params: dict[str, str | int] = {
            "limit": min(max_results, 100),
            "offset": 0,
            "select": "numerooffreforem,titreoffre,nomemployeur,typecontrat,lieuxtravaillocalite,lieuxtravailcodepostal,regimetravail,url,datedebutdiffusion,metier",
        }

        # Recherche dans le titre OU le métier (plus précis que full-text global)
        where_clauses = [f'(search(titreoffre, "{query}") OR search(metier, "{query}"))']

        # Filtre par ville si fournie
        if location:
            where_clauses.append(f'search(lieuxtravaillocalite, "{location.upper()}")')

        params["where"] = " AND ".join(where_clauses)

        # Filtre par type de contrat
        contract_type = kwargs.get("contract_type", "")
        if contract_type:
            forem_type = self._map_contract_to_forem(contract_type)
            if forem_type:
                where = params.get("where", "")
                contract_filter = f'typecontrat="{forem_type}"'
                params["where"] = f"{where} AND {contract_filter}" if where else contract_filter

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(self.BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        jobs = [self._normalize_forem_job(item) for item in results]

        logger.info(f"[{self.name}] Found {len(jobs)} jobs for '{query}' in {location or 'Belgium'} (total: {data.get('total_count', 0)})")
        return jobs

    def _normalize_forem_job(self, item: dict) -> dict[str, Any]:
        """Normalize a Le Forem job to the standard format."""
        job_id = item.get("numerooffreforem", "")

        # Location : prendre la première ville de la liste
        localities = item.get("lieuxtravaillocalite") or []
        postal_codes = item.get("lieuxtravailcodepostal") or []
        location = ""
        if localities:
            city = localities[0].title()  # "LIEGE" → "Liege"
            if postal_codes:
                location = f"{postal_codes[0]} - {city}"
            else:
                location = city

        # Type de contrat
        raw_contract = item.get("typecontrat", "")
        contract = _FOREM_CONTRACT_MAP.get(raw_contract, "")
        if not contract and raw_contract:
            contract = normalize_contract_type(raw_contract)

        # Régime → temps partiel
        regime = item.get("regimetravail", "")
        if "partiel" in regime.lower() and not contract:
            contract = "Temps partiel"

        return {
            "id": f"forem_{job_id}",
            "title": item.get("titreoffre", ""),
            "company": item.get("nomemployeur", "Employeur confidentiel"),
            "location": location,
            "description": item.get("metier", ""),
            "url": item.get("url", ""),
            "salary": None,
            "contract_type": contract,
            "source": self.name,
            "posted_date": item.get("datedebutdiffusion"),
            "url_is_direct": True,
        }

    @staticmethod
    def _map_contract_to_forem(contract_type: str) -> str | None:
        """Map normalized contract type to Le Forem values."""
        mapping = {
            "cdi": "Durée indéterminée",
            "cdd": "Durée déterminée",
            "interim": "Intérim",
            "freelance": "Indépendant",
            "alternance": "Convention premier emploi",
            "apprentissage": "Convention premier emploi",
        }
        return mapping.get(contract_type.lower().strip())
