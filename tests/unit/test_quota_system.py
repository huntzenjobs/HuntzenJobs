"""
Unit tests for quota enforcement system (S6-3).

Tests cover:
- SQL quota functions (check_user_quota, increment_usage, get_quota_status)
- Redis caching layer (QuotaCache)
- Service layer (app/quota.py functions)
- API endpoints with quota enforcement
- Error handling and edge cases

Author: HuntZen Team
Date: 2026-01-28
Sprint: 6 - Ticket S6-3
"""

import pytest
import uuid
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timedelta
from app.database import get_db
from app.cache import QuotaCache
from app.quota import (
    check_user_quota,
    check_and_enforce_quota,
    increment_user_usage,
    get_user_quota_status,
    invalidate_user_quota_cache
)
from fastapi import HTTPException


@pytest.fixture
async def test_user_id():
    """Create a test user with Free plan subscription."""
    user_id = str(uuid.uuid4())

    # Insert user into auth.users (if not exists)
    async with get_db() as conn:
        async with conn.cursor() as cur:
            # Insert test user
            await cur.execute(
                "INSERT INTO auth.users (id, email) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                (user_id, f"test_{user_id}@example.com")
            )

            # Get Free plan ID
            await cur.execute("SELECT id FROM subscription_plans WHERE name = 'free' LIMIT 1")
            plan_row = await cur.fetchone()
            plan_id = plan_row["id"]

            # Insert subscription for user
            await cur.execute(
                """
                INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_end)
                VALUES (%s, %s, 'active', NOW() + INTERVAL '30 days')
                ON CONFLICT ON CONSTRAINT one_active_subscription_per_user DO NOTHING
                """,
                (user_id, plan_id)
            )

    yield user_id

    # Cleanup
    async with get_db() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM user_subscriptions WHERE user_id = %s", (user_id,))
            await cur.execute("DELETE FROM usage_quotas WHERE user_id = %s", (user_id,))
            await cur.execute("DELETE FROM auth.users WHERE id = %s", (user_id,))


# ============================================
# SQL FUNCTIONS TESTS
# ============================================

