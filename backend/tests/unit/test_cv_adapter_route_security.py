"""Régressions d'authentification, de quota et d'ownership des jobs IA."""

import asyncio
import inspect
import json
import logging
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.requests import Request

from src.api import deps
from src.api.routes import cv_adapter, queue
from src.utils import request_dedup
from src.utils.uploads import (
    MAX_UPLOAD_SIZE_BYTES,
    read_upload_limited,
    run_extraction_sync,
)


def _confirmed_factual_reference() -> dict:
    return {
        "personal_info": {
            "name": "Camille Martin",
            "title": "Data Analyst",
            "email": "camille@example.com",
            "phone": "",
            "location": "Paris",
            "linkedin": "",
            "github": "",
            "twitter": "",
            "portfolio": "",
            "driving_license": "",
        },
        "experiences": [
            {
                "title": "Data Analyst",
                "company": "Exemple",
                "location": "Paris",
                "start_date": "2022",
                "end_date": "2024",
                "type": "CDI",
                "bullets": ["Analyse de données"],
            }
        ],
        "education": [],
        "certifications": [],
        "projects": [],
        "skills": {"technical": ["Python"], "tools": [], "soft": [], "languages": []},
        "interests": [],
    }


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


def test_cv_source_review_route_requires_an_authenticated_user_dependency() -> None:
    route = next(
        route
        for route in cv_adapter.router.routes
        if route.path == "/extract-for-review"
    )

    assert "current_user" in inspect.signature(route.endpoint).parameters


def test_structured_review_route_requires_authentication_and_five_per_minute() -> None:
    route = next(
        route
        for route in cv_adapter.router.routes
        if route.path == "/prepare-structured-review"
    )

    assert "current_user" in inspect.signature(route.endpoint).parameters
    limits = cv_adapter.limiter._route_limits[
        "src.api.routes.cv_adapter.prepare_structured_review"
    ]
    assert str(limits[0].limit) == "5 per 1 minute"


@pytest.mark.asyncio
async def test_structured_review_extracts_and_structures_without_user_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cv_text = "Camille Martin\nData Analyst\n" + "Expérience réelle. " * 10
    factual_reference = _confirmed_factual_reference()
    agent = SimpleNamespace(_extract_factual_data=AsyncMock(return_value={**factual_reference, "success": True}))
    reserve_quota = AsyncMock()
    record_quota = AsyncMock()
    monkeypatch.setattr(cv_adapter, "_extract_cv_text_from_file", AsyncMock(return_value=cv_text))
    monkeypatch.setattr(cv_adapter, "get_adapter_agent", lambda: agent)
    monkeypatch.setattr(cv_adapter, "_reserve_quota", reserve_quota)
    monkeypatch.setattr(cv_adapter, "_record_quota_usage", record_quota)
    monkeypatch.setattr(cv_adapter, "_incr_active", AsyncMock(return_value=1))
    monkeypatch.setattr(cv_adapter, "_decr_active", AsyncMock())

    response = await cv_adapter.prepare_structured_review.__wrapped__(
        request=_request("/api/cv-adapter/prepare-structured-review"),
        current_user={"id": "owner-123"},
        file=SimpleNamespace(filename="cv.pdf"),
        language="fr",
    )

    assert response.cv_text == cv_text
    assert response.factual_reference.model_dump() == factual_reference
    agent._extract_factual_data.assert_awaited_once_with(cv_text, "fr")
    reserve_quota.assert_not_awaited()
    record_quota.assert_not_awaited()


