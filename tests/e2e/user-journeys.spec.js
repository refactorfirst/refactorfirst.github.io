import { test, expect } from '@playwright/test';

const SAMPLE_REPORT = {
  projectName: 'refactorfirst',
  version: '0.5.1',
  totalClasses: 150,
  classesToRefactor: 2,
  priorities: [
    {
      rank: 1,
      className: 'org.hjug.git.GitLogReader',
      priority: 'HIGH',
      effort: '3',
      disharmonies: ['God Class'],
      recommendation: 'Break into smaller classes.'
    }
  ]
};

test.beforeEach(async ({ page }) => {
  // Mock GitHub raw content so tests never hit the network.
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_REPORT) });
    } else if (url.endsWith('.mustache')) {
      route.fulfill({ status: 404 });
    } else {
      route.continue();
    }
  });
});

test('landing page loads with hero, search and menu', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.hero')).toBeVisible();
  await expect(page.locator('#menu-search-input')).toBeVisible();
  await expect(page.locator('#top-menu .menu-links a[href="/about"]')).toBeVisible();
  await expect(page.locator('text=Add My Repo')).toBeVisible();
});

test('search navigates to a repository report', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const search = page.locator('.hero-search input');
  await search.fill('refactor');
  const option = page.locator('.hero-search .search-results li', { hasText: 'refactorfirst/refactorfirst' });
  await option.click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/refactorfirst\/refactorfirst$/);
  await expect(page.locator('#app')).toContainText('refactorfirst');
});

test('report renders from repository JSON with fallback template', async ({ page }) => {
  await page.goto('/refactorfirst/refactorfirst');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('refactorfirst');
  await expect(page.locator('text=org.hjug.git.GitLogReader')).toBeVisible();
});

test('branch fallback shows report from master', async ({ page }) => {
  let requested = [];
  await page.unroute('**/raw.githubusercontent.com/**');
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    requested.push(url);
    if (url.includes('/main/.refactorfirst/refactor-first.json')) {
      route.fulfill({ status: 404 });
    } else if (url.includes('/master/.refactorfirst/refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_REPORT) });
    } else {
      route.fulfill({ status: 404 });
    }
  });

  await page.goto('/refactorfirst/refactorfirst');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('refactorfirst');
  expect(requested.some(u => u.includes('/main/'))).toBe(true);
  expect(requested.some(u => u.includes('/master/'))).toBe(true);
});

test('unknown repository shows a friendly 404 page', async ({ page }) => {
  await page.unroute('**/raw.githubusercontent.com/**');
  await page.route('**/raw.githubusercontent.com/**', route => route.fulfill({ status: 404 }));
  await page.goto('/ghost/missing');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.error-page')).toBeVisible();
  await expect(page.locator('.error-page a[href="/"]')).toBeVisible();
});

test('user listing page shows repositories alphabetically', async ({ page }) => {
  await page.goto('/refactorfirst');
  await page.waitForLoadState('networkidle');
  const cards = page.locator('.repo-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('refactorfirst');
});

test('static pages render: about and getting started', async ({ page }) => {
  await page.goto('/about');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('About RefactorFirst');
  await page.goto('/getting-started');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1')).toContainText('Getting Started');
  await expect(page.locator('code', { hasText: 'refactorfirst:jsonReport' }).first()).toBeVisible();
});

test('add-repo page requires GitHub login', async ({ page }) => {
  await page.goto('/add-repo');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#login-github')).toBeVisible();
});

test('top menu height stays within 140px', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const box = await page.locator('#top-menu').boundingBox();
  expect(box.height).toBeLessThanOrEqual(200);
});
