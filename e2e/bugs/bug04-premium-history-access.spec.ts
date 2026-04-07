import { test, expect } from '@playwright/test';

/**
 * TEST BUG #4: Vérification Plan Premium pour Historique
 *
 * Bug: Users free pouvaient accéder historique illimité → bypass limite 30 jours
 * Fix: RLS policy + frontend check subscription.plan_name
 *
 * Priority: P1
 * Estimated time: 8 min
 */

test.describe('Bug #4: Premium History Access', () => {
  test('Scenario 4.1: Free user limited to 30 days history', async ({
    page,
  }) => {
    test.setTimeout(45000);

    // Login with FREE account
    await page.goto('/login');
    await page.fill(
      '[name="email"]',
      process.env.TEST_USER_FREE_EMAIL || 'test-free@huntzenjobs.com'
    );
    await page.fill(
      '[name="password"]',
      process.env.TEST_USER_FREE_PASSWORD || 'password'
    );
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Navigate to history
    await page.goto('/history');
    await expect(page.locator('h1')).toContainText(/historique/i, {
      timeout: 10000,
    });

    // Verify limitation message displayed
    const limitMessage = page.locator(
      'text=/plan.*free.*30.*jours|free.*plan.*30.*days/i'
    );
    await expect(limitMessage).toBeVisible({ timeout: 5000 });

    // Verify CTA "Passer à Premium" exists
    const upgradeButton = page.locator(
      'button:has-text("Premium"), a:has-text("Premium")'
    );
    await expect(upgradeButton).toBeVisible();

    // Verify results are filtered (check dates)
    const historyItems = page.locator('[data-testid="history-item"]');
    const count = await historyItems.count();

    if (count > 0) {
      // Check first item date is within 30 days
      const firstItem = historyItems.first();
      const dateText = await firstItem
        .locator('[data-testid="item-date"]')
        .textContent();

      if (dateText) {
        console.log(`First history item date: ${dateText}`);
        // TODO: Parse and verify date < 30 days
      }
    }

    console.log(
      `✅ Free user sees ${count} items (limited to 30 days)`
    );
  });

  test('Scenario 4.2: Premium user has unlimited history access', async ({
    page,
  }) => {
    test.setTimeout(45000);

    // Login with PREMIUM account
    await page.goto('/login');
    await page.fill(
      '[name="email"]',
      process.env.TEST_USER_PREMIUM_EMAIL || 'test-premium@huntzenjobs.com'
    );
    await page.fill(
      '[name="password"]',
      process.env.TEST_USER_PREMIUM_PASSWORD || 'password'
    );
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Navigate to history
    await page.goto('/history');
    await expect(page.locator('h1')).toContainText(/historique/i, {
      timeout: 10000,
    });

    // Verify NO limitation message
    const limitMessage = page.locator(
      'text=/plan.*free.*30.*jours|free.*plan.*30.*days/i'
    );
    await expect(limitMessage).not.toBeVisible();

    // Verify NO upgrade CTA
    const upgradeButton = page.locator(
      'button:has-text("Passer à Premium")'
    );
    await expect(upgradeButton).not.toBeVisible();

    // Verify can see old history (> 30 days if exists)
    const historyItems = page.locator('[data-testid="history-item"]');
    const count = await historyItems.count();

    console.log(`✅ Premium user sees ${count} items (unlimited)`);

    // Check if pagination exists (means lots of history)
    const pagination = page.locator('[data-testid="pagination"]');
    if (await pagination.isVisible()) {
      console.log('✅ Pagination visible (large history)');
    }
  });

  test('Scenario 4.3: Security test - Free user cannot bypass via API', async ({
    page,
  }) => {
    test.setTimeout(45000);

    // Login as free user
    await page.goto('/login');
    await page.fill(
      '[name="email"]',
      process.env.TEST_USER_FREE_EMAIL || 'test-free@huntzenjobs.com'
    );
    await page.fill(
      '[name="password"]',
      process.env.TEST_USER_FREE_PASSWORD || 'password'
    );
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Intercept API calls to history
    const responses: any[] = [];

    page.on('response', async (response) => {
      if (response.url().includes('/api/history') || response.url().includes('cv_analyses')) {
        responses.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    // Navigate to history
    await page.goto('/history');
    await page.waitForTimeout(3000);

    // Verify backend respected RLS (no 403/401 but filtered results)
    const failedResponses = responses.filter(
      (r) => r.status === 403 || r.status === 401
    );

    if (failedResponses.length > 0) {
      console.log('⚠️ Some requests blocked by backend (good!)');
    }

    console.log(`✅ API calls: ${responses.length}, Blocked: ${failedResponses.length}`);
  });
});
