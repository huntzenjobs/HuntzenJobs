"""Instrumentation temporaire, anonyme et opt-in de ``GET /api/auth/me``."""

import logging
import os
from time import perf_counter

from fastapi import Response

logger = logging.getLogger(__name__)


def auth_me_timing_enabled(environment: str) -> bool:
    """Autorise les mesures seulement en staging et après activation explicite."""
    return (
        environment == "staging"
        and os.getenv("AUTH_ME_TIMING_ENABLED", "").strip().lower() == "true"
    )


class AuthMeTiming:
    """Collecte des durées sans conserver d'identifiant ni de valeur métier."""

    def __init__(self, environment: str) -> None:
        self.enabled = auth_me_timing_enabled(environment)
        self._durations: list[tuple[str, float, str | None]] = []

    def start(self) -> float | None:
        """Démarre une mesure uniquement lorsque l'instrumentation est active."""
        return perf_counter() if self.enabled else None

    def stop(
        self,
        metric: str,
        started_at: float | None,
        description: str | None = None,
    ) -> None:
        """Enregistre une durée sûre pour Server-Timing et les logs structurés."""
        if self.enabled and started_at is not None:
            duration_ms = (perf_counter() - started_at) * 1000
            self._durations.append((metric, duration_ms, description))

    def apply(self, response: Response) -> None:
        """Ajoute les mesures au succès, sans modifier le corps de la réponse."""
        if not self.enabled:
            return

        entries = []
        timing_log: dict[str, float | str] = {}
        for metric, duration_ms, description in self._durations:
            entries.append(f"{metric};dur={duration_ms:.1f}")
            timing_log[metric] = round(duration_ms, 1)
            if description is not None:
                entries[-1] += f';desc="{description}"'

        if entries:
            response.headers["Server-Timing"] = ", ".join(entries)
        logger.info("auth_me_timing", extra={"auth_me_timing": timing_log})
