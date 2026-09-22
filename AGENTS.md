# RefactorFirst Pages — Agent Guide

## Project Overview

A purely client-side site that renders RefactorFirst reports by fetching
`.refactorfirst/refactor-first.json` directly from GitHub/GitLab/Bitbucket. Built
as a **Next.js static export** (`output: 'export'`): Server Components render the
static shells, client components (`components/`) own all interactivity. The export
in `out/` is served by any static host (GitHub Pages, GitLab Pages, Bitbucket).

**Key Features:**
- Search over curated repository listing (`repositories.txt`)
- Reports rendered with Mustache.js (bundled template is authoritative)
- Enhanced report tables: sticky headers, pagination (>20 rows), sortable
  columns, in-table search, CSV export, click/keyboard cell copy with toasts
- Repository submission via pre-filled platform issues — no login, apps or tokens
- Fully static deploy; deep links handled via generateStaticParams + `404.html`

## Development Setup

```bash
bun install                  # install dependencies
bun run dev                  # next dev at http://localhost:3000
bun run build                # static export to out/ (sync repositories + next build + CSP hashes)
python3 scripts/serve-out.py # serve out/ at :8003 with GitHub Pages 404 semantics
```

## Testing Commands

**Unit + Integration Tests (Bun):**
```bash
bun test tests/unit tests/integration           # run all
bun test --watch tests/unit                     # watch mode
bun test --coverage tests/unit tests/integration # coverage report
```

**E2E Tests (Playwright) — always against the built export:**
```bash
npx playwright install        # one-time: download browsers
npx playwright test           # full E2E (builds out/, all 3 browsers)
bun run test:e2e:basepath     # NEXT_PUBLIC_BASE_PATH=/preview leg (chromium)
```

**Linting:**
```bash
npx eslint "lib/**/*.js" "app/**/*.{js,jsx}" "components/**/*" "tests/**/*"
```

## Project Structure

```
app/                        # Next.js App Router (static export)
  layout.jsx                # CSP meta, header/footer, submission-target meta
  not-found.jsx             # 404 page + branch deep-link redirect (§6)
  error.jsx                 # global error boundary (+ per-route boundaries)
  page.jsx                  # landing (/)
  add-repo|about|api|.../page.jsx    # static content pages
  [username]/page.jsx       # user listing (pagination client-side)
  [username]/[repository]/page.jsx   # report shell
  [username]/[repository]/[branch]/page.jsx  # main|master pre-generated
  globals.css               # css/main.css + components.css
components/                 # client components: report-view, repo-list,
                            # repo-submission-form, search-combobox,
                            # hero-search, menu-search, menu-toggle,
                            # workflow-sample, platform-config, sentry-provider,
                            # toast-notification (copy feedback live region)
lib/                        # shared logic (client + RSC): routes, fetcher,
                            # renderer, search, utils, host, rate-limiter,
                            # cache-manager, error-handler, repo-submission,
                            # report-view, static-params, widget-loader,
                            # table-operations (filter/sort/paginate/CSV/copy +
                            # TABLE_CONFIG + REPORT_TABLES descriptors),
                            # table-enhancer (binds toolbar/sort/pagination/
                            # copy onto the rendered report DOM); the Node-side
                            # listing loader is lib/repositories.js
public/                     # static files copied verbatim into out/:
  repositories.txt          #   synced from the repo root (sync-repositories.mjs)
  assets/                   #   mustache template, logo
  templates/                #   workflow-sample-*.html fragments
  widgets/                  #   module bridges: vizdom WASM, three-spritetext,
                            #   sentry (runtime CDN imports cannot be bundled)
templates/                  # user CI samples (user-refactorfirst-*.yml) for the docs
ci/process-submissions.sh   # shared submission validator for GH/Gl/BB CI
.github/workflows/          # test.yml, static.yml, redeploy.yml,
                            # add-repository.yml, deploy-repositories-fast.yml
.gitlab-ci.yml              # GitLab Pages: build out/ → public/
bitbucket-pipelines.yml     # Bitbucket build producing out/
scripts/                    # sync-repositories.mjs, fix-csp-hashes.mjs, serve-out.py
tests/                      # unit/ (Bun), integration/ (Bun + RTL/jsdom), e2e/ (Playwright)
```

## Development Workflow

**TDD is mandatory** — write failing tests before production code:

1. Write a failing test in `tests/unit/` (pure module logic) or `tests/integration/` (RTL/jsdom)
2. Run `bun test tests/unit tests/integration` and watch it fail
3. Write the minimal implementation in `lib/` / `components/` / `app/`
4. Refactor while keeping tests green

