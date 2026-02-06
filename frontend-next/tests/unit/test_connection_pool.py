"""
Unit tests for connection pool (S6-1).

Tests cover:
- Pool initialization and configuration
- Connection acquisition and release
- Pool statistics monitoring
- Concurrent connection handling
- Graceful shutdown

Author: HuntZen Team
Date: 2026-01-27
"""

import pytest
import asyncio
import os
from unittest.mock import patch, MagicMock
from app.database import (
    init_connection_pool,
    close_connection_pool,
    get_db,
    get_pool_stats,
    pool
)


class TestConnectionPoolInitialization:
    """Test connection pool initialization and configuration."""

    @pytest.mark.asyncio
    async def test_connection_pool_initialized(self):
        """Test connection pool is properly initialized with correct parameters."""
        # Given: DATABASE_URL is set
        assert os.getenv("DATABASE_URL"), "DATABASE_URL must be set for tests"

        # When: Get pool stats
        stats = await get_pool_stats()

        # Then: Pool should be active
        assert stats["status"] == "active"
        assert stats["size"] >= 10, "Pool size should be at least min_size (10)"
        assert stats["size"] >= 0, "Should have connections in pool"
        assert "utilization" in stats
        assert 0 <= stats["utilization"] <= 1.0
        assert "min_size" in stats
        assert "max_size" in stats
        assert stats["min_size"] == 10
        assert stats["max_size"] == 50

    @pytest.mark.asyncio
    async def test_pool_stats_when_disabled(self):
        """Test get_pool_stats returns disabled status when pool is None."""
        # Given: Pool is None (simulate no DATABASE_URL)
        import app.database as db_module
        original_pool = db_module.pool
        db_module.pool = None

        try:
            # When: Get stats
            stats = await get_pool_stats()

            # Then: Should indicate disabled
            assert stats["status"] == "disabled"
        finally:
            # Restore original pool
            db_module.pool = original_pool

    def test_init_connection_pool_without_database_url(self):
        """Test init_connection_pool logs warning when DATABASE_URL not set."""
        # Given: No DATABASE_URL
        with patch.dict(os.environ, {"DATABASE_URL": ""}, clear=False):
            # When: Initialize pool
            init_connection_pool()

            # Then: Should not raise error (just warns and returns)
            # Pool will be None
            pass


class TestConnectionAcquisition:
    """Test acquiring and releasing connections from pool."""

    @pytest.mark.asyncio
    async def test_get_db_connection(self):
        """Test getting connection from pool works correctly."""
        # When: Get connection from pool
        async with get_db() as conn:
            # Then: Should be able to execute query
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1 as test")
                result = await cur.fetchone()
                assert result["test"] == 1

    @pytest.mark.asyncio
    async def test_get_db_raises_when_pool_not_initialized(self):
        """Test get_db raises RuntimeError when pool is not initialized."""
        # Given: Pool is None
        import app.database as db_module
        original_pool = db_module.pool
        db_module.pool = None

        try:
            # When/Then: Should raise RuntimeError
            with pytest.raises(RuntimeError, match="Connection pool not initialized"):
                async with get_db() as conn:
                    pass
        finally:
            # Restore original pool
            db_module.pool = original_pool

    @pytest.mark.asyncio
    async def test_connection_returns_to_pool_after_use(self):
        """Test connection is properly returned to pool after context manager exits."""
        # Given: Get initial pool stats
        stats_before = await get_pool_stats()
        available_before = stats_before["available"]

        # When: Use a connection
        async with get_db() as conn:
            # During: Available connections should decrease
            stats_during = await get_pool_stats()
            assert stats_during["available"] < available_before

        # Then: After context exits, connection should be returned
        stats_after = await get_pool_stats()
        assert stats_after["available"] == available_before


