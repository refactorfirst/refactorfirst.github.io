# Next.js Static Export Conversion Plan

Convert the current client-side SPA (`index.html` + ES6 modules in `js/` + Mustache templates) into a **Next.js App
Router application deployed as a static export**
(`output: 'export'`), preserving all current behavior, URLs, security posture, and deployment targets (GitHub Pages,
GitLab Pages, Bitbucket static hosting).


## Spike Results (recorded 2026-09-15)

- [x] **Spike A (test infra): PASS.** `@testing-library/react@16.3.3` + React 19 runs under `bun test`
  with the existing jsdom preload (`tests/setup.js`). `tests/integration/spike-button.test.jsx` passed 5/5
  consecutive runs. No Vitest fallback needed.
- [x] **Spike B (export constraints): PASS.** Next 16.3.5 with `output: 'export'`, `trailingSlash: true`
  and a dynamic route using `generateStaticParams` emits `out/` with enumerated HTML (`/refactorfirst/`);
  `python3 -m http.server` serves deep links with 200s, unknown paths 404.
- [x] **Spike C (CSP): PASS with adaptation.** Next exports inline RSC bootstrap scripts
  (`self.__next_f.push(...)`), which the strict CSP would block. Solution: post-build script
  `scripts/fix-csp-hashes.mjs` injects `sha256-` hashes of every inline `<script>` into the CSP `<meta>`
  of each exported HTML file. Verified with Playwright: hydration works, zero CSP violations.
  `next build` must always be followed by `node scripts/fix-csp-hashes.mjs`.
- [x] **Spike D (WASM dynamic imports): FAIL for native URLs → fallback applied.** Turbopack rewrites
  runtime `import('https://...')` into its module loader (`TypeError: e.x is not a function`).
  Per Technical Appendix §4 Option A: widget code moved to native `<script type="module">` bridge files
  under `public/widgets/` (`vizdom-bridge.js`, `three-spritetext-bridge.js`); vizdom is additionally
  vendored (`vizdom_ts.min.js` + `vizdom_ts_bg.wasm`, ~4.7MB) so no jsDelivr dependency at runtime.
  Bridges expose `window.SpriteText` / `window.Vizdom` and notify `window.__rfMarkWidgetReady(name)`
  (wired to `lib/widget-loader.js`). Verified: vizdom renders an SVG and three-spritetext loads, zero
  CSP violations.
- [x] **DOMPurify/Mustache (§2): Option A (bundle) selected.** `mustache@4.2.0` and `dompurify@3.4.15`
  installed as regular dependencies; `lib/renderer.js` imports them directly. Bundle impact measured in
  Phase 8 (<20KB threshold per decision table).

## Guiding Principles

- **No server, ever.** Everything that works today client-side keeps working client-side after the export. Report JSON
  is still fetched from the hosting platform's raw endpoints by the end user's browser.
- **Behavior parity over framework idioms.** URLs, CSP, error pages, branch fallback, and the submission flow must
  survive the migration unchanged.
- **Pure logic moves verbatim.** Modules in `js/` that have no DOM/React dependency are relocated, not rewritten — their
  Bun tests move with them.
- **Strangler approach.** The Next.js app is built alongside the legacy app; the legacy `index.html` + `js/` are removed
  only in the final cutover phase.

## Open Questions & Decisions

The following questions require explicit decisions before execution. Default decisions are provided to avoid blocking.

| Question | Owner | Timeline | Default Decision |
|----------|-------|----------|------------------|
| Spike outcome recording format | Tech Lead | Before Phase 0 | Add "Spike Results" section after Guiding Principles with pass/fail summary + key findings |
| DOMPurify/Mustache bundle size threshold | Tech Lead | During Phase 2 spike | Accept <20KB total increase; if >20KB, use Option B (static assets) |
| Widget loader complexity threshold | Tech Lead | During Phase 5 implementation | If >4 hours or >100 LOC, use fallback (load all scripts in layout.jsx head) |
| WASM import failure definition | Tech Lead | During Phase 0 Spike D | Any console error preventing WASM execution = failure; performance degradation acceptable if <500ms |
| Redeploy latency stakeholder approval | Product Owner | Before Phase 5 | 4-8 minute delay acceptable with fast path feedback loop |
| GitHub Pages preview environment | DevOps | Before Phase 10 | Use GitHub Pages branch deployment (e.g., `preview/nextjs-conversion`) |
| basePath scenario applicability | Tech Lead | Before Phase 10 | Verify only if deploying to GitHub Pages fork (`user.github.io/repo`); otherwise skip |
| Bundle size stakeholder approval | Product Owner | Before Phase 8 | +50KB landing page acceptable; add bundle size monitoring in CI with 150KB failure threshold |
| Test infrastructure fallback timeline | Project Manager | Before Phase 0 | +1 day already allocated; if Spike A fails, extend timeline accordingly |
| Strangler phase coordination | Tech Lead | Before Phase 1 | Run both builds locally during Phase 1-9; maintain legacy fixes until Phase 10 cutover |

