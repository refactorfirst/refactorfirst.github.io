import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Performance / bundle-size guardrails (Technical Appendix §10):
// - landing page ships <190KB of its own first-party code (js/css/html),
//   measured gzip-compressed (production static hosts serve compressed
//   bodies and the local test server does not). Landing assets are
//   identified by document provenance, never by arrival time: everything
//   the landing's HTML references (async chunks + CSS) gates load, so it
//   is exactly the code the landing itself ships. Arrival time cannot
//   draw that line — Next's automatic <Link> prefetch downloads the
//   linked routes' chunks (first-party .js as well), and once hydration
//   has run those responses can complete before the window load event;
//   the delayed-logo test below reproduces that race and verifies the
//   exclusion. The idle-time rendering-library warm-up
//   (components/report-warmup.jsx) is excluded the same way: it fetches
//   modules no landing document references.
//   (The plan target was 150KB;
//   baselines are recorded as accepted deviations in
//   plans/nextjs-conversion.md §10: ~173KB measured at the Next.js
//   cutover, re-measured ~185KB after later framework bumps — ~83% of
//   the payload is framework runtime (react-dom ~71KB + next runtime
//   ~43KB + core-js polyfills ~39KB gzipped), first-party landing code
//   is ~28KB. The 190KB budget keeps ~9KB of headroom for the global
//   theming CSS while still failing if a heavy dependency — say the
//   renderer's mustache + dompurify — ever leaks into a landing chunk.)
// - report page widget scripts load lazily (after window load), so the
//   initial HTML/first paint never waits on Chart.js/sigma/vizdom CDNs.

const FIRST_PARTY = url => url.startsWith('http://localhost') && /\.(js|css|html?)(\?|$)/.test(url);

/**
 * Measures the landing's own gzipped payload. Landing assets are
 * identified by document provenance, never by arrival time: the initial
 * HTML references exactly the code the landing ships (async chunks +
 * CSS), and all of it gates load. Arrival time cannot draw that line —
 * Next's automatic <Link> prefetch downloads the linked routes' chunks
 * (first-party .js as well), and once hydration has run those responses
 * can complete before the window load event (the delayed-logo test
 * below reproduces this and verifies the exclusion). The idle-time
 * rendering-library warm-up (components/report-warmup.jsx) stays out
 * the same way: it fetches modules no landing document references.
 *
 * Returns per-row data for every first-party response:
 * - landing: { url, bytes } rows for the landing's own assets (the
 *   ones the initial HTML references),
 * - total: their gzipped byte sum,
 * - prefetchBeforeLoad: other routes' bytes that completed before the
 *   load event — exactly what an arrival-time listener miscounts into
 *   the budget.
 *
 * The optional onForeignFirstParty(url) callback fires once another
 * route's first-party bytes have downloaded, letting a caller stall the
 * load event until the miscount window is guaranteed open.
 */
