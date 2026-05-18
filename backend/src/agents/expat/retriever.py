"""
Expat RAG — Document Retriever
================================
Composant de récupération de documents via Supabase pgvector.

Utilise Reciprocal Rank Fusion (RRF) pour fusionner les résultats
de plusieurs sous-requêtes et dédoublonner par id de chunk.
"""

import logging
from typing import Any

from supabase import create_client

from src.config.settings import get_settings
from src.services.expat.embeddings import embed_query

logger = logging.getLogger(__name__)

# Constante RRF standard (Cormack et al., 2009)
_RRF_K: int = 60


class DocumentRetriever:
    """
    Récupère les chunks les plus pertinents depuis la table `expat_chunks`
    via la RPC pgvector `match_expat_chunks`, puis les fusionne par RRF.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._supabase = create_client(
            settings.supabase_url,
            settings.get_supabase_service_role_key(),
        )
        logger.debug("[DocumentRetriever] Client Supabase initialisé.")

    async def retrieve(
        self,
        sub_queries: list[str],
        country: str = "",
        visa_type: str = "",
        match_count: int = 6,
    ) -> list[dict[str, Any]]:
        """
        Récupère les chunks les plus pertinents pour un ensemble de sous-requêtes.

        Pour chaque sous-requête :
          1. Génère l'embedding via Jina.
          2. Appelle la RPC `match_expat_chunks` en filtrant optionnellement
             par pays et type de visa.

        Fusionne ensuite tous les résultats par Reciprocal Rank Fusion (RRF) :
          score_rrf(chunk) = sum_q( 1 / (k + rang_q(chunk)) )

        Args:
            sub_queries:  Liste de 1 à 4 sous-requêtes textuelles.
            country:      Filtre pays (paramètre `p_country` de la RPC). Vide = pas de filtre.
            visa_type:    Filtre type de visa (`p_visa_type`). Vide = pas de filtre.
            match_count:  Nombre de chunks à retourner (top-N après fusion RRF).

        Returns:
            Liste de dicts contenant les métadonnées du chunk :
            `id`, `content`, `source_url`, `country`, `visa_type`,
            `scraped_at`, `similarity` + clé `rrf_score` ajoutée.
            Retourne `[]` si aucun chunk trouvé.
        """
        if not sub_queries:
            logger.warning("[DocumentRetriever] Aucune sous-requête fournie.")
            return []

        # Accumulateur : id_chunk → {chunk_data, rrf_score}
        rrf_scores: dict[str, float] = {}
        chunk_by_id: dict[str, dict[str, Any]] = {}

        for query_idx, query in enumerate(sub_queries):
            if not query.strip():
                continue

            try:
                embedding = await embed_query(query)
            except RuntimeError:
                # RuntimeError = erreur de configuration (ex. JINA_API_KEY manquante).
                # On la laisse remonter pour éviter un faux "aucune source" silencieux.
                raise
            except Exception as exc:
                # Erreurs réseau transitoires : on logue et on continue avec la sous-requête suivante.
                logger.error(
                    "[DocumentRetriever] Erreur réseau embedding sous-requête %d : %s",
                    query_idx,
                    exc,
                    exc_info=True,
                )
                continue

            try:
                rpc_params: dict[str, Any] = {
                    "query_embedding": embedding,
                    "match_count": max(match_count * 3, 20),  # large pour fusion RRF
                }
                if country:
                    rpc_params["p_country"] = country
                if visa_type:
                    rpc_params["p_visa_type"] = visa_type

                result = self._supabase.rpc("match_expat_chunks", rpc_params).execute()
            except Exception as exc:
                logger.error(
                    "[DocumentRetriever] Erreur RPC match_expat_chunks (requête %d) : %s",
                    query_idx,
                    exc,
                    exc_info=True,
                )
                continue

            rows: list[dict[str, Any]] = result.data or []

            logger.info(
                "[DocumentRetriever] Sous-requête %d : %d chunks retournés.",
                query_idx,
                len(rows),
                extra={"query": query[:80]},
            )

            for rank, row in enumerate(rows):
                chunk_id = str(row.get("id", ""))
                if not chunk_id:
                    continue

                # Score RRF : 1 / (k + rang)  (rang 0-indexé)
                rrf_contribution = 1.0 / (_RRF_K + rank)
                rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + rrf_contribution

                # Première occurrence → on garde les métadonnées
                if chunk_id not in chunk_by_id:
                    chunk_by_id[chunk_id] = dict(row)

        if not chunk_by_id:
            logger.info("[DocumentRetriever] Aucun chunk trouvé pour les sous-requêtes fournies.")
            return []

        # Tri décroissant par score RRF
        sorted_ids = sorted(chunk_by_id.keys(), key=lambda cid: rrf_scores[cid], reverse=True)
        top_ids = sorted_ids[:match_count]

        results: list[dict[str, Any]] = []
        for chunk_id in top_ids:
            chunk = chunk_by_id[chunk_id]
            chunk["rrf_score"] = rrf_scores[chunk_id]
            results.append(chunk)

        logger.info(
            "[DocumentRetriever] RRF terminé : %d chunks sélectionnés sur %d uniques.",
            len(results),
            len(chunk_by_id),
        )
        return results
