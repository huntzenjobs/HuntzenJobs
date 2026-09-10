from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from src import modal_integration
from src.api import deps
from src.api.routes import cv_analysis, jobs, recruiter_finder


class _Rpc:
    def __init__(self, *, data=None, error: Exception | None = None):
        self.data = data
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return SimpleNamespace(data=self.data)


class _Supabase:
    def __init__(self, responses):
        self.responses = responses

    def rpc(self, name, payload):
        response = self.responses[name]
        return response(payload) if callable(response) else response


@pytest.mark.asyncio
async def test_check_quota_fails_closed_when_database_is_unavailable(monkeypatch):
    monkeypatch.setattr(
        deps,
        "get_supabase_client",
        lambda: _Supabase({"get_quota_status": _Rpc(error=RuntimeError("db down"))}),
    )

    with pytest.raises(HTTPException) as exc_info:
        await deps.check_quota("user-1", "job_view")

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_track_job_view_preserves_authoritative_429(monkeypatch):
    async def exhausted(*_args):
        raise HTTPException(status_code=429, detail={"code": "QUOTA_EXCEEDED"})

    monkeypatch.setattr(jobs, "get_user_id_from_token", lambda _token: "user-1")
    monkeypatch.setattr(jobs, "check_quota", exhausted)

    with pytest.raises(HTTPException) as exc_info:
        await jobs.track_job_view.__wrapped__(
            SimpleNamespace(),
            jobs.TrackViewRequest(job_id="job-1"),
            "Bearer token",
        )

    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_cv_analysis_releases_reservation_when_dispatch_fails(monkeypatch):
    reserve = AsyncMock(return_value="reservation-1")
    release = AsyncMock()
    monkeypatch.setattr(cv_analysis, "_reserve_quota", reserve)
    monkeypatch.setattr(cv_analysis, "_release_quota_reservation", release)
    monkeypatch.setattr(cv_analysis, "get_user_id_from_token", lambda _token: "user-1")
    monkeypatch.setattr(
        cv_analysis,
        "process_cv_async",
        AsyncMock(side_effect=HTTPException(status_code=500, detail="modal down")),
    )

    with pytest.raises(HTTPException):
        await cv_analysis.analyze_cv_async.__wrapped__(
            SimpleNamespace(),
            file=None,
            cv_text="CV suffisamment long pour le test",
            job_description=None,
            language="fr",
            authorization="Bearer token",
        )

    reserve.assert_awaited_once_with("user-1", "ats_score")
    release.assert_awaited_once_with("reservation-1")


@pytest.mark.asyncio
async def test_cv_callback_commits_bound_reservation_once(monkeypatch):
    commit = AsyncMock()
    monkeypatch.setenv("MODAL_CALLBACK_SECRET", "secret")
    monkeypatch.setattr(cv_analysis, "_find_bound_reservation", AsyncMock(return_value="reservation-1"))
    monkeypatch.setattr(cv_analysis, "_commit_quota_reservation", commit)
    monkeypatch.setattr(cv_analysis, "invalidate_user_quota_cache", AsyncMock())
    monkeypatch.setattr(cv_analysis, "supabase_client", None)

    response = await cv_analysis.cv_analysis_callback(
        SimpleNamespace(headers={"X-Modal-Secret": "secret"}, client=None),
        {"cv_id": "cv-1", "user_id": "user-1", "status": "completed"},
    )

    assert response["quota_incremented"] is True
    commit.assert_awaited_once_with("reservation-1", "user-1")


@pytest.mark.asyncio
async def test_cv_reservation_is_bound_before_modal_spawn(monkeypatch):
    calls: list[str] = []

    async def create_record(**_kwargs):
        calls.append("create")
        return "cv-1"

    async def bind(cv_id: str):
        assert cv_id == "cv-1"
        calls.append("bind")

    async def spawn(**_kwargs):
        calls.append("spawn")
        return True

    monkeypatch.setattr(modal_integration, "create_cv_analysis_record", create_record)
    monkeypatch.setattr(modal_integration, "spawn_modal_cv_processing", spawn)

    result = await modal_integration.process_cv_async(
        user_id="user-1",
        cv_text="CV de test",
        before_spawn=bind,
    )

    assert result["cv_id"] == "cv-1"
    assert calls == ["create", "bind", "spawn"]


@pytest.mark.asyncio
async def test_cv_bind_failure_prevents_modal_spawn(monkeypatch):
    spawn = AsyncMock(return_value=True)
    mark_failed = AsyncMock()
    monkeypatch.setattr(
        modal_integration,
        "create_cv_analysis_record",
        AsyncMock(return_value="cv-1"),
    )
    monkeypatch.setattr(modal_integration, "spawn_modal_cv_processing", spawn)
    monkeypatch.setattr(modal_integration, "_mark_cv_analysis_failed", mark_failed)

    async def fail_bind(_cv_id: str):
        raise HTTPException(status_code=503, detail="quota unavailable")

    with pytest.raises(HTTPException) as exc_info:
        await modal_integration.process_cv_async(
            user_id="user-1",
            cv_text="CV de test",
            before_spawn=fail_bind,
        )

    assert exc_info.value.status_code == 503
    spawn.assert_not_awaited()
    mark_failed.assert_awaited_once_with("cv-1", "CV processing dispatch failed")


@pytest.mark.asyncio
async def test_cv_spawn_failure_marks_created_record_failed(monkeypatch):
    mark_failed = AsyncMock()
    monkeypatch.setattr(
        modal_integration,
        "create_cv_analysis_record",
        AsyncMock(return_value="cv-2"),
    )
    monkeypatch.setattr(
        modal_integration,
        "spawn_modal_cv_processing",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(modal_integration, "_mark_cv_analysis_failed", mark_failed)

    with pytest.raises(HTTPException) as exc_info:
        await modal_integration.process_cv_async(
            user_id="user-1",
            cv_text="CV de test",
        )

    assert exc_info.value.status_code == 500
    mark_failed.assert_awaited_once_with("cv-2", "CV processing dispatch failed")


def test_recruiter_quota_fails_closed_without_supabase(monkeypatch):
    monkeypatch.setattr(recruiter_finder, "supabase_client", None)

    with pytest.raises(HTTPException) as exc_info:
        recruiter_finder.check_recruiter_search_quota("user-1")

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_recruiter_result_is_not_returned_when_increment_is_rejected(monkeypatch):
    monkeypatch.setattr(recruiter_finder, "get_user_id_from_token", lambda _token: "user-1")
    monkeypatch.setattr(recruiter_finder, "check_recruiter_search_quota", lambda _user_id: None)
    monkeypatch.setattr(recruiter_finder, "increment_recruiter_search_quota", lambda _user_id: False)
    monkeypatch.setattr(
        recruiter_finder,
        "find_recruiters_serpapi",
        AsyncMock(return_value={"company": "ACME", "domain": "", "recruiters": [],
                                "tech_team": [], "all_contacts": [], "total_found": 0}),
    )

    with pytest.raises(HTTPException) as exc_info:
        await recruiter_finder.find_recruiters(
            recruiter_finder.RecruiterFinderRequest(company_name="ACME"),
            "Bearer token",
        )

    assert exc_info.value.status_code == 503
