"""Tests du hash stable des paramètres de recherche d'emploi."""

from src.api.routes.jobs import _build_search_hash
from src.models.schemas import JobSearchRequest


def test_build_search_hash_returns_stable_md5_for_job_search_request():
    request = JobSearchRequest(
        job_title="Data Engineer",
        country_code="fr",
        city="Paris",
        contract_type="permanent",
        salary_min=50000,
        max_results=50,
        max_days=30,
        radius_km=25,
        include_remote=True,
        contract_types=["cdi"],
        work_schedule=["journee"],
        work_days=["semaine"],
    )

    first_hash = _build_search_hash(request)
    second_hash = _build_search_hash(request)

    assert first_hash == second_hash
    assert len(first_hash) == 32
    assert first_hash == "224b01beb01d4eaf825d4a2da224cd71"
