"""
Pydantic Schemas
=================
Request/Response models with validation.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# ------------------------------------------------------------------------------
# Common Models
# ------------------------------------------------------------------------------

class BaseResponse(BaseModel):
    """Base response model with status."""
    success: bool = True
    message: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ------------------------------------------------------------------------------
# Career Coach
# ------------------------------------------------------------------------------

class CoachRequest(BaseModel):
    """Request model for career coach chat."""
    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    session_id: str = Field(..., pattern=r"^[a-f0-9-]{36}$", description="Session UUID")
    language: Literal["fr", "en", "es", "pt"] = Field(default="fr")

    model_config = {"json_schema_extra": {"example": {
        "message": "How can I improve my CV for a Data Engineer position?",
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "language": "en"
    }}}


class TrainingRecommendation(BaseModel):
    """Training/certification recommendation."""
    name: str
    platform: str
    url: str | None = None
    duration: str | None = None
    level: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    reason: str


class CoachResponse(BaseResponse):
    """Response model for career coach."""
    response: str = Field(..., description="Coach response")
    language: str = "fr"
    training_suggestions: list[TrainingRecommendation] = Field(default_factory=list)
    career_insights: dict[str, Any] = Field(default_factory=dict)


# ------------------------------------------------------------------------------
# Job Search
# ------------------------------------------------------------------------------

class JobSearchRequest(BaseModel):
    """Request model for job search."""
    job_title: str = Field(default="", max_length=200, description="Job title to search (optional if contract_type is set)")
    country_code: str = Field(default="us", min_length=2, max_length=3)
    city: str = Field(default="", max_length=100)
    contract_type: Literal[
        "", "cdi", "cdd", "cdi_partial", "cdd_partial",
        "freelance", "internship", "remote",
        "permanent", "contract", "alternance", "apprentissage"
    ] = ""
    salary_min: int | None = Field(default=None, ge=0)
    max_results: int = Field(default=100, ge=5, le=200)
    max_days: int = Field(default=7, ge=1, le=30, description="Max days since posting (1-30)")
    radius_km: int | None = Field(default=None, ge=1, le=100, description="Search radius in kilometers around city (1-100)")
    include_remote: bool = Field(default=True, description="Include remote jobs in search results")
    contract_types: list[str] = Field(
        default_factory=list,
        description="Multi-select contract types: cdi, cdd, freelance, internship, alternance, apprentissage, interim, stage, cdi_partial, cdd_partial",
    )
    work_schedule: list[str] = Field(
        default_factory=list,
        description="Work schedule filter: matin, journee, soir, nuit, temps_plein",
    )
    work_days: list[str] = Field(
        default_factory=list,
        description="Work days filter: semaine, weekend",
    )

    model_config = {"json_schema_extra": {"example": {
        "job_title": "Data Engineer",
        "country_code": "us",
        "city": "New York",
        "contract_type": "permanent",
        "contract_types": ["cdi", "cdd"],
        "work_schedule": ["journee"],
        "work_days": ["semaine"],
        "max_results": 100,
        "max_days": 7,
        "radius_km": 50
    }}}


class Job(BaseModel):
    """Job listing model."""
    id: str
    title: str
    company: str
    location: str
    description: str | None = None
    url: str | None = None
    salary: str | None = None
    contract_type: str | None = None
    source: str
    posted_date: str | None = None
    score: float = Field(default=0.0, ge=0.0, le=1.0, description="Relevance score")
    url_is_direct: bool = False  # True = URL goes directly to employer, not an aggregator
    description_truncated: bool = False


class SearchMetadata(BaseModel):
    """Metadata about the search."""
    original_query: str
    refined_query: str | None = None
    total_raw: int
    total_deduplicated: int
    sources_used: list[str]
    search_time_ms: int


class JobSearchResponse(BaseResponse):
    """Response model for job search."""
    jobs: list[Job] = Field(default_factory=list)
    metadata: SearchMetadata
    ai_insights: str | None = None


# ------------------------------------------------------------------------------
# CV Analyzer
# ------------------------------------------------------------------------------

class CVAnalysisRequest(BaseModel):
    """Request model for CV analysis."""
    cv_text: str = Field(..., min_length=100, max_length=50000)
    job_description: str | None = Field(default=None, max_length=10000)
    language: Literal["fr", "en"] = "en"

    model_config = {"json_schema_extra": {"example": {
        "cv_text": "John Doe - Data Engineer...",
        "job_description": "We are looking for a Senior Data Engineer...",
        "language": "en"
    }}}


class ATSScore(BaseModel):
    """ATS Score breakdown."""
    total: int = Field(..., ge=0, le=100)
    format_score: int = Field(..., ge=0, le=20)
    keywords_score: int = Field(..., ge=0, le=30)
    experience_score: int = Field(..., ge=0, le=25)
    skills_score: int = Field(..., ge=0, le=15)
    education_score: int = Field(..., ge=0, le=10)


class CVAnalysisResponse(BaseResponse):
    """Response model for CV analysis."""
    ats_score: ATSScore
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    training_recommendations: list[TrainingRecommendation] = Field(default_factory=list)
    job_match_score: int | None = Field(default=None, ge=0, le=100)
    verdict: str = ""


# ------------------------------------------------------------------------------
# Events / Job Fairs
# ------------------------------------------------------------------------------

class Event(BaseModel):
    """Job fair/event model."""
    id: str
    name: str
    date: str
    location: str
    format: Literal["physical", "virtual", "hybrid"]
    sector: str | None = None
    url: str | None = None
    description: str | None = None


class EventSearchRequest(BaseModel):
    """Request model for event search."""
    region: str = Field(default="", max_length=100)
    sector: str = Field(default="")
    event_type: Literal["", "salon", "forum", "job_dating", "webinar"] = ""
    format: Literal["", "physical", "virtual", "hybrid"] = ""


class EventSearchResponse(BaseResponse):
    """Response model for event search."""
    events: list[Event] = Field(default_factory=list)
    total: int = 0
