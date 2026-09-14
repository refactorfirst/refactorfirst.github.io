# RefactorFirst GitHub Pages Application

A purely client-side static web application that renders
[RefactorFirst](https://github.com/refactorfirst/refactorfirst) reports by fetching
`.refactorfirst/refactor-first.json` data directly from repositories. No server-side
code, no database, no build step — HTML, CSS and ES6 JavaScript modules served as
static files.

- **Search** over a curated listing of repositories (`repositories.txt`)
- **Reports** rendered with Mustache.js from raw GitHub content, with `main` → `master`
  branch fallback
- **Repository submission** via a pre-filled issue on the hosting platform
  (no login, apps or tokens on this site): your platform account is captured as
  the issue author and validated server-side by the platform's CI
- Reports and submissions work for repositories hosted on the same platform as
  the deployment (GitHub, GitLab or Bitbucket)
- Works with a plain static file server: `python3 -m http.server 8000`

---

## Table of Contents

- [Project Layout](#project-layout)
- [Deploying to GitHub Pages (organization or personal account)](#deploying-to-github-pages-organization-or-personal-account)
- [Deploying to GitHub Enterprise Server](#deploying-to-github-enterprise-server)
- [Deploying to Bitbucket](#deploying-to-bitbucket)
- [Deploying to GitLab](#deploying-to-gitlab)
- [How repository submission works](#how-repository-submission-works)
- [Making Changes (Developer Guide)](#making-changes-developer-guide)
- [Testing](#testing)

---

## Project Layout

```
index.html                    # Single-page app shell (top menu + #app container)
repositories.txt              # Listed repositories, one "user/repo" per line
js/                           # ES6 modules: router, fetcher, renderer, search,
                              # repo-submission, error-handler,
                              # rate-limiter, cache-manager, utils, main
ci/process-submissions.sh     # Shared submission validator used by GitHub
                              # Actions, GitLab CI and Bitbucket Pipelines
css/                          # main.css + components.css
templates/                    # Static page templates (about, faq, errors, ...)
                              # + user CI templates: user-refactorfirst-workflow.yml (GitHub),
                              #   user-refactorfirst-gitlab-ci.yml, user-refactorfirst-bitbucket-pipeline.yml
                              # + workflow-sample-{github,gitlab,bitbucket}.html shown on the
                              #   Getting Started page based on the detected hosting environment
.gitlab-ci.yml                # Deploys this site to GitLab Pages
bitbucket-pipelines.yml       # Validates this site's files on Bitbucket
assets/                       # Fallback Mustache template, logo, Sentry config
tests/                        # unit/ (Bun), integration/ (Bun), e2e/ (Playwright)
.github/workflows/            # add-repository.yml, redeploy.yml, test.yml
```

---

## Deploying to GitHub Pages (organization or personal account)

### 1. Fork or create the repository

- **Personal account**: create a repository named `<username>.github.io`.
- **Organization**: create a repository named `<orgname>.github.io` in the org,
  or any project repository if you want a project page
  (`https://<org>.github.io/<repo>/`).

### 2. Push this project's files

Everything in this directory is the site — push it to the default branch:

```bash
git init
git add .
git commit -m "RefactorFirst Pages site"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

### 3. Enable GitHub Pages

Go to **Settings → Pages**:

- **Source**: *GitHub Actions* (required for the scheduled redeployment workflow in
  `.github/workflows/redeploy.yml`).
- Alternatively choose *Deploy from a branch* (main, `/ (root)`) if you don't need
  scheduled redeploys — the site is fully static.

The included `redeploy.yml` workflow redeploys every 10 minutes, but only when
`repositories.txt` changed in the last 15 minutes. The `add-repository.yml` workflow
reacts to newly opened submission issues, validates the submitter and commits new
entries to `repositories.txt`.

### 4. Configure the submission target

"Add Your Repo" submissions are pre-filled issues created in the listing
repository. Point the site at your repository via the meta tag in `index.html`:

```html
<meta name="submission-target" content="<owner>/<repo>">
```

No GitHub Apps, OAuth apps, client IDs or secrets are needed — identity is
captured by GitHub as the issue author. See
[How repository submission works](#how-repository-submission-works).

### 5. (Optional) Custom domain

Add a `CNAME` file containing your domain (e.g. `reports.example.com`), configure
your DNS (CNAME record pointing to `<owner>.github.io`), and enable **Enforce HTTPS**
in Settings → Pages.

---

## Deploying to GitHub Enterprise Server

The application is fully static, so it works on any GitHub Enterprise Server (GHES)
instance with Pages enabled.

### 1. Enable Pages on the appliance

A site admin must enable GitHub Pages for the instance
(**Management Console → Pages → Enable**), then create the repository
(`<owner>.<pages-host>` or a project repo) and push this project as described above.

### 2. Point the app at your enterprise endpoints

Raw content and API calls default to `github.com` / `raw.githubusercontent.com`
/ `api.github.com`. For a self-hosted instance, update the URL builders:

- `js/fetcher.js` — the `github` entry of `PLATFORM_BUILDERS` should build
  URLs like
  `https://github.example.com/raw/<user>/<repo>/<branch>/.refactorfirst/refactor-first.json`.
- `js/repo-submission.js` — `repositoryInfoUrl()` and `buildSubmissionIssueUrl()`
  github branches must target your instance (`https://github.example.com/...`).
- `ci/process-submissions.sh` — set `GH_API` (and raw URL handling) to your
  instance endpoints (`GH_HOST` is respected by `gh`-style tooling).
- `index.html` — extend the CSP `connect-src` directive with your instance
  host and set `submission-target` to your listing repository.

(Tip: keep these behind a single `config` module such as `enterprise-config.json`
if you need to support multiple deployments from one codebase.)

### 3. Workflows

`add-repository.yml` and `redeploy.yml` use the built-in `GITHUB_TOKEN`;
`ci/process-submissions.sh` needs only `curl` and `jq` (preinstalled on
Actions runners). If your instance lacks internet access, ensure raw/API
endpoints are reachable from the browser — reports and submission pre-checks
are **client-side**, so *end users'* browsers (not the server) must be able to
reach your GHES host.

---

## Deploying to Bitbucket

A Bitbucket deployment lists Bitbucket-hosted repositories: report fetching and
submission use `bitbucket.org/.../raw/...` and the Bitbucket REST API.

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

The site goes live at `https://<workspace>.bitbucket.io`. Note that Bitbucket static
sites serve all paths from one `index.html`-style tree — since this app routes
client-side from a single `index.html`, request every path as `/index.html`-relative
links, or accept that deep links (e.g. `/user/repo`) return 404 unless Bitbucket
serves `index.html` for unknown paths (it does not by default — consider using the
query-style links or hosting deep routes via a redirect service).

### 3. Enable submission processing

The site is detected as `bitbucket` from the `<workspace>.bitbucket.io`
hostname; set `submission-target` in `index.html` to
`<workspace>/<workspace>.bitbucket.io`, enable the issue tracker on that
repository and extend the CSP `connect-src` with `https://api.bitbucket.org`
and `https://bitbucket.org`.

Bitbucket has no issue-triggered pipelines, so submissions are processed by the
custom `process-submissions` pipeline in `bitbucket-pipelines.yml`:

1. In the repository go to **Pipelines → Schedules** and schedule
   `custom: process-submissions` (e.g. every 10 minutes).
2. Create a workspace **OAuth consumer** with `issues:write` and
   `repositories:write` scopes and store its credentials as the **secured**
   repository variables `BITBUCKET_CLIENT_ID` / `BITBUCKET_CLIENT_SECRET`
   (server-side CI secrets only — the site itself never sees them).

The pipeline polls open issues titled `Add repository: owner/repo`, checks the
author has `write`/`admin` permission on the repository, verifies the report
file exists, commits `repositories.txt` and closes the issue with the outcome.
The manual `sort-repos` pipeline from the shipped `bitbucket-pipelines.yml`
also normalizes the listing on demand.

> **Users generating reports on Bitbucket**: point them at
> `templates/user-refactorfirst-bitbucket-pipeline.yml` — a copy-paste pipeline that
> runs `mvn refactorfirst:jsonReport` and commits `.refactorfirst/refactor-first.json`
> on every push to `main`/`master`.

---

## Deploying to GitLab

### 1. Create the project

- **Personal account**: create a project named `<username>.gitlab.io`.
- **Group**: create a project named `<groupname>.gitlab.io`, or any project for a
  project page at `https://<group>.gitlab.io/<project>/`.

### 2. Add a Pages pipeline

This repository already ships a ready-to-use `.gitlab-ci.yml` (validates the site and
deploys `public/` via a `pages` job, including a `404.html` copy of `index.html` for
client-side routing). It looks like this:

```yaml
pages:
  stage: deploy
  script:
    - mkdir -p public
    # Publish everything except VCS metadata, tests and tooling
    - |
      for f in index.html repositories.txt css js templates assets; do
        cp -r "$f" public/
      done
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

- **Client-side routing**: GitLab Pages serves `404.html` for unknown paths; keep a
  copy of `index.html` as `public/404.html` in the pipeline (`cp index.html public/404.html`)
  so deep links like `/user/repo` load the app.
- **Submission processing**: set `submission-target` in `index.html` to your
  `<group>/<project>`, extend the CSP `connect-src` with your GitLab base
  (`https://gitlab.com` or your self-managed host), and create a pipeline
  schedule (**CI/CD → Schedules**, e.g. every 10 minutes) — GitLab has no
  issue-triggered pipelines, so the `process-submissions` job in
  `.gitlab-ci.yml` polls open submission issues. For **self-managed GitLab**
  also add `<meta name="platform-base-url" content="https://your-gitlab.example.com">`.
  The job uses `CI_JOB_TOKEN` by default; if your GitLab version/instance
  restricts its API scope, set a masked `GITLAB_TOKEN` CI variable with a
  project access token (`api` scope) instead.
- **Listing redeploys**: schedule another pipeline (or extend the same one) to
  re-run `pages` when `repositories.txt` changed.
- **Custom domains**: set up under **Settings → Pages** with automatic Let's Encrypt
  certificates. Note: the hostname-based environment detection only recognises
  `*.gitlab.io`; on a custom domain pass `hostEnvironment: 'gitlab'` to
  `createApp()` in `js/main.js`.

> **Users generating reports on GitLab**: point them at
> `templates/user-refactorfirst-gitlab-ci.yml` — a copy-paste pipeline that runs
> `mvn refactorfirst:jsonReport` on the default branch and commits
> `.refactorfirst/refactor-first.json` back using the built-in `CI_JOB_TOKEN`.

---

## How repository submission works

No OAuth app, client ID, token or secret is involved on the client side — forks
need **zero auth setup**. The flow on every supported platform:

1. The user fills in *owner* and *repository* on `/add-repo` (no login on this
   site — identity is captured later, by the platform itself).
2. The app verifies client-side (unauthenticated) that the repository exists
   and publishes `.refactorfirst/refactor-first.json` on its `main`, default or
   `master` branch, then opens a **pre-filled issue**
   (`Add repository: owner/repo`) in the listing project in a new tab.
3. The user — now on GitHub/GitLab/Bitbucket, logged in there — creates the
   issue. The platform-verified **issue author** is the captured submitter
   identity; it cannot be spoofed.
4. The platform's CI (GitHub Actions `add-repository.yml`, GitLab scheduled
   `process-submissions` pipeline, Bitbucket scheduled `process-submissions`
   pipeline; all driving `ci/process-submissions.sh`) validates:
   - the issue title matches the exact submission format,
   - the issue author has write access to the submitted repository
     (GitHub collaborator permission, GitLab Developer+ membership, Bitbucket
     `write`/`admin` permission),
   - the report file exists and the repository is not already listed.
5. Valid submissions are committed to `repositories.txt` and the issue receives
   a comment with the outcome and is closed; rejected submissions are commented
   with the reason and closed.

| | GitHub | GitLab | Bitbucket |
|---|---|---|---|
| Trigger | instant (`issues: opened` event) | scheduled pipeline (10 min) | scheduled pipeline (10 min) |
| CI credentials | built-in `GITHUB_TOKEN` | `CI_JOB_TOKEN` (or `GITLAB_TOKEN` project token) | workspace OAuth consumer (secured variables) |
| Access check | collaborator `permission` | member `access_level >= 30` (Developer) | permissions `write`/`admin` |

Limitations: only **public** repositories can be submitted (the report checks
are unauthenticated), and each deployment serves exactly one platform — the
one it is hosted on.

---

## Making Changes (Developer Guide)

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0 (unit/integration tests) — or run it via `npx bun`
- Node.js ≥ 18 (Playwright E2E tests only)
- Python 3 (local static server)

### Setup

```bash
bun install            # install devDependencies (mustache, jsdom, playwright, eslint)
```

### Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

### Test-driven development (mandatory)

This project follows strict TDD — write the failing test **before** production code:

1. Write a failing test in `tests/unit/` (pure module logic) or
   `tests/integration/` (DOM + routing flows).
2. Run `bun test tests/unit tests/integration` and watch it fail.
3. Write the minimal implementation in `js/` to make it pass.
4. Refactor while keeping tests green.

```bash
bun test tests/unit tests/integration   # unit + integration (jsdom)
bun test --watch tests/unit             # watch mode
bun test --coverage tests/unit tests/integration
```

E2E tests run under Node.js/Playwright with a live local server:

```bash
npx playwright install        # one-time: download browsers
npx playwright test           # full E2E suite (chromium, firefox, webkit)
npx playwright test --ui      # interactive mode
```

### Lint

```bash
npx eslint js/**/*.js tests/unit/**/*.js tests/integration/**/*.js
```

### Environment-aware documentation

The **Getting Started** page shows only the CI sample matching the hosting
environment, detected from the hostname (`*.github.io` → GitHub Actions,
`*.gitlab.io` → GitLab CI, `*.bitbucket.io` → Bitbucket Pipelines; anything else
defaults to GitHub). The samples live in
`templates/workflow-sample-{github,gitlab,bitbucket}.html`, and detection lives in
`detectHostingEnvironment()` in `js/utils.js`. To override detection (e.g. a custom
domain hosting the GitLab variant), pass `hostEnvironment: 'gitlab'` to
`createApp()` in `js/main.js`.

### Where things live

| Change | Files |
|---|---|
| URL routes | `js/router.js` (+ `tests/unit/router-ext.test.js`) |
| Raw fetching / branch fallback (platform-aware) | `js/fetcher.js` |
| Mustache rendering | `js/renderer.js`, `assets/refactor-first-report.mustache` |
| Search / type-ahead | `js/search.js` |
| Submission flow | `js/repo-submission.js`, `js/main.js` (`renderAddRepo`) |
| Submission validation (CI) | `ci/process-submissions.sh`, `.github/workflows/add-repository.yml`, `.gitlab-ci.yml`, `bitbucket-pipelines.yml` |
| Error pages | `js/error-handler.js`, `templates/error-*.html` |
| Page content | `templates/*.html` |
| Styling | `css/main.css`, `css/components.css` |
| Listing data | `repositories.txt` (one `user/repo` per line) |
| Scheduled redeploy | `.github/workflows/redeploy.yml` |

### CI/CD

`.github/workflows/test.yml` runs Bun unit/integration tests and the Playwright suite
on every push and pull request. Keep it green before merging.

---

## Testing

- **Unit** (`tests/unit/`): router, fetcher (incl. branch fallback, retry and
  per-platform URL construction), renderer, search, repo-submission (incl.
  report-file existence check and per-platform issue URLs), error-handler,
  rate-limiter, cache-manager, utils.
- **Integration** (`tests/integration/`): search flow, submission flow (missing
  report, unknown repo, per-platform issue redirect), report rendering.
- **E2E** (`tests/e2e/`): user journeys (incl. the submission → pre-filled
  issue hand-off), cross-browser smoke tests, mobile responsiveness
  (hamburger menu, single-column grid).

Coverage target: 80%+ on core modules. Current suite: 165 tests.
