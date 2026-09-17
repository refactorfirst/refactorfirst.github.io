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
    branch: parts[2] || DEFAULT_BRANCH
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
  const { username, repository, branch } = parseRoute(path);

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
  if (parts.length > 3) {
    return { type: 'not-found' };
  }

  // Path-injection guard: the branch segment is interpolated into raw
  // content URLs; reject values like ".." that browsers would normalize
  // into a different path. (Multi-segment branches are not expressible in
  // classifyRoute paths — those arrive via ?branch= on the shell.)
  if (!isValidGitHubName(branch)) {
    return { type: 'not-found' };
  }

  return { type: 'report', username, repository, branch };
}

export function buildReportUrl(username, repository, branch = DEFAULT_BRANCH) {
  const base = `/${encodeURIComponent(username)}/${encodeURIComponent(repository)}`;
  return branch === DEFAULT_BRANCH ? base : `${base}/${encodeURIComponent(branch)}`;
}

export function buildRepositoryListUrl(fullName) {
  const [username, repository] = String(fullName).split('/');
  return buildReportUrl(username, repository);
}

export function getQueryParam(search, name) {
  const params = new URLSearchParams(search || '');
  const value = params.get(name);
  return value === null ? null : value;
}
