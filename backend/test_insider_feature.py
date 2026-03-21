
from dotenv import load_dotenv

# Load environment variables from project root BEFORE importing any project files
load_dotenv("../.env")

import asyncio  # noqa: E402
import logging  # noqa: E402

from src.services.recruiter_finder.insider_service import InsiderFinderService  # noqa: E402

# Configure logging
logging.basicConfig(level=logging.INFO)

async def test_feature():
    service = InsiderFinderService()

    print("🚀 TESTING FEATURE: Insider Finder (Groq + SerpAPI)")
    print("-" * 50)

    # Example: Data Analyst in Paris (La Banque Postale)
    print("Testing Case: Data Analyst at La Banque Postale Assurances, Paris")
    result = await service.find_insiders(
        job_title="Data Analyst",
        company="La Banque Postale Assurances",
        city="Paris",
        is_alternance=True
    )

    if result.get("success"):
        print("\n✅ AI STRATEGY USED:")
        print(result.get("strategy"))

        print(f"\n✅ INSIDERS FOUND ({result.get('total_found')}):")
        for i, insider in enumerate(result.get("insiders", []), 1):
            print(f"{i}. [{insider['label']}] {insider['name']}")
            print(f"   Title: {insider['title']}")
            print(f"   Link: {insider['link']}")
    else:
        print(f"\n❌ FAILED: {result.get('error')}")

if __name__ == "__main__":
    asyncio.run(test_feature())
