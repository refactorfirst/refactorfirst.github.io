import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Performance / bundle-size guardrails (Technical Appendix §10):
// - landing page transfers <190KB of first-party code (js/css/html),
//   measured gzip-compressed — production static hosts serve compressed
//   bodies and the local test server does not. (The plan target was 150KB;
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

test('landing page ships less than 190KB of first-party code (gzipped)', async ({ page }) => {
  const sizePromises = [];
  page.on('response', response => {
    if (FIRST_PARTY(response.url())) {
      sizePromises.push((async () => {
        try {
          const body = await response.body();
          return { url: response.url(), bytes: gzipSync(body).length };
        } catch {
          return null; // interrupted navigation
        }
      })());
    }
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const sizes = (await Promise.all(sizePromises)).filter(Boolean);
  const total = sizes.reduce((sum, r) => sum + r.bytes, 0);
  console.log(`first-party gzipped total: ${total} bytes\n` // eslint-disable-line no-console
    + sizes.map(s => `  ${s.bytes.toString().padStart(8)}  ${s.url}`).join('\n'));
  expect(total).toBeLessThan(190 * 1024);
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
