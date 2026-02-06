"""
Pydantic Schemas - CV Analysis & Job Fairs
============================================
Request/Response models with validation.
"""

from datetime import datetime
from typing import Any, Literal, Optional

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
# Training Recommendations (shared)
# ------------------------------------------------------------------------------

class TrainingRecommendation(BaseModel):
    """Training/certification recommendation."""
    name: str
    platform: str
    url: Optional[str] = None
    duration: Optional[str] = None
    level: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    reason: str


# ------------------------------------------------------------------------------
# CV Analyzer
# ------------------------------------------------------------------------------

class CVAnalysisRequest(BaseModel):
    """Request model for CV analysis."""
    cv_text: str = Field(..., min_length=100, max_length=50000)
    job_description: Optional[str] = Field(default=None, max_length=10000)
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
    keywords_score: int = Field(..., ge=0, le=20)
    experience_score: int = Field(..., ge=0, le=20)
    skills_score: int = Field(..., ge=0, le=20)
    education_score: int = Field(..., ge=0, le=20)


class CVAnalysisResponse(BaseResponse):
    """Response model for CV analysis."""
    ats_score: ATSScore
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    training_recommendations: list[TrainingRecommendation] = Field(default_factory=list)
    job_match_score: Optional[int] = Field(default=None, ge=0, le=100)
    verdict: str = ""


# ------------------------------------------------------------------------------
# Job Fairs / Events
# ------------------------------------------------------------------------------

class JobFair(BaseModel):
    """Job fair/event model."""
    title: str
    event_type: str  # salon, forum, job_dating, webinar
    public: str  # etudiants, pros, tous, seniors
    sector: str  # tech, industrie, sante, tous
    level: str  # tous, bac, bac+2, bac+5
    date_start: str  # YYYY-MM-DD
    date_end: Optional[str] = None
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    city: str
    region: str
    address: Optional[str] = None
    format: str  # physique, virtuel, hybride
    organizer: str
    description: Optional[str] = None
    url: str
    source: str
    registration_url: Optional[str] = None
    is_free: bool = True
    companies_count: Optional[int] = None


class JobFairSearchRequest(BaseModel):
    """Request model for job fair search."""
    region: str = Field(default="", max_length=100)
    sector: str = Field(default="")
    public: str = Field(default="")
    event_type: Literal["", "salon", "forum", "job_dating", "webinar"] = ""
    format_type: Literal["", "physique", "virtuel", "hybride"] = ""


class JobFairSearchResponse(BaseResponse):
    """Response model for job fair search."""
    events: list[JobFair] = Field(default_factory=list)
    count: int = 0
    total_scraped: int = 0
    sources: list[str] = Field(default_factory=list)
    filters_applied: dict[str, Any] = Field(default_factory=dict)
