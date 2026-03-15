"""
Integration tests — ARQ Queue System (prod).

Ces tests vérifient l'architecture queue ARQ contre la production réelle.
Lancer avec : PROD_URL=https://huntzenjobs-production.up.railway.app TEST_AUTH_TOKEN=xxx pytest tests/integration/test_arq_queue.py -v
"""
import os
import asyncio
import time
import pytest
import httpx
from typing import Optional

PROD_URL = os.getenv("PROD_URL", "https://huntzenjobs-production.up.railway.app")
AUTH_TOKEN = os.getenv("TEST_AUTH_TOKEN", "")


def auth_headers() -> dict:
    if AUTH_TOKEN:
        return {"Authorization": f"Bearer {AUTH_TOKEN}"}
    return {}


async def _poll_until_done(client: httpx.AsyncClient, job_id: str, max_wait: int = 120) -> dict:
    """Poll /api/queue/status/{job_id} jusqu'à completed/failed."""
    deadline = time.time() + max_wait
    while time.time() < deadline:
        resp = await client.get(
            f"{PROD_URL}/api/queue/status/{job_id}",
            headers=auth_headers(),
        )
        data = resp.json()
        if data["status"] in ("completed", "failed"):
            return data
        await asyncio.sleep(3)
    pytest.fail(f"Job {job_id} not completed within {max_wait}s")


def _assert_sync_or_queued(data: dict, client: httpx.AsyncClient = None) -> Optional[str]:
    """
    Vérifie que la réponse est soit sync, soit queued.
    Retourne le job_id si queued, sinon None.
    """
    if data.get("queued") is True:
        assert "job_id" in data, "Réponse queued sans job_id"
        assert data.get("estimated_wait_seconds", 0) > 0, "estimated_wait_seconds doit être > 0"
        return data["job_id"]
    else:
        # Réponse synchrone : soit 'response' key, soit 'success' key
        has_response = "response" in data
        has_success = data.get("success") is True
        assert has_response or has_success, (
            f"Réponse sync invalide — ni 'response' ni 'success=True' : {data}"
        )
        return None


