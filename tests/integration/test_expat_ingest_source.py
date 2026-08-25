"""
Tests d'intégration : pipeline ingest_source de l'Agent Expadation.

Le chemin httpx est testé via le paramètre `prefetched_html` (ajouté précisément
pour rendre le pipeline testable sans dépendre du réseau et sans monkey-patcher
httpx). Supabase et le service d'embeddings Jina sont mockés.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest


SAMPLE_HTML = """
<!DOCTYPE html>
<html>
<head><title>Visa étudiant en France — Test</title></head>
<body>
  <main>
    <h1>Visa étudiant en France</h1>
    <p>Les étudiants étrangers doivent demander un VLS-TS auprès du consulat.</p>
    <h2>Documents requis</h2>
    <ul>
      <li>Attestation d'inscription</li>
      <li>Justificatif de ressources (615 EUR par mois)</li>
      <li>Justificatif de logement</li>
    </ul>
    <h2>Délai d'instruction</h2>
    <p>Compter 4 à 8 semaines avant l'arrivée en France.</p>
  </main>
</body>
</html>
"""


def _make_supabase_mock(existing_rows: list[dict[str, Any]] | None = None) -> MagicMock:
    """Construit un mock Supabase qui répond à la chaîne d'appels d'ingest_source."""
    client = MagicMock()

    # SELECT id, content_hash WHERE source_url = ... LIMIT 1
    select_chain = MagicMock()
    select_chain.execute.return_value = MagicMock(data=existing_rows or [])
    client.table.return_value.select.return_value.eq.return_value.limit.return_value = select_chain

    # UPSERT documents → renvoie l'id
    upsert_chain = MagicMock()
    upsert_chain.execute.return_value = MagicMock(data=[{"id": "doc-uuid-1"}])
    client.table.return_value.upsert.return_value = upsert_chain

    # INSERT chunks
    client.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])

    # DELETE old chunks (chaine: .delete().eq().not_.in_().execute())
    delete_chain = MagicMock()
    delete_chain.execute.return_value = MagicMock(data=[])
    client.table.return_value.delete.return_value.eq.return_value.not_.in_.return_value = delete_chain

    # UPDATE content_hash final
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": "doc-uuid-1"}]
    )

    return client


@pytest.mark.asyncio
async def test_ingest_source_new_document_with_prefetched_html(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Cas nominal : nouveau document, parsing du HTML pré-rendu, chunking,
    embedding mocké, upsert document + insertion chunks, mise à jour du hash.
    """
    # Embeddings : on retourne un vecteur factice par chunk
    async def fake_embed(texts: list[str], task: str = "retrieval.passage") -> list[list[float]]:
        return [[0.01] * 1024 for _ in texts]

    monkeypatch.setattr("src.services.expat.ingest.embed_texts_batched", fake_embed)

    # Supabase : aucun document existant pour cette URL
    fake_client = _make_supabase_mock(existing_rows=[])
    monkeypatch.setattr("src.services.expat.ingest._get_supabase", lambda: fake_client)

    from src.services.expat.ingest import ingest_source

    result = await ingest_source(
        url="https://test.example/visa-etudiant",
        country="FR",
        visa_type="etudiant",
        content_selector="main",
        prefetched_html=SAMPLE_HTML,
    )

    assert result["status"] == "ingested"
    assert result["chunks"] >= 1

    # Le document a été upserté avec un placeholder de hash vide
    upsert_call = fake_client.table.return_value.upsert.call_args
    assert upsert_call is not None
    upsert_payload = upsert_call.args[0]
    assert upsert_payload["country"] == "FR"
    assert upsert_payload["visa_type"] == "etudiant"
    assert upsert_payload["content_hash"] == ""  # placeholder à l'étape 7

    # Le content_hash réel est mis à jour en dernier (étape 10)
    update_call = fake_client.table.return_value.update.call_args
    assert update_call is not None
    final_hash_payload = update_call.args[0]
    assert final_hash_payload["content_hash"] != ""
    assert len(final_hash_payload["content_hash"]) == 64  # sha256 hex


@pytest.mark.asyncio
async def test_ingest_source_unchanged_when_hash_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Idempotence : si le hash en base correspond au hash calculé, retour "unchanged"
    sans appel aux embeddings ni à l'upsert.
    """
    import hashlib

    # Pré-calcul du hash attendu : on doit reproduire exactement le markdown produit
    # par parse_html() sur SAMPLE_HTML pour que le test soit déterministe.
    from src.services.expat.scraper import parse_html

    parsed = parse_html(SAMPLE_HTML, "main")
    expected_hash = hashlib.sha256(parsed["markdown"].encode("utf-8")).hexdigest()

    # Embeddings : ne doit jamais être appelé
    fake_embed = AsyncMock()
    monkeypatch.setattr("src.services.expat.ingest.embed_texts_batched", fake_embed)

    fake_client = _make_supabase_mock(
        existing_rows=[{"id": "doc-uuid-existing", "content_hash": expected_hash}]
    )
    monkeypatch.setattr("src.services.expat.ingest._get_supabase", lambda: fake_client)

    from src.services.expat.ingest import ingest_source

    result = await ingest_source(
        url="https://test.example/visa-etudiant",
        country="FR",
        visa_type="etudiant",
        content_selector="main",
        prefetched_html=SAMPLE_HTML,
    )

    assert result["status"] == "unchanged"
    fake_embed.assert_not_called()
    fake_client.table.return_value.upsert.assert_not_called()


@pytest.mark.asyncio
async def test_ingest_source_skipped_when_markdown_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Markdown vide après parsing : skip propre sans toucher Supabase ni Jina."""
    fake_embed = AsyncMock()
    monkeypatch.setattr("src.services.expat.ingest.embed_texts_batched", fake_embed)

    fake_client = _make_supabase_mock(existing_rows=[])
    monkeypatch.setattr("src.services.expat.ingest._get_supabase", lambda: fake_client)

    from src.services.expat.ingest import ingest_source

    # HTML sans contenu exploitable
    result = await ingest_source(
        url="https://test.example/empty",
        country="FR",
        visa_type="etudiant",
        content_selector="main",
        prefetched_html="<html><body><main></main></body></html>",
    )

    assert result["status"] == "skipped"
    assert result["reason"] == "empty"
    fake_embed.assert_not_called()
