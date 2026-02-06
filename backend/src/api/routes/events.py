from typing import Optional
from fastapi import APIRouter, Query
from src.services.events.provider import search_job_fairs

router = APIRouter()

@router.get("", response_model=dict)
async def get_events(
    region: str = Query(default="", description="Filter by region"),
    sector: str = Query(default="", description="Filter by sector"),
    public: str = Query(default="", description="Filter by target public"),
    event_type: str = Query(default="", description="Filter by event type"),
    format: str = Query(default="", description="Filter by format (physique/virtuel)")
):
    """
    Get professional events and job fairs.
    """
    return await search_job_fairs(
        region=region,
        sector=sector,
        public=public,
        event_type=event_type,
        format_type=format,
        include_mock=False
    )

@router.post("", response_model=dict)
async def post_events(
    data: dict
):
    """
    Search for professional events (POST version).
    """
    return await search_job_fairs(
        region=data.get("region", ""),
        sector=data.get("sector", ""),
        public=data.get("public", ""),
        event_type=data.get("event_type", ""),
        format_type=data.get("format", ""),
        include_mock=False
    )
