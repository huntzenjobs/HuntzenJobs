"""
Job Fairs API Routes
====================
Endpoints for searching job fairs and employment events.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.agents.job_fairs import search_job_fairs
from src.models.schemas import JobFair, JobFairSearchResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class JobFairSearchRequest(BaseModel):
    """Request model for job fair search."""
    region: str = Field(default="", max_length=100, description="Filter by region (e.g., 'Île-de-France')")
    sector: str = Field(default="", description="Filter by sector (e.g., 'tech', 'industrie')")
    public: str = Field(default="", description="Filter by public (e.g., 'etudiants', 'pros', 'tous')")
    event_type: str = Field(default="", description="Filter by event type (e.g., 'salon', 'forum', 'job_dating')")
    format_type: str = Field(default="", description="Filter by format (e.g., 'physique', 'virtuel', 'hybride')")


@router.get("/search", response_model=JobFairSearchResponse)
async def search_job_fairs_endpoint(
    region: str = Query(default="", description="Filter by region"),
    sector: str = Query(default="", description="Filter by sector"),
    public: str = Query(default="", description="Filter by public"),
    event_type: str = Query(default="", description="Filter by event type"),
    format_type: str = Query(default="", description="Filter by format"),
):
    """
    Search for job fairs with filters.

    Query Parameters:
    - region: Region name (e.g., "Île-de-France", "Auvergne-Rhône-Alpes")
    - sector: Sector (e.g., "tech", "industrie", "sante", "tous")
    - public: Target public (e.g., "etudiants", "pros", "tous", "seniors")
    - event_type: Type (e.g., "salon", "forum", "job_dating", "webinar")
    - format_type: Format (e.g., "physique", "virtuel", "hybride")

    Returns:
    - List of job fair events matching the filters
    - Total count
    - Applied filters metadata
    """
    try:
        logger.info(f"[JOB_FAIRS_API] Search request: region={region}, sector={sector}, "
                   f"public={public}, event_type={event_type}, format={format_type}")

        result = await search_job_fairs(
            region=region,
            sector=sector,
            public=public,
            event_type=event_type,
            format_type=format_type,
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Search failed"))

        # Convert dict events to JobFair objects
        events = [JobFair(**event) for event in result.get("events", [])]

        return JobFairSearchResponse(
            success=True,
            message="Search completed successfully",
            events=events,
            count=len(events),
            filters_applied=result.get("filters_applied", {}),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[JOB_FAIRS_API] Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=JobFairSearchResponse)
async def search_job_fairs_post_endpoint(request: JobFairSearchRequest):
    """
    Search for job fairs with filters (POST version).

    Request Body:
    - region: Region name
    - sector: Sector filter
    - public: Target public
    - event_type: Event type
    - format_type: Format filter

    Returns:
    - List of job fair events matching the filters
    """
    try:
        logger.info(f"[JOB_FAIRS_API] POST Search request: {request.model_dump()}")

        result = await search_job_fairs(
            region=request.region,
            sector=request.sector,
            public=request.public,
            event_type=request.event_type,
            format_type=request.format_type,
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Search failed"))

        # Convert dict events to JobFair objects
        events = [JobFair(**event) for event in result.get("events", [])]

        return JobFairSearchResponse(
            success=True,
            message="Search completed successfully",
            events=events,
            count=len(events),
            filters_applied=result.get("filters_applied", {}),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[JOB_FAIRS_API] POST Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/regions", response_model=dict)
async def get_available_regions():
    """
    Get list of available French regions.

    Returns:
    - List of region names for filtering
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

    return {
        "success": True,
        "regions": regions,
        "count": len(regions),
    }


@router.get("/sectors", response_model=dict)
async def get_available_sectors():
    """
    Get list of available job sectors.

    Returns:
    - List of sector names for filtering
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

    return {
        "success": True,
        "sectors": sectors,
        "count": len(sectors),
    }


@router.get("/event-types", response_model=dict)
async def get_event_types():
    """
    Get list of available event types.

    Returns:
    - List of event type names
    """
    types = [
        "salon",
        "forum",
        "job_dating",
        "webinar",
    ]

    return {
        "success": True,
        "event_types": types,
        "count": len(types),
    }
