// Layout cleanup (plans/layout-cleanup-plan.md): mvp.css makes every
// `section` a wrapping flex row with no gap, which smashed prose children
// together (e.g. on /getting-started the <h1> and the first <h2> shared one
// line). These tests pin the corrected behavior: block flow — each child of a
// content section starts strictly below the previous child — plus a bounded,
// centered content column.
import { test, expect } from '@playwright/test';

// Returns, for each <section> matching `selector`, the client rects of its
// direct children (in DOM order).
function sectionChildRects(selector) {
  return Array.from(document.querySelectorAll(selector)).map(section =>
    Array.from(section.children).map(el => el.getBoundingClientRect())
  );
}

// Every child must start strictly below the previous child's bottom
// (2px tolerance for sub-pixel rounding).
function expectStacked(rects, context) {
  const failures = [];
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].top < rects[i - 1].bottom - 2) {
      failures.push(`child ${i - 1} (bottom ${rects[i - 1].bottom}) and child ${i} (top ${rects[i].top}) share a row`);
    }
  }
  expect(failures, `${context}: children must stack vertically`).toEqual([]);
}

const CONTENT_PAGES = ['/about/', '/getting-started/', '/add-repo/'];

test.describe('content page layout', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const path of CONTENT_PAGES) {
    test(`${path} stacks section children vertically`, async ({ page }) => {
      await page.goto(path);
      const sections = await page.evaluate(sectionChildRects, 'main section');
      expect(sections.length).toBeGreaterThan(0);
      for (const rects of sections) expectStacked(rects, path);
    });

    test(`${path} keeps prose in a bounded, centered column`, async ({ page }) => {
      await page.goto(path);
      const box = await page.locator('main section.content-page').boundingBox();
      expect(box).toBeTruthy();
      expect(box.width).toBeLessThanOrEqual(800);
      const left = box.x;
      const right = 1280 - box.x - box.width;
      expect(Math.abs(left - right)).toBeLessThanOrEqual(8);
    });
  }

  test('getting-started regression: title and first heading do not share a row', async ({ page }) => {
    await page.goto('/getting-started/');
    const [h1, firstH2] = await Promise.all([
      page.locator('main section h1').boundingBox(),
      page.locator('main section h2').first().boundingBox(),
    ]);
    expect(h1).toBeTruthy();
    expect(firstH2).toBeTruthy();
    expect(firstH2.y).toBeGreaterThanOrEqual(h1.y + h1.height - 2);
  });
});

test.describe('landing page layout', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('hero, call-to-action and featured sections stack vertically', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const rects = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main > section, main > .hero-search')).map(el =>
        el.getBoundingClientRect()
      )
    );
    expect(rects.length).toBeGreaterThanOrEqual(3);
    expectStacked(rects, 'landing');
  });

  test('featured heading sits above the repository grid, not beside it', async ({ page }) => {
    await page.goto('/');
    const [heading, grid] = await Promise.all([
      page.locator('main section h2').boundingBox(),
      page.locator('.featured-repos ul').boundingBox(),
    ]);
    expect(heading).toBeTruthy();
    expect(grid).toBeTruthy();
    expect(grid.y).toBeGreaterThanOrEqual(heading.y + heading.height - 2);
  });
});
