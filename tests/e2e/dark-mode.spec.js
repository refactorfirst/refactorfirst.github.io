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

test('graph edge labels re-tint to the dark palette, restore in light', async ({ page }) => {
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
  // vizdom parses/lays out the graph asynchronously via WASM. Edge labels
  // render as glyph paths whose fill carries the DOT fontcolor.
  await page.waitForSelector('#classGraph svg path[stroke="black"]', { timeout: 120000 });

  // vizdom uppercases the DOT color when it writes the SVG fill attribute.
  const labelFills = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#classGraph svg path'))
      .filter(p => !p.getAttribute('stroke'))
      .map(p => (p.getAttribute('fill') || '').toLowerCase()));

  // Light theme: labels keep the baked-in default (no fontcolor applied).
  expect((await labelFills()).some(f => f === '#9fb0c0')).toBe(false);

  await page.locator('#rf-theme-dark').check();
  // Dark theme: the graph re-parses with fontcolor = "#9fb0c0" on edges.
  await page.waitForSelector('#classGraph svg path[fill="#9FB0C0"]');
  const darkFills = await labelFills();
  expect(darkFills.filter(f => f === '#9fb0c0').length).toBeGreaterThan(0);

  // Switching back to light re-renders with the plain dot again.
  await page.locator('#rf-theme-light').check();
  await page.waitForFunction(() =>
    !document.querySelector('#classGraph svg path[fill="#9FB0C0"]'));
  expect((await labelFills()).some(f => f === '#9fb0c0')).toBe(false);
});

test('package cluster boxes re-theme in dark mode, labels follow the palette', async ({ page }) => {
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
  // vizdom renders package clusters as g.cluster rects carrying the DOT's
  // fillcolor=white, with the cluster label as a black glyph path.
  await page.waitForSelector('#classGraph svg g.cluster rect[fill="white"]', { timeout: 120000 });
  const fillOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).fill, selector);
  const strokeOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).stroke, selector);
  const CLUSTER_BOX = '#classGraph svg g.cluster rect[fill="white"]';
  const CLUSTER_LABEL = '#classGraph svg g.cluster rect[fill="white"] ~ path[fill="black"]';

  // Light theme: vizdom's baked white boxes with black strokes and labels.
  expect(await fillOf(CLUSTER_BOX)).toBe('rgb(255, 255, 255)');
  expect(await strokeOf(CLUSTER_BOX)).toBe('rgb(0, 0, 0)');
  expect(await fillOf(CLUSTER_LABEL)).toBe('rgb(0, 0, 0)');

  await page.locator('#rf-theme-dark').check();
  // Dark theme: regular package clusters match the dark page background
  // (#10161d = --bg-color) and their strokes/labels follow --graph-line
  // (#9fb0c0), pure CSS on the already-rendered SVG.
  expect(await fillOf(CLUSTER_BOX)).toBe('rgb(16, 22, 29)');
  expect(await strokeOf(CLUSTER_BOX)).toBe('rgb(159, 176, 192)');
  expect(await fillOf(CLUSTER_LABEL)).toBe('rgb(159, 176, 192)');

  // Switching back to light restores the baked white/black without a re-parse.
  await page.locator('#rf-theme-light').check();
  expect(await fillOf(CLUSTER_BOX)).toBe('rgb(255, 255, 255)');
  expect(await fillOf(CLUSTER_LABEL)).toBe('rgb(0, 0, 0)');
});

test('break-up package clusters read as flagged in dark mode, edges stay visible', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'wasm-heavy check runs once');
  // Flag one package for break-up so the class map renders a pink cluster;
  // the shipped fixture has none.
  const flagged = JSON.parse(SAMPLE_REPORT);
  flagged.classMap.hierarchy.packages[0].needsBreakUp = true;
  await page.route('**/raw.githubusercontent.com/**', route => {
    if (route.request().url().endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flagged) });
    } else {
      route.continue();
    }
  });
  await page.goto('/refactorfirst/refactorfirst/master/');
  // vizdom bakes the DOT's fillcolor=pink onto the break-up cluster rect.
  await page.waitForSelector('#classGraph svg g.cluster rect[fill="pink"]', { timeout: 120000 });
  const fillOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).fill, selector);
  const strokeOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).stroke, selector);
  const BREAKUP_BOX = '#classGraph svg g.cluster rect[fill="pink"]';
  const BREAKUP_LABEL = '#classGraph svg g.cluster rect[fill="pink"] ~ path[fill="black"]';

  // Light theme: vizdom's baked pink box with black label glyphs.
  expect(await fillOf(BREAKUP_BOX)).toBe('rgb(255, 192, 203)');
  expect(await fillOf(BREAKUP_LABEL)).toBe('rgb(0, 0, 0)');

  await page.locator('#rf-theme-dark').check();
  // Dark theme: the box drops to a deep rose (#7f3350 = --graph-breakup-fill)
  // — clearly flagged against the near-black regular clusters without
  // swallowing the #9fb0c0 edges crossing it — and the boundary stroke and
  // label glyphs follow the light pink ink (#f2b8cd = --graph-breakup-line).
  expect(await fillOf(BREAKUP_BOX)).toBe('rgb(127, 51, 80)');
  expect(await strokeOf(BREAKUP_BOX)).toBe('rgb(242, 184, 205)');
  expect(await fillOf(BREAKUP_LABEL)).toBe('rgb(242, 184, 205)');

  // Switching back to light restores the baked pink/black (pure CSS).
  await page.locator('#rf-theme-light').check();
  expect(await fillOf(BREAKUP_BOX)).toBe('rgb(255, 192, 203)');
  expect(await fillOf(BREAKUP_LABEL)).toBe('rgb(0, 0, 0)');
});

