// Dark mode toggle in the top menu: three radio modes (light / dark /
// system) rendered as icon pills, with the system preference preselected and
// the whole control placed after the menu search box so its right edge can
// align with the top menu's content edge (plans/css-only-dark-mode.md).
import { describe, test, expect } from 'bun:test';
import { mock } from 'bun:test';

import { sharedNextNavigationMock } from './next-navigation-stub';

mock.module('next/navigation', () => sharedNextNavigationMock({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams()
}));

import { render, installRtlDom, within } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import ThemeToggle from '../../components/theme-toggle';
import SiteHeader from '../../components/site-header';

installRtlDom();

describe('ThemeToggle', () => {
  test('renders a radiogroup with three labelled modes', () => {
    render(_jsx(ThemeToggle, {}));
    const group = document.querySelector('[role="radiogroup"]');
    expect(group).toBeTruthy();
    expect(group.getAttribute('aria-label')).toBe('Color theme');

    const inputs = within(group).getAllByRole('radio');
    expect(inputs.length).toBe(3);
    const described = inputs.map(input => input.getAttribute('aria-label'));
    expect(described).toContain('Light theme');
    expect(described).toContain('Dark theme');
    expect(described).toContain('System preference');
  });

  test('the system preference is preselected and all inputs share one group', () => {
    render(_jsx(ThemeToggle, {}));
    const system = document.getElementById('rf-theme-system');
    expect(system.checked).toBe(true);
    const names = [...document.querySelectorAll('input[type="radio"]')]
      .map(input => input.getAttribute('name'));
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toBe('rf-theme');
  });

  test('each mode carries a decorative icon (small image) inside its label', () => {
    render(_jsx(ThemeToggle, {}));
    const labels = [...document.querySelectorAll('.theme-option')];
    expect(labels.length).toBe(3);
    labels.forEach(label => {
      const icon = label.querySelector('svg');
      expect(icon).toBeTruthy();
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.classList.contains('theme-option-icon')).toBe(true);
      // The icon is a sibling of the radio so :checked styling can reach it.
      expect(icon.previousElementSibling.tagName).toBe('INPUT');
    });
  });
});

describe('SiteHeader placement', () => {
  test('the toggle is the last child of the menu bar, after the search box', () => {
    render(_jsx(SiteHeader, { repositories: [] }));
    const bar = document.querySelector('.menu-bar');
    const children = [...bar.children];
    const search = bar.querySelector('.menu-search');
    const toggle = bar.querySelector('.theme-toggle');
    expect(toggle).toBeTruthy();
    expect(children[children.length - 1]).toBe(toggle);
    expect(children.indexOf(search)).toBeGreaterThan(0);
    expect(children.indexOf(toggle)).toBeGreaterThan(children.indexOf(search));
  });
});
