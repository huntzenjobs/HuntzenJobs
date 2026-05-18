"""
Request Deduplication — Idempotency via Redis
=============================================
Helper mutualisé pour éviter les double-soumissions sur les routes ARQ.

Mécanisme :
  1. Le client fournit un `request_id` optionnel (UUID ou toute chaîne stable).
  2. Si absent, le serveur peut en calculer un déterministe (hash SHA-1 du payload).
  3. Avant d'enqueue, on vérifie dans Redis la clé `dedup:<request_id>`.
     - Si la clé existe  → un job est déjà en cours, on retourne le job_id existant.
     - Sinon             → on enregistre le nouveau job_id (TTL court) et on retourne None.
  4. L'appelant retourne le job_id existant au lieu d'enqueue un doublon.

Dégradation gracieuse : si Redis est indisponible, la déduplication est transparente
(skip silencieux), le comportement sans dédup est conservé.

Adapté depuis la branche latency_fix (commit 14bdb94, 2026-03-18).
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from src.utils.cache import get_redis

logger = logging.getLogger(__name__)

_DEDUP_PREFIX = "dedup:"
_DEFAULT_TTL = 120  # secondes


def build_dedup_request_id(namespace: str, *parts: Any) -> str:
    """Calcule un request_id déterministe depuis un namespace et des données de payload.

    Exemple :
        build_dedup_request_id("assistant", "job-scout", user_id, session_id, message[:50])

    Returns:
        Chaîne hexadécimale SHA-1 tronquée à 24 caractères, préfixée du namespace.
    """
    raw = ":".join(str(p) for p in (namespace, *parts))
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{namespace}:{digest}"


async def get_or_register_request(
    request_id: str,
    job_id: str,
    ttl: int = _DEFAULT_TTL,
) -> str | None:
    """Vérifie si un job existe déjà pour ce request_id, sinon enregistre le nouveau.

    Args:
        request_id: Identifiant de la requête (fourni par le client ou calculé).
        job_id:     Identifiant du job ARQ qui vient d'être (ou va être) enqueued.
        ttl:        Durée de vie de la clé Redis en secondes (défaut 120s).

    Returns:
        - `str`  : job_id existant si une requête identique était déjà en cours.
        - `None` : la requête est nouvelle, on peut enqueue normalement.
    """
    redis = await get_redis()
    if redis is None:
        # Redis indisponible — déduplication transparente désactivée
        return None

    key = f"{_DEDUP_PREFIX}{request_id}"
    try:
        existing_job_id: str | None = await redis.get(key)
        if existing_job_id:
            logger.info(
                "[request_dedup] requête dupliquée détectée",
                extra={"request_id": request_id, "existing_job_id": existing_job_id},
            )
            return existing_job_id

        # Première occurrence : enregistrer avec SET NX + TTL
        await redis.set(key, job_id, ex=ttl, nx=True)
        return None
    except Exception as exc:
        # Toute erreur Redis = skip silencieux (dégradation gracieuse)
        logger.warning(
            f"[request_dedup] Redis error, déduplication ignorée: {exc}",
            extra={"request_id": request_id},
        )
        return None
