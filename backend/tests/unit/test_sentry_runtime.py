"""Contrats de confidentialité et d'initialisation Sentry multi-runtime."""

from __future__ import annotations

import json
import re
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import FastAPI

from src.api.middleware import RequestLoggingMiddleware
from src.config.settings import settings

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_sentry_scrubber_removes_user_content_and_credentials() -> None:
    from src.utils.sentry import scrub_sentry_event

    raw_user_id = "11111111-1111-1111-1111-111111111111"
    event = {
        "user": {
            "id": raw_user_id,
            "email": "personne@example.com",
            "ip_address": "203.0.113.4",
        },
        "request": {
            "url": "https://api.example.test/path?token=secret-token&code=oauth-code",
            "headers": {"authorization": "Bearer secret-token"},
            "data": {"cv_text": "Contenu privé du CV"},
        },
        "extra": {
            "job_description": "Offre confidentielle",
            "nested": {
                "api_key": "provider-secret",
                "apiKey": "camel-provider-secret",
                "accessToken": "camel-access-token",
                "SUPABASE_SERVICE_ROLE_KEY": "service-role-secret",
                "DATABASE_URL": "postgresql://user:password@db.example.test/app",
            },
            "diagnostic": "CV privé 11111111-1111-1111-1111-111111111111 depuis 203.0.113.4",
        },
        "exception": {
            "values": [
                {
                    "type": "RuntimeError",
                    "value": "CV privé 11111111-1111-1111-1111-111111111111 depuis 203.0.113.4",
                    "stacktrace": {
                        "frames": [
                            {
                                "filename": "modal_app.py",
                                "vars": {
                                    "final_cv_text": "CV complet très privé",
                                    "analysis_result": "Analyse confidentielle",
                                },
                            }
                        ]
                    },
                }
            ],
        },
        "breadcrumbs": {
            "values": [
                {
                    "category": "support",
                    "message": "CV privé de la personne 11111111-1111-1111-1111-111111111111",
                }
            ]
        },
        "message": "CV privé envoyé depuis 203.0.113.4",
    }

    scrubbed = scrub_sentry_event(event, {})
    serialized = json.dumps(scrubbed, sort_keys=True)

    assert "personne@example.com" not in serialized
    assert "203.0.113.4" not in serialized
    assert raw_user_id not in serialized
    assert "secret-token" not in serialized
    assert "oauth-code" not in serialized
    assert "Contenu privé du CV" not in serialized
    assert "Offre confidentielle" not in serialized
    assert "provider-secret" not in serialized
    assert "camel-provider-secret" not in serialized
    assert "camel-access-token" not in serialized
    assert "service-role-secret" not in serialized
    assert "postgresql://user:password" not in serialized
    assert "11111111-1111-1111-1111-111111111111" not in serialized
    assert "203.0.113.4" not in serialized
    assert "CV privé" not in serialized
    assert "CV complet très privé" not in serialized
    assert "Analyse confidentielle" not in serialized
    assert scrubbed["request"]["url"] == "https://api.example.test/path"
    assert scrubbed["user"]["id"].startswith("anon-")


def test_sentry_breadcrumb_scrubber_drops_free_form_messages() -> None:
    from src.utils.sentry import scrub_sentry_breadcrumb

    scrubbed = scrub_sentry_breadcrumb(
        {
            "category": "support",
            "message": "Contenu CV 11111111-1111-1111-1111-111111111111 depuis 203.0.113.4",
            "data": {"apiKey": "secret-value"},
        },
        {},
    )
    serialized = json.dumps(scrubbed, sort_keys=True)

    assert "Contenu CV" not in serialized
    assert "11111111-1111-1111-1111-111111111111" not in serialized
    assert "203.0.113.4" not in serialized
    assert "secret-value" not in serialized


def test_initialize_sentry_sets_runtime_release_and_privacy(
    monkeypatch,
) -> None:
    from src.utils import sentry as sentry_runtime

    init = Mock()
    set_tag = Mock()
    monkeypatch.setattr(sentry_runtime.sentry_sdk, "init", init)
    monkeypatch.setattr(sentry_runtime.sentry_sdk, "set_tag", set_tag)
    monkeypatch.setattr(settings, "sentry_dsn", "https://public@example.invalid/1")
    monkeypatch.setattr(settings, "environment", "staging")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc123")

    assert sentry_runtime.initialize_sentry("arq-worker") is True

    options = init.call_args.kwargs
    assert options["environment"] == "staging"
    assert options["release"] == "abc123"
    assert options["send_default_pii"] is False
    assert options["max_request_body_size"] == "never"
    assert options["include_local_variables"] is False
    assert options["before_send"] is sentry_runtime.scrub_sentry_event
    assert options["before_send_transaction"] is sentry_runtime.scrub_sentry_event
    set_tag.assert_any_call("service", "arq-worker")


@pytest.mark.asyncio
async def test_request_middleware_propagates_only_safe_correlation_ids() -> None:
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/probe")
    async def probe() -> dict[str, bool]:
        return {"ok": True}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        kept = await client.get(
            "/probe",
            headers={
                "X-Request-ID": "11111111-1111-4111-8111-111111111111"
            },
        )
        replaced = await client.get(
            "/probe",
            headers={"X-Request-ID": "Bearer-secret/invalid"},
        )
        opaque_secret = await client.get(
            "/probe",
            headers={"X-Request-ID": "supersecrettokenopaque123456"},
        )

    assert kept.headers["X-Request-ID"] == "11111111111141118111111111111111"
    generated = replaced.headers["X-Request-ID"]
    assert re.fullmatch(r"[0-9a-f]{32}", generated)
    assert "secret" not in generated
    assert re.fullmatch(r"[0-9a-f]{32}", opaque_secret.headers["X-Request-ID"])
    assert opaque_secret.headers["X-Request-ID"] != "supersecrettokenopaque123456"


def test_modal_runtime_initializes_sentry_without_logging_remote_content() -> None:
    source = (REPO_ROOT / "scripts/deployment/modal_app.py").read_text(encoding="utf-8")

    assert 'initialize_sentry("modal-cv")' in source
    assert "sentry_sdk.capture_exception" in source
    assert "response.text" not in source
    assert "print(" not in source


@pytest.mark.asyncio
async def test_arq_startup_initializes_sentry_before_database(
    monkeypatch,
) -> None:
    from app import database
    from src.utils import sentry as sentry_runtime
    from src.workers import tasks

    calls: list[str] = []
    initialize_sentry = Mock(side_effect=lambda _service: calls.append("sentry"))
    initialize_database = AsyncMock(side_effect=lambda: calls.append("database"))
    monkeypatch.setattr(sentry_runtime, "initialize_sentry", initialize_sentry)
    monkeypatch.setattr(database, "init_connection_pool_async", initialize_database)

    await tasks.startup({})

    initialize_sentry.assert_called_once_with("arq-worker")
    initialize_database.assert_awaited_once()
    assert calls == ["sentry", "database"]
