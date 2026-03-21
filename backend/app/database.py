"""
Database connection pool management for HuntZen JobSearch.

Sprint 6: Migration from psycopg2 to psycopg3 with AsyncConnectionPool.
This module provides:
- Async connection pooling (min=10, max=50 connections)
- Pool statistics for monitoring
- Graceful startup/shutdown lifecycle management
- Context manager for safe connection handling

Author: HuntZen Team
Date: 2026-01-27
"""

import os
from contextlib import asynccontextmanager
from typing import Any

import structlog
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

logger = structlog.get_logger(__name__)

# Global connection pool instance
pool: AsyncConnectionPool | None = None


async def init_connection_pool_async() -> None:
    """
    Initialize the async connection pool (async version).

    Pool configuration:
    - min_size: 10 connections (always available)
    - max_size: 50 connections (scales under load)
    - timeout: 30 seconds (wait time for connection)
    - max_idle: 300 seconds (5 minutes idle before closing)
    - row_factory: dict_row (returns dict instead of tuples)

    Raises:
        RuntimeError: If DATABASE_URL is not configured
    """
    global pool

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.warning(
            "connection_pool_disabled",
            reason="DATABASE_URL not set in environment"
        )
        return

    try:
        async def no_reset(conn):
            pass  # PgBouncer transaction mode : chaque transaction repart d'une connexion fraîche, RESET ALL inutile et cassant

        pool = AsyncConnectionPool(
            conninfo=database_url,
            min_size=3,
            max_size=10,  # 10/worker × 4 workers × 2 replicas = 80 clients PgBouncer → 60 conn Postgres max
            timeout=30,
            max_idle=300,  # 5 minutes
            reset=no_reset,  # empêche RESET ALL → rejeté par PgBouncer transaction mode
            kwargs={
                "row_factory": dict_row,
                "prepare_threshold": None,  # désactive prepared statements → non supporté en transaction mode
                "autocommit": True,         # chaque requête = transaction autonome → PgBouncer libère immédiatement la connexion serveur
            }
        )

        # Open the pool (async operation)
        await pool.open()

        logger.info(
            "connection_pool_initialized",
            min_size=5,
            max_size=10,
            timeout=30,
            max_idle=300
        )
    except Exception as e:
        logger.error(
            "connection_pool_init_failed",
            error=str(e),
            error_type=type(e).__name__
        )
        raise


def init_connection_pool() -> None:
    """
    Synchronous wrapper for init_connection_pool_async().

    DEPRECATED: This function is kept for backward compatibility with sync startup code.
    Use init_connection_pool_async() in async contexts (FastAPI lifespan).

    Note: This will be removed in Sprint 7 as we fully migrate to async.
    """
    import asyncio

    try:
        # Try to get current event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If loop is already running (e.g., in tests), schedule the init
            asyncio.create_task(init_connection_pool_async())
        else:
            # Otherwise run it synchronously
            loop.run_until_complete(init_connection_pool_async())
    except RuntimeError:
        # No event loop, create one
        asyncio.run(init_connection_pool_async())


async def close_connection_pool() -> None:
    """
    Close the connection pool gracefully on application shutdown.

    This ensures all connections are properly closed and resources are released.
    """
    global pool

    if pool:
        try:
            await pool.close()
            logger.info("connection_pool_closed")
        except Exception as e:
            logger.error(
                "connection_pool_close_failed",
                error=str(e),
                error_type=type(e).__name__
            )
            raise
    else:
        logger.debug("connection_pool_close_skipped", reason="pool was None")


@asynccontextmanager
async def get_db():
    """
    Get a database connection from the pool.

    Usage:
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
                user = await cur.fetchone()

    Yields:
        AsyncConnection: Database connection with dict_row factory

    Raises:
        RuntimeError: If connection pool is not initialized
    """
    if not pool:
        raise RuntimeError(
            "Connection pool not initialized. "
            "Call init_connection_pool() during app startup."
        )

    async with pool.connection() as conn:
        yield conn


async def get_pool_stats() -> dict[str, Any]:
    """
    Get connection pool statistics for monitoring and health checks.

    Returns:
        dict: Pool statistics with the following keys:
            - status (str): "active" or "disabled"
            - size (int): Current number of connections in pool
            - available (int): Number of idle connections
            - requests_waiting (int): Number of requests waiting for connection
            - utilization (float): Pool utilization (0.0 to 1.0)
            - min_size (int): Minimum pool size
            - max_size (int): Maximum pool size

    Example:
        {
            "status": "active",
            "size": 10,
            "available": 8,
            "requests_waiting": 0,
            "utilization": 0.2,
            "min_size": 10,
            "max_size": 50
        }
    """
    if not pool:
        return {"status": "disabled"}

    try:
        stats = pool.get_stats()

        # Extract stats from dict (not object attributes)
        pool_size = stats.get("pool_size", 0)
        pool_available = stats.get("pool_available", 0)
        requests_waiting = stats.get("requests_waiting", 0)
        pool_min = stats.get("pool_min", 0)
        pool_max = stats.get("pool_max", 0)

        # Calculate utilization (percentage of pool in use)
        utilization = 1 - (pool_available / pool_size) if pool_size > 0 else 0

        return {
            "status": "active",
            "size": pool_size,
            "available": pool_available,
            "requests_waiting": requests_waiting,
            "utilization": round(utilization, 2),
            "min_size": pool_min,
            "max_size": pool_max
        }
    except Exception as e:
        logger.error(
            "pool_stats_failed",
            error=str(e),
            error_type=type(e).__name__
        )
        return {
            "status": "error",
            "error": str(e)
        }


