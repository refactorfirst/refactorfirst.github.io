# RefactorFirst GitHub Pages Application

A purely client-side static web application that renders
[RefactorFirst](https://github.com/refactorfirst/refactorfirst) reports by fetching
`.refactorfirst/refactor-first.json` data directly from repositories. No server-side code and no database — the site
is a **Next.js static export** (`bun run build` produces `out/`, which any static host can serve).

- **Search** over a curated listing of repositories (`repositories.txt`)
- **Reports** rendered with Mustache.js from raw platform content, with `main` → `master`
  branch fallback — the same report the
  [RefactorFirst report viewer](https://github.com/RefactorFirst/RefactorFirst) produces:
  class/package maps (vizdom WASM SVGs with pan/zoom, plus Sigma 2D and 3D force-graph popups), relationship-removal
  priority tables, Chart.js disharmony bubble charts and class cycle summaries — with
  [enhanced tables](#enhanced-report-tables) (sticky headers, pagination, sorting, search, CSV export, copy)
- **Repository submission** via a pre-filled issue on the hosting platform (no login, apps or tokens on this site): your
  platform account is captured as the issue author and validated server-side by the platform's CI
- Reports and submissions work for repositories hosted on the same platform as the deployment (GitHub, GitLab or
  Bitbucket)
- **Accessible**: the site and rendered reports target **WCAG 2.2 AA**, with automated checks for selected requirements
  such as semantic HTML5, color contrast, per-page titles, table semantics, labeled controls and landmarks
- Works with a plain static file server: `python3 -m http.server 8000`

---

## Table of Contents

- [Project Layout](#project-layout)
- [Deploying to GitHub Pages (organization or personal account)](#deploying-to-github-pages-organization-or-personal-account)
- [Deploying to GitHub Enterprise Server](#deploying-to-github-enterprise-server)
- [Deploying to Bitbucket](#deploying-to-bitbucket)
- [Deploying to GitLab](#deploying-to-gitlab)
- [How repository submission works](#how-repository-submission-works)
- [Enhanced report tables](#enhanced-report-tables)
- [Making Changes (Developer Guide)](#making-changes-developer-guide)
- [Testing](#testing)

---

## Project Layout

```
app/                          # Next.js App Router (static export): layout
                              # (CSP, header/footer), static pages, 404 +
                              # pipeline error surfaces, and the dynamic
                              # routes /{user}, /{user}/{repo},
                              # /{user}/{repo}/{branch}
components/                   # Client components (search combobox, hero/menu
                              # search, menu toggle, workflow sample, user
                              # listing, report view, submission form,
                              # platform-config context, sentry provider)
lib/                          # Shared logic consumed by client components and
                              # RSC alike (routes, fetcher, renderer, search,
                              # repo-submission, error-handler, rate-limiter,
                              # cache-manager, utils, host, report-view,
                              # static-params, widget-loader)
public/                       # Published verbatim: repositories.txt, assets/
                              # (mustache template, logo), templates/
                              # (workflow samples), widgets/ (WASM + ESM
                              # bridges for vizdom, three-spritetext, Sentry)
repositories.txt              # Listed repositories, one "user/repo" per line
ci/process-submissions.sh     # Shared submission validator used by GitHub
                              # Actions, GitLab CI and Bitbucket Pipelines
templates/                    # User CI samples: user-refactorfirst-workflow.yml,
                              # user-refactorfirst-gitlab-ci.yml,
                              # user-refactorfirst-bitbucket-pipeline.yml
.gitlab-ci.yml                # Deploys the static export (out/) to GitLab Pages
bitbucket-pipelines.yml       # Builds out/ on Bitbucket Pipelines
tests/                        # unit/ (Bun), integration/ (Bun + RTL), e2e/ (Playwright
                              # against the built out/ via scripts/serve-out.py)
.github/workflows/            # test.yml, static.yml, redeploy.yml,
                              # add-repository.yml, deploy-repositories-fast.yml
```

---

## Deploying to GitHub Pages (organization or personal account)

### 1. Fork or create the repository

- **Personal account**: create a repository named `<username>.github.io`.
- **Organization**: create a repository named `<orgname>.github.io` in the org, or any project repository if you want a
  project page (`https://<org>.github.io/<repo>/`).

### 2. Push this project's files

This project is a Next.js app that builds a static export (`out/`). Push this directory to the default branch — the
included
`.github/workflows/static.yml` workflow builds the export (`bun run build`)
and deploys `out/` to GitHub Pages:

```bash
git init
git add .
git commit -m "RefactorFirst Pages site"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Set `NEXT_PUBLIC_BASE_PATH=/<repo>` for a project page (`https://<org>.github.io/<repo>/`).

### 3. Enable GitHub Pages

Go to **Settings → Pages**:

- **Source**: *GitHub Actions* (required — `static.yml` and the scheduled redeployment in
  `.github/workflows/redeploy.yml` both build the Next.js static export and upload `out/`).

The included `redeploy.yml` workflow redeploys every 10 minutes, but only when
`repositories.txt` changed in the last 15 minutes. The `add-repository.yml` workflow reacts to newly opened submission
issues, validates the submitter and commits new entries to `repositories.txt`.

### 4. Configure the submission target

"Add Your Repo" submissions are pre-filled issues created in the listing repository. Point the site at your repository
via the meta tag in
`app/layout.jsx`:

```html

<meta name="submission-target" content="<owner>/<repo>">
```

No GitHub Apps, OAuth apps, client IDs or secrets are needed — identity is captured by GitHub as the issue author. See
[How repository submission works](#how-repository-submission-works).

### 5. (Optional) Custom domain

Add a `CNAME` file containing your domain (e.g. `reports.example.com`), configure your DNS (CNAME record pointing to
`<owner>.github.io`), and enable **Enforce HTTPS**
in Settings → Pages.

---

## Deploying to GitHub Enterprise Server

The application is fully static, so it works on any GitHub Enterprise Server (GHES)
instance with Pages enabled.

### 1. Enable Pages on the appliance

A site admin must enable GitHub Pages for the instance (**Management Console → Pages → Enable**), then create the
repository (`<owner>.<pages-host>` or a project repo) and push this project as described above.

### 2. Point the app at your enterprise endpoints

Raw content and API calls default to `github.com` / `raw.githubusercontent.com`
/ `api.github.com`. For a self-hosted instance, update the URL builders:

- `lib/fetcher.js` — the `github` entry of `PLATFORM_BUILDERS` should build URLs like
  `https://github.example.com/raw/<user>/<repo>/<branch>/.refactorfirst/refactor-first.json`.
- `lib/repo-submission.js` — `repositoryInfoUrl()` and `buildSubmissionIssueUrl()`
  github branches must target your instance (`https://github.example.com/...`).
- `ci/process-submissions.sh` — set `GH_API` (and raw URL handling) to your instance endpoints (`GH_HOST` is respected
  by `gh`-style tooling).
- `app/layout.jsx` — extend the CSP `connect-src` directive with your instance host and set the `submission-target` meta
  to your listing repository.

(Tip: keep these behind a single `config` module such as `enterprise-config.json`
if you need to support multiple deployments from one codebase.)

### 3. Workflows

`add-repository.yml` and `redeploy.yml` use the built-in `GITHUB_TOKEN`;
`ci/process-submissions.sh` needs only `curl` and `jq` (preinstalled on Actions runners). If your instance lacks
internet access, ensure raw/API endpoints are reachable from the browser — reports and submission pre-checks are
**client-side**, so *end users'* browsers (not the server) must be able to reach your GHES host.

---

## Deploying to Bitbucket

A Bitbucket deployment lists Bitbucket-hosted repositories: report fetching and submission use
`bitbucket.org/.../raw/...` and the Bitbucket REST API.

### 1. Create the site repository

- **Personal account**: create a repository named `<username>.bitbucket.io`.
- **Workspace/team**: static sites are per-workspace: `<workspace>.bitbucket.io`.

### 2. Push the files

```bash
git init
git add .
git commit -m "RefactorFirst Pages site"
git remote add origin git@bitbucket.org:<workspace>/<workspace>.bitbucket.io.git
git push -u origin main
```

Run `NEXT_PUBLIC_HOSTING_ENVIRONMENT=bitbucket bun run build` locally or let the included `bitbucket-pipelines.yml` run
it in CI, then publish the generated
`out/` directory to `https://<workspace>.bitbucket.io` (Bitbucket serves the uploaded static tree; deep links to
`/{user}/{repo}` paths rely on the exported `_404`/`404.html` fallback semantics — where unavailable, share the
two-segment URLs from search results which are pre-generated).

### 3. Enable submission processing

The site is detected as `bitbucket` from the `<workspace>.bitbucket.io`
hostname (or via `NEXT_PUBLIC_HOSTING_ENVIRONMENT=bitbucket` at build time); set `submission-target` in `app/layout.jsx`
to
`<workspace>/<workspace>.bitbucket.io`, enable the issue tracker on that repository and extend the CSP `connect-src`
with `https://api.bitbucket.org`
and `https://bitbucket.org`.

Bitbucket has no issue-triggered pipelines, so submissions are processed by the custom `process-submissions` pipeline in
`bitbucket-pipelines.yml`:

1. In the repository go to **Pipelines → Schedules** and schedule
   `custom: process-submissions` (e.g. every 10 minutes).
2. Create a workspace **OAuth consumer** with `issues:write` and
   `repositories:write` scopes and store its credentials as the **secured**
   repository variables `BITBUCKET_CLIENT_ID` / `BITBUCKET_CLIENT_SECRET`
   (server-side CI secrets only — the site itself never sees them).

The pipeline polls open issues titled `Add repository: owner/repo`, checks the author has `write`/`admin` permission on
the repository, verifies the report file exists, commits `repositories.txt` and closes the issue with the outcome. The
manual `sort-repos` pipeline from the shipped `bitbucket-pipelines.yml`
also normalizes the listing on demand.

> **Users generating reports on Bitbucket**: point them at
> `templates/user-refactorfirst-bitbucket-pipeline.yml` — a copy-paste pipeline that
> runs `mvn refactorfirst:jsonReport` and commits `.refactorfirst/refactor-first.json`
> on every push to `main`/`master`.

---

## Deploying to GitLab

### 1. Create the project

- **Personal account**: create a project named `<username>.gitlab.io`.
- **Group**: create a project named `<groupname>.gitlab.io`, or any project for a project page at
  `https://<group>.gitlab.io/<project>/`.

### 2. Add a Pages pipeline

This repository ships a ready-to-use `.gitlab-ci.yml`: the `pages` job runs
`bun run build` (the Next.js static export) with
`NEXT_PUBLIC_HOSTING_ENVIRONMENT=gitlab` and publishes `out/` as the Pages `public/` directory:

```yaml
pages:
  stage: build
  script:
    - bun install
    - NEXT_PUBLIC_HOSTING_ENVIRONMENT=gitlab bun run build
    - mkdir -p public && cp -r out/. public/
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

### 3. Push

```bash
git init
git add .
git commit -m "RefactorFirst Pages site"
git remote add origin https://gitlab.com/<group>/<project>.git
git push -u origin main
```

GitLab Pages deploys from the `pages` job and serves
`https://<group>.gitlab.io/<project>/`.

### 4. GitLab-specific considerations

- **Client-side routing**: GitLab Pages serves `404.html` for unknown paths; the Next.js export already produces
  `out/404.html` (from `app/not-found.jsx`), which handles branch deep-link recovery — no extra copy step needed.
- **Submission processing**: set `submission-target` in `app/layout.jsx` to your
  `<group>/<project>`, extend the CSP `connect-src` with your GitLab base (`https://gitlab.com` or your self-managed
  host), and create a pipeline schedule (**CI/CD → Schedules**, e.g. every 10 minutes) — GitLab has no issue-triggered
  pipelines, so the `process-submissions` job in
  `.gitlab-ci.yml` polls open submission issues. For **self-managed GitLab**
  also add `<meta name="platform-base-url" content="https://your-gitlab.example.com">`. The job uses `CI_JOB_TOKEN` by
  default; if your GitLab version/instance restricts its API scope, set a masked `GITLAB_TOKEN` CI variable with a
  project access token (`api` scope) instead.
- **Listing redeploys**: schedule another pipeline (or extend the same one) to re-run `pages` when `repositories.txt`
  changed.
- **Custom domains**: set up under **Settings → Pages** with automatic Let's Encrypt certificates. Note: the
  hostname-based environment detection only recognises
  `*.gitlab.io`; on a custom domain set `NEXT_PUBLIC_HOSTING_ENVIRONMENT=gitlab`
  at build time so the app identifies as GitLab.

> **Users generating reports on GitLab**: point them at
> `templates/user-refactorfirst-gitlab-ci.yml` — a copy-paste pipeline that runs
> `mvn refactorfirst:jsonReport` on the default branch and commits
> `.refactorfirst/refactor-first.json` back using the built-in `CI_JOB_TOKEN`.

---

## Enhanced report tables

Large report tables (class/package relationships, disharmony findings, cycle summaries and cycle breakdowns) are
interactive — all WCAG 2.2 AA and keyboard-operable, with no extra dependencies:

- **Sticky headers** — column headers stay pinned to the top of the viewport while you scroll a table.
- **Pagination** — tables with more than 20 matching rows paginate at 20 rows per page ("Page X of Y" + Previous/Next
  buttons; disabled on the first/last page). Small tables render in full without controls.
- **Sorting** — click a column header (or focus it and press Enter/Space) to sort the whole table ascending; click
  again for descending. `aria-sort` reflects the current direction, sorting happens before pagination, and the sort is
  kept while navigating pages.
- **Search/filter** — the filter box sits at the right edge of the table (next to Export) and narrows rows
  case-insensitively across all columns (debounced), with the match count announced via a live region and an **×**
  button to reset.
- **CSV export** — "Export CSV" downloads the entire table (current filter and sort applied, pagination ignored) with
  proper escaping; the filename includes the table name and a timestamp.
- **Horizontal scrolling** — when a table is wider than the screen its wrapper gains a horizontal scrollbar
  (`rf-scroll-x-enabled`, toggled by measurement in `lib/table-enhancer.js`); the scrollbar is deliberately conditional
  because an unconditional `overflow-x` would break the viewport-sticky table header.
- **Copy cells** — click any cell (or focus it and press Enter/Space) to copy its text; an auto-dismissing toast
  confirms the copy. Falls back gracefully when the Clipboard API is unavailable.

Implementation: pure table operations live in `lib/table-operations.js` (filter → sort → paginate pipeline, CSV
generation, clipboard helper, `TABLE_CONFIG` defaults: threshold/page size 20, 300&nbsp;ms search debounce, 3&nbsp;s
toast duration), the rendered DOM is wired by `lib/table-enhancer.js`, and table state re-renders through
`prepareReportData` in `lib/renderer.js`.

---

## How repository submission works

No OAuth app, client ID, token or secret is involved on the client side — forks need **zero auth setup**. The flow on
every supported platform:

1. The user fills in *owner* and *repository* on `/add-repo` (no login on this site — identity is captured later, by the
   platform itself).
2. The app verifies client-side (unauthenticated) that the repository exists and publishes
   `.refactorfirst/refactor-first.json` on its `main`, default or
   `master` branch, then opens a **pre-filled issue**
   (`Add repository: owner/repo`) in the listing project in a new tab.
3. The user — now on GitHub/GitLab/Bitbucket, logged in there — creates the issue. The platform-verified **issue
   author** is the captured submitter identity; it cannot be spoofed.
4. The platform's CI (GitHub Actions `add-repository.yml`, GitLab scheduled
   `process-submissions` pipeline, Bitbucket scheduled `process-submissions`
   pipeline; all driving `ci/process-submissions.sh`) validates:
    - the issue title matches the exact submission format,
    - the issue author has write access to the submitted repository (GitHub collaborator permission, GitLab Developer+
      membership, Bitbucket
      `write`/`admin` permission),
    - the report file exists and the repository is not already listed.
5. Valid submissions are committed to `repositories.txt` and the issue receives a comment with the outcome and is
   closed; rejected submissions are commented with the reason and closed.

|                | GitHub                           | GitLab                                           | Bitbucket                                    |
|----------------|----------------------------------|--------------------------------------------------|----------------------------------------------|
| Trigger        | instant (`issues: opened` event) | scheduled pipeline (10 min)                      | scheduled pipeline (10 min)                  |
| CI credentials | built-in `GITHUB_TOKEN`          | `CI_JOB_TOKEN` (or `GITLAB_TOKEN` project token) | workspace OAuth consumer (secured variables) |
| Access check   | collaborator `permission`        | member `access_level >= 30` (Developer)          | permissions `write`/`admin`                  |

Limitations: only **public** repositories can be submitted (the report checks are unauthenticated), and each deployment
serves exactly one platform — the one it is hosted on.

---

## Making Changes (Developer Guide)

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0 (install + unit/integration tests)
- Node.js 22 (Next.js build + Playwright E2E)
- Python 3 (serves the static export locally, scripts/serve-out.py)

### Setup

```bash
bun install            # install devDependencies (mustache, jsdom, playwright, eslint)
```

### Run locally

```bash
bun run dev                    # Next.js dev server at http://localhost:3000
# or the production-shaped static export:
bun run build && python3 scripts/serve-out.py   # then open http://localhost:8003
```

### Test-driven development (mandatory)

This project follows strict TDD — write the failing test **before** production code:

1. Write a failing test in `tests/unit/` (pure module logic) or
   `tests/integration/` (DOM + routing flows).
2. Run `bun test tests/unit tests/integration` and watch it fail.
3. Write the minimal implementation in `lib/`, `components/` or `app/` to make it pass.
4. Refactor while keeping tests green.

```bash
bun test tests/unit tests/integration   # unit + integration (jsdom)
bun test --watch tests/unit             # watch mode
bun test --coverage tests/unit tests/integration
```

E2E tests run under Node.js/Playwright against the built static export (the Playwright webServer runs `bun run build`
then serves `out/`):

```bash
npx playwright install        # one-time: download browsers
npx playwright test           # full E2E suite (chromium, firefox, webkit)
npx playwright test --ui      # interactive mode
bun run test:e2e:basepath     # NEXT_PUBLIC_BASE_PATH=/preview leg (chromium)
```

### Accessibility (WCAG 2.2 AA)

This application targets **WCAG 2.2 Level AA**. Dedicated guards cover selected requirements:
`tests/unit/html5-attributes.test.js`, `tests/unit/report-template-wcag.test.js`, `tests/unit/css-a11y.test.js` and
`tests/unit/page-titles.test.js` verify HTML5-valid markup (no obsolete presentational attributes), semantic heading
hierarchy, table captions and scoped headers, chart alternative text, landmark names, color contrast, focus visibility,
target sizes and per-page titles. Extend these tests when you introduce new markup patterns.

### Lint

```bash
npx eslint "lib/**/*.js" "app/**/*.{js,jsx}" "components/**/*" "tests/**/*"
```

### Environment-aware documentation

The **Getting Started** page shows only the CI sample matching the hosting environment, detected from the hostname
(`*.github.io` → GitHub Actions,
`*.gitlab.io` → GitLab CI, `*.bitbucket.io` → Bitbucket Pipelines; anything else defaults to GitHub). The samples live
in
`public/templates/workflow-sample-{github,gitlab,bitbucket}.html`, and detection lives in
`lib/host.js` (or `NEXT_PUBLIC_HOSTING_ENVIRONMENT` at build time, plus the
`platform` meta tag).

### Where things live

| Change                                          | Files                                                                                                                                                                                                                                               |
|-------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| URL routes                                      | `lib/routes.js` (+ `tests/unit/routes.test.js`)                                                                                                                                                                                                     |
| Raw fetching / branch fallback (platform-aware) | `lib/fetcher.js`                                                                                                                                                                                                                                    |
| Mustache rendering                              | `lib/renderer.js`, `public/assets/refactor-first-report.mustache` (port of the RefactorFirst viewer template)                                                                                                                                       |
| Interactive report widgets                      | `lib/report-view.js` + CDN widgets loaded via `next/script` in `components/report-view.jsx` (Chart.js, sigma/graphology, graphlib-dot, svg-pan-zoom, 3d-force-graph) and the ES-module bridges in `public/widgets/` (vizdom WASM, three-spritetext) |
| Search / type-ahead                             | `lib/search.js` + `components/{search-combobox,hero-search,menu-search}.jsx`                                                                                                                                                                        |
| Submission flow                                 | `lib/repo-submission.js`, `components/repo-submission-form.jsx`                                                                                                                                                                                     |
| Submission validation (CI)                      | `ci/process-submissions.sh`, `.github/workflows/add-repository.yml`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml`                                                                                                                                    |
| Error pages                                     | `lib/error-handler.js`, `components/error-boundary-view.jsx`, `app/error.jsx`, `app/not-found.jsx`                                                                                                                                                  |
| Page content                                    | `app/*/page.jsx`                                                                                                                                                                                                                                    |
| Styling                                         | `css/main.css`, `css/components.css`                                                                                                                                                                                                                |
| Listing data                                    | `repositories.txt` (one `user/repo` per line)                                                                                                                                                                                                       |
| Scheduled redeploy                              | `.github/workflows/redeploy.yml`                                                                                                                                                                                                                    |

### CI/CD

`.github/workflows/test.yml` runs Bun unit/integration tests and the Playwright suite on every push and pull request.
Keep it green before merging.

---

## Testing

- **Unit** (`tests/unit/`): router, fetcher (incl. branch fallback, retry and per-platform URL construction), renderer,
  report-view (charts/graphs/popups), search, repo-submission (incl. report-file existence check and per-platform issue
  URLs), error-handler, rate-limiter, cache-manager, utils.
- **Integration** (`tests/integration/`): search flow, submission flow (missing report, unknown repo, per-platform issue
  redirect), report rendering.
- **E2E** (`tests/e2e/`): user journeys (incl. the submission → pre-filled issue hand-off), cross-browser smoke tests,
  mobile responsiveness (hamburger menu, single-column grid).

Coverage target: 80%+ on core modules. Current suite: 165 tests.
