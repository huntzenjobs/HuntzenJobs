import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  // Check if backend is running
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Wait for backend to be healthy
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        const response = await page.request.get(`${backendUrl}/health`);
        if (response.ok()) {
          console.log('✅ Backend is healthy');
          break;
        }
      } catch {
        // Backend not ready yet
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (attempts >= maxAttempts) {
      throw new Error('Backend did not become healthy in time');
    }

    // Check if frontend is running
    const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
    attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await page.request.get(frontendUrl);
        if (response.ok()) {
          console.log('✅ Frontend is healthy');
          break;
        }
      } catch {
        // Frontend not ready yet
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (attempts >= maxAttempts) {
      throw new Error('Frontend did not become healthy in time');
    }

    // Optionally create test user if not exists
    // This would require a backend endpoint or direct database access

    console.log('✅ Global setup complete');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
