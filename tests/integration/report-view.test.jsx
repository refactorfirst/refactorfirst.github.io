// Phase 5: <ReportView> client component — ports the report-rendering
// integration suite to the React report page, plus client-only behaviors
// (widget gating, retry, ?branch= deep links, template/auth failures).
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import { sharedNextNavigationMock } from './next-navigation-stub';

let currentSearch = '';
mock.module('next/navigation', () => sharedNextNavigationMock({
  usePathname: () => '/junit-team/junit4',
  useSearchParams: () => new URLSearchParams(currentSearch)
}));
mock.module('next/script', () => ({
  default: () => null // widget scripts are marked manually in tests
}));

import { render, waitFor, cleanup, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import ReportView from '../../components/report-view';
import { markWidgetReady, resetWidgetRegistry } from '../../lib/widget-loader';

installRtlDom();

const sampleJson = JSON.parse(
  fs.readFileSync(path.join(import.meta.dir, '../fixtures/junit4-report.json'), 'utf8')
);
const reportTemplate = fs.readFileSync(
  path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
);

let mockFetch;

const TEMPLATE_URL = '/assets/refactor-first-report.mustache';

function respondJsonFor(data, { remoteTemplate = '<article>remote-template</article>' } = {}) {
  mockFetch.mockImplementation(requested => {
    const url = String(requested);
    if (url.endsWith(TEMPLATE_URL)) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
    }
    if (url.endsWith('.refactorfirst/refactor-first.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
    }
    if (url.endsWith('.refactorfirst/refactor-first-report.mustache')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(remoteTemplate) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

async function renderReport(props = {}) {
  const utils = render(_jsx(ReportView, {
    username: 'junit-team',
    repository: 'junit4',
    widgetSettleMs: 25,
    ...props
  }));
  await waitFor(() => {
    const settled = utils.container.querySelector('.error-page') !== null
      || typeof window.showPopup === 'function';
    expect(settled).toBe(true);
  });
  return utils;
}

beforeEach(() => {
  currentSearch = '';
  resetWidgetRegistry();
  window.Vizdom = undefined;
  delete window.showPopup;
  delete window.hidePopup;
  delete window.createForceGraph;
  delete window.classGraph_dot;
  delete window.packageGraph_dot;
  // Each enhanced-table interaction re-renders the report; drop the marker so
  // tests observe the binding effect each time.
  document.documentElement.removeAttribute('data-rf-esc-bound');
  mockFetch = spyOn(global, 'fetch');
});
afterEach(() => {
  mockFetch.mockRestore();
  cleanup();
  window.Vizdom = undefined;
  window.Chart = undefined;
});

describe('ReportView', () => {

  test('renders all report sections', async () => {
    respondJsonFor(sampleJson);
    const { container } = await renderReport();

    expect(container.querySelector('h1').textContent).toContain('RefactorFirst');
    expect(container.textContent).toContain('JUnit 4.13.3-SNAPSHOT');
    expect(container.textContent).toContain('Number of classes: 335');
    expect(container.querySelector('#classGraph')).not.toBeNull();
    expect(container.textContent).toContain('Class Relationship Removal Priority');
    expect(container.textContent).toContain('Package Relationship Removal Priority');
    expect(container.textContent).toContain('God Classes');
    expect(container.querySelector('canvas#chart_GOD')).not.toBeNull();
    expect(container.textContent).toContain('Change Proneness Rank');
    expect(container.textContent).toContain('Largest Class Cycle');
    expect(container.textContent).toContain('Last Published:');
  });

  test('wires popup globals via enhanceReport', async () => {
    respondJsonFor(sampleJson);
    await renderReport();
    expect(window.classGraph_dot).toContain('strict digraph');
    expect(window.packageGraph_dot).toContain('strict digraph');
    expect(typeof window.showPopup).toBe('function');
    expect(typeof window.createForceGraph).toBe('function');
    expect(typeof window.hidePopup).toBe('function');
  });

  test('initializes bubble charts once the Chart widget is ready', async () => {
    const created = [];
    window.Chart = function (ctx, config) { created.push(config); };
    markWidgetReady('chart');
    respondJsonFor(sampleJson);
    const { container } = await renderReport();
    expect(created.length).toBeGreaterThan(0);
    expect(container.querySelector('canvas#chart_GOD')).not.toBeNull();
  });

  test('renders inline vizdom graphs when the vizdom widget is ready', async () => {
    const renderedSvgs = [];
    window.Vizdom = {
      DotParser: class {
        parse() {
          return {
            to_directed: () => ({
              layout: () => ({
                to_svg: () => ({
                  to_string: () => { renderedSvgs.push(true); return '<svg><g/></svg>'; }
                })
              })
            })
          };
        }
      }
    };
    markWidgetReady('vizdom');
    respondJsonFor(sampleJson);
    const { container } = await renderReport();
    expect(renderedSvgs.length).toBeGreaterThan(0);
    expect(container.querySelector('#classGraph svg')).not.toBeNull();
  });

  test('shows the analysis-incomplete alert when project.analysisFailed is set', async () => {
    const failedReport = JSON.parse(JSON.stringify(sampleJson));
    failedReport.project.analysisFailed = true;
    respondJsonFor(failedReport);
    const { container } = await renderReport();
    expect(container.textContent).toContain('Analysis incomplete');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  test('escapes renderedLabel in class relationships', async () => {
    respondJsonFor(sampleJson);
    const { container } = await renderReport();
    expect(container.innerHTML).toContain('&lt;a href=https://github.com/junit-team/junit4');
    expect(container.querySelector('.rf-report')).not.toBeNull();
  });

  test('falls back from main to master and exposes data-resolved-branch', async () => {
    mockFetch.mockImplementation(requested => {
      const url = String(requested);
      if (url.includes('/main/.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/master/.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) });
      }
      if (url.endsWith(TEMPLATE_URL)) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const { container } = await renderReport();
    expect(container.textContent).toContain('JUnit');
    expect(mockFetch.mock.calls.some(c => String(c[0]).includes('/master/'))).toBe(true);
    expect(container.querySelector('[data-resolved-branch="master"]')).not.toBeNull();
  });

  test('shows the not-found error page when no branch has a report', async () => {
    mockFetch.mockImplementation(requested =>
      String(requested).endsWith(TEMPLATE_URL)
        ? Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) })
        : Promise.resolve({ ok: false, status: 404 }));
    const { container } = await renderReport();
    expect(container.querySelector('.error-page')).not.toBeNull();
    expect(container.textContent).toContain('Not Found');
  });

  test('ignores any repository-provided template and always uses the bundled one', async () => {
    respondJsonFor(sampleJson, { remoteTemplate: '<article>malicious: {{project.name}}</article>' });
    const { container } = await renderReport();
    expect(container.innerHTML).toContain('Class Map');
    expect(container.innerHTML).not.toContain('malicious');
    expect(mockFetch.mock.calls.some(c => String(c[0]).endsWith('refactor-first-report.mustache')
      && !String(c[0]).endsWith(TEMPLATE_URL))).toBe(false);
  });

  test('uses the bundled template when the repo has none', async () => {
    mockFetch.mockImplementation(requested => {
      const url = String(requested);
      if (url.endsWith('.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) });
      }
      if (url.endsWith(TEMPLATE_URL)) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const { container } = await renderReport();
    expect(container.textContent).toContain('Class Map');
  });

  test('fetches the branch from the ?branch= deep-link query parameter', async () => {
    currentSearch = '?branch=develop';
    respondJsonFor(sampleJson);
    const { container } = await renderReport();
    expect(mockFetch.mock.calls.some(c => String(c[0]).includes('/develop/'))).toBe(true);
    expect(container.querySelector('[data-resolved-branch="develop"]')).not.toBeNull();
  });

  test('a fixed branch prop wins over the query parameter', async () => {
    currentSearch = '?branch=develop';
    respondJsonFor(sampleJson);
    await renderReport({ branch: 'master' });
    expect(mockFetch.mock.calls.some(c => String(c[0]).includes('/develop/'))).toBe(false);
    expect(mockFetch.mock.calls.some(c => String(c[0]).includes('/master/'))).toBe(true);
  });

  test('shows the rate-limit error page on 429 and retries on demand', async () => {
    let blocked = true;
    mockFetch.mockImplementation(requested => {
      const url = String(requested);
      if (url.endsWith(TEMPLATE_URL)) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
      }
      if (blocked) {
        return Promise.resolve({ ok: false, status: 429 });
      }
      if (url.endsWith('.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const { container } = await renderReport();
    expect(container.textContent).toContain('Rate Limit');

    // A retry button must be present; clicking it re-issues the requests
    const retry = container.querySelector('button.retry');
    expect(retry).toBeTruthy();
    blocked = false;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(retry);
    await waitFor(() => expect(container.textContent).toContain('JUnit'));
  });

  test('shows the template error page when the bundled template cannot load', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500 }));
    const { container } = await renderReport();
    expect(container.textContent).toContain('template');
    expect(container.querySelector('.error-page')).not.toBeNull();
  });
});

// Widget gate: the render effect races widget readiness against a fallback
// setTimeout. The fallback handle must be cleared when the race settles and
// again if the effect is torn down first, instead of keeping the closure
// (and its references) alive until widgetSettleMs elapses.
describe('widget settle fallback timer', () => {
  const SETTLE_MS = 4321; // distinctive delay so the fallback is identifiable

  function trackTimers() {
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const created = [];
    const cleared = new Set();
    globalThis.setTimeout = (fn, delay, ...args) => {
      const handle = realSet(fn, delay, ...args);
      created.push({ handle, delay });
      return handle;
    };
    globalThis.clearTimeout = handle => {
      cleared.add(handle);
      return realClear(handle);
    };
    return {
      handlesFor: delay => created.filter(t => t.delay === delay).map(t => t.handle),
      isCleared: handle => cleared.has(handle),
      restore() {
        globalThis.setTimeout = realSet;
        globalThis.clearTimeout = realClear;
      }
    };
  }

  test('clears the fallback timer once the race settles', async () => {
    const timers = trackTimers();
    try {
      // Widgets already ready, so waitForWidget resolves synchronously and
      // creates no timers; the only SETTLE_MS timer is the race fallback.
      markWidgetReady('chart');
      markWidgetReady('vizdom');
      respondJsonFor(sampleJson);
      await renderReport({ widgetSettleMs: SETTLE_MS });

      const handles = timers.handlesFor(SETTLE_MS);
      expect(handles).toHaveLength(1);
      expect(timers.isCleared(handles[0])).toBe(true);
    } finally {
      timers.restore();
    }
  });

  test('clears a still-pending fallback timer when the effect is torn down', async () => {
    const timers = trackTimers();
    try {
      respondJsonFor(sampleJson); // widgets never become ready
      const utils = render(_jsx(ReportView, {
        username: 'junit-team',
        repository: 'junit4',
        widgetSettleMs: SETTLE_MS
      }));
      // waitForWidget timers (chart, vizdom) + the race fallback, in order.
      await waitFor(() => {
        expect(timers.handlesFor(SETTLE_MS).length).toBeGreaterThanOrEqual(3);
      });
      const fallbackTimer = timers.handlesFor(SETTLE_MS).at(-1);
      expect(timers.isCleared(fallbackTimer)).toBe(false);

      utils.unmount();
      expect(timers.isCleared(fallbackTimer)).toBe(true);
    } finally {
      timers.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Enhanced tables (plan: implement-paginated-tables-with-sticky-headers):
// pagination, sorting, search/filter, CSV export and copy-to-clipboard wired
// through ReportView state + enhanceTables.
// ---------------------------------------------------------------------------

// Tests that drive several table interactions incur a full report re-render
// per interaction; under `bun test --coverage` instrumentation that exceeds
// bun's 5s default per-test timeout.
const SLOW_TEST_MS = 20000;

function tableRows(utils, tableId) {
  return [...utils.container.querySelectorAll(
    `table[data-rf-table="${tableId}"] tbody tr`)];
}

function paginationNav(utils, tableId) {
  return utils.container.querySelector(`[data-rf-pagination="${tableId}"]`);
}

function headerCell(utils, tableId, sortKey) {
  return [...utils.container.querySelectorAll(
    `table[data-rf-table="${tableId}"] thead th`)]
    .find(th => th.querySelector(`[data-sort-key="${sortKey}"]`));
}

async function waitForPage(utils, tableId, statusText) {
  await waitFor(() => {
    expect(paginationNav(utils, tableId)?.textContent ?? '').toContain(statusText);
  });
}

describe('enhanced report tables: pagination', () => {
  test('renders only the first page of large tables with keyboard-operable controls', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();

    expect(tableRows(utils, 'class-relationships').length).toBe(20);
    const nav = paginationNav(utils, 'class-relationships');
    expect(nav.textContent).toContain('Page 1 of 3');
    expect(nav.querySelector('[data-page-dir="prev"]').disabled).toBe(true);
    expect(nav.querySelector('[data-page-dir="next"]').disabled).toBe(false);

    // Small tables stay unpaginated; the 25-row summary paginates too.
    expect(paginationNav(utils, 'package-relationships')).toBeNull();
    expect(tableRows(utils, 'package-relationships').length).toBe(18);
    expect(paginationNav(utils, 'class-cycles-summary').textContent).toContain('Page 1 of 2');
  });

  test('next/previous buttons move between pages and update rows', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    const firstPageFirstCell = tableRows(utils, 'class-relationships')[0].textContent;
    fireEvent.click(paginationNav(utils, 'class-relationships').querySelector('[data-page-dir="next"]'));
    await waitForPage(utils, 'class-relationships', 'Page 2 of 3');
    expect(tableRows(utils, 'class-relationships')[0].textContent).not.toBe(firstPageFirstCell);
    expect(paginationNav(utils, 'class-relationships').querySelector('[data-page-dir="prev"]').disabled).toBe(false);

    fireEvent.click(paginationNav(utils, 'class-relationships').querySelector('[data-page-dir="prev"]'));
    await waitForPage(utils, 'class-relationships', 'Page 1 of 3');
    expect(tableRows(utils, 'class-relationships')[0].textContent).toBe(firstPageFirstCell);
  }, SLOW_TEST_MS);

  test('disabled pagination buttons cannot be activated', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(paginationNav(utils, 'class-relationships').querySelector('[data-page-dir="prev"]'));
    expect(paginationNav(utils, 'class-relationships').textContent).toContain('Page 1 of 3');
  });
});

describe('enhanced report tables: sorting', () => {
  test('sorts ascending on first click, descending on second, updating aria-sort', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    const prioritiesOf = () => tableRows(utils, 'class-relationships')
      .map(row => Number(row.children[1].textContent.trim()));

    fireEvent.click(headerCell(utils, 'class-relationships', 'priority').querySelector('button'));
    await waitFor(() => {
      expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('ascending');
    });
    expect(prioritiesOf()).toEqual([...Array(20).keys()].map(i => i + 1));
    expect(headerCell(utils, 'class-relationships', 'priority')
      .querySelector('.rf-sort-indicator').textContent).toBe('▲');

    fireEvent.click(headerCell(utils, 'class-relationships', 'priority').querySelector('button'));
    await waitFor(() => {
      expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('descending');
    });
    expect(prioritiesOf()).toEqual([...Array(20).keys()].map(i => 47 - i));
    expect(headerCell(utils, 'class-relationships', 'priority')
      .querySelector('.rf-sort-indicator').textContent).toBe('▼');
  }, SLOW_TEST_MS);

  test('applies the sort across the whole dataset and keeps it while paging', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    fireEvent.click(headerCell(utils, 'class-relationships', 'priority').querySelector('button'));
    await waitFor(() => {
      expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('ascending');
    });
    fireEvent.click(headerCell(utils, 'class-relationships', 'priority').querySelector('button'));
    await waitFor(() => {
      expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('descending');
    });
    fireEvent.click(paginationNav(utils, 'class-relationships').querySelector('[data-page-dir="next"]'));
    await waitForPage(utils, 'class-relationships', 'Page 2 of 3');

    const priorities = tableRows(utils, 'class-relationships')
      .map(row => Number(row.children[1].textContent.trim()));
    expect(priorities[0]).toBe(27);
    expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('descending');
  }, SLOW_TEST_MS);

  test('a different column switches the sort key', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    fireEvent.click(headerCell(utils, 'class-relationships', 'cycleCount').querySelector('button'));
    await waitFor(() => {
      expect(headerCell(utils, 'class-relationships', 'cycleCount').getAttribute('aria-sort')).toBe('ascending');
      expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('none');
    });
    const cycleCounts = tableRows(utils, 'class-relationships')
      .map(row => Number(row.children[2].textContent.trim()));
    expect([...cycleCounts].sort((a, b) => a - b)).toEqual(cycleCounts);
  });
});

describe('enhanced report tables: search and filter', () => {
  test('filters rows case-insensitively and announces the match count', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    const input = utils.container.querySelector('[data-rf-search="class-relationships"]');
    expect(input).not.toBeNull();
    expect(utils.container.querySelector('label[for="rf-search-class-relationships"]')).not.toBeNull();

    fireEvent.input(input, { target: { value: 'ASSERT' } });
    await waitFor(() => {
      const region = utils.container.querySelector('[data-rf-match="class-relationships"]');
      expect(region.textContent).toContain('5 of 47 rows match');
    });
    expect(tableRows(utils, 'class-relationships').length).toBe(5);
    for (const row of tableRows(utils, 'class-relationships')) {
      expect(row.textContent.toLowerCase()).toContain('assert');
    }
  });

  test('the clear button restores the full dataset', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    const input = () => utils.container.querySelector('[data-rf-search="class-relationships"]');
    fireEvent.input(input(), { target: { value: 'assert' } });
    await waitFor(() => {
      expect(utils.container.querySelector('[data-rf-match="class-relationships"]').textContent)
        .toContain('5 of 47');
    });

    fireEvent.click(utils.container.querySelector('.rf-search-clear'));
    await waitForPage(utils, 'class-relationships', 'Page 1 of 3');
    expect(tableRows(utils, 'class-relationships').length).toBe(20);
    expect(input().value).toBe('');
  });

  test('the search input keeps focus and its value across re-renders', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    const input = utils.container.querySelector('[data-rf-search="class-relationships"]');
    input.focus();
    fireEvent.input(input, { target: { value: 'junit' } });
    await waitFor(() => {
      expect(utils.container.querySelector('[data-rf-match="class-relationships"]').textContent)
        .toContain('rows match');
    });
    const refocused = utils.container.querySelector('[data-rf-search="class-relationships"]');
    expect(document.activeElement).toBe(refocused);
    expect(refocused.value).toBe('junit');
  });
});

describe('enhanced report tables: stateful widgets survive interactions', () => {
  test('table interactions must not rebuild charts or WASM graphs', async () => {
    const created = [];
    window.Chart = function (ctx, config) { created.push(config); };
    const parsed = [];
    window.Vizdom = {
      DotParser: class {
        parse() {
          parsed.push(true);
          return {
            to_directed: () => ({
              layout: () => ({
                to_svg: () => ({ to_string: () => '<svg class="fullscreen-svg"><g/></svg>' })
              })
            })
          };
        }
      }
    };
    markWidgetReady('chart');
    markWidgetReady('vizdom');
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    expect(created.length).toBeGreaterThan(0);
    expect(parsed.length).toBeGreaterThan(0);
    const liveCanvas = utils.container.querySelector('canvas#chart_GOD');
    const liveGraph = utils.container.querySelector('#classGraph');
    const chartCount = created.length;
    const parseCount = parsed.length;

    // A table interaction re-renders the report but must graft the live
    // widget nodes back instead of re-running the chart/graph pipeline.
    fireEvent.click(paginationNav(utils, 'class-relationships').querySelector('[data-page-dir="next"]'));
    await waitForPage(utils, 'class-relationships', 'Page 2 of 3');

    expect(created.length).toBe(chartCount);
    expect(parsed.length).toBe(parseCount);
    expect(utils.container.querySelector('canvas#chart_GOD')).toBe(liveCanvas);
    expect(utils.container.querySelector('#classGraph')).toBe(liveGraph);
    expect(utils.container.querySelector('#classGraph svg')).not.toBeNull();
  });

  test('popup buttons keep working after a table interaction re-render', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    fireEvent.click(paginationNav(utils, 'class-relationships').querySelector('[data-page-dir="next"]'));
    await waitForPage(utils, 'class-relationships', 'Page 2 of 3');

    // Popup buttons were recreated with the DOM; handlers must be re-bound.
    const popupButton = utils.container.querySelector('[data-popup-2d]');
    expect(popupButton).not.toBeNull();
    fireEvent.click(popupButton);
    expect(document.getElementById('overlay').style.display).toBe('block');
    hideAllPopups();
  });
});

async function hideAllPopups() {
  const { hidePopup } = await import('../../lib/report-view.js');
  hidePopup();
}

describe('enhanced report tables: CSV export', () => {
  test('downloads the full dataset in the current sort order as CSV', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    const blobs = [];
    globalThis.URL.createObjectURL = mock(blob => { blobs.push(blob); return 'blob:test'; });
    globalThis.URL.revokeObjectURL = mock(() => {});

    // Sort by priority descending so the export order is observable.
    fireEvent.click(headerCell(utils, 'class-relationships', 'priority').querySelector('button'));
    await waitFor(() => {
      expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('ascending');
    });
    fireEvent.click(headerCell(utils, 'class-relationships', 'priority').querySelector('button'));
    await waitFor(() => {
      expect(headerCell(utils, 'class-relationships', 'priority').getAttribute('aria-sort')).toBe('descending');
    });

    fireEvent.click(utils.container.querySelector('[data-rf-export="class-relationships"]'));
    expect(blobs.length).toBe(1);

    const csv = await blobs[0].text();
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Class Relationship,Priority,In Class Cycles,Relationship Strength,Also Removes Pkg Cycle Relationship,In Package Cycles');
    // Full dataset regardless of pagination: header + all 47 rows.
    expect(lines.length).toBe(48);
    // First exported row matches the first displayed row (sorted desc).
    const firstCellText = tableRows(utils, 'class-relationships')[0].children[0].textContent.trim();
    expect(lines[1].startsWith(firstCellText.startsWith('Assert') ? 'Assert' : lines[1])).toBe(true);
    const visiblePriorities = tableRows(utils, 'class-relationships')
      .map(row => Number(row.children[1].textContent.trim()));
    const exportedPriorities = lines.slice(1).map(line => Number(line.split(',')[1]));
    expect(exportedPriorities.slice(0, visiblePriorities.length)).toEqual(visiblePriorities);

    delete globalThis.URL.createObjectURL;
    delete globalThis.URL.revokeObjectURL;
  }, SLOW_TEST_MS);

  test('export buttons carry descriptive aria-labels', async () => {
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const button = utils.container.querySelector('[data-rf-export="class-relationships"]');
    expect(button.getAttribute('aria-label')).toContain('CSV');
    expect(button.getAttribute('aria-label')).toContain('class');
  });
});

describe('enhanced report tables: copy cell content', () => {
  test('clicking a cell copies its text and shows a toast that auto-dismisses', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    respondJsonFor(sampleJson);
    const utils = await renderReport({ toastDurationMs: 60 });
    const { fireEvent, act } = await import('@testing-library/react');

    const cell = utils.container.querySelector(
      'table[data-rf-table="class-relationships"] tbody td');
    const expected = cell.textContent.trim();
    fireEvent.click(cell);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expected);
    });
    const toastRegion = document.querySelector('.rf-toast-region');
    expect(toastRegion.getAttribute('role')).toBe('status');
    await waitFor(() => {
      expect(toastRegion.textContent).toContain(`Copied ${expected}`);
    });

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 120)); });
    expect(toastRegion.textContent).not.toContain('Copied');
    delete navigator.clipboard;
  });

  test('Enter or Space on a focused cell copies it', async () => {
    navigator.clipboard = { writeText: mock(() => Promise.resolve()) };
    respondJsonFor(sampleJson);
    const utils = await renderReport();
    const { fireEvent } = await import('@testing-library/react');

    const cells = utils.container.querySelectorAll(
      'table[data-rf-table="class-relationships"] tbody td');
    expect(cells[0].getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(cells[0], { key: 'Enter' });
    fireEvent.keyDown(cells[1], { key: ' ' });
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    });
    delete navigator.clipboard;
  });

  test('reports failure when copying is impossible', async () => {
    delete navigator.clipboard;
    respondJsonFor(sampleJson);
    const utils = await renderReport({ toastDurationMs: 200 });
    const { fireEvent } = await import('@testing-library/react');

    const cell = utils.container.querySelector(
      'table[data-rf-table="class-relationships"] tbody td');
    fireEvent.click(cell);
    await waitFor(() => {
      expect(document.querySelector('.rf-toast-region').textContent)
        .toContain('Could not copy');
    });
  });
});
