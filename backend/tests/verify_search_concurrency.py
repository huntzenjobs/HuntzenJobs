import asyncio
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure src is importable
backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Mocking the dependencies before importing the app
with patch('src.api.deps.get_supabase_client'), \
     patch('src.api.deps.get_user_id_from_token', return_value="test_user_123"), \
     patch('src.api.routes.jobs.get_redis'), \
     patch('src.api.routes.jobs._check_job_search_quota'), \
     patch('src.api.routes.jobs._increment_job_search_quota'):
    
    from src.api.routes.jobs import search_jobs
    from src.models.schemas import JobSearchRequest

class MockRedis:
    def __init__(self):
        self.storage = {}
        self.locks = set()

    async def get(self, key):
        # Return string for JSON keys to mimic real Redis with decode_responses=True
        val = self.storage.get(key)
        return val

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.locks:
            return False
        self.storage[key] = value
        if nx:
            self.locks.add(key)
        return True

    async def setex(self, key, ttl, value):
        self.storage[key] = value
        return True

    async def delete(self, key):
        self.storage.pop(key, None)
        self.locks.discard(key)
        return True

async def test_search_concurrency_wait():
    """
    Test that Request 2 waits for Request 1 to finish and return cached results.
    """
    print("Starting concurrency test...")
    mock_redis = MockRedis()
    mock_agent = AsyncMock()
    
    # Simulate a slow agent for the first request
    async def slow_search(*args, **kwargs):
        print("Agent: Starting slow search (2s)...")
        await asyncio.sleep(2)  # 2 seconds delay
        print("Agent: search complete.")
        return {
            "success": True, 
            "jobs": [{"title": "Software Engineer", "company": "HuntZen", "url": "http://test.com", "source": "test"}],
            "metadata": {"total_raw": 1, "sources_used": ["test"]}
        }
    
    mock_agent.run.side_effect = slow_search
    
    request_data = JobSearchRequest(
        job_title="Software Engineer",
        country_code="us",
        city="San Francisco"
    )
    
    # Mock FastAPI Request
    mock_req = MagicMock()
    mock_req.query_params = {}
    
    with patch('src.api.routes.jobs.get_redis', return_value=mock_redis), \
         patch('src.api.routes.jobs._increment_job_search_quota') as mock_increment, \
         patch('src.api.routes.jobs.invalidate_user_quota_cache', return_value=None):
        
        print("Launching Request 1...")
        task1 = asyncio.create_task(search_jobs(mock_req, request_data, mock_agent, "Bearer token"))
        
        # Wait a bit so task1 acquires the lock
        await asyncio.sleep(0.5)
        
        print("Launching Request 2 (concurrent)...")
        task2 = asyncio.create_task(search_jobs(mock_req, request_data, mock_agent, "Bearer token"))
        
        print("Waiting for both tasks to complete...")
        results = await asyncio.gather(task1, task2)
        
        resp1, resp2 = results
        
        print(f"Result 1: success={resp1.success}, jobs={len(resp1.jobs)}")
        print(f"Result 2: success={resp2.success}, jobs={len(resp2.jobs)}")
        
        # Assertions
        assert resp1.success is True
        assert resp2.success is True
        assert len(resp1.jobs) == 1
        assert len(resp2.jobs) == 1
        
        # Verify agent was called ONLY ONCE
        print(f"Agent call count: {mock_agent.run.call_count}")
        assert mock_agent.run.call_count == 1
        
        # Verify quota incremented ONLY ONCE
        print(f"Quota increment call count: {mock_increment.call_count}")
        assert mock_increment.call_count == 1
        
        print("✅ CONCURRENCY TEST PASSED!")

if __name__ == "__main__":
    try:
        asyncio.run(test_search_concurrency_wait())
    except Exception as e:
        print(f"❌ TEST FAILED with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
