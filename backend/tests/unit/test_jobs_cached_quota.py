"""Comptabilisation des recherches d'emploi servies depuis le cache."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from starlette.requests import Request

from src.api.routes import jobs


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
        authorization="Bearer test-token",
    )

    assert response["jobs"][0]["title"] == "Data Engineer"
    check_quota.assert_called_once_with("user-test")
    increment_quota.assert_called_once_with("user-test")
    invalidate_cache.assert_awaited_once_with("user-test")
