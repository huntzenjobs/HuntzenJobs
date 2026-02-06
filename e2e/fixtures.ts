import { test as base, expect, Page } from '@playwright/test';

/**
 * Custom fixtures for HuntZen E2E tests
 */

// User credentials for testing
export const TEST_USER = {
  email: 'test@huntzen.com',
  password: 'TestPassword123!',
};

// Extend base test with custom fixtures
export const test = base.extend<{
  authenticatedPage: Page;
  freemiumPage: Page;
}>({
  // Fixture for authenticated user
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login page
    await page.goto('/login');

    // Fill in credentials
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL(/\/(jobs|dashboard)/);

    await use(page);
  },

  // Fixture for freemium user (not logged in, uses client_id)
  freemiumPage: async ({ page, context }, use) => {
    // Set a consistent client_id cookie for freemium tracking
    await context.addCookies([
      {
        name: 'huntzen_client_id',
        value: 'e2e_test_client_' + Date.now(),
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/');

    await use(page);
  },
});

// Helper functions
export async function waitForApiResponse(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.waitForResponse((response) =>
    typeof urlPattern === 'string'
      ? response.url().includes(urlPattern)
      : urlPattern.test(response.url())
  );
}

export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: object,
  status = 200
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

export async function clearFreemiumUsage(page: Page, clientId: string): Promise<void> {
  // This would need a backend endpoint to clear usage for testing
  // For now, we use a unique client_id per test
}

export async function uploadFile(page: Page, selector: string, filePath: string): Promise<void> {
  const fileInput = page.locator(selector);
  await fileInput.setInputFiles(filePath);
}

export async function waitForToast(page: Page, text: string): Promise<void> {
  await expect(page.locator('[data-sonner-toast]')).toContainText(text, { timeout: 10000 });
}

// Re-export expect
export { expect };
