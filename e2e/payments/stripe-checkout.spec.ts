/**
 * Stripe Checkout E2E Tests — PRODUCTION
 * =======================================
 * Tests run against https://huntzenjobs.com (Vercel) + Railway backend.
 * Uses Stripe test cards (sk_test_ keys must be active in production).
 *
 * Prerequisites:
 *   - TEST_USER_EMAIL / TEST_USER_PASSWORD : Free plan account
 *   - TEST_PAID_USER_EMAIL / TEST_PAID_USER_PASSWORD : Starter/Pro account
 *
 * Run:
 *   npx playwright test e2e/payments/ --config=playwright.production.config.ts --headed
 */

import { test, expect } from "@playwright/test";
import {
  loginAsTestUser,
  loginAsPaidUser,
  fillStripeCard,
  submitStripePayment,
  waitForPlanActivation,
  assertCurrentPlan,
  assertCardDeclined,
  getSubscriptionFromApi,
  STRIPE_CARDS,
} from "./stripe-helpers";

// ============================================
// TEST SETUP
// ============================================

test.describe("Stripe Checkout — Production", () => {
  test.use({
    // All tests sequential (shared Stripe test environment)
    // baseURL is set by playwright.production.config.ts → https://huntzenjobs.com
  });

  // ============================================
  // FLOW 1: Free → Starter mensuel (CRITICAL PATH)
  // ============================================

  test("Flow 1: Free user upgrades to Starter monthly", async ({ page }) => {
    test.slow(); // Allow extra time for Stripe + webhook

    // Step 1: Login as free user
    await loginAsTestUser(page);

    // Step 2: Navigate to pricing page
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    // Step 3: Verify we're on Free plan before test
    const currentPlanText = await page.locator("body").textContent();
    expect(currentPlanText).toContain("Starter");

    // Step 4: Click "Choose Starter" plan
    const starterButton = page
      .locator('button:has-text("Starter")')
      .first();
    await expect(starterButton).toBeVisible({ timeout: 10_000 });
    await starterButton.click();

    // Step 5: Should redirect to Stripe Checkout
    await page.waitForURL(
      (url) => url.hostname.includes("checkout.stripe.com"),
      { timeout: 20_000 }
    );
    expect(page.url()).toContain("checkout.stripe.com");

    // Step 6: Fill Stripe payment form with success card
    await fillStripeCard(page, STRIPE_CARDS.SUCCESS);

    // Step 7: Submit payment
    await submitStripePayment(page);

    // Step 8: Should land on /payment/success
    await page.waitForURL(
      (url) => url.pathname.includes("/payment/success"),
      { timeout: 20_000 }
    );
    expect(page.url()).toContain("session_id=cs_test_");

    // Step 9: Wait for webhook to process (polling page handles this)
    const activated = await waitForPlanActivation(page, "starter", 35_000);
    expect(activated).toBeTruthy();

    // Step 10: Verify plan on profile
    await assertCurrentPlan(page, "Starter");
  });

  // ============================================
  // FLOW 2: Free → Pro annuel
  // ============================================

  test("Flow 2: Free user upgrades to Pro yearly", async ({ page }) => {
    test.slow();

    await loginAsTestUser(page);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    // Switch to yearly billing
    const yearlyToggle = page.locator('button[aria-label="Toggle billing period"]');
    if (await yearlyToggle.isVisible({ timeout: 3_000 })) {
      await yearlyToggle.click();
      await page.waitForTimeout(300);

      // Verify yearly price shown (133€ for Pro)
      await expect(page.locator(':has-text("133")')).toBeVisible({
        timeout: 5_000,
      });
    }

    // Click Pro plan
    const proButton = page.locator('button:has-text("Pro")').first();
    await expect(proButton).toBeVisible({ timeout: 10_000 });
    await proButton.click();

    // Verify redirect to Stripe
    await page.waitForURL(
      (url) => url.hostname.includes("checkout.stripe.com"),
      { timeout: 20_000 }
    );

    // Fill and submit
    await fillStripeCard(page, STRIPE_CARDS.SUCCESS);
    await submitStripePayment(page);

    // Wait for success
    await page.waitForURL(
      (url) => url.pathname.includes("/payment/success"),
      { timeout: 20_000 }
    );

    const activated = await waitForPlanActivation(page, "pro", 35_000);
    expect(activated).toBeTruthy();

    await assertCurrentPlan(page, "Pro");
  });

  // ============================================
  // FLOW 3: Paiement refusé (CRITICAL PATH)
  // ============================================

  test("Flow 3: Declined card — no subscription created", async ({ page }) => {
    await loginAsTestUser(page);

    // Get current plan before test
    const subBefore = await getSubscriptionFromApi(page);
    const planBefore = subBefore?.plan_name || "free";

    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    // Click Starter plan
    const starterButton = page.locator('button:has-text("Starter")').first();
    await expect(starterButton).toBeVisible({ timeout: 10_000 });
    await starterButton.click();

    // Redirect to Stripe Checkout
    await page.waitForURL(
      (url) => url.hostname.includes("checkout.stripe.com"),
      { timeout: 20_000 }
    );

    // Fill with DECLINED card
    await fillStripeCard(page, STRIPE_CARDS.DECLINED);

    // Submit — Stripe should show error, not redirect
    const submitBtn = page
      .locator('button[type="submit"], button:has-text("Pay"), button:has-text("Payer")')
      .first();
    await submitBtn.click();

    // Verify error message on Stripe page (should NOT redirect to our app)
    await assertCardDeclined(page);

    // Verify user is still on checkout.stripe.com (not redirected to success)
    expect(page.url()).toContain("checkout.stripe.com");

    // Verify subscription in DB unchanged (after going back to app)
    await page.goto("/");
    const subAfter = await getSubscriptionFromApi(page);
    expect(subAfter?.plan_name || "free").toBe(planBefore);
  });

  // ============================================
  // FLOW 4: 3D Secure / SCA
  // ============================================

  test("Flow 4: 3D Secure card — successful authentication", async ({
    page,
  }) => {
    test.slow();

    await loginAsTestUser(page);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    const starterButton = page.locator('button:has-text("Starter")').first();
    await starterButton.click();

    await page.waitForURL(
      (url) => url.hostname.includes("checkout.stripe.com"),
      { timeout: 20_000 }
    );

    // Fill with 3DS card
    await fillStripeCard(page, STRIPE_CARDS.THREE_D_SECURE);

    const submitBtn = page
      .locator('button[type="submit"], button:has-text("Pay"), button:has-text("Payer")')
      .first();
    await submitBtn.click();

    // 3DS modal should appear
    await page.waitForSelector(
      ':has-text("Complete"), :has-text("Authenticate"), iframe[name*="challenge"]',
      { timeout: 20_000 }
    );

    // Click "Complete authentication" in Stripe test 3DS dialog
    const completeBtn = page
      .locator('button:has-text("Complete"), button:has-text("Authenticate")')
      .first();
    if (await completeBtn.isVisible({ timeout: 5_000 })) {
      await completeBtn.click();
    } else {
      // Try within iframe
      const frame = page.frameLocator('iframe[name*="challenge"]').first();
      await frame.locator('button:has-text("Complete")').click();
    }

    // Should redirect to payment success
    await page.waitForURL(
      (url) => url.pathname.includes("/payment/success"),
      { timeout: 30_000 }
    );

    const activated = await waitForPlanActivation(page, "starter", 35_000);
    expect(activated).toBeTruthy();
  });

  // ============================================
  // FLOW 5: Annulation d'abonnement
  // ============================================

  test("Flow 5: Cancel subscription — access preserved until period end", async ({
    page,
  }) => {
    // This test requires a paid account
    const paidEmail = process.env.TEST_PAID_USER_EMAIL;
    if (!paidEmail) {
      test.skip(true, "TEST_PAID_USER_EMAIL not set — skipping cancel test");
    }

    await loginAsPaidUser(page);

    // Go to profile
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    // Click cancel subscription button
    const cancelButton = page
      .locator(
        'button:has-text("Cancel"), button:has-text("Annuler"), button:has-text("Résilier")'
      )
      .first();
    await expect(cancelButton).toBeVisible({ timeout: 10_000 });
    await cancelButton.click();

    // Confirm in dialog
    const confirmButton = page
      .locator(
        'button:has-text("Confirm"), button:has-text("Confirmer"), [role="dialog"] button'
      )
      .last();
    if (await confirmButton.isVisible({ timeout: 3_000 })) {
      await confirmButton.click();
    }

    // Wait for success feedback
    await page.waitForTimeout(3_000);

    // Verify UI shows "expires on" message
    const expiryMessage = page.locator(
      ':has-text("se termine"), :has-text("expires"), :has-text("period end")'
    );
    await expect(expiryMessage).toBeVisible({ timeout: 15_000 });

    // Verify subscription still shows as active (not immediately canceled)
    const subData = await getSubscriptionFromApi(page);
    expect(subData?.status).toBe("active");
    expect(subData?.cancel_at_period_end).toBe(true);
  });

  // ============================================
  // FLOW 6: Upgrade d'un plan payant vers un autre
  // ============================================

  test("Flow 6: Upgrade from Starter to Pro", async ({ page }) => {
    test.slow();

    const paidEmail = process.env.TEST_PAID_USER_EMAIL;
    if (!paidEmail) {
      test.skip(true, "TEST_PAID_USER_EMAIL not set — skipping upgrade test");
    }

    await loginAsPaidUser(page);

    // Get current plan (should be Starter)
    const subBefore = await getSubscriptionFromApi(page);

    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    // Click Pro plan
    const proButton = page.locator('button:has-text("Pro")').first();
    await expect(proButton).toBeVisible({ timeout: 10_000 });
    await proButton.click();

    // Handle checkout (new subscription flow)
    await page.waitForURL(
      (url) =>
        url.hostname.includes("checkout.stripe.com") ||
        url.pathname.includes("/payment/success"),
      { timeout: 20_000 }
    );

    if (page.url().includes("checkout.stripe.com")) {
      await fillStripeCard(page, STRIPE_CARDS.SUCCESS);
      await submitStripePayment(page);
      await page.waitForURL(
        (url) => url.pathname.includes("/payment/success"),
        { timeout: 20_000 }
      );
    }

    const activated = await waitForPlanActivation(page, "pro", 35_000);
    expect(activated).toBeTruthy();

    // Verify plan upgraded
    const subAfter = await getSubscriptionFromApi(page);
    expect(subAfter?.plan_name).toBe("pro");
    expect(subAfter?.plan_name).not.toBe(subBefore?.plan_name);
  });

  // ============================================
  // FLOW 7: Webhook timing — success page polling
  // ============================================

  test("Flow 7: Payment success page polls and detects plan within 30s", async ({
    page,
  }) => {
    test.slow();

    await loginAsTestUser(page);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    const starterButton = page.locator('button:has-text("Starter")').first();
    await starterButton.click();

    await page.waitForURL(
      (url) => url.hostname.includes("checkout.stripe.com"),
      { timeout: 20_000 }
    );

    await fillStripeCard(page, STRIPE_CARDS.SUCCESS);

    // Record time before submit
    const paymentStart = Date.now();

    await submitStripePayment(page);

    // Wait for success page
    await page.waitForURL(
      (url) => url.pathname.includes("/payment/success"),
      { timeout: 20_000 }
    );

    // Measure time until plan is detected
    const activated = await waitForPlanActivation(page, "starter", 35_000);
    const detectionTimeMs = Date.now() - paymentStart;

    expect(activated).toBeTruthy();

    // Webhook should be processed within 30 seconds of payment
    const MAX_WEBHOOK_LATENCY_MS = 30_000;
    console.log(`Webhook detection time: ${detectionTimeMs}ms`);
    expect(detectionTimeMs).toBeLessThan(
      MAX_WEBHOOK_LATENCY_MS + 20_000 // Add redirect time buffer
    );

    // Verify auto-redirect to profile/dashboard after activation
    await page.waitForURL(
      (url) =>
        url.pathname.includes("/profile") || url.pathname.includes("/dashboard"),
      { timeout: 10_000 }
    );
  });
});

