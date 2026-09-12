import { describe, it, expect, beforeEach } from 'bun:test';
import {
  isValidGitHubName,
  classifyRoute,
  buildReportUrl,
  buildRepositoryListUrl,
  getQueryParam,
  navigateTo
} from '../../js/router.js';

describe('isValidGitHubName', () => {
  it('should accept valid GitHub owner/repo names', () => {
    expect(isValidGitHubName('refactorfirst')).toBe(true);
    expect(isValidGitHubName('spring-projects')).toBe(true);
    expect(isValidGitHubName('repo.name_1')).toBe(true);
    expect(isValidGitHubName('a')).toBe(true);
  });

  it('should reject empty or missing names', () => {
    expect(isValidGitHubName('')).toBe(false);
    expect(isValidGitHubName(null)).toBe(false);
    expect(isValidGitHubName(undefined)).toBe(false);
  });

  it('should reject names with dangerous characters', () => {
    expect(isValidGitHubName('<script>')).toBe(false);
    expect(isValidGitHubName('user name')).toBe(false);
    expect(isValidGitHubName('user/repo')).toBe(false);
    expect(isValidGitHubName('user?x=1')).toBe(false);
    expect(isValidGitHubName('-leading-dash')).toBe(false);
  });

  it('should reject overly long names', () => {
    expect(isValidGitHubName('a'.repeat(101))).toBe(false);
  });
});

describe('classifyRoute', () => {
  it('classifies root as landing', () => {
    expect(classifyRoute('/').type).toBe('landing');
  });

  it('classifies static pages', () => {
    for (const page of ['getting-started', 'documentation', 'faq', 'examples', 'api', 'about', 'feedback', 'privacy-policy', 'terms-of-service']) {
      expect(classifyRoute(`/${page}`).type).toBe('page');
      expect(classifyRoute(`/${page}`).page).toBe(page);
    }
  });

  it('classifies /add-repo as its own dynamic route', () => {
    expect(classifyRoute('/add-repo').type).toBe('add-repo');
  });

  it('classifies the OAuth callback', () => {
    const result = classifyRoute('/add-repo/callback');
    expect(result.type).toBe('oauth-callback');
  });

  it('classifies a single segment as a user repository listing', () => {
    const result = classifyRoute('/refactorfirst');
    expect(result.type).toBe('user');
    expect(result.username).toBe('refactorfirst');
  });

  it('classifies username/repository as a report route', () => {
    const result = classifyRoute('/refactorfirst/refactorfirst');
    expect(result.type).toBe('report');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('classifies username/repository/branch as a report route', () => {
    const result = classifyRoute('/refactorfirst/refactorfirst/develop');
    expect(result.type).toBe('report');
    expect(result.branch).toBe('develop');
  });

  it('classifies unknown routes with more segments as not-found', () => {
    expect(classifyRoute('/a/b/c/d').type).toBe('not-found');
  });

  it('classifies invalid names as not-found', () => {
    expect(classifyRoute('/<script>').type).toBe('not-found');
    expect(classifyRoute('/bad name/repo').type).toBe('not-found');
  });
});

describe('URL builders and query params', () => {
  it('buildReportUrl builds report URLs', () => {
    expect(buildReportUrl('u', 'r')).toBe('/u/r');
    expect(buildReportUrl('u', 'r', 'develop')).toBe('/u/r/develop');
    expect(buildReportUrl('u', 'r', 'main')).toBe('/u/r');
  });

  it('buildRepositoryListUrl separates owner and repo', () => {
    expect(buildRepositoryListUrl('refactorfirst/refactorfirst')).toBe('/refactorfirst/refactorfirst');
  });

  it('getQueryParam parses query strings', () => {
    expect(getQueryParam('?page=2', 'page')).toBe('2');
    expect(getQueryParam('?page=2&q=x', 'q')).toBe('x');
    expect(getQueryParam('', 'page')).toBeNull();
    expect(getQueryParam('?other=1', 'page')).toBeNull();
  });
});

describe('navigateTo', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  it('updates browser history', () => {
    navigateTo('/refactorfirst');
    expect(location.pathname).toBe('/refactorfirst');
  });

  it('dispatches a routechange event so the app re-renders', () => {
    let caught = null;
    const listener = (e) => { caught = e.detail; };
    window.addEventListener('routechange', listener);
    navigateTo('/about');
    window.removeEventListener('routechange', listener);
    expect(caught).toEqual({ path: '/about' });
  });
});
