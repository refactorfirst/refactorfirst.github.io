// Pure routing logic: URL parsing, classification, validation and URL
// builders. Browser navigation (navigateTo/onRouteChange) was dropped — the
// Next.js App Router owns navigation now; components navigate via useRouter
// and internal links use next/link (see plans/nextjs-conversion.md Phase 2).

export const DEFAULT_BRANCH = 'main';

// Pages served as static content routes (matched against first path segment).
export const STATIC_PAGES = new Set([
  'getting-started',
  'documentation',
  'faq',
  'examples',
  'api',
  'about',
  'feedback',
  'privacy-policy',
  'terms-of-service'
]);

const GITHUB_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9_.])?$/;

export function parseRoute(path) {
  const parts = path.split('/').filter(Boolean);
  return {
    username: parts[0] || null,
    repository: parts[1] || null,
    // Join all branch segments, matching classifyRoute (paths such as
    // /alice/repo/feature/login); default when none are present.
    branch: parts.length > 2 ? parts.slice(2).join('/') : DEFAULT_BRANCH
  };
}

export function getDefaultBranch() {
  return DEFAULT_BRANCH;
}

// Validate a GitHub username, organization or repository name.
// Rejects empty values and characters that could lead to XSS or path injection.
export function isValidGitHubName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
    return false;
  }
  return GITHUB_NAME_PATTERN.test(name);
}

// Classify a path into a route the application knows how to render.
export function classifyRoute(path) {
  const { username, repository } = parseRoute(path);

  if (!username) {
    return { type: 'landing' };
  }

  if (username === 'add-repo') {
    return repository ? { type: 'not-found' } : { type: 'add-repo' };
  }

  if (STATIC_PAGES.has(username) && !repository) {
    return { type: 'page', page: username };
  }

  if (!isValidGitHubName(username)) {
    return { type: 'not-found' };
  }

  if (!repository) {
    return { type: 'user', username };
  }

  if (!isValidGitHubName(repository)) {
    return { type: 'not-found' };
  }

  const parts = path.split('/').filter(Boolean);

  // Branch names may contain slashes, so every segment beyond user/repo
  // belongs to the branch name. Path-injection guard: each segment is
  // interpolated into raw content URLs, so reject values like ".." that
  // browsers would normalize into a different path.
  const branchParts = parts.slice(2);
  if (branchParts.some(part => !isValidGitHubName(part))) {
    return { type: 'not-found' };
  }

  return {
    type: 'report',
    username,
    repository,
    branch: branchParts.length ? branchParts.join('/') : DEFAULT_BRANCH
  };
}

export function buildReportUrl(username, repository, branch = DEFAULT_BRANCH) {
  const base = `/${encodeURIComponent(username)}/${encodeURIComponent(repository)}`;
  if (branch === DEFAULT_BRANCH) return base;
  // Encode each slash-delimited component while preserving the separators:
  // a slashed branch like "feature/login" must stay real path segments so
  // classifyRoute and the 404-shell deep-link render recognize the URL.
  const branchPath = branch.split('/').map(encodeURIComponent).join('/');
  return `${base}/${branchPath}`;
}

export function buildRepositoryListUrl(fullName) {
  const [username, repository] = String(fullName).split('/');
  return buildReportUrl(username, repository);
}
