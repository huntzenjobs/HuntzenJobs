"""
Expat RAG — Jina Embeddings Service
=====================================
Génère des embeddings via l'API Jina AI v3 (free tier).
Dimension fixée à 1024 pour pgvector (jina-embeddings-v3).

Usage :
    vecteurs = await embed_texts(["texte 1", "texte 2"])
    vecteur  = await embed_query("quelle est la procédure visa étudiant ?")
"""

import logging
from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
EMBEDDING_DIM: int = 1024
JINA_MODEL: str = "jina-embeddings-v3"
JINA_URL: str = "https://api.jina.ai/v1/embeddings"

# Nombre maximum de textes par appel API (recommandation Jina free tier)
_BATCH_SIZE: int = 64


# ---------------------------------------------------------------------------
# Helpers Tenacity
# ---------------------------------------------------------------------------

def _is_retryable(exc: BaseException) -> bool:
    """Retente uniquement sur erreurs réseau ou réponses 429 / 5xx."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, _JinaAPIError) and exc.status_code in {429, 500, 502, 503, 504}:
        return True
    return False


class _JinaAPIError(Exception):
    """Erreur levée quand l'API Jina retourne un statut non-2xx."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Fonctions publiques
# ---------------------------------------------------------------------------

@retry(
    retry=retry_if_exception(_is_retryable),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    reraise=True,
)
async def embed_texts(
    texts: list[str],
    task: str = "retrieval.passage",
) -> list[list[float]]:
    """
    Génère les embeddings pour une liste de textes.

    Args:
        texts: Liste de chaînes à encoder (max 64 par lot).
        task:  Type de tâche Jina — "retrieval.passage" pour les documents,
               "retrieval.query" pour les requêtes utilisateur.

    Returns:
        Liste de vecteurs float de dimension 1024.

    Raises:
        RuntimeError: Si la clé Jina est absente.
        _JinaAPIError: Sur réponse non-2xx non retentable.
    """
    settings = get_settings()
    api_key = settings.get_jina_key()

    if not api_key:
        raise RuntimeError(
            "JINA_API_KEY manquante — obtenir une clé free tier sur https://jina.ai/"
        )

    if not texts:
        return []

    payload: dict[str, Any] = {
        "model": JINA_MODEL,
        "task": task,
        "dimensions": EMBEDDING_DIM,
        "input": texts,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    logger.info(
        "Appel Jina embeddings",
        extra={"nb_texts": len(texts), "task": task, "model": JINA_MODEL},
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(JINA_URL, json=payload, headers=headers)

    if response.status_code != 200:
        error_body = response.text[:300]
        logger.error(
            "Erreur API Jina",
            extra={"status_code": response.status_code, "body": error_body},
        )
        raise _JinaAPIError(response.status_code, f"Jina API {response.status_code}: {error_body}")

    data = response.json()
    embeddings: list[list[float]] = [item["embedding"] for item in data["data"]]

    logger.info(
        "Embeddings générés",
        extra={"nb_vecteurs": len(embeddings), "dim": EMBEDDING_DIM},
    )
    return embeddings


async def embed_texts_batched(
    texts: list[str],
    task: str = "retrieval.passage",
) -> list[list[float]]:
    """
    Wrapper qui découpe automatiquement en lots de _BATCH_SIZE.
    Utilisé pour de grandes listes de chunks (> 64 éléments).
    """
    if not texts:
        return []

    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i : i + _BATCH_SIZE]
        batch_embeddings = await embed_texts(batch, task=task)
        all_embeddings.extend(batch_embeddings)

    return all_embeddings


async def embed_query(text: str) -> list[float]:
    """
    Génère l'embedding d'une requête utilisateur.

    Utilise la tâche "retrieval.query" (optimisée pour la recherche).

    Args:
        text: Requête utilisateur à encoder.

    Returns:
        Vecteur float de dimension 1024.
    """
    results = await embed_texts([text], task="retrieval.query")
    return results[0]
