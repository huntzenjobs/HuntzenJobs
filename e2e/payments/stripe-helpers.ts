/**
 * Stripe E2E Test Helpers
 * =======================
 * Utilities for Playwright tests targeting production (huntzenjobs.com)
 * All tests use Stripe test cards (sk_test_ keys configured in production).
 */

import { Page, expect } from "@playwright/test";

// ============================================
// STRIPE TEST CARDS
// ============================================

export const STRIPE_CARDS = {
  /** Always succeeds — standard test card */
  SUCCESS: "4242424242424242",
  /** Always declined — insufficient funds */
  DECLINED: "4000000000009995",
  /** Requires 3D Secure authentication */
  THREE_D_SECURE: "4000002500003155",
  /** 3DS — authentication succeeds */
  THREE_D_SECURE_SUCCESS: "4000000000003220",
} as const;

export const STRIPE_CARD_DEFAULTS = {
  expiry: "12/30",
  cvc: "123",
  zip: "12345",
} as const;

// ============================================
// AUTH HELPERS
// ============================================

/**
 * Login to huntzenjobs.com with test credentials.
 * Credentials must be set in environment:
 *   TEST_USER_EMAIL, TEST_USER_PASSWORD
 */
export async function loginAsTestUser(
  page: Page,
  email: string = process.env.TEST_USER_EMAIL || "",
  password: string = process.env.TEST_USER_PASSWORD || ""
): Promise<void> {
  if (!email || !password) {
    throw new Error(
      "TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in environment"
    );
  }

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Fill login form
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect after login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

/**
 * Login with a paid plan user.
 */
export async function loginAsPaidUser(page: Page): Promise<void> {
  const email = process.env.TEST_PAID_USER_EMAIL || "";
  const password = process.env.TEST_PAID_USER_PASSWORD || "";
  await loginAsTestUser(page, email, password);
}

// ============================================
// CHECKOUT HELPERS
// ============================================

/**
 * Click "Upgrade" to open the pricing modal or navigate to pricing page.
 * Works from any page that has the upgrade button.
 */
export async function openPricingModal(page: Page): Promise<void> {
  const upgradeButton = page.locator(
    'button:has-text("Upgrade"), a:has-text("Upgrade"), button:has-text("Passer"), a[href="/pricing"]'
  ).first();

  if (await upgradeButton.isVisible({ timeout: 3_000 })) {
    await upgradeButton.click();
  } else {
    await page.goto("/pricing");
  }

  // Wait for pricing content
  await page.waitForSelector('[data-testid="pricing-modal"], .pricing-modal, h2:has-text("Plan"), h1:has-text("Tarif")', {
    timeout: 10_000,
  });
}

/**
 * Select a plan from the pricing modal/page and click CTA.
 */
export async function selectPlan(
  page: Page,
  planName: "starter" | "pro" | "premium",
  billingPeriod: "monthly" | "yearly" = "monthly"
): Promise<void> {
  // Toggle yearly if needed
  if (billingPeriod === "yearly") {
    const toggle = page.locator('button[aria-label="Toggle billing period"]');
    if (await toggle.isVisible({ timeout: 3_000 })) {
      await toggle.click();
      await page.waitForTimeout(300); // Animation
    }
  }

  // Click the plan's CTA button
  const planButton = page
    .locator(`button:has-text("${capitalize(planName)}")`)
    .first();
  await planButton.click({ timeout: 10_000 });
}

/**
 * Fill the Stripe Checkout form with test card details.
 * Handles the Stripe-hosted checkout page (checkout.stripe.com).
 */
export async function fillStripeCard(
  page: Page,
  cardNumber: string = STRIPE_CARDS.SUCCESS,
  options: { expiry?: string; cvc?: string; zip?: string } = {}
): Promise<void> {
  const { expiry, cvc, zip } = { ...STRIPE_CARD_DEFAULTS, ...options };

  // Wait for Stripe Checkout to load
  await page.waitForLoadState("networkidle", { timeout: 30_000 });

  // Card number — Stripe uses an iframe or direct input
  const cardInput = page.locator(
    '[data-testid="card-number-input"], input[placeholder*="1234"], iframe[name*="card"]'
  ).first();

  if (await cardInput.isVisible({ timeout: 5_000 })) {
    // Direct input (newer Stripe Checkout)
    await cardInput.fill(cardNumber);
  } else {
    // Try iframe approach
    const stripeFrame = page.frameLocator('iframe[title*="card"]').first();
    await stripeFrame.locator('input[placeholder*="1234"]').fill(cardNumber);
  }

  // Expiry
  await page
    .locator('input[placeholder*="MM / YY"], input[placeholder*="MM/AA"], [data-testid="card-expiry"]')
    .first()
    .fill(expiry);

  // CVC
  await page
    .locator('input[placeholder*="CVC"], input[placeholder*="CVV"], [data-testid="card-cvc"]')
    .first()
    .fill(cvc);

  // ZIP (billing postal code)
  const zipInput = page.locator(
    'input[placeholder*="ZIP"], input[placeholder*="postal"], input[autocomplete="postal-code"]'
  ).first();
  if (await zipInput.isVisible({ timeout: 2_000 })) {
    await zipInput.fill(zip);
  }
}

/**
 * Submit the Stripe payment form and wait for redirect.
 */
export async function submitStripePayment(page: Page): Promise<void> {
  const submitBtn = page.locator(
    'button[type="submit"], button:has-text("Pay"), button:has-text("Payer"), button:has-text("Subscribe")'
  ).first();
  await submitBtn.click();

  // Wait for redirect back to our app (success or declined)
  await page.waitForURL(
    (url) =>
      url.hostname.includes("huntzenjobs.com") ||
      url.pathname.includes("/payment"),
    { timeout: 30_000 }
  );
}

// ============================================
// POST-PAYMENT HELPERS
// ============================================

/**
 * Wait for the payment success page to detect the new subscription.
 * The page polls /api/subscription/current until plan changes.
 * Timeout: 30 seconds (webhook can take up to 20s in test mode).
 */
export async function waitForPlanActivation(
  page: Page,
  expectedPlan: string,
  timeoutMs: number = 35_000
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Check if success page shows plan activated
    const successText = page.locator(
      ':has-text("activé"), :has-text("activ"), :has-text("activated"), :has-text("Starter"), :has-text("Pro"), :has-text("Premium")'
    );

    if (await successText.isVisible({ timeout: 2_000 }).catch(() => false)) {
      return true;
    }

    // Or if already redirected to profile
    if (page.url().includes("/profile") || page.url().includes("/dashboard")) {
      return true;
    }

    await page.waitForTimeout(1_000);
  }

  return false;
}

