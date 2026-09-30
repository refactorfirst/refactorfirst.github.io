// Unwrapped problem/solution tables must not spill past their 5px border on
// narrow screens: mvp.css clamps these tables to max-width: 100% while the
// nowrap rows keep their natural width. Without a scrollbar the rows would
// visibly overflow the border; with overflow-x: auto the bordered box hugs
// the screen edge and the content scrolls inside it (regression coverage
// for the mobile overflow report).
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

const PROBLEM_CAPTION = 'Problem and recommended';

function problemSolutionTables(page) {
  return page.locator('.rf-report table:not([data-rf-table])')
    .filter({ has: page.locator(`caption:text-matches("^${PROBLEM_CAPTION}")`) });
}

test.describe('problem/solution tables on narrow screens', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/refactorfirst/refactorfirst/');
    await page.locator('input[data-rf-search="class-relationships"]').waitFor();
  });

  test('the bordered box fits the column and the overflowing rows scroll', async ({ page }) => {
    const table = problemSolutionTables(page).first();
    await expect(table).toBeVisible();
    // Single atomic measurement: sequential reads straddle report re-renders.
    const geometry = await table.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const column = el.parentElement.getBoundingClientRect();
      const styles = getComputedStyle(el);
      return {
        overflowX: styles.overflowX,
        boxWidth: rect.width,
        columnWidth: column.width,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      };
    });
    expect(geometry.overflowX).toBe('auto');
    // The bordered box fills the column instead of overflowing it…
    expect(Math.abs(geometry.boxWidth - geometry.columnWidth)).toBeLessThanOrEqual(1);
    // …while the wider content is reachable by scrolling.
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
    const before = await table.evaluate(el => el.scrollLeft);
    await table.evaluate(el => { el.scrollLeft = 120; });
    const after = await table.evaluate(el => el.scrollLeft);
    expect(before).toBe(0);
    expect(after).toBe(120);
  });

  test('every problem/solution table stays inside its scroll border', async ({ page }) => {
    const tables = problemSolutionTables(page);
    const overflow = await tables.evaluateAll(elements =>
      elements
        .map(el => {
          const rect = el.getBoundingClientRect();
          const column = el.parentElement.getBoundingClientRect();
          return { caption: el.querySelector('caption')?.textContent ?? '', over: rect.width - column.width };
        })
        .filter(entry => entry.over > 1)
    );
    expect(overflow).toEqual([]);
  });

  test('enhanced tables still keep overflow visible (viewport-sticky headers)', async ({ page }) => {
    // The enhanced tables scroll via their .rf-table-scroll wrapper; giving
    // the table itself overflow rules would capture the sticky header.
    const enhanced = page.locator('table[data-rf-table="class-relationships"]');
    await expect(enhanced).toBeVisible();
    const overflow = await enhanced.evaluate(el => getComputedStyle(el).overflowX);
    expect(overflow).toBe('visible');
  });
});
