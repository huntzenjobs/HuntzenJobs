"""Comptabilisation des recherches d'emploi servies depuis le cache."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from starlette.requests import Request

from src.api.routes import jobs


@pytest.mark.asyncio
async def test_refinement_token_is_scoped_to_the_user_and_base_search():
    values: dict[str, str] = {}

    class InMemoryRedis:
        async def setex(self, key: str, _ttl: int, value: str) -> None:
            values[key] = value

        async def get(self, key: str) -> str | None:
            return values.get(key)

    context = jobs._build_refinement_context(
        q="Développeur Python",
        country="fr",
        city="Paris",
        limit=200,
        radius=None,
    )
    redis = InMemoryRedis()
    token = await jobs._create_refinement_token(
        redis,
        user_id="user-a",
        context=context,
    )

    assert token is not None
    assert await jobs._is_valid_refinement_token(
        redis,
        user_id="user-a",
        token=token,
        context=context,
    )
    assert not await jobs._is_valid_refinement_token(
        redis,
        user_id="user-b",
        token=token,
        context=context,
    )
    assert not await jobs._is_valid_refinement_token(
        redis,
        user_id="user-a",
        token=token,
        context={**context, "city": "lyon"},
    )


@pytest.mark.asyncio
async def test_cached_get_search_checks_and_increments_quota(monkeypatch):
    cached_response = json.dumps(
        {
            "success": True,
            "jobs": [
                {
                    "title": "Data Engineer",
                    "company": "HuntZen",
                    "source": "cache",
                }
            ],
            "metadata": {"total_raw": 1},
        }
    )
    redis = SimpleNamespace(
        get=AsyncMock(return_value=cached_response),
        set=AsyncMock(return_value=True),
        delete=AsyncMock(return_value=True),
    )
    check_quota = Mock()
    increment_quota = Mock()
    invalidate_cache = AsyncMock()

    monkeypatch.setattr(jobs, "get_user_id_from_token", Mock(return_value="user-test"))
    monkeypatch.setattr(jobs, "get_redis", AsyncMock(return_value=redis))
    monkeypatch.setattr(jobs, "_check_job_search_quota", check_quota)
    monkeypatch.setattr(jobs, "_increment_job_search_quota", increment_quota)
    monkeypatch.setattr(jobs, "invalidate_user_quota_cache", invalidate_cache)

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/jobs/search",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
        }
    )
    response = await jobs.search_jobs_get(
        request=request,
        agent=AsyncMock(),
        q="Data Engineer",
        country="fr",
        city="",
        contract="",
        limit=200,
        radius=None,
        include_remote=True,
        industries="",
        keywords="",
        experience_level="",
        salary_min=None,
        salary_max=None,
        company_size="",
        contract_types="",
        work_schedule="",
        work_days="",
        from_history=False,
        refinement_token="",
        authorization="Bearer test-token",
    )

    assert response["jobs"][0]["title"] == "Data Engineer"
    check_quota.assert_called_once_with("user-test")
    increment_quota.assert_called_once_with("user-test")
    invalidate_cache.assert_awaited_once_with("user-test")


@pytest.mark.asyncio
async def test_get_search_disables_market_insights(monkeypatch):
    agent = SimpleNamespace(
        run=AsyncMock(
            return_value={
                "success": True,
                "jobs": [],
                "metadata": {},
            }
        )
    )

    monkeypatch.setattr(jobs, "get_user_id_from_token", Mock(return_value="user-test"))
    monkeypatch.setattr(jobs, "get_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(jobs, "_check_job_search_quota", Mock())
    monkeypatch.setattr(jobs, "_record_job_search_usage", AsyncMock())

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/jobs/search",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
        }
    )
    await jobs.search_jobs_get(
        request=request,
        agent=agent,
        q="Manutention",
        country="fr",
        city="",
        contract="",
        limit=10,
        radius=None,
        include_remote=True,
        industries="",
        keywords="",
        experience_level="",
        salary_min=None,
        salary_max=None,
        company_size="",
        contract_types="",
        work_schedule="",
        work_days="",
        from_history=False,
        refinement_token="",
        authorization="Bearer test-token",
    )

    agent.run.assert_awaited_once_with(
        job_title="Manutention",
        country_code="fr",
        city="",
        contract_type="",
        max_results=10,
        radius_km=None,
        include_remote=True,
        include_insights=False,
    )


@pytest.mark.asyncio
async def test_refinement_search_returns_server_results_without_using_quota(monkeypatch):
    agent = SimpleNamespace(
        run=AsyncMock(
            return_value={
                "success": True,
                "jobs": [
                    {
                        "id": "job-1",
                        "title": "Développeur Python CDI",
                        "company": "HuntZen",
                        "location": "Paris",
                        "description": "CDI à temps plein",
                        "url": "https://example.test/jobs/1",
                        "source": "test",
                        "contract_type": "CDI",
                    }
                ],
                "metadata": {},
            }
        )
    )
    redis = SimpleNamespace(
        get=AsyncMock(return_value=None),
        set=AsyncMock(return_value=True),
        delete=AsyncMock(return_value=True),
        setex=AsyncMock(return_value=True),
    )
    check_quota = Mock()
    record_usage = AsyncMock()

    monkeypatch.setattr(jobs, "get_user_id_from_token", Mock(return_value="user-test"))
    monkeypatch.setattr(jobs, "get_redis", AsyncMock(return_value=redis))
    monkeypatch.setattr(jobs, "_check_job_search_quota", check_quota)
    monkeypatch.setattr(jobs, "_record_job_search_usage", record_usage)
    monkeypatch.setattr(
        jobs,
        "_is_valid_refinement_token",
        AsyncMock(return_value=True),
        raising=False,
    )

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/jobs/search",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
        }
    )
    response = await jobs.search_jobs_get(
        request=request,
        agent=agent,
        q="Développeur Python",
        country="fr",
        city="Paris",
        contract="",
        limit=200,
        radius=None,
        include_remote=True,
        industries="",
        keywords="",
        experience_level="",
        salary_min=None,
        salary_max=None,
        company_size="",
        contract_types="cdi",
        work_schedule="",
        work_days="",
        from_history=False,
        refinement_token="jeton-affinage-valide",
        authorization="Bearer test-token",
    )

    assert response["jobs"][0]["id"] == "job-1"
    check_quota.assert_not_called()
    record_usage.assert_not_awaited()
    agent.run.assert_awaited_once_with(
        job_title="Développeur Python",
        country_code="fr",
        city="Paris",
        contract_type="cdi",
        max_results=200,
        radius_km=None,
        include_remote=True,
        include_insights=False,
    )


@pytest.mark.asyncio
async def test_post_search_disables_market_insights(monkeypatch):
    agent = SimpleNamespace(
        run=AsyncMock(
            return_value={
                "success": True,
                "jobs": [],
                "metadata": {},
            }
        )
    )

    monkeypatch.setattr(jobs, "get_user_id_from_token", Mock(return_value="user-test"))
    monkeypatch.setattr(jobs, "get_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(jobs, "_check_job_search_quota", Mock())
    monkeypatch.setattr(jobs, "_record_job_search_usage", AsyncMock())

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/jobs/search",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
        }
    )
    await jobs.search_jobs(
        request=request,
        data=jobs.JobSearchRequest(
            job_title="Manutention",
            country_code="fr",
            max_results=10,
        ),
        agent=agent,
        authorization="Bearer test-token",
    )

    agent.run.assert_awaited_once_with(
        job_title="Manutention",
        country_code="fr",
        city="",
        contract_type="",
        max_results=10,
        max_days=120,
        radius_km=None,
        include_remote=True,
        include_insights=False,
    )