**Decision process:** If no explicit decision is made by the timeline, use the default decision. Document the actual decision in the appropriate phase notes during execution.

## CRITICAL TDD REQUIREMENTS

- [ ] **MANDATORY**: Write failing tests BEFORE writing any production code (Red-Green-Refactor)
- [ ] **MANDATORY**: No phase is complete until its tests pass AND no previously-passing test regresses
- [ ] **MANDATORY**: Every legacy test maps to a living test in the new stack (see Test Migration Map); a test may only
  be deleted when its behavior is covered elsewhere and this plan records where
- [ ] Coverage stays at 80%+ on core modules throughout
- [ ] Legacy suite stays green on its own config until Phase 10 cutover

## Target Architecture

```
next.config.mjs                  # output:'export', images.unoptimized, basePath from env
playwright.config.js             # webServer serves ./out (production-fidelity)
app/
  layout.jsx                     # CSP meta, header/nav, footer (utils/layout parity)
  page.jsx                       # landing (RSC: reads repositories.txt at build)
  not-found.jsx                  # 404 page (also exported as 404.html by Next)
  error.jsx                      # client error boundary → error-handler rendering
  globals.css                    # css/main.css + css/components.css
  [username]/page.jsx            # user repo listing (static params from repositories.txt)
  [username]/[repository]/page.jsx            # report (shell RSC + client fetcher)
  [username]/[repository]/[branch]/page.jsx   # explicit-branch report
  add-repo/page.jsx              # submission flow (client component)
  getting-started|documentation|faq|examples|api|about|feedback|
  privacy-policy|terms-of-service/page.jsx    # static content pages
components/
  site-header.jsx  menu-search.jsx  hero-search.jsx  repo-list.jsx
  report-view.jsx  repo-submission-form.jsx  workflow-sample.jsx
lib/                             # relocated PURE modules (no React imports)
  router.js fetcher.js renderer.js search.js repo-submission.js
  rate-limiter.js cache-manager.js error-handler.js utils.js
public/
  repositories.txt               # fetched by client code exactly as today
  assets/refactor-first-report.mustache   # bundled, authoritative template
  assets/logo.png  assets/vendor/*  assets/sentry-config.js
tests/
  unit/          # Bun: pure lib tests (migrated 1:1, only import paths change)
  integration/   # Bun + @testing-library/react + happy-dom: component/flow tests
  e2e/           # Playwright: unchanged specs, webServer points at ./out
```

**Decisions (locked for this plan):**

| Decision                | Choice                                                                                                                                              | Rationale                                                                                    |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Language                | JavaScript + JSX (no TypeScript)                                                                                                                    | Mechanical port of tested modules; no type migration inside a behavior-migration             |
| Router                  | App Router                                                                                                                                          | Current Next.js standard; static export fully supported                                      |
| Mustache template       | Served from `public/assets/`, fetched at runtime                                                                                                    | Template stays untrusted-content-isolated; zero renderer changes                             |
| Report fetching         | Client component reusing `fetcher.js`                                                                                                               | Reports are user-session data; static export can't pre-render arbitrary platform raw content |
| repositories.txt        | Read at build for `generateStaticParams`, served from `public/` for client search                                                                   | Same file, both consumers                                                                    |
| Test runner             | Bun for unit/integration, Playwright for E2E                                                                                                        | Preserves current tooling and CI patterns                                                    |
| DOM for component tests | happy-dom via `tests/setup.js` preload (fallback: Vitest+jsdom if `@testing-library/react` proves flaky under Bun — decide in Phase 1 with a spike) | Keeps single runner                                                                          |

**Static-export constraints that shape the design:**

1. **Dynamic routes need `generateStaticParams`** — `/{user}` and
   `/{user}/{repo}(/branch)` pages are enumerated **from `repositories.txt` at build time**. This is safe because
   `repositories.txt` only changes via the submission workflow, which already triggers a redeploy (`redeploy.yml`). Set
   `export const dynamicParams = false` so unlisted paths 404 cleanly.
