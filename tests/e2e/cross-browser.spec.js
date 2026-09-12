import { test, expect } from '@playwright/test';

// Cross-browser smoke tests (run against chromium, firefox and webkit
// per playwright.config.js projects).

test('core pages render consistently across browsers', async ({ page }) => {
  for (const path of ['/', '/about', '/faq', '/examples', '/api', '/documentation']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#top-menu')).toBeVisible();
    await expect(page.locator('#app')).not.toBeEmpty();
  }
});

test('keyboard search works across browsers', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const search = page.locator('.hero-search input');
  await search.fill('refactor');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/refactorfirst\/refactorfirst/);
});

test('legal pages are reachable and render', async ({ page }) => {
  await page.goto('/privacy-policy');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('Privacy');
  await page.goto('/terms-of-service');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('Terms');
});
