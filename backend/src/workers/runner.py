"""Explicit ARQ worker runner for local Docker reliability.

This bypasses ARQ CLI settings resolution and constructs Worker directly
with explicit redis settings and queue configuration.
"""

from __future__ import annotations

import sys

from arq.worker import Worker

from src.workers.settings import (
    _get_redis_settings,
    QUEUE_ASSISTANT,
    QUEUE_BRANDING,
    QUEUE_COACH,
    QUEUE_COVER_LETTER,
    QUEUE_CV_ADAPT,
)
from src.workers.tasks import (
    assistant_task,
    branding_task,
    coach_task,
    cover_letter_task,
    cv_adapt_task,
    shutdown,
    startup,
)


def _build_worker(kind: str) -> Worker:
    base_kwargs = dict(
        on_startup=startup,
        on_shutdown=shutdown,
        redis_settings=_get_redis_settings(),
        job_timeout=120,
        keep_result=3600,
        retry_jobs=True,
        max_tries=3,
    )

    if kind == "coach":
        return Worker(functions=[coach_task], queue_name=QUEUE_COACH, max_jobs=120, **base_kwargs)
    if kind == "assistant":
        return Worker(functions=[assistant_task], queue_name=QUEUE_ASSISTANT, max_jobs=200, **base_kwargs)
    if kind == "branding":
        return Worker(functions=[branding_task], queue_name=QUEUE_BRANDING, max_jobs=80, **base_kwargs)
    if kind == "cv_adapt":
        return Worker(functions=[cv_adapt_task], queue_name=QUEUE_CV_ADAPT, max_jobs=100, **base_kwargs)
    if kind == "cover_letter":
        return Worker(functions=[cover_letter_task], queue_name=QUEUE_COVER_LETTER, max_jobs=80, **base_kwargs)

    raise SystemExit(
        "Unknown worker kind. Use one of: coach, assistant, branding, cv_adapt, cover_letter"
    )


def main() -> None:
    kind = sys.argv[1] if len(sys.argv) > 1 else "assistant"
    worker = _build_worker(kind)
    worker.run()


if __name__ == "__main__":
    main()