**Accessibility is mandatory** — every feature MUST comply with WCAG 2.2 AA
and all markup MUST use HTML5-valid elements/attributes (no obsolete
presentational attributes; presentation lives in CSS). New pages, components
and template changes must keep the a11y guards green:
`tests/unit/html5-attributes.test.js`, `tests/unit/report-template-wcag.test.js`,
`tests/unit/css-a11y.test.js`, `tests/unit/page-titles.test.js` — and add
coverage there when introducing new markup patterns.

## Platform-Aware Sections in This Repo

- **CSP** lives in `app/layout.jsx` (`script-src` includes the CDN widget hosts and
  `wasm-unsafe-eval`); after `next build`, `scripts/fix-csp-hashes.mjs` injects
  sha256 hashes of the inline bootstrap scripts into the exported HTML's CSP meta —
  keep it in the build pipeline.
- **Static export constraints:** `dynamicParams = false` on dynamic routes;
  `generateStaticParams` enumerates `(username)`, `(username, repository)` and
  `(username, repository, main|master)` from `repositories.txt`; new repos render
  client-side immediately thanks to the client-side listing refresh and the
  `?branch=` deep-link redirect in `app/not-found.jsx`.
- **Widget loading:** CDN scripts load via `next/script` `lazyOnload` inside
  `components/report-view.jsx`, registered through `lib/widget-loader.js`);
  wasm/ESM bridges in `public/widgets/` run as native module scripts.
- **Environment config:** meta tags in `app/layout.jsx` (`submission-target`,
  `sentry-dsn`, `platform-base-url`) plus `NEXT_PUBLIC_HOSTING_ENVIRONMENT`
  / `NEXT_PUBLIC_BASE_PATH` at build time.

## Report Tables (Enhanced)

- Every data table in the report (class/package relationships, disharmony
  findings, cycle summary, cycle breakdown) is enhanced: sticky `thead th`,
  toolbar (match live region + copy hint left; search + CSV export right —
  the `.rf-table-block` wrapper shrink-wraps the table and the toolbar uses
  `contain: inline-size` so controls align with the table's right edge),
  sortable th buttons with `aria-sort`, pagination below 20+ row tables, and
  click/Enter/Space cell copy with toast feedback. The filter's clear control
  is an × button (accessible name "Clear the … table filter").
- Horizontal scrollbar: tables wider than the viewport get `overflow-x: auto`
  via the `rf-scroll-x-enabled` class, toggled by `lib/table-enhancer.js`
  after measuring `wrapper.scrollWidth > clientWidth` (re-measured on each
  re-render and on window resize). It MUST stay conditional — any overflow
  ancestor becomes the sticky constraint container and breaks the
  viewport-sticky `thead th`. Scrolling tables keep their header pinned
  anyway: `refreshStickyHeaders` in lib/table-enhancer.js compensates by
  translating every `thead th` down by the viewport scroll offset (clamped to
  the table's bottom edge) on window scroll/resize; narrow tables keep pure
  CSS stickiness and stale transforms are cleared when overflow goes away.
- Pipeline: `prepareReportData(data, tableStates, TABLE_CONFIG)` in
  lib/renderer.js applies **filter → sort → paginate** per table and injects
  `tableUi` blocks the mustache template renders; `enhanceTables` in
  lib/table-enhancer.js binds the controls and reports state changes back to
  components/report-view.jsx, which re-renders (widgets only gate the first
  render; the search input's focus/caret is restored after each re-render).
  The expensive `enhanceReport` pipeline (Chart.js charts, WASM DOT layout)
  runs only when the payload changes — table-state re-renders stash the live
  chart canvases / graph containers before the innerHTML swap and graft them
  back into the fresh DOM (`statefulElementIds`/`stashStatefulDom`/
  `graftStatefulDom` in lib/report-view.js), re-binding only the cheap popup
  handlers.
- Search `<input>`s are injected by table-enhancer — `<input>` is FORBID in
  the renderer's sanitization allow-list, so it must never appear in the
  mustache template.
- CSV export honors the current filter + sort but ignores pagination;
  filenames are `refactorfirst-<table>-<ISO timestamp>.csv`.

## Current Test Count

~485 unit/integration + 175 E2E (171 across three browsers + 4 basePath leg).

WCAG 2.2 AA / HTML5 guards live in tests/unit/html5-attributes.test.js,
tests/unit/report-template-wcag.test.js, tests/unit/css-a11y.test.js and
tests/unit/page-titles.test.js — the report mustache keeps a single h1,
scoped table headers, captions, labelled canvases and a named nav; obsolete
presentational attributes are FORBID_ATTR-stripped in lib/renderer.js. The
report-template-wcag guard also asserts sticky-header CSS, per-table
toolbars/aria-labelled export buttons and pagination navs, valid `aria-sort`
on every enhanced th, sortable keyboard-operable header buttons and live
match-count regions.