async function measureLandingPayload(page, { onForeignFirstParty = null } = {}) {
  const documentResponse = new Promise(resolve => {
    page.on('response', response => {
      if (response.request().resourceType() === 'document') resolve(response);
    });
  });
  const landingPaths = documentResponse.then(async response => {
    const html = await response.text();
    const paths = new Set();
    for (const match of html.matchAll(/<script\b([^>]*)>/g)) {
      const src = /\ssrc="([^"]+)"/.exec(match[1]);
      if (src) paths.add(new URL(src[1], response.url()).pathname);
    }
    for (const match of html.matchAll(/<link\b([^>]*)>/g)) {
      const rel = /\srel="([^"]+)"/.exec(match[1]);
      const href = /\shref="([^"]+)"/.exec(match[1]);
      if (href && rel && /(stylesheet|preload|modulepreload)/.test(rel[1])) {
        paths.add(new URL(href[1], response.url()).pathname);
      }
    }
    return paths;
  });

  let loadFired = false;
  // Firefox also fires a `load` event for the initial about:blank, which
  // would mark every response after-load before the landing document even
  // starts; arm the flag only once its own response is on the wire (its
  // load event cannot precede that).
  documentResponse.then(() => {
    page.on('load', () => { loadFired = true; });
  });
  const rows = [];
  page.on('response', response => {
    const url = response.url();
    const beforeLoad = !loadFired; // what an arrival-time listener sees
    if (!FIRST_PARTY(url)) return;
    rows.push((async () => {
      try {
        const [paths, body] = await Promise.all([landingPaths, response.body()]);
        const landing = paths.has(new URL(url).pathname);
        // Notify (the delayed-load test below) once another route's
        // first-party bytes have actually downloaded.
        if (!landing && onForeignFirstParty) onForeignFirstParty(url);
        return { url, bytes: gzipSync(body).length, landing, beforeLoad };
      } catch {
        return null; // interrupted navigation
      }
    })());
  });
  await page.goto('/', { waitUntil: 'load' });

  const measured = (await Promise.all(rows)).filter(Boolean);
  const landing = measured.filter(row => row.landing);
  // The measurement must actually see the landing's assets — an empty
  // measurement would make the budget pass vacuously.
  expect(landing.length).toBeGreaterThan(0);
  return {
    landing,
    total: landing.reduce((sum, row) => sum + row.bytes, 0),
    prefetchBeforeLoad: measured.filter(row => !row.landing && row.beforeLoad),
  };
}

test('landing page ships less than 190KB of first-party code (gzipped)', async ({ page }) => {
  const { landing, total } = await measureLandingPayload(page);
  console.log(`first-party gzipped total: ${total} bytes\n` // eslint-disable-line no-console
    + landing.map(s => `  ${s.bytes.toString().padStart(8)}  ${s.url}`).join('\n'));
  expect(total).toBeLessThan(190 * 1024);
});

test('190KB guard stays exact when load is delayed past linked-route prefetches', async ({ page }) => {
  // The logo gates window load but not rendering or hydration, so
  // stalling it manufactures the arrival-time race: the hydrated router
  // prefetches the linked routes' chunks (first-party .js, measured
  // ~38KB on this build) while window load waits. Engines schedule that
  // prefetch at very different idle latencies (webkit starts seconds
  // later than chromium), so a fixed stall could let load win the race
  // — the logo is held until another route's chunk has actually
  // downloaded, making the miscount window deterministic everywhere.
  let noteForeignChunk;
  const foreignChunkDownloaded = new Promise(resolve => { noteForeignChunk = resolve; });
  await page.route('**/assets/logo.png', async route => {
    // Fallback so a prefetch-less future still navigates; the assertion
    // below then fails with a clear zero instead of a timeout.
    await Promise.race([foreignChunkDownloaded, new Promise(r => setTimeout(r, 15000))]);
    await route.continue();
  });

  const { total, prefetchBeforeLoad } = await measureLandingPayload(page, {
    onForeignFirstParty: noteForeignChunk,
  });

  // The stall really did land linked-route prefetch bytes before the load
  // event — exactly what an arrival-time listener miscounts.
  expect(prefetchBeforeLoad.length).toBeGreaterThan(0);
  // The landing's own payload still measures clean: all of its assets
  // gated the (delayed) load and were counted, and none of the other
  // routes' bytes leaked into the budget.
  expect(total).toBeLessThan(190 * 1024);
  // Firefox re-requests the logo after hydration; drop the stall so a
  // late request cannot leave the route handler pending past the test.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('report page loads CDN widgets lazily (after window load)', async ({ page }) => {
  await page.route('**/raw.githubusercontent.com/**', route =>
    route.fulfill({ status: 404 }));

  let loadFired = false;
  page.on('load', () => { loadFired = true; });
  const widgetRequests = [];
  page.on('request', request => {
    if (/chart\.js|sigma\.js|graphology|3d-force-graph|svg-pan-zoom/.test(request.url())) {
      widgetRequests.push({ url: request.url(), afterLoad: loadFired });
    }
  });

  await page.goto('/refactorfirst/refactorfirst');
  await page.waitForTimeout(3000); // give lazyOnload handlers time to fire

  expect(widgetRequests.length).toBeGreaterThan(0);
  expect(widgetRequests.every(r => r.afterLoad)).toBe(true);
});

