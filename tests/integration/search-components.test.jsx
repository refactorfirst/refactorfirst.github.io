// Phase 3: search components — type-ahead filtering, keyboard navigation,
// ARIA combobox semantics and Next router navigation. Ported from the legacy
// tests/integration/search-flow.test.js type-ahead cases.
import { describe, test, expect, mock, beforeEach } from 'bun:test';

const pushed = [];
mock.module('next/navigation', () => ({
  useRouter: () => ({
    push: url => pushed.push(url)
  })
}));

// Import components only after the next/navigation mock is installed.
import MenuSearch from '../../components/menu-search';
import HeroSearch from '../../components/hero-search';
import { render, screen, fireEvent, installRtlDom } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';

installRtlDom();

const REPOS = [
  { username: 'apache', repository: 'tomcat', fullName: 'apache/tomcat' },
  { username: 'refactorfirst', repository: 'refactorfirst', fullName: 'refactorfirst/refactorfirst' },
  { username: 'spring-projects', repository: 'spring-framework', fullName: 'spring-projects/spring-framework' }
];

function type(input, value) {
  fireEvent.input(input, { target: { value } });
}

function press(input, key) {
  fireEvent.keyDown(input, { key });
}

describe('MenuSearch', () => {
  beforeEach(() => { pushed.length = 0; });

  test('renders an ARIA combobox wired to a listbox', () => {
    render(_jsx(MenuSearch, { repositories: REPOS, debounceMs: 0 }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-controls')).toBe('menu-search-results');
    const results = document.getElementById('menu-search-results');
    expect(results.getAttribute('role')).toBe('listbox');
    expect(results.hidden).toBe(true);
  });

  test('type-ahead filters repositories and opens the listbox', () => {
    render(_jsx(MenuSearch, { repositories: REPOS, debounceMs: 0 }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    type(input, 'tomcat');
    const results = document.getElementById('menu-search-results');
    expect(results.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(results.textContent).toContain('apache/tomcat');
    expect(results.textContent).not.toContain('refactorfirst/');
    expect(results.querySelector('li').getAttribute('role')).toBe('option');
  });

  test('empty query hides the results', () => {
    render(_jsx(MenuSearch, { repositories: REPOS, debounceMs: 0 }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    type(input, 'tomcat');
    type(input, '');
    const results = document.getElementById('menu-search-results');
    expect(results.hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  test('clicking a suggestion navigates via the Next router', () => {
    render(_jsx(MenuSearch, { repositories: REPOS, debounceMs: 0 }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    type(input, 'tomcat');
    const option = document.querySelector('#menu-search-results li');
    fireEvent.click(option);
    expect(pushed).toEqual(['/apache/tomcat']);
  });

  test('ArrowDown/ArrowUp move the active option, Enter navigates', () => {
    render(_jsx(MenuSearch, { repositories: REPOS, debounceMs: 0 }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    type(input, 'spring');
    press(input, 'ArrowDown');
    press(input, 'ArrowUp'); // wraps around
    press(input, 'ArrowDown');
    const active = document.querySelector('#menu-search-results li.active');
    expect(input.getAttribute('aria-activedescendant')).toBe(active.id);
    expect(active.getAttribute('aria-selected')).toBe('true');
    press(input, 'Enter');
    expect(pushed).toEqual(['/spring-projects/spring-framework']);
  });

  test('Escape clears the field and closes the listbox', () => {
    render(_jsx(MenuSearch, { repositories: REPOS, debounceMs: 0 }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    type(input, 'tomcat');
    press(input, 'Escape');
    expect(input.value).toBe('');
    expect(document.getElementById('menu-search-results').hidden).toBe(true);
  });
});

describe('HeroSearch', () => {
  beforeEach(() => { pushed.length = 0; });

  test('renders the labelled hero search', () => {
    render(_jsx(HeroSearch, { repositories: REPOS, debounceMs: 0 }));
    expect(screen.getByLabelText('Find a repository')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Search repositories' })).toBeTruthy();
  });

  test('keyboard selection navigates to the repository report', () => {
    render(_jsx(HeroSearch, { repositories: REPOS, debounceMs: 0 }));
    const input = screen.getByRole('combobox', { name: 'Search repositories' });
    type(input, 'refactorfirst');
    press(input, 'ArrowDown');
    press(input, 'Enter');
    expect(pushed).toEqual(['/refactorfirst/refactorfirst']);
  });
});
