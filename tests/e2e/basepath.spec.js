import { test, expect } from '@playwright/test';

// basePath matrix leg (playwright.basepath.config.js): the whole export is
// served under /preview and every internal link must stay under the prefix.

test('landing, static pages and navigation work under the base path', async ({ page }) => {
  await page.goto('/preview/');
  await expect(page.locator('.hero')).toBeVisible();

  await page.locator('#top-menu .menu-links a[href$="/about/"]').click();
  await expect(page).toHaveURL(/\/preview\/about\/?$/);
  await expect(page.locator('h1')).toContainText('About');
});

test('search navigates to a report under the base path', async ({ page }) => {
  await page.goto('/preview/');
  await page.waitForLoadState('networkidle');
  const search = page.locator('.hero-search input');
  await search.click();
  await search.pressSequentially('refactor', { delay: 40 }); // let hydration bind listeners
  const option = page.locator('.hero-search .search-results li', { hasText: 'refactorfirst/refactorfirst' });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/preview\/refactorfirst\/refactorfirst/);
});

// Full report rendering under the base path: the bundled mustache template
// and the report JSON both resolve relative to /preview, not the host root.
const SAMPLE_REPORT = {
  project: {
    name: 'refactorfirst', version: '1.0.0',
    repoUrl: 'https://github.com/refactorfirst/refactorfirst',
    scanTimestamp: '9/9/26, 8:06 PM', hasAnyDisharmony: false
  },
  classMap: { graphId: 'classGraph', classCount: 0, relationshipCount: 0, dotThreshold: 4000, dotThresholdExceeded: false, dot: '', hasEdges: false },
  packageMap: { graphId: 'packageGraph', classCount: 0, relationshipCount: 0, dotThreshold: 4000, dotThresholdExceeded: false, dot: '', hasEdges: false },
  classRelationshipsToRemove: { cycleCount: 0, relationshipsToRemoveCount: 0, hasRelationships: false, relationships: [] },
  packageRelationshipsToRemove: { cycleCount: 0, relationshipsToRemoveCount: 0, hasRelationships: false, relationships: [] },
  hasDisharmonies: false,
  disharmonies: [],
  classCycles: { hasCycles: false, summary: [], largestCycle: { hasCycleMap: false } }
};

test('report renders fully under the base path', async ({ page }) => {
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('.refactorfirst/refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_REPORT) });
    } else {
      route.fulfill({ status: 404 });
    }
  });

  const reportResponse = await page.goto('/preview/refactorfirst/refactorfirst');
  expect(reportResponse.status()).toBe(200);
  await expect(page.locator('h1').first()).toContainText('RefactorFirst Report for refactorfirst');
  // data-resolved-branch is set once rendering succeeded
  await expect(page.locator('[data-resolved-branch="main"]')).toBeAttached();
});

test('404 page is served under the base path', async ({ page }) => {
  const response = await page.goto('/preview/totally/unknown/path');
  expect(response.status()).toBe(404);
  await expect(page.locator('.error-page')).toBeVisible();
});
