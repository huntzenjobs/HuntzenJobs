"""Garanties de confidentialité du pipeline CV Supabase/Modal."""

import base64
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

# Le runtime de test minimal du dépôt n'installe pas structlog. Le comportement
# du logger n'appartient pas au contrat testé ici.
sys.modules.setdefault("structlog", SimpleNamespace(get_logger=lambda _name: Mock()))
sys.modules.setdefault(
    "supabase",
    SimpleNamespace(Client=object, create_client=Mock()),
)

from src import modal_integration  # noqa: E402
from src.services import modal_pdf_extractor  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_analysis_normalization_recomputes_inconsistent_ats_total() -> None:
    """Le total ATS doit rester la somme des cinq catégories pondérées."""
    result = modal_integration._normalize_analysis_result(
        {
            "ats_score": 23,
            "ats_details": {
                "format_score": 19,
                "keywords_score": 28,
                "experience_score": 23,
                "skills_score": 14,
                "education_score": 9,
            },
        }
    )

    assert result["ats_score"] == {
        "overall_score": 93,
        "formatting_score": 95,
        "formatting_explanation": None,
        "keywords_score": 93,
        "keywords_explanation": None,
        "structure_score": 92,
        "structure_explanation": None,
        "readability_score": 93,
        "readability_explanation": None,
    }


class _ModalImage:
    def apt_install(self, *_args: str) -> "_ModalImage":
        return self

    def pip_install(self, *_args: str) -> "_ModalImage":
        return self

    def add_local_dir(self, *_args: object) -> "_ModalImage":
        return self

    def run_function(self, *_args: object) -> "_ModalImage":
        return self


class _ModalApp:
    def __init__(self, name: str) -> None:
        self.name = name

    def function(self, **_kwargs: object):
        return lambda function: function


