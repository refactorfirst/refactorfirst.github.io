# RefactorFirst Pages — Agent Guide

## Project Overview

A purely client-side site that renders RefactorFirst reports by fetching
`.refactorfirst/refactor-first.json` directly from GitHub/GitLab/Bitbucket. Built
as a **Next.js static export** (`output: 'export'`): Server Components render the
static shells, client components (`components/`) own all interactivity. The export
in `out/` is served by any static host (GitHub Pages, GitLab Pages, Bitbucket).

**Key Features:**
- Search over curated repository listing (`repositories.txt`)
- Dark mode, 100% CSS switching (`components/theme-toggle.jsx` +
  `plans/css-only-dark-mode.md`): three radios (light/dark/system) on the
  right side of the `.theme-bar` row below the header, rendered by
  `app/layout.jsx` — the breadcrumb trail shares the row on report routes
  (crumbs left, toggle right, vertically centered; the right-edge mirror
  of the breadcrumbs' left-edge alignment) — palettes selected in
  `app/globals.css` via `:root:has(#rf-theme-…:checked)` +
  `prefers-color-scheme`; an inline pre-paint script in `app/layout.jsx`
   only restores/persists the choice (CSP-hashed by the build). Chart
  legends are canvas-drawn, so they can't follow the CSS switch:
  `resolveLegendTextColor`/`bindThemeChartRedraw` in `lib/report-view.js`
  resolve a per-theme legend color (>= 4.5:1 on each `--bg-color`) and
  redraw live charts on radio/`prefers-color-scheme` changes. Guards:
  `tests/unit/theme-css.test.js` (the two dark blocks must stay
  byte-identical; all hex colors live in the palette blocks; dark palette
  passes the same WCAG AA math as `tests/unit/css-a11y.test.js`)
- Breadcrumb trail on the theme bar row under the menu
  (`components/breadcrumbs.jsx` + `lib/breadcrumbs.js`): mirrors
  `/user/repo/branch` with linked ancestors;
  the repo crumb never self-links, and ReportView announces the resolved
  branch (`rf:branch-resolved` event) so the label matches the loaded report
  (`main` 404 → `master` fallback)
- Reports rendered with Mustache.js (bundled template is authoritative)
- Graphs synthesized client-side from the nested hierarchy in
  refactor-first.json (`lib/hierarchy-dot.js`, byte-identical to the report
  module's Java `NestedDotBuilder`; packages nest as clusters, classes as
  ellipses, break-up packages fill pink). The package map renders the flat
  relationship graph — one ellipse per package with only the weighted
  edges, break-up packages in red — through vizdom like the class and
  cycle graphs; every graph's nodes are hyperlinked to their source
  files/directories via `project.repoUrl` (http(s)-gated, new tab
  restored post-render since vizdom drops the target); hovering a vizdom
  edge highlights it plus both endpoints, hovering (or keyboard-focusing)
  a node highlights its incoming edges + source nodes and outgoing edges +
  sink nodes in two directional colors (`bindGraphHoverHighlights` in
  `lib/report-view.js` derives the neighbor model from the vizdom
  `<title>` texts and toggles `rf-hover-*` classes, styled per palette via
  `--graph-hover-*`); highlighted nodes fill with their accent and their
  label glyphs re-ink to `--graph-hover-on` (white on the dark light-mode
  accents, black on the bright dark-mode accents) to keep AA contrast; the
  2D/3D popups carry the same directional model (`bindSigmaHoverHighlight`
  for the sigma 2D popup — node hover only, sigma 2.4 has no edge events —
  and the hover block in `createForceGraph` for the 3D force graph, which
  also highlights hovered links), resolving accents from the JS mirror
  `GRAPH_HOVER_ACCENTS` in `lib/report-view.js`: the canvas-drawn 2D popup
  follows the active palette like the SVGs, while the 3D popup's WebGL
  canvas is always dark and therefore always uses the dark values. The 3D
  popup's hover highlighting is always on (per-hover sprite recoloring
  touches only nodes whose state changed, keeping it O(changed)), and
  while nothing is highlighted the DOT graph's own colors show — each
  link's DOT color (red removals, white fallback) and each node's DOT
  color on its sprite label; the full
  hierarchy stays in refactor-first.json for LLM consumption
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
                            # hero-search, menu-search, menu-toggle, breadcrumbs
                            # (route trail under the menu), workflow-sample,
                            # platform-config, sentry-provider,
                            # toast-notification (copy feedback live region)
