"""
Expadation API Routes
=====================
Endpoints pour l'agent de conseil en expatriation (Expadation).

POST /ask — Pose une question à l'agent RAG expatriation.
"""

import logging

from fastapi import APIRouter, HTTPException, Request, status

from src.api.deps import CurrentUserDep, ExpadationAgentDep
from src.api.middleware import limiter
from src.models.schemas import ExpatAskRequest, ExpatAskResponse, ExpatSource

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/ask", response_model=ExpatAskResponse)
@limiter.limit("10/minute")
async def expat_ask(
    request: Request,
    data: ExpatAskRequest,
    agent: ExpadationAgentDep,
    current_user: CurrentUserDep,
) -> ExpatAskResponse:
    """
    Pose une question à l'agent Expadation.

    Authentification requise. Limite : 10 requêtes/minute par IP.
    L'agent interroge une base documentaire scrapée sur les destinations
    d'expatriation et retourne une réponse enrichie avec les sources.
    """
    user_id = current_user.get("id")

    # TODO quota : ajouter check_quota(user_id, "expat") quand la feature
    # sera ajoutée au plan (RPC get_quota_status).

    try:
        result = await agent.run(
            message=data.message,
            language=data.language,
            history=data.history,
        )
    except Exception as exc:
        exc_str = str(exc).lower()
        if "rate limit" in exc_str or "429" in exc_str or "ratelimit" in exc_str.replace(" ", ""):
            logger.warning(f"[expat/ask] Groq rate limit atteint pour user={user_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Service IA temporairement saturé. Réessayez dans quelques secondes.",
            ) from None
        logger.error(f"[expat/ask] Erreur agent pour user={user_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur IA inattendue : {str(exc)[:200]}",
        ) from None

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Erreur inconnue de l'agent Expadation"),
        )

    # Construire les sources typées (best-effort : champ optionnel dans l'agent)
    raw_sources = result.get("sources", [])
    typed_sources: list[ExpatSource] = []
    for src in raw_sources:
        if isinstance(src, dict):
            try:
                typed_sources.append(ExpatSource(
                    url=src.get("url", ""),
                    scraped_at=src.get("scraped_at", ""),
                    country=src.get("country", ""),
                ))
            except Exception:
                pass  # source malformée ignorée silencieusement

    logger.info(f"[expat/ask] Réponse OK — user={user_id} sources={len(typed_sources)}")

    return ExpatAskResponse(
        success=True,
        response=result.get("response", ""),
        sources=typed_sources,
        freshness_warnings=result.get("freshness_warnings", []),
        language=result.get("language", data.language),
    )
