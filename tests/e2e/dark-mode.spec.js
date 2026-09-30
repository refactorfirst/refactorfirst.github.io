// Dark mode E2E (plans/css-only-dark-mode.md): the three-mode toggle sits
// flush with the top menu's right content edge, switching is pure CSS
// (radio :has() + prefers-color-scheme), and the inline bootstrap script
// persists the choice across hard loads.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SAMPLE_REPORT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../fixtures/junit4-report.json'),
  'utf8'
);

const LIGHT_BG = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(16, 22, 29)';

async function bodyBackground(page) {
  return page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );
}

test('the toggle renders three labelled icon modes with system preselected', async ({ page }) => {
  await page.goto('/');
  const group = page.locator('.theme-toggle[role="radiogroup"]');
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('aria-label', 'Color theme');
  await expect(group.locator('input[type="radio"]')).toHaveCount(3);
  await expect(page.locator('#rf-theme-system')).toBeChecked();
  for (const value of ['light', 'dark', 'system']) {
    await expect(page.locator(`#rf-theme-${value}`)).toHaveAttribute('name', 'rf-theme');
    await expect(page.locator(`#rf-theme-${value} + .theme-option-icon`)).toBeVisible();
  }
});

test('the toggle right edge aligns with the top menu content edge', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'geometry check runs once');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const edges = await page.evaluate(() => {
    const header = document.getElementById('top-menu').getBoundingClientRect();
    const bar = document.querySelector('.menu-bar').getBoundingClientRect();
    const toggle = document.querySelector('.theme-toggle').getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('.menu-bar'));
    return {
      toggleRight: toggle.right,
      // The menu bar's right *content* edge (its 0.8rem padding insets the
      // search input exactly like the row padding insets the toggle).
      barContentRight: bar.right - parseFloat(style.paddingRight),
      belowHeader: toggle.top >= header.bottom
    };
  });
  expect(Math.abs(edges.toggleRight - edges.barContentRight)).toBeLessThanOrEqual(1);
  expect(edges.belowHeader).toBe(true);
});

test('the toggle sits below the header, right-aligned, at mobile widths', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'geometry check runs once');
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const edges = await page.evaluate(() => {
    const header = document.getElementById('top-menu').getBoundingClientRect();
    const bar = document.querySelector('.menu-bar').getBoundingClientRect();
    const toggle = document.querySelector('.theme-toggle').getBoundingClientRect();
    return {
      toggleRight: toggle.right,
      barContentRight: bar.right - parseFloat(getComputedStyle(document.querySelector('.menu-bar')).paddingRight),
      belowHeader: toggle.top >= header.bottom
    };
  });
  expect(Math.abs(edges.toggleRight - edges.barContentRight)).toBeLessThanOrEqual(1);
  expect(edges.belowHeader).toBe(true);
});

test('light OS preference renders light by default', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
});

test('dark OS preference themes the site without any click', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await bodyBackground(page)).toBe(DARK_BG);
  // The system radio stays checked; the palette came from prefers-color-scheme.
  await expect(page.locator('#rf-theme-system')).toBeChecked();
});

test('the dark radio overrides a light OS preference and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('#rf-theme-dark').check();
  expect(await bodyBackground(page)).toBe(DARK_BG);

  await page.reload();
  expect(await bodyBackground(page)).toBe(DARK_BG);
  await expect(page.locator('#rf-theme-dark')).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('rf-theme'))).toBe('dark');
});

test('the light radio overrides a dark OS preference and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('#rf-theme-light').check();
  expect(await bodyBackground(page)).toBe(LIGHT_BG);

  await page.reload();
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
  expect(await page.evaluate(() => localStorage.getItem('rf-theme'))).toBe('light');
});

test('switching back to system follows the OS preference again', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('#rf-theme-light').check();
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
  await page.locator('#rf-theme-system').check();
  expect(await bodyBackground(page)).toBe(DARK_BG);
  expect(await page.evaluate(() => localStorage.getItem('rf-theme'))).toBe('system');
});

test('dark mode keeps rendering dark on report pages after navigation', async ({ page }) => {
  await page.goto('/');
  await page.locator('#rf-theme-dark').check();
  await page.goto('/about/');
  expect(await bodyBackground(page)).toBe(DARK_BG);
  expect(await page.evaluate(() => localStorage.getItem('rf-theme'))).toBe('dark');
});

