"""Contrats envoyés aux API externes d'offres d'emploi."""

from typing import Any
from unittest.mock import AsyncMock

import pytest

from src.services.job_providers import adzuna, france_travail


class _Response:
    status_code = 200

    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _Client:
    def __init__(self, response: _Response) -> None:
        self.response = response
        self.params: dict[str, Any] = {}

    async def __aenter__(self) -> "_Client":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def get(self, _url: str, **kwargs: Any) -> _Response:
        self.params = dict(kwargs.get("params") or {})
        return self.response


@pytest.mark.asyncio
async def test_france_travail_does_not_send_rejected_alternance_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = france_travail.FranceTravailProvider()
    monkeypatch.setattr(provider, "_get_token", AsyncMock(return_value="token"))
    client = _Client(_Response({"resultats": []}))
    monkeypatch.setattr(
        france_travail.httpx,
        "AsyncClient",
        lambda **_kwargs: client,
    )

    await provider.search(
        "développeur",
        country_code="fr",
        contract_type="alternance",
    )

    assert "typeContrat" not in client.params


@pytest.mark.asyncio
async def test_france_travail_keeps_supported_native_contract_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = france_travail.FranceTravailProvider()
    monkeypatch.setattr(provider, "_get_token", AsyncMock(return_value="token"))
    client = _Client(_Response({"resultats": []}))
    monkeypatch.setattr(
        france_travail.httpx,
        "AsyncClient",
        lambda **_kwargs: client,
    )

    await provider.search(
        "développeur",
        country_code="fr",
        contract_type="cdi",
    )

    assert client.params["typeContrat"] == "CDI"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("contract_type", "expected_flag"),
    [("cdi", "permanent"), ("cdd", "contract")],
)
async def test_adzuna_uses_documented_boolean_contract_flags(
    monkeypatch: pytest.MonkeyPatch,
    contract_type: str,
    expected_flag: str,
) -> None:
    provider = adzuna.AdzunaProvider()
    monkeypatch.setattr(adzuna.settings, "adzuna_app_id", "app-id")
    monkeypatch.setattr(
        type(adzuna.settings),
        "get_adzuna_key",
        lambda _settings: "app-key",
    )
    client = _Client(_Response({"results": []}))
    monkeypatch.setattr(adzuna.httpx, "AsyncClient", lambda **_kwargs: client)

    await provider.search(
        "développeur",
        country_code="fr",
        contract_type=contract_type,
    )

    assert "contract_type" not in client.params
    assert client.params[expected_flag] == 1
