"""
Load Testing for Modal CV Processing (S6-6)

Tests the auto-scaling capabilities of Modal Labs with concurrent CV uploads.

Test scenarios:
1. 10 concurrent CVs (warm-up)
2. 50 concurrent CVs (moderate load)
3. 100 concurrent CVs (high load)
4. Burst test: 200 CVs in 30 seconds

Success criteria:
- All uploads succeed (<500ms API response)
- Processing completes within 20s
- Error rate <1%
- Modal auto-scales appropriately

Usage:
    pytest tests/load/test_modal_load.py -v --log-cli-level=INFO

Author: HuntZen Team
Date: 2026-01-28
Sprint: 6 - Ticket S6-6
"""

import pytest
import asyncio
import httpx
import time
import os
from pathlib import Path
from typing import List, Dict, Any
import statistics

# ============================================
# CONFIGURATION
# ============================================

# API configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
TEST_JWT_TOKEN = os.getenv("TEST_JWT_TOKEN", "")  # Must be set for tests

# Test PDF path (create a sample PDF if not exists)
TEST_PDF_PATH = Path(__file__).parent / "test_cv.pdf"

# Load test parameters
CONCURRENT_UPLOADS = [10, 50, 100]  # Progressive load
TIMEOUT_SECONDS = 120  # 2 minutes max per test
POLLING_INTERVAL = 2  # Poll every 2 seconds


# ============================================
# FIXTURES
# ============================================

@pytest.fixture(scope="session")
def test_pdf():
    """Create or verify test PDF exists."""
    if not TEST_PDF_PATH.exists():
        pytest.skip("Test PDF not found. Create tests/load/test_cv.pdf")

    return TEST_PDF_PATH


@pytest.fixture(scope="session")
def auth_headers():
    """Get authentication headers."""
    if not TEST_JWT_TOKEN:
        pytest.skip("TEST_JWT_TOKEN environment variable not set")

    return {"Authorization": f"Bearer {TEST_JWT_TOKEN}"}


# ============================================
# HELPER FUNCTIONS
# ============================================

async def upload_cv(
    client: httpx.AsyncClient,
    pdf_path: Path,
    auth_headers: Dict[str, str],
    test_id: int
) -> Dict[str, Any]:
    """
    Upload a CV and return timing + cv_id.

    Returns:
        Dict with upload_time, cv_id, success
    """
    start_time = time.time()

    try:
        with open(pdf_path, "rb") as f:
            files = {"file": (f"test_cv_{test_id}.pdf", f, "application/pdf")}
            data = {
                "job_description": "Python developer with 3+ years experience",
                "language": "fr"
            }

            response = await client.post(
                f"{API_BASE_URL}/api/cv-analysis/async",
                files=files,
                data=data,
                headers=auth_headers,
                timeout=30.0
            )

        upload_time = time.time() - start_time

        if response.status_code == 200:
            result = response.json()
            return {
                "success": True,
                "cv_id": result.get("cv_id"),
                "upload_time": upload_time,
                "test_id": test_id
            }
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}",
                "upload_time": upload_time,
                "test_id": test_id
            }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "upload_time": time.time() - start_time,
            "test_id": test_id
        }


