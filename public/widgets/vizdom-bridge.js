// Bridge: loads the vendored vizdom WASM module (static file, allowed by
// script-src 'self' + 'wasm-unsafe-eval') and exposes it as window.Vizdom.
// The wasm binary (vizdom_ts_bg.wasm) resolves via import.meta.url relative
// to this directory, and is served through the Cache Storage API: the
// binary is ~4.8MB and static hosts cache it only briefly (GitHub Pages
// sends max-age=600; DevTools' disabled HTTP cache bypasses those headers
// entirely), so repeat visits read it from the cache instead of
// re-downloading it over the network. The report render never waits on
// this bridge — ReportView enhances the graphs once 'vizdom' is reported
// ready. The cache name carries the vendored version: bump it together
// with vizdom_ts.min.js/vizdom_ts_bg.wasm so a stale cached binary can
// never pair with a fresh JS glue module.
const WASM_CACHE = 'vizdom-wasm-0.1.19';
const WASM_URL = new URL('vizdom_ts_bg.wasm', import.meta.url);

/**
 * Resolves the wasm binary from Cache Storage, fetching and caching it on
 * the first visit. Cache Storage being unavailable (private browsing,
 * quota) falls back to a plain network fetch; cache fills run in the
 * background and never delay initialization.
 *
 * @returns {Promise<Response>} Response whose body is the wasm binary.
 */
async function loadWasmResponse() {
  let cache = null;
  try {
    cache = await caches.open(WASM_CACHE);
    const cached = await cache.match(WASM_URL);
    if (cached) return cached;
  } catch {
    // Cache Storage unavailable — proceed without it.
  }
  const response = await fetch(WASM_URL);
  if (cache && response.ok) {
    try {
      cache.put(WASM_URL, response.clone()).catch(() => {
        // Cache fill is best-effort; this load proceeds regardless.
      });
    } catch {
      // Cache fill is best-effort; this load proceeds regardless.
    }
  }
  return response;
}

import('./vizdom_ts.min.js')
  .then(async module => {
    const init = module.init || module.default;
    await init({ module_or_path: loadWasmResponse() });
    window.Vizdom = { DotParser: module.DotParser };
    window.__rfMarkWidgetReady?.('vizdom');
  })
  .catch(error => {
    console.warn('vizdom WASM graph layout unavailable:', error);
  });
