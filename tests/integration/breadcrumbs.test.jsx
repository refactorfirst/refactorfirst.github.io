// Breadcrumb navigation under the top menu: the trail mirrors the current
// /<user>/<repo>/<branch> route with links back up the hierarchy. Pathname
// and query string are injected via mutable next/navigation mocks (same
// pattern as not-found.test.jsx).
import { describe, test, expect } from 'bun:test';
import { mock } from 'bun:test';

import { sharedNextNavigationMock } from './next-navigation-stub';

let currentPath = '/';
let currentSearch = '';
mock.module('next/navigation', () => sharedNextNavigationMock({
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(currentSearch)
}));

import { render, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import Breadcrumbs from '../../components/breadcrumbs';
import { announceResolvedBranch } from '../../lib/breadcrumbs.js';

installRtlDom();

/**
 * Sets the mocked route and mounts the breadcrumb component for assertions.
 *
 * @param {string} pathname - Path exposed by the navigation mock.
 * @param {string} [search=''] - Query string exposed by the navigation mock.
 * @returns {import('@testing-library/react').RenderResult} Rendered test utilities.
 */
function renderBreadcrumbs(pathname, search = '') {
  currentPath = pathname;
  currentSearch = search;
  return render(_jsx(Breadcrumbs, {}));
}

/**
 * Collects the rendered breadcrumb list items in navigation order.
 *
 * @param {HTMLElement} container - Root container returned by the test renderer.
 * @returns {HTMLLIElement[]} The breadcrumb items within the container.
 */
function crumbs(container) {
  return Array.from(
    container.querySelectorAll('nav[aria-label="Breadcrumb"] ol li')
  );
}

describe('Breadcrumbs', () => {
  test('renders no breadcrumb nav on the landing page', () => {
    const { container } = renderBreadcrumbs('/');
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  test('renders no breadcrumb nav on static content pages', () => {
    const { container } = renderBreadcrumbs('/about');
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  test('renders no breadcrumb nav on not-found paths', () => {
    const { container } = renderBreadcrumbs('/alice/repo/main/extra');
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  test('shows Home plus the current username on the user listing', () => {
    const { container } = renderBreadcrumbs('/alice');
    const items = crumbs(container);
    expect(items.length).toBe(2);
    const home = items[0].querySelector('a');
    expect(home.getAttribute('href')).toBe('/');
    expect(home.textContent).toBe('Home');
    const current = items[1].querySelector('[aria-current="page"]');
    expect(current).toBeTruthy();
    expect(current.textContent).toBe('alice');
    expect(items[1].querySelector('a')).toBeNull();
  });

  test('marks the repository as current on the default report route — never a self-link', () => {
    const { container } = renderBreadcrumbs('/alice/some-repo');
    const items = crumbs(container);
    expect(items.length).toBe(3);
    const hrefs = items.map(item => item.querySelector('a')?.getAttribute('href') || null);
    expect(hrefs).toEqual(['/', '/alice', null]);
    expect(items.map(item => item.textContent)).toEqual(['Home', 'alice', 'some-repo']);
    const current = items[2].querySelector('[aria-current="page"]');
    expect(current.textContent).toBe('some-repo');
  });

  test('appends the resolved branch once the report fetch announces it', async () => {
    const utils = renderBreadcrumbs('/alice/some-repo');
    const { act } = await import('@testing-library/react');
    await act(async () => {
      announceResolvedBranch(window, { username: 'alice', repository: 'some-repo', branch: 'master' });
    });
    const items = crumbs(utils.container);
    expect(items.length).toBe(4);
    // There is still nowhere "up" from the repository level on this route:
    // the crumb appears but stays unlinked instead of pointing at itself.
    expect(items[2].textContent).toBe('some-repo');
    expect(items[2].querySelector('a')).toBeNull();
    expect(items[2].querySelector('[aria-current]')).toBeNull();
    const current = items[3].querySelector('[aria-current="page"]');
    expect(current.textContent).toBe('master');
  });

  test('relabels a path-pinned main crumb when the fetch resolves to the master fallback', async () => {
    const utils = renderBreadcrumbs('/alice/some-repo/main');
    const { act } = await import('@testing-library/react');
    await act(async () => {
      announceResolvedBranch(window, { username: 'alice', repository: 'some-repo', branch: 'master' });
    });
    const items = crumbs(utils.container);
    expect(items[2].querySelector('a').getAttribute('href')).toBe('/alice/some-repo');
    expect(items[3].textContent).toBe('master');
    expect(items[3].querySelector('[aria-current="page"]')).toBeTruthy();
  });

  test('ignores branch announcements for a different report', async () => {
    const utils = renderBreadcrumbs('/alice/some-repo');
    const { act } = await import('@testing-library/react');
    await act(async () => {
      announceResolvedBranch(window, { username: 'bob', repository: 'other-repo', branch: 'develop' });
    });
    const items = crumbs(utils.container);
    expect(items.length).toBe(3);
    expect(items.at(-1).textContent).toBe('some-repo');
  });

  test('drops the announced branch when the route changes', async () => {
    const utils = renderBreadcrumbs('/alice/some-repo');
    const { act } = await import('@testing-library/react');
    await act(async () => {
      announceResolvedBranch(window, { username: 'alice', repository: 'some-repo', branch: 'master' });
    });
    expect(crumbs(utils.container).at(-1).textContent).toBe('master');
    currentPath = '/alice/other-repo';
    utils.rerender(_jsx(Breadcrumbs, {}));
    const items = crumbs(utils.container);
    expect(items.at(-1).textContent).toBe('other-repo');
    expect(utils.container.textContent).not.toContain('master');
  });

  test('pins the branch from a branch path segment', () => {
    const { container } = renderBreadcrumbs('/alice/some-repo/master');
    const items = crumbs(container);
    expect(items.length).toBe(4);
    expect(items[3].textContent).toBe('master');
    expect(items[3].querySelector('[aria-current="page"]')).toBeTruthy();
  });

  test('shows the ?branch= deep-link branch on the report shell', () => {
    const { container } = renderBreadcrumbs('/alice/some-repo', '?branch=develop');
    const items = crumbs(container);
    expect(items.at(-1).textContent).toBe('develop');
    expect(items.at(-1).querySelector('[aria-current="page"]')).toBeTruthy();
  });

  test('exposes an ordered list inside a labelled navigation landmark', () => {
    const { container } = renderBreadcrumbs('/alice/some-repo/master');
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]');
    expect(nav).toBeTruthy();
    expect(nav.firstElementChild.tagName).toBe('OL');
  });
});
