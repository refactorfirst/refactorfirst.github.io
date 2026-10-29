// Report rendering-library warm-up (components/report-warmup.jsx): directory
// pages (landing, user listing) warm the shared report rendering libraries
// during idle time so the first report a visitor opens renders with them
// already in local caches — the vizdom wasm lands in Cache Storage through
// the shared bridge module, the classic CDN widget scripts and the bundled
// template land in the HTTP cache. Report DATA is never warmed (listings
// can hold thousands of repositories; the one a visitor opens is unknowable
// in advance), nothing runs before the page has loaded and the main thread
// is idle, and every step is fire-and-forget (a cold cache is the status
// quo).
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';

import { render, cleanup, installRtlDom, waitFor } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import ReportWarmup from '../../components/report-warmup';
import { isWidgetReady, resetWidgetRegistry } from '../../lib/widget-loader';

installRtlDom();

/** Extracts the requested URL from every recorded fetch call. */
function fetchedUrls(spy) {
  return spy.mock.calls.map(call => String(call[0]));
}

describe('ReportWarmup', () => {
  let mockFetch;
  let idleCallbacks;

  beforeEach(() => {
    // jsdom has no requestIdleCallback; capture registrations so tests fire
    // idle deterministically. The real scheduling paths (load + idle, the
    // setTimeout fallback) are covered by the e2e warm-up tests.
    idleCallbacks = [];
    window.requestIdleCallback = (callback, options) => {
      idleCallbacks.push({ callback, options });
      return idleCallbacks.length;
    };
    window.cancelIdleCallback = () => {};
    mockFetch = spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve({ ok: true }));
  });
  afterEach(() => {
    mockFetch.mockRestore();
    cleanup();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
  });

  test('renders nothing', () => {
    render(_jsx(ReportWarmup, {}));
    expect(document.body.textContent).toBe('');
  });

  test('does nothing before the main thread reports idle', () => {
    render(_jsx(ReportWarmup, {}));
    expect(idleCallbacks.length).toBe(1); // scheduled (readyState complete)
    expect(mockFetch.mock.calls.length).toBe(0);
    expect(document.querySelector('script[type="module"]')).toBeNull();
  });

  test('registers the idle callback without a forced timeout', () => {
    render(_jsx(ReportWarmup, {}));
    expect(idleCallbacks).toHaveLength(1);
    // The warm must run only during idle time: the callback is registered
    // without a forced timeout so the browser fires it strictly at an idle
    // opportunity instead of on a timer while the page may still be busy.
    expect(idleCallbacks[0].options).toBeUndefined();
  });

  test('warms the rendering libraries once idle fires', () => {
    render(_jsx(ReportWarmup, {}));
    idleCallbacks.forEach(entry => entry.callback());

    // The shared vizdom bridge module runs and fills Cache Storage with the
    // wasm binary; the report page's own bridge import then resolves it
    // locally instead of downloading ~4.8MB again.
    const bridge = document.querySelector('script[type="module"]');
    expect(bridge?.getAttribute('src')).toBe('/widgets/vizdom-bridge.js');

    const urls = fetchedUrls(mockFetch);
    // Classic widget scripts warm with no-cors so the later <script src>
    // requests reuse the cached entries.
    const expected = [
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
      'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js'
    ];
    expected.forEach(url => {
      const call = mockFetch.mock.calls.find(c => String(c[0]) === url);
      expect(call).toBeDefined();
      expect(call[1]).toEqual({ mode: 'no-cors' });
    });
    // The bundled report template.
    expect(urls).toContain('/assets/refactor-first-report.mustache');
  });

  test('unmount removes the bridge script the warm appended', () => {
    const utils = render(_jsx(ReportWarmup, {}));
    idleCallbacks.forEach(entry => entry.callback());
    expect(document.querySelector('script[type="module"]')).not.toBeNull();
    // The bridge script is appended straight to <body> (outside React's
    // knowledge); unmount — the cleanup the suite runs after each test —
    // must drop it again.
    utils.unmount();
    expect(document.querySelector('script[type="module"]')).toBeNull();
  });

  test('never fetches report data, however many repositories are listed', () => {
    render(_jsx(ReportWarmup, {}));
    idleCallbacks.forEach(entry => entry.callback());
    const urls = fetchedUrls(mockFetch);
    expect(urls.filter(url => url.includes('refactor-first.json'))).toEqual([]);
    expect(urls.filter(url => url.includes('raw.githubusercontent.com'))).toEqual([]);
    // Only the rendering libraries: two widget scripts + the template.
    expect(urls.length).toBe(3);
  });

  test('does not inject a second bridge module when one is already present', () => {
    const existing = document.createElement('script');
    existing.type = 'module';
    existing.src = '/widgets/vizdom-bridge.js';
    document.body.appendChild(existing);

    render(_jsx(ReportWarmup, {}));
    idleCallbacks.forEach(entry => entry.callback());
    expect(document.querySelectorAll('script[type="module"]').length).toBe(1);
    // The pre-existing script is fixture DOM appended by hand (outside
    // React's knowledge) — tear it down here rather than relying on the
    // suite-level cleanup so it cannot leak into later tests.
    existing.remove();
  });

  test('a rejected warm fetch never surfaces an error', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('offline')));
    render(_jsx(ReportWarmup, {}));
    idleCallbacks.forEach(entry => entry.callback());
    // Let the rejections settle: any unhandled rejection fails the suite.
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
  });

  test('falls back to setTimeout when requestIdleCallback is unavailable', async () => {
    delete window.requestIdleCallback;
    render(_jsx(ReportWarmup, { fallbackDelayMs: 0 }));
    await waitFor(() => {
      expect(fetchedUrls(mockFetch)).toContain('/assets/refactor-first-report.mustache');
    });
    expect(document.querySelector('script[type="module"]')?.getAttribute('src'))
      .toBe('/widgets/vizdom-bridge.js');
  });

  test('a quickly unmounted page never warms anything', () => {
    delete window.requestIdleCallback;
    const utils = render(_jsx(ReportWarmup, { fallbackDelayMs: 500 }));
    utils.unmount();
    expect(mockFetch.mock.calls.length).toBe(0);
    expect(document.querySelector('script[type="module"]')).toBeNull();
  });

  test('window.__rfMarkWidgetReady marks the widget ready in the shared registry', () => {
    // Directly mark vizdom through the global bridge and check that
    // isWidgetReady observes the mark in the shared registry.
    resetWidgetRegistry();
    window.__rfMarkWidgetReady('vizdom');
    expect(isWidgetReady('vizdom')).toBe(true);
  });
});
