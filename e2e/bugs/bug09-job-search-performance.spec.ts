import { test, expect } from '@playwright/test';

/**
 * TEST BUG #9: Performance Recherche d'Emploi
 *
 * Bug: Recherche emploi lente (5-10 sec) → timeout, frustration
 * Fix: Indexation BDD + query optimization + debounce + cache
 *
 * Priority: P1
 * Estimated time: 10 min
 */

test.describe('Bug #9: Job Search Performance', () => {
  test.beforeEach(async ({ page }) => {
    // Login (if required for job search)
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard|jobs/, { timeout: 10000 });

    // Navigate to jobs page
    await page.goto('/jobs');
    await expect(page.locator('h1')).toContainText(/recherch.*offre|jobs/i);
  });

  test('Scenario 9.1: Simple search completes under 3 seconds', async ({
    page,
  }) => {
    test.setTimeout(30000);

    const searchInput = page.locator('input[placeholder*="recherch"]');
    await expect(searchInput).toBeVisible();

    // Start timing
    const startTime = Date.now();

    // Type search query
    await searchInput.fill('Développeur Python');

    // Wait for debounce + search to complete
    // Look for loading indicator to disappear
    const loadingIndicator = page.locator('[data-testid="search-loading"]');

    // Wait for loading to appear (debounce)
    try {
      await expect(loadingIndicator).toBeVisible({ timeout: 2000 });
    } catch {
      // Might be too fast, that's OK
    }

    // Wait for loading to disappear (search done)
    await expect(loadingIndicator).not.toBeVisible({ timeout: 5000 });

    // Wait for results to appear
    const resultsContainer = page.locator('[data-testid="job-results"]');
    await expect(resultsContainer).toBeVisible({ timeout: 5000 });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // seconds

    expect(duration).toBeLessThan(
      3,
      `Search took ${duration.toFixed(1)}s, should be < 3s`
    );

    console.log(`✅ Search completed in ${duration.toFixed(1)}s`);

    // Verify results displayed
    const jobCards = page.locator('[data-testid="job-card"]');
    const count = await jobCards.count();
    expect(count).toBeGreaterThan(0, 'Should display at least 1 job result');
  });

  test('Scenario 9.2: Complex search with filters under 4 seconds', async ({
    page,
  }) => {
    test.setTimeout(40000);

    // Fill search input
    const searchInput = page.locator('input[placeholder*="recherch"]');
    await searchInput.fill('Développeur');

    // Apply filters
    const locationFilter = page.locator('[data-testid="filter-location"]');
    if (await locationFilter.isVisible()) {
      await locationFilter.selectOption('Paris');
    }

    const contractFilter = page.locator('[data-testid="filter-contract"]');
    if (await contractFilter.isVisible()) {
      await contractFilter.selectOption('CDI');
    }

    const startTime = Date.now();

    // Click search/apply filters button
    const searchButton = page.locator('button:has-text("Rechercher")');
    if (await searchButton.isVisible()) {
      await searchButton.click();
    }

    // Wait for results
    await expect(page.locator('[data-testid="search-loading"]')).not.toBeVisible({
      timeout: 6000,
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    expect(duration).toBeLessThan(
      4,
      `Complex search took ${duration.toFixed(1)}s, should be < 4s`
    );

    console.log(`✅ Complex search completed in ${duration.toFixed(1)}s`);
  });

  test('Scenario 9.3: Empty search loads quickly under 2 seconds', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Clear any existing search
    const searchInput = page.locator('input[placeholder*="recherch"]');
    await searchInput.fill('');

    const startTime = Date.now();

    // Trigger search (might auto-trigger or need button click)
    const searchButton = page.locator('button:has-text("Rechercher")');
    if (await searchButton.isVisible()) {
      await searchButton.click();
    } else {
      // Might auto-trigger, just wait
      await page.waitForTimeout(500);
    }

    // Wait for results (paginated, first 20)
    await expect(page.locator('[data-testid="search-loading"]')).not.toBeVisible({
      timeout: 4000,
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    expect(duration).toBeLessThan(
      2,
      `Empty search took ${duration.toFixed(1)}s, should be < 2s`
    );

    console.log(`✅ Empty search completed in ${duration.toFixed(1)}s`);

    // Verify pagination exists (not loading all 10k jobs)
    const pagination = page.locator('[data-testid="pagination"]');
    const hasPagination = await pagination.isVisible();

    if (hasPagination) {
      console.log('✅ Pagination implemented');
    }
  });

  test('Scenario 9.4: Debounce prevents multiple requests', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Listen to network requests
    const requests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/jobs')) {
        requests.push(request.url());
      }
    });

    const searchInput = page.locator('input[placeholder*="recherch"]');

    // Type rapidly (simulate user typing "Dev")
    await searchInput.type('D', { delay: 50 });
    await searchInput.type('e', { delay: 50 });
    await searchInput.type('v', { delay: 50 });

    // Wait for debounce timeout (300ms typically)
    await page.waitForTimeout(500);

    // Verify only 1 final request was made (not 3)
    expect(requests.length).toBeLessThanOrEqual(
      1,
      `Debounce failed: ${requests.length} requests made (expected 1)`
    );

    console.log(`✅ Debounce working: ${requests.length} request(s)`);
  });

  test('Scenario 9.5: Backend API response time under 2 seconds', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Monitor API request timing
    let apiDuration = 0;

    page.on('response', async (response) => {
      if (response.url().includes('/api/jobs/search')) {
        const timing = response.timing();
        apiDuration = timing.responseEnd;
        console.log(`API response time: ${apiDuration.toFixed(0)}ms`);
      }
    });

    const searchInput = page.locator('input[placeholder*="recherch"]');
    await searchInput.fill('Développeur');

    // Wait for search to complete
    await expect(page.locator('[data-testid="search-loading"]')).not.toBeVisible({
      timeout: 5000,
    });

    // Check API duration
    if (apiDuration > 0) {
      expect(apiDuration).toBeLessThan(
        2000,
        `API took ${apiDuration}ms, should be < 2000ms`
      );
      console.log(`✅ API responded in ${apiDuration.toFixed(0)}ms`);
    }
  });

  test('Scenario 9.6: Pagination loads additional results quickly', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Perform initial search
    const searchInput = page.locator('input[placeholder*="recherch"]');
    await searchInput.fill('Développeur');

    await expect(page.locator('[data-testid="search-loading"]')).not.toBeVisible({
      timeout: 5000,
    });

    // Find pagination "Next" button
    const nextButton = page.locator(
      '[data-testid="pagination-next"], button:has-text("Suivant")'
    );

    if (await nextButton.isVisible()) {
      const startTime = Date.now();

      await nextButton.click();

      // Wait for page 2 to load
      await expect(page.locator('[data-testid="search-loading"]')).not.toBeVisible({
        timeout: 4000,
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      expect(duration).toBeLessThan(
        2,
        `Pagination took ${duration.toFixed(1)}s, should be < 2s`
      );

      console.log(`✅ Pagination loaded in ${duration.toFixed(1)}s`);
    } else {
      console.log('⚠️ Pagination not visible (might be single page results)');
    }
  });
});