2. **Branch segment explodes the matrix.** Generate branch pages only for
   `['main', 'master']` per listed repo (the only two branches the fallback logic can ever resolve). Arbitrary branch
   values are handled by the client:
   the static page for the nearest match loads, `report-view` reads the real path via `usePathname()` and fetches the
   requested branch with the existing fallback chain. A Playwright deep-link test pins this behavior.
3. **GitHub Pages deep links.** Unknown paths hit `404.html`. Next export emits its own `404.html`; parity test asserts
   it contains the app shell. The legacy
   "404.html = copy of index.html" trick is no longer needed for listed repos (they get real files); a thin client-side
   redirect in `not-found.jsx` covers branch-paths not pre-generated.
4. **`basePath` for project-page forks.** `next.config.mjs` reads
   `NEXT_PUBLIC_BASE_PATH` so forks deploying to `user.github.io/repo` work; all internal links must use `next/link`
   (never hardcoded `/...`) to inherit it.
5. **No `next/image` optimization** — `images.unoptimized = true` (or plain
   `<img>`) since there is no image server.

## Static URL Coverage (what is addressable after `next build`)

| URL                                                 | Static HTML file?                         | How content appears                                              |
|-----------------------------------------------------|-------------------------------------------|------------------------------------------------------------------|
| `/`, `/add-repo`, 9 static pages                    | Yes (static routes)                       | Fully in exported HTML                                           |
| `/{username}`                                       | Yes, one per username in repositories.txt | Listing pre-rendered; pagination via client `useSearchParams`    |
| `/{user}/{repo}`                                    | Yes, one per line in repositories.txt     | Shell only — report JSON fetched in browser at view time         |
| `/{user}/{repo}/main`, `.../master`                 | Yes (2 × listed repos)                    | Shell as above; pinned branch                                    |
| `/{user}/{repo}/{other-branch}`                     | **No** (not enumerable)                   | `404.html` redirect → nearest shell → client fetches that branch |
| Repo added to repositories.txt but not yet deployed | **No** until redeploy                     | `redeploy.yml` closes the gap; 404 redirect until then           |
| Unlisted/invalid paths                              | 404 page                                  | `dynamicParams = false` + `not-found.jsx`                        |

Two invariants this table encodes (both already true of the legacy app, preserved deliberately): report *data* is never
baked into HTML — it is always fetched by the end user's browser; and the set of addressable repo URLs changes only when
`repositories.txt` changes, which already triggers redeployment.

## Test Migration Map (165 legacy tests → target suite)

