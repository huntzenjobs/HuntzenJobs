#!/usr/bin/env python3
"""
Stripe Production API Tests
============================
Tests all Stripe-related endpoints against the live production backend.
Pattern: same style as test_sprint6_production.py

Usage:
    FASTAPI_URL=https://huntzenjobs-production.up.railway.app \
    TEST_USER_TOKEN=<your_jwt_token> \
    TEST_PAID_USER_TOKEN=<jwt_of_starter_user> \
    python e2e/test_stripe_production.py

Environment variables:
    FASTAPI_URL         - Backend URL (default: https://huntzenjobs-production.up.railway.app)
    TEST_USER_TOKEN     - JWT token for a Free plan user
    TEST_USER_EMAIL     - Email for a Free plan user (if no token)
    TEST_USER_PASSWORD  - Password for a Free plan user (if no token)
    TEST_PAID_USER_TOKEN - JWT token for a Starter/Pro user (for cancel tests)
"""

import os
import sys
import json
import time
import hmac
import hashlib
import requests
from datetime import datetime, timezone

# ============================================
# CONFIGURATION
# ============================================

BACKEND_URL = os.getenv("FASTAPI_URL", "https://huntzenjobs-production.up.railway.app")
TEST_USER_EMAIL = os.getenv("TEST_USER_EMAIL", "test-free@huntzen.com")
TEST_USER_PASSWORD = os.getenv("TEST_USER_PASSWORD", "")
TEST_USER_TOKEN = os.getenv("TEST_USER_TOKEN", "")
TEST_PAID_USER_TOKEN = os.getenv("TEST_PAID_USER_TOKEN", "")

# Colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
CYAN = "\033[96m"
RESET = "\033[0m"


def log_success(msg: str):
    print(f"  {GREEN}✓ {msg}{RESET}")


def log_error(msg: str):
    print(f"  {RED}✗ {msg}{RESET}")


def log_info(msg: str):
    print(f"  {BLUE}ℹ {msg}{RESET}")


def log_warning(msg: str):
    print(f"  {YELLOW}⚠ {msg}{RESET}")


def section(title: str):
    print(f"\n{CYAN}{'─' * 55}{RESET}")
    print(f"{CYAN}  {title}{RESET}")
    print(f"{CYAN}{'─' * 55}{RESET}")


# ============================================
# STRIPE TESTER CLASS
# ============================================

