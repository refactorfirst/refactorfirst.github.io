'use client';

// Report page client component. Fetches the bundled Mustache template and
// the repository's refactor-first.json once (in parallel), then re-renders
// through prepareReportData whenever per-table UI state (page/sort/search)
// changes. lib/table-enhancer.js binds controls in the rendered DOM and
// reports table actions back here; copy feedback surfaces through the toast
// region. Widget scripts load via next/script and report readiness through
// lib/widget-loader.js — the report markup renders as soon as the data
// arrives and never waits on them; charts and WASM graphs enhance the page
// when (and only when) their widget becomes ready.
//
// The initial loading placeholder lives inside #report-container in this
// component's JSX and in the report page shells' Suspense fallback, and
// app/globals.css reserves most of the viewport for the container, so the
// report's late arrival grows the page below the fold instead of shoving
// the footer (and CLS) down the screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { withBasePath } from '../lib/base-path';
import { detectHostingEnvironment, getPlatformBaseUrl, readMetaTag } from '../lib/host';
import { fetchReport } from '../lib/fetcher';
import { announceResolvedBranch } from '../lib/breadcrumbs.js';
import { renderTemplate, prepareReportData } from '../lib/renderer';
import {
  enhanceReport,
  initDisharmonyCharts,
  initWasmGraphs,
  bindPopupHandlers,
  stashStatefulDom,
  graftStatefulDom,
  destroyBubbleCharts
} from '../lib/report-view';
import { enhanceTables } from '../lib/table-enhancer';
import { renderErrorPage, logError } from '../lib/error-handler';
import { isWidgetReady, markWidgetReady, onWidgetReady } from '../lib/widget-loader';
import ToastRegion, { useToastNotifications } from './toast-notification';
import { TABLE_CONFIG } from '../lib/table-operations';

