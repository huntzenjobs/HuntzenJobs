"""Tests du volume de journalisation HTTP applicative."""

from __future__ import annotations

import logging

import pytest
from starlette.requests import Request
from starlette.responses import Response

from src.api.middleware import RequestLoggingMiddleware


@pytest.mark.asyncio
async def test_health_ping_does_not_emit_an_application_access_log(caplog: pytest.LogCaptureFixture) -> None:
    """La sonde infra répétée reste visible dans Railway HTTP sans saturer les logs applicatifs."""
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/health/ping",
            "query_string": b"",
            "headers": [],
            "scheme": "https",
            "server": ("api-staging.huntzenjobs.com", 443),
            "client": ("127.0.0.1", 12345),
        }
    )
    middleware = RequestLoggingMiddleware(app=lambda scope, receive, send: None)

    async def call_next(_: Request) -> Response:
        return Response(status_code=200)

    with caplog.at_level(logging.INFO, logger="src.api.middleware"):
        response = await middleware.dispatch(request, call_next)

    assert response.status_code == 200
    assert "GET /api/health/ping" not in caplog.text
