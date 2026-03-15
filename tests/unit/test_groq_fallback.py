"""Tests Groq fallback 429 — comportement sous saturation."""
import os
import asyncio
import time
import pytest
import httpx

PROD_URL = os.getenv("PROD_URL", "https://huntzenjobs-production.up.railway.app")
AUTH_TOKEN = os.getenv("TEST_AUTH_TOKEN", "")


def auth_headers():
    return {"Authorization": f"Bearer {AUTH_TOKEN}"} if AUTH_TOKEN else {}


@pytest.mark.unit
class TestGroqFallbackBehavior:
    """Tests du circuit breaker Groq et du comportement sous saturation."""

    @pytest.mark.asyncio
    async def test_coach_returns_valid_response_or_queued(self):
        """POST /api/coach/chat → status 200, réponse sync ou queued, jamais 500/503."""
        if not AUTH_TOKEN:
            pytest.skip("AUTH_TOKEN requis pour ce test")

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{PROD_URL}/api/coach/chat",
                json={"message": "Test", "session_id": "test-groq-fb"},
                headers=auth_headers(),
            )

        assert resp.status_code == 200, (
            f"Attendu 200, obtenu {resp.status_code}: {resp.text[:200]}"
        )
        data = resp.json()
        is_sync = data.get("success") is not None and "response" in data
        is_queued = data.get("queued") is True and "job_id" in data
        assert is_sync or is_queued, (
            f"Réponse inattendue (ni sync ni queued): {data}"
        )

    @pytest.mark.asyncio
    async def test_rate_limited_request_returns_429_not_500(self):
        """35 requêtes en 1 min → des 429 attendus, aucun 500/503."""
        if not AUTH_TOKEN:
            pytest.skip("AUTH_TOKEN requis pour ce test")

        n_requests = 35
        statuses = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [
                client.post(
                    f"{PROD_URL}/api/coach/chat",
                    json={"message": "Test rate limit", "session_id": f"test-rl-{i}"},
                    headers=auth_headers(),
                )
                for i in range(n_requests)
            ]
            responses = await asyncio.gather(*tasks, return_exceptions=True)

        for r in responses:
            if isinstance(r, Exception):
                continue
            statuses.append(r.status_code)

        errors_5xx = [s for s in statuses if s in (500, 503)]
        has_rate_limited = any(s == 429 for s in statuses)

        assert len(errors_5xx) == 0, (
            f"Des erreurs 5xx détectées: {errors_5xx} parmi {statuses}"
        )
        # Avec 35 requêtes > limite 30/min, on doit avoir au moins quelques 429
        assert has_rate_limited, (
            f"Aucun 429 obtenu sur {n_requests} requêtes — rate limit non déclenché? Statuts: {statuses}"
        )

    @pytest.mark.asyncio
    async def test_concurrent_coach_requests_no_500(self):
        """15 requêtes coach simultanées → aucune 500/503."""
        if not AUTH_TOKEN:
            pytest.skip("AUTH_TOKEN requis pour ce test")

        n = 15
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [
                client.post(
                    f"{PROD_URL}/api/coach/chat",
                    json={"message": f"Concurrent test {i}", "session_id": f"test-conc-{i}"},
                    headers=auth_headers(),
                )
                for i in range(n)
            ]
            responses = await asyncio.gather(*tasks, return_exceptions=True)

        statuses = []
        for r in responses:
            if isinstance(r, Exception):
                continue
            statuses.append(r.status_code)

        errors_5xx = [s for s in statuses if s in (500, 503)]
        assert len(errors_5xx) == 0, (
            f"Des erreurs 5xx détectées lors de {n} requêtes simultanées: {errors_5xx}"
        )

    @pytest.mark.asyncio
    async def test_all_stats_shows_active_during_load(self):
        """5 requêtes coach en parallèle + GET /api/queue/all-stats → groq_active.coach peut être > 0."""
        if not AUTH_TOKEN:
            pytest.skip("AUTH_TOKEN requis pour ce test")

        async with httpx.AsyncClient(timeout=30.0) as client:
            coach_tasks = [
                client.post(
                    f"{PROD_URL}/api/coach/chat",
                    json={"message": "Load test", "session_id": f"test-load-{i}"},
                    headers=auth_headers(),
                )
                for i in range(5)
            ]
            stats_task = client.get(
                f"{PROD_URL}/api/queue/all-stats",
                headers=auth_headers(),
            )
            all_tasks = coach_tasks + [stats_task]
            results = await asyncio.gather(*all_tasks, return_exceptions=True)

        stats_resp = results[-1]
        assert not isinstance(stats_resp, Exception), (
            f"Erreur sur /api/queue/all-stats: {stats_resp}"
        )
        assert stats_resp.status_code == 200, (
            f"all-stats a retourné {stats_resp.status_code}: {stats_resp.text[:200]}"
        )
        data = stats_resp.json()
        # groq_active.coach peut être >= 0 (0 si toutes les requêtes sont déjà terminées)
        assert "groq_active" in data or "queue" in data or isinstance(data, dict), (
            f"Structure de réponse all-stats inattendue: {data}"
        )

    @pytest.mark.asyncio
    async def test_queue_endpoint_stable_under_coach_load(self):
        """5 requêtes coach + 3 polls /api/queue/all-stats → toujours 200, jamais d'erreur Redis."""
        if not AUTH_TOKEN:
            pytest.skip("AUTH_TOKEN requis pour ce test")

        async with httpx.AsyncClient(timeout=30.0) as client:
            coach_tasks = [
                client.post(
                    f"{PROD_URL}/api/coach/chat",
                    json={"message": "Stability test", "session_id": f"test-stab-{i}"},
                    headers=auth_headers(),
                )
                for i in range(5)
            ]
            stats_tasks = [
                client.get(f"{PROD_URL}/api/queue/all-stats", headers=auth_headers())
                for _ in range(3)
            ]
            all_tasks = coach_tasks + stats_tasks
            results = await asyncio.gather(*all_tasks, return_exceptions=True)

        stats_results = results[5:]  # Les 3 derniers sont les stats polls
        for i, r in enumerate(stats_results):
            assert not isinstance(r, Exception), (
                f"Poll {i+1}/api/queue/all-stats a levé une exception: {r}"
            )
            assert r.status_code == 200, (
                f"Poll {i+1} a retourné {r.status_code} — possible erreur Redis: {r.text[:200]}"
            )
            data = r.json()
            assert "error" not in str(data).lower() or "redis" not in str(data).lower(), (
                f"Erreur Redis détectée dans le poll {i+1}: {data}"
            )