async def poll_cv_status(
    client: httpx.AsyncClient,
    cv_id: str,
    auth_headers: Dict[str, str],
    timeout: int = TIMEOUT_SECONDS
) -> Dict[str, Any]:
    """
    Poll CV status until completion or timeout.

    Returns:
        Dict with status, result, total_time
    """
    start_time = time.time()
    last_status = "pending"

    while time.time() - start_time < timeout:
        try:
            response = await client.get(
                f"{API_BASE_URL}/api/cv-analysis/status/{cv_id}",
                headers=auth_headers,
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                status = data.get("status")
                last_status = status

                if status == "completed":
                    return {
                        "success": True,
                        "status": status,
                        "total_time": time.time() - start_time,
                        "processing_time": data.get("processing_time_seconds"),
                        "cv_id": cv_id
                    }

                elif status == "failed":
                    return {
                        "success": False,
                        "status": status,
                        "error": data.get("error"),
                        "total_time": time.time() - start_time,
                        "cv_id": cv_id
                    }

        except Exception as e:
            print(f"Polling error for {cv_id}: {e}")

        # Wait before next poll
        await asyncio.sleep(POLLING_INTERVAL)

    # Timeout
    return {
        "success": False,
        "status": last_status,
        "error": "Polling timeout",
        "total_time": time.time() - start_time,
        "cv_id": cv_id
    }


async def upload_and_poll(
    client: httpx.AsyncClient,
    pdf_path: Path,
    auth_headers: Dict[str, str],
    test_id: int
) -> Dict[str, Any]:
    """
    Complete workflow: Upload + Poll until complete.

    Returns:
        Dict with all timing metrics
    """
    # Upload
    upload_result = await upload_cv(client, pdf_path, auth_headers, test_id)

    if not upload_result["success"]:
        return upload_result

    # Poll
    cv_id = upload_result["cv_id"]
    poll_result = await poll_cv_status(client, cv_id, auth_headers)

    # Combine results
    return {
        **upload_result,
        **poll_result,
        "upload_time": upload_result["upload_time"],
        "total_time": poll_result.get("total_time", 0),
        "processing_time": poll_result.get("processing_time", 0)
    }


# ============================================
# TESTS
# ============================================

@pytest.mark.asyncio
@pytest.mark.parametrize("num_concurrent", CONCURRENT_UPLOADS)
async def test_concurrent_cv_uploads(
    test_pdf: Path,
    auth_headers: Dict[str, str],
    num_concurrent: int
):
    """
    Test concurrent CV uploads with auto-scaling.

    Verifies:
    - All uploads succeed
    - API response time <500ms
    - Processing completes within 20s
    - Error rate <1%
    """
    print(f"\n\n{'='*60}")
    print(f"🚀 LOAD TEST: {num_concurrent} Concurrent CV Uploads")
    print(f"{'='*60}\n")

    async with httpx.AsyncClient() as client:
        # Start timer
        test_start = time.time()

        # Launch concurrent uploads + polling
        tasks = [
            upload_and_poll(client, test_pdf, auth_headers, i)
            for i in range(num_concurrent)
        ]

        # Wait for all to complete
        results = await asyncio.gather(*tasks)

        test_duration = time.time() - test_start

        # ============================================
        # ANALYZE RESULTS
        # ============================================

        successful = [r for r in results if r.get("success")]
        failed = [r for r in results if not r.get("success")]

        upload_times = [r["upload_time"] for r in results if "upload_time" in r]
        total_times = [r["total_time"] for r in successful if "total_time" in r]
        processing_times = [r["processing_time"] for r in successful if r.get("processing_time")]

        success_rate = len(successful) / len(results) * 100
        error_rate = len(failed) / len(results) * 100

        # ============================================
        # PRINT METRICS
        # ============================================

        print(f"\n📊 RESULTS:")
        print(f"   Total CVs: {len(results)}")
        print(f"   Successful: {len(successful)} ({success_rate:.1f}%)")
        print(f"   Failed: {len(failed)} ({error_rate:.1f}%)")
        print(f"   Test Duration: {test_duration:.2f}s")

        if upload_times:
            print(f"\n⏱️  UPLOAD TIMES (API Response):")
            print(f"   Min: {min(upload_times):.3f}s")
            print(f"   Max: {max(upload_times):.3f}s")
            print(f"   Avg: {statistics.mean(upload_times):.3f}s")
            print(f"   P50: {statistics.median(upload_times):.3f}s")
            print(f"   P95: {statistics.quantiles(upload_times, n=20)[18]:.3f}s" if len(upload_times) > 10 else "   P95: N/A")

        if total_times:
            print(f"\n⏱️  TOTAL TIMES (Upload + Processing):")
            print(f"   Min: {min(total_times):.2f}s")
            print(f"   Max: {max(total_times):.2f}s")
            print(f"   Avg: {statistics.mean(total_times):.2f}s")
            print(f"   P50: {statistics.median(total_times):.2f}s")
            print(f"   P95: {statistics.quantiles(total_times, n=20)[18]:.2f}s" if len(total_times) > 10 else "   P95: N/A")

        if processing_times:
            print(f"\n⏱️  PROCESSING TIMES (Modal Only):")
            print(f"   Min: {min(processing_times):.2f}s")
            print(f"   Max: {max(processing_times):.2f}s")
            print(f"   Avg: {statistics.mean(processing_times):.2f}s")

        if failed:
            print(f"\n❌ ERRORS:")
            for r in failed[:10]:  # Show first 10 errors
                print(f"   Test #{r.get('test_id')}: {r.get('error', 'Unknown')}")

        print(f"\n{'='*60}\n")

        # ============================================
        # ASSERTIONS
        # ============================================

        # Success rate must be >99%
        assert success_rate >= 99.0, f"Success rate too low: {success_rate:.1f}% (expected ≥99%)"

        # API response time must be <500ms for 95th percentile
        if len(upload_times) > 10:
            p95_upload = statistics.quantiles(upload_times, n=20)[18]
            assert p95_upload < 0.5, f"P95 upload time too high: {p95_upload:.3f}s (expected <0.5s)"

        # Average processing time should be <20s
        if processing_times:
            avg_processing = statistics.mean(processing_times)
            assert avg_processing < 20.0, f"Avg processing time too high: {avg_processing:.2f}s (expected <20s)"

        print(f"✅ Load test passed: {num_concurrent} concurrent uploads")


@pytest.mark.asyncio
async def test_burst_load(test_pdf: Path, auth_headers: Dict[str, str]):
    """
    Burst test: 200 CVs in 30 seconds.

    Tests Modal's ability to scale quickly under burst traffic.
    """
    print(f"\n\n{'='*60}")
    print(f"💥 BURST TEST: 200 CVs in 30 seconds")
    print(f"{'='*60}\n")

    BURST_SIZE = 200
    BURST_DURATION = 30  # seconds
    BATCH_SIZE = 20  # Upload in batches

    async with httpx.AsyncClient() as client:
        burst_start = time.time()
        all_results = []

        # Upload in batches to simulate burst
        for batch_num in range(BURST_SIZE // BATCH_SIZE):
            batch_start = time.time()

            # Upload batch
            tasks = [
                upload_cv(client, test_pdf, auth_headers, batch_num * BATCH_SIZE + i)
                for i in range(BATCH_SIZE)
            ]
            batch_results = await asyncio.gather(*tasks)
            all_results.extend(batch_results)

            # Pace to spread over BURST_DURATION
            elapsed = time.time() - burst_start
            target_elapsed = (batch_num + 1) * (BURST_DURATION / (BURST_SIZE // BATCH_SIZE))
            sleep_time = max(0, target_elapsed - elapsed)
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)

        upload_duration = time.time() - burst_start

        # Now poll all CVs
        print(f"\n📤 Uploaded {len(all_results)} CVs in {upload_duration:.2f}s")
        print(f"⏳ Polling for completion...")

        poll_tasks = [
            poll_cv_status(client, r["cv_id"], auth_headers)
            for r in all_results if r.get("success") and r.get("cv_id")
        ]
        poll_results = await asyncio.gather(*poll_tasks)

        # Analyze
        successful = [r for r in poll_results if r.get("success")]
        total_duration = time.time() - burst_start

        print(f"\n📊 BURST RESULTS:")
        print(f"   Total CVs: {BURST_SIZE}")
        print(f"   Successful: {len(successful)} ({len(successful)/BURST_SIZE*100:.1f}%)")
        print(f"   Total Duration: {total_duration:.2f}s")

        if successful:
            processing_times = [r["processing_time"] for r in successful if r.get("processing_time")]
            print(f"   Avg Processing Time: {statistics.mean(processing_times):.2f}s")

        # Assertion: At least 95% success
        success_rate = len(successful) / BURST_SIZE * 100
        assert success_rate >= 95.0, f"Burst test failed: {success_rate:.1f}% success (expected ≥95%)"

        print(f"\n✅ Burst test passed!")


# ============================================
# COST ESTIMATION
# ============================================

def estimate_modal_cost(num_cvs: int, avg_processing_time: float):
    """
    Estimate Modal Labs cost for CV processing.

    Args:
        num_cvs: Number of CVs processed
        avg_processing_time: Average processing time in seconds

    Returns:
        Estimated cost in USD
    """
    CPU_HOURS_PER_CV = (avg_processing_time / 3600) * 2  # 2 vCPUs
    COST_PER_CPU_HOUR = 0.16  # Modal pricing

    total_cpu_hours = CPU_HOURS_PER_CV * num_cvs
    total_cost = total_cpu_hours * COST_PER_CPU_HOUR

    print(f"\n💰 COST ESTIMATION:")
    print(f"   CVs processed: {num_cvs}")
    print(f"   Avg processing time: {avg_processing_time:.2f}s")
    print(f"   Total CPU-hours: {total_cpu_hours:.2f}")
    print(f"   Estimated cost: ${total_cost:.4f}")
    print(f"   Cost per CV: ${total_cost/num_cvs:.6f}")

    # Monthly projection (1000 CV/day)
    monthly_cvs = 1000 * 30
    monthly_cpu_hours = CPU_HOURS_PER_CV * monthly_cvs
    monthly_cost = monthly_cpu_hours * COST_PER_CPU_HOUR

    print(f"\n📅 MONTHLY PROJECTION (1000 CV/day):")
    print(f"   CVs/month: {monthly_cvs:,}")
    print(f"   CPU-hours/month: {monthly_cpu_hours:.2f}")
    print(f"   Estimated cost: ${monthly_cost:.2f}/month")

    return total_cost


if __name__ == "__main__":
    """
    Run load tests with pytest.

    Example:
        pytest tests/load/test_modal_load.py -v --log-cli-level=INFO
    """
    pytest.main([__file__, "-v", "--log-cli-level=INFO"])
