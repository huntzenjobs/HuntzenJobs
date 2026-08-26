"""
Request Deduplication — Idempotency via Redis
=============================================
Helper mutualisé pour éviter les double-soumissions sur les routes ARQ.

Mécanisme :
  1. Le client fournit un `request_id` optionnel (UUID ou toute chaîne stable).
  2. Le serveur calcule TOUJOURS la clé déterministe via
     `build_dedup_request_id` (hash SHA-1 tronqué). Un `request_id` explicite est
     une donnée d'entrée, jamais la clé Redis : les routes le scellent avec leur
     namespace, le type d'assistant et le `user_id`. S'il est absent, la clé
     automatique conserve le payload session/message existant.
  3. `register_request` tente SET NX : si la clé n'existait pas, retourne None
     (nouvelle requête). Si elle existait, retourne la valeur stockée :
     "__pending__" (job en cours d'enqueue) ou le job_id réel.
  4. `store_job_id` écrase le placeholder "__pending__" par le job_id ARQ SANS NX.
  5. L'appelant retourne le job_id existant au lieu d'enqueue un doublon.

Sentinel :
  "__pending__" (double underscores) est utilisé comme valeur interne temporaire.
  Les request_id fournis par le client sont toujours hachés et scopés côté serveur;
  ils ne peuvent donc ni contrôler directement une clé Redis, ni valoir
  "__pending__".

Dégradation gracieuse : si Redis est indisponible, `register_request` retourne None
(skip silencieux) et `store_job_id` est no-op. Le comportement sans dédup est conservé.

Adapté depuis la branche latency_fix (commit 14bdb94, 2026-03-18).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any

from src.utils.cache import get_redis

logger = logging.getLogger(__name__)

_DEDUP_PREFIX = "dedup:"
_DEFAULT_TTL = 120  # secondes
_PENDING_SENTINEL = "__pending__"
_PENDING_WAIT_TIMEOUT_SECONDS = 0.5
_PENDING_POLL_INTERVAL_SECONDS = 0.05
_JOB_OWNER_PREFIX = "queue:job-owner:"
_JOB_OWNER_TTL = 3700  # légèrement au-delà du keep_result ARQ (1 h)


class RequestEnqueuePendingError(RuntimeError):
    """Le premier appel n'a pas encore publié son job_id dans le délai borné."""

    def __init__(self, request_id: str) -> None:
        super().__init__(f"La requête {request_id} est encore en cours de mise en file")
        self.request_id = request_id


async def _wait_for_pending_job_id(
    redis: Any,
    key: str,
    request_id: str,
) -> str | None:
    """Attend brièvement que l'enqueue concurrent remplace le sentinel."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + _PENDING_WAIT_TIMEOUT_SECONDS

    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise RequestEnqueuePendingError(request_id)

        await asyncio.sleep(min(_PENDING_POLL_INTERVAL_SECONDS, remaining))
        existing: str | None = await redis.get(key)
        if existing is None:
            # La fenêtre de déduplication a expiré : l'appel redevient nouveau.
            return None
        if existing != _PENDING_SENTINEL:
            return existing


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
        - `str` (job_id réel) : clé existante avec job_id → doublon détecté, retourner ce job_id.

    Si un enqueue concurrent est encore au stade `"__pending__"`, attend au plus
    500 ms son job_id puis lève `RequestEnqueuePendingError`. Cette exception ne
    doit jamais être transformée en nouvel enqueue ou en fallback synchrone.

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
            return await _wait_for_pending_job_id(redis, key, request_id)

        # job_id réel stocké
        logger.info(
            "[request_dedup] requête dupliquée détectée",
            extra={"request_id": request_id, "existing_job_id": existing},
        )
        return existing

    except RequestEnqueuePendingError:
        raise
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


async def clear_pending_request(request_id: str) -> None:
    """Supprime uniquement un sentinel d'enqueue abandonné."""
    redis = await get_redis()
    if redis is None:
        return
    key = f"{_DEDUP_PREFIX}{request_id}"
    try:
        if await redis.get(key) == _PENDING_SENTINEL:
            await redis.delete(key)
    except Exception as exc:
        logger.warning(
            "[request_dedup] impossible de nettoyer le sentinel pending: %s",
            exc,
            extra={"request_id": request_id},
        )


async def store_job_owner(
    job_id: str,
    user_id: str,
    ttl: int = _JOB_OWNER_TTL,
) -> bool:
    """Associe un job ARQ à son propriétaire avant l'enqueue.

    Un échec retourne ``False`` afin que l'appelant n'accepte jamais un job qui
    deviendrait immédiatement impossible à consulter.
    """
    redis = await get_redis()
    if redis is None:
        return False
    try:
        await redis.set(f"{_JOB_OWNER_PREFIX}{job_id}", user_id, ex=ttl)
        return True
    except Exception as exc:
        logger.warning(
            "[request_dedup] impossible de stocker le propriétaire du job: %s",
            exc,
            extra={"job_id": job_id},
        )
        return False


async def get_job_owner(job_id: str) -> str | None:
    """Retourne le propriétaire d'un job sans exposer son résultat."""
    redis = await get_redis()
    if redis is None:
        return None
    try:
        owner = await redis.get(f"{_JOB_OWNER_PREFIX}{job_id}")
        if isinstance(owner, bytes):
            return owner.decode("utf-8")
        return str(owner) if owner else None
    except Exception as exc:
        logger.warning(
            "[request_dedup] impossible de lire le propriétaire du job: %s",
            exc,
            extra={"job_id": job_id},
        )
        return None


async def clear_job_owner(job_id: str) -> None:
    """Nettoie l'ownership si ARQ refuse un identifiant préalloué."""
    redis = await get_redis()
    if redis is None:
        return
    try:
        await redis.delete(f"{_JOB_OWNER_PREFIX}{job_id}")
    except Exception as exc:
        logger.warning(
            "[request_dedup] impossible de nettoyer le propriétaire du job: %s",
            exc,
            extra={"job_id": job_id},
        )


async def estimate_arq_wait_seconds(
    pool: Any,
    active_fallback: int,
    *,
    worker_slots: int = 5,
    job_timeout_seconds: int = 120,
) -> int:
    """Estimation conservatrice basée sur la profondeur réelle du ZSET ARQ."""
    fallback = max(8, active_fallback * 8)
    try:
        queue_depth = int(await pool.zcard("arq:queue"))
    except Exception:
        return fallback
    batches = max(1, (queue_depth + worker_slots - 1) // worker_slots)
    return max(fallback, batches * job_timeout_seconds)


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
