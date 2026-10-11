import { describe, it, expect } from 'bun:test';
import {
  parseRoute,
  getDefaultBranch,
  isValidGitHubName,
  classifyRoute,
  buildReportUrl,
  buildRepositoryListUrl,
  DEFAULT_BRANCH,
  STATIC_PAGES
} from '../../lib/routes.js';

// Merged from the legacy router.test.js + router-ext.test.js suites.
// The navigateTo/onRouteChange browser-glue tests were deleted: navigation is
// owned by the Next.js App Router now; coverage moved to link-rendering
// assertions in the component tests (see plans/nextjs-conversion.md,
// Test Migration Map).

describe('URL Routing', () => {
  it('should parse username and repository from URL', () => {
    const result = parseRoute('/refactorfirst/refactorfirst/main');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('should default to main branch when not specified', () => {
    const result = parseRoute('/refactorfirst/refactorfirst');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('should parse only username when repository not specified', () => {
    const result = parseRoute('/refactorfirst');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBeNull();
    expect(result.branch).toBe('main');
  });

  it('should return null for all parts when path is empty', () => {
    const result = parseRoute('/');
    expect(result.username).toBeNull();
    expect(result.repository).toBeNull();
    expect(result.branch).toBe('main');
  });

  it('should handle trailing slashes', () => {
    const result = parseRoute('/refactorfirst/refactorfirst/main/');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('should handle multiple trailing slashes', () => {
    const result = parseRoute('/refactorfirst/refactorfirst///');
    expect(result.username).toBe('refactorfirst');
    expect(result.repository).toBe('refactorfirst');
    expect(result.branch).toBe('main');
  });

  it('getDefaultBranch should return main as default', () => {
    expect(getDefaultBranch()).toBe('main');
    expect(DEFAULT_BRANCH).toBe('main');
  });

  it('STATIC_PAGES contains the nine static content pages', () => {
    for (const page of ['getting-started', 'documentation', 'faq', 'examples', 'api', 'about', 'feedback', 'privacy-policy', 'terms-of-service']) {
      expect(STATIC_PAGES.has(page)).toBe(true);
    }
    expect(STATIC_PAGES.size).toBe(9);
  });
});

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

describe('classifyRoute branch validation', () => {
  it('classifies a valid branch segment as a report route', () => {
    expect(classifyRoute('/alice/repo/develop')).toEqual({
      type: 'report', username: 'alice', repository: 'repo', branch: 'develop'
    });
  });

  it('rejects path-injection branch segments like ".."', () => {
    expect(classifyRoute('/alice/repo/..')).toEqual({ type: 'not-found' });
    expect(classifyRoute('/alice/repo/..&#47;.evil')).toEqual({ type: 'not-found' });
  });

  it('joins multi-segment branch names into a single report branch', () => {
    expect(classifyRoute('/alice/repo/feature/login')).toEqual({
      type: 'report', username: 'alice', repository: 'repo', branch: 'feature/login'
    });
  });

  it('accepts deep multi-segment branch names', () => {
    const result = classifyRoute('/alice/repo/release/1.2/fix');
    expect(result.type).toBe('report');
    expect(result.branch).toBe('release/1.2/fix');
  });

  it('rejects multi-segment branches with any invalid segment', () => {
    expect(classifyRoute('/alice/repo/feature/..').type).toBe('not-found');
    expect(classifyRoute('/alice/repo/feature/<script>').type).toBe('not-found');
    expect(classifyRoute('/alice/repo/feature/ok then').type).toBe('not-found');
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

  it('treats unknown sub-paths of /add-repo as not found', () => {
    const result = classifyRoute('/add-repo/callback');
    expect(result.type).toBe('not-found');
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

  it('classifies routes with an invalid branch segment as not-found', () => {
    // Extra segments are part of the branch name now; only invalid
    // segments (injection attempts, bad characters) are not-found.
    expect(classifyRoute('/alice/repo/develop/<script>').type).toBe('not-found');
    expect(classifyRoute('/alice/repo/../evil').type).toBe('not-found');
  });

  it('classifies invalid names as not-found', () => {
    expect(classifyRoute('/<script>').type).toBe('not-found');
    expect(classifyRoute('/bad name/repo').type).toBe('not-found');
  });
});

describe('URL builders', () => {
  it('buildReportUrl builds report URLs', () => {
    expect(buildReportUrl('u', 'r')).toBe('/u/r');
    expect(buildReportUrl('u', 'r', 'develop')).toBe('/u/r/develop');
    expect(buildReportUrl('u', 'r', 'main')).toBe('/u/r');
  });

  it('buildReportUrl encodes each branch component, preserving separators', () => {
    // Slashed branches must stay real path segments so classifyRoute and
    // the 404-shell deep-link render recognize them.
    expect(buildReportUrl('u', 'r', 'feature/login')).toBe('/u/r/feature/login');
    expect(buildReportUrl('u', 'r', 'release/1.2/fix')).toBe('/u/r/release/1.2/fix');
  });

  it('buildRepositoryListUrl separates owner and repo', () => {
    expect(buildRepositoryListUrl('refactorfirst/refactorfirst')).toBe('/refactorfirst/refactorfirst');
  });
});
