"""
Health and monitoring endpoints

Provides health check and monitoring endpoints for system observability.
Includes webhook failure tracking for alerting and debugging.
"""

from fastapi import APIRouter, HTTPException
from structlog import get_logger
from typing import Dict, Any
from datetime import datetime

logger = get_logger(__name__)

# Initialize router
router = APIRouter()

# Import dependencies
try:
    from src.services.stripe import supabase_client
except ImportError as e:
    logger.error(f"Failed to import dependencies: {e}")
    raise


@router.get("/webhooks")
async def get_webhook_health(hours: int = 24) -> Dict[str, Any]:
    """
    Get webhook processing statistics for monitoring.

    Returns webhook success rate, failure count, and recent failures
    for the specified time period (default: last 24 hours).

    This endpoint enables external monitoring without database access.
    Use it for:
    - Dashboards (Grafana, Datadog, etc.)
    - Alerting (PagerDuty, Slack, etc.)
    - Debugging webhook issues

    Args:
        hours: Time window in hours (default: 24, max: 168)

    Returns:
        Dict with webhook statistics including success rate and failures

    Example response:
        {
            "total_events": 142,
            "failed_events": 2,
            "success_rate": 98.6,
            "unresolved_failures": 2,
            "recent_failures": [
                {
                    "event_id": "evt_xxx",
                    "event_type": "checkout.session.completed",
                    "error": "Database connection timeout",
                    "retry_count": 2,
                    "last_attempt": "2026-02-09T12:34:56Z"
                }
            ],
            "period_hours": 24,
            "timestamp": "2026-02-09T15:00:00Z"
        }
    """
    try:
        if not supabase_client:
            raise HTTPException(status_code=500, detail="Database not configured")

        # Validate hours parameter
        if hours < 1 or hours > 168:  # Max 7 days
            raise HTTPException(status_code=400, detail="hours must be between 1 and 168")

        # Get webhook failure statistics
        failures_response = supabase_client.rpc("get_webhook_failure_stats", {
            "p_hours": hours
        }).execute()

        if not failures_response.data:
            # No failures in period
            failures_data = {
                "total_failures": 0,
                "unique_events": 0,
                "high_retry_events": 0,
                "event_types": {},
                "recent_failures": []
            }
        else:
            failures_data = failures_response.data[0] if isinstance(failures_response.data, list) else failures_response.data

        # Get webhook processing statistics (total events processed)
        processing_response = supabase_client.rpc("get_webhook_processing_stats", {
            "p_hours": hours
        }).execute()

        if not processing_response.data:
            processing_data = {
                "total_events": 0,
                "events_by_type": {},
                "oldest_event": None,
                "newest_event": None
            }
        else:
            processing_data = processing_response.data[0] if isinstance(processing_response.data, list) else processing_response.data

        # Calculate metrics
        total_events = processing_data.get("total_events", 0)
        failed_events = failures_data.get("total_failures", 0)

        # Success rate calculation
        if total_events > 0:
            success_rate = round(((total_events - failed_events) / total_events) * 100, 2)
        else:
            success_rate = 100.0 if failed_events == 0 else 0.0

        # Build response
        response = {
            "total_events": total_events,
            "failed_events": failed_events,
            "success_rate": success_rate,
            "unresolved_failures": failures_data.get("unique_events", 0),
            "high_retry_failures": failures_data.get("high_retry_events", 0),
            "events_by_type": processing_data.get("events_by_type", {}),
            "failure_types": failures_data.get("event_types", {}),
            "recent_failures": failures_data.get("recent_failures", []) or [],
            "period_hours": hours,
            "period_start": processing_data.get("oldest_event"),
            "period_end": processing_data.get("newest_event"),
            "timestamp": datetime.utcnow().isoformat()
        }

        # Add health status
        if success_rate < 95:
            response["status"] = "critical"
            response["message"] = f"Webhook success rate below 95%: {success_rate}%"
        elif success_rate < 99:
            response["status"] = "warning"
            response["message"] = f"Webhook success rate below 99%: {success_rate}%"
        elif failures_data.get("high_retry_events", 0) > 0:
            response["status"] = "warning"
            response["message"] = f"{failures_data['high_retry_events']} events with >3 retries"
        else:
            response["status"] = "healthy"
            response["message"] = "All webhooks processing successfully"

        logger.info(f"Webhook health check: {response['status']} - {success_rate}% success rate")

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get webhook health: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.get("/ping")
async def ping() -> Dict[str, str]:
    """
    Simple ping endpoint for basic health checks.

    Returns:
        Dict with status and timestamp
    """
    return {
        "status": "ok",
        "service": "huntzen-backend",
        "timestamp": datetime.utcnow().isoformat()
    }