// ---------------------------------------------------------------------------
// Initial rendering performance: the report markup is the LCP content and
// must render as soon as the data arrives — never held back by the ~4.8MB
// vizdom wasm or the CDN widgets, which enhance the report progressively.
// ---------------------------------------------------------------------------

const SAMPLE_REPORT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../fixtures/junit4-report.json'),
  'utf-8'
);

function mockReportJson(page) {
  return page.route('**/raw.githubusercontent.com/**', route => {
    if (route.request().url().endsWith('refactor-first.json')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: SAMPLE_REPORT });
    } else {
      route.fulfill({ status: 404 });
    }
  });
}

/**
 * Waits until the warmed wasm binary is observable in Cache Storage — the
 * true precondition for any later page resolving it without network.
 * window.Vizdom alone only proves the wasm initialized: the bridge fills
 * the cache in the background (public/widgets/vizdom-bridge.js), so the
 * stored entry itself must be observed before the test navigates onward.
 *
 * Polls through page.evaluate — waitForFunction in this Playwright version
 * treats an async predicate's Promise object as immediately truthy, so it
 * cannot await cache checks. Scans every cache by URL: the entry's cache
 * name is the bridge's versioned constant and must not leak into tests.
 */
async function waitForWarmedWasm(page, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const warmed = await page.evaluate(async () => {
      if (typeof window.Vizdom !== 'object') return false;
      try {
        const wasmUrl = new URL('/widgets/vizdom_ts_bg.wasm', location.origin).href;
        for (const key of await caches.keys()) {
          const cache = await caches.open(key);
          if (await cache.match(wasmUrl)) return true;
        }
      } catch {
        // Cache Storage unavailable: the warm can never complete here.
      }
      return false;
    });
    if (warmed) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`vizdom wasm never appeared in Cache Storage within ${timeout}ms`);
}

test('report content renders without waiting for the vizdom wasm', async ({ page }) => {
  await mockReportJson(page);
  // Hold the wasm and Chart.js back forever: the report must still render.
  await page.route('**/widgets/vizdom_ts_bg.wasm', () => {});
  await page.route('**/npm/chart.js@4.4.7/**', () => {});

  await page.goto('/refactorfirst/refactorfirst');
  // Old behavior: the first render gated on chart+vizdom readiness (up to a
  // 5s settle window). The markup must now appear as soon as the data does.
  await page.waitForSelector('.rf-report h1', { timeout: 3000 });
  await page.locator('table[data-rf-table="class-relationships"]').first().waitFor({
    timeout: 3000
  });
});

test('vizdom wasm is fetched once and served from Cache Storage on repeat loads', async ({ page }) => {
  await mockReportJson(page);
  let wasmRequests = 0;
  page.on('request', request => {
    if (request.url().endsWith('/widgets/vizdom_ts_bg.wasm')) wasmRequests++;
  });

  await page.goto('/refactorfirst/refactorfirst');
  await page.locator('#classGraph svg').waitFor({ timeout: 30000 });
  expect(wasmRequests).toBe(1);
  // The graphs only prove the wasm initialized; the cache fill runs in the
  // background, so wait for the stored entry before asserting cache-served
  // behavior across the reload.
  await waitForWarmedWasm(page);

  // Canary entry: probe whether this browser persists Cache Storage across
  // loads in this environment. (Playwright's WebKit build keeps it
  // in-memory only on the http test server; HTTPS production deployments
  // persist it in every engine.)
  await page.evaluate(async () => {
    const cache = await caches.open('vizdom-cache-canary');
    await cache.put('/canary', new Response('ok'));
  });

  // A repeat visit must not re-download the multi-megabyte binary when the
  // cache persists: the bridge resolves it from Cache Storage (HTTP cache
  // headers on static hosts are short, and DevTools' disabled cache
  // bypasses them entirely).
  wasmRequests = 0;
  await page.reload();
  const cachePersists = await page.evaluate(async () => {
    try {
      const cache = await caches.open('vizdom-cache-canary');
      return (await cache.match('/canary')) !== undefined;
    } catch {
      return false;
    }
  });
  await page.locator('#classGraph svg').waitFor({ timeout: 30000 });
  expect(wasmRequests).toBe(cachePersists ? 0 : 1);
});

