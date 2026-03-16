"""
User Events Service
====================
Logging centralisé des événements utilisateurs dans la table user_events.
Alimente le fil temps réel de l'admin (/admin/live).

Pattern : client Supabase passé en paramètre (même pattern que notifications.py).
CRITIQUE : toujours dans try/except — le tracking ne doit JAMAIS planter une route.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def log_event(
    supabase,
    event_name: str,
    event_label: Optional[str] = None,
    category: str = "action",
    user_id: Optional[str] = None,
    feature: Optional[str] = None,
    severity: str = "info",
    properties: Optional[dict] = None,
    source: str = "backend",
    error_code: Optional[str] = None,
    duration_ms: Optional[int] = None,
) -> None:
    """
    Insère un événement dans user_events.

    Ne lève jamais d'exception — log un warning si échec.
    Appelé depuis les routes après chaque action significative.

    Args:
        supabase:     Client Supabase (passé par la route appelante)
        event_name:   Identifiant technique de l'événement (ex: "coach_used")
        event_label:  Label lisible pour l'admin (ex: "Marie a utilisé le Coach")
        category:     "action" | "payment" | "auth" | "error" | "alert"
        user_id:      UUID utilisateur (None si non authentifié)
        feature:      Feature concernée (ex: "coach", "cv_analysis")
        severity:     "info" | "success" | "warning" | "error"
        properties:   Données métier supplémentaires (arq_job_id, score, etc.)
        source:       "backend" | "frontend"
        error_code:   Code d'erreur technique (ex: "GROQ_RATE_LIMIT", "PDF_CORRUPT")
        duration_ms:  Durée de l'opération en millisecondes
    """
    try:
        payload = {
            "event_name": event_name,
            "event_label": event_label,
            "category": category,
            "severity": severity,
            "properties": properties or {},
            "source": source,
        }
        if user_id:
            payload["user_id"] = user_id
        if feature:
            payload["feature"] = feature
        if error_code:
            payload["error_code"] = error_code
        if duration_ms is not None:
            payload["duration_ms"] = duration_ms

        supabase.table("user_events").insert(payload).execute()

    except Exception as e:
        logger.warning(f"[user_events] Échec log_event '{event_name}': {e}")


def purge_old_user_events(supabase, days: int = 30) -> int:
    """
    Supprime les user_events antérieurs à `days` jours.
    Retourne le nombre de lignes supprimées (-1 si erreur).
    Ne lève jamais d'exception.
    """
    from datetime import datetime, timezone, timedelta
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        res = supabase.table("user_events").delete().lt("created_at", cutoff).execute()
        deleted = len(res.data) if res.data else 0
        logger.info(f"[user_events] purge: {deleted} événements supprimés (>{days}j)")
        return deleted
    except Exception as e:
        logger.warning(f"[user_events] purge_old_user_events failed: {e}")
        return -1
