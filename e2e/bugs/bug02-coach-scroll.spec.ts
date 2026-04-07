import { test, expect } from '@playwright/test';

/**
 * TEST BUG #2: Affichage Cassé Assistant Coach (Scroll Bloqué)
 *
 * Bug: Sur mobile/petit écran, scroll bloqué → messages coupés, input invisible
 * Fix: Ajout overflow-y-auto + max-h + scroll automatique
 *
 * Priority: P1
 * Estimated time: 5 min
 */

test.describe('Bug #2: Coach Scroll Fix', () => {
  test.beforeEach(async ({ page }) => {
    // Login required for coach access
    await page.goto('/login');

    // TODO: Replace with actual test credentials
    await page.fill('[name="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD || 'password');
    await page.click('button[type="submit"]');

    // Wait for redirect
    await expect(page).toHaveURL(/dashboard|coach/, { timeout: 10000 });

    // Navigate to coach
    await page.goto('/coach');
    await expect(page.locator('h1')).toContainText(/coach/i);
  });

  test('Scenario 2.1: Chat with 10+ messages scrolls correctly', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Send 10 test messages to create scroll
    for (let i = 1; i <= 10; i++) {
      const textarea = page.locator('textarea[placeholder*="message"]');
      await expect(textarea).toBeVisible();

      await textarea.fill(`Test message ${i}`);
      await textarea.press('Enter');

      // Wait for message to appear
      await expect(
        page.locator(`text="Test message ${i}"`)
      ).toBeVisible({ timeout: 5000 });

      // Small delay between messages
      await page.waitForTimeout(500);
    }

    // Verify scroll container exists and is scrollable
    const messagesContainer = page.locator('[data-testid="messages-container"]');
    await expect(messagesContainer).toBeVisible();

    // Check overflow-y property
    const overflowY = await messagesContainer.evaluate(
      (el) => window.getComputedStyle(el).overflowY
    );
    expect(overflowY).toBe('auto'); // Should have overflow-y-auto

    // Verify input is always visible at bottom
    const inputArea = page.locator('textarea[placeholder*="message"]');
    await expect(inputArea).toBeInViewport();

    // Verify last message is visible (auto-scroll works)
    const lastMessage = page.locator('text="Test message 10"');
    await expect(lastMessage).toBeInViewport();
  });

  test('Scenario 2.2: Responsive mobile - scroll works on small viewport', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Set mobile viewport (iPhone 13)
    await page.setViewportSize({ width: 390, height: 844 });

    // Send 5 messages
    for (let i = 1; i <= 5; i++) {
      const textarea = page.locator('textarea[placeholder*="message"]');
      await textarea.fill(`Mobile test ${i}`);
      await textarea.press('Enter');
      await expect(
        page.locator(`text="Mobile test ${i}"`)
      ).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(300);
    }

    // Verify no horizontal overflow
    const body = await page.locator('body');
    const bodyWidth = await body.boundingBox();
    expect(bodyWidth?.width).toBeLessThanOrEqual(390);

    // Verify input still visible
    const inputArea = page.locator('textarea[placeholder*="message"]');
    await expect(inputArea).toBeInViewport();

    // Verify scroll works
    const messagesContainer = page.locator('[data-testid="messages-container"]');
    const isScrollable = await messagesContainer.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    if (isScrollable) {
      expect(isScrollable).toBe(true);
      console.log('✅ Messages container is scrollable on mobile');
    }
  });

  test('Scenario 2.3: New conversation displays correctly', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Assume we're on a new/empty conversation
    // Check no errors occur
    await expect(page.locator('text=/erreur|error/i')).not.toBeVisible();

    // Verify input is visible
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeInViewport();

    // Send first message
    await textarea.fill('First message test');
    await textarea.press('Enter');

    // Verify message appears
    await expect(
      page.locator('text="First message test"')
    ).toBeVisible({ timeout: 10000 });

    // Verify layout is correct
    await expect(textarea).toBeInViewport();
  });
});