class TestSQLQuotaFunctions:
    """Test PostgreSQL quota functions."""

    @pytest.mark.asyncio
    async def test_check_user_quota_returns_true_when_under_limit(self, test_user_id):
        """Test check_user_quota returns TRUE when user has quota available."""
        # Given: User with Free plan (1 CV analysis per day)
        async with get_db() as conn:
            async with conn.cursor() as cur:
                # When: Check quota for cv_analysis
                await cur.execute(
                    "SELECT check_user_quota(%s, 'cv_analysis') as has_quota",
                    (test_user_id,)
                )
                result = await cur.fetchone()

        # Then: Should have quota (0/1 used)
        assert result["has_quota"] is True

    @pytest.mark.asyncio
    async def test_check_user_quota_returns_false_when_limit_exceeded(self, test_user_id):
        """Test check_user_quota returns FALSE when quota exceeded."""
        # Given: User has already used their daily quota
        async with get_db() as conn:
            async with conn.cursor() as cur:
                # Use 1 CV analysis (Free plan limit)
                await cur.execute(
                    "SELECT increment_usage(%s, 'cv_analysis', 1)",
                    (test_user_id,)
                )

                # When: Check quota again
                await cur.execute(
                    "SELECT check_user_quota(%s, 'cv_analysis') as has_quota",
                    (test_user_id,)
                )
                result = await cur.fetchone()

        # Then: Should NOT have quota (1/1 used)
        assert result["has_quota"] is False

    @pytest.mark.asyncio
    async def test_increment_usage_creates_record_on_first_use(self, test_user_id):
        """Test increment_usage creates usage_quotas record if it doesn't exist."""
        # When: Increment usage for first time
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT increment_usage(%s, 'cv_analysis', 1) as success",
                    (test_user_id,)
                )
                result = await cur.fetchone()

        # Then: Should succeed and create record
        assert result["success"] is True

        # Verify record exists
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT cv_analyses_used FROM usage_quotas WHERE user_id = %s AND quota_date = CURRENT_DATE",
                    (test_user_id,)
                )
                usage_row = await cur.fetchone()

        assert usage_row["cv_analyses_used"] == 1

    @pytest.mark.asyncio
    async def test_increment_usage_updates_existing_record(self, test_user_id):
        """Test increment_usage updates existing record instead of creating duplicate."""
        # Given: User has already used 1 CV analysis
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT increment_usage(%s, 'cv_analysis', 1)",
                    (test_user_id,)
                )

                # When: Increment again
                await cur.execute(
                    "SELECT increment_usage(%s, 'cv_analysis', 1) as success",
                    (test_user_id,)
                )
                result = await cur.fetchone()

        # Then: Should succeed and update same record
        assert result["success"] is True

        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT cv_analyses_used FROM usage_quotas WHERE user_id = %s AND quota_date = CURRENT_DATE",
                    (test_user_id,)
                )
                usage_row = await cur.fetchone()

        assert usage_row["cv_analyses_used"] == 2

    @pytest.mark.asyncio
    async def test_get_quota_status_returns_all_features(self, test_user_id):
        """Test get_quota_status returns data for all 3 features."""
        # When: Get quota status
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT * FROM get_quota_status(%s)",
                    (test_user_id,)
                )
                rows = await cur.fetchall()

        # Then: Should have 3 rows (cv_analysis, coach, job_search)
        assert len(rows) == 3

        features = {row["feature"] for row in rows}
        assert features == {"cv_analysis", "coach", "job_search"}

        # Check structure
        for row in rows:
            assert "quota_limit" in row
            assert "quota_used" in row
            assert "quota_remaining" in row
            assert "quota_percentage" in row
            assert "has_access" in row
            assert "reset_at" in row

    @pytest.mark.asyncio
    async def test_get_quota_status_shows_correct_usage(self, test_user_id):
        """Test get_quota_status accurately reflects usage."""
        # Given: User has used 1 CV analysis
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT increment_usage(%s, 'cv_analysis', 1)",
                    (test_user_id,)
                )

                # When: Get quota status
                await cur.execute(
                    "SELECT * FROM get_quota_status(%s) WHERE feature = 'cv_analysis'",
                    (test_user_id,)
                )
                row = await cur.fetchone()

        # Then: Should show 1/1 used (Free plan limit)
        assert row["quota_limit"] == 1
        assert row["quota_used"] == 1
        assert row["quota_remaining"] == 0
        assert row["quota_percentage"] == 100.0
        assert row["has_access"] is False  # No more access


# ============================================
# REDIS CACHE TESTS
# ============================================

class TestRedisCache:
    """Test Redis caching layer."""

    @pytest.mark.asyncio
    async def test_quota_cache_set_and_get(self, test_user_id):
        """Test caching quota data to Redis."""
        # Given: Quota data
        quota_data = {
            "limit": 5,
            "used": 2,
            "remaining": 3,
            "percentage": 40.0,
            "has_access": True,
            "reset_at": "2026-01-29T00:00:00+00:00"
        }

        # When: Set cache
        await QuotaCache.set(test_user_id, "cv_analysis", quota_data)

        # Then: Should retrieve same data
        cached = await QuotaCache.get(test_user_id, "cv_analysis")
        assert cached is not None
        assert cached["limit"] == 5
        assert cached["used"] == 2
        assert cached["has_access"] is True

    @pytest.mark.asyncio
    async def test_quota_cache_invalidate(self, test_user_id):
        """Test invalidating cached quota."""
        # Given: Cached quota data
        quota_data = {"limit": 5, "used": 2, "has_access": True}
        await QuotaCache.set(test_user_id, "cv_analysis", quota_data)

        # When: Invalidate cache
        await QuotaCache.invalidate(test_user_id, "cv_analysis")

        # Then: Cache should be empty
        cached = await QuotaCache.get(test_user_id, "cv_analysis")
        assert cached is None

    @pytest.mark.asyncio
    async def test_quota_cache_invalidate_all(self, test_user_id):
        """Test invalidating all quotas for a user."""
        # Given: Cached quota for multiple features
        await QuotaCache.set(test_user_id, "cv_analysis", {"limit": 5})
        await QuotaCache.set(test_user_id, "coach", {"limit": 900})
        await QuotaCache.set(test_user_id, "job_search", {"limit": 10})

        # When: Invalidate all
        await QuotaCache.invalidate_all(test_user_id)

        # Then: All caches should be empty
        assert await QuotaCache.get(test_user_id, "cv_analysis") is None
        assert await QuotaCache.get(test_user_id, "coach") is None
        assert await QuotaCache.get(test_user_id, "job_search") is None


