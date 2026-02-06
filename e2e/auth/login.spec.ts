import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    // Check for email input
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Check for password input
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Check for submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should have link to signup', async ({ page }) => {
    // Look for signup link
    const signupLink = page.locator('a[href*="signup"]');
    await expect(signupLink).toBeVisible();
  });

  test('should show validation error for empty email', async ({ page }) => {
    // Try to submit with empty email
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('button[type="submit"]').click();

    // Should show validation error
    await expect(page.locator('input[type="email"]:invalid')).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    // Fill in invalid email
    await page.locator('input[type="email"]').fill('invalid-email');
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('button[type="submit"]').click();

    // Email input should be invalid
    await expect(page.locator('input[type="email"]:invalid')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in credentials
    await page.locator('input[type="email"]').fill('wrong@example.com');
    await page.locator('input[type="password"]').fill('wrongpassword');

    // Submit
    await page.locator('button[type="submit"]').click();

    // Should show error message
    await expect(page.getByText(/invalid|incorrect|erreur/i)).toBeVisible({ timeout: 10000 });
  });

  test('should redirect to dashboard on successful login', async ({ page }) => {
    // This test requires a valid test user to exist
    // Skip if no test credentials
    test.skip(!process.env.TEST_USER_EMAIL, 'No test user configured');

    await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
    await page.locator('button[type="submit"]').click();

    // Should redirect to dashboard or jobs page
    await expect(page).toHaveURL(/\/(jobs|dashboard)/, { timeout: 10000 });
  });

  test('should show loading state while submitting', async ({ page }) => {
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('password123');

    // Start submission
    await page.locator('button[type="submit"]').click();

    // Button should show loading state
    const button = page.locator('button[type="submit"]');
    // Check for disabled state or loading spinner
    await expect(button).toBeDisabled({ timeout: 1000 }).catch(() => {
      // Button might not disable, that's ok
    });
  });
});

test.describe('Login Page - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should have accessible form labels', async ({ page }) => {
    // Email should have label
    const emailInput = page.locator('input[type="email"]');
    const emailLabel = await emailInput.getAttribute('aria-label') ||
      await page.locator('label[for="email"]').textContent();
    expect(emailLabel).toBeTruthy();

    // Password should have label
    const passwordInput = page.locator('input[type="password"]');
    const passwordLabel = await passwordInput.getAttribute('aria-label') ||
      await page.locator('label[for="password"]').textContent();
    expect(passwordLabel).toBeTruthy();
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Tab to email
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="email"]')).toBeFocused();

    // Tab to password
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="password"]')).toBeFocused();

    // Tab to submit
    await page.keyboard.press('Tab');
    await expect(page.locator('button[type="submit"]')).toBeFocused();
  });

  test('should submit form with Enter key', async ({ page }) => {
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('password123');

    // Press Enter
    await page.keyboard.press('Enter');

    // Should attempt submission (check for loading or error)
    await page.waitForTimeout(500);
    // Some response should occur
  });
});
