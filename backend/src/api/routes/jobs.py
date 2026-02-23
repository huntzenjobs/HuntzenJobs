"""
Job Search API Routes
======================
Endpoints for AI-powered job searching.
"""

import asyncio
import hashlib
import json
import time
from typing import List
from fastapi import APIRouter, HTTPException, status, Query, Request
from sse_starlette.sse import EventSourceResponse

from src.api.deps import ScoutAgentDep
from src.api.middleware import limiter
from src.models.schemas import JobSearchRequest, JobSearchResponse, SearchMetadata, Job
from src.utils.cache import get_redis
from src.agents.job_scout.main_agent import JobScoutAgent

router = APIRouter()


def apply_advanced_filters(
    jobs: List[dict],
    industries: str = "",
    keywords: str = "",
    experience_level: str = "",
    salary_min: int = None,
    salary_max: int = None,
    company_size: str = "",
) -> List[dict]:
    """
    Filter jobs based on advanced criteria (Premium feature).

    This is a post-processing filter applied after the AI agent returns results.
    """
    if not jobs:
        return []

    filtered = jobs

    # Filter by industries (case-insensitive match in title or description)
    if industries:
        industry_list = [ind.strip().lower() for ind in industries.split(',')]
        filtered = [
            job for job in filtered
            if any(
                ind in job.get('title', '').lower() or
                ind in job.get('description', '').lower() or
                ind in job.get('company', '').lower()
                for ind in industry_list
            )
        ]

    # Filter by keywords (case-insensitive match in title or description)
    if keywords:
        keyword_list = [kw.strip().lower() for kw in keywords.split(',')]
        filtered = [
            job for job in filtered
            if any(
                kw in job.get('title', '').lower() or
                kw in job.get('description', '').lower()
                for kw in keyword_list
            )
        ]

    # Filter by experience level (heuristic based on title/description)
    if experience_level:
        level_keywords = {
            'junior': ['junior', 'jr', 'entry', 'graduate', 'débutant'],
            'mid': ['mid', 'intermediate', 'confirmé', 'experienced'],
            'senior': ['senior', 'sr', 'expert', 'sénior'],
            'lead': ['lead', 'principal', 'staff', 'architect', 'head', 'director'],
        }
        keywords_to_match = level_keywords.get(experience_level.lower(), [])
        if keywords_to_match:
            filtered = [
                job for job in filtered
                if any(
                    keyword in job.get('title', '').lower() or
                    keyword in job.get('description', '').lower()
                    for keyword in keywords_to_match
                )
            ]

    # Filter by salary range (if salary information is available)
    if salary_min is not None or salary_max is not None:
        def extract_salary(job: dict) -> tuple:
            """Extract min/max salary from job (returns None if not available)."""
            salary_str = job.get('salary', '')
            if not salary_str:
                return None, None
            # Simple heuristic: extract numbers from salary string
            # This is a basic implementation - improve based on actual data format
            import re
            numbers = re.findall(r'\d+', salary_str.replace(' ', '').replace(',', ''))
            if len(numbers) >= 2:
                return int(numbers[0]), int(numbers[1])
            elif len(numbers) == 1:
                val = int(numbers[0])
                return val, val
            return None, None

        filtered = [
            job for job in filtered
            if (lambda s_min, s_max: (
                (salary_min is None or s_max is None or s_max >= salary_min) and
                (salary_max is None or s_min is None or s_min <= salary_max)
            ))(*extract_salary(job))
        ]

    # Filter by company size (heuristic based on company name/description)
    if company_size:
        size_keywords = {
            'startup': ['startup', 'start-up', 'jeune pousse', 'seed', 'early stage'],
            'scaleup': ['scale-up', 'scaleup', 'growth', 'series a', 'series b'],
            'enterprise': ['enterprise', 'corporation', 'multinational', 'fortune', 'global'],
        }
        keywords_to_match = size_keywords.get(company_size.lower(), [])
        if keywords_to_match:
            filtered = [
                job for job in filtered
                if any(
                    keyword in job.get('company', '').lower() or
                    keyword in job.get('description', '').lower()
                    for keyword in keywords_to_match
                )
            ]

    return filtered