/**
 * Get current plan name from subscription-card on profile page.
 */
export async function getCurrentPlanFromProfile(page: Page): Promise<string> {
  await page.goto("/profile");
  await page.waitForLoadState("networkidle");

  // Look for plan name in subscription card
  const planBadge = page.locator(
    '[data-testid="plan-name"], .subscription-card .plan-name, :has-text("Starter"), :has-text("Pro"), :has-text("Premium"), :has-text("Free")'
  ).first();

  if (await planBadge.isVisible({ timeout: 5_000 })) {
    return (await planBadge.textContent()) || "unknown";
  }

  return "unknown";
}

/**
 * Call /api/subscription/current via fetch to verify plan in DB.
 * Uses page.evaluate to run in browser context with auth cookie/token.
 */
export async function getSubscriptionFromApi(page: Page): Promise<{
  plan_name?: string;
  status?: string;
  cancel_at_period_end?: boolean;
} | null> {
  return await page.evaluate(async () => {
    const backendUrl =
      (window as any).__ENV__?.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://huntzenjobs-production.up.railway.app";

    try {
      const res = await fetch(`${backendUrl}/api/subscription/current`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) return res.json();
    } catch {
      return null;
    }
    return null;
  });
}

// ============================================
// ASSERTION HELPERS
// ============================================

/**
 * Assert user is on plan X by checking subscription-card on profile page.
 */
export async function assertCurrentPlan(
  page: Page,
  expectedPlan: string
): Promise<void> {
  await page.goto("/profile");
  await page.waitForLoadState("networkidle");

  await expect(
    page.locator(`:has-text("${capitalize(expectedPlan)}")`)
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Assert that Stripe shows a declined error message.
 */
export async function assertCardDeclined(page: Page): Promise<void> {
  const errorMsg = page.locator(
    ':has-text("declined"), :has-text("refusée"), :has-text("insufficient"), :has-text("insuffisants"), [role="alert"]'
  ).first();
  await expect(errorMsg).toBeVisible({ timeout: 15_000 });
}

// ============================================
// UTILITIES
// ============================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
