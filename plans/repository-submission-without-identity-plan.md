# Plan: Verified Submitter Identity Without Client Authentication

> Supersedes the GitHub App / OAuth migration plans. The application does not
> become a GitHub App, and no OAuth App is needed at all. No server-side
> assets are created.

## Goal

Capture the **platform-verified identity** of the user submitting a
repository for inclusion in `repositories.txt` — without registering any
OAuth/GitHub app, without client tokens, and without secrets — for **all
three supported hosting platforms: GitHub, GitLab, and Bitbucket**.

## Rationale

- Client-side login never provided real security: the platform CI job is (and
  remains) the authoritative validator of submitter access.
- Every target platform authenticates users when they create an **issue**.
  The issue author (`github.event.issue.user.login`, GitLab `author.username`,
  Bitbucket `reporter`) is a verified, unforgeable identity — free of charge.
- The site stays 100% static; forks need **zero auth setup**.

## Per-Platform Submission Matrix

| Concern | GitHub | GitLab | Bitbucket |
|---|---|---|---|
| Issue URL (prefill) | `github.com/<org>/<listing>/issues/new?title=Add repository: O/R&template=add-repo.md` | `<base>/<group>/<listing>/-/issues/new?issue[title]=Add repository: O/R&issuable_template=Add repository` | `bitbucket.org/<ws>/<listing>/issues/new?title=Add repository: O/R&content=…` |
| Captured identity | `github.event.issue.user.login` | `issue.author.username` (Issues API) | `issue.reporter.username` (Issues API 2.0) |
| CI trigger | `on: issues: [opened]` (event-driven) | **Scheduled pipeline** (10 min, configured in project CI/CD schedules; GitLab has no issue-triggered pipelines) | **Scheduled pipeline** (custom schedule in repo settings; Bitbucket has no issue-triggered pipelines) |
| Submitter access check | `repos/O/R/collaborators/U` (write/admin) — existing | `GET /projects/:id/members/all/:uid` → `access_level >= 30` (Developer+) | `GET /2.0/repositories/ws/r/permissions-config/users/{uuid}` → `write`/`admin` |
| Report-file check | `raw.githubusercontent.com` (HEAD) — existing | `<base>/group/proj/-/raw/main/.refactorfirst/refactor-first.json` | `bitbucket.org/ws/repo/raw/main/.refactorfirst/refactor-first.json` |
| Write-back | `git push` (existing concurrency group + `grep -Fxq` dedupe) | Commits REST API (or `git push` w/ project token) | `POST /2.0/repositories/ws/repo/src` (multipart file commit) |
| Feedback loop | `gh issue comment` + `gh issue close` | Notes API + `state_event=close` | Issues API comment + `state=resolved` |
| CI credentials | built-in `GITHUB_TOKEN` | `CI_JOB_TOKEN` (verify Issues API scope; fallback: project access token in masked CI variable) | Workspace **OAuth consumer** client-credentials in secured repo variables (server-side only, never client-side) |
| Issue template file | `.github/ISSUE_TEMPLATE/add-repo.md` | `.gitlab/issue_templates/Add repository.md` | none (Bitbucket has no file-based issue templates; title is authoritative, description prefill is best-effort) |

**Consistency rule:** one deployment serves one platform. A GitLab Pages
deployment lists GitLab projects; entries in `repositories.txt` remain
`owner/repo` and are interpreted in the deployment's platform. This requires
report fetching to be platform-aware (see Phase 6).

## Target Flow (any platform)

```
/add-repo form (owner, repository)
        │ client-side validation (unchanged rules)
        │ + unauthenticated checks: project exists, report file present
        ▼
open new tab ──► <platform> …/issues/new?title=Add repository: OWNER/REPO [+ template]
        │        (user must be logged into the platform — the platform
        │         authenticates them; the issue author IS the captured ID)
        ▼
CI validates → appends to repositories.txt → comments outcome → closes issue
```

## Proposed File Changes

### New

| File | Purpose |
|---|---|
| `.github/ISSUE_TEMPLATE/add-repo.md` | GitHub submitter guidance template. |
| `.gitlab/issue_templates/Add repository.md` | GitLab submitter guidance template. |
| `ci/process-submissions.sh` | Shared POSIX shell implementing: parse title → validate submitter access → check report file → append/sort/dedupe listing → commit → comment → close. Parameterized by platform env vars so all three pipelines reuse one script. |
| `tests/integration/submission-flow.test.js` | Replaces the OAuth integration tests (login removed). |

### Modified

