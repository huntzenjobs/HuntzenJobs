#!/usr/bin/env python3
"""
Create a test user via Supabase
"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

TEST_EMAIL = "test@huntzen.com"
TEST_PASSWORD = "test123456"

def create_test_user():
    """Create test user via Supabase"""
    print(f"Creating test user: {TEST_EMAIL}")

    try:
        # Create Supabase client
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

        # Try to sign up
        response = supabase.auth.sign_up({
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "options": {
                "data": {
                    "full_name": "Test User"
                }
            }
        })

        if response.user:
            print(f"✓ Test user created successfully!")
            print(f"  User ID: {response.user.id}")
            print(f"  Email: {response.user.email}")
            return True
        else:
            print("✓ Test user might already exist")
            return True

    except Exception as e:
        error_msg = str(e)
        if "already registered" in error_msg.lower() or "already exists" in error_msg.lower():
            print("✓ Test user already exists")
            return True
        else:
            print(f"✗ Error creating test user: {e}")
            return False


if __name__ == "__main__":
    success = create_test_user()
    exit(0 if success else 1)
