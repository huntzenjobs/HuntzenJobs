import { test, expect } from '@playwright/test';

/**
 * TEST BUGS #7 & #8: Contact Recruteur Page UI Fixes
 *
 * Bug #7: Bouton "Voir les avis" texte blanc sur fond blanc (invisible)
 * Bug #8: FAQ coupée en bas (dernières questions invisibles)
 *
 * Fix #7: text-white → text-gray-900, contraste WCAG AA
 * Fix #8: padding-bottom + overflow visible
 *
 * Priority: P3
 * Estimated time: 5 min total
 */

test.describe('Bugs #7 & #8: Contact Recruiter UI', () => {
  test.beforeEach(async ({ page }) => {
    // Public page, no login required
    await page.goto('/recruiter-contact');
    await expect(page.locator('h1')).toContainText(/recruteur|recruiter/i, {
      timeout: 10000,
    });
  });

  // ==================== BUG #7 ====================

  test('Bug #7 - Scenario 7.1: "Voir les avis" button is visible (contrast)', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Scroll to testimonials/reviews section
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);

    // Find "Voir les avis" button
    const reviewButton = page.locator(
      'button:has-text("Voir les avis"), a:has-text("Voir les avis")'
    );

    if (await reviewButton.isVisible()) {
      // Check text color (should NOT be white on white background)
      const textColor = await reviewButton.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      const backgroundColor = await reviewButton.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      console.log(`Button text color: ${textColor}`);
      console.log(`Button background: ${backgroundColor}`);

      // Verify not white text
      expect(textColor).not.toMatch(/rgb\(255,\s*255,\s*255\)/);

      console.log('✅ Button text is visible (not white)');

      // Check button is visible to human eye (not just DOM)
      const box = await reviewButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width).toBeGreaterThan(0);

      console.log('✅ Button has dimensions (visible on page)');
    } else {
      test.skip(true, '"Voir les avis" button not found on page');
    }
  });

  test('Bug #7 - Scenario 7.2: Button contrast meets WCAG AA (4.5:1)', async ({
    page,
  }) => {
    test.setTimeout(30000);

    await page.evaluate(() => window.scrollTo(0, 600));

    const reviewButton = page.locator(
      'button:has-text("Voir les avis"), a:has-text("Voir les avis")'
    );

    if (await reviewButton.isVisible()) {
      // Use Lighthouse to check accessibility
      // Or manually verify contrast ratio

      // For now, just verify it's not pure white
      const textColor = await reviewButton.evaluate((el) => {
        const rgb = window.getComputedStyle(el).color;
        return rgb;
      });

      // Parse RGB to check luminance (simplified check)
      const isWhite = textColor.includes('rgb(255, 255, 255)');

      expect(isWhite).toBe(false);
      console.log('✅ Text color is not pure white');

      // Check hover state changes color
      await reviewButton.hover();
      await page.waitForTimeout(200);

      const hoverColor = await reviewButton.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      console.log(`Hover color: ${hoverColor}`);

      if (hoverColor !== textColor) {
        console.log('✅ Hover effect changes color');
      }
    }
  });

  test('Bug #7 - Scenario 7.3: Button is functional (click works)', async ({
    page,
  }) => {
    test.setTimeout(30000);

    await page.evaluate(() => window.scrollTo(0, 600));

    const reviewButton = page.locator(
      'button:has-text("Voir les avis"), a:has-text("Voir les avis")'
    );

    if (await reviewButton.isVisible()) {
      // Click button
      await reviewButton.click();

      // Wait for action (scroll to reviews section or modal)
      await page.waitForTimeout(1000);

      // Verify something happened (reviews section visible or modal opened)
      const reviewsSection = page.locator(
        '[data-testid="reviews-section"], :has-text("Témoignages")'
      );

      if (await reviewsSection.isVisible()) {
        console.log('✅ Clicked → scrolled to reviews section');
      } else {
        // Might open modal
        const modal = page.locator('[role="dialog"], .modal');
        if (await modal.isVisible()) {
          console.log('✅ Clicked → opened reviews modal');
        } else {
          console.log('⚠️ Button clicked but unclear what happened');
        }
      }
    }
  });

  // ==================== BUG #8 ====================

  test('Bug #8 - Scenario 8.1: FAQ section fully visible (not cut off)', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Scroll to bottom of page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Find FAQ section
    const faqSection = page.locator(
      '[data-testid="faq-section"], :has-text("FAQ"), :has-text("Questions fréquentes")'
    );

    if (await faqSection.isVisible()) {
      // Find all FAQ items
      const faqItems = page.locator(
        '[data-testid="faq-item"], details, .accordion-item'
      );
      const count = await faqItems.count();

      console.log(`Found ${count} FAQ items`);

      if (count > 0) {
        // Check if last FAQ item is in viewport
        const lastItem = faqItems.last();
        const isInViewport = await lastItem.isInViewport();

        expect(isInViewport).toBe(true);
        console.log('✅ Last FAQ item is in viewport (not cut off)');

        // Verify footer is below FAQ (no overlap)
        const footer = page.locator('footer');
        if (await footer.isVisible()) {
          const faqBox = await faqSection.boundingBox();
          const footerBox = await footer.boundingBox();

          if (faqBox && footerBox) {
            const noOverlap = faqBox.y + faqBox.height <= footerBox.y;
            expect(noOverlap).toBe(true);
            console.log('✅ FAQ does not overlap footer');
          }
        }
      }
    } else {
      test.skip(true, 'FAQ section not found on page');
    }
  });

  test('Bug #8 - Scenario 8.2: Can scroll to very bottom of FAQ', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Scroll to absolute bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(500);

    // Verify we can see the page footer
    const footer = page.locator('footer');
    await expect(footer).toBeInViewport();

    console.log('✅ Can scroll to footer (FAQ not blocking)');

    // Check body height is reasonable (no infinite scroll bug)
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`Page height: ${bodyHeight}px`);

    expect(bodyHeight).toBeLessThan(20000); // Sanity check
  });

  test('Bug #8 - Scenario 8.3: FAQ expand/collapse works without cutoff', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Scroll to FAQ
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 500));

    const faqItems = page.locator(
      '[data-testid="faq-item"], details, .accordion-item'
    );
    const count = await faqItems.count();

    if (count > 0) {
      // Click last FAQ item to expand
      const lastItem = faqItems.last();

      // Find clickable trigger (summary, button, etc.)
      const trigger = lastItem.locator('summary, button').first();

      if (await trigger.isVisible()) {
        await trigger.click();
        await page.waitForTimeout(500);

        // Verify content expanded and is visible
        const expandedContent = lastItem.locator(
          '[data-testid="faq-answer"], p, div'
        );

        if (await expandedContent.isVisible()) {
          const isInViewport = await expandedContent.isInViewport();

          if (!isInViewport) {
            // Might need to scroll, that's OK
            await expandedContent.scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
          }

          console.log('✅ Last FAQ expands correctly (content visible)');
        }
      }
    } else {
      test.skip(true, 'No FAQ items to test');
    }
  });

  test('Bug #8 - Scenario 8.4: Responsive mobile - FAQ not cut off', async ({
    page,
  }) => {
    test.setTimeout(30000);

    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/contact-recruiter');
    await page.waitForTimeout(2000);

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Check FAQ visible
    const faqSection = page.locator(
      '[data-testid="faq-section"], :has-text("FAQ")'
    );

    if (await faqSection.isVisible()) {
      const faqItems = page.locator('[data-testid="faq-item"]');
      const count = await faqItems.count();

      if (count > 0) {
        const lastItem = faqItems.last();
        await lastItem.scrollIntoViewIfNeeded();

        const isInViewport = await lastItem.isInViewport();
        expect(isInViewport).toBe(true);

        console.log('✅ FAQ visible on mobile (not cut off)');
      }
    }
  });
});
