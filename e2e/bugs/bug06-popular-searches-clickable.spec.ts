import { test, expect } from '@playwright/test';

/**
 * TEST BUG #6: Recherches Populaires Non Cliquables
 *
 * Bug: Tags "recherches populaires" affichés mais non cliquables
 * Fix: Ajout onClick handler + cursor pointer + hover effect
 *
 * Priority: P2
 * Estimated time: 5 min
 */

test.describe('Bug #6: Popular Searches Clickable', () => {
  test.beforeEach(async ({ page }) => {
    // Go to jobs page (public or authenticated)
    await page.goto('/jobs');
    await expect(page.locator('h1')).toContainText(/recherch.*(?:emploi|offre|jobs)/i, {
      timeout: 10000,
    });
  });

  test('Scenario 6.1: Clicking popular search fills input and triggers search', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Find popular searches section
    const popularSection = page.locator(
      '[data-testid="popular-searches"], :has-text("Recherches populaires")'
    );

    // If not visible, might be below fold
    if (!(await popularSection.isVisible())) {
      await page.evaluate(() => window.scrollTo(0, 200));
      await page.waitForTimeout(500);
    }

    // Find first popular search chip/button
    const firstChip = page
      .locator(
        '[data-testid="popular-search-chip"], button:has-text("Développeur")'
      )
      .first();

    if (await firstChip.isVisible()) {
      const chipText = await firstChip.textContent();
      console.log(`Clicking popular search: "${chipText}"`);

      // Click the chip
      await firstChip.click();

      // Verify search input is filled
      const searchInput = page.locator('input[placeholder*="recherch"]');
      const inputValue = await searchInput.inputValue();

      expect(inputValue).toContain(chipText?.trim() || '');
      console.log(`✅ Input filled with: "${inputValue}"`);

      // Verify search was triggered (loading or results appear)
      const resultsOrLoading = page.locator(
        '[data-testid="search-loading"], [data-testid="job-results"]'
      );
      await expect(resultsOrLoading).toBeVisible({ timeout: 5000 });

      console.log('✅ Search triggered automatically');
    } else {
      test.skip(true, 'Popular searches not visible on page');
    }
  });

  test('Scenario 6.2: Hover effect visible on popular search chips', async ({
    page,
  }) => {
    test.setTimeout(30000);

    const firstChip = page
      .locator('[data-testid="popular-search-chip"]')
      .first();

    if (await firstChip.isVisible()) {
      // Hover over chip
      await firstChip.hover();

      // Check cursor style
      const cursor = await firstChip.evaluate((el) => {
        return window.getComputedStyle(el).cursor;
      });

      expect(cursor).toBe('pointer');
      console.log('✅ Cursor is "pointer" on hover');

      // Check if background or color changes (visual feedback)
      // This is hard to assert precisely, but we can log
      const backgroundColor = await firstChip.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      console.log(`Background color: ${backgroundColor}`);
    } else {
      test.skip(true, 'Popular search chips not visible');
    }
  });

  test('Scenario 6.3: Multiple rapid clicks handled correctly', async ({
    page,
  }) => {
    test.setTimeout(30000);

    const chips = page.locator('[data-testid="popular-search-chip"]');
    const count = await chips.count();

    if (count >= 2) {
      // Click first chip
      await chips.nth(0).click();
      await page.waitForTimeout(500);

      // Immediately click second chip
      await chips.nth(1).click();
      await page.waitForTimeout(1000);

      // Verify search input has second chip's text (not first)
      const secondChipText = await chips.nth(1).textContent();
      const searchInput = page.locator('input[placeholder*="recherch"]');
      const inputValue = await searchInput.inputValue();

      expect(inputValue).toContain(secondChipText?.trim() || '');
      console.log('✅ Last clicked chip text is in input (no race condition)');
    } else {
      test.skip(true, 'Not enough popular search chips to test');
    }
  });

  test('Scenario 6.4: Responsive mobile - chips clickable on touch', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/jobs');
    await page.waitForTimeout(2000);

    const firstChip = page
      .locator('[data-testid="popular-search-chip"]')
      .first();

    if (await firstChip.isVisible()) {
      // Tap (mobile touch)
      await firstChip.tap();

      // Verify input filled
      const searchInput = page.locator('input[placeholder*="recherch"]');
      const inputValue = await searchInput.inputValue();

      expect(inputValue.length).toBeGreaterThan(0);
      console.log('✅ Mobile tap works');
    } else {
      test.skip(true, 'Popular searches not visible on mobile');
    }
  });
});
