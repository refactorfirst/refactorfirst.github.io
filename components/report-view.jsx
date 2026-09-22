'use client';

// Report page client component. Fetches the bundled Mustache template and
// the repository's refactor-first.json once, then re-renders through
// prepareReportData whenever per-table UI state (page/sort/search) changes.
// lib/table-enhancer.js binds controls in the rendered DOM and reports table
// actions back here; copy feedback surfaces through the toast region.
// Widget scripts are loaded via next/script and report readiness through
// lib/widget-loader.js.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { withBasePath } from '../lib/base-path';
import { detectHostingEnvironment, getPlatformBaseUrl, readMetaTag } from '../lib/host';
import { fetchReport } from '../lib/fetcher';
import { renderTemplate, prepareReportData } from '../lib/renderer';
import {
  enhanceReport,
  bindPopupHandlers,
  stashStatefulDom,
  graftStatefulDom
} from '../lib/report-view';
import { enhanceTables } from '../lib/table-enhancer';
import { renderErrorPage, logError } from '../lib/error-handler';
import { markWidgetReady, waitForWidget } from '../lib/widget-loader';
import ToastRegion, { useToastNotifications } from './toast-notification';
import { TABLE_CONFIG } from '../lib/table-operations';

const CLASSIC_WIDGETS = [
  { name: 'chart', src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js' },
  { name: 'svg-pan-zoom', src: 'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js' },
  { name: 'sigma', src: 'https://cdnjs.cloudflare.com/ajax/libs/sigma.js/2.4.0/sigma.min.js' },
  { name: 'graphology', src: 'https://cdnjs.cloudflare.com/ajax/libs/graphology/0.25.4/graphology.umd.min.js' },
  { name: 'graphlib-dot', src: 'https://cdn.jsdelivr.net/npm/graphlib-dot@0.6.4/dist/graphlib-dot.min.js' },
  { name: '3d-force-graph', src: 'https://cdn.jsdelivr.net/npm/3d-force-graph' }
];

// Module bridges (CSP 'script-src self' — vendored files) report readiness
// themselves via window.__rfMarkWidgetReady.
const BRIDGE_WIDGETS = ['/widgets/vizdom-bridge.js', '/widgets/three-spritetext-bridge.js'];

// Widgets that enhanceReport consumes synchronously; all others degrade
// gracefully at popup-open time.
const ENHANCE_WIDGETS = ['chart', 'vizdom'];

export default function ReportView({
  username,
  repository,
  branch: branchProp,
  environment: environmentProp,
  platformBaseUrl: platformBaseUrlProp,
  widgetSettleMs = 5000,
  toastDurationMs = TABLE_CONFIG.copy.toastDuration
}) {
  const containerRef = useRef(null);
  const searchParams = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [payload, setPayload] = useState(null);
  const [tableStates, setTableStates] = useState({});
  const widgetsSettledRef = useRef(false);
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
  // interactions).
  useEffect(() => {
    const controller = new AbortController();
    const container = containerRef.current;

    async function run() {
      setPayload(null);
      container.innerHTML = '<p class="loading" role="status">Loading report&hellip;</p>';
      try {
        // The bundled template is authoritative — repository-provided
        // templates are untrusted and intentionally never fetched.
        const templateResponse = await fetch(
          withBasePath('/assets/refactor-first-report.mustache'),
          { signal: controller.signal }
        );
        if (!templateResponse.ok) {
          const error = new Error('Report template could not be loaded');
          error.status = 500;
          throw error;
        }
        const template = await templateResponse.text();

        const environment = environmentProp ?? detectHostingEnvironment(window.location.hostname);
        const platformBaseUrl = platformBaseUrlProp ?? getPlatformBaseUrl(readMetaTag);
        const { data, branch: resolvedBranch } = await fetchReport(username, repository, branch, {
          environment,
          baseUrl: platformBaseUrl,
          signal: controller.signal
        });

        if (controller.signal.aborted) return;
        setTableStates({});
        setPayload({ template, data, resolvedBranch });
      } catch (error) {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        logError(error, { route: 'report', username, repository, branch });
        renderErrorPage(container, error, { onRetry: () => setAttempt(a => a + 1) });
      }
    }

    run();
    return () => controller.abort();
  }, [username, repository, branch, environmentProp, platformBaseUrlProp, attempt]);

  // Render effect: re-renders the report whenever the payload arrives or the
  // per-table UI state changes. Widgets only gate the first render. The
  // enhanceReport pipeline (Chart.js charts, WASM DOT layout) runs once per
  // payload; table-state re-renders carry the live stateful nodes over to
  // the fresh DOM and only re-bind the cheap popup/table handlers.
  useEffect(() => {
    if (!payload) return undefined;
    let cancelled = false;
    const container = containerRef.current;

    async function run() {
      try {
        if (!widgetsSettledRef.current) {
          // Give the widgets that enhanceReport uses synchronously a moment
          // to arrive; everything else degrades gracefully when missing.
          await Promise.race([
            Promise.all(ENHANCE_WIDGETS.map(name => waitForWidget(name, { timeoutMs: widgetSettleMs }))),
            new Promise(resolve => setTimeout(resolve, widgetSettleMs))
          ]);
          widgetsSettledRef.current = true;
        }
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
          await enhanceReport(container, payload.data);
          lastEnhancedPayloadRef.current = payload;
        } else {
          graftStatefulDom(container, stash);
          // Popup buttons are fresh nodes after every re-render; binding
          // them is cheap (unlike charts/graph layout, which the graft saved).
          bindPopupHandlers(container);
        }
        enhanceTables(container, {
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
    return () => { cancelled = true; };
  }, [payload, tableStates, widgetSettleMs, username, repository, branch, handleTableAction, handleCopy]);

  return (
    <>
      <div ref={containerRef} id="report-container" />
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
