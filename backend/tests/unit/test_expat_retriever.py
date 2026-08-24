from unittest.mock import AsyncMock, patch

import pytest

from src.agents.expat.retriever import DocumentRetriever


@pytest.mark.asyncio
async def test_missing_embedding_configuration_returns_no_sources() -> None:
    """Une clé d'embedding absente active le repli sûr, sans erreur client."""
    retriever = DocumentRetriever.__new__(DocumentRetriever)
    retriever._supabase = None

    with patch(
        "src.agents.expat.retriever.embed_query",
        new=AsyncMock(side_effect=RuntimeError("configuration absente")),
    ):
        result = await retriever.retrieve(["visa Canada"])

    assert result == []
