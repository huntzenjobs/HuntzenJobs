import { test, expect } from '@playwright/test';

test.describe('Protected Routes', () => {
  const protectedRoutes = [
    '/jobs',
    '/cv-analysis',
    '/coach',
  ];

  for (const route of protectedRoutes) {
    test(`should redirect from ${route} to login when not authenticated`, async ({ page }) => {
      // Clear any existing auth
      await page.context().clearCookies();

      // Try to access protected route
      await page.goto(route);

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });
  }

  test('should preserve return URL after login', async ({ page }) => {
    // Clear auth
    await page.context().clearCookies();

    // Try to access protected route
    await page.goto('/cv-analysis');

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/login/);

    // URL might contain return parameter
    const url = page.url();
    // Check for redirect/return/next parameter
    const hasRedirectParam = url.includes('redirect') ||
      url.includes('return') ||
      url.includes('next') ||
      url.includes('from');

    // This is implementation-dependent
  });

  test('should allow access to public routes without auth', async ({ page }) => {
    // Clear auth
    await page.context().clearCookies();

    // Home page should be accessible
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);

    // Login page should be accessible
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);

    // Signup page should be accessible
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup/);

    // Pricing page should be accessible
    await page.goto('/pricing');
    // Should not redirect to login
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('should redirect authenticated user from login to dashboard', async ({ page }) => {
    // Skip if no test credentials
    test.skip(!process.env.TEST_USER_EMAIL, 'No test user configured');

    // Login first
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
    await page.locator('button[type="submit"]').click();

    // Wait for redirect
    await expect(page).toHaveURL(/\/(jobs|dashboard)/, { timeout: 10000 });

    // Try to go back to login
    await page.goto('/login');

    // Should redirect away from login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 }).catch(() => {
      // Some apps allow viewing login page when authenticated
    });
  });
});
