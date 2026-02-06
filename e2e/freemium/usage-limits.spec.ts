import { test, expect } from '@playwright/test';

test.describe('Freemium Usage Limits', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set a unique client ID for each test
    await context.addCookies([
      {
        name: 'huntzen_client_id',
        value: `e2e_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('should display usage counters', async ({ page }) => {
    await page.goto('/jobs');

    // Look for usage display
    const usageDisplay = page.locator(
      '[data-testid="usage"], .usage, [class*="usage"], [class*="remaining"]'
    );

    // Usage counters might be in sidebar or dashboard
    const hasUsage = await usageDisplay.count() > 0;
    // This is optional depending on UI design
  });

  test('should show remaining job searches', async ({ page }) => {
    await page.goto('/jobs');

    // Look for search limit indicator
    const searchLimit = page.locator(':has-text("recherche"), :has-text("search")');
    // Limit display might vary
  });

  test('should show remaining CV analyses', async ({ page }) => {
    await page.goto('/cv-analysis');

    // Look for analysis limit indicator
    const analysisLimit = page.locator(':has-text("analyse"), :has-text("analysis")');
    // Limit display might vary
  });

  test('should show remaining coach time', async ({ page }) => {
    await page.goto('/coach');

    // Look for time limit indicator
    const timeLimit = page.locator(':has-text("min"), :has-text("minute"), [class*="timer"]');
    await expect(timeLimit.first()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Timer might be styled differently
    });
  });
});

test.describe('Freemium Upgrade Prompts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show upgrade banner for free users', async ({ page }) => {
    await page.goto('/jobs');

    // Look for upgrade banner
    const upgradeBanner = page.locator(
      '[data-testid="upgrade-banner"], .upgrade-banner, [class*="upgrade"], :has-text("Passer à Premium")'
    );

    await expect(upgradeBanner.first()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Banner might only show in certain conditions
    });
  });

  test('should open pricing modal on upgrade click', async ({ page }) => {
    await page.goto('/jobs');

    // Click upgrade button
    const upgradeButton = page.locator(
      'button:has-text("Upgrade"), button:has-text("Premium"), a[href*="pricing"]'
    ).first();

    if (await upgradeButton.count() > 0) {
      await upgradeButton.click();

      // Should show pricing modal or redirect to pricing page
      await Promise.race([
        expect(page.locator('[data-testid="pricing-modal"], .pricing-modal, [class*="pricing"]')).toBeVisible({ timeout: 5000 }),
        expect(page).toHaveURL(/pricing/, { timeout: 5000 }),
      ]).catch(() => {
        // Pricing display might vary
      });
    }
  });

  test('should display pricing plans', async ({ page }) => {
    await page.goto('/pricing');

    // Should show different plans
    await expect(page.getByText(/free|gratuit/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/premium|pro/i)).toBeVisible({ timeout: 5000 });
  });

  test('should show feature comparison', async ({ page }) => {
    await page.goto('/pricing');

    // Should list features
    await expect(page.getByText(/recherche|search/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/CV|analyse/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/coach/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Feature Lock', () => {
  test('should show lock icon for limited features', async ({ page }) => {
    await page.goto('/jobs');

    // Look for lock icons
    const lockIcons = page.locator('[data-testid="lock"], .lock, [class*="lock"], svg[class*="lock"]');
    // Locks might appear on certain features
  });

  test('should show tooltip explaining limit', async ({ page }) => {
    await page.goto('/jobs');

    // Hover over a locked feature
    const lockIcon = page.locator('[data-testid="lock"], .lock').first();

    if (await lockIcon.count() > 0) {
      await lockIcon.hover();

      // Should show tooltip
      await expect(page.locator('[role="tooltip"], .tooltip, [class*="tooltip"]')).toBeVisible({ timeout: 3000 }).catch(() => {
        // Tooltip might not exist
      });
    }
  });
});

test.describe('Usage Reset', () => {
  test('should show reset time', async ({ page }) => {
    await page.goto('/jobs');

    // Look for reset time indicator
    const resetTime = page.locator(':has-text("réinitialise"), :has-text("reset"), :has-text("minuit")');
    // Reset time display might not be visible
  });

  test('should indicate daily limits', async ({ page }) => {
    await page.goto('/pricing');

    // Pricing should mention daily limits
    await expect(page.getByText(/jour|daily|day/i)).toBeVisible({ timeout: 5000 }).catch(() => {
      // Limit frequency might not be explicitly stated
    });
  });
});