| File | Change |
|---|---|
| `js/repo-submission.js` | Remove token-based access check + workflow dispatch (broken for real users anyway). Keep `validateRepositoryInput`. Unauthenticated `checkReportExists` per platform. Add `buildSubmissionIssueUrl({ owner, repo, environment })` producing the per-platform prefill URL. |
| `js/fetcher.js` | Platform-aware raw URL builders: `constructRawUrl(user, repo, branch, env, baseUrl)` / `constructTemplateUrl(...)`. GitHub defaults unchanged; `main`→`master` fallback preserved for all platforms. |
| `js/main.js` | Remove all OAuth code paths (`getOAuthClientId`, `renderLogin`, `renderOAuthCallback`, `isAuthenticated`). `/add-repo` always renders the form; successful validation opens the issue URL in a new tab and shows a "continue on <Platform>" status. Existing `detectHostingEnvironment` drives platform selection. |
| `js/router.js` | Remove the `/add-repo/callback` route. |
| `js/error-handler.js` | Remove the `oauth` error type/classification. |
| `index.html` | Remove `<meta name="oauth-client-id">`; add `<meta name="submission-target" content="refactorfirst/refactorfirst.github.io">` (per-deployment, public — identifies the listing project; not a credential) and optional `<meta name="platform-base-url">` (self-managed GitLab). CSP: remove `github.com` from `connect-src`; document per-platform additions (`gitlab.com` / custom base, `api.bitbucket.org`) for deployments that need them. |
| `.github/workflows/add-repository.yml` | Retrigger on `issues: opened` (title regex gate), `submitted_by = github.event.issue.user.login`, delegate validation/write-back to `ci/process-submissions.sh`, comment + close the issue with the outcome. Keep `concurrency` group and `grep -Fxq` duplicate check. Permissions: `contents: write`, `issues: write`. |
| `.gitlab-ci.yml` | Add `process-submissions` job gated on `$CI_PIPELINE_SOURCE == "schedule"` invoking `ci/process-submissions.sh`; README documents creating the 10-minute schedule. |
| `bitbucket-pipelines.yml` | Add a `custom: process-submissions` pipeline invoking `ci/process-submissions.sh`; README documents the scheduled run + secured variables. |
| `css/components.css` | Drop login-only selectors (`#login-github`). |
| `templates/{privacy-policy,faq,getting-started}.html` | Remove OAuth/token wording; describe issue-based submission per platform. |
| `README.md`, `AGENTS.md` | See "Documentation Changes". |

### Removed

| File | Reason |
|---|---|
| `js/oauth-handler.js` | No client-side authentication remains. |
| `tests/unit/oauth-handler.test.js` | Replaced by updated `repo-submission` tests. |
| `tests/integration/oauth-flow.test.js` | Replaced by `submission-flow.test.js`. |
| `templates/error-oauth.html` | No OAuth errors exist any more. |

## TDD Implementation Phases

> CRITICAL: Red-Green-Refactor. Every client-side behavior starts as a
> **failing test** (`bun test tests/unit tests/integration` must fail before
> implementation). CI/script changes are review-verified (shellcheck +
> dry-run in CI with a test project).

### Phase 1 — GitHub submission core (platform = github)
Failing tests first (update `tests/unit/repo-submission.test.js`):
- [ ] `buildSubmissionIssueUrl({ owner, repo, environment: 'github' })` →
      correct `issues/new` URL with encoded title + `template=add-repo.md`.
- [ ] `checkReportExists(owner, repo, 'github')` tokenless raw HEAD on
      `main`, then default/master branch.
- [ ] `submitRepository` returns `{ success: true, issueUrl }` (no token
      parameter); invalid input → existing message shapes.

### Phase 2 — App shell (GitHub behavior)
Failing tests first (`tests/integration/submission-flow.test.js`, router tests):
- [ ] `/add-repo` renders the form immediately (no login gate);
      `/add-repo/callback` no longer routes specially.
- [ ] Validation errors render inline; missing report shows
      `REPORT_MISSING_MESSAGE` (mocked fetch).
- [ ] Valid input triggers `onExternalRedirect` with the issue URL
      containing the encoded `owner/repo`.
- [ ] Delete `js/oauth-handler.js` + old OAuth tests; `index.html` meta/CSP
      cleanup; `error-handler.js` oauth-type removal.

### Phase 3 — GitHub CI (review-verified)
- [ ] `ci/process-submissions.sh` github mode; `add-repository.yml`
      re-triggered on `issues: opened`; `.github/ISSUE_TEMPLATE/add-repo.md`.
- [ ] shellcheck on `ci/process-submissions.sh` added to `test.yml`.

### Phase 4 — Client platform abstraction
Failing tests first:
- [ ] `buildSubmissionIssueUrl` for `gitlab` (default base
      `https://gitlab.com`, overridden by `platform-base-url` meta — covers
      self-managed) and `bitbucket`.
