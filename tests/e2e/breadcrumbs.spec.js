// Breadcrumb trail under the top menu: mirrors the /<user>/<repo>/<branch>
// hierarchy of the current report with links back up. The component contract
// lives in tests/integration/breadcrumbs.test.jsx; these tests pin the
// rendered, served-export behavior (hydrated client nav).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SAMPLE_REPORT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../fixtures/junit4-report.json'),
  'utf-8'
);

test.beforeEach(async ({ page }) => {
  // Mock GitHub raw content so tests never hit the network.
  await page.route('**/raw.githubusercontent.com/**', route => {
    if (route.request().url().endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: SAMPLE_REPORT });
    } else {
      route.continue();
    }
  });
});

/**
 * Locates breadcrumb list items within the navigation landmark.
 *
 * @param {import('@playwright/test').Locator} nav - Breadcrumb navigation locator.
 * @returns {import('@playwright/test').Locator} Locator for the ordered trail items.
 */
function trail(nav) {
  return nav.locator('ol li');
}

test('report page shows the /<user>/<repo>/<branch> trail with links back', async ({ page }) => {
  await page.goto('/refactorfirst/refactorfirst/master');
  await page.waitForLoadState('networkidle');
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(nav).toBeVisible();
  // Wait for the client-hydrated trail (SSR renders an empty Suspense slot).
  // The "/" separators are CSS ::before content — not part of textContent.
  await expect(trail(nav)).toHaveText(['Home', 'refactorfirst', 'refactorfirst', 'master']);
  const hrefs = await nav.locator('a').evaluateAll(links =>
    links.map(a => new URL(a.href).pathname)
  );
  // next.config sets trailingSlash: true, so next/link hrefs end with "/".
  expect(hrefs).toEqual(['/', '/refactorfirst/', '/refactorfirst/refactorfirst/']);
  // The current branch is plain text, not a link (WCAG breadcrumb pattern).
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveText('master');
  expect(await current.evaluate(el => el.tagName)).not.toBe('A');
});

test('default report route labels the current crumb with the resolved branch', async ({ page }) => {
  await page.goto('/refactorfirst/refactorfirst');
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('main');
  await expect(trail(nav)).toHaveText(['Home', 'refactorfirst', 'refactorfirst', 'main']);
  // The repository level has no distinct ancestor page on this route — the
  // crumb appears unlinked instead of self-linking to the current page.
  expect(await trail(nav).nth(2).locator('a').count()).toBe(0);
});

test('a main 404 falls back to master and the trail relabels to the displayed branch', async ({ page }) => {
  // Later-registered routes take precedence over the beforeEach mock.
  await page.route('**/raw.githubusercontent.com/**/main/.refactorfirst/**', route =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }));
  await page.goto('/refactorfirst/refactorfirst');
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('master');
});

test('branch deep link (?branch=) shows the deep-linked branch', async ({ page }) => {
  await page.goto('/refactorfirst/refactorfirst/?branch=feature%2Flogin');
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('feature/login');
});

test('clicking a crumb navigates back up the hierarchy', async ({ page }) => {
  await page.goto('/refactorfirst/refactorfirst/master');
  await page.waitForLoadState('networkidle');
  const nav = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('master');
  await nav.getByRole('link', { name: 'refactorfirst' }).first().click();
  // Generous timeout: under fullyParallel load the soft navigation's RSC
  // payload fetch can lag a few seconds (observed on Firefox with 3 browsers'
  // workers sharing one server).
  await expect(page).toHaveURL(/\/refactorfirst\/?$/, { timeout: 15000 });
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })
    .locator('[aria-current="page"]')).toHaveText('refactorfirst');
});

test('the breadcrumb trail starts exactly at the menu column left edge', async ({ page }) => {
  for (const width of [1920, 1280, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/refactorfirst/refactorfirst/master/');
    const crumb = page.locator('nav[aria-label="Breadcrumb"] ol li a').first();
    await expect(crumb).toBeVisible();
    const [brandLeft, crumbLeft] = await page.evaluate(() => {
      const brand = document.querySelector('.brand').getBoundingClientRect();
      // Padding-left of the link offsets the glyph edge from the box edge.
      const link = document.querySelector('nav[aria-label="Breadcrumb"] ol li a');
      const linkBox = link.getBoundingClientRect();
      const paddingLeft = parseFloat(getComputedStyle(link).paddingLeft);
      return [brand.left, linkBox.left + paddingLeft];
    });
    expect(Math.abs(crumbLeft - brandLeft),
      `viewport ${width}: crumb text starts at ${crumbLeft}, brand at ${brandLeft}`)
      .toBeLessThanOrEqual(1);
  }
});

test('landing and static pages render no breadcrumb trail', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
  await page.goto('/about/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
});