test('non-red graph edges re-tint to the dark palette, cycle edges stay red', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'wasm-heavy check runs once');
  // Mock GitHub raw content so the report page never hits the network.
  await page.route('**/raw.githubusercontent.com/**', route => {
    if (route.request().url().endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: SAMPLE_REPORT });
    } else {
      route.continue();
    }
  });
  await page.goto('/refactorfirst/refactorfirst/master/');
  // vizdom parses/lays out the graph asynchronously via WASM.
  await page.waitForSelector('#classGraph svg path[stroke="black"]', { timeout: 120000 });
  await page.waitForSelector('#classGraph svg polygon[fill="black"]');
  await page.waitForSelector('#classGraph svg path[stroke="red"]');

  const strokeOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).stroke, selector);
  const fillOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).fill, selector);
  const REGULAR_EDGE = '#classGraph svg path[stroke="black"]';
  const REGULAR_ARROW = '#classGraph svg polygon[fill="black"]';
  const CYCLE_EDGE = '#classGraph svg path[stroke="red"]';
  const CYCLE_ARROW = '#classGraph svg polygon[fill="red"]';

  // Light theme: edges keep the baked-in black.
  expect(await strokeOf(REGULAR_EDGE)).toBe('rgb(0, 0, 0)');

  await page.locator('#rf-theme-dark').check();
  // Dark theme: non-red edges/arrowheads use #9fb0c0 (dark --muted-color,
  // the Chart.js legend text color)…
  expect(await strokeOf(REGULAR_EDGE)).toBe('rgb(159, 176, 192)');
  expect(await strokeOf(REGULAR_ARROW)).toBe('rgb(159, 176, 192)');
  expect(await fillOf(REGULAR_ARROW)).toBe('rgb(159, 176, 192)');
  // …while red (cycle) edges and arrowheads stay red.
  expect(await strokeOf(CYCLE_EDGE)).toBe('rgb(255, 0, 0)');
  expect(await fillOf(CYCLE_ARROW)).toBe('rgb(255, 0, 0)');

  // Switching back to light restores black without a reload (pure CSS).
  await page.locator('#rf-theme-light').check();
  expect(await strokeOf(REGULAR_EDGE)).toBe('rgb(0, 0, 0)');
});

test('breadcrumbs and the toggle share one vertically centered row on report pages', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'geometry check runs once');
  // Mock GitHub raw content so the report page never hits the network.
  await page.route('**/raw.githubusercontent.com/**', route => {
    if (route.request().url().endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: SAMPLE_REPORT });
    } else {
      route.continue();
    }
  });
  await page.goto('/refactorfirst/refactorfirst/master/');
  await page.waitForLoadState('networkidle');
  const edges = await page.evaluate(() => {
    const crumb = document.querySelector('nav[aria-label="Breadcrumb"] ol li a');
    const crumbBox = crumb.getBoundingClientRect();
    const toggle = document.querySelector('.theme-toggle').getBoundingClientRect();
    const bar = document.querySelector('.menu-bar').getBoundingClientRect();
    return {
      crumbGlyphLeft: crumbBox.left + parseFloat(getComputedStyle(crumb).paddingLeft),
      brandLeft: document.querySelector('.brand').getBoundingClientRect().left,
      sameRow: crumbBox.top < toggle.bottom && toggle.top < crumbBox.bottom,
      centerDelta: Math.abs((crumbBox.top + crumbBox.bottom) / 2 - (toggle.top + toggle.bottom) / 2),
      toggleRight: toggle.right,
      barContentRight: bar.right - parseFloat(getComputedStyle(document.querySelector('.menu-bar')).paddingRight)
    };
  });
  // The first crumb's glyph keeps the menu column's left content edge…
  expect(Math.abs(edges.crumbGlyphLeft - edges.brandLeft)).toBeLessThanOrEqual(1);
  // …the toggle keeps the right content edge…
  expect(Math.abs(edges.toggleRight - edges.barContentRight)).toBeLessThanOrEqual(1);
  // …and the two share one vertically centered line.
  expect(edges.sameRow).toBe(true);
  expect(edges.centerDelta).toBeLessThanOrEqual(1);
});
