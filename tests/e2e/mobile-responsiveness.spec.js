import { test, expect } from '@playwright/test';

test.describe('mobile viewports', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test('hamburger menu opens and navigates on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const toggle = page.locator('#menu-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const links = page.locator('#menu-links');
    await expect(links).toHaveClass(/open/);
    await page.locator('#menu-links a[href="/about"]').click();
    await expect(page).toHaveURL(/\/about$/);
  });

  test('repository grid collapses to a single column on mobile', async ({ page }) => {
    await page.goto('/refactorfirst');
    await page.waitForLoadState('networkidle');
    const grid = page.locator('.repo-grid');
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(1);
  });

  test('landing page is usable on a phone-sized screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.hero')).toBeVisible();
    const search = page.locator('.hero-search input');
    await search.fill('refactorfirst');
    await expect(page.locator('.search-results li').first()).toBeVisible();
  });
});
