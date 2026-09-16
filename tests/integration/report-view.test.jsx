// Phase 5: <ReportView> client component — ports the report-rendering
// integration suite to the React report page, plus client-only behaviors
// (widget gating, retry, ?branch= deep links, template/auth failures).
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

let currentSearch = '';
mock.module('next/navigation', () => ({
  usePathname: () => '/junit-team/junit4',
  useRouter: () => ({ push: () => {} }),
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

describe('ReportView', () => {
  beforeEach(() => {
    currentSearch = '';
    resetWidgetRegistry();
    window.Vizdom = undefined;
    delete window.showPopup;
    delete window.hidePopup;
    delete window.createForceGraph;
    delete window.classGraph_dot;
    delete window.packageGraph_dot;
    mockFetch = spyOn(global, 'fetch');
  });
  afterEach(() => {
    mockFetch.mockRestore();
    cleanup();
    window.Vizdom = undefined;
    window.Chart = undefined;
  });

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
