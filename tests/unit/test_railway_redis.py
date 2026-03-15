"""
Tests Redis — Railway Redis (prod).

Vérifie : compteurs atomiques groq:active_*, structure all-stats, stabilité.
Lancer avec : PROD_URL=... TEST_AUTH_TOKEN=... pytest tests/unit/test_railway_redis.py -v
"""
import asyncio
import os
import time

import httpx
import pytest

PROD_URL = os.getenv("PROD_URL", "https://huntzenjobs-production.up.railway.app")
AUTH_TOKEN = os.getenv("TEST_AUTH_TOKEN", "")


@pytest.fixture
async def prod_client():
    async with httpx.AsyncClient(base_url=PROD_URL, timeout=10.0) as client:
        yield client


@pytest.mark.unit
class TestAllStatsEndpoint:
    """Tests de structure et contenu de /api/queue/all-stats."""

    @pytest.mark.asyncio
    async def test_all_stats_returns_200(self, prod_client):
        """GET /api/queue/all-stats doit retourner status 200."""
        response = await prod_client.get("/api/queue/all-stats")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_all_stats_has_groq_active_structure(self, prod_client):
        """groq_active doit contenir coach, assistant, cv_adapt avec valeurs int >= 0."""
        response = await prod_client.get("/api/queue/all-stats")
        data = response.json()

        assert "groq_active" in data, "Clé 'groq_active' absente de la réponse"

        groq = data["groq_active"]
        for key in ("coach", "assistant", "cv_adapt"):
            assert key in groq, f"Sous-clé '{key}' absente de groq_active"
            assert isinstance(groq[key], int), f"groq_active.{key} doit être un int"
            assert groq[key] >= 0, f"groq_active.{key} ne peut pas être négatif"

    @pytest.mark.asyncio
    async def test_all_stats_has_modal_active_structure(self, prod_client):
        """modal_active doit contenir cv_analysis avec valeur int >= 0."""
        response = await prod_client.get("/api/queue/all-stats")
        data = response.json()

        assert "modal_active" in data, "Clé 'modal_active' absente de la réponse"

        modal = data["modal_active"]
        assert "cv_analysis" in modal, "Sous-clé 'cv_analysis' absente de modal_active"
        assert isinstance(modal["cv_analysis"], int), "modal_active.cv_analysis doit être un int"
        assert modal["cv_analysis"] >= 0, "modal_active.cv_analysis ne peut pas être négatif"

    @pytest.mark.asyncio
    async def test_all_stats_no_error_key_under_normal_conditions(self, prod_client):
        """En conditions normales (Redis disponible), la clé 'error' ne doit pas être présente."""
        response = await prod_client.get("/api/queue/all-stats")
        data = response.json()

        assert "error" not in data, (
            f"Clé 'error' inattendue dans la réponse : {data.get('error')}"
        )

    @pytest.mark.asyncio
    async def test_all_stats_counters_are_integers_not_strings(self, prod_client):
        """Toutes les valeurs des compteurs doivent être des int, pas des str."""
        response = await prod_client.get("/api/queue/all-stats")
        data = response.json()

        groq = data.get("groq_active", {})
        for key, value in groq.items():
            assert isinstance(value, int), (
                f"groq_active.{key} est de type {type(value).__name__} (attendu int) — "
                "possible bug de conversion bytes Redis"
            )

        modal = data.get("modal_active", {})
        for key, value in modal.items():
            assert isinstance(value, int), (
                f"modal_active.{key} est de type {type(value).__name__} (attendu int) — "
                "possible bug de conversion bytes Redis"
            )


@pytest.mark.unit
class TestRedisCounterStability:
    """Tests de stabilité des compteurs Redis sur plusieurs appels."""

    @pytest.mark.asyncio
    async def test_all_stats_consistent_across_multiple_calls(self, prod_client):
        """3 appels successifs (1s d'intervalle) doivent retourner des int >= 0 stables."""
        for i in range(3):
            if i > 0:
                await asyncio.sleep(1)

            response = await prod_client.get("/api/queue/all-stats")
            assert response.status_code == 200, f"Appel #{i+1} : status inattendu {response.status_code}"

            data = response.json()

            groq = data.get("groq_active", {})
            for key, value in groq.items():
                assert isinstance(value, int) and value >= 0, (
                    f"Appel #{i+1} : groq_active.{key} = {value!r} invalide"
                )

            modal = data.get("modal_active", {})
            for key, value in modal.items():
                assert isinstance(value, int) and value >= 0, (
                    f"Appel #{i+1} : modal_active.{key} = {value!r} invalide"
                )

    @pytest.mark.asyncio
    async def test_counters_not_negative(self, prod_client):
        """Aucun compteur ne doit être < 0 (DECR sans INCR correspondant serait un bug)."""
        response = await prod_client.get("/api/queue/all-stats")
        data = response.json()

        all_counters = {}
        all_counters.update({f"groq_active.{k}": v for k, v in data.get("groq_active", {}).items()})
        all_counters.update({f"modal_active.{k}": v for k, v in data.get("modal_active", {}).items()})

        negative = {k: v for k, v in all_counters.items() if isinstance(v, int) and v < 0}
        assert not negative, f"Compteurs négatifs détectés (bug DECR sans INCR) : {negative}"


@pytest.mark.unit
class TestRedisEndpointResilience:
    """Tests de performance et résilience de l'endpoint all-stats."""

    @pytest.mark.asyncio
    async def test_all_stats_responds_within_500ms(self, prod_client):
        """L'endpoint doit répondre en < 500ms (Railway Redis interne ~1-3ms)."""
        start = time.monotonic()
        response = await prod_client.get("/api/queue/all-stats")
        elapsed_ms = (time.monotonic() - start) * 1000

        assert response.status_code == 200
        assert elapsed_ms < 500, (
            f"Réponse trop lente : {elapsed_ms:.1f}ms (limite : 500ms). "
            "Possible problème de connectivité Railway Redis."
        )

    @pytest.mark.asyncio
    async def test_all_stats_concurrent_calls(self, prod_client):
        """10 appels concurrents doivent tous retourner 200 avec une structure valide."""
        async def single_call():
            resp = await prod_client.get("/api/queue/all-stats")
            return resp

        responses = await asyncio.gather(*[single_call() for _ in range(10)])

        for i, resp in enumerate(responses):
            assert resp.status_code == 200, f"Appel concurrent #{i+1} : status {resp.status_code}"
            data = resp.json()
            assert "groq_active" in data, f"Appel concurrent #{i+1} : clé 'groq_active' absente"
            assert "modal_active" in data, f"Appel concurrent #{i+1} : clé 'modal_active' absente"
