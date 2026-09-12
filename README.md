# RefactorFirst GitHub Pages Application

A purely client-side static web application that renders
[RefactorFirst](https://github.com/refactorfirst/refactorfirst) reports by fetching
`.refactorfirst/refactor-first.json` data directly from repositories. No server-side
code, no database, no build step — HTML, CSS and ES6 JavaScript modules served as
static files.

- **Search** over a curated listing of repositories (`repositories.txt`)
- **Reports** rendered with Mustache.js from raw GitHub content, with `main` → `master`
  branch fallback
- **Repository submission** with GitHub OAuth (PKCE) and server-side validation via a
  GitHub Actions workflow
- Works with a plain static file server: `python3 -m http.server 8000`

---

## Table of Contents

- [Project Layout](#project-layout)
- [Deploying to GitHub Pages (organization or personal account)](#deploying-to-github-pages-organization-or-personal-account)
- [Deploying to GitHub Enterprise Server](#deploying-to-github-enterprise-server)
- [Deploying to Bitbucket](#deploying-to-bitbucket)
- [Deploying to GitLab](#deploying-to-gitlab)
- [Registering the GitHub OAuth App](#registering-the-github-oauth-app)
- [Making Changes (Developer Guide)](#making-changes-developer-guide)
- [Testing](#testing)

---

## Project Layout

```
index.html                    # Single-page app shell (top menu + #app container)
repositories.txt              # Listed repositories, one "user/repo" per line
js/                           # ES6 modules: router, fetcher, renderer, search,
                              # oauth-handler, repo-submission, error-handler,
                              # rate-limiter, cache-manager, utils, main
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
validates submissions and commits new entries to `repositories.txt`.

### 4. Register the OAuth app

"Add Your Repo" sign-in requires a GitHub OAuth App registered under your account
or organization — see [Registering the GitHub OAuth App](#registering-the-github-oauth-app).
Then set your app's Client ID in the `<meta name="oauth-client-id">` tag in `index.html`.

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

Raw content and API calls default to `github.com` / `raw.githubusercontent.com`. For a
self-hosted instance, update the endpoints:

- `js/repo-submission.js` — `GITHUB_API` and `GITHUB_RAW` constants:
  ```js
  const GITHUB_API = 'https://github.example.com/api/v3';
  const GITHUB_RAW = 'https://github.example.com/raw'; // or your instance's raw URL pattern
  ```
- `js/fetcher.js` — `constructRawUrl` / `constructTemplateUrl` should build URLs like
  `https://github.example.com/raw/<user>/<repo>/<branch>/.refactorfirst/refactor-first.json`.
- `js/oauth-handler.js` — `AUTHORIZE_URL` / `TOKEN_URL` / `USER_API_URL` become
  `https://github.example.com/login/oauth/authorize`, `.../access_token`, and
  `https://github.example.com/api/v3/user`.

(Tip: keep these behind a single `config` module such as `enterprise-config.json`
if you need to support multiple deployments from one codebase.)

### 3. Register the OAuth app *on the GHES instance*

In your GHES user/org settings, register an OAuth App with callback URL
`https://<your-pages-host>/add-repo/callback` and set the Client ID in `js/main.js`.

### 4. Workflows

`add-repository.yml` and `redeploy.yml` use the built-in `GITHUB_TOKEN` and the `gh`
CLI, both available on GHES Actions runners. If your instance lacks internet access,
ensure the runner image includes the `gh` CLI and that raw/API endpoints are reachable
from the browser — reports are fetched **client-side**, so *end users'* browsers (not
the server) must be able to reach your GHES host.

---

## Deploying to Bitbucket

Bitbucket's static site hosting is more limited (no scheduled redeploys, no
repository_dispatch equivalent), so the **report viewing, search and listing** work
out of the box, while the **submission workflow** is GitHub-specific.

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

### 3. Updating the listing

Without GitHub Actions, `repositories.txt` is maintained by hand (commit + push)
or with the included `bitbucket-pipelines.yml`, which validates the site files on
every push and offers a manual `sort-repos` pipeline to normalize the listing.

The OAuth submission flow still targets GitHub (reports are fetched from GitHub raw
content), so keep the OAuth App registered on github.com regardless of where the
static files are hosted.

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
- **Listing updates**: replace `redeploy.yml` with a scheduled GitLab pipeline
  (CI/CD → Schedules, every 10 minutes) that re-runs the `pages` job when
  `repositories.txt` changed. The submission workflow (`add-repository.yml`) remains
  GitHub-specific; the OAuth flow itself (against github.com) works from any host.
- **Custom domains**: set up under **Settings → Pages** with automatic Let's Encrypt
  certificates.

> **Users generating reports on GitLab**: point them at
> `templates/user-refactorfirst-gitlab-ci.yml` — a copy-paste pipeline that runs
> `mvn refactorfirst:jsonReport` on the default branch and commits
> `.refactorfirst/refactor-first.json` back using the built-in `CI_JOB_TOKEN`.

---

## Registering the GitHub OAuth App

Required for the "Add Your Repo" flow, regardless of where the static files live.

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (org admins: **Organization Settings → Developer settings → OAuth Apps**).
2. Configure:
   - **Application name**: `RefactorFirst GitHub Pages`
   - **Homepage URL**: `https://<owner>.github.io` (or your Pages host)
   - **Authorization callback URL**: `https://<owner>.github.io/add-repo/callback`
3. Note the **Client ID** and set it in the `<meta name="oauth-client-id">` tag in
   `index.html`:

   ```html
   <meta name="oauth-client-id" content="YOUR_GITHUB_OAUTH_CLIENT_ID">
   ```

The app uses the authorization-code flow **with PKCE**, scoped to `public_repo` and
`read:user`. Tokens live only in the browser's `sessionStorage` and are cleared on
logout. Rotate the app secret quarterly if you later add any server-side component
(the current client-side PKCE flow does not use the secret).

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
| GitHub fetching / branch fallback | `js/fetcher.js` |
| Mustache rendering | `js/renderer.js`, `assets/refactor-first-report.mustache` |
| Search / type-ahead | `js/search.js` |
| Submission flow | `js/repo-submission.js`, `js/main.js` (`renderAddRepo`) |
| OAuth / PKCE | `js/oauth-handler.js` |
| Error pages | `js/error-handler.js`, `templates/error-*.html` |
| Page content | `templates/*.html` |
| Styling | `css/main.css`, `css/components.css` |
| Listing data | `repositories.txt` (one `user/repo` per line) |
| Validation workflow | `.github/workflows/add-repository.yml` |
| Scheduled redeploy | `.github/workflows/redeploy.yml` |

### CI/CD

`.github/workflows/test.yml` runs Bun unit/integration tests and the Playwright suite
on every push and pull request. Keep it green before merging.

---

## Testing

- **Unit** (`tests/unit/`): router, fetcher (incl. branch fallback + retry), renderer,
  search, repo-submission (incl. report-file existence check), oauth-handler,
  error-handler, rate-limiter, cache-manager, utils.
- **Integration** (`tests/integration/`): search flow, submission flow (incl. OAuth
  states and missing-report handling), report rendering, OAuth callback flow.
- **E2E** (`tests/e2e/`): user journeys, cross-browser smoke tests, mobile
  responsiveness (hamburger menu, single-column grid).

Coverage target: 80%+ on core modules. Current suite: 164 tests.