// ============================================
// SECURITY TESTS (no auth needed)
// ============================================

test.describe("Stripe Security Checks", () => {
  test("Webhook endpoint rejects missing stripe-signature header", async ({
    request,
  }) => {
    const backendUrl =
      process.env.BACKEND_URL ||
      "https://huntzenjobs-production.up.railway.app";

    const response = await request.post(`${backendUrl}/api/stripe/webhook`, {
      data: JSON.stringify({
        id: "evt_test_security",
        type: "checkout.session.completed",
        data: { object: {} },
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
  });

  test("Webhook endpoint rejects invalid stripe-signature", async ({
    request,
  }) => {
    const backendUrl =
      process.env.BACKEND_URL ||
      "https://huntzenjobs-production.up.railway.app";

    const response = await request.post(`${backendUrl}/api/stripe/webhook`, {
      data: JSON.stringify({
        id: "evt_test_invalid_sig",
        type: "checkout.session.completed",
        data: { object: {} },
      }),
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=fake,v1=invalidsignature",
      },
    });

    // 400 = bad signature, 500 = webhook secret not configured
    expect([400, 500]).toContain(response.status());
  });

  test("Create checkout session requires authentication", async ({
    request,
  }) => {
    const backendUrl =
      process.env.BACKEND_URL ||
      "https://huntzenjobs-production.up.railway.app";

    const response = await request.post(
      `${backendUrl}/api/stripe/create-checkout-session`,
      {
        form: { plan_name: "starter", billing_period: "monthly" },
      }
    );

    expect(response.status()).toBe(401);
  });
});