@pytest.mark.asyncio
async def test_structured_review_never_logs_cv_or_structured_payload(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    private_marker = "PRIVATE-CV-MARKER-8472"
    cv_text = private_marker + "\n" + "Contenu factuel. " * 10
    result = {**_confirmed_factual_reference(), "success": True}
    result["personal_info"]["name"] = private_marker
    agent = SimpleNamespace(_extract_factual_data=AsyncMock(return_value=result))
    monkeypatch.setattr(cv_adapter, "_extract_cv_text_from_file", AsyncMock(return_value=cv_text))
    monkeypatch.setattr(cv_adapter, "get_adapter_agent", lambda: agent)
    monkeypatch.setattr(cv_adapter, "_incr_active", AsyncMock(return_value=1))
    monkeypatch.setattr(cv_adapter, "_decr_active", AsyncMock())

    with caplog.at_level(logging.INFO):
        await cv_adapter.prepare_structured_review.__wrapped__(
            request=_request("/api/cv-adapter/prepare-structured-review"),
            current_user={"id": "owner-123"},
            file=SimpleNamespace(filename="cv.pdf"),
            language="fr",
        )

    assert private_marker not in caplog.text


@pytest.mark.asyncio
async def test_structured_review_rejects_oversized_text_before_ai_preparation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prepare_reference = AsyncMock()
    monkeypatch.setattr(
        cv_adapter,
        "_extract_cv_text_from_file",
        AsyncMock(return_value="x" * 100_001),
    )
    monkeypatch.setattr(cv_adapter, "_prepare_factual_reference", prepare_reference)

    with pytest.raises(HTTPException) as exc_info:
        await cv_adapter.prepare_structured_review.__wrapped__(
            request=_request("/api/cv-adapter/prepare-structured-review"),
            current_user={"id": "owner-123"},
            file=SimpleNamespace(filename="cv.pdf"),
            language="fr",
        )

    assert exc_info.value.status_code == 413
    prepare_reference.assert_not_awaited()


def test_structured_review_rejects_unsupported_language_before_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    extract = AsyncMock(return_value="CV valide " * 20)
    adapter_agent = Mock(return_value=object())
    prepare_reference = AsyncMock(return_value={"success": False})
    monkeypatch.setattr(cv_adapter, "_extract_cv_text_from_file", extract)
    monkeypatch.setattr(cv_adapter, "get_adapter_agent", adapter_agent)
    monkeypatch.setattr(cv_adapter, "_prepare_factual_reference", prepare_reference)

    assert (
        inspect.signature(cv_adapter.adapt_cv.__wrapped__)
        .parameters["language"]
        .annotation
        is str
    )
    app = FastAPI()
    app.include_router(cv_adapter.router)
    app.dependency_overrides[deps.get_current_user] = lambda: {"id": "owner-123"}

    response = TestClient(app).post(
        "/prepare-structured-review",
        data={"language": "de"},
        files={"file": ("cv.pdf", b"%PDF-test", "application/pdf")},
    )

    assert response.status_code == 422
    extract.assert_not_awaited()
    adapter_agent.assert_not_called()
    prepare_reference.assert_not_awaited()


@pytest.mark.parametrize(
    "mutation",
    [
        lambda data: data.update({"success": True}),
        lambda data: data.update({"huntzen_certified": True}),
        lambda data: data.update({"job_description": "offre injectée"}),
        lambda data: data["personal_info"].update({"unexpected": "interdit"}),
        lambda data: data.pop("projects"),
    ],
)
def test_confirmed_factual_reference_rejects_extra_or_missing_fields(mutation) -> None:
    payload = _confirmed_factual_reference()
    mutation(payload)

    with pytest.raises(ValidationError):
        cv_adapter.ConfirmedFactualReference.model_validate(payload)


def test_confirmed_factual_reference_rejects_json_over_100k() -> None:
    payload = _confirmed_factual_reference()
    payload["experiences"][0]["bullets"] = ["x" * 100_001]

    with pytest.raises(ValidationError, match="100"):
        cv_adapter.ConfirmedFactualReference.model_validate(payload)


def test_confirmed_factual_reference_form_rejects_invalid_json() -> None:
    with pytest.raises(HTTPException) as exc_info:
        cv_adapter._parse_confirmed_factual_reference("{invalid")

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_sync_adaptation_forwards_confirmed_factual_reference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reference = _confirmed_factual_reference()
    agent = SimpleNamespace(run=AsyncMock(return_value={"success": True}))
    monkeypatch.setattr(cv_adapter, "_incr_active", AsyncMock(return_value=1))
    monkeypatch.setattr(cv_adapter, "_decr_active", AsyncMock())

    await cv_adapter._run_cv_adaptation(
        agent,
        cv_text="CV source " * 20,
        job_description="Offre cible " * 20,
        language="fr",
        template="ats",
        user_id="owner-123",
        allow_queue=True,
        confirmed_factual_reference=reference,
    )

    agent.run.assert_awaited_once_with(
        cv_text="CV source " * 20,
        job_description="Offre cible " * 20,
        language="fr",
        template="ats",
        confirmed_factual_reference=reference,
    )


@pytest.mark.asyncio
async def test_queued_adaptation_forwards_confirmed_factual_reference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reference = _confirmed_factual_reference()
    pool = SimpleNamespace(
        enqueue_job=AsyncMock(return_value=SimpleNamespace(job_id="job-123")),
        zcard=AsyncMock(return_value=0),
    )
    monkeypatch.setattr(cv_adapter, "_incr_active", AsyncMock(return_value=99))
    monkeypatch.setattr(cv_adapter, "_decr_active", AsyncMock())
    monkeypatch.setattr(cv_adapter, "_get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(cv_adapter, "store_job_owner", AsyncMock(return_value=True))

    result = await cv_adapter._run_cv_adaptation(
        SimpleNamespace(run=AsyncMock()),
        cv_text="CV source " * 20,
        job_description="Offre cible " * 20,
        language="fr",
        template="ats",
        user_id="owner-123",
        allow_queue=True,
        confirmed_factual_reference=reference,
    )

    assert result["queued"] is True
    assert pool.enqueue_job.await_args.kwargs["confirmed_factual_reference"] == reference


@pytest.mark.asyncio
async def test_adapt_endpoint_validates_and_forwards_confirmed_reference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reference = _confirmed_factual_reference()
    run_adaptation = AsyncMock(
        return_value={
            "success": True,
            "cv_data": reference,
            "source_cv_text": json.dumps(reference),
            "match_score": 80,
            "job_analysis": {},
            "fact_check": {"valid": True},
        }
    )
    monkeypatch.setattr(cv_adapter, "_run_cv_adaptation", run_adaptation)
    monkeypatch.setattr(cv_adapter, "get_adapter_agent", lambda: object())
    monkeypatch.setattr(cv_adapter, "_reserve_quota", AsyncMock(return_value="reservation-123"))
    monkeypatch.setattr(cv_adapter, "_commit_quota_reservation", AsyncMock())
    monkeypatch.setattr(cv_adapter, "_release_quota_reservation", AsyncMock())

    response = await cv_adapter.adapt_cv.__wrapped__(
        request=_request("/api/cv-adapter/adapt"),
        current_user={"id": "owner-123"},
        job_description="Offre de Data Analyst avec missions détaillées et compétences requises.",
        language="fr",
        template="ats",
        cv_text="CV source suffisamment détaillé. " * 5,
        file=None,
        confirmed_factual_reference=json.dumps(reference),
    )

    assert response["success"] is True
    assert run_adaptation.await_args.kwargs["confirmed_factual_reference"] == reference


@pytest.mark.asyncio
async def test_cv_source_review_returns_exact_extracted_text_without_ai_or_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exact_text = "Nom : Camille\nExpérience : Entreprise A\n" + "x" * 100
    extract = AsyncMock(return_value=exact_text)
    reserve_quota = AsyncMock()
    adapter_agent = AsyncMock()
    monkeypatch.setattr(cv_adapter, "_extract_cv_text_from_file", extract)
    monkeypatch.setattr(cv_adapter, "_reserve_quota", reserve_quota)
    monkeypatch.setattr(cv_adapter, "get_adapter_agent", adapter_agent)
    upload = SimpleNamespace(filename="cv.pdf")

    response = await cv_adapter.extract_cv_for_review.__wrapped__(
        request=_request("/api/cv-adapter/extract-for-review"),
        current_user={"id": "owner-123"},
        file=upload,
    )

    assert response.cv_text == exact_text
    extract.assert_awaited_once_with(upload)
    reserve_quota.assert_not_awaited()
    adapter_agent.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [400, 413, 503])
async def test_cv_source_review_propagates_upload_and_capacity_errors(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    monkeypatch.setattr(
        cv_adapter,
        "_extract_cv_text_from_file",
        AsyncMock(side_effect=HTTPException(status_code=status_code, detail="bounded")),
    )

    with pytest.raises(HTTPException) as exc_info:
        await cv_adapter.extract_cv_for_review.__wrapped__(
            request=_request("/api/cv-adapter/extract-for-review"),
            current_user={"id": "owner-123"},
            file=SimpleNamespace(filename="cv.pdf"),
        )

    assert exc_info.value.status_code == status_code


@pytest.mark.asyncio
async def test_cv_source_review_rejects_oversized_text_without_truncating(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    oversized_text = "x" * 100_001
    monkeypatch.setattr(
        cv_adapter,
        "_extract_cv_text_from_file",
        AsyncMock(return_value=oversized_text),
    )

    with pytest.raises(HTTPException) as exc_info:
        await cv_adapter.extract_cv_for_review.__wrapped__(
            request=_request("/api/cv-adapter/extract-for-review"),
            current_user={"id": "owner-123"},
            file=SimpleNamespace(filename="cv.pdf"),
        )

    assert exc_info.value.status_code == 413
    assert exc_info.value.detail == "CV text exceeds the supported size"


def test_cover_letter_request_rejects_oversized_llm_payloads() -> None:
    with pytest.raises(ValidationError):
        cv_adapter.CoverLetterRequest(
            cv_data={"summary": "Profil"},
            job_description="Offre valide " * 20,
            source_cv_text="x" * 100_001,
        )
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