- [ ] `js/fetcher.js` per-platform raw/template URL builders, preserving the
      `main`→`master` 404 fallback; `fetchReport(username, repo, branch, {
      environment })` parameterization with `main.js` wiring.
- [ ] Submission + report integration tests per platform (mocked fetch).

### Phase 5 — GitLab CI
- [ ] `ci/process-submissions.sh` gitlab mode (Issues API via `CI_JOB_TOKEN`;
      members API access check; Commits API write-back; Notes API feedback).
- [ ] `.gitlab-ci.yml` `process-submissions` job + issue template file.
- [ ] Dry-run against a scratch GitLab project (schedule-driven).

### Phase 6 — Bitbucket CI
- [ ] `ci/process-submissions.sh` bitbucket mode (OAuth consumer token from
      secured vars; Issues API query; permissions-config access check;
      `/src` multipart commit; comment + resolve).
- [ ] `bitbucket-pipelines.yml` custom pipeline.
- [ ] Dry-run against a scratch Bitbucket repo (scheduled run).

### Phase 7 — E2E
- [ ] `user-journeys.spec.js`: form renders without login; submit opens a
      new tab whose URL carries the encoded `owner/repo` (intercept via
      `context.waitForEvent('page')`); audit other spec files for login
      references.
- [ ] Per-platform E2E override seam (set `submission-target` meta + route
      mocks) so one spec parametrizes all three platforms.

## Documentation Changes

### `README.md`
- [ ] Delete the **"Registering the GitHub OAuth App"** section — no auth
      setup needed on any platform.
- [ ] New "How repository submission works" section: issue-based flow,
      verified-identity guarantee, per-platform table (condensed from this
      plan).
- [ ] Per-platform deployment updates:
      - GitHub Pages/GHES: nothing beyond enabling issues.
      - GitLab Pages: create the CI/CD schedule; note `CI_JOB_TOKEN` vs
        project access token; `submission-target` + optional
        `platform-base-url` meta tags; CSP `connect-src` addition.
      - Bitbucket: create the scheduled pipeline; create the workspace OAuth
        consumer (Issues read/write, Repositories write), add secured
        variables; CSP additions (`bitbucket.org`, `api.bitbucket.org`).
- [ ] Document limitations: public projects only (raw checks),
      unauthenticated client-side rate limits (pre-check UX only), one
      platform per deployment.

### `AGENTS.md`
- [ ] Module table: remove `js/oauth-handler.js`; describe the reworked
      `js/repo-submission.js` and platform-aware `js/fetcher.js`; add
      `ci/process-submissions.sh`.
- [ ] Note: no client authentication; identity via platform issue author;
      `submission-target` meta tag; removed `/add-repo/callback` route and
      `error-oauth.html`.

### Templates
- [ ] `getting-started.html`, `faq.html`, `privacy-policy.html` per the file
      change table (wording reflects "no tokens are issued or stored;
      identity is captured by your platform when you create the issue").

## Acceptance Criteria

- [ ] `bun test tests/unit tests/integration` green (all new/updated suites).
- [ ] `npx eslint js/**/*.js tests/**/*.js` clean; `shellcheck
      ci/process-submissions.sh` clean.
- [ ] Playwright E2E green, incl. per-platform submission parametrization.
- [ ] `grep -R "oauth\|OAuth\|PKCE\|code_verifier\|client_id" js/ index.html
      templates/` → no stale references.
- [ ] End-to-end proof on each platform (scratch projects): form → pre-filled
      issue → CI validation → comment + close → listing commit containing the
      verified submitter identity.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Spam submissions for projects the author can't access | CI access check is the sole authority; failures comment + close; spam issues are deletable. |
| Hand-edited/malformed issue titles | Strict title regex; parse failures comment + close; never committed. |
| GitLab `CI_JOB_TOKEN` Issues-API scope gaps | Verify in Phase 5 dry-run; documented fallback to a masked project access token variable. |
| Bitbucket issue prefill param drift | Workflow parses only the title; description prefill is best-effort; re-verify in Phase 6. |
| Scheduled pipelines lag (vs GitHub's instant trigger) | 10-minute cadence; README documents the delay; issue comment confirms outcome. |
| CSP additions per platform forgotten | Explicit checklist item in README deployment sections + acceptance grep. |
| Private projects unsupported | Documented limitation (raw checks are public-only). |

## Out of Scope

- Any GitHub App, OAuth App, client token, or client-side secret.
- Server-side assets of any kind (CI scripts run in the platform's own CI).
- Cross-platform listings within a single deployment.
- Private project support.