@router.post("/search", response_model=JobSearchResponse)
@limiter.limit("50/minute")  # Rate limit: 50 searches per minute per IP
async def search_jobs(
    request: Request,  # Required for rate limiting
    data: JobSearchRequest,
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
        job_title=data.job_title,
        country_code=data.country_code,
        city=data.city,
        contract_type=data.contract_type,
        max_results=data.max_results,
        max_days=data.max_days,
        radius_km=data.radius_km,
        include_remote=data.include_remote,
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
            original_query=metadata.get("original_query", data.job_title),
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
    limit: int = Query(default=100, ge=5, le=200),
    radius: int = Query(default=None, ge=1, le=100, description="Search radius in km"),
    include_remote: bool = Query(default=True, description="Include remote jobs"),
    # Advanced filters (Premium feature)
    industries: str = Query(default="", description="Comma-separated industries (e.g. 'Tech/IT,Finance')"),
    keywords: str = Query(default="", description="Comma-separated keywords (e.g. 'React,Python')"),
    experience_level: str = Query(default="", description="Experience level: junior, mid, senior, lead"),
    salary_min: int = Query(default=None, ge=0, description="Minimum salary (annual)"),
    salary_max: int = Query(default=None, ge=0, description="Maximum salary (annual)"),
    company_size: str = Query(default="", description="Company size: startup, scaleup, enterprise"),
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
        radius_km=radius,
        include_remote=include_remote,
    )

    # Apply advanced filters if any are provided (Premium feature)
    if any([industries, keywords, experience_level, salary_min, salary_max, company_size]):
        jobs = result.get('jobs', [])
        filtered_jobs = apply_advanced_filters(
            jobs=jobs,
            industries=industries,
            keywords=keywords,
            experience_level=experience_level,
            salary_min=salary_min,
            salary_max=salary_max,
            company_size=company_size,
        )
        result['jobs'] = filtered_jobs
        result['metadata']['total_filtered'] = len(filtered_jobs)
        result['metadata']['total_before_filters'] = len(jobs)

    return result


@router.get("/search/stream")
async def search_jobs_stream(
    request: Request,
    q: str = Query(..., description="Job title to search", min_length=2),
    country: str = Query(default="fr"),
    city: str = Query(default=""),
    contract: str = Query(default=""),
    limit: int = Query(default=50, ge=5, le=200),
    radius: int = Query(default=None, ge=1, le=100),
    include_remote: bool = Query(default=True),
    agent: ScoutAgentDep = ...,
):
    """
    Stream job results via SSE. Results appear as each provider responds.

    SSE event types:
    - query:  refined search query from LLM (~1s)
    - jobs:   batch of jobs from one provider (multiple events, ~3-30s)
    - ranked: AI-ranked full result list after all providers complete
    - done:   metadata + signals stream end
    - error:  fatal error during search

    Redis cache: instant response on cache hit; saved after ranking on miss.
    """
    cache_key = "stream:" + hashlib.md5(
        f"{q}|{country}|{city}|{contract}|{limit}|{radius}|{include_remote}".encode()
    ).hexdigest()

    async def event_generator():
        start_time = time.time()

        try:
            # ── Cache check ──────────────────────────────────────────────────
            redis = await get_redis()
            if redis:
                try:
                    cached = await redis.get(cache_key)
                    if cached:
                        data = json.loads(cached)
                        yield {
                            "event": "jobs",
                            "data": json.dumps({"source": "cache", "jobs": data["jobs"]}),
                        }
                        yield {
                            "event": "done",
                            "data": json.dumps({
                                "total_raw": len(data["jobs"]),
                                "sources_used": data.get("sources_used", []),
                                "search_time_ms": int((time.time() - start_time) * 1000),
                                "from_cache": True,
                            }),
                        }
                        return
                except Exception:
                    pass  # Redis error → proceed normally

            # ── Step 1: Refine query (LLM ~1-2s) ────────────────────────────
            refined = await agent._refine_query(q)
            search_query = refined.get("corrected_query", q)

            yield {
                "event": "query",
                "data": json.dumps({"original_query": q, "refined_query": search_query}),
            }

            # ── Step 2: Determine active providers ───────────────────────────
            active_providers = list(agent.providers)
            if country.lower() == "fr":
                active_providers.append(agent.france_travail)
            if not include_remote:
                active_providers = [p for p in active_providers if p.name != "remoteok"]

            # ── Step 3: Per-provider search wrapper ──────────────────────────
            async def search_one(provider):
                kwargs = {
                    "query": search_query,
                    "location": city,
                    "country_code": country,
                    "max_results": limit,
                }
                if provider.name == "adzuna":
                    kwargs["max_days"] = 7
                    kwargs["contract_type"] = contract
                if radius:
                    kwargs["radius_km"] = radius
                jobs = await provider.search(**kwargs)
                return provider.name, jobs

            # ── Step 4: Stream batches as providers complete ──────────────────
            seen_ids: set[str] = set()
            all_filtered: list[dict] = []
            sources_used: list[str] = []
            total_raw = 0

            tasks = [asyncio.create_task(search_one(p)) for p in active_providers]

            for coro in asyncio.as_completed(tasks):
                if await request.is_disconnected():
                    return

                source_name, raw_batch = await coro
                total_raw += len(raw_batch)

                # Deduplicate across providers
                new_jobs = [j for j in raw_batch if j.get("id") not in seen_ids]
                seen_ids.update(j.get("id", "") for j in new_jobs if j.get("id"))

                # School filter + relevance pre-filter
                new_jobs = JobScoutAgent._filter_school_offers(new_jobs)
                new_jobs = JobScoutAgent._pre_filter_by_relevance(new_jobs, search_query)

                if new_jobs:
                    sources_used.append(source_name)
                    all_filtered.extend(new_jobs)
                    yield {
                        "event": "jobs",
                        "data": json.dumps({"source": source_name, "jobs": new_jobs}),
                    }

            # ── Step 5: AI ranking on ALL collected jobs ──────────────────────
            if all_filtered:
                ranked = await agent._rank_jobs(all_filtered[: limit * 2], q)
                final_jobs = ranked[:limit]
            else:
                final_jobs = []

            yield {
                "event": "ranked",
                "data": json.dumps({"jobs": final_jobs}),
            }

            # ── Step 6: Done + cache save ─────────────────────────────────────
            elapsed_ms = int((time.time() - start_time) * 1000)
            yield {
                "event": "done",
                "data": json.dumps({
                    "total_raw": total_raw,
                    "total_unique": len(seen_ids),
                    "sources_used": sources_used,
                    "search_time_ms": elapsed_ms,
                    "from_cache": False,
                }),
            }

            # Save ranked result to Redis (15min TTL, graceful fail)
            if redis and final_jobs:
                try:
                    await redis.setex(
                        cache_key,
                        900,
                        json.dumps({"jobs": final_jobs, "sources_used": sources_used}),
                    )
                except Exception:
                    pass

        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())


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


