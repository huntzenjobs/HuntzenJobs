"""
Request Deduplication — Idempotency via Redis
=============================================
Helper mutualisé pour éviter les double-soumissions sur les routes ARQ.

Mécanisme :
  1. Le client fournit un `request_id` optionnel (UUID ou toute chaîne stable).
  2. Si absent, le serveur calcule un id déterministe via `build_dedup_request_id`
     (hash SHA-1 du payload complet).
  3. `register_request` tente SET NX : si la clé n'existait pas, retourne None
     (nouvelle requête). Si elle existait, retourne la valeur stockée :
     "__pending__" (job en cours d'enqueue) ou le job_id réel.
  4. `store_job_id` écrase le placeholder "__pending__" par le job_id ARQ SANS NX.
  5. L'appelant retourne le job_id existant au lieu d'enqueue un doublon.

Sentinel :
  "__pending__" (double underscores) est utilisé comme valeur interne temporaire.
  Les request_id fournis par le client passent TOUJOURS par `build_dedup_request_id`
  (hash SHA-1) — ils ne peuvent donc jamais valoir "__pending__".

Dégradation gracieuse : si Redis est indisponible, `register_request` retourne None
(skip silencieux) et `store_job_id` est no-op. Le comportement sans dédup est conservé.

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
_PENDING_SENTINEL = "__pending__"


def build_dedup_request_id(namespace: str, *parts: Any) -> str:
    """Calcule un request_id déterministe depuis un namespace et des données de payload.

    Utilise le contenu COMPLET de chaque part (pas de troncature) pour éviter les
    collisions entre messages partageant un préfixe commun.

    Exemple :
        build_dedup_request_id("assistant", "job-scout", user_id, session_id, message)

    Returns:
        Chaîne hexadécimale SHA-1 tronquée à 24 caractères, préfixée du namespace.
        Garantit que la valeur retournée ne peut jamais valoir "__pending__".
    """
    raw = ":".join(str(p) for p in (namespace, *parts))
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{namespace}:{digest}"


async def register_request(
    request_id: str,
    ttl: int = _DEFAULT_TTL,
) -> str | None:
    """Tente d'enregistrer une nouvelle requête (SET NX).

    Args:
        request_id: Identifiant de la requête (produit par `build_dedup_request_id`).
        ttl:        Durée de vie de la clé Redis en secondes (défaut 120s).

    Returns:
        - `None`              : clé créée avec succès → nouvelle requête, l'appelant doit enqueue.
        - `"__pending__"`     : clé existante mais job pas encore enqueued → en cours d'enqueue.
        - `str` (job_id réel) : clé existante avec job_id → doublon détecté, retourner ce job_id.

    En cas d'erreur Redis : retourne None (dégradation gracieuse, pas de dédup).
    """
    redis = await get_redis()
    if redis is None:
        return None

    key = f"{_DEDUP_PREFIX}{request_id}"
    try:
        # SET NX : retourne True si créé, None/False si existait déjà
        created = await redis.set(key, _PENDING_SENTINEL, ex=ttl, nx=True)
        if created:
            # Clé nouvellement créée : requête nouvelle
            return None

        # Clé existante : lire la valeur courante
        existing: str | None = await redis.get(key)
        if existing is None:
            # Expirée entre le SET et le GET (edge case) → traiter comme nouvelle
            return None

        if existing == _PENDING_SENTINEL:
            logger.info(
                "[request_dedup] requête en cours d'enqueue (pending)",
                extra={"request_id": request_id},
            )
            return _PENDING_SENTINEL

        # job_id réel stocké
        logger.info(
            "[request_dedup] requête dupliquée détectée",
            extra={"request_id": request_id, "existing_job_id": existing},
        )
        return existing

    except Exception as exc:
        logger.warning(
            f"[request_dedup] Redis error, déduplication ignorée: {exc}",
            extra={"request_id": request_id},
        )
        return None


async def store_job_id(
    request_id: str,
    job_id: str,
    ttl: int = _DEFAULT_TTL,
) -> None:
    """Remplace le placeholder "__pending__" par le job_id ARQ réel.

    Utilise SET SANS NX pour écraser le placeholder.

    Args:
        request_id: Identifiant de la requête (même valeur que dans `register_request`).
        job_id:     Identifiant du job ARQ à persister.
        ttl:        Durée de vie restante de la clé Redis en secondes.
    """
    redis = await get_redis()
    if redis is None:
        # Redis indisponible — no-op (dégradation gracieuse)
        return

    key = f"{_DEDUP_PREFIX}{request_id}"
    try:
        await redis.set(key, job_id, ex=ttl)
    except Exception as exc:
        logger.warning(
            f"[request_dedup] impossible de stocker le job_id: {exc}",
            extra={"request_id": request_id, "job_id": job_id},
        )


# ---------------------------------------------------------------------------
# Compatibilité — wrapper conservé pour ne pas casser les imports existants.
# Préférer register_request / store_job_id dans le nouveau code.
# ---------------------------------------------------------------------------

async def get_or_register_request(
    request_id: str,
    job_id: str,
    ttl: int = _DEFAULT_TTL,
) -> str | None:
    """[DEPRECATED] Ancien helper — conservé pour compatibilité.

    Comportement :
      - Si `job_id` == "_pending_" (ancien sentinel) : appelle `register_request`.
      - Sinon : appelle `store_job_id` et retourne None.

    Utilisez directement `register_request` + `store_job_id` dans le nouveau code.
    """
    if job_id in ("_pending_", _PENDING_SENTINEL):
        return await register_request(request_id, ttl)
    await store_job_id(request_id, job_id, ttl)
    return None
