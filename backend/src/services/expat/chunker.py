"""
Expat RAG — Markdown Chunker
===============================
Découpe un document Markdown en chunks adaptés à l'embedding.

Stratégie :
  1. Split primaire sur les titres Markdown (## / ###)
  2. Pour les sections dépassant max_tokens mots, fenêtre glissante
     avec overlap (en mots approximatifs)
  3. Les chunks trop courts (< 20 caractères) sont ignorés

Approximation tokens : len(text.split()) — suffisante pour ce usage.
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Longueur minimale d'un chunk (en caractères)
_MIN_CHUNK_LEN: int = 20


def _split_by_headings(markdown: str) -> list[str]:
    """
    Découpe le document sur les titres ## et ###.
    Conserve le titre dans chaque section.
    """
    # Découpe sur les lignes qui commencent par ## ou ###
    pattern = re.compile(r"(?=^#{2,3} )", re.MULTILINE)
    sections = pattern.split(markdown)
    # Supprimer les sections vides
    return [s.strip() for s in sections if s.strip()]


def _sliding_window(text: str, max_tokens: int, overlap: int) -> list[str]:
    """
    Découpe un texte long en fenêtres glissantes (en mots).

    Args:
        text:       Texte à découper.
        max_tokens: Taille maximale de chaque fenêtre (en mots).
        overlap:    Nombre de mots communs entre deux fenêtres consécutives.

    Returns:
        Liste de chunks texte.
    """
    words = text.split()
    if len(words) <= max_tokens:
        return [text]

    step = max(1, max_tokens - overlap)
    chunks: list[str] = []

    i = 0
    while i < len(words):
        window = words[i : i + max_tokens]
        chunks.append(" ".join(window))
        i += step

    return chunks


def chunk_markdown(
    markdown: str,
    metadata: dict[str, Any],
    max_tokens: int = 800,
    overlap: int = 100,
) -> list[dict[str, Any]]:
    """
    Découpe un document Markdown en chunks prêts à l'embedding.

    Args:
        markdown:   Texte Markdown brut du document.
        metadata:   Dict de métadonnées à copier dans chaque chunk
                    (ex: source_url, country, visa_type, language, scraped_at).
        max_tokens: Nombre maximum de mots par chunk (approx. tokens).
        overlap:    Nombre de mots de recouvrement entre chunks consécutifs.

    Returns:
        Liste de dicts :
            {
                "chunk_index": int,
                "content": str,
                **metadata
            }
        Les chunks vides ou trop courts (< 20 caractères) sont exclus.
    """
    if not markdown or not markdown.strip():
        logger.warning("chunk_markdown : markdown vide, aucun chunk produit")
        return []

    # Étape 1 : split sur les titres
    sections = _split_by_headings(markdown)

    # Si aucun titre, traiter le document entier comme une seule section
    if not sections:
        sections = [markdown.strip()]

    raw_chunks: list[str] = []

    # Étape 2 : pour chaque section, appliquer la fenêtre glissante si trop longue
    for section in sections:
        nb_words = len(section.split())
        if nb_words <= max_tokens:
            raw_chunks.append(section)
        else:
            sub_chunks = _sliding_window(section, max_tokens, overlap)
            raw_chunks.extend(sub_chunks)

    # Étape 3 : filtrer les chunks trop courts et construire les dicts
    chunks: list[dict[str, Any]] = []
    chunk_index = 0

    for raw in raw_chunks:
        content = raw.strip()
        if len(content) < _MIN_CHUNK_LEN:
            logger.debug("Chunk ignoré (trop court)", extra={"content_preview": content[:50]})
            continue

        chunk: dict[str, Any] = {
            "chunk_index": chunk_index,
            "content": content,
            **metadata,
        }
        chunks.append(chunk)
        chunk_index += 1

    logger.info(
        "Chunking terminé",
        extra={
            "nb_sections": len(sections),
            "nb_chunks": len(chunks),
            "max_tokens": max_tokens,
        },
    )
    return chunks