@pytest.mark.integration
class TestQueueStatusEndpoint:
    """Tests des endpoints de statut de queue."""

    @pytest.mark.asyncio
    async def test_invalid_job_id_returns_404(self):
        """GET /api/queue/status/invalid-job-xyz → 404."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{PROD_URL}/api/queue/status/invalid-job-xyz",
                headers=auth_headers(),
            )
        assert resp.status_code == 404, (
            f"Attendu 404 pour job_id invalide, reçu {resp.status_code}: {resp.text}"
        )

    @pytest.mark.asyncio
    async def test_expired_job_id_returns_404(self):
        """GET /api/queue/status/00000000-0000-0000-0000-000000000000 → 404."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{PROD_URL}/api/queue/status/00000000-0000-0000-0000-000000000000",
                headers=auth_headers(),
            )
        assert resp.status_code == 404, (
            f"Attendu 404 pour UUID inexistant, reçu {resp.status_code}: {resp.text}"
        )

    @pytest.mark.asyncio
    async def test_all_stats_structure(self):
        """GET /api/queue/all-stats → vérifie structure complète."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{PROD_URL}/api/queue/all-stats",
                headers=auth_headers(),
            )
        assert resp.status_code == 200, (
            f"Attendu 200 sur /api/queue/all-stats, reçu {resp.status_code}: {resp.text}"
        )
        data = resp.json()

        # Vérification groq_active
        assert "groq_active" in data, f"Clé 'groq_active' absente: {data}"
        groq = data["groq_active"]
        for key in ("coach", "assistant", "cv_adapt"):
            assert key in groq, f"Clé '{key}' absente dans groq_active: {groq}"
            assert isinstance(groq[key], int) and groq[key] >= 0, (
                f"groq_active.{key} doit être un entier >= 0, valeur: {groq[key]}"
            )

        # Vérification modal_active
        assert "modal_active" in data, f"Clé 'modal_active' absente: {data}"
        modal = data["modal_active"]
        assert "cv_analysis" in modal, f"Clé 'cv_analysis' absente dans modal_active: {modal}"
        assert isinstance(modal["cv_analysis"], int) and modal["cv_analysis"] >= 0, (
            f"modal_active.cv_analysis doit être un entier >= 0, valeur: {modal['cv_analysis']}"
        )


@pytest.mark.integration
class TestCoachQueueBehavior:
    """Tests du comportement sync/queue du endpoint coach."""

    @pytest.mark.asyncio
    async def test_coach_chat_sync_or_queued_response(self):
        """POST /api/coach/chat → sync ou queued, poll si queued."""
        payload = {"message": "Bonjour", "session_id": "test-arq-session"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/coach/chat",
                json=payload,
                headers=auth_headers(),
            )
            assert resp.status_code == 200, (
                f"Attendu 200 sur /api/coach/chat, reçu {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            job_id = _assert_sync_or_queued(data)
            if job_id:
                result = await _poll_until_done(client, job_id)
                assert result["status"] in ("completed", "failed"), (
                    f"Statut inattendu après poll: {result}"
                )

    @pytest.mark.asyncio
    @pytest.mark.skipif(not AUTH_TOKEN, reason="TEST_AUTH_TOKEN not set")
    async def test_coach_chat_with_auth(self):
        """POST /api/coach/chat avec auth → sync ou queued, poll si queued."""
        payload = {"message": "Bonjour", "session_id": "test-arq-session"}
        headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/coach/chat",
                json=payload,
                headers=headers,
            )
            assert resp.status_code == 200, (
                f"Attendu 200 sur /api/coach/chat (auth), reçu {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            job_id = _assert_sync_or_queued(data)
            if job_id:
                result = await _poll_until_done(client, job_id)
                assert result["status"] in ("completed", "failed"), (
                    f"Statut inattendu après poll: {result}"
                )


@pytest.mark.integration
class TestAssistantQueueBehavior:
    """Tests du comportement sync/queue des endpoints assistant."""

    @pytest.mark.asyncio
    async def test_assistant_job_scout_response(self):
        """POST /api/assistant/job-scout → sync ou queued, poll si queued."""
        payload = {
            "message": "Trouve des offres Python à Paris",
            "session_id": "test-arq-session",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/assistant/job-scout",
                json=payload,
                headers=auth_headers(),
            )
            assert resp.status_code == 200, (
                f"Attendu 200 sur /api/assistant/job-scout, reçu {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            job_id = _assert_sync_or_queued(data)
            if job_id:
                result = await _poll_until_done(client, job_id)
                assert result["status"] in ("completed", "failed"), (
                    f"Statut inattendu après poll: {result}"
                )

    @pytest.mark.asyncio
    async def test_assistant_cv_analyzer_response(self):
        """POST /api/assistant/cv-analyzer → sync ou queued, poll si queued."""
        payload = {
            "message": "Analyse ce CV",
            "session_id": "test-arq-session",
            "cv_text": "Jean Dupont, Dev Python, Paris",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/assistant/cv-analyzer",
                json=payload,
                headers=auth_headers(),
            )
            assert resp.status_code == 200, (
                f"Attendu 200 sur /api/assistant/cv-analyzer, reçu {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            job_id = _assert_sync_or_queued(data)
            if job_id:
                result = await _poll_until_done(client, job_id)
                assert result["status"] in ("completed", "failed"), (
                    f"Statut inattendu après poll: {result}"
                )


@pytest.mark.integration
class TestCvAdapterQueueBehavior:
    """Tests du comportement sync/queue des endpoints cv-adapter."""

    @pytest.mark.asyncio
    async def test_cv_adapt_sync_or_queued(self):
        """POST /api/cv-adapter/adapt → sync ou queued, poll si queued."""
        payload = {
            "cv_text": "Jean Dupont, Développeur Python Senior, 5 ans d'expérience, Paris.",
            "job_description": "Dev Python senior, maîtrise FastAPI, SQLAlchemy, Docker.",
            "language": "fr",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/adapt",
                json=payload,
                headers=auth_headers(),
            )
            assert resp.status_code == 200, (
                f"Attendu 200 sur /api/cv-adapter/adapt, reçu {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            job_id = _assert_sync_or_queued(data)
            if job_id:
                result = await _poll_until_done(client, job_id)
                assert result["status"] in ("completed", "failed"), (
                    f"Statut inattendu après poll: {result}"
                )

    @pytest.mark.asyncio
    async def test_cover_letter_json_sync_or_queued(self):
        """POST /api/cv-adapter/generate-cover-letter/json → sync ou queued, poll si queued."""
        payload = {
            "cv_text": "Jean Dupont, Développeur Python Senior, 5 ans d'expérience, Paris.",
            "job_description": "Dev Python senior, maîtrise FastAPI, SQLAlchemy, Docker.",
            "language": "fr",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{PROD_URL}/api/cv-adapter/generate-cover-letter/json",
                json=payload,
                headers=auth_headers(),
            )
            assert resp.status_code == 200, (
                f"Attendu 200 sur /api/cv-adapter/generate-cover-letter/json, "
                f"reçu {resp.status_code}: {resp.text}"
            )
            data = resp.json()
            job_id = _assert_sync_or_queued(data)
            if job_id:
                result = await _poll_until_done(client, job_id)
                assert result["status"] in ("completed", "failed"), (
                    f"Statut inattendu après poll: {result}"
                )


@pytest.mark.integration
class TestQueuePollingFlow:
    """Tests du flux complet de polling (force la mise en queue)."""

    @pytest.mark.asyncio
    @pytest.mark.skipif(not AUTH_TOKEN, reason="TEST_AUTH_TOKEN not set")
    async def test_full_queue_poll_flow(self):
        """
        Force une situation de queue en envoyant 15 requêtes coach simultanées.
        Vérifie qu'au moins une retourne {queued: true, job_id},
        puis poll cette à completion.
        """
        payload = {"message": "Bonjour", "session_id": "test-arq-flood"}
        headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}

        async def send_one(client: httpx.AsyncClient) -> dict:
            try:
                resp = await client.post(
                    f"{PROD_URL}/api/coach/chat",
                    json=payload,
                    headers=headers,
                    timeout=30,
                )
                if resp.status_code == 200:
                    return resp.json()
                return {"_status_code": resp.status_code}
            except Exception as exc:
                return {"_error": str(exc)}

        async with httpx.AsyncClient(timeout=30) as client:
            results = await asyncio.gather(*[send_one(client) for _ in range(15)])

        queued_results = [r for r in results if r.get("queued") is True and "job_id" in r]

        assert len(queued_results) > 0, (
            "Aucune réponse queued obtenue après 15 requêtes simultanées. "
            f"Résultats: {results}"
        )

        # Poll le premier job queued jusqu'à completion
        job_id = queued_results[0]["job_id"]
        async with httpx.AsyncClient(timeout=30) as client:
            result = await _poll_until_done(client, job_id, max_wait=120)

        assert result["status"] in ("completed", "failed"), (
            f"Statut inattendu après poll du job {job_id}: {result}"
        )
