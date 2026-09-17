// Phase 5: /{username} repository listing — card grid, pagination and the
// "recently added, listing not yet redeployed" client-side refresh
// (Technical Appendix §5).
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mock } from 'bun:test';

let currentSearch = '';
mock.module('next/navigation', () => ({
  usePathname: () => '/alice',
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(currentSearch)
}));

import { render, waitFor, cleanup, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import RepoList from '../../components/repo-list';

installRtlDom();

function generateRepos(username, count) {
  return Array.from({ length: count }, (_, i) => ({
    username,
    repository: `repo-${String(i).padStart(3, '0')}`
  }));
}

let mockFetch;

describe('RepoList (user listing)', () => {
  beforeEach(() => {
    currentSearch = '';
    mockFetch = spyOn(global, 'fetch').mockImplementation(
      () => Promise.resolve({ ok: false, status: 404 })
    );
  });
  afterEach(() => {
    mockFetch.mockRestore();
    cleanup();
  });

  test('shows the username heading and one card per repository', () => {
    const repos = [
      { username: 'alice', repository: 'one' },
      { username: 'alice', repository: 'two' }
    ];
    const { container } = render(_jsx(RepoList, { username: 'alice', initialRepositories: repos }));
    expect(container.textContent).toContain('alice');
    const cards = container.querySelectorAll('a.repo-card');
    expect(cards.length).toBe(2);
    expect(cards[0].getAttribute('href')).toBe('/alice/one');
    expect(cards[1].textContent).toContain('two');
  });

  test('paginates when the listing exceeds a page', () => {
    const repos = generateRepos('alice', 60);
    const { container } = render(_jsx(RepoList, { username: 'alice', initialRepositories: repos }));
    expect(container.querySelectorAll('a.repo-card').length).toBe(50);
    const nav = container.querySelector('nav.pagination');
    expect(nav).toBeTruthy();
    expect(nav.textContent).toContain('1');
    expect(nav.textContent).toContain('2');
    expect(nav.querySelector('a[href="/alice?page=2"]')).toBeTruthy();
  });

  test('shows the second page when ?page=2', () => {
    currentSearch = '?page=2';
    const repos = generateRepos('alice', 60);
    const { container } = render(_jsx(RepoList, { username: 'alice', initialRepositories: repos }));
    const cards = container.querySelectorAll('a.repo-card');
    expect(cards.length).toBe(10);
    expect(cards[0].textContent).toContain('repo-050');
    const current = container.querySelector('[aria-current="page"]');
    expect(current.textContent).toBe('2');
    expect(container.querySelector('a[href="/alice?page=1"]')).toBeTruthy();
  });

  test('clamps out-of-range page params', () => {
    currentSearch = '?page=99';
    const repos = generateRepos('alice', 3);
    const { container } = render(_jsx(RepoList, { username: 'alice', initialRepositories: repos }));
    expect(container.querySelectorAll('a.repo-card').length).toBe(3);
  });

  test('refreshes the listing client-side when repositories.txt grew after deploy', async () => {
    const staticRepos = generateRepos('alice', 1);
    const freshText = 'alice/repo-000\nalice/repo-brand-new\nbob/other\n';
    mockFetch.mockImplementation(requested =>
      String(requested).endsWith('/repositories.txt')
        ? Promise.resolve({ ok: true, text: () => Promise.resolve(freshText) })
        : Promise.resolve({ ok: false, status: 404 }));

    const { container } = render(
      _jsx(RepoList, { username: 'alice', initialRepositories: staticRepos })
    );
    await waitFor(() => {
      expect(container.textContent).toContain('brand-new');
    });
    // The other user's repo must not appear
    expect(container.textContent).not.toContain('bob/other');
    // And the static repo is still there
    return waitFor(() => expect(container.textContent).toContain('repo-000'));
  });
});
