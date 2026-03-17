"""
Public assistant suggestions endpoint.
Returns active suggestions for a given assistant_id.
"""
from fastapi import APIRouter, Query
from typing import Optional
from src.api.deps import get_supabase_client
from structlog import get_logger

logger = get_logger(__name__)
router = APIRouter()


@router.get("/suggestions")
async def get_suggestions(assistant_id: Optional[str] = Query(default=None)):
    """Get active suggestions for all or a specific assistant."""
    supabase = get_supabase_client()
    try:
        query = supabase.table("assistant_suggestions").select(
            "id, assistant_id, text, display_order"
        ).eq("is_active", True).order("display_order")

        if assistant_id:
            query = query.eq("assistant_id", assistant_id)

        result = query.execute()

        # Group by assistant_id
        grouped: dict = {}
        for row in (result.data or []):
            aid = row["assistant_id"]
            if aid not in grouped:
                grouped[aid] = []
            grouped[aid].append({"id": row["id"], "text": row["text"]})

        if assistant_id:
            return {"suggestions": grouped.get(assistant_id, [])}
        return {"suggestions": grouped}
    except Exception as e:
        logger.warning(f"Failed to fetch suggestions: {e}")
        return {"suggestions": {} if not assistant_id else []}