# ============================================
# LEGACY CACHE FUNCTIONS (Kept for backward compatibility)
# These use old psycopg2 connections
# Will be migrated to async in Sprint 7
# ============================================

import re
from datetime import datetime, timedelta


def normalize_search_key(job_title: str, location: str) -> str:
    """
    LEGACY: Normalize search key for cache.
    Will be migrated to async in Sprint 7.
    """
    text = f"{job_title or ''} {location or ''}".lower()
    words = re.findall(r'\w+', text)
    words.sort()
    return "_".join(words)


def check_job_cache(cache_key: str) -> list[dict] | None:
    """
    LEGACY: Check job cache using old psycopg2 connection.
    Will be migrated to async in Sprint 7.
    """
    conn = get_db_connection()
    if not conn:
        return None

    try:
        import psycopg2.extras
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT results FROM job_search_cache WHERE cache_key = %s AND expires_at > NOW()",
                (cache_key,)
            )
            row = cur.fetchone()
            return row['results'] if row else None
    except Exception as e:
        logger.error("legacy_cache_check_failed", error=str(e))
        return None
    finally:
        conn.close()


def save_job_cache(cache_key: str, query_params: dict, results: list):
    """
    LEGACY: Save job cache using old psycopg2 connection.
    Will be migrated to async in Sprint 7.
    """
    import psycopg2.extras
    from job_finder.config import get_settings

    conn = get_db_connection()
    if not conn:
        return

    try:
        settings = get_settings()
        expires_at = datetime.utcnow() + timedelta(hours=settings.cache_ttl_hours)
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO job_search_cache (cache_key, query_params, results, expires_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (cache_key) DO UPDATE SET
                results = EXCLUDED.results,
                expires_at = EXCLUDED.expires_at
            """, (cache_key, psycopg2.extras.Json(query_params), psycopg2.extras.Json(results), expires_at))
            conn.commit()
    except Exception as e:
        logger.error("legacy_cache_save_failed", error=str(e))
    finally:
        conn.close()


# ============================================
# LEGACY FUNCTIONS (Kept for backward compatibility)
# These will be deprecated in Sprint 7
# ============================================

def get_db_connection():
    """
    DEPRECATED: Use async get_db() context manager instead.

    This function is kept for backward compatibility with existing code.
    Will be removed in Sprint 7.
    """
    import psycopg2
    from job_finder.config import get_settings

    logger.warning(
        "deprecated_function_called",
        function="get_db_connection",
        message="Use async get_db() instead. This function will be removed in Sprint 7."
    )

    settings = get_settings()
    if not settings.database_url:
        return None

    try:
        conn = psycopg2.connect(settings.database_url)
        return conn
    except Exception as e:
        logger.error("legacy_db_connection_failed", error=str(e))
        return None


def init_db():
    """
    DEPRECATED: Database initialization now happens via migrations.

    This function is kept for backward compatibility.
    Will be removed in Sprint 7.
    """
    logger.warning(
        "deprecated_function_called",
        function="init_db",
        message="Use Supabase migrations instead. This function will be removed in Sprint 7."
    )

    # Call legacy function for now
    conn = get_db_connection()
    if not conn:
        logger.info("init_db_skipped", reason="no database connection")
        return

    try:
        with conn.cursor() as cur:
            # Job Search Cache
            cur.execute("""
                CREATE TABLE IF NOT EXISTS job_search_cache (
                    id SERIAL PRIMARY KEY,
                    cache_key VARCHAR(255) UNIQUE NOT NULL,
                    query_params JSONB NOT NULL,
                    results JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL
                );
            """)

            # Recruiter Cache
            cur.execute("""
                CREATE TABLE IF NOT EXISTS recruiter_cache (
                    id SERIAL PRIMARY KEY,
                    company_name VARCHAR(255) NOT NULL,
                    location VARCHAR(255),
                    recruiter_data JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    UNIQUE(company_name, location)
                );
            """)

            # User Sessions
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(64) UNIQUE NOT NULL,
                    cv_text TEXT,
                    preferences JSONB DEFAULT '{}'::jsonb,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)

            conn.commit()
            logger.info("legacy_tables_initialized")
    except Exception as e:
        logger.error("legacy_init_db_failed", error=str(e))
    finally:
        conn.close()