def _load_modal_cv_app(monkeypatch: pytest.MonkeyPatch):
    modal_stub = SimpleNamespace(
        App=_ModalApp,
        Image=SimpleNamespace(debian_slim=lambda **_kwargs: _ModalImage()),
        Secret=SimpleNamespace(from_name=lambda _name: object()),
        fastapi_endpoint=lambda **_kwargs: (lambda function: function),
    )
    monkeypatch.setitem(sys.modules, "modal", modal_stub)
    module_path = REPO_ROOT / "scripts/deployment/modal_app.py"
    spec = importlib.util.spec_from_file_location("modal_cv_app_under_test", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load_modal_pdf_app(monkeypatch: pytest.MonkeyPatch):
    modal_stub = SimpleNamespace(
        App=_ModalApp,
        Image=SimpleNamespace(debian_slim=lambda **_kwargs: _ModalImage()),
        fastapi_endpoint=lambda **_kwargs: (lambda function: function),
    )
    monkeypatch.setitem(sys.modules, "modal", modal_stub)
    module_path = REPO_ROOT / "backend/modal_pdf_extractor_app.py"
    spec = importlib.util.spec_from_file_location("modal_pdf_app_under_test", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("environment", "expected_name"),
    [
        ("staging", "huntzen-cv-processor"),
        ("main", "huntzen-cv-processor"),
        (None, "huntzen-cv-processor"),
    ],
)
def test_modal_cv_app_keeps_stable_name_across_environments(
    monkeypatch: pytest.MonkeyPatch,
    environment: str | None,
    expected_name: str,
) -> None:
    if environment is None:
        monkeypatch.delenv("MODAL_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("MODAL_ENVIRONMENT", environment)

    modal_app = _load_modal_cv_app(monkeypatch)

    assert modal_app.app.name == expected_name


def _install_failing_docling(
    monkeypatch: pytest.MonkeyPatch,
    failure: Exception,
) -> None:
    converter = SimpleNamespace(convert=Mock(side_effect=failure))
    monkeypatch.setitem(
        sys.modules,
        "docling.datamodel.base_models",
        SimpleNamespace(InputFormat=SimpleNamespace(PDF="pdf")),
    )
    monkeypatch.setitem(
        sys.modules,
        "docling.datamodel.pipeline_options",
        SimpleNamespace(PdfPipelineOptions=lambda **_kwargs: object()),
    )
    monkeypatch.setitem(
        sys.modules,
        "docling.document_converter",
        SimpleNamespace(
            DocumentConverter=lambda **_kwargs: converter,
            PdfFormatOption=lambda **_kwargs: object(),
        ),
    )


def _install_empty_docling(monkeypatch: pytest.MonkeyPatch) -> None:
    document = SimpleNamespace(export_to_markdown=lambda: "")
    converter = SimpleNamespace(convert=Mock(return_value=SimpleNamespace(document=document)))
    monkeypatch.setitem(
        sys.modules,
        "docling.datamodel.base_models",
        SimpleNamespace(InputFormat=SimpleNamespace(PDF="pdf")),
    )
    monkeypatch.setitem(
        sys.modules,
        "docling.datamodel.pipeline_options",
        SimpleNamespace(PdfPipelineOptions=lambda **_kwargs: object()),
    )
    monkeypatch.setitem(
        sys.modules,
        "docling.document_converter",
        SimpleNamespace(
            DocumentConverter=lambda **_kwargs: converter,
            PdfFormatOption=lambda **_kwargs: object(),
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "pypdf",
        SimpleNamespace(PdfReader=Mock(side_effect=ValueError("no text layer"))),
    )


class _PrivateBucket:
    def __init__(self) -> None:
        self.uploaded_path: str | None = None
        self.signed_path: str | None = None
        self.signed_ttl: int | None = None

    def upload(self, *, path: str, file: bytes, file_options: dict[str, str]) -> None:
        assert file == b"pdf"
        assert file_options == {"content-type": "application/pdf"}
        self.uploaded_path = path

    def get_public_url(self, _path: str) -> str:
        raise AssertionError("Un CV privé ne doit jamais produire d'URL publique")

    def create_signed_url(self, path: str, expires_in: int) -> dict[str, str]:
        self.signed_path = path
        self.signed_ttl = expires_in
        return {"signedURL": "https://staging.supabase.co/storage/v1/object/sign/cvs/private"}


class _Storage:
    def __init__(self, bucket: _PrivateBucket) -> None:
        self.bucket = bucket

    def from_(self, bucket_name: str) -> _PrivateBucket:
        assert bucket_name == "cvs"
        return self.bucket


@pytest.mark.asyncio
async def test_upload_cv_returns_private_object_path(monkeypatch: pytest.MonkeyPatch) -> None:
    bucket = _PrivateBucket()
    monkeypatch.setattr(
        modal_integration,
        "supabase_client",
        SimpleNamespace(storage=_Storage(bucket)),
    )
    monkeypatch.setattr(modal_integration.uuid, "uuid4", lambda: "object-id")

    object_path = await modal_integration.upload_cv_to_storage(
        file_content=b"pdf",
        filename="cv.pdf",
        user_id="user-id",
    )

    assert object_path == "user-id/object-id.pdf"
    assert bucket.uploaded_path == object_path


def test_signed_cv_url_is_short_lived(monkeypatch: pytest.MonkeyPatch) -> None:
    bucket = _PrivateBucket()
    monkeypatch.setattr(
        modal_integration,
        "supabase_client",
        SimpleNamespace(storage=_Storage(bucket)),
    )

    signed_url = modal_integration.create_private_cv_download_url("user-id/object-id.pdf")

    assert signed_url.endswith("/private")
    assert bucket.signed_path == "user-id/object-id.pdf"
    assert bucket.signed_ttl == 600


@pytest.mark.asyncio
async def test_processing_persists_path_but_sends_only_signed_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    create_record = AsyncMock(return_value="cv-id")
    spawn_modal = AsyncMock(return_value=True)
    monkeypatch.setattr(
        modal_integration,
        "upload_cv_to_storage",
        AsyncMock(return_value="user-id/object-id.pdf"),
    )
    monkeypatch.setattr(
        modal_integration,
        "create_private_cv_download_url",
        lambda _path: "https://staging.supabase.co/signed-cv",
    )
    monkeypatch.setattr(modal_integration, "create_cv_analysis_record", create_record)
    monkeypatch.setattr(modal_integration, "spawn_modal_cv_processing", spawn_modal)

    result = await modal_integration.process_cv_async(
        user_id="user-id",
        file=SimpleNamespace(filename="cv.pdf", read=AsyncMock(return_value=b"pdf")),
    )

    assert result["cv_id"] == "cv-id"
    assert create_record.await_args.kwargs["pdf_url"] == "user-id/object-id.pdf"
    assert spawn_modal.await_args.kwargs["pdf_url"] == "https://staging.supabase.co/signed-cv"


@pytest.mark.asyncio
async def test_cv_status_requires_authenticated_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(modal_integration, "supabase_client", SimpleNamespace())

    with pytest.raises(HTTPException) as error:
        await modal_integration.get_cv_analysis_status("cv-id")

    assert error.value.status_code == 401


def test_modal_requires_explicit_complete_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(modal_integration, "MODAL_WEBHOOK_URL", "https://modal.example/run")
    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_ID", "")
    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_SECRET", "")
    monkeypatch.setattr(modal_integration, "MODAL_ENABLED_SETTING", True)

    assert modal_integration.is_modal_enabled() is False

    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_ID", "wk-test")
    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_SECRET", "ws-test")
    assert modal_integration.is_modal_enabled() is True


@pytest.mark.asyncio
async def test_modal_cv_request_uses_proxy_auth_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = SimpleNamespace(status_code=200, text="", json=lambda: {"success": True})
    post = AsyncMock(return_value=response)

    class _ClientContext:
        async def __aenter__(self) -> SimpleNamespace:
            return SimpleNamespace(post=post)

        async def __aexit__(self, *_args: object) -> None:
            return None

    monkeypatch.setattr(modal_integration, "MODAL_WEBHOOK_URL", "https://modal.example/run")
    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_ID", "wk-test")
    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_SECRET", "ws-test")
    monkeypatch.setattr(modal_integration, "MODAL_ENABLED_SETTING", True)
    monkeypatch.setattr(
        modal_integration.httpx,
        "AsyncClient",
        lambda **_kwargs: _ClientContext(),
    )

    assert await modal_integration.spawn_modal_cv_processing(
        cv_id="0f644336-c7a9-4d0e-a971-717e0d9e32e6",
        user_id="e2eb2ae1-ad64-45b8-ad79-e9a4410f9cf8",
        cv_text="contenu du CV suffisamment long",
    )
    assert post.await_args.kwargs["headers"] == {
        "Modal-Key": "wk-test",
        "Modal-Secret": "ws-test",
    }


@pytest.mark.asyncio
async def test_modal_cv_timeout_persists_failed_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _ClientContext:
        async def __aenter__(self) -> SimpleNamespace:
            return SimpleNamespace(
                post=AsyncMock(side_effect=modal_integration.httpx.TimeoutException("timeout"))
            )

        async def __aexit__(self, *_args: object) -> None:
            return None

    class _UpdateQuery:
        def __init__(self) -> None:
            self.payload: dict[str, str] = {}

        def update(self, payload: dict[str, str]) -> "_UpdateQuery":
            self.payload = payload
            return self

        def eq(self, _column: str, _value: str) -> "_UpdateQuery":
            return self

        def execute(self) -> SimpleNamespace:
            return SimpleNamespace(data=[])

    query = _UpdateQuery()
    monkeypatch.setattr(modal_integration, "MODAL_WEBHOOK_URL", "https://modal.example/run")
    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_ID", "wk-test")
    monkeypatch.setattr(modal_integration, "MODAL_PROXY_TOKEN_SECRET", "ws-test")
    monkeypatch.setattr(modal_integration, "MODAL_ENABLED_SETTING", True)
    monkeypatch.setattr(
        modal_integration.httpx,
        "AsyncClient",
        lambda **_kwargs: _ClientContext(),
    )
    monkeypatch.setattr(
        modal_integration,
        "supabase_client",
        SimpleNamespace(table=lambda _name: query),
    )

    triggered = await modal_integration.spawn_modal_cv_processing(
        cv_id="0f644336-c7a9-4d0e-a971-717e0d9e32e6",
        user_id="e2eb2ae1-ad64-45b8-ad79-e9a4410f9cf8",
        cv_text="contenu du CV suffisamment long",
    )

    assert triggered is False
    assert query.payload["status"] == "failed"
    assert query.payload["error_message"] == "Modal webhook timeout"


def test_modal_web_endpoints_require_proxy_auth() -> None:
    for relative_path in (
        "scripts/deployment/modal_app.py",
        "backend/modal_pdf_extractor_app.py",
    ):
        source = (REPO_ROOT / relative_path).read_text(encoding="utf-8")
        assert "@modal.fastapi_endpoint(method=\"POST\", requires_proxy_auth=True)" in source


def test_modal_pdf_extractor_has_no_implicit_production_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(modal_pdf_extractor, "MODAL_PDF_EXTRACT_URL", "")
    monkeypatch.setattr(modal_pdf_extractor, "MODAL_PROXY_TOKEN_ID", "")
    monkeypatch.setattr(modal_pdf_extractor, "MODAL_PROXY_TOKEN_SECRET", "")
    monkeypatch.setattr(modal_pdf_extractor, "MODAL_ENABLED_SETTING", True)

    assert modal_pdf_extractor.is_modal_pdf_enabled() is False


def test_modal_cv_payload_rejects_external_download_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        modal_integration,
        "SUPABASE_URL",
        "https://cxkpbciubsvopgxakgbj.supabase.co",
    )

    with pytest.raises(ValueError, match="signed Supabase CV URL"):
        modal_integration.validate_modal_cv_payload(
            cv_id="0f644336-c7a9-4d0e-a971-717e0d9e32e6",
            user_id="e2eb2ae1-ad64-45b8-ad79-e9a4410f9cf8",
            pdf_url="https://attacker.example/cv.pdf",
            cv_text=None,
            language="fr",
        )


def test_modal_cv_webhook_uses_strict_request_model() -> None:
    source = (REPO_ROOT / "scripts/deployment/modal_app.py").read_text(encoding="utf-8")

    assert "class CVProcessRequest(BaseModel):" in source
    assert 'model_config = ConfigDict(extra="forbid")' in source
    assert "async def process_cv_webhook(request_body: CVProcessRequest)" in source


@pytest.mark.asyncio
async def test_modal_cv_webhook_reports_spawn_failure_as_http_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_app = _load_modal_cv_app(monkeypatch)
    async_spawn = AsyncMock(side_effect=RuntimeError("spawn failed"))
    monkeypatch.setattr(
        modal_app,
        "process_cv_analysis",
        SimpleNamespace(spawn=SimpleNamespace(aio=async_spawn)),
    )
    request = modal_app.CVProcessRequest(
        cv_id="0f644336-c7a9-4d0e-a971-717e0d9e32e6",
        user_id="e2eb2ae1-ad64-45b8-ad79-e9a4410f9cf8",
        cv_text="contenu du CV suffisamment long pour lancer une analyse",
    )

    with pytest.raises(HTTPException) as error:
        await modal_app.process_cv_webhook(request)

    assert error.value.status_code == 500
    assert async_spawn.await_count == 1


@pytest.mark.asyncio
async def test_modal_cv_webhook_uses_async_spawn_interface(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_app = _load_modal_cv_app(monkeypatch)
    async_spawn = AsyncMock()
    monkeypatch.setattr(
        modal_app,
        "process_cv_analysis",
        SimpleNamespace(spawn=SimpleNamespace(aio=async_spawn)),
    )
    request = modal_app.CVProcessRequest(
        cv_id="0f644336-c7a9-4d0e-a971-717e0d9e32e6",
        user_id="e2eb2ae1-ad64-45b8-ad79-e9a4410f9cf8",
        cv_text="contenu du CV suffisamment long pour lancer une analyse",
    )

    response = await modal_app.process_cv_webhook(request)

    assert response == {
        "success": True,
        "cv_id": "0f644336-c7a9-4d0e-a971-717e0d9e32e6",
    }
    assert async_spawn.await_count == 1


@pytest.mark.asyncio
async def test_modal_pdf_webhook_reports_invalid_base64_as_http_422(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_pdf_app = _load_modal_pdf_app(monkeypatch)
    request = modal_pdf_app.PDFExtractRequest(pdf_bytes="not-valid-base64")

    with pytest.raises(HTTPException) as error:
        await modal_pdf_app.extract_pdf_text(request)

    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_modal_pdf_webhook_reports_oversized_pdf_as_http_413(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_pdf_app = _load_modal_pdf_app(monkeypatch)
    oversized_pdf = base64.b64encode(b"x" * (10 * 1024 * 1024 + 1)).decode()
    request = modal_pdf_app.PDFExtractRequest(pdf_bytes=oversized_pdf)

    with pytest.raises(HTTPException) as error:
        await modal_pdf_app.extract_pdf_text(request)

    assert error.value.status_code == 413


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "expected_status"),
    [
        (ValueError("not a valid PDF"), 422),
        (RuntimeError("converter unavailable"), 500),
    ],
)
async def test_modal_pdf_webhook_maps_extraction_failures_to_http_status(
    monkeypatch: pytest.MonkeyPatch,
    failure: Exception,
    expected_status: int,
) -> None:
    modal_pdf_app = _load_modal_pdf_app(monkeypatch)
    _install_failing_docling(monkeypatch, failure)
    request = modal_pdf_app.PDFExtractRequest(
        pdf_bytes=base64.b64encode(b"%PDF-1.4\nsynthetic").decode(),
    )

    with pytest.raises(HTTPException) as error:
        await modal_pdf_app.extract_pdf_text(request)

    assert error.value.status_code == expected_status


@pytest.mark.asyncio
async def test_modal_pdf_webhook_reports_empty_extraction_as_http_422(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_pdf_app = _load_modal_pdf_app(monkeypatch)
    _install_empty_docling(monkeypatch)
    request = modal_pdf_app.PDFExtractRequest(
        pdf_bytes=base64.b64encode(b"%PDF-1.4\nsynthetic").decode(),
    )

    with pytest.raises(HTTPException) as error:
        await modal_pdf_app.extract_pdf_text(request)

    assert error.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "result", "error_message"),
    [
        ("processing", None, None),
        ("completed", {"score": 80}, None),
        ("failed", None, "analyse impossible"),
    ],
)
async def test_modal_cv_status_updates_are_scoped_to_the_owner(
    monkeypatch: pytest.MonkeyPatch,
    status: str,
    result: dict[str, int] | None,
    error_message: str | None,
) -> None:
    modal_app = _load_modal_cv_app(monkeypatch)

    class _Cursor:
        def __init__(self) -> None:
            self.query = ""
            self.params: tuple[object, ...] = ()

        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def execute(self, query: str, params: tuple[object, ...]) -> None:
            self.query = query
            self.params = params

        def fetchone(self):
            return ("cv-id",)

    cursor = _Cursor()
    connection = SimpleNamespace(
        cursor=lambda: cursor,
        commit=Mock(),
        close=Mock(),
    )
    monkeypatch.setattr(modal_app, "get_db_connection", lambda: connection)
    monkeypatch.setattr(modal_app, "notify_fastapi_callback", AsyncMock(return_value=True))

    updated = await modal_app.update_cv_status(
        "cv-id",
        "owner-id",
        status,
        result=result,
        error_message=error_message,
    )

    assert updated is True
    assert "WHERE id = %s AND user_id = %s" in cursor.query
    assert cursor.params[-2:] == ("cv-id", "owner-id")


def test_modal_rejects_cv_owned_by_another_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_app = _load_modal_cv_app(monkeypatch)

    class _Cursor:
        def __init__(self) -> None:
            self.query = ""
            self.params: tuple[str, str] = ("", "")

        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def execute(self, query: str, params: tuple[str, str]) -> None:
            self.query = query
            self.params = params

        def fetchone(self):
            return None

    cursor = _Cursor()
    connection = SimpleNamespace(cursor=lambda: cursor, close=Mock())
    monkeypatch.setattr(modal_app, "get_db_connection", lambda: connection)

    assert modal_app.cv_belongs_to_user("cv-id", "attacker-id") is False
    assert "WHERE id = %s AND user_id = %s" in cursor.query
    assert cursor.params == ("cv-id", "attacker-id")


@pytest.mark.asyncio
async def test_modal_processing_fails_when_final_status_cannot_be_persisted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_app = _load_modal_cv_app(monkeypatch)
    run = AsyncMock(return_value={"score": 80})
    monkeypatch.setattr(modal_app, "claim_cv_analysis", lambda *_args: "claimed")
    monkeypatch.setattr(
        modal_app,
        "update_cv_status",
        AsyncMock(side_effect=[True, False, True]),
    )
    monkeypatch.setattr(
        sys.modules["src.agents.cv_analyzer.main_agent"],
        "CVAnalyzerAgent",
        lambda: SimpleNamespace(run=run),
    )

    response = await modal_app.process_cv_analysis(
        cv_id="cv-id",
        user_id="owner-id",
        cv_text="contenu du CV suffisamment long pour lancer une analyse complète",
    )

    assert response["success"] is False
    assert "final status persistence failed" in response["error"]


@pytest.mark.asyncio
async def test_modal_processing_marks_agent_rejection_as_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_app = _load_modal_cv_app(monkeypatch)
    rejection = {
        "success": False,
        "error": "Document non reconnu comme CV",
        "ats_score": 0,
    }
    run = AsyncMock(return_value=rejection)
    update_status = AsyncMock(return_value=True)
    monkeypatch.setattr(modal_app, "claim_cv_analysis", lambda *_args: "claimed")
    monkeypatch.setattr(modal_app, "update_cv_status", update_status)
    monkeypatch.setattr(
        sys.modules["src.agents.cv_analyzer.main_agent"],
        "CVAnalyzerAgent",
        lambda: SimpleNamespace(run=run),
    )

    response = await modal_app.process_cv_analysis(
        cv_id="cv-id",
        user_id="owner-id",
        cv_text="contenu trop pauvre mais assez long pour atteindre l'agent CV",
    )

    assert response["success"] is False
    assert "Document non reconnu comme CV" in response["error"]
    assert update_status.await_args_list[-1].args[2] == "failed"
    assert update_status.await_args_list[-1].kwargs["error_message"]
    assert all(call.args[2] != "completed" for call in update_status.await_args_list)


@pytest.mark.asyncio
async def test_modal_processing_returns_existing_completed_job_without_replay(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    modal_app = _load_modal_cv_app(monkeypatch)
    fetch_results = iter((None, ("completed",)))

    class _Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def execute(self, _query: str, _params: tuple[str, str]) -> None:
            return None

        def fetchone(self):
            return next(fetch_results)

    connection = SimpleNamespace(
        cursor=lambda: _Cursor(),
        commit=Mock(),
        close=Mock(),
    )
    monkeypatch.setattr(modal_app, "get_db_connection", lambda: connection)

    response = await modal_app.process_cv_analysis(
        cv_id="cv-id",
        user_id="owner-id",
        cv_text="contenu du CV suffisamment long pour lancer une analyse complète",
    )

    assert response == {
        "success": True,
        "cv_id": "cv-id",
        "already_processed": True,
    }


def test_modal_pdf_webhook_uses_strict_bounded_request_model() -> None:
    source = (REPO_ROOT / "backend/modal_pdf_extractor_app.py").read_text(
        encoding="utf-8"
    )

    assert "class PDFExtractRequest(BaseModel):" in source
    assert 'model_config = ConfigDict(extra="forbid")' in source
    assert "async def extract_pdf_text(body: PDFExtractRequest)" in source
    assert "max_containers=10" in source
