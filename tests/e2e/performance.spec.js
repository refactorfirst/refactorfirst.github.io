import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';

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
