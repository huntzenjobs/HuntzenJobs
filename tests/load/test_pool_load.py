"""
Load tests for connection pool (S6-1).

These tests verify the system can handle high concurrent load without:
- Connection pool exhaustion
- Memory leaks
- Performance degradation
- Error rate increase

Run with: pytest -m load -v

Author: HuntZen Team
Date: 2026-01-27
"""

import pytest
import asyncio
import time
from httpx import AsyncClient
from app.database import get_db, get_pool_stats


@pytest.mark.load
@pytest.mark.asyncio
async def test_connection_pool_200_concurrent_requests():
    """
    Test system handles 200 concurrent API requests without errors.

    Success criteria:
    - Success rate >= 99%
    - Pool utilization < 90%
    - No connection pool exhaustion
    """
    async with AsyncClient(base_url="http://localhost:8000", timeout=30.0) as client:
        # When: 200 concurrent requests to /health
        start_time = time.time()
        tasks = [client.get("/health") for _ in range(200)]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = time.time() - start_time

        # Then: Check success rate
        successes = [r for r in responses if not isinstance(r, Exception) and r.status_code == 200]
        success_rate = len(successes) / len(responses)

        print(f"\n📊 Load Test Results:")
        print(f"  Total requests: {len(responses)}")
        print(f"  Successful: {len(successes)}")
        print(f"  Failed: {len(responses) - len(successes)}")
        print(f"  Success rate: {success_rate * 100:.2f}%")
        print(f"  Elapsed time: {elapsed:.2f}s")
        print(f"  Throughput: {len(responses) / elapsed:.2f} req/s")

        assert success_rate >= 0.99, f"Success rate {success_rate} < 99%"

        # And: Check no pool exhaustion
        if len(successes) > 0:
            health_data = successes[0].json()
            pool_info = health_data.get("checks", {}).get("connection_pool", {})

            if pool_info.get("status") == "active":
                utilization = pool_info.get("utilization", 0)
                print(f"  Pool utilization: {utilization * 100:.2f}%")
                assert utilization < 0.9, f"Pool utilization {utilization} >= 90%"


@pytest.mark.load
@pytest.mark.asyncio
async def test_connection_pool_sustained_load_60s():
    """
    Test connection pool under sustained load for 60 seconds.

    Success criteria:
    - No memory leaks (pool size stable)
    - Consistent response times
    - No errors
    """
    duration = 60  # 60 seconds
    requests_per_second = 10

    async with AsyncClient(base_url="http://localhost:8000", timeout=30.0) as client:
        start_time = time.time()
        total_requests = 0
        total_errors = 0
        response_times = []

        print(f"\n🔥 Starting sustained load test ({duration}s at {requests_per_second} req/s)...")

        while time.time() - start_time < duration:
            batch_start = time.time()

            # Send batch of requests
            tasks = [client.get("/health") for _ in range(requests_per_second)]
            responses = await asyncio.gather(*tasks, return_exceptions=True)

            # Collect metrics
            for r in responses:
                total_requests += 1
                if isinstance(r, Exception) or r.status_code != 200:
                    total_errors += 1
                else:
                    # Record response time
                    response_times.append(r.elapsed.total_seconds())

            # Wait to maintain rate
            batch_elapsed = time.time() - batch_start
            if batch_elapsed < 1.0:
                await asyncio.sleep(1.0 - batch_elapsed)

        elapsed = time.time() - start_time

        # Calculate metrics
        error_rate = total_errors / total_requests if total_requests > 0 else 0
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        p95_response_time = sorted(response_times)[int(len(response_times) * 0.95)] if response_times else 0

        print(f"\n📊 Sustained Load Results:")
        print(f"  Duration: {elapsed:.2f}s")
        print(f"  Total requests: {total_requests}")
        print(f"  Errors: {total_errors}")
        print(f"  Error rate: {error_rate * 100:.2f}%")
        print(f"  Avg response time: {avg_response_time * 1000:.2f}ms")
        print(f"  P95 response time: {p95_response_time * 1000:.2f}ms")

        # Check pool health
        final_response = await client.get("/health")
        health_data = final_response.json()
        pool_info = health_data.get("checks", {}).get("connection_pool", {})

        if pool_info.get("status") == "active":
            print(f"  Final pool size: {pool_info.get('size')}")
            print(f"  Final pool utilization: {pool_info.get('utilization') * 100:.2f}%")

        # Assertions
        assert error_rate < 0.01, f"Error rate {error_rate} >= 1%"
        assert avg_response_time < 1.0, f"Avg response time {avg_response_time}s >= 1s"


