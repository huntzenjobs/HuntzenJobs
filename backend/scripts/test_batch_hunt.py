
import sys
import os
import asyncio
import json

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.services.job_providers.adzuna import AdzunaProvider
from src.services.recruiter_finder.serpapi import find_recruiters_serpapi
from src.config.settings import settings

async def test_batch_hunt():
    print("========================================")
    print("BATCH HUNT TEST: MANAGER IN FRANCE")
    print("========================================")
    
    # 1. Fetch Job Offers from Adzuna
    print("--- 1. Fetching jobs from Adzuna (max 50) ---")
    provider = AdzunaProvider()
    jobs = await provider.search(
        query="Manager",
        location="France",
        country_code="fr",
        max_results=50 # Higher to handle dedup
    )
    
    if not jobs:
        print("No jobs found on Adzuna. Aborting.")
        return

    # De-duplicate by company to test distinct targets
    seen_companies = set()
    unique_jobs = []
    for j in jobs:
        company = j.get("company")
        if company and company not in seen_companies:
            seen_companies.add(company)
            unique_jobs.append(j)
        if len(unique_jobs) >= 5:
            break

    print(f"Found {len(unique_jobs)} distinct companies to hunt.")

    # 2. Hunt Recruiters for each
    for i, job in enumerate(unique_jobs, 1):
        company = job['company']
        title = job['title']
        print(f"\n[TARGET {i}/{len(unique_jobs)}] {company} - {title}")
        
        try:
            print(f"Hunting for Recruiters at {company}...")
            result = await find_recruiters_serpapi(
                company_name=company,
                job_title=title,
                country_code="fr",
                max_contacts=3 # Keep it fast
            )
            
            recruiters = result.get("recruiters", [])
            initial = result.get("initial_candidates", 0)
            strategy = result.get("search_strategy", "No strategy")
            
            print(f"Strategy: {strategy}")
            print(f"Initial SerpAPI prospects: {initial}")
            
            if recruiters:
                print(f"SUCCESS! Found {len(recruiters)} VERIFIED profiles:")
                for r in recruiters:
                    details = r.get("validation_details", {})
                    print(f" ✅ {r['name']} | {r['linkedin']}")
                    print(f"    Company found: {details.get('company')} | Role matched: {details.get('is_in_hr')}")
            
            # Show ALL rejections for audit
            all_rejections = (result.get("validation_summary") or {}).get("rejected_examples", [])
            # In the actual result dict, we might have more than just 5 rejections, 
            # I'll modify the result builder in serpapi later but for now I'll use what's there
            if all_rejections:
                print("\nAudit - Rejected Profiles (Mismatch):")
                for rej in all_rejections:
                    print(f" ❌ {rej.get('name')} | {rej.get('linkedin')}")
                    print(f"    Reason: {rej.get('reason')} | Company was: {rej.get('company')}")
        except Exception as e:
            print(f"ERROR hunting at {company}: {e}")

async def main():
    await test_batch_hunt()

if __name__ == "__main__":
    asyncio.run(main())
