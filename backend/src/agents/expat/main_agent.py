"""
Expadation — Main Agent
========================
Agent RAG orchestrant le conseil en expatriation (visa, immigration, installation).

Pipeline séquentiel :
  1. IntentParser   — extrait pays et type de projet (JSON, llm_model_fast, temp 0).
  2. QueryPlanner   — décompose en 2-4 sous-requêtes documentaires (JSON, llm_model_fast, temp 0).
  3. DocumentRetriever — récupère les chunks pertinents via pgvector + RRF.
  4. ReasoningEngine — synthétise la réponse depuis les extraits (llm_model_powerful, temp 0.3).
  5. SourceCiter / FreshnessChecker — construit la liste de sources et les avertissements.
"""

import asyncio
import logging
import unicodedata
from time import monotonic
from typing import Any

from src.agents.base import AgentConfig, BaseAgent, SubAgent, load_prompt
from src.agents.expat.citation import FreshnessChecker, SourceCiter
from src.agents.expat.retriever import DocumentRetriever
from src.config.settings import settings
from src.services.expat.scraper import SOURCE_REGISTRY, scrape_url

logger = logging.getLogger(__name__)

_OFFICIAL_SOURCE_CACHE_TTL_SECONDS = 3600
_OFFICIAL_SOURCE_TIMEOUT_SECONDS = 12
_official_source_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_official_source_locks: dict[str, asyncio.Lock] = {}
_PROJECT_ALIASES: dict[str, tuple[str, ...]] = {
    "travail": (
        "travail", "emploi", "salarie", "talent", "entrepreneur",
        "saisonnier", "carte-bleue", "pvt",
    ),
    "etude": ("etud", "student", "diplome", "stagiaire"),
    "residence": (
        "residence", "resident", "immigration", "entree-express",
        "regroupement", "sejour",
    ),
    "famille": ("famille", "familial", "regroupement", "vie-privee"),
}

# ---------------------------------------------------------------------------
# Normalisation pays → code ISO 2 lettres
# L'IntentParser retourne des noms en clair ("Canada", "France") alors que les
# métadonnées ingérées utilisent des codes ("CA", "FR", "DE").
# Si le pays n'est pas reconnu, on retourne "" → pas de filtre pays,
# ce qui est préférable à un filtre qui ne matche rien.
# ---------------------------------------------------------------------------
_COUNTRY_CODE_MAP: dict[str, str] = {
    "france": "FR", "fr": "FR",
    "canada": "CA", "ca": "CA",
    "germany": "DE", "allemagne": "DE", "deutschland": "DE", "de": "DE",
    "royaume-uni": "GB", "royaume uni": "GB", "uk": "GB", "gb": "GB",
    "angleterre": "GB", "grande-bretagne": "GB", "united kingdom": "GB",
    "etats-unis": "US", "états-unis": "US", "etats unis": "US",
    "états unis": "US", "usa": "US", "us": "US", "united states": "US",
    "irlande": "IE", "ireland": "IE", "ie": "IE",
    "belgique": "BE", "belgium": "BE", "be": "BE",
    "suisse": "CH", "switzerland": "CH", "schweiz": "CH", "ch": "CH",
    "suede": "SE", "suède": "SE", "sweden": "SE", "se": "SE",
    "norvege": "NO", "norvège": "NO", "norway": "NO", "no": "NO",
    "finlande": "FI", "finland": "FI", "fi": "FI",
    "japon": "JP", "japan": "JP", "jp": "JP",
    "pays-bas": "NL", "pays bas": "NL", "netherlands": "NL", "hollande": "NL", "nl": "NL",
    "australie": "AU", "australia": "AU", "au": "AU",
    "danemark": "DK", "denmark": "DK", "dk": "DK",
    "singapour": "SG", "singapore": "SG", "sg": "SG",
    "luxembourg": "LU", "lu": "LU",
    "autriche": "AT", "austria": "AT", "at": "AT",
    "espagne": "ES", "spain": "ES", "espana": "ES", "españa": "ES", "es": "ES",
    "portugal": "PT", "pt": "PT",
}


