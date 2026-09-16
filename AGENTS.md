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
                            # workflow-sample, platform-config, sentry-provider
lib/                        # shared logic (client + RSC): routes, fetcher,
                            # renderer, search, utils, host, rate-limiter,
                            # cache-manager, error-handler, repo-submission,
                            # report-view, static-params, widget-loader; the
                            # Node-side listing loader is lib/repositories.js
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

## Current Test Count

~271 unit/integration + 81 E2E (three browsers + basePath leg).
