"""Lecture bornée des fichiers entrants pour éviter les allocations non contrôlées."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
_T = TypeVar("_T")


async def read_upload_limited(
    file: UploadFile,
    max_size: int = MAX_UPLOAD_SIZE_BYTES,
) -> bytes:
    """Lit au plus ``max_size + 1`` octets et rejette immédiatement le surplus."""
    content = await file.read(max_size + 1)
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fichier trop volumineux (maximum {max_size // (1024 * 1024)} Mo)",
        )
    return content


async def await_extraction_cleanup(awaitable: Awaitable[_T]) -> _T:
    """Attend le parseur réel avant de libérer son lease, même après annulation HTTP."""
    task = asyncio.ensure_future(awaitable)
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        try:
            await task
        except Exception:
            pass
        raise


async def run_extraction_sync(
    function: Callable[..., _T],
    *args: Any,
    **kwargs: Any,
) -> _T:
    """Exécute un parseur synchrone hors event loop sans abandonner son lease."""
    return await await_extraction_cleanup(
        asyncio.to_thread(function, *args, **kwargs)
    )
