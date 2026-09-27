// Dark mode E2E (plans/css-only-dark-mode.md): the three-mode toggle sits
// flush with the top menu's right content edge, switching is pure CSS
// (radio :has() + prefers-color-scheme), and the inline bootstrap script
// persists the choice across hard loads.
import { test, expect } from '@playwright/test';

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
    const bar = document.querySelector('.menu-bar').getBoundingClientRect();
    const toggle = document.querySelector('.theme-toggle').getBoundingClientRect();
    const style = getComputedStyle(document.querySelector('.menu-bar'));
    return {
      toggleRight: toggle.right,
      // The menu bar's right *content* edge (its 0.8rem padding insets the
      // search input exactly like the sub-row padding insets the toggle).
      barContentRight: bar.right - parseFloat(style.paddingRight)
    };
  });
  expect(Math.abs(edges.toggleRight - edges.barContentRight)).toBeLessThanOrEqual(1);
});

test('the toggle sits below the menu bar, right-aligned, at mobile widths', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'geometry check runs once');
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const edges = await page.evaluate(() => {
    const bar = document.querySelector('.menu-bar').getBoundingClientRect();
    const toggle = document.querySelector('.theme-toggle').getBoundingClientRect();
    return {
      toggleRight: toggle.right,
      barContentRight: bar.right - parseFloat(getComputedStyle(document.querySelector('.menu-bar')).paddingRight),
      belowBar: toggle.top >= bar.bottom
    };
  });
  expect(Math.abs(edges.toggleRight - edges.barContentRight)).toBeLessThanOrEqual(1);
  expect(edges.belowBar).toBe(true);
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
