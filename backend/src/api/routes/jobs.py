"""
Job Search API Routes
======================
Endpoints for AI-powered job searching.
"""

import hashlib
import json
import logging
import re

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from src.api.deps import (
    ScoutAgentDep,
    _require_feature_flag_sync,
    check_quota,
    get_supabase_client,
    get_user_id_from_token,
    increment_quota,
)
from src.api.middleware import limiter
from src.models.schemas import Job, JobSearchRequest, JobSearchResponse, SearchMetadata
from src.services.stripe import invalidate_user_quota_cache
from src.utils.cache import get_redis

logger = logging.getLogger(__name__)

JOBS_CACHE_TTL = 7200  # 2 hours

router = APIRouter()


def _check_job_search_quota(user_id: str) -> None:
    """Check job_search quota. Raises 429 if exhausted."""
    try:
        supabase = get_supabase_client()
        result = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()
        if not result.data:
            return
        for row in result.data:
            if row.get("feature") == "job_search":
                if not row.get("has_access", True):
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "code": "QUOTA_EXCEEDED",
                            "feature": "job_search",
                            "limit": row.get("quota_limit"),
                            "used": row.get("quota_used"),
                            "reset_at": str(row.get("reset_at", "")),
                            "message": "Quota de recherches journalier atteint. Passez à un plan supérieur pour continuer."
                        }
                    )
                return
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise
        logger.warning(f"[quota] job_search check failed for {user_id}, allowing through: {e}")


def _increment_job_search_quota(user_id: str) -> None:
    """Increment job_search usage. Best-effort, never raises."""
    try:
        supabase = get_supabase_client()
        supabase.rpc("increment_usage", {
            "p_user_id": user_id,
            "p_feature": "job_search",
            "p_amount": 1,
        }).execute()
    except Exception as e:
        logger.warning(f"[quota] job_search increment failed for {user_id}: {e}")


def _extract_salary(job: dict) -> tuple:
    """Extract min/max salary from job (returns None if not available)."""
    salary_str = job.get('salary', '')
    if not salary_str:
        return None, None
    numbers = re.findall(r'\d+', salary_str.replace(' ', '').replace(',', ''))
    if len(numbers) >= 2:
        return int(numbers[0]), int(numbers[1])
    elif len(numbers) == 1:
        val = int(numbers[0])
        return val, val
    return None, None