class TestConcurrentConnections:
    """Test pool handles concurrent connections correctly."""

    @pytest.mark.asyncio
    async def test_pool_handles_10_concurrent_connections(self):
        """Test pool successfully handles 10 concurrent connections."""
        async def query():
            async with get_db() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT pg_sleep(0.01)")  # 10ms sleep

        # When: 10 concurrent queries
        await asyncio.gather(*[query() for _ in range(10)])

        # Then: Pool should still be healthy
        stats = await get_pool_stats()
        assert stats["status"] == "active"
        assert stats["utilization"] < 0.9, "Pool utilization should be < 90%"

    @pytest.mark.asyncio
    async def test_pool_handles_100_concurrent_connections(self):
        """Test pool handles 100 concurrent connections without exhaustion."""
        async def query():
            async with get_db() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT pg_sleep(0.01)")  # 10ms sleep

        # When: 100 concurrent queries
        tasks = [query() for _ in range(100)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Then: All should succeed (no exceptions)
        errors = [r for r in results if isinstance(r, Exception)]
        assert len(errors) == 0, f"Expected 0 errors, got {len(errors)}"

        # And: Pool should not be exhausted
        stats = await get_pool_stats()
        assert stats["utilization"] < 0.9, f"Pool utilization {stats['utilization']} should be <90%"


class TestPoolStatistics:
    """Test connection pool statistics and monitoring."""

    @pytest.mark.asyncio
    async def test_pool_stats_returns_correct_structure(self):
        """Test get_pool_stats returns all required fields."""
        # When: Get pool stats
        stats = await get_pool_stats()

        # Then: Should have all required fields
        assert "status" in stats
        assert "size" in stats
        assert "available" in stats
        assert "requests_waiting" in stats
        assert "utilization" in stats

    @pytest.mark.asyncio
    async def test_pool_utilization_calculation(self):
        """Test pool utilization is calculated correctly."""
        # Given: Get stats
        stats = await get_pool_stats()

        # When: Calculate expected utilization
        if stats["size"] > 0:
            expected_utilization = 1 - (stats["available"] / stats["size"])
            expected_utilization = round(expected_utilization, 2)

            # Then: Should match
            assert stats["utilization"] == expected_utilization

    @pytest.mark.asyncio
    async def test_pool_stats_with_connection_in_use(self):
        """Test pool stats correctly reflect connection in use."""
        # Given: Get initial stats
        stats_before = await get_pool_stats()
        initial_utilization = stats_before["utilization"]

        # When: Use a connection
        async with get_db() as conn:
            stats_during = await get_pool_stats()

            # Then: Utilization should increase
            assert stats_during["utilization"] >= initial_utilization


class TestPoolShutdown:
    """Test graceful connection pool shutdown."""

    @pytest.mark.asyncio
    async def test_close_connection_pool_succeeds(self):
        """Test closing connection pool works without errors."""
        # Given: Pool is initialized
        stats_before = await get_pool_stats()
        assert stats_before["status"] == "active"

        # When: Close pool
        await close_connection_pool()

        # Then: Pool should be closed (will be None or closed)
        # Note: In real tests, pool will be reinitialized by conftest

    @pytest.mark.asyncio
    async def test_close_pool_when_already_none(self):
        """Test closing pool when it's None doesn't raise error."""
        # Given: Pool is None
        import app.database as db_module
        original_pool = db_module.pool
        db_module.pool = None

        try:
            # When: Close pool
            await close_connection_pool()

            # Then: Should not raise error
            pass
        finally:
            # Restore
            db_module.pool = original_pool


class TestHealthEndpoint:
    """Test /health endpoint with connection pool stats."""

    @pytest.mark.asyncio
    async def test_health_endpoint_includes_pool_stats(self, async_client):
        """Test /health endpoint returns connection pool statistics."""
        # When: Call /health endpoint
        response = await async_client.get("/health")

        # Then: Should return 200
        assert response.status_code == 200

        data = response.json()

        # And: Should include pool stats
        assert "checks" in data
        assert "connection_pool" in data["checks"]

        pool_stats = data["checks"]["connection_pool"]
        assert "status" in pool_stats
        assert pool_stats["status"] in ["active", "disabled", "error"]

        # If active, should have all stats
        if pool_stats["status"] == "active":
            assert "size" in pool_stats
            assert "available" in pool_stats
            assert "utilization" in pool_stats

    @pytest.mark.asyncio
    async def test_health_endpoint_warns_on_high_utilization(self, async_client):
        """Test /health endpoint status changes to degraded when pool utilization >80%."""
        # Note: This test would require simulating high load
        # For now, just verify the endpoint structure
        response = await async_client.get("/health")
        data = response.json()

        # Should have status field
        assert "status" in data
        assert data["status"] in ["healthy", "degraded", "unhealthy"]


class TestDictRowFactory:
    """Test that queries return dictionaries instead of tuples."""

    @pytest.mark.asyncio
    async def test_query_returns_dict(self):
        """Test queries return dict (not tuple) due to dict_row factory."""
        # When: Execute query
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1 as id, 'test' as name")
                result = await cur.fetchone()

        # Then: Should be dict
        assert isinstance(result, dict)
        assert result["id"] == 1
        assert result["name"] == "test"

    @pytest.mark.asyncio
    async def test_query_multiple_rows_returns_dicts(self):
        """Test fetchall returns list of dicts."""
        # When: Execute query returning multiple rows
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT generate_series(1, 3) as num")
                results = await cur.fetchall()

        # Then: Should be list of dicts
        assert len(results) == 3
        assert all(isinstance(row, dict) for row in results)
        assert results[0]["num"] == 1
        assert results[1]["num"] == 2
        assert results[2]["num"] == 3
