"""Régressions d'authentification, de quota et d'ownership des jobs IA."""

import asyncio
import inspect
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from src.api.routes import cv_adapter, queue
from src.utils import request_dedup
from src.utils.uploads import (
    MAX_UPLOAD_SIZE_BYTES,
    read_upload_limited,
    run_extraction_sync,
)


def _request(path: str = "/api/cv-adapter/generate-cover-letter/json") -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )


def test_paid_cv_routes_require_an_authenticated_user_dependency() -> None:
    protected_paths = {
        "/adapt",
        "/adapt/pdf",
        "/adapt/upload",
        "/quick-adapt",
        "/generate-pdf",
        "/generate-cover-letter",
        "/generate-cover-letter/json",
        "/generate-cover-letter/pdf-from-data",
    }
    routes = {
        route.path: route.endpoint
        for route in cv_adapter.router.routes
        if route.path in protected_paths
    }

    assert set(routes) == protected_paths
    for endpoint in routes.values():
        assert "current_user" in inspect.signature(endpoint).parameters


def test_cover_letter_request_rejects_oversized_llm_payloads() -> None:
    with pytest.raises(ValidationError):
        cv_adapter.CoverLetterRequest(
            cv_data={"summary": "x" * 120_000},
            job_description="Offre valide " * 20,
        )

    with pytest.raises(ValidationError):
        cv_adapter.CoverLetterRequest(
            cv_data={"summary": "Profil"},
            job_description="x" * 30_001,
        )


@pytest.mark.asyncio
async def test_failed_cover_letter_does_not_consume_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = SimpleNamespace(
        generate_cover_letter=AsyncMock(
            return_value={"success": False, "error": "fact-check unavailable"}
        )
    )
    reserve_quota = AsyncMock(return_value="reservation-123")
    commit_reservation = AsyncMock()
    release_reservation = AsyncMock()
    monkeypatch.setattr(cv_adapter, "get_adapter_agent", lambda: agent)
    monkeypatch.setattr(cv_adapter, "_require_feature_flag_sync", lambda *_args: None)
    monkeypatch.setattr(cv_adapter, "_reserve_quota", reserve_quota)
    monkeypatch.setattr(
        cv_adapter,
        "_commit_quota_reservation",
        commit_reservation,
    )
    monkeypatch.setattr(
        cv_adapter,
        "_release_quota_reservation",
        release_reservation,
    )
    monkeypatch.setattr(cv_adapter, "_incr_active", AsyncMock(return_value=1))
    monkeypatch.setattr(cv_adapter, "_decr_active", AsyncMock())

    with pytest.raises(HTTPException, match="fact-check unavailable"):
        await cv_adapter.generate_cover_letter_json.__wrapped__(
            request=_request(),
            data=cv_adapter.CoverLetterRequest(
                cv_data={"personal_info": {"name": "Camille"}},
                job_description="Offre Data Analyst suffisamment détaillée pour le test.",
            ),
            current_user={"id": "owner-123", "email": "camille@example.com"},
        )

    reserve_quota.assert_awaited_once_with("owner-123", "cover_letter")
    commit_reservation.assert_not_awaited()
    release_reservation.assert_awaited_once_with("reservation-123")


@pytest.mark.asyncio
async def test_job_owner_is_stored_and_enforced_during_polling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis = AsyncMock()
    monkeypatch.setattr(request_dedup, "get_redis", AsyncMock(return_value=redis))

    await request_dedup.store_job_owner("job-123", "owner-123")
    redis.set.assert_awaited_once()

    monkeypatch.setattr(queue, "get_job_owner", AsyncMock(return_value="owner-123"))
    with pytest.raises(HTTPException) as exc_info:
        await queue.get_status("job-123", current_user={"id": "other-user"})

    assert exc_info.value.status_code == 404
    queue.get_job_owner.assert_awaited_once_with("job-123")


@pytest.mark.asyncio
async def test_upload_reader_never_requests_more_than_the_bounded_window() -> None:
    upload = SimpleNamespace(
        read=AsyncMock(return_value=b"x" * (MAX_UPLOAD_SIZE_BYTES + 1))
    )

    with pytest.raises(HTTPException) as exc_info:
        await read_upload_limited(upload)

    assert exc_info.value.status_code == 413
    upload.read.assert_awaited_once_with(MAX_UPLOAD_SIZE_BYTES + 1)