test('report loading state reserves the viewport so the report does not shift the footer', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'layout-shift entries are chromium-only');
  await mockReportJson(page);
  // The GitHub buttons iframe injects third-party content mid-report;
  // it is not part of the layout-reservation contract under test.
  await page.route('**/buttons.github.io/**', route => route.abort());

  await page.goto('/refactorfirst/refactorfirst');
  await page.locator('.rf-report h1').waitFor({ timeout: 30000 });
  await page.locator('#classGraph svg').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500); // let late layout settle

  const cls = await page.evaluate(() => new Promise(resolve => {
    let total = 0;
    const footerShifts = [];
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          total += entry.value;
          for (const source of entry.sources || []) {
            const el = source.node;
            if (el && el.closest && el.closest('.site-footer')) footerShifts.push(entry.value);
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      resolve({ supported: false });
      return;
    }
    setTimeout(() => resolve({ supported: true, total, footerShifts }), 200);
  }));

  if (!cls.supported) return;
  expect(cls.footerShifts).toEqual([]); // the footer never moves on screen
  expect(cls.total).toBeLessThan(0.1);
});

// ---------------------------------------------------------------------------
// 3D popup widgets: the force graph and its sprite-label helper must share
// ONE Three.js instance. Both load lazily (never blocking first paint), and
// importing three twice downloads it twice and trips three's own
// "Multiple instances of Three.js being imported." warning — so the bridge
// pins both packages to the same three build through esm.sh ?deps=, whose
// rewritten module graph resolves every import to the same three.mjs URL
// (deduped by the browser's module map).
// ---------------------------------------------------------------------------

/** Waits until every named window global has loaded. */
async function waitForGlobals(page, names, timeout = 30000) {
  await page.waitForFunction(
    namesArg => namesArg.every(name => Boolean(window[name])),
    names,
    { timeout }
  );
}

test('3D popup widgets load exactly one Three.js instance', async ({ page }) => {
  await mockReportJson(page);
  const warnings = [];
  const threeEntryFetches = [];
  page.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('request', request => {
    if (/three@[\d.]+\/es2022\/three\.mjs/.test(request.url())) threeEntryFetches.push(request.url());
  });

  await page.goto('/refactorfirst/refactorfirst');
  // The widgets load after window load; their globals appearing proves the
  // module graph (including three) finished evaluating.
  await waitForGlobals(page, ['ForceGraph3D', 'SpriteText', 'graphlibDot']);

  expect(threeEntryFetches).toHaveLength(1); // one shared instance, not one per package
  expect(warnings.some(text => /Multiple instances of Three\.js being imported/.test(text)))
    .toBe(false);
});

test('3D popup renders the force graph through the shared widget modules', async ({ page }) => {
  await mockReportJson(page);
  await page.goto('/refactorfirst/refactorfirst');
  await page.locator('.rf-report h1').waitFor({ timeout: 30000 });
  await waitForGlobals(page, ['ForceGraph3D', 'SpriteText', 'graphlibDot']);

  // three requires WebGL2; skip where the engine cannot provide it (e.g. a
  // headless GPU-less runner) rather than fail the wiring under test.
  const webgl2 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext && canvas.getContext('webgl2'));
  });
  test.skip(!webgl2, 'WebGL2 unavailable');

  await page.locator('[data-popup-3d][data-popup="popup-classGraph"]').click();
  const popup = page.locator('#popup-classGraph');
  await expect(popup).toBeVisible();
  // The force graph mounts its WebGL canvas inside the popup container.
  await page.locator('#graph-container-classGraph canvas').waitFor({ timeout: 30000 });
});

