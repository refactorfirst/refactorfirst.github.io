// URL routing logic: parsing, classification, validation, navigation
// and branch fallback defaults.

const DEFAULT_BRANCH = 'main';

// Pages served as static content templates (matched against first path segment).
const STATIC_PAGES = new Set([
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

  if (username === 'add-repo' && repository === 'callback') {
    return { type: 'oauth-callback' };
  }

  if (username === 'add-repo' && !repository) {
    return { type: 'add-repo' };
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

// Client-side navigation: update history and notify the application.
export function navigateTo(path) {
  history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('routechange', { detail: { path } }));
}

// Register a handler fired on both client-side navigation and browser back/forward.
export function onRouteChange(handler) {
  const listener = () => handler(location.pathname);
  window.addEventListener('routechange', listener);
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('routechange', listener);
    window.removeEventListener('popstate', listener);
  };
}