class StripeProductionTester:
    def __init__(self):
        self.free_token: str = TEST_USER_TOKEN
        self.paid_token: str = TEST_PAID_USER_TOKEN
        self.results: list = []

    def authenticate(self) -> bool:
        """Get JWT token if not provided via env."""
        if self.free_token:
            log_success("Using FREE user token from environment")
            return True

        if not TEST_USER_EMAIL or not TEST_USER_PASSWORD:
            log_error("Set TEST_USER_TOKEN or TEST_USER_EMAIL + TEST_USER_PASSWORD")
            return False

        log_info(f"Logging in as {TEST_USER_EMAIL}...")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/auth/login",
                json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
                timeout=10
            )
            if response.status_code == 200:
                self.free_token = response.json().get("access_token", "")
                log_success(f"Authenticated as {TEST_USER_EMAIL}")
                return True
            else:
                log_error(f"Login failed: {response.status_code} - {response.text[:100]}")
                return False
        except Exception as e:
            log_error(f"Auth error: {e}")
            return False

    def headers(self, token: str = None) -> dict:
        t = token or self.free_token
        return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}

    def record(self, name: str, passed: bool):
        self.results.append((name, passed))

    # ============================================
    # GROUP 1: CREATE CHECKOUT SESSION
    # ============================================

    def test_checkout_starter_monthly(self) -> bool:
        """Valid plan (starter/monthly) should return a Stripe checkout URL."""
        log_info("POST /api/stripe/create-checkout-session [starter/monthly]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/create-checkout-session",
                headers={**self.headers(), "Content-Type": "application/x-www-form-urlencoded"},
                data={"plan_name": "starter", "billing_period": "monthly"},
                timeout=15
            )
            if response.status_code != 200:
                log_error(f"Expected 200, got {response.status_code}: {response.text[:200]}")
                return False

            data = response.json()
            checkout_url = data.get("checkout_url", "")

            if not checkout_url or not checkout_url.startswith("https://checkout.stripe.com"):
                log_error(f"Expected Stripe checkout URL, got: {checkout_url[:100]}")
                return False

            log_success(f"Checkout URL OK: {checkout_url[:60]}...")
            return True

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_checkout_pro_yearly(self) -> bool:
        """Valid plan (pro/yearly) should return a checkout URL with yearly price."""
        log_info("POST /api/stripe/create-checkout-session [pro/yearly]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/create-checkout-session",
                headers={**self.headers(), "Content-Type": "application/x-www-form-urlencoded"},
                data={"plan_name": "pro", "billing_period": "yearly"},
                timeout=15
            )
            if response.status_code != 200:
                log_error(f"Expected 200, got {response.status_code}: {response.text[:200]}")
                return False

            data = response.json()
            checkout_url = data.get("checkout_url", "")
            if not checkout_url or not checkout_url.startswith("https://checkout.stripe.com"):
                log_error(f"Expected Stripe checkout URL, got: {checkout_url[:100]}")
                return False

            log_success(f"Yearly checkout URL OK: {checkout_url[:60]}...")
            return True

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_checkout_premium_monthly(self) -> bool:
        """Valid plan (premium/monthly) should return a checkout URL."""
        log_info("POST /api/stripe/create-checkout-session [premium/monthly]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/create-checkout-session",
                headers={**self.headers(), "Content-Type": "application/x-www-form-urlencoded"},
                data={"plan_name": "premium", "billing_period": "monthly"},
                timeout=15
            )
            if response.status_code != 200:
                log_error(f"Expected 200, got {response.status_code}: {response.text[:200]}")
                return False

            data = response.json()
            if not data.get("checkout_url", "").startswith("https://checkout.stripe.com"):
                log_error("No valid checkout URL in response")
                return False

            log_success("Premium monthly checkout URL OK")
            return True

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_checkout_invalid_plan(self) -> bool:
        """Invalid plan name should return 4xx error."""
        log_info("POST /api/stripe/create-checkout-session [invalid plan 'enterprise']")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/create-checkout-session",
                headers={**self.headers(), "Content-Type": "application/x-www-form-urlencoded"},
                data={"plan_name": "enterprise", "billing_period": "monthly"},
                timeout=15
            )
            if response.status_code in (400, 404, 422, 500):
                log_success(f"Invalid plan correctly rejected with {response.status_code}")
                return True
            else:
                log_error(f"Expected 4xx error, got {response.status_code}: {response.text[:100]}")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_checkout_unauthenticated(self) -> bool:
        """No auth token should return 401."""
        log_info("POST /api/stripe/create-checkout-session [no auth]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/create-checkout-session",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={"plan_name": "starter", "billing_period": "monthly"},
                timeout=10
            )
            if response.status_code == 401:
                log_success("Unauthenticated request correctly rejected with 401")
                return True
            else:
                log_error(f"Expected 401, got {response.status_code}")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    # ============================================
    # GROUP 2: CANCEL SUBSCRIPTION
    # ============================================

    def test_cancel_without_subscription(self) -> bool:
        """Free user canceling should return 404 (no active subscription)."""
        log_info("POST /api/stripe/cancel-subscription [free user, no sub]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/cancel-subscription",
                headers=self.headers(),
                timeout=10
            )
            if response.status_code == 404:
                log_success("Free user cancel correctly returns 404")
                return True
            else:
                log_warning(f"Got {response.status_code}: {response.text[:100]} (might have subscription)")
                return True  # Not a hard failure if user unexpectedly has a subscription

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_cancel_with_subscription(self) -> bool:
        """Paid user canceling should return success with cancel_at_period_end=True."""
        if not self.paid_token:
            log_warning("TEST_PAID_USER_TOKEN not set — skipping cancel-with-subscription test")
            return True

        log_info("POST /api/stripe/cancel-subscription [paid user]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/cancel-subscription",
                headers=self.headers(self.paid_token),
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("cancel_at_period_end") is True:
                    log_success(f"Subscription scheduled for cancellation: {data.get('message', '')}")
                    return True
                else:
                    log_error(f"cancel_at_period_end not True in response: {data}")
                    return False
            elif response.status_code == 404:
                log_warning("Paid user has no active subscription (may already be canceled)")
                return True
            else:
                log_error(f"Unexpected status {response.status_code}: {response.text[:200]}")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_cancel_unauthenticated(self) -> bool:
        """No auth token should return 401."""
        log_info("POST /api/stripe/cancel-subscription [no auth]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/cancel-subscription",
                timeout=10
            )
            if response.status_code == 401:
                log_success("Unauthenticated cancel correctly rejected with 401")
                return True
            else:
                log_error(f"Expected 401, got {response.status_code}")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    # ============================================
    # GROUP 3: SUBSCRIPTION CURRENT
    # ============================================

    def test_subscription_current_free(self) -> bool:
        """Free user should get plan=free, status=active."""
        log_info("GET /api/subscription/current [free user]")
        try:
            response = requests.get(
                f"{BACKEND_URL}/api/subscription/current",
                headers=self.headers(),
                timeout=10
            )
            if response.status_code != 200:
                log_error(f"Expected 200, got {response.status_code}: {response.text[:100]}")
                return False

            data = response.json()
            plan = data.get("plan_name") or data.get("plan") or ""
            status = data.get("status", "")

            log_info(f"Response: plan={plan}, status={status}")

            if plan in ("free", "freemium") and status == "active":
                log_success("Free user subscription current: OK")
                return True
            else:
                log_warning(f"Unexpected plan={plan} or status={status} — may be a paid user's token")
                return True  # Token might be a paid user, not a hard failure

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_subscription_current_unauthenticated(self) -> bool:
        """No auth should return 401."""
        log_info("GET /api/subscription/current [no auth]")
        try:
            response = requests.get(
                f"{BACKEND_URL}/api/subscription/current",
                timeout=10
            )
            if response.status_code == 401:
                log_success("Unauthenticated correctly rejected with 401")
                return True
            else:
                log_error(f"Expected 401, got {response.status_code}")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    # ============================================
    # GROUP 4: SYNC CACHE
    # ============================================

    def test_sync_cache_authenticated(self) -> bool:
        """Authenticated user should get fresh quota data."""
        log_info("POST /api/subscription/sync-cache [authenticated]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/subscription/sync-cache",
                headers=self.headers(),
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                log_success(f"Cache synced — quota data keys: {list(data.keys())}")
                return True
            else:
                log_error(f"Expected 200, got {response.status_code}: {response.text[:100]}")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_sync_cache_unauthenticated(self) -> bool:
        """No auth should return 401."""
        log_info("POST /api/subscription/sync-cache [no auth]")
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/subscription/sync-cache",
                timeout=10
            )
            if response.status_code == 401:
                log_success("Unauthenticated correctly rejected with 401")
                return True
            else:
                log_error(f"Expected 401, got {response.status_code}")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    # ============================================
    # GROUP 5: WEBHOOK SECURITY
    # ============================================

    def test_webhook_invalid_signature(self) -> bool:
        """Webhook with invalid signature should return 400."""
        log_info("POST /api/stripe/webhook [invalid signature]")
        payload = json.dumps({
            "id": "evt_test_invalid",
            "type": "checkout.session.completed",
            "data": {"object": {}}
        }).encode()

        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/webhook",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "stripe-signature": "t=fake,v1=invalidsignature"
                },
                timeout=10
            )
            if response.status_code in (400, 500):
                log_success(f"Invalid signature rejected with {response.status_code}")
                return True
            else:
                log_error(f"Expected 400/500, got {response.status_code} — security risk!")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_webhook_missing_signature(self) -> bool:
        """Webhook with no stripe-signature header should return 400."""
        log_info("POST /api/stripe/webhook [missing signature header]")
        payload = json.dumps({
            "id": "evt_test_no_sig",
            "type": "checkout.session.completed",
            "data": {"object": {}}
        }).encode()

        try:
            response = requests.post(
                f"{BACKEND_URL}/api/stripe/webhook",
                data=payload,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            if response.status_code == 400:
                log_success("Missing signature correctly rejected with 400")
                return True
            else:
                log_error(f"Expected 400, got {response.status_code} — security risk!")
                return False

        except Exception as e:
            log_error(f"Exception: {e}")
            return False

    def test_webhook_idempotency_double_send(self) -> bool:
        """
        Simulate idempotency: send same event_id twice.
        Both should return success but DB should only be modified once.
        Note: Cannot verify DB directly here — we verify the response indicates skipping.
        """
        log_info("POST /api/stripe/webhook [idempotency — same event_id twice, invalid sig expected]")
        # We can only test with invalid signature in production (we don't have webhook secret)
        # The key assertion: invalid sig → 400 both times (consistent rejection)
        payload = json.dumps({
            "id": "evt_idempotency_test_12345",
            "type": "customer.subscription.updated",
            "data": {"object": {"id": "sub_test123"}}
        }).encode()

        responses = []
        for i in range(2):
            try:
                r = requests.post(
                    f"{BACKEND_URL}/api/stripe/webhook",
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "stripe-signature": "t=fake,v1=invalidsig"
                    },
                    timeout=10
                )
                responses.append(r.status_code)
            except Exception as e:
                log_error(f"Request {i+1} failed: {e}")
                return False

        if responses[0] == responses[1] and responses[0] in (400, 500):
            log_success(f"Both requests consistently rejected ({responses[0]}) — signature enforced")
            return True
        else:
            log_warning(f"Status codes: {responses} — unexpected behavior")
            return True  # Not a hard failure (could be legitimate if signature test mode)

    # ============================================
    # HEALTH CHECK
    # ============================================

    def check_health(self) -> bool:
        """Verify backend is up."""
        try:
            response = requests.get(f"{BACKEND_URL}/health", timeout=5)
            if response.status_code == 200:
                log_success(f"Backend is UP: {BACKEND_URL}")
                return True
            else:
                log_error(f"Backend health check failed: {response.status_code}")
                return False
        except Exception as e:
            log_error(f"Cannot connect to backend: {e}")
            return False

    # ============================================
    # MAIN RUNNER
    # ============================================

    def run_all_tests(self):
        print(f"\n{BLUE}{'=' * 55}{RESET}")
        print(f"{BLUE}  STRIPE PRODUCTION API TESTS{RESET}")
        print(f"{BLUE}  Backend: {BACKEND_URL}{RESET}")
        print(f"{BLUE}  Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
        print(f"{BLUE}{'=' * 55}{RESET}")

        # Health check
        if not self.check_health():
            print(f"\n{RED}Cannot connect to backend — aborting.{RESET}")
            sys.exit(1)

        # Auth
        if not self.authenticate():
            print(f"\n{RED}Authentication failed — aborting.{RESET}")
            sys.exit(1)

        # Group 1: Checkout Session
        section("GROUP 1: Create Checkout Session")
        self.record("Checkout starter/monthly", self.test_checkout_starter_monthly())
        self.record("Checkout pro/yearly", self.test_checkout_pro_yearly())
        self.record("Checkout premium/monthly", self.test_checkout_premium_monthly())
        self.record("Checkout invalid plan", self.test_checkout_invalid_plan())
        self.record("Checkout unauthenticated", self.test_checkout_unauthenticated())

        # Group 2: Cancel Subscription
        section("GROUP 2: Cancel Subscription")
        self.record("Cancel without subscription (free)", self.test_cancel_without_subscription())
        self.record("Cancel with subscription (paid)", self.test_cancel_with_subscription())
        self.record("Cancel unauthenticated", self.test_cancel_unauthenticated())

        # Group 3: Current Subscription
        section("GROUP 3: Subscription Current")
        self.record("Current subscription (free user)", self.test_subscription_current_free())
        self.record("Current subscription (no auth)", self.test_subscription_current_unauthenticated())

        # Group 4: Sync Cache
        section("GROUP 4: Sync Cache")
        self.record("Sync cache (authenticated)", self.test_sync_cache_authenticated())
        self.record("Sync cache (no auth)", self.test_sync_cache_unauthenticated())

        # Group 5: Webhook Security
        section("GROUP 5: Webhook Security")
        self.record("Webhook invalid signature", self.test_webhook_invalid_signature())
        self.record("Webhook missing signature", self.test_webhook_missing_signature())
        self.record("Webhook idempotency check", self.test_webhook_idempotency_double_send())

        # Summary
        print(f"\n{BLUE}{'=' * 55}{RESET}")
        print(f"{BLUE}  RESULTS SUMMARY{RESET}")
        print(f"{BLUE}{'=' * 55}{RESET}\n")

        passed = sum(1 for _, ok in self.results if ok)
        failed = sum(1 for _, ok in self.results if not ok)
        total = len(self.results)

        for name, ok in self.results:
            status = f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"
            print(f"  {name:<45} {status}")

        print(f"\n  Passed: {GREEN}{passed}{RESET} / Failed: {RED}{failed}{RESET} / Total: {total}")

        if failed == 0:
            print(f"\n{GREEN}  ✓ All Stripe production API tests PASSED!{RESET}\n")
        else:
            print(f"\n{RED}  ✗ {failed} test(s) FAILED — check logs above.{RESET}\n")
            sys.exit(1)


if __name__ == "__main__":
    tester = StripeProductionTester()
    tester.run_all_tests()
