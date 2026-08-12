"""
Health and monitoring endpoints

Provides health check and monitoring endpoints for system observability.
Includes webhook failure tracking for alerting and debugging.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from structlog import get_logger

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
async def get_webhook_health(hours: int = 24) -> dict[str, Any]:
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

        # Lire la même source que le dispatcher actuel. La table historique
        # webhook_failures n'est plus alimentée par les nouveaux webhooks.
        since = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
        failures_response = supabase_client.table("stripe_webhook_events").select(
            "id,stripe_event_id,event_type,error_type,processing_started_at,"
            "failed_at,created_at",
            count="exact",
        ).eq("status", "failed").gte("created_at", since).order(
            "failed_at",
            desc=True,
        ).execute()
        failed_rows = failures_response.data or []
        failure_types: dict[str, int] = {}
        for failed_event in failed_rows:
            event_type = failed_event.get("event_type") or "unknown"
            failure_types[event_type] = failure_types.get(event_type, 0) + 1
        recent_failures = [
            {
                "event_id": failed_event.get("stripe_event_id"),
                "event_type": failed_event.get("event_type"),
                "error": failed_event.get("error_type"),
                "retry_count": 0,
                "last_attempt": (
                    failed_event.get("failed_at")
                    or failed_event.get("processing_started_at")
                    or failed_event.get("created_at")
                ),
            }
            for failed_event in failed_rows[:10]
        ]
        failed_count = failures_response.count or len(failed_rows)
        failures_data = {
            "total_failures": failed_count,
            "unique_events": failed_count,
            "high_retry_events": 0,
            "event_types": failure_types,
            "recent_failures": recent_failures,
        }

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
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}") from None


@router.get("/ping")
async def ping() -> dict[str, str]:
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


@router.get("/pool")
async def pool_health() -> dict[str, Any]:
    """
    DB connection pool metrics pour monitoring Betterstack/Grafana.

    Configurer une alerte si utilization > 0.8 ou requests_waiting > 3.
    """
    from app.database import get_pool_stats
    stats = await get_pool_stats()
    return {
        **stats,
        "timestamp": datetime.utcnow().isoformat()
    }
