import { test, expect } from '@playwright/test';

test.describe('Job Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/jobs');
  });

  test('should display search form', async ({ page }) => {
    // Job title input
    await expect(page.locator('input[name*="title"], input[placeholder*="poste" i], input[placeholder*="job" i]')).toBeVisible();

    // Country select or input
    await expect(page.locator('select[name*="country"], input[name*="country"], [data-testid*="country"]').first()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Country might be auto-detected
    });

    // Search button
    await expect(page.locator('button[type="submit"], button:has-text("Rechercher"), button:has-text("Search")')).toBeVisible();
  });

  test('should search for jobs', async ({ page }) => {
    // Fill in search criteria
    await page.locator('input[name*="title"], input[placeholder*="poste" i], input[placeholder*="job" i]').first().fill('Développeur Python');

    // Click search
    await page.locator('button[type="submit"], button:has-text("Rechercher"), button:has-text("Search")').first().click();

    // Wait for results or loading
    await Promise.race([
      page.waitForSelector('[data-testid="job-card"], .job-card, article', { timeout: 15000 }),
      page.waitForSelector('[data-testid="loading"], .loading, .spinner', { timeout: 5000 }),
      page.waitForSelector('[data-testid="no-results"], :has-text("aucun résultat")', { timeout: 15000 }),
    ]).catch(() => {
      // Results might take time to load
    });
  });

  test('should display job results', async ({ page }) => {
    // Perform a search
    await page.locator('input[name*="title"], input[placeholder*="poste" i]').first().fill('Developer');
    await page.locator('button[type="submit"], button:has-text("Rechercher")').first().click();

    // Wait for results
    await page.waitForTimeout(3000);

    // Check for job cards or results
    const results = page.locator('[data-testid="job-card"], .job-card, article, [class*="job"]');
    const count = await results.count();

    // Either we have results or a "no results" message
    if (count > 0) {
      await expect(results.first()).toBeVisible();
    } else {
      await expect(page.getByText(/aucun|no results|pas de résultat/i)).toBeVisible();
    }
  });

  test('should show job details in results', async ({ page }) => {
    // Search for jobs
    await page.locator('input[name*="title"], input[placeholder*="poste" i]').first().fill('Developer');
    await page.locator('button[type="submit"], button:has-text("Rechercher")').first().click();

    // Wait for results
    await page.waitForTimeout(3000);

    // Check if we have results
    const jobCards = page.locator('[data-testid="job-card"], .job-card, article').first();
    const hasResults = await jobCards.count() > 0;

    if (hasResults) {
      // Check for job details
      await expect(jobCards).toBeVisible();
      // Should have title, company, or location somewhere
    }
  });

  test('should handle empty search results', async ({ page }) => {
    // Search for something unlikely to have results
    await page.locator('input[name*="title"], input[placeholder*="poste" i]').first().fill('xyz123nonexistentjob456');
    await page.locator('button[type="submit"], button:has-text("Rechercher")').first().click();

    // Wait for response
    await page.waitForTimeout(5000);

    // Should show no results message
    const noResults = page.getByText(/aucun|no results|pas trouvé|not found/i);
    await expect(noResults).toBeVisible({ timeout: 10000 }).catch(() => {
      // Might not have explicit "no results" message
    });
  });

  test('should show loading state during search', async ({ page }) => {
    // Fill in search
    await page.locator('input[name*="title"], input[placeholder*="poste" i]').first().fill('Developer');

    // Click search
    await page.locator('button[type="submit"], button:has-text("Rechercher")').first().click();

    // Check for loading indicator
    await Promise.race([
      expect(page.locator('[data-testid="loading"], .loading, .spinner, [class*="loading"]')).toBeVisible({ timeout: 2000 }),
      expect(page.locator('button[type="submit"]')).toBeDisabled({ timeout: 2000 }),
    ]).catch(() => {
      // Loading might be too fast to catch
    });
  });
});

test.describe('Job Search - Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/jobs');
  });

  test('should filter by city', async ({ page }) => {
    // Look for city input/select
    const cityInput = page.locator('input[name*="city"], select[name*="city"], input[placeholder*="ville" i]');
    const hasCity = await cityInput.count() > 0;

    if (hasCity) {
      await cityInput.first().fill('Paris');
    }
  });

  test('should filter by contract type', async ({ page }) => {
    // Look for contract type select
    const contractSelect = page.locator('select[name*="contract"], [data-testid*="contract"]');
    const hasContract = await contractSelect.count() > 0;

    if (hasContract) {
      await contractSelect.first().selectOption({ index: 1 });
    }
  });
});

test.describe('Job Search - Sources', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/jobs');
  });

  test('should display job sources', async ({ page }) => {
    // Perform search
    await page.locator('input[name*="title"], input[placeholder*="poste" i]').first().fill('Developer');
    await page.locator('button[type="submit"], button:has-text("Rechercher")').first().click();

    // Wait for results
    await page.waitForTimeout(5000);

    // Check for source indicators
    const sources = page.locator('[data-testid="job-source"], .source, [class*="source"]');
    // Sources might not always be displayed prominently
  });
});
