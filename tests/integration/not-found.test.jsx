// Phase 4/5: not-found page — 404 copy, redeploy-latency note for freshly
// submitted repos, and in-place rendering of branch deep links (Technical
// Appendix §5/§6). Branch paths with no pre-generated HTML land on the
// exported 404.html; ReportView renders the requested branch client-side
// at the original URL (no redirect). Pathname and fetch are injected via
// mocks.
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import { sharedNextNavigationMock } from './next-navigation-stub';

let currentPath = '/';
mock.module('next/navigation', () => sharedNextNavigationMock({
  usePathname: () => currentPath
}));
mock.module('next/script', () => ({
  default: () => null // widget scripts are marked manually in tests
}));

import { render, waitFor, cleanup, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import NotFound from '../../app/not-found';
import { markWidgetReady, resetWidgetRegistry } from '../../lib/widget-loader';

installRtlDom();

const reportTemplate = fs.readFileSync(
  path.join(import.meta.dir, '../../assets/refactor-first-report.mustache'), 'utf8'
);

const sampleJson = JSON.parse(
  fs.readFileSync(path.join(import.meta.dir, '../fixtures/junit4-report.json'), 'utf8')
);

let mockFetch;

function serveReportFor(rawUrlPredicate) {
  mockFetch.mockImplementation(requested => {
    const url = String(requested);
    if (url.endsWith('/assets/refactor-first-report.mustache')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(reportTemplate) });
    }
    if (url.endsWith('.refactorfirst/refactor-first.json')) {
      return rawUrlPredicate(url)
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(sampleJson) })
        : Promise.resolve({ ok: false, status: 404 });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

function render404(pathname) {
  currentPath = pathname;
  return render(_jsx(NotFound, {}));
}

beforeEach(() => {
  resetWidgetRegistry();
  // ReportView gates its first render on the enhance widgets; mark them
  // ready so the in-place report renders immediately.
  markWidgetReady('chart');
  markWidgetReady('vizdom');
  mockFetch = spyOn(global, 'fetch');
});
afterEach(() => {
  mockFetch.mockRestore();
  cleanup();
});

describe('not-found page', () => {
  test('renders the 404 copy and links home / to getting started', () => {
    const { container } = render404('/totally-not-a-page');
    expect(container.textContent).toContain('Page Not Found');
    expect(container.textContent).toContain('.refactorfirst/refactor-first.json');
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
    expect(container.querySelector('a[href="/getting-started"]')).toBeTruthy();
  });

  test('renders unlisted branch deep links (/user/repo/branch) in place, keeping the URL-relevant branch', async () => {
    const requested = [];
    serveReportFor(url => {
      const hit = url.includes('/refs/heads/develop/.refactorfirst/');
      requested.push({ url, hit });
      return hit;
    });

    const { container } = render404('/alice/some-repo/develop');
    await waitFor(() => {
      expect(container.querySelector('h1').textContent).toContain('RefactorFirst Report');
    });

    const rawRequests = requested.filter(r => !r.url.includes('/assets/'));
    expect(rawRequests.length).toBeGreaterThan(0);
    expect(rawRequests.every(r => r.url.includes('/alice/some-repo/refs/heads/develop/'))).toBe(true);
    // The 404 copy must not co-render with the report.
    expect(container.textContent).not.toContain('Page Not Found');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  test('preserves branch names that contain slashes', async () => {
    const requested = [];
    serveReportFor(url => {
      const hit = url.includes('/refs/heads/feature/login/.refactorfirst/');
      requested.push(url);
      return hit;
    });

    const { container } = render404('/alice/some-repo/feature/login');
    await waitFor(() => {
      expect(container.querySelector('h1').textContent).toContain('RefactorFirst Report');
    });
    expect(requested.some(u => u.includes('/alice/some-repo/refs/heads/feature/login/'))).toBe(true);
  });

  test('sets the report document title to match the pre-generated branch pages', async () => {
    serveReportFor(url => url.includes('/refs/heads/develop/.refactorfirst/'));
    render404('/alice/some-repo/develop');
    await waitFor(() => {
      expect(document.title).toBe('alice/some-repo@develop - RefactorFirst');
    });
  });

  test('rejects path-injection branch segments instead of rendering a report', () => {
    const { container } = render404('/alice/some-repo/../evil');
    expect(container.textContent).toContain('Page Not Found');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('does not render a report for static-page-like first segments', () => {
    const { container } = render404('/faq/anything');
    expect(container.textContent).toContain('Page Not Found');
    expect(container.querySelector('h1').textContent).toBe('Page Not Found');
  });

  test('shows a redeploy-latency note for two-segment repo paths', () => {
    const { container } = render404('/alice/recently-added-repo');
    expect(container.textContent).toContain('recently added');
    expect(container.textContent).toContain('Page Not Found');
  });
});
