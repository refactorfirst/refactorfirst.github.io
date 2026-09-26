// Phase 3: landing page (RSC output) — hero, hero search, Add My Repo CTA,
// featured repositories. Ported from tests/integration/search-flow.test.js
// landing cases; fixtures replace the repositories.txt fetch.
import { describe, test, expect, beforeEach } from 'bun:test';
import { mock } from 'bun:test';

import { sharedNextNavigationMock } from './next-navigation-stub';

const pushed = [];
mock.module('next/navigation', () => sharedNextNavigationMock({
  useRouter: () => ({ push: url => pushed.push(url) })
}));

import Landing from '../../components/landing';
import { render, screen, fireEvent, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';

installRtlDom();

const REPOS = [
  { username: 'apache', repository: 'tomcat', fullName: 'apache/tomcat' },
  { username: 'refactorfirst', repository: 'refactorfirst', fullName: 'refactorfirst/refactorfirst' },
  { username: 'spring-projects', repository: 'spring-framework', fullName: 'spring-projects/spring-framework' },
  { username: 'spring-projects', repository: 'spring-boot', fullName: 'spring-projects/spring-boot' },
  { username: 'eclipse', repository: 'jdt', fullName: 'eclipse/jdt' },
  { username: 'netty', repository: 'netty', fullName: 'netty/netty' },
  { username: 'mockito', repository: 'mockito', fullName: 'mockito/mockito' }
];

describe('Landing page', () => {
  beforeEach(() => { pushed.length = 0; });

  test('renders hero, search input and Add My Repo call-to-action', () => {
    render(_jsx(Landing, { repositories: REPOS }));
    expect(screen.getByRole('heading', { name: 'RefactorFirst', level: 1 })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Search repositories' })).toBeTruthy();
    const cta = screen.getByRole('link', { name: 'Add My Repo' });
    expect(cta.getAttribute('href')).toBe('/add-repo');
    expect(cta.className).toBe('cta');
    // Layout cleanup: the CTA section is centered (block-flowed prose layout).
    expect(cta.closest('section').className).toContain('section-center');
  });

  test('lists the first 6 repositories as featured links', () => {
    render(_jsx(Landing, { repositories: REPOS }));
    const featured = document.querySelector('.featured-repos');
    expect(featured).toBeTruthy();
    // Layout cleanup: the featured section is centered (block-flowed prose
    // layout, see plans/layout-cleanup-plan.md).
    expect(featured.closest('section').className).toContain('section-center');
    const links = [...featured.querySelectorAll('a')];
    expect(links.map(a => a.textContent)).toEqual([
      'apache/tomcat',
      'refactorfirst/refactorfirst',
      'spring-projects/spring-framework',
      'spring-projects/spring-boot',
      'eclipse/jdt',
      'netty/netty'
    ]);
    expect(links[0].getAttribute('href')).toBe('/apache/tomcat');
  });

  test('hero search type-ahead navigates to the chosen repository', () => {
    render(_jsx(Landing, { repositories: REPOS }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    fireEvent.input(input, { target: { value: 'tomcat' } });
    const option = document.querySelector('#hero-search-results li');
    expect(option.textContent).toBe('apache/tomcat');
    fireEvent.click(option);
    expect(pushed).toEqual(['/apache/tomcat']);
  });
});