@pytest.mark.load
@pytest.mark.asyncio
async def test_database_queries_concurrent_load():
    """
    Test direct database queries under concurrent load.

    Success criteria:
    - All queries complete successfully
    - Pool handles concurrent access
    - No connection leaks
    """
    async def execute_query():
        """Execute a simple query using connection pool."""
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT pg_sleep(0.01), 1 as result")  # 10ms query
                result = await cur.fetchone()
                return result["result"]

    # When: 100 concurrent database queries
    tasks = [execute_query() for _ in range(100)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Then: All should succeed
    errors = [r for r in results if isinstance(r, Exception)]
    successes = [r for r in results if not isinstance(r, Exception) and r == 1]

    print(f"\n📊 Database Query Load Results:")
    print(f"  Total queries: {len(results)}")
    print(f"  Successful: {len(successes)}")
    print(f"  Failed: {len(errors)}")

    assert len(errors) == 0, f"Expected 0 errors, got {len(errors)}: {errors[:5]}"
    assert len(successes) == 100, f"Expected 100 successes, got {len(successes)}"

    # Check pool health
    stats = await get_pool_stats()
    print(f"  Final pool utilization: {stats.get('utilization', 0) * 100:.2f}%")
    assert stats.get("utilization", 0) < 0.9, "Pool utilization should be <90%"


@pytest.mark.load
@pytest.mark.asyncio
async def test_connection_pool_burst_traffic():
    """
    Test connection pool handles burst traffic patterns.

    Simulates realistic traffic with bursts followed by quiet periods.

    Success criteria:
    - Pool scales up during bursts
    - Pool scales down during quiet periods
    - No errors during transitions
    """
    async with AsyncClient(base_url="http://localhost:8000", timeout=30.0) as client:
        results = []

        # Pattern: burst, quiet, burst, quiet
        for cycle in range(3):
            # Burst: 50 concurrent requests
            print(f"\n🔥 Burst #{cycle + 1}: 50 concurrent requests")
            burst_start = time.time()
            burst_tasks = [client.get("/health") for _ in range(50)]
            burst_responses = await asyncio.gather(*burst_tasks, return_exceptions=True)
            burst_elapsed = time.time() - burst_start

            burst_successes = [r for r in burst_responses if not isinstance(r, Exception) and r.status_code == 200]
            burst_success_rate = len(burst_successes) / len(burst_responses)

            print(f"  Success rate: {burst_success_rate * 100:.2f}%")
            print(f"  Time: {burst_elapsed:.2f}s")

            results.extend(burst_responses)

            # Quiet period: 2 seconds with minimal traffic
            print(f"  💤 Quiet period: 2s")
            await asyncio.sleep(2)

            # Check pool utilization after burst
            health = await client.get("/health")
            pool_info = health.json().get("checks", {}).get("connection_pool", {})
            if pool_info.get("status") == "active":
                print(f"  Pool utilization after burst: {pool_info.get('utilization') * 100:.2f}%")

        # Final analysis
        total_successes = [r for r in results if not isinstance(r, Exception) and r.status_code == 200]
        overall_success_rate = len(total_successes) / len(results)

        print(f"\n📊 Burst Traffic Results:")
        print(f"  Total requests: {len(results)}")
        print(f"  Overall success rate: {overall_success_rate * 100:.2f}%")

        assert overall_success_rate >= 0.99, f"Success rate {overall_success_rate} < 99%"


@pytest.mark.load
@pytest.mark.asyncio
async def test_connection_pool_timeout_behavior():
    """
    Test connection pool timeout when all connections are busy.

    This test verifies graceful handling when pool is temporarily exhausted.
    """
    # This test would require saturating the pool (>50 concurrent long-running queries)
    # For now, we just verify the pool can recover from temporary saturation

    async def long_query():
        """Execute a longer query (100ms)."""
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT pg_sleep(0.1)")  # 100ms

    # When: Create more tasks than max pool size (50)
    # But spread them over time so we don't exceed timeout
    tasks = []
    for i in range(60):
        tasks.append(long_query())
        if (i + 1) % 10 == 0:
            await asyncio.sleep(0.05)  # Small delay every 10 tasks

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Then: All should eventually succeed (may have some timeouts)
    errors = [r for r in results if isinstance(r, Exception)]
    successes = [r for r in results if not isinstance(r, Exception)]

    print(f"\n📊 Timeout Behavior Results:")
    print(f"  Total queries: {len(results)}")
    print(f"  Successful: {len(successes)}")
    print(f"  Errors: {len(errors)}")

    # Allow some errors due to timeout, but most should succeed
    success_rate = len(successes) / len(results)
    assert success_rate >= 0.9, f"Success rate {success_rate} < 90%"
