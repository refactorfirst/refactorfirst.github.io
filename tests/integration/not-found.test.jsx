// Phase 4/5: not-found page — ported error-404 copy, redeploy-latency note
// for freshly submitted repos, and the branch deep-link client redirect
// (Technical Appendix §5/§6). Pathname and redirects are injected via mocks.
import { describe, test, expect } from 'bun:test';
import { mock } from 'bun:test';

import { sharedNextNavigationMock } from './next-navigation-stub';

let currentPath = '/';
mock.module('next/navigation', () => sharedNextNavigationMock({
  usePathname: () => currentPath
}));

import { render, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import NotFound from '../../app/not-found';

installRtlDom();

function render404(pathname) {
  currentPath = pathname;
  const redirects = [];
  const utils = render(_jsx(NotFound, { performRedirect: url => redirects.push(url) }));
  return { ...utils, redirects };
}

describe('not-found page', () => {
  test('renders the 404 copy and links home / to getting started', () => {
    const { container, redirects } = render404('/totally-not-a-page');
    expect(container.textContent).toContain('Page Not Found');
    expect(container.textContent).toContain('.refactorfirst/refactor-first.json');
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
    expect(container.querySelector('a[href="/getting-started"]')).toBeTruthy();
    expect(redirects).toEqual([]);
  });

  test('redirects unlisted branch deep links (/user/repo/branch) to the repo shell, keeping the branch', () => {
    const { redirects } = render404('/alice/some-repo/develop');
    expect(redirects).toEqual(['/alice/some-repo/?branch=develop']);
  });

  test('preserves branch names that contain slashes', () => {
    const { redirects } = render404('/alice/some-repo/feature/login');
    expect(redirects).toEqual(['/alice/some-repo/?branch=feature%2Flogin']);
  });

  test('does not redirect static-page-like first segments', () => {
    const { redirects } = render404('/faq/anything');
    expect(redirects).toEqual([]);
  });

  test('shows a redeploy-latency note for two-segment repo paths', () => {
    const { container, redirects } = render404('/alice/recently-added-repo');
    expect(redirects).toEqual([]); // nothing to redirect to
    expect(container.textContent).toContain('recently added');
  });
});
