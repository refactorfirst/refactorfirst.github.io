import { describe, it, expect } from 'bun:test';
import {
  escapeHtml,
  paginate,
  reposForUser,
  sortByRepository,
  renderPaginationControls,
  detectHostingEnvironment as detectHostingEnvironmentUtil
} from '../../js/utils.js';

// Alias for test clarity
const detectHostingEnvironment = detectHostingEnvironmentUtil;

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<b>&"\'</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  });

  it('handles non-string input safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('sortByRepository', () => {
  it('sorts alphabetically by repository name, case-insensitively', () => {
    const repos = [
      { username: 'x', repository: 'Zeta' },
      { username: 'x', repository: 'alpha' },
      { username: 'x', repository: 'Middle' }
    ];
    const sorted = sortByRepository(repos);
    expect(sorted.map(r => r.repository)).toEqual(['alpha', 'Middle', 'Zeta']);
    // original untouched
    expect(repos[0].repository).toBe('Zeta');
  });
});

describe('reposForUser', () => {
  const repos = [
    { username: 'alice', repository: 'one', fullName: 'alice/one' },
    { username: 'alice', repository: 'two', fullName: 'alice/two' },
    { username: 'bob', repository: 'gamma', fullName: 'bob/gamma' }
  ];

  it('returns only repositories belonging to the user', () => {
    expect(reposForUser(repos, 'alice').map(r => r.repository)).toEqual(['one', 'two']);
  });

  it('is case-insensitive on the username', () => {
    expect(reposForUser(repos, 'ALICE')).toHaveLength(2);
  });

  it('returns an empty array for unknown users', () => {
    expect(reposForUser(repos, 'mallory')).toEqual([]);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 120 }, (_, i) => i);

  it('returns the requested page slice', () => {
    const result = paginate(items, 2, 50);
    expect(result.items).toHaveLength(50);
    expect(result.items[0]).toBe(50);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
  });

  it('returns the remaining items on the last page', () => {
    const result = paginate(items, 3, 50);
    expect(result.items).toHaveLength(20);
  });

  it('clamps out-of-range pages', () => {
    expect(paginate(items, 99, 50).page).toBe(3);
    expect(paginate(items, 0, 50).page).toBe(1);
    expect(paginate(items, -5, 50).page).toBe(1);
  });

  it('defaults to page 1 and 50 items per page', () => {
    const result = paginate(items);
    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(50);
  });

  it('handles empty lists', () => {
    const result = paginate([], 1, 50);
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(1);
  });

  it('rejects non-positive and non-integer perPage values', () => {
    for (const invalid of [0, -1, 2.5, NaN, Infinity]) {
      expect(() => paginate(items, 1, invalid)).toThrow(RangeError);
    }
  });
});

describe('detectHostingEnvironment', () => {
  it('detects github.io Pages hosts as github', () => {
    expect(detectHostingEnvironment('refactorfirst.github.io')).toBe('github');
    expect(detectHostingEnvironment('my-org.github.io')).toBe('github');
  });

  it('detects gitlab.io Pages hosts as gitlab', () => {
    expect(detectHostingEnvironment('group.gitlab.io')).toBe('gitlab');
    expect(detectHostingEnvironment('sub.group.gitlab.io')).toBe('gitlab');
  });

  it('detects bitbucket.io sites as bitbucket', () => {
    expect(detectHostingEnvironment('team.bitbucket.io')).toBe('bitbucket');
  });

  it('treats github.com and github enterprise domains as github', () => {
    expect(detectHostingEnvironment('github.com')).toBe('github');
    expect(detectHostingEnvironment('github.my-corp.example.com')).toBe('github');
  });

  it('treats self-hosted gitlab/bitbucket hosts by keyword', () => {
    expect(detectHostingEnvironment('gitlab.example.com')).toBe('gitlab');
    expect(detectHostingEnvironment('bitbucket.example.org')).toBe('bitbucket');
  });

  it('defaults unknown and local hosts to github', () => {
    expect(detectHostingEnvironment('localhost')).toBe('github');
    expect(detectHostingEnvironment('127.0.0.1')).toBe('github');
    expect(detectHostingEnvironment('reports.example.com')).toBe('github');
    expect(detectHostingEnvironment('')).toBe('github');
  });

  it('respects explicit platform setting over hostname detection', () => {
    expect(detectHostingEnvironment('localhost', 'gitlab')).toBe('gitlab');
    expect(detectHostingEnvironment('my-custom-domain.com', 'bitbucket')).toBe('bitbucket');
    expect(detectHostingEnvironment('gitlab.example.com', 'github')).toBe('github');
  });
});

describe('renderPaginationControls', () => {
  it('renders page links with the current page marked', () => {
    const html = renderPaginationControls({ page: 2, totalPages: 3, baseUrl: '/alice' });
    expect(html).toContain('?page=1');
    expect(html).toContain('?page=3');
    expect(html).toContain('aria-current="page"');
  });

  it('returns an empty string when only one page exists', () => {
    expect(renderPaginationControls({ page: 1, totalPages: 1, baseUrl: '/alice' })).toBe('');
  });

  it('escapes the base URL', () => {
    const html = renderPaginationControls({ page: 1, totalPages: 2, baseUrl: '/<img>' });
    expect(html).not.toContain('<img');
  });
});