const CLASSIC_WIDGETS = [
  { name: 'chart', src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js' },
  { name: 'svg-pan-zoom', src: 'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js' },
  { name: 'sigma', src: 'https://cdnjs.cloudflare.com/ajax/libs/sigma.js/2.4.0/sigma.min.js' },
  { name: 'graphology', src: 'https://cdnjs.cloudflare.com/ajax/libs/graphology/0.25.4/graphology.umd.min.js' },
  { name: 'graphlib-dot', src: 'https://cdn.jsdelivr.net/npm/graphlib-dot@0.6.4/dist/graphlib-dot.min.js' }
];

// Module bridges (CSP 'script-src self' — vendored files) report readiness
// themselves via window.__rfMarkWidgetReady. The force-graph bridge loads
// the 3D graph and its sprite labels as ES modules pinned to one shared
// three build (the UMD used to ship a second, bundled three).
const BRIDGE_WIDGETS = ['/widgets/vizdom-bridge.js', '/widgets/force-graph-bridge.js'];

/**
 * Fetches and renders a repository report with interactive table controls.
 *
 * @param {object} props - Report location and optional runtime overrides.
 * @returns {import('react').ReactElement} The report container and widget scripts.
 */
export default function ReportView({
  username,
  repository,
  branch: branchProp,
  environment: environmentProp,
  platformBaseUrl: platformBaseUrlProp,
  toastDurationMs = TABLE_CONFIG.copy.toastDuration,
  // Test seams (bun's mock.module leaks across test files, so lifecycle
  // tests inject Deferred/spying implementations instead of module mocks).
  enhanceReportImpl = enhanceReport,
  enhanceTablesImpl = enhanceTables
}) {
  const containerRef = useRef(null);
  const searchParams = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [payload, setPayload] = useState(null);
  const [tableStates, setTableStates] = useState({});
  const pendingFocusRef = useRef(null);
  // The last payload that went through the full (expensive) enhanceReport
  // pipeline; table-state-only re-renders skip it and graft the live chart
  // canvases / graph SVGs into the fresh DOM instead.
  const lastEnhancedPayloadRef = useRef(null);
  const { toasts, show: showToast, dismiss: dismissToast } = useToastNotifications({
    duration: toastDurationMs
  });

  const branch = branchProp || searchParams.get('branch') || undefined;

  const handleTableAction = useCallback((tableId, patch, meta) => {
    if (meta?.restoreFocus) {
      pendingFocusRef.current = { tableId };
    }
    setTableStates(current => ({
      ...current,
      [tableId]: { ...current[tableId], ...patch }
    }));
  }, []);

  const handleCopy = useCallback((ok, text) => {
    showToast(ok ? `Copied ${text}` : 'Could not copy this cell to the clipboard');
  }, [showToast]);

  // Fetch the template + report JSON once per report (no refetch on table
  // interactions). Both requests start together — the cross-origin report
  // JSON is the slow one and must not queue behind the same-origin template.
  useEffect(() => {
    const controller = new AbortController();
    const container = containerRef.current;

    // Every fetch cycle replaces the report markup — loading placeholder,
    // then the fresh render — so release the previous cycle's Chart.js
    // instances before any of that happens; the chart widgets rebuild them
    // for the new canvases once the payload renders.
    destroyBubbleCharts();

    /** Fetches the trusted template and the selected repository report. */
    async function run() {
      setPayload(null);
      container.innerHTML = '<p class="loading" role="status">Loading report&hellip;</p>';
      try {
        // The bundled template is authoritative — repository-provided
        // templates are untrusted and intentionally never fetched.
        const templatePromise = fetch(
          withBasePath('/assets/refactor-first-report.mustache'),
          { signal: controller.signal }
        ).then(response => {
          if (!response.ok) {
            const error = new Error('Report template could not be loaded');
            error.status = 500;
            throw error;
          }
          return response.text();
        });

        const environment = environmentProp ?? detectHostingEnvironment(window.location.hostname);
        const platformBaseUrl = platformBaseUrlProp ?? getPlatformBaseUrl(readMetaTag);
        const [template, report] = await Promise.all([
          templatePromise,
          fetchReport(username, repository, branch, {
            environment,
            baseUrl: platformBaseUrl,
            signal: controller.signal
          })
        ]);

        if (controller.signal.aborted) return;
        // Tell the breadcrumb trail which branch actually loaded (a main
        // 404 falls back to master) so its label matches the report shown.
        announceResolvedBranch(window, { username, repository, branch: report.branch });
        setTableStates({});
        setPayload({ template, data: report.data, resolvedBranch: report.branch });
      } catch (error) {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        logError(error, { route: 'report', username, repository, branch });
        renderErrorPage(container, error, { onRetry: () => setAttempt(a => a + 1) });
      }
    }

    run();
    return () => {
      controller.abort();
      // Unmounting (or a dependency change) throws the report's canvases
      // away with the markup; release their charts alongside the aborted
      // request instead of leaking live instances on dead canvases.
      destroyBubbleCharts();
    };
  }, [username, repository, branch, environmentProp, platformBaseUrlProp, attempt]);

  // Render effect: re-renders the report whenever the payload arrives or the
  // per-table UI state changes. The markup never waits on widgets: ones that
  // are ready enhance synchronously inside enhanceReport, and ones that are
  // still loading enhance through the widget-readiness effect below. The
  // enhanceReport pipeline (Chart.js charts, WASM DOT layout) runs once per
  // payload; table-state re-renders carry the live stateful nodes over to
  // the fresh DOM and only re-bind the cheap popup/table handlers.
  useEffect(() => {
    if (!payload) return undefined;
    let cancelled = false;
    const container = containerRef.current;

    /** Renders the current table state and restores stateful report widgets. */
    async function run() {
      try {
        if (cancelled) return;

        const payloadChanged = lastEnhancedPayloadRef.current !== payload;
        // Stash live chart canvases and rendered graphs before the innerHTML
        // swap throws the old DOM away (no-op on first render — there is
        // nothing stateful in the loading placeholder).
        const stash = payloadChanged ? null : stashStatefulDom(container, payload.data);

        container.innerHTML = renderTemplate(
          payload.template,
          prepareReportData(payload.data, tableStates)
        );
        container.dataset.resolvedBranch = payload.resolvedBranch;

        if (payloadChanged) {
          // Widgets that are already ready enhance now; the still-loading
          // ones are deferred (and skipped here) so a slow CDN script or the
          // multi-megabyte vizdom wasm can never hold back the render.
          await enhanceReportImpl(container, payload.data, {
            charts: isWidgetReady('chart'),
            graphs: isWidgetReady('vizdom')
          });
          if (cancelled) return;
          lastEnhancedPayloadRef.current = payload;
        } else {
          graftStatefulDom(container, stash);
          // Popup buttons are fresh nodes after every re-render; binding
          // them is cheap (unlike charts/graph layout, which the graft saved).
          bindPopupHandlers(container);
        }
        enhanceTablesImpl(container, {
          data: payload.data,
          tableStates,
          onTableAction: handleTableAction,
          onCopy: handleCopy
        });

        // Type-to-filter re-renders the input; restore focus + caret so the
        // user can keep typing.
        const pendingFocus = pendingFocusRef.current;
        if (pendingFocus) {
          pendingFocusRef.current = null;
          const input = container.querySelector(
            `input[data-rf-search="${pendingFocus.tableId}"]`);
          if (input) {
            input.focus();
            const end = input.value.length;
            if (typeof input.setSelectionRange === 'function') {
              input.setSelectionRange(end, end);
            }
          }
        }
      } catch (error) {
        if (cancelled) return;
        logError(error, { route: 'report', username, repository, branch });
        renderErrorPage(container, error, { onRetry: () => setAttempt(a => a + 1) });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [payload, tableStates, username, repository, branch,
    handleTableAction, handleCopy, enhanceReportImpl, enhanceTablesImpl]);

  // Widget-readiness effect: keys on the payload only (not the table UI
  // state), so a registration survives table re-renders and is retired
  // exactly when the payload changes or the component unmounts. Widgets
  // already covered by the synchronous enhanceReport call above are not
  // registered again.
  useEffect(() => {
    if (!payload) return undefined;
    let cancelled = false;

    /**
     * Runs the enhancement once the named widget reports ready.
     *
     * @param {string} name - Widget name in the readiness registry.
     * @param {Function} enhance - Enhancement bound to the current payload.
     * @returns {void}
     */
    const whenReady = (name, enhance) => {
      if (isWidgetReady(name)) return;
      onWidgetReady(name, () => {
        if (cancelled) return;
        try {
          enhance();
        } catch (error) {
          console.warn(`report ${name} enhancement failed:`, error); // eslint-disable-line no-console
        }
      });
    };

    whenReady('chart', () => initDisharmonyCharts(
      payload.data.disharmonies,
      payload.data.project && payload.data.project.repoUrl
    ));
    whenReady('vizdom', () => {
      initWasmGraphs(payload.data);
    });

    return () => {
      cancelled = true;
    };
  }, [payload, username, repository, branch]);

  return (
    <>
      <div ref={containerRef} id="report-container">
        <p className="loading" role="status">Loading report&hellip;</p>
      </div>
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
      {CLASSIC_WIDGETS.map(widget => (
        <Script
          key={widget.name}
          src={widget.src}
          strategy="lazyOnload"
          onLoad={() => markWidgetReady(widget.name)}
        />
      ))}
      {BRIDGE_WIDGETS.map(src => (
        <Script key={src} type="module" src={withBasePath(src)} strategy="lazyOnload" />
      ))}
    </>
  );
}
