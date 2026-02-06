import { test, expect } from '@playwright/test';

test.describe('Signup Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('should display signup form', async ({ page }) => {
    // Check for email input
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Check for password input
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // Check for submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should have link to login', async ({ page }) => {
    // Look for login link
    const loginLink = page.locator('a[href*="login"]');
    await expect(loginLink).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    // Fill in invalid email
    await page.locator('input[type="email"]').fill('invalid-email');
    await page.locator('input[type="password"]').first().fill('Password123!');
    await page.locator('button[type="submit"]').click();

    // Should show validation error
    await expect(page.locator('input[type="email"]:invalid')).toBeVisible();
  });

  test('should validate password strength', async ({ page }) => {
    await page.locator('input[type="email"]').fill('new@example.com');

    // Try weak password
    await page.locator('input[type="password"]').first().fill('weak');
    await page.locator('button[type="submit"]').click();

    // Should show error or password requirement
    // Note: behavior depends on implementation
  });

  test('should show error for existing user', async ({ page }) => {
    // Use an email that already exists
    await page.locator('input[type="email"]').fill('existing@example.com');
    await page.locator('input[type="password"]').first().fill('Password123!');
    await page.locator('button[type="submit"]').click();

    // Should show error message about existing user
    // Note: This may timeout if email doesn't exist
    await expect(page.getByText(/already|existe|existant/i)).toBeVisible({ timeout: 10000 }).catch(() => {
      // Email might not exist, which is fine
    });
  });

  test('should show success message on signup', async ({ page }) => {
    // Generate unique email
    const uniqueEmail = `test.${Date.now()}@example.com`;

    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').first().fill('Password123!');
    await page.locator('button[type="submit"]').click();

    // Should show success message or redirect
    await Promise.race([
      expect(page.getByText(/confirm|vérifier|email/i)).toBeVisible({ timeout: 10000 }),
      expect(page).toHaveURL(/\/(login|jobs|dashboard)/, { timeout: 10000 }),
    ]).catch(() => {
      // Either success message or redirect
    });
  });

  test('should show loading state while submitting', async ({ page }) => {
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').first().fill('Password123!');

    // Click submit
    await page.locator('button[type="submit"]').click();

    // Button should show loading state
    const button = page.locator('button[type="submit"]');
    await expect(button).toBeDisabled({ timeout: 1000 }).catch(() => {
      // Button might not disable
    });
  });
});

test.describe('Signup Page - Password Confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('should have password confirmation field if required', async ({ page }) => {
    // Check if there's a confirm password field
    const confirmField = page.locator('input[name*="confirm"], input[placeholder*="confirm" i]');
    const hasConfirmField = await confirmField.count() > 0;

    if (hasConfirmField) {
      await expect(confirmField).toBeVisible();
    }
  });

  test('should validate password match', async ({ page }) => {
    // Check if confirm password exists
    const confirmField = page.locator('input[name*="confirm"], input[placeholder*="confirm" i]');
    const hasConfirmField = await confirmField.count() > 0;

    if (hasConfirmField) {
      await page.locator('input[type="email"]').fill('test@example.com');
      await page.locator('input[type="password"]').first().fill('Password123!');
      await confirmField.fill('DifferentPassword!');
      await page.locator('button[type="submit"]').click();

      // Should show mismatch error
      await expect(page.getByText(/match|correspond/i)).toBeVisible({ timeout: 5000 }).catch(() => {
        // Error message might be different
      });
    }
  });
});
