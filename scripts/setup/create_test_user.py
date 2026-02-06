#!/usr/bin/env python3
"""
Create a test user for E2E tests
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = "http://localhost:8000"
TEST_EMAIL = "test@huntzen.com"
TEST_PASSWORD = "test123456"
TEST_NAME = "Test User"

def create_test_user():
    """Create test user via signup endpoint"""
    print(f"Creating test user: {TEST_EMAIL}")

    try:
        response = requests.post(
            f"{BACKEND_URL}/api/auth/signup",
            json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "full_name": TEST_NAME
            }
        )

        if response.status_code == 200 or response.status_code == 201:
            print("✓ Test user created successfully!")
            data = response.json()
            print(f"  User ID: {data.get('user_id')}")
            print(f"  Email: {TEST_EMAIL}")
            return True

        elif response.status_code == 400 and "already exists" in response.text.lower():
            print("✓ Test user already exists")
            return True

        else:
            print(f"✗ Failed to create test user: {response.status_code}")
            print(f"  Response: {response.text}")
            return False

    except Exception as e:
        print(f"✗ Error creating test user: {e}")
        return False


if __name__ == "__main__":
    success = create_test_user()
    exit(0 if success else 1)