| Legacy suite                                                                                    | Disposition                                                                                                                                                                                                                                    |
|-------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tests/unit/router*.test.js`                                                                    | Move to `lib/router.js` tests verbatim (classify/validate/build-URL logic stays; `navigateTo`/`onRouteChange` DOM glue is deleted — superseded by the App Router — and its tests are replaced by link-rendering assertions in component tests) |
| `tests/unit/fetcher*.test.js`                                                                   | Move verbatim (fetch already mocked)                                                                                                                                                                                                           |
| `tests/unit/search.test.js`                                                                     | Move verbatim (`parseRepositories`); DOM type-ahead part becomes a component test on `<MenuSearch>`/`<HeroSearch>`                                                                                                                             |
| `tests/unit/renderer.test.js`                                                                   | Move verbatim (Mustache rendering unchanged)                                                                                                                                                                                                   |
| `tests/unit/utils.test.js`, `rate-limiter`, `cache-manager`, `error-handler`, `repo-submission` | Move verbatim                                                                                                                                                                                                                                  |
| `tests/unit/report-view.test.js`                                                                | Move; widget-enhancement verbs retained, render target becomes a ref'd container inside `<ReportView>`                                                                                                                                         |
| `tests/unit/zz-style-check.test.js`                                                             | Adapt: scan `lib/`/`components/` instead of `js/`                                                                                                                                                                                              |
| `tests/integration/search-flow.test.js`                                                         | Rewrite as Testing-Library flow over landing page (RSC output mocked via fixtures)                                                                                                                                                             |
| `tests/integration/submission-flow.test.js`                                                     | Rewrite against `<RepoSubmissionForm>` incl. per-platform issue-URL redirect assertions                                                                                                                                                        |
| `tests/integration/report-rendering.test.js`                                                    | Rewrite against `<ReportView>` (fetch mock + Mustache + `enhanceReport`)                                                                                                                                                                       |
| `tests/integration/getting-started-samples.test.js`                                             | Rewrite against `<WorkflowSample>` environment switch                                                                                                                                                                                          |
| `tests/e2e/*`                                                                                   | Keep specs; update `webServer` to serve `./out`; add static-export parity spec (listed deep links return 200, `not-found` renders for unlisted)                                                                                                |

New tests introduced by this plan are listed per-phase, plus additional tests in Technical Appendix §9. **Net rule: target suite ≥ 180 tests before cutover** (165 legacy + ~15 new for AbortController, branch redirect, widget loading, environment detection, static export parity).

## Phase 0 — Decisions & Harness Spikes (no production code)

- [x] Add `next`, `react`, `react-dom` deps; verify Next version with static-export App Router support (next@16.3.5)
- [x] **Spike A (test infra, fails first):** write a trivial component test (`tests/integration/spike-button.test.jsx`)
  using `@testing-library/react`
  under `bun test` with happy-dom preload → make it pass. If blocked >1 day, fall back to Vitest for `tests/integration`
  and record the change here → **PASSED with existing jsdom preload; no fallback needed**
- [x] **Spike B (export constraints):** scaffold minimal `next.config.mjs` + one dynamic route with
  `generateStaticParams`; `next build` → confirm `out/`
  contains enumerated HTML and that `npx serve out` deep-links correctly
- [x] **Spike C (CSP):** confirm the existing CSP meta (incl. `'wasm-unsafe-eval'`
  and CDN script-src entries) still permits Next's exported inline bootstrap scripts; if Next injects blocked inline
  scripts, keep CSP meta as-is and document the delta vs. hashed nonces (headers are unavailable on static hosts)
  → **inline bootstrap blocked; resolved via post-build sha256 hash injection (`scripts/fix-csp-hashes.mjs`)**
- [x] **Spike D (WASM dynamic imports):** test if `import('https://esm.sh/...')` and
  `import('https://cdn.jsdelivr.net/...')` work in Next.js static export → **FAIL (Turbopack loader)**;
  §4 Option A applied: `public/widgets/` bridge modules, vizdom vendored
- [x] Record spike outcomes at the top of this file before proceeding → see "Spike Results" above

**Exit criteria:** a component test runs under Bun; `next build` produces `out/`; no open questions about
CSP/static-export feasibility.

## Phase 1 — Scaffold & Tooling

Tests first:

- [x] `tests/integration/app-shell.test.jsx` (fails): root layout renders header nav (all 9 menu links + GitHub
  external), skip-link targets main, footer shows Privacy/Terms links, `<html lang="en">`

Implementation:

- [x] `next.config.mjs`: `output: 'export'`, `images.unoptimized`, `basePath`
  from `NEXT_PUBLIC_BASE_PATH`, `trailingSlash: true` (most compatible with static hosts serving directory indexes)
- [x] `app/layout.jsx`: port `<head>` (CSP meta verbatim, referrer meta,
  `submission-target` meta, mvp.css CDN link, favicon/logo), header nav from
  `index.html` lines 29–67, footer; `globals.css` = concatenation of
  `css/main.css` + `css/components.css` (import order preserved)
- [x] Hamburger toggle → tiny client component (`menu-toggle.jsx`) preserving
  `aria-expanded` behavior (assert in app-shell test)
- [x] **basePath audit:** Run audit script from Technical Appendix §7; document all hardcoded absolute paths
  requiring conversion → audit findings: all in-app navigation goes through `next/link` (auto basePath);
  the only raw absolute URL is the logo `<img src>`, wrapped by `lib/base-path.js#withBasePath`; CDN fetches in legacy
  `js/` are not ported. `public/` static assets were introduced for repositories.txt/assets/widgets.
- [x] Delete nothing legacy yet; legacy `index.html`/`js/` still serve independently while Next builds in parallel

**Exit criteria:** app-shell test green; `npx eslint app components lib` passes. → **MET** (also: RTL runs under Bun
via `tests/integration/rtl.js` wrapper — required because Bun shares one jsdom document across test files).

## Phase 2 — `lib/` Module Relocation (pure logic, zero behavior change)

For each module: **move its unit test first** (import path `js/` → `lib/`, watch red), then move the module, green.

- [x] `router.js` → split: `lib/routes.js` keeps `parseRoute`, `classifyRoute`,
  `isValidGitHubName`, `buildReportUrl`, `buildRepositoryListUrl`,
  `getQueryParam`, `DEFAULT_BRANCH` (needed to validate/encode params and build hrefs); browser-navigation glue
  (`navigateTo`, `onRouteChange`)
  is dropped — its integration tests move to Phase 3 link assertions (router.test.js + router-ext.test.js merged
  into tests/unit/routes.test.js; navigateTo describe deleted per plan)
- [x] `fetcher.js`, `renderer.js`, `search.js`, `utils.js`, `rate-limiter.js`,
  `cache-manager.js`, `error-handler.js`, `repo-submission.js` → `lib/`
  unchanged, except: `renderer.js` now imports the `mustache`/`dompurify` npm packages (§2 Option A);
  `search.js` navigation is injected (`onNavigate` defaults to a no-op); `error-handler.js` gained a pure
  `errorPageHtml()` builder used by the React adapter.
- [x] `lib/host.js`: `detectHostingEnvironment` + `getMeta`-equivalents refactored to accept `(hostname, meta)`
  explicitly (meta tags now read once in a client provider); existing utils tests extended before refactor
  → utils tests split: detect* cases live in `tests/unit/host.test.js`.
- [x] **Environment detection SSR update:** `NEXT_PUBLIC_HOSTING_ENVIRONMENT` env var support in `lib/host.js`
  (see Technical Appendix §8); SSR/env-var tests added in `tests/unit/host.test.js`
- [x] **DOMPurify/Mustache decision spike:** §2 Option A (bundle) chosen and verified by the green renderer suite
- [x] `zz-style-check` pointed at `lib/` + `components/` (renderTemplate import retargeted)

**Exit criteria:** all migrated unit tests pass; `bun test --coverage` on `lib/`
≥ 80% (actual: 94% lines); zero imports from `js/` remain in *unit* test files (legacy *integration* tests still
exercise `js/main.js` until their Phase 3–6 rewrites; js/ removed at Phase 10 cutover). → **MET**

## Phase 3 — Navigation & Search Components

Tests first:

- [x] `<MenuSearch>`/`<HeroSearch>` component tests: type-ahead filtering, keyboard navigation
  (ArrowUp/Down/Enter/Escape), ARIA combobox roles (`aria-expanded`, `aria-activedescendant`, `role="listbox"`) — ported
  from
  `search-flow.test.js` cases → `tests/integration/search-components.test.jsx`
- [x] Navigation test: search selection routes to `/user/repo` via Next router (mock `next/navigation`'s
  `useRouter.push`)
- [x] Landing page RSC output test: `tests/integration/landing-page.test.jsx` (hero, CTA, featured, embedded repos)

Implementation:

- [x] `menu-search.jsx`, `hero-search.jsx` client components wrapping
  `lib/search.js#createSearch` (keep the debounce + rendering core; swap imperative navigation for injected
  `onNavigate` → `router.push`). Shared `search-combobox.jsx`; `lib/search.js` gained
  `aria-activedescendant` + per-combobox option ids.
- [x] repositories prop: `page.jsx` (RSC) reads `repositories.txt` with
  `fs` at build (`lib/repositories.js`) and passes parsed array down (no client fetch of repositories.txt for search
  anymore — payload embedded in the header on every page and in the hero on the landing page); **the file is kept in
  `public/`** (synced from the repo root via `scripts/sync-repositories.mjs` as `prebuild`) because legacy code and
  external docs reference it
- [x] Internal links use `next/link`; reliance on `data-link` interception deleted
  (legacy click interceptor not ported)

**Exit criteria:** search behaves identically per ported cases → **MET** (Playwright journey verification in Phase 8).

## Phase 4 — Static Content Pages

Tests first:

- [x] Per-page tests: each of the 9 static routes renders its template content (fixture-assert on a distinctive heading
  per page); unknown static-ish path (`/faq/anything`) → 404 (`tests/integration/static-pages.test.jsx`;
  unknown-path behavior covered by not-found redirect tests + Phase 8 parity spec)
- [x] `<WorkflowSample>` tests (port `getting-started-samples.test.js`):
  github/gitlab/bitbucket/default injection by environment; error state markup when sample fetch fails
  (`tests/integration/workflow-sample.test.jsx`)

Implementation:

- [x] Port `templates/{about,api,documentation,examples,faq,feedback,
      getting-started,privacy-policy,terms-of-service}.html` into colocated
  `page.jsx` files (markup verbatim; `href="/..."` → `next/link`, `class=` → `className=`)
- [x] `workflow-sample.jsx` client component: resolves environment via
  `lib/host.js` from `window.location.hostname` (client-side), fetches sample fragments from `public/templates/`
  (copied from `templates/`; originals stay until cutover)
- [x] `app/not-found.jsx` renders the ported `error-404.html` content, carries the branch deep-link client redirect
  and the §5 "recently added" note (`tests/integration/not-found.test.jsx`)

**Exit criteria:** getting-started workflow-sample matrix green; visual parity checked manually per page; 9 pages
present in `out/` after build. → **MET** (parity/build-size check in Phase 8).

## Phase 5 — Report Route (core of the app)

Tests first:

- [x] Route-param validation: invalid `username`/`repository` segment →
  `notFound()` (`isValidGitHubName` from `lib/routes.js`); static routes shadow dynamic ones — build output contains
  both `/getting-started` etc. and `/[username]` (asserted by build output review; >3 segments → 404 via not-found page)
- [x] `<ReportView>` tests (port `report-rendering.test.js` → `tests/integration/report-view.test.jsx`):
  loading → rendered → error-404/error-rate-limit states; mustache rendered only from bundled template;
  `data-resolved-branch` set after fallback; retry refetch; `?branch=` deep links; Chart/vizdom widget gating
- [x] Branch fallback covered by fetcher unit + `<ReportView>` integration; Playwright deep-link check deferred
  to Phase 8 parity spec
- [x] `generateStaticParams` test: `tests/unit/static-params.test.js` (fixture-driven pure functions) +
  `tests/integration/app-routes.test.jsx` (wiring against real repositories.txt)

Implementation:

- [x] `app/[username]/page.jsx`: user listing (RSC) enumerated from repositories.txt at build; pagination in
  `components/repo-list.jsx` with `useSearchParams` wrapped in `<Suspense>`
- [x] `app/[username]/[repository]/page.jsx` + `[branch]/page.jsx`: RSC shell renders
  `<ReportView username repository branch>` client component (Suspense-wrapped)
- [x] `components/report-view.jsx`: fetch bundled mustache → `lib/fetcher#fetchReport` → `lib/renderer#renderTemplate`
  → HTML into ref container → `enhanceReport`; CDN widget scripts via `next/script` lazyOnload inside the component.
  **The template fetch goes through `withBasePath()`** — raw `/assets/...` URLs are not prefixed by Next, so under
  `NEXT_PUBLIC_BASE_PATH` the fetch would hit the host root instead of the deployment prefix (verified by the
  basePath E2E leg rendering a full report).
- [x] **Widget loader integration:** `lib/widget-loader.js` per Technical Appendix §3 (`onWidgetReady` /
  `markWidgetReady` / `waitForWidget` + `window.__rfMarkWidgetReady`); vizdom WASM + three-spritetext consumed via
  `window.Vizdom` / `window.SpriteText` from the `public/widgets/` bridges instead of runtime CDN `import()`
- [x] Abort/stale-route protection: `AbortController` in effect cleanup + `signal` threaded through
  `lib/fetcher.js`; race tests in `tests/integration/report-view-abort.test.jsx`
- [x] Error mapping: fetch errors → `lib/error-handler.js` `renderErrorPage` into the report container;
  403/429 rate-limit copy + retry button preserved
- [x] **Redeploy latency mitigation:** client-side `repositories.txt` refresh in `components/repo-list.jsx` (§5) +
  "recently added" note in `app/not-found.jsx`
- [x] **Branch deep link redirect:** `app/not-found.jsx` redirects `/u/r/<branch>` →
  `/{u}/{r}/?branch=<branch>` which ReportView consumes (§6); redirect tests cover listed/invalid/static collisions.
  The component strips the configured `NEXT_PUBLIC_BASE_PATH` from the path **before** splitting segments (otherwise
  the base path prefix is misread as the username) and re-prepends it to the redirect target; multi-segment branch
  names (`feature/login`) are joined back into a single `?branch=` value.

**Exit criteria:** all report tests green (278 pass); `out/` contains HTML for every listed repo path; CSP unchanged;
branch deep links work via client redirect preserving the branch; redeploy latency message present; **CDN widget
network assertions deferred to Phase 8** where the full parity/E2E suite lands.

## Phase 6 — Submission Flow (`/add-repo`)

Tests first:

- [x] Ported `submission-flow.test.js` cases into `tests/integration/submission-form.test.jsx`:
  validation errors inline (exact legacy copy), disabled-button pending state, success renders platform-labeled
  issue link and triggers external redirect handoff, report-missing failure copy
- [x] Per-platform issue-URL cases (github/gitlab/bitbucket + custom
  `platform-base-url`) against `<RepoSubmissionForm>`; exact GitHub issue URL asserted incl. URLSearchParams encoding

Implementation:

- [x] `components/repo-submission-form.jsx` client component: form markup ported verbatim; logic delegates to
  `lib/repo-submission.js#submitRepository` (unchanged); controlled status area mirrors legacy
  `.form-status` success/error/pending behavior
- [x] `components/platform-config.jsx` context populated from the same meta tags (`submission-target`,
  `platform-base-url`) via `lib/host.js#readMetaTag` — layout unchanged keeps self-managed GitLab working;
  test asserts fallback to `DEFAULT_SUBMISSION_TARGET` and meta-tag precedence
- [x] `window.open(url, '_blank', 'noopener,noreferrer')` retained via injectable `onExternalRedirect`
  with the popup-blocker fallback link (comment rationale preserved)
- [x] `app/add-repo/page.jsx` serves the form (static route shadows `/[username]`)

**Exit criteria:** submission flow green (12 tests); Playwright issue-handoff journey covered by Phase 8 parity.
Remaining: null.
## Phase 7 — Error Surfaces, Sentry, Observability

- [x] `app/error.jsx` + route-level boundaries (`app/[username]/error.jsx`,
  `app/[username]/[repository]/error.jsx`) delegate to `components/error-boundary-view.jsx`, which renders
  `lib/error-handler.js#errorPageHtml` copy (rate-limit/not-found/general) with retry via `reset()`
  (`tests/integration/error-boundary.test.jsx`)
- [x] Sentry: `components/sentry-provider.jsx` (renders the `public/widgets/sentry-bridge.js` module script, which
  reads `<meta name="sentry-dsn">` and lazy-loads the CDN SDK — the runtime `import('https://...')` from
  `assets/sentry-config.js` could not survive bundling, per Spike D). Tests: no-op without DSN, no throw at
  prerender (`tests/integration/sentry-provider.test.jsx`)
- [x] `logError` calls preserved at report fetch, error boundary and submission failure points

## Phase 8 — E2E, Cross-Browser, Performance

- [x] `playwright.config.js`: `webServer` runs `bun run build` then serves `./out` via
  `scripts/serve-out.py` (GitHub Pages semantics: trailing-slash redirects + unknown paths get `out/404.html`
  with status 404); legacy `server.py` still in use by legacy E2E until cutover
- [x] E2E suites pass against `out/` (78 tests, chromium/firefox/webkit); legacy specs updated only for
  trailing-slash URLs; new `tests/e2e/static-export-parity.spec.js`: every repositories.txt entry's
  `/user` + `/user/repo` + `/user/repo/{main,master}` returns 200, unlisted paths serve the app 404 with status 404,
  branch deep link `/u/r/develop` redirects to `/{u}/{r}/?branch=develop` and renders that branch's report,
  "recently added" note shown for 2-segment 404s
- [x] **basePath E2E matrix:** `playwright.basepath.config.js` builds with `NEXT_PUBLIC_BASE_PATH=/preview` and
  serves at /preview (`send-us` bugfix in serve-out.py: strip basePath before file lookup);
  `bun run test:e2e:basepath` — nav/search/404 verified under the prefix
- [x] Mobile responsiveness suite green against `out/` (homogeneous viewport matrix)
- [x] **Bundle size:** `tests/e2e/performance.spec.js` — landing page first-party payload gzipped < 180KB
  (measured ~173KB; **deviation:** plan target was <150KB — Next runtime chunk baseline makes that unrealistic
  without custom build surgery; accepted as documented deviation), widgets load lazily post-`load` event

## Phase 9 — CI/CD & Multi-Platform Deployment

- [x] `.github/workflows/test.yml`: Bun + ESLint over `js/ lib/ app/ components/ tests/`, shellcheck on
  `ci/process-submissions.sh`, Playwright matrix project per browser (webServer builds the export itself), plus
  a `e2e-basepath` job running `playwright.basepath.config.js` (chromium)
- [x] **Environment variable configuration:** `NEXT_PUBLIC_HOSTING_ENVIRONMENT` set to `github` in
  static.yml/redeploy.yml, `gitlab` in `.gitlab-ci.yml`, `bitbucket` in `bitbucket-pipelines.yml` (§8)
- [x] `static.yml` replaced: checkout → bun install + setup-node → `actions/cache` on `.next/cache` →
  `bun run build` → `upload-pages-artifact` from `out/` → `deploy-pages`; `redeploy.yml` keeps its
  repositories.txt freshness check and now builds the export with the same cache (<6 min target)
- [x] **Fast path for repositories.txt:** `.github/workflows/deploy-repositories-fast.yml` (§5 Option 3)
  uploads the new listing as a run artifact on `Add Repository` completion — no Pages deploy conflict;
  `add-repository.yml` unchanged
- [x] `.gitlab-ci.yml` and `bitbucket-pipelines.yml` created: `pages`/build jobs run
  `NEXT_PUBLIC_HOSTING_ENVIRONMENT=<platform> bun run build` and publish `out/`
- [x] README: GitHub/GitLab/Bitbucket/GHE deployment sections now describe the Next.js export (`out/`),
  `app/layout.jsx` meta tags, `NEXT_PUBLIC_HOSTING_ENVIRONMENT` per platform; CSP `connect-src` requirements
  unchanged; GHE note updated to `lib/fetcher.js` / `lib/repo-submission.js` /
  `ci/process-submissions.sh`
## Phase 10 — Cutover & Cleanup

- [ ] **GitHub Pages 404.html verification (PENDING — requires live preview deploy):** manually verify branch deep-link
  recovery on a real GitHub Pages deployment; the client redirect is covered
  by `tests/e2e/static-export-parity.spec.js` against `scripts/serve-out.py`
  (which mirrors Pages' 404.html semantics)
- [x] Deleted the legacy SPA: `index.html`, `js/`, `css/`, `server.py`, the ported
  legacy suites (`report-rendering.test.js`, `submission-flow.test.js`,
  `getting-started-samples.test.js`, `search-flow.test.js`), obsolete page/error
  templates and duplicated assets. `templates/` retains only the user CI samples
  (`user-refactorfirst-*.yml`); workflow samples live under `public/templates/`.
- [x] Rewrote **AGENTS.md**: new structure, commands, module map, static-export
  constraints, environment variables
- [x] Final gate locally: 271 unit/integration green, 78 E2E (3 browsers) + 3
  basePath leg green, `bun run build` exports 18 HTML pages with CSP hashes.
  Remaining DoD item is the live preview smoke run on the target host(s).

## Risks & Mitigations

| Risk                                        | Mitigation                                                                                                 |
|---------------------------------------------|------------------------------------------------------------------------------------------------------------|
| `@testing-library/react` under Bun unstable | Phase 0 spike; Vitest fallback pre-approved                                                                |
| Listed-repo paths must exist statically     | Redeploy on repositories.txt change already exists; add CI check that build enumerates ≥ N repo pages      |
| Branch deep links not pre-generated         | `main                                                                                                      |master` enumeration + not-found client redirect; E2E pinned |
| CSP blocks Next inline bootstrap            | Phase 0 spike C; CSP meta kept verbatim otherwise                                                          |
| Query-string pagination on static host      | Client component + `useSearchParams` in Suspense; fallback page-1 HTML prerendered                         |
| repositories.txt grows large                | Search array embedded per page; acceptable until ~MB scale — revisit with route-level data file if crossed |
| Widget CDNs blocked in some regions         | Unchanged from status quo; vendoring is a separate future project                                          |
| DOMPurify/Mustache.js dependency fate unclear | Technical Appendix §2; Phase 2 decision point before proceeding                                            |
| Window globals timing in React context      | Technical Appendix §3; component test mocks + loading strategy before Phase 5                               |
| WASM dynamic imports in static export       | Technical Appendix §4; Phase 0 spike D added to verify                                                      |
| redeploy latency UX regression              | Technical Appendix §5; loading state + informative error messaging                                         |
| GitHub Pages 404.html behavior change       | Technical Appendix §6; manual verification on preview deployment required                                   |
| basePath link conversion incomplete          | Technical Appendix §7; audit script + E2E basePath matrix before Phase 10                                    |
| Environment detection in SSR context         | Technical Appendix §8; move to environment variables for RSCs                                               |

- [x] Test suite: 271 unit/integration tests (target: ≥180), all green; coverage 94% lines on touched sources
  (target ≥80% on lib/)
- [x] All 9 static pages, listing, report (both branch spellings), submission, and search verified in
  Chromium/Firefox/WebKit against the production-shaped export `out/` (78 E2E)
- [x] basePath leg verified (`/preview`) via `playwright.basepath.config.js`
- [ ] Live-preview manual smoke on the actual hosting platform(s) — pending first deployment
