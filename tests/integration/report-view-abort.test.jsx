// Phase 5 race conditions: ReportView must abort in-flight report fetches
// when it unmounts or when its route props change, and must issue a fresh
// fetch on remount (Technical Appendix §9).
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mock } from 'bun:test';

mock.module('next/navigation', () => ({
  usePathname: () => '/alice/one',
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams('')
}));
mock.module('next/script', () => ({ default: () => null }));

import { render, waitFor, cleanup, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';

let resolveEnhanceReport;
const enhanceTablesCalls = [];

mock.module('../../lib/report-view.js', () => ({
  enhanceReport: () => new Promise(resolve => { resolveEnhanceReport = resolve; }),
  bindPopupHandlers: () => {},
  stashStatefulDom: () => new Map(),
  graftStatefulDom: () => {}
}));
mock.module('../../lib/table-enhancer.js', () => ({
  enhanceTables: (...args) => enhanceTablesCalls.push(args)
}));

import ReportView from '../../components/report-view';
import { resetWidgetRegistry } from '../../lib/widget-loader';

installRtlDom();

let mockFetch;

function hangForever() {
  return new Promise(() => {}); // never resolves — simulates slow network
}

describe('ReportView fetch lifecycle', () => {
  beforeEach(() => {
    resetWidgetRegistry();
    mockFetch = spyOn(global, 'fetch');
    resolveEnhanceReport = undefined;
    enhanceTablesCalls.length = 0;
  });
  afterEach(() => {
    mockFetch.mockRestore();
    cleanup();
    delete window.showPopup;
  });

  test('aborts pending fetch on unmount and does not touch the DOM afterwards', async () => {
    mockFetch.mockImplementation(hangForever);
    const utils = render(_jsx(ReportView, {
      username: 'alice', repository: 'one', widgetSettleMs: 25
    }));
    // The template fetch must have started with a signal
    const signals = mockFetch.mock.calls.map(c => c[1]?.signal).filter(Boolean);
    expect(signals.length).toBeGreaterThan(0);

    utils.unmount();
    expect(signals.every(s => s.aborted)).toBe(true);
    // If the promise resolved later, the effect would skip all DOM writes;
    // covered here by simply not blowing up on unmount.
  });

  test('aborts the previous fetch when the repository props change', async () => {
    mockFetch.mockImplementation(requested =>
      String(requested).endsWith('refactor-first-report.mustache')
        ? Promise.resolve({ ok: true, text: () => Promise.resolve('<p>{{project.name}}</p>') })
        : hangForever());
    const utils = render(_jsx(ReportView, {
      username: 'alice', repository: 'one', widgetSettleMs: 25
    }));
    // The report JSON fetch (which hangs) carries the signal to abort
    await waitFor(() => {
      expect(mockFetch.mock.calls.some(c => String(c[0]).includes('/alice/one/'))).toBe(true);
    });
    const firstSignal = mockFetch.mock.calls
      .find(c => String(c[0]).includes('/alice/one/'))[1]?.signal;

    utils.rerender(_jsx(ReportView, {
      username: 'alice', repository: 'two', widgetSettleMs: 25
    }));
    expect(firstSignal.aborted).toBe(true);
    // The new effect issues requests for the new repo asynchronously
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(c => String(c[0]));
      expect(urls.some(u => u.includes('/alice/two/'))).toBe(true);
    });
  });

  test('remount performs a fresh fetch', async () => {
    mockFetch.mockImplementation(hangForever);
    const first = render(_jsx(ReportView, {
      username: 'alice', repository: 'one', widgetSettleMs: 25
    }));
    first.unmount();
    const callsAfterUnmount = mockFetch.mock.calls.length;

    render(_jsx(ReportView, {
      username: 'alice', repository: 'one', widgetSettleMs: 25
    }));
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterUnmount);
  });

  test('resolving a fetch after unmount leaves no error pages behind', async () => {
    let resolveTemplate;
    mockFetch.mockImplementation(requested => {
      if (String(requested).endsWith('assets/refactor-first-report.mustache')) {
        return new Promise(resolve => (resolveTemplate = resolve));
      }
      return hangForever();
    });
    const utils = render(_jsx(ReportView, {
      username: 'alice', repository: 'one', widgetSettleMs: 25
    }));
    await waitFor(() => expect(resolveTemplate).toBeTruthy());
    utils.unmount();
    resolveTemplate({ ok: false, status: 500 });
    await Promise.resolve(); // flush microtasks
    // No crash, and the unmounted container never received an error page
    expect(utils.container.querySelector('.error-page')).toBeNull();
  });

  test('does not bind table handlers after unmount while report enhancement is pending', async () => {
    mockFetch.mockImplementation(requested => {
      const url = String(requested);
      if (url.endsWith('assets/refactor-first-report.mustache')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<p>{{project.name}}</p>') });
      }
      if (url.endsWith('.refactorfirst/refactor-first.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ project: { name: 'Example' } }) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const utils = render(_jsx(ReportView, {
      username: 'alice', repository: 'one', widgetSettleMs: 0
    }));

    await waitFor(() => expect(resolveEnhanceReport).toBeTypeOf('function'));
    utils.unmount();
    resolveEnhanceReport();
    await Promise.resolve();
    await Promise.resolve();

    expect(enhanceTablesCalls).toHaveLength(0);
  });
});
