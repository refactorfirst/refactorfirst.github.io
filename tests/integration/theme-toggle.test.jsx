// Dark mode toggle under the top menu: three radio modes (light / dark /
// system) rendered as icon pills, with the system preference preselected and
// the whole control on a sub-row below the menu bar whose right edge aligns
// with the menu's content edge (plans/css-only-dark-mode.md).
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
  test('the toggle sits on a sub-row below the menu bar, inside the header', () => {
    render(_jsx(SiteHeader, { repositories: [] }));
    const header = document.getElementById('top-menu');
    const bar = document.querySelector('.menu-bar');
    const themeBar = header.querySelector('.theme-bar');
    const toggle = themeBar.querySelector('.theme-toggle');
    expect(themeBar).toBeTruthy();
    expect(toggle).toBeTruthy();
    // The sub-row comes after the menu bar and holds only the toggle.
    const children = [...header.children];
    expect(children[children.length - 1]).toBe(themeBar);
    expect(children.indexOf(themeBar)).toBeGreaterThan(children.indexOf(bar));
    expect(themeBar.children.length).toBe(1);
    expect(themeBar.contains(toggle)).toBe(true);
    expect(bar.contains(toggle)).toBe(false);
  });
});
