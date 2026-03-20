"""
API Routes
===========
Main router combining all route modules.
"""

from fastapi import APIRouter

from src.api.routes.admin import router as admin_router
from src.api.routes.admin_cleanup import router as admin_cleanup_router
from src.api.routes.applications import router as applications_router
from src.api.routes.assistant import router as assistant_router
from src.api.routes.auth import router as auth_router
from src.api.routes.branding import router as branding_router
from src.api.routes.career_score import router as career_score_router
from src.api.routes.coach import router as coach_router
from src.api.routes.contact import router as contact_router
from src.api.routes.coupons import router as coupons_router
from src.api.routes.cron import router as cron_router
from src.api.routes.cv_adapter import router as cv_adapter_router
from src.api.routes.cv_analysis import router as cv_analysis_router
from src.api.routes.documents import router as documents_router
from src.api.routes.events import router as events_router
from src.api.routes.health import router as health_router
from src.api.routes.insider_finder import router as insider_finder_router
from src.api.routes.jobs import router as jobs_router
from src.api.routes.notifications import router as notifications_router
from src.api.routes.pages import router as pages_router
from src.api.routes.presence import banner_router, presence_router, tracking_router
from src.api.routes.public_plans import router as public_plans_router
from src.api.routes.queue import router as queue_router
from src.api.routes.recruiter import router as recruiter_router
from src.api.routes.recruiter_finder import router as recruiter_finder_router
from src.api.routes.referrals import router as referrals_router
from src.api.routes.saved_jobs import router as saved_jobs_router
from src.api.routes.static_data import router as static_data_router
from src.api.routes.stats import router as stats_router
from src.api.routes.stress import router as stress_router
from src.api.routes.stripe import router as stripe_router
from src.api.routes.subscription import router as subscription_router
from src.api.routes.suggestions import router as suggestions_router
from src.api.routes.support import router as support_router

router = APIRouter()

# Include all routers
router.include_router(pages_router, tags=["Pages"])
router.include_router(static_data_router, tags=["Static Data"])
router.include_router(auth_router, tags=["Authentication"])
router.include_router(saved_jobs_router, tags=["Saved Jobs"])
router.include_router(coach_router, prefix="/api/coach", tags=["Career Coach"])
router.include_router(assistant_router, prefix="/api/assistant", tags=["Multi-Assistant"])
router.include_router(jobs_router, prefix="/api/jobs", tags=["Job Search"])
router.include_router(cv_analysis_router, prefix="/api/cv-analysis", tags=["CV Analysis Async"])
router.include_router(cv_adapter_router, prefix="/api/cv-adapter", tags=["CV Adapter"])
router.include_router(recruiter_router, prefix="/api/recruiter", tags=["Recruiter Contact"])
router.include_router(insider_finder_router, prefix="/api/insider-finder", tags=["Insider Finder"])
router.include_router(events_router, prefix="/api/job-fairs", tags=["Job Fairs"])
router.include_router(stripe_router, prefix="/api/stripe", tags=["Stripe Payments"])
router.include_router(subscription_router, prefix="/api/subscription", tags=["Subscription Management"])
router.include_router(admin_cleanup_router, prefix="/api/admin", tags=["Admin Cleanup"])
router.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
router.include_router(branding_router, prefix="/api/branding", tags=["Personal Branding"])
router.include_router(health_router, prefix="/api/health", tags=["Health & Monitoring"])
router.include_router(recruiter_finder_router, prefix="/api/recruiter-finder", tags=["Recruiter Finder"])
router.include_router(documents_router, prefix="/api/documents", tags=["Documents"])
router.include_router(referrals_router, prefix="/api/referrals", tags=["Referrals"])
router.include_router(applications_router, tags=["Applications"])
router.include_router(notifications_router, tags=["Notifications"])
router.include_router(career_score_router, prefix="/api/career-score", tags=["Career Score"])
router.include_router(coupons_router, prefix="/api/coupons", tags=["Coupons"])
router.include_router(stats_router, prefix="/api/stats", tags=["Stats"])
router.include_router(cron_router, prefix="/api/cron", tags=["Cron"])
router.include_router(support_router, prefix="/api/support", tags=["Support"])
router.include_router(queue_router, prefix="/api/queue", tags=["Queue"])
router.include_router(presence_router, prefix="/api/presence", tags=["Presence"])
router.include_router(tracking_router, prefix="/api/track", tags=["Tracking"])
router.include_router(banner_router, tags=["Banner & Maintenance"])
router.include_router(stress_router, prefix="/api/admin/stress", tags=["Stress Testing"])
router.include_router(suggestions_router, prefix="/api/assistant", tags=["Assistant Suggestions"])
router.include_router(public_plans_router, prefix="/api/public", tags=["Public Plans"])
router.include_router(contact_router, prefix="/api/contact", tags=["Contact"])