@pytest.mark.asyncio
async def test_cv_adaptation_rejects_when_queue_cannot_absorb_peak(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Au-dessus du plafond, l'API ne doit jamais retomber sur un appel LLM sync."""
    agent = SimpleNamespace(run=AsyncMock())
    monkeypatch.setattr(cv_adapter, "_incr_active", AsyncMock(return_value=99))
    monkeypatch.setattr(cv_adapter, "_decr_active", AsyncMock())
    monkeypatch.setattr(cv_adapter, "_get_arq_pool", AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as exc_info:
        await cv_adapter._run_cv_adaptation(
            agent,
            cv_text="CV valide " * 20,
            job_description="Offre valide " * 20,
            language="fr",
            template="ats",
            user_id="owner-123",
            allow_queue=True,
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.headers == {"Retry-After": "5"}
    agent.run.assert_not_awaited()


@pytest.mark.asyncio
async def test_cv_adaptation_times_out_before_the_activity_lease(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def never_finishes(**_kwargs):
        import asyncio

        await asyncio.Future()

    agent = SimpleNamespace(run=never_finishes)
    monkeypatch.setattr(cv_adapter, "_incr_active", AsyncMock(return_value=1))
    monkeypatch.setattr(cv_adapter, "_decr_active", AsyncMock())
    monkeypatch.setattr(cv_adapter, "CV_ADAPT_SYNC_TIMEOUT_SECONDS", 0.01)

    with pytest.raises(HTTPException) as exc_info:
        await cv_adapter._run_cv_adaptation(
            agent,
            cv_text="CV valide " * 20,
            job_description="Offre valide " * 20,
            language="fr",
            template="ats",
            user_id="owner-123",
            allow_queue=True,
        )

    assert exc_info.value.status_code == 504


@pytest.mark.asyncio
async def test_cv_adaptation_fails_closed_when_capacity_store_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = SimpleNamespace(run=AsyncMock())
    monkeypatch.setattr(
        cv_adapter,
        "_incr_active",
        AsyncMock(side_effect=RuntimeError("redis unavailable")),
    )

    with pytest.raises(HTTPException) as exc_info:
        await cv_adapter._run_cv_adaptation(
            agent,
            cv_text="CV valide " * 20,
            job_description="Offre valide " * 20,
            language="fr",
            template="ats",
            user_id="owner-123",
            allow_queue=True,
        )

    assert exc_info.value.status_code == 503
    agent.run.assert_not_awaited()


@pytest.mark.asyncio
async def test_cv_extraction_rejects_before_reading_when_capacity_is_full(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upload = SimpleNamespace(
        filename="cv.pdf",
        read=AsyncMock(return_value=b"%PDF"),
    )
    monkeypatch.setattr(
        cv_adapter,
        "_incr_extraction_active",
        AsyncMock(return_value=cv_adapter.CV_EXTRACTION_SYNC_THRESHOLD + 1),
        raising=False,
    )
    monkeypatch.setattr(
        cv_adapter,
        "_decr_extraction_active",
        AsyncMock(),
        raising=False,
    )

    with pytest.raises(HTTPException) as exc_info:
        await cv_adapter._extract_cv_text_from_file(upload)

    assert exc_info.value.status_code == 503
    upload.read.assert_not_awaited()


@pytest.mark.asyncio
async def test_queue_wait_estimate_uses_real_arq_depth() -> None:
    pool = SimpleNamespace(zcard=AsyncMock(return_value=51))

    estimate = await request_dedup.estimate_arq_wait_seconds(pool, 13)

    assert estimate == 11 * 120


@pytest.mark.asyncio
async def test_sync_extraction_keeps_the_event_loop_responsive() -> None:
    started = threading.Event()
    release = threading.Event()
    event_loop_progressed = asyncio.Event()

    def blocking_parser() -> str:
        started.set()
        release.wait(timeout=1)
        return "texte extrait"

    async def mark_progress() -> None:
        await asyncio.sleep(0)
        event_loop_progressed.set()

    extraction = asyncio.create_task(run_extraction_sync(blocking_parser))
    await asyncio.to_thread(started.wait, 1)
    progress = asyncio.create_task(mark_progress())
    await asyncio.wait_for(event_loop_progressed.wait(), timeout=0.2)
    release.set()

    assert await extraction == "texte extrait"
    await progress


def test_docx_decompression_bomb_is_rejected_before_parsing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    oversized_member = SimpleNamespace(
        file_size=cv_adapter.MAX_DOCX_UNCOMPRESSED_BYTES + 1,
        compress_size=1,
    )

    class FakeArchive:
        def __enter__(self) -> "FakeArchive":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def infolist(self) -> list[SimpleNamespace]:
            return [oversized_member]

    monkeypatch.setattr(
        cv_adapter.zipfile,
        "ZipFile",
        lambda *_args, **_kwargs: FakeArchive(),
        raising=False,
    )

    with pytest.raises(ValueError, match="décompressée"):
        cv_adapter._extract_docx_text_sync(b"docx")