test('hovering graph edges and nodes highlights them per palette', async ({ page }) => {
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
  // vizdom renders edges as g.edge groups (curve path + arrowhead polygon).
  await page.waitForSelector('#classGraph svg g.edge path', { timeout: 120000 });
  const strokeOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).stroke, selector);
  const fillOf = selector => page.evaluate(
    sel => getComputedStyle(document.querySelector(sel)).fill, selector);
  const count = selector => page.evaluate(
    sel => document.querySelectorAll(sel).length, selector);

  // Hovering an edge highlights and fills the edge plus both endpoint nodes
  // (amber accent, labels re-inked white on the fill).
  await page.hover('#classGraph svg g.edge path');
  expect(await count('#classGraph svg g.edge.rf-hover-edge')).toBe(1);
  expect(await count('#classGraph svg g.node.rf-hover-edge')).toBe(2);
  expect(await strokeOf('#classGraph svg g.edge.rf-hover-edge path'))
    .toBe('rgb(180, 83, 9)'); // #b45309 light amber
  expect(await fillOf('#classGraph svg g.node.rf-hover-edge ellipse'))
    .toBe('rgb(180, 83, 9)');
  expect(await fillOf('#classGraph svg g.node.rf-hover-edge path'))
    .toBe('rgb(255, 255, 255)'); // #ffffff light on-accent label ink

  // Hovering a node colors incoming (green) and outgoing (blue) separately;
  // TestCase has both directions in the fixture (TestCase -> TestResult and
  // TestResult -> TestCase), so both states apply.
  const TEST_CASE_NODE = '#classGraph svg g.node:has-text("TestCase") ellipse';
  await page.hover(TEST_CASE_NODE);
  expect(await count('#classGraph svg g.edge.rf-hover-in')).toBeGreaterThan(0);
  expect(await count('#classGraph svg g.edge.rf-hover-out')).toBeGreaterThan(0);
  expect(await strokeOf('#classGraph svg g.edge.rf-hover-in path'))
    .toBe('rgb(30, 132, 73)'); // #1e8449 light green
  expect(await strokeOf('#classGraph svg g.edge.rf-hover-out path'))
    .toBe('rgb(42, 111, 151)'); // #2a6f97 light blue
  // The hovered node fills amber; the bidirectional partner (TestResult,
  // flagged both in and out) fills amber too, while the out-only sink
  // (BaseTestRunner) fills blue.
  expect(await fillOf('#classGraph svg g.node.rf-hover-focus ellipse'))
    .toBe('rgb(180, 83, 9)');
  expect(await fillOf('#classGraph svg g.node.rf-hover-in.rf-hover-out ellipse'))
    .toBe('rgb(180, 83, 9)');
  expect(await fillOf('#classGraph svg g.node.rf-hover-out:not(.rf-hover-in) ellipse'))
    .toBe('rgb(42, 111, 151)');

  // The dark palette swaps to its own bright accents with black label ink.
  await page.locator('#rf-theme-dark').check();
  await page.hover('#classGraph svg g.edge path');
  expect(await strokeOf('#classGraph svg g.edge.rf-hover-edge path'))
    .toBe('rgb(240, 185, 90)'); // #f0b95a dark amber
  expect(await fillOf('#classGraph svg g.node.rf-hover-edge ellipse'))
    .toBe('rgb(240, 185, 90)');
  expect(await fillOf('#classGraph svg g.node.rf-hover-edge path'))
    .toBe('rgb(0, 0, 0)'); // #000000 dark on-accent label ink
  await page.hover(TEST_CASE_NODE);
  expect(await strokeOf('#classGraph svg g.edge.rf-hover-in path'))
    .toBe('rgb(126, 226, 168)'); // #7ee2a8 dark green
  expect(await strokeOf('#classGraph svg g.edge.rf-hover-out path'))
    .toBe('rgb(142, 208, 250)'); // #8ed0fa dark blue
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
