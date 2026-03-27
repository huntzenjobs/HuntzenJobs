"""
Pydantic schemas for HuntZen JobSearch API (S6-5).

This module provides type-safe data models for API requests/responses.
All schemas use Pydantic v2 for validation and serialization.

Author: HuntZen Team
Date: 2026-01-28
Sprint: 6 - Ticket S6-5
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ============================================
# SUBSCRIPTION SCHEMAS
# ============================================

class SubscriptionPlanLimits(BaseModel):
    """Subscription plan quota limits."""
    cv_analyses: int = Field(..., description="CV analyses per day (-1 = unlimited)")
    coach_seconds: int = Field(..., description="Coach seconds per day (-1 = unlimited)")
    job_searches: int = Field(..., description="Job searches per day (-1 = unlimited)")

    @field_validator('cv_analyses', 'coach_seconds', 'job_searches')
    @classmethod
    def validate_limit(cls, v: int) -> int:
        """Validate limit is either positive or -1 (unlimited)."""
        if v < -1:
            raise ValueError("Limit must be positive or -1 (unlimited)")
        return v


class SubscriptionPlan(BaseModel):
    """Subscription plan model."""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Plan UUID")
    name: Literal["free", "starter", "pro", "premium"] = Field(..., description="Plan name")
    display_name: str = Field(..., description="Display name for UI")
    description: str | None = Field(None, description="Plan description")
    price_monthly: Decimal = Field(..., description="Monthly price in USD")
    price_yearly: Decimal | None = Field(None, description="Yearly price in USD")
    limits: SubscriptionPlanLimits = Field(..., description="Feature limits")
    features: list[str] = Field(default_factory=list, description="Marketing features list")
    is_active: bool = Field(True, description="Whether plan is available")
    sort_order: int = Field(0, description="Display order")
    created_at: datetime
    updated_at: datetime


class SubscriptionPlanPublic(BaseModel):
    """Public subscription plan info for pricing page."""
    name: str
    display_name: str
    description: str | None
    price_monthly: Decimal
    price_yearly: Decimal | None
    limits: SubscriptionPlanLimits
    features: list[str]
    sort_order: int


class UserSubscription(BaseModel):
    """User subscription model."""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Subscription UUID")
    user_id: str = Field(..., description="User UUID")
    plan_id: str = Field(..., description="Plan UUID")
    status: Literal["active", "canceled", "past_due", "paused", "trialing", "incomplete"]
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    canceled_at: datetime | None = None

    # Stripe fields
    stripe_subscription_id: str | None = None
    stripe_customer_id: str | None = None
    stripe_price_id: str | None = None

    # Trial fields
    trial_start: datetime | None = None
    trial_end: datetime | None = None

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class UserSubscriptionWithPlan(UserSubscription):
    """User subscription with embedded plan details."""
    plan: SubscriptionPlan


class CreateSubscriptionRequest(BaseModel):
    """Request to create/upgrade subscription."""
    plan_name: Literal["free", "starter", "pro", "premium"]
    billing_period: Literal["monthly", "yearly"] = "monthly"
    stripe_payment_method_id: str | None = Field(None, description="Stripe payment method for paid plans")


class CancelSubscriptionRequest(BaseModel):
    """Request to cancel subscription."""
    cancel_at_period_end: bool = Field(True, description="Cancel now or at period end")
    reason: str | None = Field(None, max_length=500, description="Cancellation reason")


# ============================================
# QUOTA SCHEMAS
# ============================================

class QuotaFeature(BaseModel):
    """Quota information for a single feature."""
    feature: Literal["cv_analysis", "coach", "job_search"]
    limit: int = Field(..., description="Daily limit (-1 = unlimited)")
    used: int = Field(..., ge=0, description="Amount used today")
    remaining: int = Field(..., description="Amount remaining (-1 = unlimited)")
    percentage: float = Field(..., ge=0, le=100, description="Usage percentage")
    has_access: bool = Field(..., description="Whether user can still use feature today")
    reset_at: datetime = Field(..., description="When quota resets (next midnight UTC)")


class QuotaStatus(BaseModel):
    """Complete quota status for all features."""
    cv_analysis: QuotaFeature
    coach: QuotaFeature
    job_search: QuotaFeature
    subscription_plan: str = Field(..., description="Current plan name")


class UsageStatsResponse(BaseModel):
    """Response for GET /api/usage-stats."""
    success: bool = True
    stats: dict[str, dict[str, Any]] = Field(..., description="Quota stats per feature")
    reset_at: str | None = Field(None, description="When quotas reset")


class QuotaExceededError(BaseModel):
    """Error response when quota exceeded (429)."""
    error: Literal["quota_exceeded"] = "quota_exceeded"
    message: str = Field(..., description="Human-readable error message")
    feature: str = Field(..., description="Which feature exceeded quota")
    user_id: str = Field(..., description="User UUID")
    current_usage: int = Field(..., description="Current usage count")
    limit: int = Field(..., description="Daily limit")
    reset_at: datetime = Field(..., description="When quota resets")


# ============================================
# CV ANALYSIS SCHEMAS
# ============================================

class CVAnalysisRequest(BaseModel):
    """Request for CV analysis."""
    cv_text: str = Field(..., min_length=50, max_length=50000, description="CV content")
    job_description: str | None = Field(None, max_length=10000, description="Optional job description for matching")
    language: Literal["fr", "en"] = Field("fr", description="Response language")


class ATSScore(BaseModel):
    """ATS compatibility score breakdown."""
    overall_score: int = Field(..., ge=0, le=100, description="Overall ATS score")
    formatting_score: int = Field(..., ge=0, le=100)
    keywords_score: int = Field(..., ge=0, le=100)
    structure_score: int = Field(..., ge=0, le=100)
    readability_score: int = Field(..., ge=0, le=100)


class CVAnalysisResponse(BaseModel):
    """Response from CV analysis."""
    success: bool = True
    ats_score: ATSScore
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    missing_sections: list[str] = Field(default_factory=list)
    keywords_found: list[str] = Field(default_factory=list)
    keywords_missing: list[str] = Field(default_factory=list)
    job_match_score: int | None = Field(None, ge=0, le=100, description="Match score if job_description provided")
    analysis_language: Literal["fr", "en"]
    processed_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================
# COACH SCHEMAS
# ============================================

class CoachRequest(BaseModel):
    """Request for career coach chat."""
    session_id: str = Field(..., description="Session UUID")
    message: str = Field(..., min_length=1, max_length=2000, description="User message")


class CoachResponse(BaseModel):
    """Response from career coach."""
    success: bool = True
    response: str = Field(..., description="Coach response")
    agent: Literal["CareerCoach"] = "CareerCoach"
    session_id: str
    seconds_used: int | None = Field(None, description="Seconds used for quota tracking")


class GenerateTitleRequest(BaseModel):
    """Request to generate conversation title."""
    messages: list[dict[str, str]] = Field(..., min_items=1, max_items=10, description="First few messages")


class GenerateTitleResponse(BaseModel):
    """Response with generated title."""
    success: bool = True
    title: str = Field(..., max_length=50, description="Generated conversation title")


# ============================================
# JOB SEARCH SCHEMAS
# ============================================

class JobSearchRequest(BaseModel):
    """Request for job search."""
    job_title: str = Field(..., min_length=2, max_length=100, description="Job title to search")
    country_code: str = Field(..., pattern=r'^[A-Z]{2}$', description="ISO country code")
    city: str | None = Field(None, max_length=100, description="City name")
    contract_type: str | None = Field(None, max_length=50, description="Contract type")


class JobListing(BaseModel):
    """Individual job listing."""
    title: str
    company: str
    location: str
    url: str
    description: str | None = None
    salary: str | None = None
    contract_type: str | None = None
    posted_date: str | None = None
    source: str = Field(..., description="Data source (adzuna, google_jobs, remoteok)")


class JobSearchResponse(BaseModel):
    """Response from job search."""
    success: bool = True
    jobs: list[JobListing] = Field(default_factory=list)
    count: int = Field(0, description="Number of jobs found")
    sources: list[str] = Field(default_factory=list, description="Sources used")
    query: dict[str, Any] = Field(default_factory=dict, description="Search query parameters")
    corrected_query: str | None = Field(None, description="Spell-corrected query if applicable")
    original_query: str | None = None


# ============================================
# RECRUITER SEARCH SCHEMAS
# ============================================

class RecruiterSearchRequest(BaseModel):
    """Request to search for recruiters."""
    company_name: str = Field(..., min_length=2, max_length=100, description="Company name")
    location: str | None = Field(None, max_length=100, description="Location")


class RecruiterInfo(BaseModel):
    """Recruiter information."""
    name: str
    title: str
    company: str
    linkedin_url: str
    email: str | None = None
    location: str | None = None


class RecruiterSearchResponse(BaseModel):
    """Response from recruiter search."""
    success: bool = True
    recruiters: list[RecruiterInfo] = Field(default_factory=list)
    count: int = 0
    company: str
    location: str | None = None


# ============================================
# HEALTH CHECK SCHEMA
# ============================================

class HealthCheck(BaseModel):
    """Health check response."""
    status: Literal["healthy", "degraded", "unhealthy"]
    service: str = "huntzen-backend"
    timestamp: float
    checks: dict[str, Any] = Field(default_factory=dict, description="Component health checks")


# ============================================
# ERROR SCHEMAS
# ============================================

class ErrorResponse(BaseModel):
    """Generic error response."""
    success: bool = False
    error: str = Field(..., description="Error code or message")
    detail: str | None = Field(None, description="Additional error details")
    status_code: int = Field(..., description="HTTP status code")


class ValidationError(BaseModel):
    """Validation error details."""
    loc: list[str] = Field(..., description="Location of error (field path)")
    msg: str = Field(..., description="Error message")
    type: str = Field(..., description="Error type")


class ValidationErrorResponse(BaseModel):
    """Response for 422 validation errors."""
    detail: list[ValidationError]