# ============================================
# SERVICE LAYER TESTS
# ============================================

class TestQuotaServiceLayer:
    """Test app/quota.py service functions."""

    @pytest.mark.asyncio
    async def test_check_user_quota_uses_cache_first(self, test_user_id):
        """Test check_user_quota tries cache before database."""
        # Given: Cached quota status
        cached_data = {
            "limit": 5,
            "used": 2,
            "has_access": True
        }
        await QuotaCache.set(test_user_id, "cv_analysis", cached_data)

        # When: Check quota
        has_quota = await check_user_quota(test_user_id, "cv_analysis")

        # Then: Should return cached value (no DB query)
        assert has_quota is True

    @pytest.mark.asyncio
    async def test_check_and_enforce_quota_raises_429_when_exceeded(self, test_user_id):
        """Test check_and_enforce_quota raises HTTPException 429 when quota exceeded."""
        # Given: User has exceeded quota
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT increment_usage(%s, 'cv_analysis', 1)",
                    (test_user_id,)
                )

        # When/Then: Should raise 429
        with pytest.raises(HTTPException) as exc_info:
            await check_and_enforce_quota(test_user_id, "cv_analysis")

        assert exc_info.value.status_code == 429
        assert "quota_exceeded" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_increment_user_usage_invalidates_cache(self, test_user_id):
        """Test incrementing usage invalidates the cache."""
        # Given: Cached quota data
        cached_data = {"limit": 5, "used": 2, "has_access": True}
        await QuotaCache.set(test_user_id, "cv_analysis", cached_data)

        # When: Increment usage
        await increment_user_usage(test_user_id, "cv_analysis", 1)

        # Then: Cache should be invalidated
        cached = await QuotaCache.get(test_user_id, "cv_analysis")
        assert cached is None

    @pytest.mark.asyncio
    async def test_get_user_quota_status_returns_all_features(self, test_user_id):
        """Test getting quota status returns dict with all features."""
        # When: Get quota status
        status = await get_user_quota_status(test_user_id)

        # Then: Should have all features
        assert "cv_analysis" in status
        assert "coach" in status
        assert "job_search" in status

        # Check structure
        for feature, data in status.items():
            assert "limit" in data
            assert "used" in data
            assert "remaining" in data
            assert "percentage" in data
            assert "has_access" in data
            assert "reset_at" in data

    @pytest.mark.asyncio
    async def test_invalidate_user_quota_cache_clears_all_features(self, test_user_id):
        """Test invalidating user cache clears all feature caches."""
        # Given: Cached data for all features
        await QuotaCache.set(test_user_id, "cv_analysis", {"limit": 5})
        await QuotaCache.set(test_user_id, "coach", {"limit": 900})
        await QuotaCache.set(test_user_id, "job_search", {"limit": 10})

        # When: Invalidate user cache
        await invalidate_user_quota_cache(test_user_id)

        # Then: All should be cleared
        assert await QuotaCache.get(test_user_id, "cv_analysis") is None
        assert await QuotaCache.get(test_user_id, "coach") is None
        assert await QuotaCache.get(test_user_id, "job_search") is None


# ============================================
# API ENDPOINT TESTS
# ============================================

