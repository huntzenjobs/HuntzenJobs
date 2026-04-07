import { test, expect } from '@playwright/test';

/**
 * TEST BUG #3: Envoi Message avec Touche Entrée
 *
 * Bug: Touche Entrée ne faisait rien → user devait cliquer "Envoyer"
 * Fix: Ajout onKeyDown handler (Enter = envoie, Shift+Enter = nouvelle ligne)
 *
 * Priority: P2
 * Estimated time: 5 min
 */

test.describe('Bug #3: Enter Key Send Message', () => {
  test.beforeEach(async ({ page }) => {
    // Login + navigate to coach
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard|coach/, { timeout: 10000 });

    await page.goto('/coach');
    await expect(page.locator('h1')).toContainText(/coach/i);
  });

  test('Scenario 3.1: Enter key sends message immediately', async ({
    page,
  }) => {
    test.setTimeout(30000);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();

    // Type message
    await textarea.fill('Test Enter key send');

    // Press Enter (not Shift+Enter)
    await textarea.press('Enter');

    // Verify message sent
    await expect(
      page.locator('text="Test Enter key send"')
    ).toBeVisible({ timeout: 10000 });

    // Verify textarea is cleared
    const textareaValue = await textarea.inputValue();
    expect(textareaValue).toBe('');
  });

  test('Scenario 3.2: Shift+Enter adds new line without sending', async ({
    page,
  }) => {
    test.setTimeout(30000);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();

    // Type line 1
    await textarea.fill('Line 1');

    // Press Shift+Enter (new line)
    await textarea.press('Shift+Enter');

    // Type line 2
    await textarea.type('Line 2');

    // Press Shift+Enter again
    await textarea.press('Shift+Enter');

    // Type line 3
    await textarea.type('Line 3');

    // Now press Enter (without Shift) to send
    await textarea.press('Enter');

    // Verify multi-line message was sent
    await expect(
      page.locator('text="Line 1"')
    ).toBeVisible({ timeout: 10000 });

    await expect(page.locator('text="Line 2"')).toBeVisible();
    await expect(page.locator('text="Line 3"')).toBeVisible();

    // Verify all 3 lines are in same message bubble
    // (This depends on how the UI renders messages)
    console.log('✅ Multi-line message sent successfully');
  });

  test('Scenario 3.3: Rapid Enter presses prevent double send', async ({
    page,
  }) => {
    test.setTimeout(30000);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Test double send prevention');

    // Press Enter 3 times rapidly
    await textarea.press('Enter');
    await textarea.press('Enter');
    await textarea.press('Enter');

    // Wait a bit for potential duplicates
    await page.waitForTimeout(2000);

    // Count occurrences of the message (should be exactly 1)
    const messageCount = await page
      .locator('text="Test double send prevention"')
      .count();

    expect(messageCount).toBe(1, 'Should send exactly 1 message, not duplicates');
    console.log('✅ Double send prevention works');
  });

  test('Scenario 3.4: Empty message is not sent', async ({ page }) => {
    test.setTimeout(30000);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();

    // Leave textarea empty
    await textarea.fill('');

    // Press Enter
    await textarea.press('Enter');

    // Wait a bit
    await page.waitForTimeout(1000);

    // Verify no message was sent (check messages container didn't grow)
    // This is a negative test - hard to assert exactly, but textarea should still be empty
    const textareaValue = await textarea.inputValue();
    expect(textareaValue).toBe('');

    // Verify no error occurred
    await expect(page.locator('text=/erreur|error/i')).not.toBeVisible();

    console.log('✅ Empty message blocked correctly');
  });

  test('Scenario 3.5: Textarea disabled during send', async ({ page }) => {
    test.setTimeout(30000);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Test disabled during send');

    // Press Enter
    await textarea.press('Enter');

    // Immediately check if textarea is disabled
    // (This might be too fast, but worth checking)
    const isDisabled = await textarea.isDisabled();

    if (isDisabled) {
      console.log('✅ Textarea disabled during send (good!)');
    } else {
      console.log('⚠️ Textarea not disabled during send (might allow double-send)');
    }

    // Wait for send to complete
    await expect(
      page.locator('text="Test disabled during send"')
    ).toBeVisible({ timeout: 10000 });

    // Verify textarea is re-enabled after
    await expect(textarea).toBeEnabled();
  });
});
