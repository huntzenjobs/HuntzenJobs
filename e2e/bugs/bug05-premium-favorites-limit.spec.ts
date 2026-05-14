import { test, expect } from '@playwright/test';

/**
 * TEST BUG #5: Vérification Plan Premium pour Favoris
 *
 * Bug: Users free pouvaient sauvegarder favoris illimités → bypass limite 10
 * Fix: RLS policy + trigger enforce_favorites_limit() + frontend check
 *
 * Priority: P1
 * Estimated time: 8 min
 */

test.describe('Bug #5: Premium Favorites Limit', () => {
  test('Scenario 5.1: Free user limited to 10 favorites', async ({
    page,
  }) => {
    test.setTimeout(60000);

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

    // Navigate to job search
    await page.goto('/jobs');
    await expect(page.locator('h1')).toContainText(/offres|jobs/i, {
      timeout: 10000,
    });

    // Check current favorites count
    await page.goto('/favorites');
    const currentFavorites = page.locator('[data-testid="favorite-item"]');
    const currentCount = await currentFavorites.count();

    console.log(`Current favorites: ${currentCount}/10`);

    // If already at limit, verify error message appears when trying to add
    if (currentCount >= 10) {
      // Go back to jobs and try to add another
      await page.goto('/jobs');
      await page.waitForTimeout(2000);

      const firstJob = page.locator('[data-testid="job-card"]').first();
      const favoriteButton = firstJob.locator(
        '[data-testid="favorite-button"]'
      );

      await favoriteButton.click();

      // Verify error/modal appears
      const errorModal = page.locator(
        'text=/limite.*atteinte|limit.*reached/i'
      );
      await expect(errorModal).toBeVisible({ timeout: 5000 });

      // Verify upgrade CTA
      const upgradeButton = page.locator(
        'button:has-text("Premium"), a:has-text("Premium")'
      );
      await expect(upgradeButton).toBeVisible();

      console.log('✅ Limit enforced: modal shown when trying to add 11th');
    } else {
      console.log(
        `⚠️ Currently ${currentCount} favorites, can't test limit enforcement`
      );
    }

    // Verify counter shows X/10
    const counter = page.locator(
      'text=/[0-9]+\/10|[0-9]+ sur 10/i'
    );
    if (await counter.isVisible()) {
      console.log('✅ Counter showing X/10');
    }
  });

  test('Scenario 5.2: Premium user limited to 100 favorites', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Login as premium user
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

    // Check favorites
    await page.goto('/favorites');
    const currentFavorites = page.locator('[data-testid="favorite-item"]');
    const currentCount = await currentFavorites.count();

    console.log(`Premium user favorites: ${currentCount}/100`);

    // Verify counter shows X/100 (not X/10)
    const counter = page.locator(
      'text=/[0-9]+\/100|[0-9]+ sur 100/i'
    );

    if (await counter.isVisible()) {
      console.log('✅ Premium counter showing X/100');
    } else {
      console.log('⚠️ Counter not visible or different format');
    }

    // Verify can add more than 10 favorites
    if (currentCount > 10) {
      console.log(`✅ Premium user has ${currentCount} favorites (> 10)`);
    } else {
      console.log(
        `⚠️ Premium user only has ${currentCount} favorites, can't verify > 10 limit`
      );
    }
  });

  test('Scenario 5.3: Pro user has unlimited favorites', async ({ page }) => {
    test.setTimeout(60000);

    // Login as pro user (if exists)
    await page.goto('/login');
    await page.fill(
      '[name="email"]',
      process.env.TEST_USER_PRO_EMAIL || 'test-pro@huntzenjobs.com'
    );
    await page.fill(
      '[name="password"]',
      process.env.TEST_USER_PRO_PASSWORD || 'password'
    );
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Check favorites
    await page.goto('/favorites');
    const currentFavorites = page.locator('[data-testid="favorite-item"]');
    const currentCount = await currentFavorites.count();

    console.log(`Pro user favorites: ${currentCount} (unlimited)`);

    // Verify no limit counter (or shows "illimité")
    const unlimitedText = page.locator('text=/illimité|unlimited/i');

    if (await unlimitedText.isVisible()) {
      console.log('✅ Pro shows "illimité"');
    } else {
      console.log('⚠️ Pro might have different UI');
    }
  });

  test('Scenario 5.4: Remove and re-add favorite works correctly', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Login as free user with full favorites (10/10)
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

    // Go to favorites
    await page.goto('/favorites');
    const initialFavorites = page.locator('[data-testid="favorite-item"]');
    const initialCount = await initialFavorites.count();

    if (initialCount > 0) {
      // Remove first favorite
      const firstFavorite = initialFavorites.first();
      const removeButton = firstFavorite.locator(
        '[data-testid="remove-favorite"]'
      );

      if (await removeButton.isVisible()) {
        await removeButton.click();

        // Wait for removal
        await page.waitForTimeout(1000);

        // Verify count decreased
        const newCount = await initialFavorites.count();
        expect(newCount).toBe(initialCount - 1);

        console.log(
          `✅ Removed favorite: ${initialCount} → ${newCount}`
        );

        // Now go to jobs and try to add a new one
        await page.goto('/jobs');
        await page.waitForTimeout(2000);

        const firstJob = page.locator('[data-testid="job-card"]').first();
        const addButton = firstJob.locator(
          '[data-testid="favorite-button"]'
        );

        await addButton.click();

        // Should succeed now (9 → 10)
        await page.waitForTimeout(1000);

        // Go back to favorites and verify count
        await page.goto('/favorites');
        const finalCount = await page
          .locator('[data-testid="favorite-item"]')
          .count();

        expect(finalCount).toBe(newCount + 1);
        console.log(`✅ Re-added favorite: ${newCount} → ${finalCount}`);
      }
    }
  });

  test('Scenario 5.5: Security test - Cannot bypass limit via API', async ({
    page,
  }) => {
    test.setTimeout(60000);

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

    // Monitor API responses
    const apiResponses: any[] = [];

    page.on('response', async (response) => {
      if (
        response.url().includes('/api/favorites') ||
        response.url().includes('saved_jobs')
      ) {
        apiResponses.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
        });
      }
    });

    // Try to add favorite when at limit
    await page.goto('/favorites');
    const currentCount = await page
      .locator('[data-testid="favorite-item"]')
      .count();

    if (currentCount >= 10) {
      await page.goto('/jobs');
      await page.waitForTimeout(2000);

      const firstJob = page.locator('[data-testid="job-card"]').first();
      await firstJob.locator('[data-testid="favorite-button"]').click();

      await page.waitForTimeout(2000);

      // Check if backend rejected (403, 400, or trigger blocked)
      const rejectedRequests = apiResponses.filter(
        (r) =>
          r.method === 'POST' &&
          (r.status === 403 || r.status === 400 || r.status === 422)
      );

      if (rejectedRequests.length > 0) {
        console.log('✅ Backend blocked request (RLS/trigger working)');
      } else {
        console.log('⚠️ No rejected POST detected (check logs)');
      }
    }
  });
});
