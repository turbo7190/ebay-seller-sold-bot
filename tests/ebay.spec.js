const { test, expect } = require("@playwright/test");

test.describe("eBay.com Tests", () => {
  test("should open ebay.com and verify page loads", async ({ page }) => {
    await page.goto("https://www.ebay.com");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveTitle(/ebay/i);
  });

  test("should find search input on homepage", async ({ page }) => {
    await page.goto("https://www.ebay.com");

    const searchInput = page
      .locator('input[type="text"][placeholder*="Search"]')
      .first();
    await expect(searchInput).toBeVisible();
  });
});

