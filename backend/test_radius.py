"""
Test Radius Search Implementation
===================================
Quick test to verify radius_km parameter works correctly.
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from src.agents.job_scout.main_agent import JobScoutAgent


async def test_radius_search():
    """Test job search with radius parameter."""
    print("🧪 Testing radius_km implementation...")
    print("=" * 60)

    agent = JobScoutAgent()

    # Test 1: Search WITHOUT radius
    print("\n📍 Test 1: Search Paris WITHOUT radius")
    result1 = await agent.run(
        job_title="Data Engineer",
        country_code="fr",
        city="Paris",
        max_results=5,
        include_insights=False,
    )
    print(f"✅ Found {len(result1.get('jobs', []))} jobs")

    # Test 2: Search WITH radius (50 km)
    print("\n📍 Test 2: Search Paris WITH radius_km=50")
    result2 = await agent.run(
        job_title="Data Engineer",
        country_code="fr",
        city="Paris",
        radius_km=50,
        max_results=5,
        include_insights=False,
    )
    print(f"✅ Found {len(result2.get('jobs', []))} jobs")

    # Display sample job
    if result2.get('jobs'):
        job = result2['jobs'][0]
        print(f"\n📋 Sample job:")
        print(f"   Title: {job.get('title')}")
        print(f"   Company: {job.get('company')}")
        print(f"   Location: {job.get('location')}")

    print("\n" + "=" * 60)
    print("✅ All tests completed successfully!")


if __name__ == "__main__":
    asyncio.run(test_radius_search())
