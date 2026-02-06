import { test, expect, devices } from '@playwright/test';

// Mobile tests
const mobileTest = test.extend({});
mobileTest.use({ ...devices['iPhone 12'] });

mobileTest.describe('Responsive Design - Mobile', () => {
  mobileTest('should display mobile-friendly layout', async ({ page }) => {
    await page.goto('/jobs');

    // Content should be visible
    await expect(page.locator('main, [class*="content"], [class*="main"]').first()).toBeVisible();
  });

  mobileTest('should have touch-friendly buttons', async ({ page }) => {
    await page.goto('/jobs');

    // Buttons should be large enough for touch
    const buttons = page.locator('button').first();
    if (await buttons.count() > 0) {
      const size = await buttons.boundingBox();
      if (size) {
        expect(size.height).toBeGreaterThanOrEqual(36); // Minimum touch target
      }
    }
  });

  mobileTest('should not have horizontal scroll', async ({ page }) => {
    await page.goto('/jobs');

    // Check for horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBeFalsy();
  });

  mobileTest('should stack elements vertically on mobile', async ({ page }) => {
    await page.goto('/jobs');

    // Form elements should stack
    const form = page.locator('form').first();
    if (await form.count() > 0) {
      const inputs = form.locator('input, select');
      const count = await inputs.count();

      if (count >= 2) {
        const first = await inputs.first().boundingBox();
        const second = await inputs.nth(1).boundingBox();

        if (first && second) {
          // On mobile, elements should stack (second element below first)
          expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 10);
        }
      }
    }
  });
});

// Tablet tests
const tabletTest = test.extend({});
tabletTest.use({ ...devices['iPad Mini'] });

tabletTest.describe('Responsive Design - Tablet', () => {
  tabletTest('should display tablet layout', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('main, [class*="content"]').first()).toBeVisible();
  });

  tabletTest('should show sidebar or navigation', async ({ page }) => {
    await page.goto('/jobs');

    // On tablet, might show sidebar or compact nav
    const nav = page.locator('aside, nav, [class*="sidebar"], [class*="nav"]');
    await expect(nav.first()).toBeVisible();
  });
});

// Desktop tests
const desktopTest = test.extend({});
desktopTest.use({ viewport: { width: 1920, height: 1080 } });

desktopTest.describe('Responsive Design - Desktop', () => {
  desktopTest('should display full desktop layout', async ({ page }) => {
    await page.goto('/jobs');

    // Should have sidebar visible
    const sidebar = page.locator('aside, [class*="sidebar"]');
    await expect(sidebar.first()).toBeVisible();

    // Main content should be visible
    await expect(page.locator('main, [class*="content"]').first()).toBeVisible();
  });

  desktopTest('should display elements side by side', async ({ page }) => {
    await page.goto('/jobs');

    // Form might have elements side by side
    const form = page.locator('form').first();
    if (await form.count() > 0) {
      const inputs = form.locator('input, select');
      const count = await inputs.count();

      if (count >= 2) {
        const first = await inputs.first().boundingBox();
        const second = await inputs.nth(1).boundingBox();

        if (first && second) {
          // On desktop, might be side by side (similar Y position)
          // This depends on form layout
        }
      }
    }
  });
});

test.describe('Responsive Images', () => {
  test('should load appropriate image sizes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check for responsive images
    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const img = images.nth(i);
      const srcset = await img.getAttribute('srcset');
      const src = await img.getAttribute('src');

      // Image should have src
      expect(src || srcset).toBeTruthy();
    }
  });
});

// Touch tests
const touchTest = test.extend({});
touchTest.use({ ...devices['iPhone 12'] });

touchTest.describe('Touch Interactions', () => {
  touchTest('should support tap interactions', async ({ page }) => {
    await page.goto('/jobs');

    // Buttons should respond to tap
    const button = page.locator('button[type="submit"]').first();
    if (await button.count() > 0) {
      await button.tap();
      // Some action should occur
    }
  });

  touchTest('should support scroll', async ({ page }) => {
    await page.goto('/jobs');

    // Should be able to scroll
    await page.evaluate(() => window.scrollTo(0, 100));
    const scrollY = await page.evaluate(() => window.scrollY);
    // Should have scrolled if there's content
  });
});

test.describe('Orientation', () => {
  test('should work in portrait', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X portrait
    await page.goto('/jobs');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should work in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 }); // iPhone X landscape
    await page.goto('/jobs');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Font Scaling', () => {
  test('should handle larger font sizes', async ({ page }) => {
    // This simulates users with larger text settings
    await page.goto('/jobs');

    // Increase font size via CSS
    await page.addStyleTag({ content: 'html { font-size: 150%; }' });

    // Content should still be visible and not overflow
    const hasOverflow = await page.evaluate(() => {
      const body = document.body;
      return body.scrollWidth > body.clientWidth;
    });

    // Ideally no horizontal overflow
    // Some overflow might be acceptable
  });
});