def _normalize_country(name: str) -> str:
    """Convertit un nom de pays ou code libre en code ISO 2 lettres connu."""
    return _COUNTRY_CODE_MAP.get((name or "").strip().lower(), "")


# Message de repli quand aucune source officielle n'est disponible
_NO_SOURCE_RESPONSE = (
    "Je n'ai pas de source officielle vérifiée pour répondre précisément à cette question. "
    "Je vous recommande de consulter directement l'ambassade ou le consulat du pays concerné, "
    "ou les sites gouvernementaux officiels dédiés à l'immigration."
)


class ExpadationAgent(BaseAgent):
    """
    Agent RAG pour le conseil en expatriation.

    Orchestre IntentParser, QueryPlanner, DocumentRetriever et ReasoningEngine
    pour produire des réponses fondées sur des sources officielles vérifiées.
    """

    def __init__(self) -> None:
        """Initialise l'agent avec ses sous-agents et le retriever documentaire."""
        config = AgentConfig(
            name="ExpadationAgent",
            model=settings.llm_model_fast,
            temperature=0.0,
            max_tokens=2048,
            system_prompt_file="expat_main.txt",
        )
        super().__init__(config)

        self._retriever = DocumentRetriever()
        self._source_citer = SourceCiter()
        self._freshness_checker = FreshnessChecker()

        self._init_sub_agents()

    def _init_sub_agents(self) -> None:
        """Instancie et enregistre les trois sous-agents LLM."""
        # IntentParser — extrait pays/type de projet en JSON
        self.intent_parser = SubAgent(
            name="IntentParser",
            system_prompt=load_prompt("expat_intent_parser.txt"),
            model=settings.llm_model_fast,
            temperature=0.0,
            max_tokens=256,
        )
        self.register_sub_agent(self.intent_parser)

        # QueryPlanner — décompose la question en sous-requêtes documentaires
        self.query_planner = SubAgent(
            name="QueryPlanner",
            system_prompt=load_prompt("expat_query_planner.txt"),
            model=settings.llm_model_fast,
            temperature=0.0,
            max_tokens=512,
        )
        self.register_sub_agent(self.query_planner)

        # ReasoningEngine — synthétise la réponse finale depuis les extraits
        self.reasoning_engine = SubAgent(
            name="ReasoningEngine",
            system_prompt=load_prompt("expat_reasoning_engine.txt"),
            model=settings.llm_model_powerful,
            temperature=0.3,
            max_tokens=2048,
        )
        self.register_sub_agent(self.reasoning_engine)

        logger.info("[%s] 3 sous-agents initialisés.", self.name)

    # ── Pipeline principal ──────────────────────────────────────────────────────

    async def run(
        self,
        message: str,
        language: str = "fr",
        history: list[dict] | None = None,
    ) -> dict[str, Any]:
        """
        Exécute le pipeline RAG complet.

        Args:
            message:  Question de l'utilisateur.
            language: Code langue pour la réponse (ex. "fr", "en").
            history:  Historique de conversation (non utilisé dans ce pipeline,
                      conservé pour compatibilité avec l'interface BaseAgent).

        Returns:
            dict avec les clés :
              - success (bool)
              - response (str)
              - sources (list[dict])
              - freshness_warnings (list[str])
              - language (str)
            En cas d'erreur :
              - success: False
              - response (str)
              - error (str)
        """
        try:
            # ── Étape 1 : IntentParser ────────────────────────────────────────
            intent = await self._parse_intent(message)
            destination_raw = intent.get("destination_country", "")
            project_type = intent.get("project_type", "")

            # Normalisation pays → code ISO (ex. "Canada" → "CA")
            # Si le pays n'est pas dans le mapping, on passe "" → pas de filtre,
            # pour éviter qu'un filtre erroné retourne 0 résultat.
            destination = _normalize_country(destination_raw)

            logger.info(
                "[%s] Intention extraite : destination_raw=%s, destination=%s, project_type=%s",
                self.name,
                destination_raw or "(non précisé)",
                destination or "(pas de filtre pays)",
                project_type or "(non précisé)",
            )

            # ── Étape 2 : QueryPlanner ────────────────────────────────────────
            sub_queries = await self._plan_queries(message)

            logger.info(
                "[%s] %d sous-requêtes planifiées.",
                self.name,
                len(sub_queries),
            )

            # ── Étape 3 : DocumentRetriever ───────────────────────────────────
            # Note : le visa_type n'est pas transmis comme filtre car les valeurs
            # retournées par l'IntentParser peuvent ne pas correspondre exactement
            # aux valeurs ingérées. On laisse le retrieval vectoriel faire le tri.
            chunks = await self._retriever.retrieve(
                sub_queries=sub_queries,
                country=destination,
                visa_type="",
                match_count=6,
            )

            # ── Étape 4 : Garantie KPI — aucune source disponible ─────────────
            if not chunks:
                chunks = await self._retrieve_official_sources(
                    destination=destination,
                    project_type=project_type,
                )
            if not chunks:
                logger.warning("[%s] Aucune source officielle disponible.", self.name)
                return {
                    "success": True,
                    "response": _NO_SOURCE_RESPONSE,
                    "sources": [],
                    "freshness_warnings": [],
                    "language": language,
                }

            # ── Étape 5 : ReasoningEngine ─────────────────────────────────────
            response_text = await self._synthesize(message, chunks, language)

            # ── Étape 6 : Citations et fraîcheur ──────────────────────────────
            sources = self._source_citer.build_citations(chunks)
            freshness_warnings = self._freshness_checker.check(chunks)

            logger.info(
                "[%s] Réponse générée : %d sources, %d avertissements.",
                self.name,
                len(sources),
                len(freshness_warnings),
            )

            return {
                "success": True,
                "response": response_text,
                "sources": sources,
                "freshness_warnings": freshness_warnings,
                "language": language,
            }

        except Exception as exc:
            logger.error(
                "[%s] Erreur inattendue dans le pipeline : %s",
                self.name,
                exc,
                exc_info=True,
            )
            return {
                "success": False,
                "response": "Une erreur est survenue lors du traitement de votre demande. Veuillez réessayer.",
                "error": str(exc),
            }

    async def _retrieve_official_sources(
        self,
        destination: str,
        project_type: str,
    ) -> list[dict[str, Any]]:
        """Charge une page officielle pertinente et mise en cache si l'index est vide."""
        registered = SOURCE_REGISTRY.get(destination, [])
        if not registered:
            return []

        project_token = "".join(
            character
            for character in unicodedata.normalize("NFKD", project_type.strip().lower())
            if not unicodedata.combining(character)
        )
        aliases = _PROJECT_ALIASES.get(project_token, (project_token,) if project_token else ())
        scored_sources = [
            (
                sum(
                    alias in candidate.get("visa_type", "").lower()
                    for alias in aliases
                    if alias
                ),
                candidate,
            )
            for candidate in registered
        ]
        best_score, source = max(scored_sources, key=lambda item: item[0])
        if project_token and best_score == 0:
            logger.info(
                "[%s] Aucune source officielle adaptée au projet %s pour %s.",
                self.name,
                project_token,
                destination,
            )
            return []
        url = source["url"]
        cached = _official_source_cache.get(url)
        if cached and monotonic() - cached[0] < _OFFICIAL_SOURCE_CACHE_TTL_SECONDS:
            return [dict(cached[1])]

        lock = _official_source_locks.setdefault(url, asyncio.Lock())
        async with lock:
            cached = _official_source_cache.get(url)
            if cached and monotonic() - cached[0] < _OFFICIAL_SOURCE_CACHE_TTL_SECONDS:
                return [dict(cached[1])]
            try:
                scraped = await asyncio.wait_for(
                    scrape_url(
                        url,
                        content_selector=source.get("content_selector", ""),
                    ),
                    timeout=_OFFICIAL_SOURCE_TIMEOUT_SECONDS,
                )
            except Exception as exc:
                logger.warning(
                    "[%s] Source officielle inaccessible: %s (%s)",
                    self.name,
                    url,
                    type(exc).__name__,
                )
                return []
            content = str(scraped.get("markdown", "")).strip()
            if not content:
                return []
            chunk = {
                "id": url,
                "content": content[:12_000],
                "source_url": url,
                "country": destination,
                "visa_type": source.get("visa_type", ""),
                "scraped_at": scraped.get("scraped_at", ""),
            }
            _official_source_cache[url] = (monotonic(), chunk)
        logger.info(
            "[%s] Repli direct officiel: %d source(s).",
            self.name,
            1,
        )
        return [dict(chunk)]

    # ── Méthodes internes ───────────────────────────────────────────────────────

    async def _parse_intent(self, message: str) -> dict[str, str]:
        """
        Appelle IntentParser et retourne le dict extrait.
        En cas d'échec de parsing JSON, retourne un dict vide (fallback gracieux).
        """
        raw = await self.intent_parser.run(task=message)
        parsed = self._parse_json(raw)
        if parsed and isinstance(parsed, dict):
            return parsed
        logger.warning(
            "[%s] IntentParser : parsing JSON échoué — fallback dict vide. Brut : %s",
            self.name,
            raw[:200],
        )
        return {"origin_country": "", "destination_country": "", "project_type": ""}

    async def _plan_queries(self, message: str) -> list[str]:
        """
        Appelle QueryPlanner et retourne la liste de sous-requêtes.
        Fallback : retourne la question brute comme unique sous-requête.
        """
        raw = await self.query_planner.run(task=message)
        parsed = self._parse_json(raw)
        if parsed and isinstance(parsed, dict):
            sub_queries = parsed.get("sub_queries", [])
            if sub_queries and isinstance(sub_queries, list):
                # Nettoyage : garder uniquement les chaînes non vides
                valid = [str(q).strip() for q in sub_queries if str(q).strip()]
                if valid:
                    return valid

        logger.warning(
            "[%s] QueryPlanner : parsing JSON échoué ou liste vide — fallback question brute. Brut : %s",
            self.name,
            raw[:200],
        )
        return [message]

    async def _synthesize(
        self,
        question: str,
        chunks: list[dict[str, Any]],
        language: str,
    ) -> str:
        """
        Construit le contexte documentaire et appelle le ReasoningEngine.

        Args:
            question: Question initiale de l'utilisateur.
            chunks:   Chunks récupérés et classés par RRF.
            language: Langue cible de la réponse.

        Returns:
            Réponse synthétisée par le ReasoningEngine.
        """
        # Construction du bloc de contexte documentaire
        extracts_parts: list[str] = []
        for idx, chunk in enumerate(chunks, start=1):
            source_url = chunk.get("source_url", "source inconnue")
            content = chunk.get("content", "").strip()
            country = chunk.get("country", "")
            visa_type = chunk.get("visa_type", "")

            meta_parts = [f"Source : {source_url}"]
            if country:
                meta_parts.append(f"Pays : {country}")
            if visa_type:
                meta_parts.append(f"Type de visa : {visa_type}")

            extracts_parts.append(
                f"--- Extrait {idx} ---\n"
                + " | ".join(meta_parts) + "\n"
                + content
            )

        extracts_block = "\n\n".join(extracts_parts)
        lang_instruction = f"[Réponds impérativement en langue : {language}]\n\n" if language else ""

        task = (
            f"{lang_instruction}"
            f"Question de l'utilisateur :\n{question}\n\n"
            f"Extraits de documents officiels :\n\n{extracts_block}"
        )

        response = await self.reasoning_engine.run(task=task)
        return response
