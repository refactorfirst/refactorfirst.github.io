// E2E coverage for the enhanced report tables (plan Phase 6): sticky
// headers, pagination, sorting, search/filter, CSV export and cell copy
// verified in real browsers. Network calls to GitHub raw content are mocked
// with a synthesized report rich enough to paginate (45 relationships).
import { test, expect } from '@playwright/test';

const CLASS_ROW_COUNT = 45;

function buildReport() {
  return {
    project: {
      name: 'pagination-demo',
      version: '1.0.0',
      repoUrl: 'https://github.com/demo/pagination-demo',
      scanTimestamp: '9/9/26, 8:06 PM',
      hasAnyDisharmony: false
    },
    classMap: {
      graphId: 'classGraph',
      classCount: CLASS_ROW_COUNT + 1,
      relationshipCount: CLASS_ROW_COUNT,
      dotThreshold: 4000,
      dotThresholdExceeded: true,
      dot: '',
      hasEdges: true
    },
    packageMap: {
      graphId: 'packageGraph',
      classCount: 0,
      relationshipCount: 0,
      dotThreshold: 4000,
      dotThresholdExceeded: true,
      dot: '',
      hasEdges: false
    },
    classRelationshipsToRemove: {
      cycleCount: 2,
      relationshipsToRemoveCount: CLASS_ROW_COUNT,
      hasRelationships: true,
      relationships: Array.from({ length: CLASS_ROW_COUNT }, (_, i) => ({
        sourceClass: `com.example.Source${i}`,
        targetClass: `com.example.Target${i}`,
        sourceUrl: null,
        targetUrl: null,
        sourceMarked: false,
        targetMarked: false,
        weight: 1,
        renderedLabel: `Source${i} to Target${i}`,
        priority: (i % 5) + 1,
        cycleCount: i % 4,
        effortRank: CLASS_ROW_COUNT - i,
        alsoRemovesPackageRelationship: false,
        packageCycleCount: 0
      }))
    },
    packageRelationshipsToRemove: {
      cycleCount: 0,
      relationshipsToRemoveCount: 0,
      hasRelationships: false,
      relationships: []
    },
    hasDisharmonies: false,
    disharmonies: [],
    classCycles: { hasCycles: false, summary: [], largestCycle: { hasCycleMap: false } }
  };
}

test.beforeEach(async ({ page }) => {
  const report = buildReport();
  await page.route('**/raw.githubusercontent.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
    } else {
      route.fulfill({ status: 404 });
    }
  });
  // Visit a pre-generated report route; the mocked GitHub response above
  // supplies our synthesized report regardless of the repository name.
  await page.goto('/refactorfirst/refactorfirst');
  await expect(page.locator('table[data-rf-table="class-relationships"] tbody tr').first())
    .toBeVisible({ timeout: 15000 });
});