lib/                        # shared logic (client + RSC): routes, fetcher,
                            # renderer, search, utils, host, rate-limiter,
                            # cache-manager, error-handler, repo-submission,
                            # report-view, static-params, widget-loader,
                            # breadcrumbs, hierarchy-dot (hierarchy-to-DOT
                            # synthesis mirroring the Java NestedDotBuilder in
                            # the report module; byte-identical goldens in
                            # tests/unit/hierarchy-dot.test.js),
                            # table-operations (filter/sort/paginate/CSV/copy +
                            # TABLE_CONFIG + REPORT_TABLES descriptors),
                            # table-enhancer (binds toolbar/sort/pagination/
                            # copy onto the rendered report DOM); the Node-side
                            # listing loader is lib/repositories.js
public/                     # static files copied verbatim into out/:
  repositories.txt          #   synced from the repo root (sync-repositories.mjs)
  assets/                   #   mustache template, logo
  templates/                #   workflow-sample-*.html fragments
  widgets/                  #   module bridges: vizdom WASM, force-graph
                            #   (3D graph + sprite labels sharing one
                            #   three build),
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
- **Theming:** see the dark-mode bullet above — the radios in
  `components/theme-toggle.jsx` are the single source of truth; never add
  JS-driven styling. All colors must be custom properties declared only in
  the four palette blocks (`:root`, `html:root` mvp overrides, and the two
  identical dark blocks) in `app/globals.css`; mvp.css light overrides must
  stay on `html:root` (mvp loads after the bundle). Report-template
  widgets that hardcode light colors are re-driven from `main#app …`
  rules there (the mustache stays byte-identical); the vizdom graph
  SVGs' embedded black strokes/fills are likewise re-themed to
  `--graph-line` (`#9fb0c0` dark = `CHART_LEGEND_TEXT.dark`) via
  `path[stroke]`/`polygon` selectors on `.fullscreen-svg` — red cycle
  edges stay red — and the package clusters (`g.cluster rect[fill="white"]`,
  the packages that do not need to be broken up) re-drive their fill to
  `--bg-color` with their label glyph paths via a rect-sibling selector, so
  the boxes match the page in dark mode. Break-up clusters
  (`g.cluster rect[fill="pink"]`) re-drive through their own
  `--graph-breakup-fill` (light: vizdom's baked `#ffc0cb`; dark: a deep rose
  `#7f3350` that keeps the `--graph-line` edges crossing the box visible)
  and `--graph-breakup-line` ink (light: baked black; dark: light pink
  `#f2b8cd` for the boundary + label) — no fill can pass 3:1 against both
  the near-black page and the light edges, so the fill prioritizes edge
  visibility and the pink ink carries the perceivable boundary. Graph DOT
  is synthesized
  from the `.hierarchy` payloads
  (`classMap`/`packageMap`/`largestCycle`, see `lib/hierarchy-dot.js`);
  edge labels are fill-only glyph paths baked by vizdom, so CSS can't
  reach them: the dark palette bakes `fontcolor = "#9fb0c0"` into every
  edge at synthesis time via `graphDotOptions()` in `lib/report-view.js`
  (vizdom uppercases the hex in the SVG), and theme switches
  re-synthesize + re-render the graphs via `redrawGraphsForTheme` alongside
  the chart legend redraw in `bindThemeChartRedraw`. Node labels sit on
  vizdom's white shapes and keep the baked black ink in the non-hover
  state (hovered or keyboard-focused node labels re-ink to
  `--graph-hover-on`), while cluster labels are recolored by CSS along
  with their rects (regular clusters' label glyphs follow `--graph-line`,
  break-up clusters' labels take `--graph-breakup-line`).

## Report Tables (Enhanced)

- Every data table in the report (class/package relationships, disharmony
  findings, cycle summary, cycle breakdown) is enhanced: sticky `thead th`,
  toolbar (match live region + copy hint left; search + CSV export right —
  the `.rf-table-block` wrapper shrink-wraps the table and the toolbar uses
  `contain: inline-size` so controls align with the table's right edge),
  sortable th buttons with `aria-sort`, pagination below 20+ row tables, and
  click/Enter/Space cell copy with toast feedback. The filter prompt lives in
  the input's placeholder ("Filter table...", with a screen-reader-only
  label); the clear control is an × button overlaid on the input's right
  edge (accessible name "Clear the … table filter"), revealed only while the
  box holds a term and invoked by click or Escape while the box has focus.
- Tables open sorted by their Priority column ascending (▲, priority 1
  first), signalling both the report's priority ordering and that headers are
  sortable (`TABLE_CONFIG.sorting` defaults in lib/table-operations.js);
  `resolveSortKey` maps the semantic `priority` key onto disharmony tables'
  dynamic `col<n>` keys via a label match, tables without a Priority column
  keep the original report ordering, and clicking the default-sorted column
  flips it to descending (sort toggling starts from the effective default).
- Horizontal scrollbar: tables wider than the viewport get `overflow-x: auto`
  via the `rf-scroll-x-enabled` class, toggled by `lib/table-enhancer.js`
  after measuring `wrapper.scrollWidth > clientWidth` (re-measured on each
  re-render and on window resize). It MUST stay conditional — any overflow
  ancestor becomes the sticky constraint container and breaks the
  viewport-sticky `thead th`. The unwrapped problem/solution tables (no
  `data-rf-table`, no `.rf-table-scroll`, no sticky header) instead get an
  unconditional `overflow-x: auto` from a `main#app` rule in globals.css so
  their nowrap rows scroll inside the 5px border on narrow screens
  (guarded by tests/unit/report-template-wcag.test.js and
  tests/e2e/report-overflow.spec.js). Scrolling tables keep their header pinned
  anyway: `refreshStickyHeaders` in lib/table-enhancer.js compensates by
  translating every `thead th` down by the viewport scroll offset (clamped to
  the table's bottom edge) on window scroll/resize; narrow tables keep pure
  CSS stickiness and stale transforms are cleared when overflow goes away.
- Pipeline: `prepareReportData(data, tableStates, TABLE_CONFIG)` in
  lib/renderer.js applies **filter → sort → paginate** per table and injects
  `tableUi` blocks the mustache template renders; `enhanceTables` in
  lib/table-enhancer.js binds the controls and reports state changes back to
  components/report-view.jsx, which re-renders (widgets never gate the
  render — charts/graphs enhance progressively via `onWidgetReady`
  callbacks when their widget reports ready; the search input's focus/caret
  is restored after each re-render). The expensive `enhanceReport` pipeline
  (Chart.js charts, WASM DOT layout) runs only when the payload changes —
  it receives `{charts, graphs}` readiness flags so still-loading widgets
  are skipped and picked up by the widget-readiness effect instead — and
  table-state re-renders stash the live chart canvases / graph containers
  before the innerHTML swap and graft them back into the fresh DOM
  (`statefulElementIds`/`stashStatefulDom`/`graftStatefulDom` in
  lib/report-view.js), re-binding only the cheap popup handlers.
- Initial render performance (LCP/CLS): the report markup renders as soon
  as the parallel template + report-JSON fetches resolve, never waiting on
  the CDN widgets or the ~4.8MB vizdom wasm. The report page shells
  (`[username]/[repository]/page.jsx` + `[branch]/page.jsx`) preconnect to
  raw.githubusercontent.com (the report JSON host; CORS fetch) and
  cdnjs.cloudflare.com (classic widget scripts) and render the loading
  placeholder inside `#report-container` — the same id the hydrated
  ReportView renders — with a full-viewport `min-height: 100svh` (vh
  fallback) in app/globals.css, so the footer starts below the fold and
  the report's arrival causes no layout shift. The vizdom bridge
  (`public/widgets/vizdom-bridge.js`) serves the wasm from Cache Storage
  (versioned cache name) so repeat visits never re-download it regardless
  of the host's HTTP cache headers.
- Search `<input>`s are injected by table-enhancer — `<input>` is FORBID in
  the renderer's sanitization allow-list, so it must never appear in the
  mustache template.
- CSV export honors the current filter + sort but ignores pagination;
  filenames are `refactorfirst-<table>-<ISO timestamp>.csv`.

## Current Test Count

~787 unit/integration + ~232 E2E (~202 across three browsers + 4 basePath leg + 30 dark mode).

WCAG 2.2 AA / HTML5 guards live in tests/unit/html5-attributes.test.js,
tests/unit/report-template-wcag.test.js, tests/unit/css-a11y.test.js and
tests/unit/page-titles.test.js — the report mustache keeps a single h1,
scoped table headers, captions, labelled canvases and a named nav; obsolete
presentational attributes are FORBID_ATTR-stripped in lib/renderer.js. The
report-template-wcag guard also asserts sticky-header CSS, per-table
toolbars/aria-labelled export buttons and pagination navs, valid `aria-sort`
on every enhanced th, sortable keyboard-operable header buttons and live
match-count regions.
