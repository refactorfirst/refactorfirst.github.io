'use client';

// Report rendering-library warm-up for directory pages (landing, user
// listing). Renders nothing; once the page has fully loaded AND the main
// thread is idle, it warms the shared rendering libraries the first report
// a visitor opens needs, so the report renders with them already in local
// caches:
//
// - vizdom wasm (~4.8MB): the shared bridge module is injected exactly the
//   way the report page injects it, so the binary is fetched once and stored
//   in the bridge's versioned Cache Storage entry — the report page's own
//   bridge import then resolves it locally with zero network.
// - Chart.js + svg-pan-zoom: fetched no-cors into the HTTP cache; the
//   report page's classic <script src> requests then hit the cache (the CDN
//   serves both immutable), matching the later request mode exactly.
// - The bundled report template: a same-origin fetch into the HTTP cache.
//
// Report DATA is deliberately never warmed: listings can hold thousands of
// repositories and the one a visitor opens is unknowable in advance — only
// the shared rendering pipeline is warmed. Every step is fire-and-forget
// and fails silently (a cold cache is just the status quo), and nothing
// ever delays the hosting page's own rendering (load + idle scheduling).
// Popup-only widgets (sigma, graphology, graphlib-dot, the 3D force graph)
// also stay cold by design: they load lazily on the report page and are
// needed only on demand.

import { useEffect, useRef } from 'react';
import { withBasePath } from '../lib/base-path';
// The idle warm-up loads the vizdom bridge module on directory pages; this
// module installs the widget-readiness bridge the bridge reports through, so
// a mark fired while warming reaches the registry a later client-side-navigated
// report reads from (the module map keeps the already-evaluated bridge module
// from re-running on the report page).
import '../lib/widget-loader';

const WIDGET_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js'
];

/** Fire-and-forget fetch: warming is best-effort, failures are fine. */
function warmFetch(url, options) {
  fetch(url, options).catch(() => {});
}

/**
 * Warms the report rendering libraries until a directory page visitor
 * opens a report.
 *
 * @param {object} props - Warm-up configuration.
 * @param {number} [props.fallbackDelayMs=1500] - Test seam: delay before the
 *   warm when requestIdleCallback is unavailable.
 * @returns {null} Nothing is rendered.
 */
export default function ReportWarmup({ fallbackDelayMs = 1500 }) {
  const warmedRef = useRef(false);

  useEffect(() => {
    // The warm runs once per mount (warmedRef); re-renders are no-ops.
    if (warmedRef.current) return undefined;
    let cancelled = false;
    let cancelIdle = () => {};
    let bridgeScript = null;

    /** Runs each warm step exactly once, best-effort. */
    const warm = () => {
      if (cancelled || warmedRef.current) return;
      warmedRef.current = true;

      // 1. vizdom wasm through the shared bridge module: same file, same
      //    versioned Cache Storage entry as the report page uses.
      const bridgeSrc = withBasePath('/widgets/vizdom-bridge.js');
      const alreadyInjected = [...document.querySelectorAll('script[type="module"]')]
        .some(script => (script.getAttribute('src') || script.src || '')
          .endsWith('/widgets/vizdom-bridge.js'));
      if (!alreadyInjected) {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = bridgeSrc;
        document.body.appendChild(script);
        bridgeScript = script;
      }

      // 2. Classic widget scripts into the HTTP cache (no-cors matches the
      //    report page's classic <script src> requests).
      WIDGET_SCRIPTS.forEach(src => warmFetch(src, { mode: 'no-cors' }));

      // 3. The bundled report template.
      warmFetch(withBasePath('/assets/refactor-first-report.mustache'));
    };

    /**
     * Schedules the warm at the first idle moment after the page loads. The
     * idle callback is registered without a forced timeout, so the browser
     * fires it strictly at an idle opportunity rather than on a timer while
     * the page may still be busy; engines without requestIdleCallback wait
     * out an idle window (the fallback delay) before the warm starts.
     */
    const scheduleAtIdle = () => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(warm);
        cancelIdle = () => window.cancelIdleCallback?.(handle);
      } else {
        const timer = setTimeout(warm, fallbackDelayMs);
        cancelIdle = () => clearTimeout(timer);
      }
    };

    if (document.readyState === 'complete') {
      scheduleAtIdle();
    } else {
      window.addEventListener('load', scheduleAtIdle, { once: true });
    }
    return () => {
      cancelled = true;
      window.removeEventListener('load', scheduleAtIdle);
      cancelIdle();
      // The bridge script is appended straight to <body> (outside React's
      // knowledge); drop it again on unmount so a navigating-away page leaves
      // no script behind.
      if (bridgeScript) bridgeScript.remove();
    };
  }, [fallbackDelayMs]);

  return null;
}