@router.post("/description")
async def get_job_description(request: Request):
    """
    Get full job description by scraping the job URL.

    Fetches the page and extracts the job description section using common
    CSS selectors, then falls back to the longest paragraph block.
    """
    import httpx
    from bs4 import BeautifulSoup

    try:
        body = await request.json()
        url = body.get("url", "")

        if not url:
            return {"success": False, "description": ""}

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            headers = {"User-Agent": "Mozilla/5.0 (compatible; HuntZen/1.0)"}
            response = await client.get(url, headers=headers)

        if response.status_code != 200:
            return {"success": False, "description": ""}

        soup = BeautifulSoup(response.text, "html.parser")

        # Remove noisy elements
        for tag in soup(["script", "style", "nav", "header", "footer"]):
            tag.decompose()

        # Try common job description selectors (most specific first)
        selectors = [
            '[class*="job-description"]',
            '[class*="jobDescription"]',
            '[class*="job_description"]',
            '[id*="job-description"]',
            '[class*="description"]',
            'article',
            'main',
        ]
        text = ""
        for selector in selectors:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(separator="\n", strip=True)
                if len(text) > 200:
                    break

        # Fallback: join longest paragraph blocks
        if not text or len(text) < 200:
            paragraphs = soup.find_all("p")
            text = "\n".join(
                p.get_text(strip=True) for p in paragraphs if len(p.get_text()) > 50
            )

        return {"success": True, "description": text[:5000]}

    except Exception:
        return {"success": False, "description": ""}


@router.post("/track-view")
async def track_job_view(request: Request):
    """
    Track job view for analytics and quota management.

    Note: Currently a placeholder.
    Full tracking implementation to be added in future sprint.
    """
    try:
        body = await request.json()
        job_id = body.get("job_id", "")

        # TODO: Implement actual tracking logic (store in DB, check quotas, etc.)
        # For now, return success to prevent frontend errors
        return {
            "success": True,
            "tracked": True,
            "remaining": 999,  # Placeholder - unlimited for now
            "message": "View tracking not yet implemented"
        }
    except Exception as e:
        return {
            "success": False,
            "tracked": False,
            "error": str(e)
        }


# ============================================================================
# Recruiter Finder — "Hunt This Job"
# ============================================================================

@router.post("/find-recruiter")
async def find_recruiter(request: Request):
    """
    Find the recruiter / decision-maker behind a job posting.

    Expects JSON body:
    {
        "company_name": "HappyPal",
        "company_domain": "happypal.fr",     // preferred
        "company_website": "https://...",     // fallback
        "job_title": "Full Stack Developer"   // for context
    }

    Returns recruiters (HR/managers), tech team, email pattern, and LinkedIn URLs.
    """
    try:
        body = await request.json()
        company_name = body.get("company_name", "")
        company_domain = body.get("company_domain", "")
        company_website = body.get("company_website", "")
        job_title = body.get("job_title", "")

        if not company_name and not company_domain and not company_website:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least company_name or company_domain is required",
            )

        from src.services.recruiter_finder.hunter import find_recruiters_for_job

        result = await find_recruiters_for_job(
            company_name=company_name,
            company_domain=company_domain,
            company_website=company_website,
            job_title=job_title,
        )

        return {
            "success": True,
            **result,
        }

    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "company": body.get("company_name", ""),
            "recruiters": [],
            "tech_team": [],
            "total_found": 0,
        }