test.describe('pagination', () => {
  test('large tables paginate at 20 rows with labelled controls', async ({ page }) => {
    const nav = page.locator('[data-rf-pagination="class-relationships"]');
    await expect(nav).toContainText('Page 1 of 3');
    await expect(nav.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(nav.getByRole('button', { name: 'Next' })).toBeEnabled();
    await expect(page.locator('table[data-rf-table="class-relationships"] tbody tr'))
      .toHaveCount(20);
  });

  test('next/previous navigate through all pages', async ({ page }) => {
    const nav = page.locator('[data-rf-pagination="class-relationships"]');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('Page 2 of 3');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('Page 3 of 3');
    await expect(page.locator('table[data-rf-table="class-relationships"] tbody tr'))
      .toHaveCount(5);
    await expect(nav.getByRole('button', { name: 'Next' })).toBeDisabled();
    await nav.getByRole('button', { name: 'Previous' }).click();
    await expect(nav).toContainText('Page 2 of 3');
  });

  test('pagination controls are reachable and operable by keyboard', async ({ page }) => {
    const nav = page.locator('[data-rf-pagination="class-relationships"]');
    const next = nav.getByRole('button', { name: 'Next' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(nav).toContainText('Page 2 of 3');
  });

  test('pagination controls stay usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const table = page.locator('table[data-rf-table="class-relationships"]');
    await table.scrollIntoViewIfNeeded();
    const nav = page.locator('[data-rf-pagination="class-relationships"]');
    await expect(nav.getByRole('button', { name: 'Next' })).toBeVisible();
    await expect(page.locator('input[data-rf-search="class-relationships"]')).toBeVisible();
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('Page 2 of 3');
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('sticky headers stay pinned while a long table scrolls', async ({ page }) => {
    const firstHeader = page.locator(
      'table[data-rf-table="class-relationships"] thead th').first();
    await expect(firstHeader).toHaveCSS('position', 'sticky');

    // Sort ascending first so the table keeps a stable order while the page
    // scrolls the header into (and past) its resting position.
    const table = page.locator('table[data-rf-table="class-relationships"]');
    await table.locator('tbody tr').last().scrollIntoViewIfNeeded();
    const headerBox = await firstHeader.boundingBox();
    const windowScrollY = await page.evaluate(() => window.scrollY);
    expect(windowScrollY).toBeGreaterThan(0);
    expect(headerBox.y).toBeGreaterThanOrEqual(0);
  });
});

test.describe('sorting', () => {
  test('clicking a column header sorts ascending, then descending, with aria-sort', async ({ page }) => {
    const table = page.locator('table[data-rf-table="class-relationships"]');
    const priorityHeader = table.locator('thead th', { has: page.getByRole('button', { name: /Priority/ }) });
    const priorities = () => table.locator('tbody tr td:nth-child(2)').allInnerTexts()
      .then(texts => texts.map(Number));

    await priorityHeader.getByRole('button').click();
    await expect(priorityHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(await priorities()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3]);

    await priorityHeader.getByRole('button').click();
    await expect(priorityHeader).toHaveAttribute('aria-sort', 'descending');
    const desc = await priorities();
    expect(desc[0]).toBe(5);
    expect([...desc].reverse()).toEqual([...desc].sort((a, b) => a - b));
  });

  test('sorting is kept while paging through the result set', async ({ page }) => {
    const table = page.locator('table[data-rf-table="class-relationships"]');
    const priorityHeader = table.locator('thead th', { has: page.getByRole('button', { name: /Priority/ }) });
    await priorityHeader.getByRole('button').click();
    await expect(priorityHeader).toHaveAttribute('aria-sort', 'ascending');

    const nav = page.locator('[data-rf-pagination="class-relationships"]');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('Page 2 of 3');
    await expect(priorityHeader).toHaveAttribute('aria-sort', 'ascending');
    const priorities = await table.locator('tbody tr td:nth-child(2)').allInnerTexts();
    expect(Number(priorities[0])).toBeGreaterThanOrEqual(3);
  });

  test('column headers are keyboard operable', async ({ page }) => {
    const table = page.locator('table[data-rf-table="class-relationships"]');
    const cycleHeader = table.locator('thead th', { has: page.getByRole('button', { name: /In Class Cycles/ }) });
    await cycleHeader.getByRole('button').focus();
    await page.keyboard.press('Enter');
    await expect(cycleHeader).toHaveAttribute('aria-sort', 'ascending');
  });
});

test.describe('search and filter', () => {
  test('typing filters rows in real time and reports the match count', async ({ page }) => {
    const search = page.locator('input[data-rf-search="class-relationships"]');
    await expect(search).toHaveAccessibleName(/filter.*relationships/i);
    await search.fill('target7');
    const match = page.locator('[data-rf-match="class-relationships"]');
    await expect(match).toContainText(/ of 45 rows match/);
    const rows = page.locator('table[data-rf-table="class-relationships"] tbody tr');
    const statuses = await rows.allInnerTexts();
    for (const text of statuses) {
      expect(text.toLowerCase()).toContain('target7');
    }
  });

  test('search is case-insensitive and combined with pagination', async ({ page }) => {
    const search = page.locator('input[data-rf-search="class-relationships"]');
    await search.fill('SOURCE1');
    const match = page.locator('[data-rf-match="class-relationships"]');
    // Source1, Source10..Source19, Source21..? -> 11 matches (1 + 10),
    // single page once filtered.
    await expect(match).toContainText('11 of 45 rows match');
    await expect(page.locator('[data-rf-pagination="class-relationships"]')).toHaveCount(0);
    await expect(page.locator('table[data-rf-table="class-relationships"] tbody tr'))
      .toHaveCount(11);
  });

  test('the "x" button clears the filter and restores the unfiltered table', async ({ page }) => {
    const clear = page.getByRole('button', { name: /clear.*filter/i }).first();
    await expect(clear).toHaveText('×');
    await page.locator('input[data-rf-search="class-relationships"]').fill('target7');
    const match = page.locator('[data-rf-match="class-relationships"]');
    await expect(match).toContainText('rows match');
    await clear.click();
    await expect(page.locator('[data-rf-pagination="class-relationships"]'))
      .toContainText('Page 1 of 3');
    await expect(match).toHaveText('');
  });

  test('search results stay sorted when a sort order is active', async ({ page }) => {
    const table = page.locator('table[data-rf-table="class-relationships"]');
    const priorityHeader = table.locator('thead th', { has: page.getByRole('button', { name: /Priority/ }) });
    await priorityHeader.getByRole('button').click();
    await priorityHeader.getByRole('button').click();
    await expect(priorityHeader).toHaveAttribute('aria-sort', 'descending');
    await page.locator('input[data-rf-search="class-relationships"]').fill('target1');
    await expect(page.locator('[data-rf-match="class-relationships"]'))
      .toContainText('rows match');
    const priorities = (await table.locator('tbody tr td:nth-child(2)').allInnerTexts()).map(Number);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });
});

test.describe('csv export', () => {
  test('exports the complete table as a CSV download regardless of pagination', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-rf-export="class-relationships"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^refactorfirst-class-relationships-\d{4}-\d{2}-\d{2}T.*\.csv$/);

    const stream = await download.createReadStream();
    let csv = '';
    for await (const chunk of stream) csv += chunk.toString('utf8');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Class Relationship,Priority,In Class Cycles,Relationship Strength,Also Removes Pkg Cycle Relationship,In Package Cycles');
    expect(lines.length).toBe(CLASS_ROW_COUNT + 1);
    expect(lines[1]).toContain('Source0 to Target0');
    expect(lines[CLASS_ROW_COUNT]).toContain(`Source${CLASS_ROW_COUNT - 1} to Target${CLASS_ROW_COUNT - 1}`);
  });

  test('export buttons are labelled and keyboard operable', async ({ page }) => {
    const exportButton = page.locator('[data-rf-export="class-relationships"]');
    await expect(exportButton).toHaveAccessibleName(/export.*csv/i);
    await exportButton.focus();
    const downloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
  });
});

test.describe('wide tables', () => {
  const WIDE_LABEL =
    'VeryLongClassNameWithLotsOfWordsThatKeepGoing.FullyQualified.AnotherLongTypeName.DeeplyNested → AnExtremelyLongTargetClassName.ThatGoesOn.AndOn.AndOn.AndOn';

  async function loadWideReport(page) {
    const report = buildReport();
    for (const rel of report.classRelationshipsToRemove.relationships) {
      rel.renderedLabel = `${WIDE_LABEL} ${rel.priority}`;
    }
    await page.route('**/raw.githubusercontent.com/**', route => {
      const url = route.request().url();
      if (url.endsWith('refactor-first.json')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
      } else {
        route.fulfill({ status: 404 });
      }
    });
    await page.reload();
    await page.locator('table[data-rf-table="class-relationships"] tbody tr').first().waitFor();
  }

  test('no horizontal scrollbar when the table fits the viewport', async ({ page }) => {
    const wrapper = page.locator('[data-rf-scroll="class-relationships"]');
    await expect(wrapper).not.toHaveClass(/rf-scroll-x-enabled/);
    await expect(wrapper).toHaveCSS('overflow-x', 'visible');
  });

  test('tables wider than the screen get a working horizontal scrollbar', async ({ page }) => {
    await loadWideReport(page);
    const wrapper = page.locator('[data-rf-scroll="class-relationships"]');
    await expect(wrapper).toHaveClass(/rf-scroll-x-enabled/);

    const dims = await wrapper.evaluate(el => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX
    }));
    expect(dims.scrollWidth).toBeGreaterThan(dims.clientWidth);
    expect(dims.overflowX).toBe('auto');

    const scrolled = await wrapper.evaluate(el => {
      el.scrollLeft = 300;
      return el.scrollLeft;
    });
    expect(scrolled).toBe(300);

    // The black bounding box wraps the visible scroll area, not the clipped
    // table content (whose right edge would otherwise scroll out of it).
    const styles = await wrapper.evaluate(el => {
      const table = el.querySelector('table');
      return {
        wrapperBorder: getComputedStyle(el).borderTopWidth,
        tableBorder: getComputedStyle(table).borderTopWidth
      };
    });
    expect(styles.wrapperBorder).toBe('5px');
    expect(styles.tableBorder).toBe('0px');

    const wrapperBox = await wrapper.boundingBox();
    expect(wrapperBox.x + wrapperBox.width).toBeLessThanOrEqual(
      (await page.evaluate(() => document.documentElement.clientWidth)) + 1);
  });

  test('wide tables keep their header pinned to the viewport while scrolling', async ({ page }) => {
    await loadWideReport(page);
    const wrapper = page.locator('[data-rf-scroll="class-relationships"]');
    await expect(wrapper).toHaveClass(/rf-scroll-x-enabled/);

    const firstHeader = page.locator(
      'table[data-rf-table="class-relationships"] thead th').first();
    const table = page.locator('table[data-rf-table="class-relationships"]');
    await table.locator('tbody tr').last().scrollIntoViewIfNeeded();

    // The JS pin kicks in on the (asynchronously dispatched) scroll event.
    await expect(firstHeader).toHaveCSS('transform', /^matrix\(/);

    const headerBox = await firstHeader.boundingBox();
    expect(headerBox.y).toBeGreaterThanOrEqual(0);
    expect(headerBox.y).toBeLessThan(2);
    const tableBox = await table.boundingBox();
    expect(headerBox.y).toBeLessThan(tableBox.y + tableBox.height);
  });

  test('search and export controls align with the right edge of the table frame', async ({ page }) => {
    // The visible frame's right edge is the scroll wrapper's border box.
    const frameBox = await page.locator('[data-rf-scroll="class-relationships"]').boundingBox();
    const actionsBox = await page.locator(
      '.rf-table-toolbar[data-rf-toolbar="class-relationships"] .rf-table-actions').boundingBox();
    expect(Math.abs((actionsBox.x + actionsBox.width) - (frameBox.x + frameBox.width)))
      .toBeLessThanOrEqual(2);
  });
});

test.describe('stateful widgets survive table interactions', () => {
  // Reports with charts/graphs: table interactions re-render the whole
  // report DOM, but the live Chart.js canvas and vizdom-rendered graph must
  // be grafted into the fresh markup (not rebuilt), and popup handlers must
  // be re-bound on the recreated buttons.
  function buildStatefulReport() {
    const report = buildReport();
    report.project.hasAnyDisharmony = true;
    report.classMap = {
      graphId: 'classGraph',
      classCount: 3,
      relationshipCount: 2,
      dotThreshold: 4000,
      dotThresholdExceeded: false,
      dot: 'strict digraph G {\nSource0 -> Target0 [ label = "2" weight = "2" ];\nSource1 -> Target1 [ label = "1" weight = "1" ];\n}',
      hasEdges: true
    };
    report.hasDisharmonies = true;
    report.disharmonies = [{
      type: 'God Class',
      anchorId: 'GOD',
      title: 'God Classes',
      methodLevel: false,
      problem: 'God Classes take on too much responsibility,',
      solution: 'Extract related islands of functionality into separate classes.',
      maxPriority: 2,
      chart: {
        canvasId: 'chart_GOD',
        bubbles: [{
          id: 'Source0.java', label: 'Source0.java', x: 1, y: 2, r: 24,
          priority: 1, effortRank: 1, changePronenessRank: 2,
          color: 'rgba(235, 64, 52, 0.75)', borderColor: 'rgb(235, 64, 52)'
        }],
        xaxisLabel: 'Effort to refactor',
        yaxisLabel: 'Relative churn (impact)'
      },
      table: {
        headers: ['Class', 'Priority'],
        rows: [{ cells: [
          { content: '<code>com.example.Source0</code>', align: 'left' },
          { content: '1', align: 'right' }
        ] }]
      }
    }];
    return report;
  }

  async function loadStatefulReport(page) {
    const report = buildStatefulReport();
    await page.route('**/raw.githubusercontent.com/**', route => {
      const url = route.request().url();
      if (url.endsWith('refactor-first.json')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) });
      } else {
        route.fulfill({ status: 404 });
      }
    });
    await page.reload();
    await page.locator('table[data-rf-table="class-relationships"] tbody tr').first().waitFor();
  }

  test('charts, graphs and popups survive a table interaction re-render', async ({ page }) => {
    await loadStatefulReport(page);
    await expect(page.locator('#classGraph svg')).toBeVisible();
    await expect(page.locator('canvas#chart_GOD')).toBeAttached();

    // Tag the live widget nodes; a rebuilt DOM would come back untagged or
    // with different nodes.
    await page.evaluate(() => {
      document.querySelector('canvas#chart_GOD').dataset.e2eGraft = 'chart-live';
      document.querySelector('#classGraph').dataset.e2eGraft = 'graph-live';
    });

    const nav = page.locator('[data-rf-pagination="class-relationships"]');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('Page 2 of 3');

    const markers = await page.evaluate(() => ({
      chart: document.querySelector('canvas#chart_GOD')?.dataset.e2eGraft ?? null,
      graph: document.querySelector('#classGraph')?.dataset.e2eGraft ?? null,
      graphHasSvg: Boolean(document.querySelector('#classGraph svg'))
    }));
    expect(markers).toEqual({ chart: 'chart-live', graph: 'graph-live', graphHasSvg: true });

    // Popup buttons were recreated with the DOM: handlers must still work.
    await page.getByRole('button', { name: 'Show classGraph 2D' }).click();
    await expect(page.locator('#overlay')).toBeVisible();
    await page.locator('#popup-classGraph .close-btn').click();
    await expect(page.locator('#overlay')).toBeHidden();
  });
});

test.describe('copy cell content', () => {
  test('clicking a cell copies it and shows a toast notification', async ({ page, browserName }) => {
    if (browserName === 'chromium') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    const cell = page.locator('table[data-rf-table="class-relationships"] tbody td').first();
    const cellText = (await cell.innerText()).trim();
    await cell.click();

    const toast = page.locator('.rf-toast-region');
    await expect(toast).toContainText(`Copied ${cellText}`);

    if (browserName === 'chromium') {
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboard).toBe(cellText);
    }

    // Toast auto-dismisses (default duration 3s).
    await expect(toast.locator('.rf-toast')).toHaveCount(0, { timeout: 6000 });
  });

  test('cells are keyboard focusable and Enter copies', async ({ page }) => {
    const cell = page.locator('table[data-rf-table="class-relationships"] tbody td').nth(1);
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.rf-toast-region')).toContainText('Copied');
  });
});
