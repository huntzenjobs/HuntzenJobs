#!/usr/bin/env python3
"""
Test Security Monitoring System
Verifies that security events are properly logged to Supabase
"""

import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Supabase config
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Need service role for testing

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    print(f"   SUPABASE_URL: {'✅' if SUPABASE_URL else '❌'}")
    print(f"   SUPABASE_SERVICE_ROLE_KEY: {'✅' if SUPABASE_KEY else '❌'}")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def test_table_exists():
    """Test 1: Verify security_events table exists"""
    print("\n📊 Test 1: Checking if security_events table exists...")

    try:
        result = supabase.table("security_events").select("id").limit(1).execute()
        print("✅ security_events table exists")
        return True
    except Exception as e:
        print(f"❌ security_events table not found: {e}")
        return False


def test_insert_event():
    """Test 2: Insert a test security event"""
    print("\n📝 Test 2: Inserting test security event...")

    try:
        event_data = {
            "event_type": "test.monitoring_check",
            "severity": "info",
            "user_id": None,  # Test without user
            "session_id": "test-session-123",
            "ip_address": "127.0.0.1",
            "user_agent": "Test Script v1.0",
            "event_data": {
                "test": True,
                "message": "Security monitoring test",
                "timestamp": "2026-01-28T22:00:00Z"
            }
        }

        result = supabase.table("security_events").insert(event_data).execute()

        if result.data and len(result.data) > 0:
            event_id = result.data[0]["id"]
            print(f"✅ Event inserted successfully (ID: {event_id})")
            return event_id
        else:
            print("❌ Event insertion failed")
            return None

    except Exception as e:
        print(f"❌ Error inserting event: {e}")
        return None


def test_query_events():
    """Test 3: Query recent security events"""
    print("\n🔍 Test 3: Querying recent security events...")

    try:
        result = (
            supabase.table("security_events")
            .select("id, event_type, severity, created_at")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )

        if result.data:
            print(f"✅ Found {len(result.data)} recent events:")
            for event in result.data:
                print(f"   - [{event['severity']}] {event['event_type']} at {event['created_at']}")
            return True
        else:
            print("⚠️  No events found (table might be empty)")
            return True

    except Exception as e:
        print(f"❌ Error querying events: {e}")
        return False


def test_critical_event():
    """Test 4: Insert a critical event (should trigger alerts)"""
    print("\n🚨 Test 4: Inserting CRITICAL security event...")

    try:
        event_data = {
            "event_type": "test.critical_alert",
            "severity": "critical",
            "user_id": None,
            "session_id": "test-session-456",
            "ip_address": "192.168.1.100",
            "user_agent": "Test Script v1.0",
            "event_data": {
                "test": True,
                "alert_type": "critical_test",
                "message": "This is a test critical event for Sentry",
                "expected_action": "Should be sent to Sentry"
            }
        }

        result = supabase.table("security_events").insert(event_data).execute()

        if result.data and len(result.data) > 0:
            event_id = result.data[0]["id"]
            print(f"✅ Critical event inserted (ID: {event_id})")
            print("   ⚠️  Check Sentry dashboard for this event!")
            return event_id
        else:
            print("❌ Critical event insertion failed")
            return None

    except Exception as e:
        print(f"❌ Error inserting critical event: {e}")
        return None


def test_cleanup(event_ids: list):
    """Test 5: Cleanup test events"""
    print("\n🧹 Test 5: Cleaning up test events...")

    try:
        for event_id in event_ids:
            if event_id:
                supabase.table("security_events").delete().eq("id", event_id).execute()

        print(f"✅ Cleaned up {len(event_ids)} test events")
        return True
    except Exception as e:
        print(f"⚠️  Error during cleanup: {e}")
        return False


def main():
    print("=" * 60)
    print("🔒 SECURITY MONITORING TEST SUITE")
    print("=" * 60)

    test_results = []
    inserted_event_ids = []

    # Run tests
    test_results.append(("Table Exists", test_table_exists()))

    event_id = test_insert_event()
    if event_id:
        inserted_event_ids.append(event_id)
        test_results.append(("Insert Event", True))
    else:
        test_results.append(("Insert Event", False))

    test_results.append(("Query Events", test_query_events()))

    critical_id = test_critical_event()
    if critical_id:
        inserted_event_ids.append(critical_id)
        test_results.append(("Critical Event", True))
    else:
        test_results.append(("Critical Event", False))

    # Cleanup
    test_results.append(("Cleanup", test_cleanup(inserted_event_ids)))

    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)

    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")

    print(f"\n🎯 Results: {passed}/{total} tests passed")

    if passed == total:
        print("\n✅ All tests passed! Security monitoring is working correctly.")
        print("\n📝 Next steps:")
        print("   1. Check Sentry dashboard for the critical event")
        print("   2. Configure Supabase webhook to /api/security-alerts")
        print("   3. Test real login events in the app")
    else:
        print("\n⚠️  Some tests failed. Check the errors above.")

    print("=" * 60)


if __name__ == "__main__":
    main()
