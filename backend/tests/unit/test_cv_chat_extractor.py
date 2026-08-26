"""Régression : l'extraction structurée ne doit jamais bloquer l'event loop."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.services import cv_chat_extractor


@pytest.mark.asyncio
async def test_cv_chat_extractor_awaits_the_async_groq_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    create = AsyncMock(
        return_value=SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='{"name":"Camille","key_skills":["Python"]}'
                    )
                )
            ]
        )
    )
    class FakeClient:
        chat = SimpleNamespace(completions=SimpleNamespace(create=create))

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

    client = FakeClient()
    monkeypatch.setattr(cv_chat_extractor, "AsyncGroq", lambda **_kwargs: client, raising=False)

    result = await cv_chat_extractor.extract_cv_structured("CV source vérifié")

    assert result["name"] == "Camille"
    create.assert_awaited_once()
