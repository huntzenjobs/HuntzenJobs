from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.expat.retriever import DocumentRetriever


@pytest.mark.asyncio
async def test_missing_embedding_configuration_uses_bounded_lexical_fallback() -> None:
    """Sans clé d'embedding, les sources officielles indexées restent utilisables."""
    retriever = DocumentRetriever.__new__(DocumentRetriever)
    client = MagicMock()
    client.rpc.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "visa-ca",
                "content": "Le permis de travail autorise un ressortissant étranger à travailler au Canada.",
                "source_url": "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/travailler-canada.html",
                "country": "CA",
                "visa_type": "work",
                "scraped_at": "2026-08-01T00:00:00Z",
                "similarity": 0.42,
            }
        ]
    )
    retriever._supabase = client

    with patch(
        "src.agents.expat.retriever.embed_query",
        new=AsyncMock(side_effect=RuntimeError("configuration absente")),
    ):
        result = await retriever.retrieve(
            ["visa Canada"], country="CA", visa_type="work", match_count=6
        )

    assert [row["id"] for row in result] == ["visa-ca"]
    assert result[0]["rrf_score"] > 0
    client.rpc.assert_called_once_with(
        "search_expat_chunks_lexical",
        {
            "p_query": "visa Canada",
            "p_country": "CA",
            "p_visa_type": "work",
            "p_match_count": 6,
        },
    )


@pytest.mark.asyncio
async def test_lexical_fallback_returns_empty_list_when_rpc_fails() -> None:
    """Une panne Supabase reste une absence de sources, sans masquer l'erreur dans les logs."""
    retriever = DocumentRetriever.__new__(DocumentRetriever)
    client = MagicMock()
    client.rpc.return_value.execute.side_effect = RuntimeError("RPC indisponible")
    retriever._supabase = client

    with patch(
        "src.agents.expat.retriever.embed_query",
        new=AsyncMock(side_effect=RuntimeError("configuration absente")),
    ):
        result = await retriever.retrieve(["permis de travail"], country="CA")

    assert result == []


@pytest.mark.asyncio
async def test_lexical_fallback_searches_sub_queries_independently() -> None:
    """Deux reformulations peuvent retrouver deux sources différentes."""
    retriever = DocumentRetriever.__new__(DocumentRetriever)
    client = MagicMock()
    client.rpc.return_value.execute.side_effect = [
        SimpleNamespace(data=[{"id": "work", "content": "Permis de travail"}]),
        SimpleNamespace(data=[{"id": "arrival", "content": "Arrivée au Canada"}]),
    ]
    retriever._supabase = client

    with patch(
        "src.agents.expat.retriever.embed_query",
        new=AsyncMock(side_effect=RuntimeError("configuration absente")),
    ):
        result = await retriever.retrieve(
            ["permis de travail", "préparer arrivée"], country="CA", match_count=6
        )

    assert {row["id"] for row in result} == {"work", "arrival"}
    assert [call.args[1]["p_query"] for call in client.rpc.call_args_list] == [
        "permis de travail",
        "préparer arrivée",
    ]
