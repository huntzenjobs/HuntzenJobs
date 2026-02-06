"""
Job Search API Routes
======================
Endpoints for AI-powered job searching.
"""

from fastapi import APIRouter, HTTPException, status, Query

from src.api.deps import ScoutAgentDep
from src.models.schemas import JobSearchRequest, JobSearchResponse, SearchMetadata, Job

router = APIRouter()


@router.post("/search", response_model=JobSearchResponse)
async def search_jobs(
    request: JobSearchRequest,
    agent: ScoutAgentDep,
):
    """
    Search for jobs across multiple providers.
    
    Uses AI to:
    - Refine and correct search queries
    - Aggregate from multiple sources (Adzuna, Google Jobs, RemoteOK)
    - Deduplicate and rank results
    - Provide market insights
    """
    result = await agent.run(
        job_title=request.job_title,
        country_code=request.country_code,
        city=request.city,
        contract_type=request.contract_type,
        max_results=request.max_results,
        max_days=request.max_days,
        include_insights=True,
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Search failed"),
        )
    
    # Convert to response model
    jobs = [
        Job(
            id=j.get("id", ""),
            title=j.get("title", ""),
            company=j.get("company", ""),
            location=j.get("location", ""),
            description=j.get("description"),
            url=j.get("url"),
            salary=j.get("salary"),
            contract_type=j.get("contract_type"),
            source=j.get("source", "unknown"),
            posted_date=j.get("posted_date"),
            score=j.get("score", 0.5),
        )
        for j in result.get("jobs", [])
    ]
    
    metadata = result.get("metadata", {})
    
    return JobSearchResponse(
        success=True,
        jobs=jobs,
        metadata=SearchMetadata(
            original_query=metadata.get("original_query", request.job_title),
            refined_query=metadata.get("refined_query"),
            total_raw=metadata.get("total_raw", 0),
            total_deduplicated=metadata.get("total_deduplicated", len(jobs)),
            sources_used=metadata.get("sources_used", []),
            search_time_ms=metadata.get("search_time_ms", 0),
        ),
        ai_insights=str(result.get("insights", "")) if result.get("insights") else None,
    )


@router.get("/search")
async def search_jobs_get(
    agent: ScoutAgentDep,
    q: str = Query(..., description="Job title to search", min_length=2),
    country: str = Query(default="us", description="Country code"),
    city: str = Query(default="", description="City"),
    contract: str = Query(default="", description="Contract type"),
    limit: int = Query(default=25, ge=5, le=100),
):
    """
    Search for jobs (GET endpoint for simple queries).
    """
    result = await agent.run(
        job_title=q,
        country_code=country,
        city=city,
        contract_type=contract,
        max_results=limit,
    )
    
    return result


@router.post("/analyze-query")
async def analyze_query(
    agent: ScoutAgentDep,
    query: str,
):
    """
    Analyze a natural language job search query.
    
    Extracts job title, location, contract type from free text.
    """
    analysis = await agent.analyze_query(query)
    return {
        "success": True,
        "original_query": query,
        "analysis": analysis,
    }


@router.get("/market-insights")
async def get_market_insights(
    agent: ScoutAgentDep,
    job_title: str = Query(..., description="Job title"),
    country: str = Query(default="us", description="Country code"),
):
    """
    Get job market insights for a role.
    
    Provides demand level, salary ranges, required skills, and hot locations.
    """
    insights = await agent._get_market_insights(job_title, country)
    return {
        "success": True,
        "job_title": job_title,
        "country": country,
        "insights": insights,
    }