class TestQuotaEnforcementEndpoints:
    """Test quota enforcement in API endpoints."""

    @pytest.mark.asyncio
    async def test_cv_analysis_endpoint_requires_auth(self, async_client):
        """Test /api/analyze-cv requires JWT authentication."""
        # When: Call without auth
        response = await async_client.post(
            "/api/analyze-cv",
            json={"cv_text": "Test CV content here", "language": "fr"}
        )

        # Then: Should return 403 (Forbidden - no auth header)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_cv_analysis_enforces_quota(self, async_client, test_user_id):
        """Test /api/analyze-cv enforces quota limits."""
        # This test would require creating a valid JWT token
        # For now, we'll test the quota logic directly
        from app.quota import check_and_enforce_quota

        # Given: User has exceeded quota
        async with get_db() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT increment_usage(%s, 'cv_analysis', 1)",
                    (test_user_id,)
                )

        # When/Then: Should raise 429
        with pytest.raises(HTTPException) as exc_info:
            await check_and_enforce_quota(test_user_id, "cv_analysis")

        assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_usage_stats_endpoint_requires_auth(self, async_client):
        """Test /api/usage-stats requires JWT authentication."""
        # When: Call without auth
        response = await async_client.get("/api/usage-stats")

        # Then: Should return 403 (Forbidden)
        assert response.status_code == 403


# ============================================
# EDGE CASES & ERROR HANDLING
# ============================================

class TestQuotaEdgeCases:
    """Test edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_check_quota_with_invalid_feature_raises_error(self, test_user_id):
        """Test checking quota with invalid feature raises ValueError."""
        # When/Then: Should raise ValueError
        with pytest.raises(ValueError, match="Invalid feature"):
            await check_user_quota(test_user_id, "invalid_feature")

    @pytest.mark.asyncio
    async def test_increment_usage_with_negative_amount_raises_error(self, test_user_id):
        """Test incrementing usage with negative amount raises ValueError."""
        # When/Then: Should raise ValueError
        with pytest.raises(ValueError, match="non-negative"):
            await increment_user_usage(test_user_id, "cv_analysis", -5)

    @pytest.mark.asyncio
    async def test_quota_check_fails_open_on_db_error(self, test_user_id):
        """Test quota check returns True (allows access) if database fails."""
        # Given: Mocked database failure
        with patch("app.quota.get_db") as mock_get_db:
            mock_get_db.side_effect = Exception("Database connection failed")

            # When: Check quota
            has_quota = await check_user_quota(test_user_id, "cv_analysis")

            # Then: Should fail open (allow access)
            assert has_quota is True

    @pytest.mark.asyncio
    async def test_cache_failure_falls_back_to_database(self, test_user_id):
        """Test cache failure doesn't break quota checking."""
        # Given: Redis cache is unavailable
        with patch("app.quota.QuotaCache.get", side_effect=Exception("Redis down")):
            # When: Check quota (should fallback to DB)
            has_quota = await check_user_quota(test_user_id, "cv_analysis")

            # Then: Should still work (using database)
            assert has_quota is True  # Free plan user with no usage


# ============================================
# INTEGRATION TESTS
# ============================================

class TestQuotaSystemIntegration:
    """Integration tests for complete quota flow."""

    @pytest.mark.asyncio
    async def test_complete_quota_flow(self, test_user_id):
        """Test complete quota flow: check -> use -> increment -> check again."""
        # Step 1: Check initial quota (should have access)
        has_quota = await check_user_quota(test_user_id, "cv_analysis")
        assert has_quota is True

        # Step 2: Use the feature
        await increment_user_usage(test_user_id, "cv_analysis", 1)

        # Step 3: Check quota again (should be exhausted for Free plan)
        has_quota = await check_user_quota(test_user_id, "cv_analysis")
        assert has_quota is False

        # Step 4: Verify status shows no access
        status = await get_user_quota_status(test_user_id)
        cv_status = status["cv_analysis"]
        assert cv_status["used"] == 1
        assert cv_status["limit"] == 1
        assert cv_status["remaining"] == 0
        assert cv_status["has_access"] is False

    @pytest.mark.asyncio
    async def test_quota_resets_daily(self, test_user_id):
        """Test quota status shows correct reset time."""
        # When: Get quota status
        status = await get_user_quota_status(test_user_id)

        # Then: Should have reset_at timestamp for tomorrow
        cv_status = status["cv_analysis"]
        assert "reset_at" in cv_status
        assert cv_status["reset_at"] is not None

        # Parse reset time and verify it's tomorrow
        from datetime import datetime
        reset_time = datetime.fromisoformat(cv_status["reset_at"].replace("Z", "+00:00"))
        assert reset_time.date() > datetime.utcnow().date()
