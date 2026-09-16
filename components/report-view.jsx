'use client';

// Report page client component. Fetches the bundled Mustache template and
// the repository's refactor-first.json, renders into a ref'd container and
// enhances the result with the CDN widgets (Chart.js bubbles, vizdom WASM
// inline graphs, sigma/3D popups). Widget scripts are loaded via next/script
// and report readiness through lib/widget-loader.js.

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { withBasePath } from '../lib/base-path';
import { detectHostingEnvironment, getPlatformBaseUrl, readMetaTag } from '../lib/host';
import { fetchReport } from '../lib/fetcher';
import { renderTemplate } from '../lib/renderer';
import { enhanceReport } from '../lib/report-view';
import { renderErrorPage, logError } from '../lib/error-handler';
import { markWidgetReady, waitForWidget } from '../lib/widget-loader';

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
  widgetSettleMs = 5000
}) {
  const containerRef = useRef(null);
  const searchParams = useSearchParams();
  const [attempt, setAttempt] = useState(0);

  const branch = branchProp || searchParams.get('branch') || undefined;

  useEffect(() => {
    const controller = new AbortController();
    const container = containerRef.current;

    async function run() {
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

        // Give the widgets that enhanceReport uses synchronously a moment to
        // arrive; everything else degrades gracefully when missing.
        await Promise.race([
          Promise.all(ENHANCE_WIDGETS.map(name => waitForWidget(name, { timeoutMs: widgetSettleMs }))),
          new Promise(resolve => setTimeout(resolve, widgetSettleMs))
        ]);
        if (controller.signal.aborted) return;

        container.innerHTML = renderTemplate(template, data);
        container.dataset.resolvedBranch = resolvedBranch;
        await enhanceReport(container, data);
      } catch (error) {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        logError(error, { route: 'report', username, repository, branch });
        renderErrorPage(container, error, { onRetry: () => setAttempt(a => a + 1) });
      }
    }

    run();
    return () => controller.abort();
  }, [username, repository, branch, environmentProp, platformBaseUrlProp, widgetSettleMs, attempt]);

  return (
    <>
      <div ref={containerRef} id="report-container" />
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
