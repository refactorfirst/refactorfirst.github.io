# RefactorFirst GitHub Pages Application - Agent Guide

## Project Overview

A purely client-side static web application that renders RefactorFirst reports by fetching `.refactorfirst/refactor-first.json` data directly from GitHub repositories. No server-side code, no database, no build step — HTML, CSS and ES6 JavaScript modules served as static files.

**Key Features:**
- Search over curated repository listing (`repositories.txt`)
- Reports rendered with Mustache.js from raw GitHub content
- Repository submission with GitHub OAuth (PKCE)
- Works with plain static file server

## Development Setup

```bash
bun install            # install devDependencies
python3 -m http.server 8000   # run locally at http://localhost:8000
```

## Testing Commands

**Unit + Integration Tests (Bun):**
```bash
bun test tests/unit tests/integration           # run all unit/integration tests
bun test --watch tests/unit                     # watch mode
bun test --coverage tests/unit tests/integration # coverage report
```

**E2E Tests (Playwright):**
```bash
npx playwright install        # one-time: download browsers
npx playwright test           # full E2E suite (chromium, firefox, webkit)
npx playwright test --ui      # interactive mode
```

**Linting:**
```bash
npx eslint js/**/*.js tests/**/*.js           # lint
npx eslint js/**/*.js tests/**/*.js --fix     # auto-fix
```

## Project Structure

```
index.html                    # Single-page app shell (top menu + #app container)
repositories.txt              # Listed repositories, one "user/repo" per line
js/                           # ES6 modules: router, fetcher, renderer, search,
                              # oauth-handler, repo-submission, error-handler,
                              # rate-limiter, cache-manager, utils, main
css/                          # main.css + components.css
templates/                    # Static page templates (about, faq, errors, ...)
                              # + user CI templates for GitHub/GitLab/Bitbucket
assets/                       # Fallback Mustache template, logo, Sentry config
tests/                        # unit/ (Bun), integration/ (Bun), e2e/ (Playwright)
.github/workflows/            # add-repository.yml, redeploy.yml, test.yml
```

## Development Workflow

**TDD is mandatory** — write failing tests before production code:

1. Write a failing test in `tests/unit/` (pure module logic) or `tests/integration/` (DOM + routing flows)
2. Run `bun test tests/unit tests/integration` and watch it fail
3. Write the minimal implementation in `js/` to make it pass
4. Refactor while keeping tests green

## Key Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `js/router.js` | URL routes and routing logic |
| `js/fetcher.js` | GitHub fetching / branch fallback |
| `js/renderer.js` | Mustache rendering |
| `js/search.js` | Search / type-ahead functionality |
| `js/repo-submission.js` | Submission flow |
| `js/oauth-handler.js` | OAuth / PKCE handling |
| `js/error-handler.js` | Error page rendering |
| `js/utils.js` | Utility functions, environment detection |
| `js/main.js` | Application entry point |

## Testing Requirements

- **Unit tests**: Pure module logic (router, fetcher, renderer, search, etc.)
- **Integration tests**: DOM + routing flows (search flow, submission flow, OAuth states)
- **E2E tests**: User journeys, cross-browser smoke tests, mobile responsiveness
- **Coverage target**: 80%+ on core modules
- **Current suite**: 164 tests

## CI/CD

- `.github/workflows/test.yml` runs Bun unit/integration tests and Playwright E2E suite on every push and PR
- Keep tests green before merging
- GitHub Actions used for scheduled redeployment and repository submission validation

## Environment-Aware Documentation

The Getting Started page shows only the CI sample matching the hosting environment, detected from hostname:
- `*.github.io` → GitHub Actions
- `*.gitlab.io` → GitLab CI  
- `*.bitbucket.io` → Bitbucket Pipelines
- Anything else → defaults to GitHub

Detection logic in `js/utils.js` → `detectHostingEnvironment()`

## Deployment Targets

This project supports deployment to:
- GitHub Pages (organization or personal account)
- GitHub Enterprise Server
- GitLab Pages
- Bitbucket static hosting

See README.md for detailed deployment instructions for each platform.

## Code Conventions

- ES6 modules throughout
- No build step required
- Client-side routing from single `index.html`
- Mustache.js for templating
- GitHub OAuth with PKCE flow
- Static file serving (no server-side code)

## Important Notes

- OAuth Client ID must be set in `js/main.js` for "Add Your Repo" functionality
- For GitHub Enterprise Server, update API/raw endpoints in `js/repo-submission.js`, `js/fetcher.js`, and `js/oauth-handler.js`
- Deep links require `404.html` copy of `index.html` for proper client-side routing on some platforms
- Reports are fetched client-side — end users' browsers must reach GitHub/raw endpoints
