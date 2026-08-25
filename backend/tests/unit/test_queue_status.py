from types import SimpleNamespace

import arq
import arq.jobs
import pytest
from arq.jobs import JobStatus
from fastapi import HTTPException

from src.api.routes.queue import get_status


class FakeJob:
    status_value = JobStatus.queued
    result_value = None

    def __init__(self, job_id: str, pool: object) -> None:
        self.job_id = job_id
        self.pool = pool

    async def status(self) -> JobStatus:
        return self.status_value

    async def result_info(self) -> object:
        return self.result_value


@pytest.fixture(autouse=True)
def mock_arq(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_create_pool(settings: object) -> object:
        return object()

    monkeypatch.setattr(arq, "create_pool", fake_create_pool)
    monkeypatch.setattr(arq.jobs, "Job", FakeJob)
    FakeJob.status_value = JobStatus.queued
    FakeJob.result_value = None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("arq_status", "expected"),
    [
        (JobStatus.queued, "queued"),
        (JobStatus.deferred, "queued"),
        (JobStatus.in_progress, "processing"),
    ],
)
async def test_get_status_maps_non_final_arq_states(
    arq_status: JobStatus,
    expected: str,
) -> None:
    FakeJob.status_value = arq_status

    assert await get_status("job-123") == {"status": expected}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("success", "expected"),
    [
        (True, {"status": "completed", "result": {"success": True}}),
        (False, {"status": "failed", "error": "provider timeout"}),
    ],
)
async def test_get_status_reads_result_only_after_completion(
    success: bool,
    expected: dict,
) -> None:
    FakeJob.status_value = JobStatus.complete
    FakeJob.result_value = SimpleNamespace(
        success=success,
        result={"success": True} if success else "provider timeout",
    )

    assert await get_status("job-123") == expected


@pytest.mark.asyncio
async def test_get_status_returns_404_for_unknown_job() -> None:
    FakeJob.status_value = JobStatus.not_found

    with pytest.raises(HTTPException) as error:
        await get_status("missing-job")

    assert error.value.status_code == 404
