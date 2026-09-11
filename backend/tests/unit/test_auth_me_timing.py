"""Contrats d'observabilite temporaires pour GET /api/auth/me."""

import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.api.routes import auth
from src.main import app
from src.utils.auth_me_timing import auth_me_timing_enabled


class CacheHitRedis:
    """Faux Redis minimal qui evite tout acces reseau pendant le test."""

    async def incr(self, key: str) -> int:
        return 1

    async def expire(self, key: str, seconds: int) -> bool:
        return True

    async def get(self, key: str) -> str:
        return json.dumps({"success": True, "source": "cache"})


def test_auth_me_emits_anonymous_cache_hit_timings_only_when_enabled(
    monkeypatch,
) -> None:
    """Le chemin authentifie expose des metriques, jamais l'identite du compte."""
    monkeypatch.setenv("AUTH_ME_TIMING_ENABLED", "true")
    monkeypatch.setattr(auth.settings, "environment", "staging")
    redis = CacheHitRedis()

    with (
        patch.object(auth, "get_user_from_token", return_value={"id": "fixture-user"}),
        patch.object(auth, "get_redis", AsyncMock(return_value=redis)),
        TestClient(app) as client,
    ):
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer fixture-token"},
        )

    assert response.json() == {"success": True, "source": "cache"}
    server_timing = response.headers.get("server-timing")
    assert server_timing is not None
    assert "backend-auth;dur=" in server_timing
    assert "backend-rate-limit;dur=" in server_timing
    assert "backend-cache;dur=" in server_timing
    assert 'desc="hit"' in server_timing
    assert "fixture-user" not in server_timing
    assert "fixture-token" not in server_timing


def test_auth_me_timing_refuses_production_even_when_the_flag_is_enabled(
    monkeypatch,
) -> None:
    """Le garde-fou d'environnement interdit toute exposition en production."""
    monkeypatch.setenv("AUTH_ME_TIMING_ENABLED", "true")

    assert auth_me_timing_enabled("production") is False
    assert auth_me_timing_enabled("staging") is True
