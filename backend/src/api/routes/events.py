"""
Job Fairs / Events API Routes
=============================
Endpoints for searching job fairs and employment events.
"""

from fastapi import APIRouter, Query

from src.services.events.provider import search_job_fairs

router = APIRouter()


@router.get("/search")
async def search_events(
    region: str = Query(default="", description="Filter by region"),
    sector: str = Query(default="", description="Filter by sector"),
    public: str = Query(default="", description="Filter by target public"),
    event_type: str = Query(default="", description="Filter by event type"),
    format_type: str = Query(default="", description="Filter by format (physique/virtuel)")
):
    """
    Search for job fairs and professional events.
    """
    result = await search_job_fairs(
        region=region,
        sector=sector,
        public=public,
        event_type=event_type,
        format_type=format_type,
        include_mock=False
    )
    # Add missing fields expected by frontend
    return {
        **result,
        "message": "Search completed successfully",
        "filters_applied": {
            "region": region,
            "sector": sector,
            "public": public,
            "event_type": event_type,
            "format_type": format_type,
        }
    }


@router.post("/search")
async def search_events_post(data: dict):
    """
    Search for professional events (POST version).
    """
    region = data.get("region", "")
    sector = data.get("sector", "")
    public = data.get("public", "")
    event_type = data.get("event_type", "")
    format_type = data.get("format_type", "")

    result = await search_job_fairs(
        region=region,
        sector=sector,
        public=public,
        event_type=event_type,
        format_type=format_type,
        include_mock=False
    )
    # Add missing fields expected by frontend
    return {
        **result,
        "message": "Search completed successfully",
        "filters_applied": {
            "region": region,
            "sector": sector,
            "public": public,
            "event_type": event_type,
            "format_type": format_type,
        }
    }


@router.get("/regions")
async def get_regions():
    """
    Get list of available French regions for filtering.
    """
    regions = [
        "Île-de-France",
        "Auvergne-Rhône-Alpes",
        "Provence-Alpes-Côte d'Azur",
        "Occitanie",
        "Nouvelle-Aquitaine",
        "Grand Est",
        "Hauts-de-France",
        "Bretagne",
        "Pays de la Loire",
        "Centre-Val de Loire",
        "Normandie",
        "Bourgogne-Franche-Comté",
        "Corse",
    ]
    return {"success": True, "regions": regions, "count": len(regions)}


@router.get("/sectors")
async def get_sectors():
    """
    Get list of available job sectors for filtering.
    """
    sectors = [
        "tous",
        "tech",
        "industrie",
        "sante",
        "commerce",
        "education",
        "finance",
        "hotellerie",
        "construction",
        "transport",
        "communication",
    ]
    return {"success": True, "sectors": sectors, "count": len(sectors)}


@router.get("/event-types")
async def get_event_types():
    """
    Get list of available event types.
    """
    event_types = ["salon", "forum", "job_dating", "webinar"]
    return {"success": True, "event_types": event_types, "count": len(event_types)}