// ---------------------------------------------------------------------------
// Report rendering-library warm-up: directory pages (landing, user listing)
// warm the shared rendering libraries the first report needs during idle
// time — the vizdom wasm into Cache Storage through the shared bridge, the
// classic widget scripts and the bundled template into the HTTP cache — so
// the report a visitor opens renders from local caches. Report data is
// never warmed (listings can hold thousands of repositories), and the warm
// is gated on window load + idle so it never delays the hosting page's own
// first paint.
// ---------------------------------------------------------------------------

/** Maps a warm-up resource URL onto its counter key (null if not one). */
function warmResourceKey(url) {
  if (url.endsWith('/widgets/vizdom_ts_bg.wasm')) return 'wasm';
  if (/chart\.umd\.min\.js$/.test(url)) return 'chart';
  if (/svg-pan-zoom\.min\.js$/.test(url)) return 'panZoom';
  if (url.endsWith('/assets/refactor-first-report.mustache')) return 'template';
  if (url.endsWith('.refactorfirst/refactor-first.json')) return 'reportData';
  return null;
}

test('landing page warms the report rendering libraries during idle time', async ({ page }) => {
  let loadFired = false;
  page.on('load', () => { loadFired = true; });
  const warm = { wasm: 0, chart: 0, panZoom: 0, template: 0, reportData: 0 };
  const timing = [];
  const downloads = [];
  page.on('request', request => {
    const key = warmResourceKey(request.url());
    if (!key) return;
    // Record a resource only once its download completed successfully:
    // a request that merely fired can still abort mid-flight or fail
    // with a non-2xx status, and neither leaves anything behind for the
    // report page to reuse (a cold cache is just the status quo there —
    // the report refetches). Requests are captured when they start (all
    // warm steps fire in the same idle callback) and each is resolved
    // through its response's completion, so the counters reflect warmed
    // bytes, not attempts.
    downloads.push((async () => {
      try {
        const response = await request.response();
        if (!response || !response.ok()) return; // failed: not warmed
        await response.finished(); // body fully downloaded
        warm[key]++;
        timing.push({ key, afterLoad: loadFired });
      } catch {
        // Aborted mid-download: not warmed.
      }
    })());
  });

  await page.goto('/');
  // The warmed bridge finished initializing the wasm AND storing it in
  // Cache Storage (the fill runs in the background, so the stored entry —
  // not window.Vizdom — is what a later page will read).
  await waitForWarmedWasm(page);
  // Every warm request started before the wasm finished caching (they all
  // fire in the same idle callback), so the download list is complete —
  // settle the in-flight completions before asserting on them.
  await Promise.all(downloads);

  expect(warm.wasm).toBe(1);
  expect(warm.chart).toBe(1);
  expect(warm.panZoom).toBe(1);
  expect(warm.template).toBe(1);
  // Rendering libraries only: no repository report data is ever warmed.
  expect(warm.reportData).toBe(0);
  // The warm never competes with the landing's own rendering.
  expect(timing.every(entry => entry.afterLoad)).toBe(true);
});

test('a report opened from the warmed landing never downloads the wasm', async ({ page }) => {
  await mockReportJson(page);
  await page.goto('/');
  await waitForWarmedWasm(page);
  // Canary probe: does this environment persist Cache Storage across loads?
  // (Playwright's WebKit build keeps it in-memory only on the http test
  // server; HTTPS production deployments persist it in every engine.)
  await page.evaluate(async () => {
    const cache = await caches.open('vizdom-cache-canary');
    await cache.put('/canary', new Response('ok'));
  });

  let wasmRequests = 0;
  page.on('request', request => {
    if (request.url().endsWith('/widgets/vizdom_ts_bg.wasm')) wasmRequests++;
  });
  await page.goto('/refactorfirst/refactorfirst');
  const cachePersists = await page.evaluate(async () => {
    try {
      const cache = await caches.open('vizdom-cache-canary');
      return (await cache.match('/canary')) !== undefined;
    } catch {
      return false;
    }
  });
  await page.locator('#classGraph svg').waitFor({ timeout: 30000 });
  // The wasm resolved from the warmed Cache Storage entry: zero network
  // wherever the cache persists (the designed fallback refetches otherwise).
  expect(wasmRequests).toBe(cachePersists ? 0 : 1);
});
