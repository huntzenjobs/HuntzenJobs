#!/usr/bin/env python3
"""
Test Sentry Backend Integration
Sends a test event directly to Sentry
"""

import os
from dotenv import load_dotenv
import sentry_sdk

load_dotenv()

# Initialize Sentry
SENTRY_DSN = os.getenv("SENTRY_DSN")

if not SENTRY_DSN:
    print("❌ SENTRY_DSN not configured in .env")
    exit(1)

print(f"🔧 Initializing Sentry...")
print(f"   DSN: {SENTRY_DSN[:50]}...")

sentry_sdk.init(
    dsn=SENTRY_DSN,
    environment="development",
    traces_sample_rate=1.0,
)

print("\n📤 Sending test event to Sentry...")

# Send a test message
sentry_sdk.capture_message(
    "Security Alert: test_from_python_backend",
    level="error",
    tags={
        "security": True,
        "test": True,
        "source": "backend_test_script"
    },
    extras={
        "message": "This is a test event from Python backend",
        "timestamp": "2026-01-28T23:20:00Z"
    }
)

print("✅ Event sent successfully!")
print("\n📊 Check Sentry Dashboard:")
print("   1. Go to https://sentry.io")
print("   2. Navigate to Issues")
print("   3. Look for 'Security Alert: test_from_python_backend'")
print("   4. Check your email for alert notification")
print("\n⏱️  Wait 30-60 seconds for the event to appear")
