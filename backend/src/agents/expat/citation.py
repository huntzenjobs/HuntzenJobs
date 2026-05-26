"""
Expat RAG — Citation & Freshness
==================================
Deux composants purs (sans LLM) pour la gestion des sources :

- SourceCiter : déduplique et formate les sources citées.
- FreshnessChecker : détecte les sources potentiellement obsolètes.
"""

import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)


class SourceCiter:
    """
    Génère une liste de citations dédupliquées à partir de chunks RAG.
    """

    def build_citations(self, chunks: list[dict]) -> list[dict]:
        """
        Construit une liste de sources uniques depuis les chunks récupérés.

        Déduplique par `source_url`. Si une même URL apparaît plusieurs fois,
        on garde la première occurrence (triée par rang RRF décroissant).

        Args:
            chunks: Liste de dicts de chunks (issus de `DocumentRetriever.retrieve`).

        Returns:
            Liste triée par URL de dicts `{"url", "scraped_at", "country"}`.
        """
        seen_urls: set[str] = set()
        citations: list[dict] = []

        for chunk in chunks:
            url = (chunk.get("source_url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            citations.append(
                {
                    "url": url,
                    "scraped_at": chunk.get("scraped_at") or "",
                    "country": chunk.get("country") or "",
                }
            )

        # Tri alphabétique par URL pour une présentation stable
        citations.sort(key=lambda c: c["url"])

        logger.debug("[SourceCiter] %d sources uniques extraites.", len(citations))
        return citations

    def format_sources_block(self, citations: list[dict]) -> str:
        """
        Formate les citations en un bloc texte lisible.

        Args:
            citations: Sortie de `build_citations`.

        Returns:
            Texte lisible des sources, une par ligne, avec date si disponible.
        """
        if not citations:
            return "Aucune source officielle disponible."

        lines: list[str] = ["Sources officielles :"]
        for idx, citation in enumerate(citations, start=1):
            url = citation.get("url", "")
            scraped_at = citation.get("scraped_at", "")
            country = citation.get("country", "")

            date_label = ""
            if scraped_at:
                # Affiche uniquement la date (YYYY-MM-DD) si disponible
                try:
                    dt = datetime.fromisoformat(str(scraped_at).replace("Z", "+00:00"))
                    date_label = f" (consulté le {dt.strftime('%d/%m/%Y')})"
                except (ValueError, TypeError):
                    date_label = f" (consulté le {scraped_at})"

            country_label = f" [{country}]" if country else ""
            lines.append(f"  {idx}. {url}{country_label}{date_label}")

        return "\n".join(lines)


class FreshnessChecker:
    """
    Vérifie la fraîcheur des sources et génère des avertissements pour celles
    dont la date de scraping dépasse le seuil configuré.
    """

    def check(self, chunks: list[dict], max_age_days: int = 365) -> list[str]:
        """
        Identifie les sources potentiellement obsolètes.

        Args:
            chunks:       Liste de dicts de chunks (issus de `DocumentRetriever.retrieve`).
            max_age_days: Seuil en jours au-delà duquel une source est considérée
                          comme potentiellement obsolète. Défaut 365 jours : le
                          contenu légal/immigration évolue lentement, un avertissement
                          ne se justifie qu'après ~1 an sans rafraîchissement.

        Returns:
            Liste de chaînes d'avertissement (vide si toutes les sources sont fraîches
            ou si `scraped_at` est absent/invalide).
        """
        now = datetime.now(tz=UTC)
        warnings: list[str] = []
        seen_urls: set[str] = set()

        for chunk in chunks:
            url = (chunk.get("source_url") or "").strip()
            scraped_at_raw = chunk.get("scraped_at")

            # Déduplique les avertissements par URL
            if not url or url in seen_urls:
                continue

            if not scraped_at_raw:
                # Pas de date : impossible de vérifier, on ignore
                continue

            try:
                scraped_dt = datetime.fromisoformat(
                    str(scraped_at_raw).replace("Z", "+00:00")
                )
                # S'assurer que scraped_dt est timezone-aware
                if scraped_dt.tzinfo is None:
                    scraped_dt = scraped_dt.replace(tzinfo=UTC)

                age_days = (now - scraped_dt).days

                if age_days > max_age_days:
                    seen_urls.add(url)
                    warnings.append(
                        f"La source {url} date de {age_days} jours, "
                        "l'information peut être obsolète."
                    )
                    logger.debug(
                        "[FreshnessChecker] Source obsolète détectée : %s (%d jours).",
                        url,
                        age_days,
                    )

            except (ValueError, TypeError) as exc:
                logger.warning(
                    "[FreshnessChecker] Date invalide pour '%s' : %s",
                    url,
                    exc,
                )

        return warnings