def apply_advanced_filters(
    jobs: list[dict],
    industries: str = "",
    keywords: str = "",
    experience_level: str = "",
    salary_min: int | None = None,
    salary_max: int | None = None,
    company_size: str = "",
    contract_types: list[str] | None = None,
    work_schedule: list[str] | None = None,
    work_days: list[str] | None = None,
) -> list[dict]:
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
        filtered = [
            job for job in filtered
            if (lambda s_min, s_max: (
                (salary_min is None or s_max is None or s_max >= salary_min) and
                (salary_max is None or s_min is None or s_min <= salary_max)
            ))(*_extract_salary(job))
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

    # Filter by multiple contract types (exact match on normalized contract_type)
    if contract_types:
        filter_to_normalized: dict[str, str] = {
            "cdi": "CDI",
            "cdd": "CDD",
            "freelance": "Freelance",
            "internship": "Stage",
            "stage": "Stage",
            "alternance": "Alternance",
            "apprentissage": "Alternance",
            "interim": "Interim",
            "cdi_partial": "Temps partiel",
            "cdd_partial": "Temps partiel",
        }

        target_types: set[str] = set()
        for ct in contract_types:
            normalized = filter_to_normalized.get(ct.lower().strip())
            if normalized:
                target_types.add(normalized)

        if target_types:
            filtered = [
                job for job in filtered
                if job.get("contract_type", "") in target_types
                or not job.get("contract_type")  # Include jobs with unknown type
            ]

    # Filter by work schedule (heuristic on text)
    if work_schedule:
        # Special logic: "temps_plein" = EXCLUDE part-time offers (most jobs are full-time by default)
        # Other schedules = INCLUDE only jobs mentioning those keywords
        has_temps_plein = "temps_plein" in [s.lower().strip() for s in work_schedule]
        other_schedules = [s for s in work_schedule if s.lower().strip() != "temps_plein"]

        part_time_keywords = ["temps partiel", "part-time", "part time", "mi-temps", "half-time", "partiel"]

        schedule_keywords: dict[str, list[str]] = {
            "matin": ["matin", "morning", "6h", "7h", "8h", "tôt", "early shift", "poste du matin"],
            "journee": ["journée", "day shift", "9h-17h", "9h-18h", "bureau", "office hours", "horaires de bureau", "horaires classiques"],
            "soir": ["soir", "evening", "soirée", "18h", "19h", "20h", "evening shift", "poste du soir", "après 17h"],
            "nuit": ["nuit", "night", "nocturne", "3x8", "2x8", "night shift", "poste de nuit", "travail de nuit"],
        }

        sched_kws: list[str] = []
        for s in other_schedules:
            sched_kws.extend(schedule_keywords.get(s.lower().strip(), []))

        def matches_schedule(job: dict) -> bool:
            text = (job.get('title', '') + ' ' + job.get('description', '')).lower()
            # If temps_plein selected: exclude part-time jobs
            if has_temps_plein and any(kw in text for kw in part_time_keywords):
                return False
            # If other schedules selected: must match at least one
            if sched_kws and not any(kw in text for kw in sched_kws):
                return False
            return True

        filtered = [job for job in filtered if matches_schedule(job)]

    # Filter by work days (heuristic on text)
    # If both "semaine" and "weekend" selected → no filter (show all)
    if work_days:
        selected_days = [d.lower().strip() for d in work_days]
        both_selected = "semaine" in selected_days and "weekend" in selected_days

        if not both_selected:
            days_keywords: dict[str, list[str]] = {
                "semaine": [
                    "lundi", "mardi", "mercredi", "jeudi", "vendredi",
                    "monday", "tuesday", "wednesday", "thursday", "friday",
                    "weekday", "en semaine", "du lundi au vendredi", "lundi-vendredi",
                ],
                "weekend": [
                    "samedi", "dimanche", "weekend", "week-end", "week end",
                    "saturday", "sunday", "le week-end", "le weekend",
                    "travail le samedi", "travail le dimanche",
                    "disponible le weekend", "weekends",
                ],
            }
            days_kws: list[str] = []
            for d in selected_days:
                days_kws.extend(days_keywords.get(d, []))
            if days_kws:
                filtered = [
                    job for job in filtered
                    if any(
                        kw in job.get('title', '').lower()
                        or kw in job.get('description', '').lower()
                        for kw in days_kws
                )
            ]

    return filtered


@router.post("/search", response_model=JobSearchResponse)
@limiter.limit("50/minute")  # Rate limit: 50 searches per minute per IP
async def search_jobs(
    request: Request,  # Required for rate limiting
    data: JobSearchRequest,
    agent: ScoutAgentDep,
    authorization: str | None = Header(default=None),
):
    """
    Search for jobs across multiple providers.

    Uses AI to:
    - Refine and correct search queries
    - Aggregate from multiple sources (Adzuna, Google Jobs, RemoteOK)
    - Deduplicate and rank results
    - Provide market insights
    """
    # If contract_types provided but not contract_type, use first as provider filter
    effective_contract_type = data.contract_type
    if not effective_contract_type and data.contract_types:
        effective_contract_type = data.contract_types[0]

    # Validate: at least job_title or contract_type must be provided
    if not data.job_title.strip() and not effective_contract_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="job_title ou contract_type requis",
        )

    # Determine if post-processing filters are needed
    has_post_filters = bool(data.contract_types or data.work_schedule or data.work_days)

    # ✅ CHECK QUOTA AVANT RECHERCHE
    user_id = get_user_id_from_token(authorization)
    if user_id:
        _check_job_search_quota(user_id)

    # ── Cache Redis : cle basee sur les parametres de recherche ──
    cache_key_data = json.dumps({
        "job_title": data.job_title,
        "country_code": data.country_code,
        "city": data.city,
        "contract_type": effective_contract_type,
        "max_results": data.max_results,
        "max_days": data.max_days,
        "radius_km": data.radius_km,
        "include_remote": data.include_remote,
    }, sort_keys=True, default=str)
    cache_key = f"jobs:search:{hashlib.md5(cache_key_data.encode()).hexdigest()}"

    redis = await get_redis()
    cached_jobs = None
    if redis:
        try:
            raw = await redis.get(cache_key)
            if raw:
                import orjson
                cached_jobs = orjson.loads(raw)
                logger.debug(f"Cache HIT for job search: {cache_key[:40]}")
        except Exception as e:
            logger.warning(f"[cache] job search GET error: {e}")

    if cached_jobs is not None:
        # Cache hit : on utilise les offres cachées, mais on regénère les insights
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
            for j in cached_jobs.get("jobs", [])
        ]
        metadata = cached_jobs.get("metadata", {})

        # Apply post-processing filters on cached results
        if has_post_filters:
            jobs_dicts = [j.model_dump() for j in jobs]
            jobs_dicts = apply_advanced_filters(
                jobs=jobs_dicts,
                contract_types=data.contract_types or None,
                work_schedule=data.work_schedule or None,
                work_days=data.work_days or None,
            )
            jobs = [
                Job(**j) for j in jobs_dicts
            ]

        response = JobSearchResponse(
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
            ai_insights=None,
        )
        # Cache hit : ne PAS incrémenter le quota (même recherche, pas de nouvelle consommation)
        return response

    # ── Cache MISS : executer la recherche ──
    result = await agent.run(
        job_title=data.job_title,
        country_code=data.country_code,
        city=data.city,
        contract_type=effective_contract_type,
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

    # Stocker en cache les offres (pas les insights IA)
    if redis and result.get("jobs"):
        try:
            import orjson
            cache_payload = orjson.dumps({
                "jobs": result.get("jobs", []),
                "metadata": result.get("metadata", {}),
            }, option=orjson.OPT_NON_STR_KEYS).decode()
            await redis.setex(cache_key, JOBS_CACHE_TTL, cache_payload)
            logger.debug(f"Cached job search results: {cache_key[:40]} (TTL: {JOBS_CACHE_TTL}s)")
        except Exception as e:
            logger.warning(f"[cache] job search SET error: {e}")

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

    # Apply post-processing filters on fresh results
    if has_post_filters:
        jobs_dicts = [j.model_dump() for j in jobs]
        jobs_dicts = apply_advanced_filters(
            jobs=jobs_dicts,
            contract_types=data.contract_types or None,
            work_schedule=data.work_schedule or None,
            work_days=data.work_days or None,
        )
        jobs = [Job(**j) for j in jobs_dicts]

    response = JobSearchResponse(
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

    # Incrementer quota apres succes
    if user_id:
        _increment_job_search_quota(user_id)
        await invalidate_user_quota_cache(user_id)

    return response


@router.get("/search")
@limiter.limit("10/minute")
async def search_jobs_get(
    request: Request,
    agent: ScoutAgentDep,
    q: str = Query(default="", description="Job title to search (optional if contract is set)"),
    country: str = Query(default="us", description="Country code"),
    city: str = Query(default="", description="City"),
    contract: str = Query(default="", description="Contract type"),
    limit: int = Query(default=200, ge=5, le=200),
    radius: int = Query(default=None, ge=1, le=100, description="Search radius in km"),
    include_remote: bool = Query(default=True, description="Include remote jobs"),
    # Advanced filters (Premium feature)
    industries: str = Query(default="", description="Comma-separated industries (e.g. 'Tech/IT,Finance')"),
    keywords: str = Query(default="", description="Comma-separated keywords (e.g. 'React,Python')"),
    experience_level: str = Query(default="", description="Experience level: junior, mid, senior, lead"),
    salary_min: int = Query(default=None, ge=0, description="Minimum salary (annual)"),
    salary_max: int = Query(default=None, ge=0, description="Maximum salary (annual)"),
    company_size: str = Query(default="", description="Company size: startup, scaleup, enterprise"),
    # New filters: comma-separated values
    contract_types: str = Query(default="", description="Comma-separated contract types: cdi,cdd,freelance,internship,alternance,apprentissage,interim,stage,cdi_partial,cdd_partial"),
    work_schedule: str = Query(default="", description="Comma-separated work schedules: matin,journee,soir,nuit,temps_plein"),
    work_days: str = Query(default="", description="Comma-separated work days: semaine,weekend"),
    authorization: str | None = Header(None),
):
    """
    Search for jobs (GET endpoint for simple queries).
    Authenticated users are subject to their plan quota.
    """
    # Parse CSV params into lists
    contract_types_list = [ct.strip() for ct in contract_types.split(",") if ct.strip()] if contract_types else []
    work_schedule_list = [ws.strip() for ws in work_schedule.split(",") if ws.strip()] if work_schedule else []
    work_days_list = [wd.strip() for wd in work_days.split(",") if wd.strip()] if work_days else []

    # If contract_types provided but not contract, use first as provider filter
    effective_contract = contract
    if not effective_contract and contract_types_list:
        effective_contract = contract_types_list[0]

    # Validate: at least q or contract must be provided
    if not q.strip() and not effective_contract:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="q ou contract requis",
        )

    user_id = get_user_id_from_token(authorization)
    if user_id:
        _check_job_search_quota(user_id)
    result = await agent.run(
        job_title=q,
        country_code=country,
        city=city,
        contract_type=effective_contract,
        max_results=limit,
        radius_km=radius,
        include_remote=include_remote,
    )

    # Apply advanced filters if any are provided (Premium feature)
    has_filters = any([
        industries, keywords, experience_level, salary_min, salary_max, company_size,
        contract_types_list, work_schedule_list, work_days_list,
    ])
    if has_filters:
        user_id = get_user_id_from_token(authorization)
        if user_id:
            _require_feature_flag_sync(user_id, "advanced_filters", "Les filtres avances necessitent un plan superieur.")
        jobs = result.get('jobs', [])
        filtered_jobs = apply_advanced_filters(
            jobs=jobs,
            industries=industries,
            keywords=keywords,
            experience_level=experience_level,
            salary_min=salary_min,
            salary_max=salary_max,
            company_size=company_size,
            contract_types=contract_types_list or None,
            work_schedule=work_schedule_list or None,
            work_days=work_days_list or None,
        )
        result['jobs'] = filtered_jobs
        if 'metadata' not in result:
            result['metadata'] = {}
        result['metadata']['total_filtered'] = len(filtered_jobs)
        result['metadata']['total_before_filters'] = len(jobs)

    return result


@router.post("/analyze-query")
@limiter.limit("20/minute")
async def analyze_query(
    request: Request,
    agent: ScoutAgentDep,
    query: str,
    authorization: str | None = Header(None),
):
    """
    Analyze a natural language job search query.

    Extracts job title, location, contract type from free text.
    """
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    analysis = await agent.analyze_query(query)
    return {
        "success": True,
        "original_query": query,
        "analysis": analysis,
    }


@router.get("/market-insights")
@limiter.limit("10/minute")
async def get_market_insights(
    request: Request,
    agent: ScoutAgentDep,
    job_title: str = Query(..., description="Job title"),
    country: str = Query(default="us", description="Country code"),
    authorization: str | None = Header(None),
):
    """
    Get job market insights for a role.

    Provides demand level, salary ranges, required skills, and hot locations.
    """
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    insights = await agent._get_market_insights(job_title, country)
    return {
        "success": True,
        "job_title": job_title,
        "country": country,
        "insights": insights,
    }


def _clean_element_html(el) -> str:
    """
    Strip unsafe/noisy attributes from all child tags and return inner HTML.
    """
    for tag in el.find_all(True):
        tag.attrs = {
            k: v for k, v in tag.attrs.items()
            if k not in ("style", "class", "id") and not k.startswith("on")
        }
    return el.decode_contents()


@router.post("/description")
@limiter.limit("15/minute")
async def get_job_description(request: Request):
    """
    Get full job description by scraping the job URL.

    Fetches the page and extracts the job description section using common
    CSS selectors, then falls back to the longest paragraph block.
    Returns HTML content and the final resolved URL after redirects.
    """
    try:
        body = await request.json()
        url = body.get("url", "")

        if not url:
            return {"success": False, "description": "", "final_url": None}

        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            headers = {"User-Agent": "Mozilla/5.0 (compatible; HuntZen/1.0)"}
            response = await client.get(url, headers=headers)

        final_url = str(response.url)

        if response.status_code != 200:
            return {"success": False, "description": "", "final_url": final_url}

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
        found_el = None
        for selector in selectors:
            el = soup.select_one(selector)
            if el and len(el.get_text(strip=True)) > 200:
                found_el = el
                break

        if found_el:
            html_content = _clean_element_html(found_el)
        else:
            # Fallback: wrap long paragraphs in <p> tags
            paragraphs = soup.find_all("p")
            html_content = "".join(
                f"<p>{p.get_text(strip=True)}</p>"
                for p in paragraphs if len(p.get_text()) > 50
            )

        if not html_content or len(html_content.strip()) < 50:
            return {"success": False, "description": "", "final_url": final_url}
        return {"success": True, "description": html_content[:8000], "final_url": final_url}

    except Exception:
        logger.exception("description scrape failed for url=%s", url)
        return {"success": False, "description": "", "final_url": None}


class TrackViewRequest(BaseModel):
    job_id: str = Field(..., min_length=1, max_length=500)


@router.post("/track-view")
@limiter.limit("60/minute")
async def track_job_view(
    request: Request,
    payload: TrackViewRequest,
    authorization: str | None = Header(None),
):
    """
    Track job view for analytics and quota management.
    Auth optional: anonymous users can view jobs but are not quota-tracked.
    Authenticated users get their job_view quota incremented.
    """
    user_id = get_user_id_from_token(authorization)

    if not user_id:
        return {
            "success": True,
            "tracked": False,
            "remaining": None,
            "message": "Anonymous view, no quota tracking",
        }

    try:
        await check_quota(user_id, "job_view")

        supabase = get_supabase_client()

        # Increment job_view usage
        supabase.rpc("increment_usage", {
            "p_user_id": user_id,
            "p_feature": "job_view",
            "p_amount": 1,
        }).execute()
        await invalidate_user_quota_cache(user_id)

        # Get updated quota status
        quota_result = supabase.rpc("get_quota_status", {"p_user_id": user_id}).execute()
        remaining = None
        for row in (quota_result.data or []):
            if row.get("feature") == "job_view":
                remaining = row.get("quota_remaining")
                break

        return {
            "success": True,
            "tracked": True,
            "remaining": remaining,
        }
    except Exception as e:
        logger.warning(f"[track-view] Failed for user {user_id}: {e}")
        return {
            "success": True,
            "tracked": False,
            "remaining": None,
        }


# ============================================================================
# Recruiter Finder — "Hunt This Job"
# ============================================================================

@router.post("/find-recruiter")
@limiter.limit("5/minute")
async def find_recruiter(request: Request, authorization: str | None = Header(None)):
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
    Requires authentication — calls Hunter.io API (paid service).
    """
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    await check_quota(user_id, "recruiter_search")
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

        from src.services.recruiter_finder.apollo import find_recruiters_apollo
        from src.services.recruiter_finder.hunter import extract_domain, find_recruiters_for_job

        # Resolve domain
        domain = ""
        if company_domain:
            domain = extract_domain(company_domain)
        elif company_website:
            domain = extract_domain(company_website)

        # 1. Try Apollo first (primary source)
        result = await find_recruiters_apollo(
            company_name=company_name,
            company_domain=domain,
            job_title=job_title,
        )

        # 2. If Apollo found nothing, fallback to Hunter.io
        if not result.get("recruiters") and not result.get("tech_team"):
            logger.info("[find-recruiter] Apollo found nothing, trying Hunter.io fallback")
            result = await find_recruiters_for_job(
                company_name=company_name,
                company_domain=company_domain,
                company_website=company_website,
                job_title=job_title,
            )
            result["source"] = "hunter"

        # 3. Mark email verification status
        source = result.get("source", "hunter")
        for contact in result.get("recruiters", []) + result.get("tech_team", []) + result.get("all_contacts", []):
            if source == "apollo":
                contact["email_verified"] = contact.get("email_status") == "verified"
            else:
                contact["email_verified"] = (contact.get("confidence", 0) >= 80)
            contact.setdefault("source", source)

        await increment_quota(user_id, "recruiter_search")
        await invalidate_user_quota_cache(user_id)

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
