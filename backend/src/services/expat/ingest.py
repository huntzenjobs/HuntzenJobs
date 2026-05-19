"""
Expat RAG — Ingestion Pipeline
================================
Orchestre le pipeline complet :
  scrape → hash → chunk → embed → upsert pgvector

Comportement :
  - Best-effort : une source qui échoue ne bloque pas les autres.
  - Idempotent : si content_hash identique, la source est ignorée (status "unchanged").
  - Atomic par source : les anciens chunks sont supprimés avant insertion des nouveaux.

Usage :
    result = await ingest_source(url, country="FR", visa_type="etude")
    summary = await ingest_all(country="FR")
"""

import hashlib
import logging
from datetime import UTC, datetime
from typing import Any

from supabase import create_client

from src.config.settings import get_settings
from src.services.expat.chunker import chunk_markdown
from src.services.expat.embeddings import embed_texts_batched
from src.services.expat.scraper import SOURCE_REGISTRY, parse_html, scrape_url

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Client Supabase (service_role — bypass RLS)
# ---------------------------------------------------------------------------

def _get_supabase():
    """Retourne un client Supabase service_role (admin, bypass RLS)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.get_supabase_service_role_key())


# ---------------------------------------------------------------------------
# Fonctions publiques
# ---------------------------------------------------------------------------

async def ingest_source(
    url: str,
    country: str,
    visa_type: str,
    content_selector: str = "",
    prefetched_html: str | None = None,
) -> dict[str, Any]:
    """
    Ingère une source dans le vector store.

    Étapes :
      1. Scrape l'URL → Markdown.
      2. Si Markdown vide → skip.
      3. Hash sha256 du Markdown.
      4. Vérifier en DB si le document existe déjà avec le même hash.
      5. Si inchangé → retourner status "unchanged".
      6. Sinon → chunk → embed → upsert document → delete chunks → insert chunks.

    Args:
        url:              URL de la source officielle.
        country:          Code pays ("FR" | "CA" | "DE").
        visa_type:        Type de visa ("etude" | "travail" | "pvt" | …).
        content_selector: Sélecteur CSS pour extraire la zone de contenu.

    Returns:
        dict avec clé "status" : "ingested" | "unchanged" | "skipped" | "error".
    """
    logger.info("Ingestion source", extra={"url": url, "country": country, "visa_type": visa_type})

    # --- Étape 1 : Scraping (ou parsing d'un HTML pré-rendu) -----------------
    if prefetched_html is not None:
        # HTML déjà récupéré en amont (ex. page SPA rendue par un navigateur
        # headless). On saute la requête httpx et on parse directement.
        parsed = parse_html(prefetched_html, content_selector)
        markdown: str = parsed["markdown"]
        title: str = parsed["title"]
        scraped_at: str = datetime.now(UTC).isoformat()
    else:
        try:
            scraped = await scrape_url(url, content_selector=content_selector)
        except Exception as exc:
            logger.error("Erreur scraping", extra={"url": url, "error": str(exc)}, exc_info=True)
            return {"status": "error", "reason": f"scraping failed: {exc}"}
        markdown = scraped.get("markdown", "")
        title = scraped.get("title", "")
        scraped_at = scraped.get("scraped_at", "")

    # --- Étape 2 : Markdown vide ---------------------------------------------
    if not markdown or not markdown.strip():
        logger.warning("Markdown vide après scraping", extra={"url": url})
        return {"status": "skipped", "reason": "empty"}

    # --- Étape 3 : Hash ------------------------------------------------------
    content_hash = hashlib.sha256(markdown.encode("utf-8")).hexdigest()

    # --- Étape 4 : Vérification idempotence ----------------------------------
    supabase = _get_supabase()
    # limit(1) plutôt que maybe_single() : maybe_single() renvoie None (pas un
    # objet .data=None) quand 0 ligne, ce qui casse l'accès .data.
    existing = (
        supabase.table("expat_documents")
        .select("id, content_hash")
        .eq("source_url", url)
        .limit(1)
        .execute()
    )
    doc_id: str | None = None

    existing_rows = existing.data or []
    if existing_rows:
        row = existing_rows[0]
        doc_id = row["id"]
        if row["content_hash"] == content_hash:
            logger.info("Document inchangé", extra={"url": url})
            return {"status": "unchanged"}

    # --- Étape 5 : Chunking --------------------------------------------------
    metadata: dict[str, Any] = {
        "source_url": url,
        "country": country,
        "visa_type": visa_type,
        "language": "fr",
        "scraped_at": scraped_at,
    }
    chunks = chunk_markdown(markdown, metadata=metadata)

    if not chunks:
        logger.warning("Aucun chunk produit", extra={"url": url})
        return {"status": "skipped", "reason": "no chunks produced"}

    # --- Étape 6 : Embeddings ------------------------------------------------
    texts = [c["content"] for c in chunks]
    try:
        embeddings = await embed_texts_batched(texts, task="retrieval.passage")
    except Exception as exc:
        logger.error("Erreur embeddings", extra={"url": url, "error": str(exc)}, exc_info=True)
        return {"status": "error", "reason": f"embedding failed: {exc}"}

    # --- Étape 7 : Upsert document (content_hash placeholder pour l'instant) ----------
    # content_hash est NOT NULL : on insère un placeholder vide, le vrai hash est
    # écrit EN DERNIER (étape 10) après confirmation des chunks. Un placeholder ""
    # ne matche jamais un vrai sha256 → si un run échoue avant l'étape 10, la
    # source est ré-ingérée au prochain run.
    doc_payload: dict[str, Any] = {
        "source_url": url,
        "country": country,
        "visa_type": visa_type,
        "language": "fr",
        "title": title,
        "raw_markdown": markdown,
        "content_hash": "",
        "scraped_at": scraped_at,
        "is_stale": False,
        "updated_at": scraped_at,
    }

    try:
        upsert_result = (
            supabase.table("expat_documents")
            .upsert(doc_payload, on_conflict="source_url")
            .execute()
        )
        doc_id = upsert_result.data[0]["id"]
    except Exception as exc:
        logger.error("Erreur upsert document", extra={"url": url, "error": str(exc)}, exc_info=True)
        return {"status": "error", "reason": f"upsert document failed: {exc}"}

    # --- Étape 8 : Insérer les nouveaux chunks AVANT de supprimer les anciens --------
    # Ordre sûr : insérer → supprimer anciens → mettre à jour le hash.
    # Si l'insert échoue, les anciens chunks restent intacts et le hash n'est pas mis à jour.
    chunk_rows: list[dict[str, Any]] = []
    for chunk, embedding in zip(chunks, embeddings, strict=True):
        chunk_rows.append(
            {
                "document_id": doc_id,
                "chunk_index": chunk["chunk_index"],
                "content": chunk["content"],
                "embedding": embedding,
                "source_url": chunk.get("source_url", url),
                "country": chunk.get("country", country),
                "visa_type": chunk.get("visa_type", visa_type),
                "language": chunk.get("language", "fr"),
                "scraped_at": chunk.get("scraped_at", scraped_at),
            }
        )

    try:
        supabase.table("expat_chunks").insert(chunk_rows).execute()
    except Exception as exc:
        logger.error("Erreur insertion chunks", extra={"url": url, "error": str(exc)}, exc_info=True)
        return {"status": "error", "reason": f"insert chunks failed: {exc}"}

    # --- Étape 9 : Supprimer les anciens chunks (maintenant que les nouveaux sont confirmés) ---
    try:
        (
            supabase.table("expat_chunks")
            .delete()
            .eq("document_id", doc_id)
            # Exclure les chunks qu'on vient d'insérer (chunk_index présents dans chunk_rows)
            .not_.in_("chunk_index", [c["chunk_index"] for c in chunk_rows])
            .execute()
        )
    except Exception as exc:
        logger.warning(
            "Impossible de supprimer les anciens chunks orphelins",
            extra={"doc_id": doc_id, "error": str(exc)},
        )
        # Non bloquant — les anciens chunks seront écrasés au prochain run

    # --- Étape 10 : Mettre à jour le content_hash EN DERNIER (après confirmation des chunks) ---
    try:
        supabase.table("expat_documents").update({"content_hash": content_hash}).eq(
            "id", doc_id
        ).execute()
    except Exception as exc:
        logger.error(
            "Erreur mise à jour content_hash",
            extra={"url": url, "doc_id": doc_id, "error": str(exc)},
            exc_info=True,
        )
        # Non bloquant pour le résultat retourné : les chunks sont bien insérés.
        # Au prochain run, la source sera ré-ingérée (hash toujours ancien).

    logger.info(
        "Ingestion réussie",
        extra={"url": url, "nb_chunks": len(chunk_rows)},
    )
    return {"status": "ingested", "chunks": len(chunk_rows)}


async def ingest_all(country: str = "") -> dict[str, Any]:
    """
    Ingère toutes les sources du registre (ou celles d'un pays donné).

    Best-effort : une source qui échoue n'arrête pas le pipeline.

    Args:
        country: Code pays "FR" | "CA" | "DE". Vide = tous les pays.

    Returns:
        Résumé : {"total_sources", "ingested", "unchanged", "skipped", "errors"}
    """
    countries = [country.upper()] if country else list(SOURCE_REGISTRY.keys())
    summary: dict[str, int] = {
        "total_sources": 0,
        "ingested": 0,
        "unchanged": 0,
        "skipped": 0,
        "errors": 0,
    }

    for c in countries:
        sources = SOURCE_REGISTRY.get(c, [])
        for source in sources:
            summary["total_sources"] += 1
            try:
                result = await ingest_source(
                    url=source["url"],
                    country=c,
                    visa_type=source.get("visa_type", ""),
                    content_selector=source.get("content_selector", ""),
                )
                status = result.get("status", "error")
                if status == "ingested":
                    summary["ingested"] += 1
                elif status == "unchanged":
                    summary["unchanged"] += 1
                elif status == "skipped":
                    summary["skipped"] += 1
                else:
                    summary["errors"] += 1
            except Exception as exc:
                logger.error(
                    "Erreur inattendue sur source",
                    extra={"url": source["url"], "country": c, "error": str(exc)},
                    exc_info=True,
                )
                summary["errors"] += 1

    logger.info("Ingestion globale terminée", extra=summary)
    return summary
