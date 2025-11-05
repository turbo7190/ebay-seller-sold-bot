const { test, expect } = require('@playwright/test');

test.describe('Browser Tests', () => {
  test('should load homepage and display welcome message', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load and check if JSON is displayed
    const content = await page.textContent('body');
    expect(content).toContain('Welcome to eBay Server');
  });

  test('should have valid JSON response', async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBe(200);
    
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });

  test('should navigate to different endpoints', async ({ page }) => {
    // Test health endpoint
    await page.goto('/health');
    const healthContent = await page.textContent('body');
    expect(healthContent).toContain('healthy');
    
    // Test hello endpoint
    await page.goto('/api/hello');
    const helloContent = await page.textContent('body');
    expect(helloContent).toContain('Hello from eBay Server API');
  });
});

