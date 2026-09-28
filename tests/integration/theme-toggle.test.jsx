// Dark mode toggle below the site header: three radio modes (light / dark /
// system) rendered as icon pills, with the system preference preselected and
// the whole control on a right-aligned .theme-bar row under the header —
// the row the breadcrumb trail shares on report routes (crumbs left, toggle
// right), aligned with the menu bar's content edges
// (plans/css-only-dark-mode.md).
import { describe, test, expect } from 'bun:test';
import { mock } from 'bun:test';

import { sharedNextNavigationMock } from './next-navigation-stub';

let currentPath = '/';
let currentSearch = '';
mock.module('next/navigation', () => sharedNextNavigationMock({
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(currentSearch)
}));

import { render, installRtlDom, within } from './rtl';
import { jsx as _jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ThemeToggle from '../../components/theme-toggle';
import RootLayout from '../../app/layout';

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

describe('Root layout placement', () => {
  test('the toggle row sits below the header, before main, holding the radios', () => {
    const html = renderToStaticMarkup(_jsx(RootLayout, { children: null }));
    const headerStart = html.indexOf('<header');
    const headerEnd = html.indexOf('</header>');
    const themeBar = html.indexOf('class="theme-bar"');
    const main = html.indexOf('<main');
    expect(themeBar).toBeGreaterThan(headerEnd);
    expect(themeBar).toBeLessThan(main);
    // The header itself no longer contains the toggle row.
    expect(html.slice(headerStart, headerEnd)).not.toContain('theme-bar');
    // The row holds all three radios (and nothing but the toggle).
    const rowHtml = html.slice(themeBar, main);
    expect(rowHtml).toContain('rf-theme-light');
    expect(rowHtml).toContain('rf-theme-dark');
    expect(rowHtml).toContain('rf-theme-system');
    // The persistence bootstrap must come after the radios to restore the
    // saved choice pre-paint.
    const shim = html.indexOf("localStorage.getItem('rf-theme')");
    expect(shim).toBeGreaterThan(themeBar);
  });

  test('on report routes the breadcrumb trail shares the toggle row, to its left', () => {
    currentPath = '/alice/some-repo/master';
    currentSearch = '';
    try {
      const html = renderToStaticMarkup(_jsx(RootLayout, { children: null }));
      const themeBar = html.indexOf('class="theme-bar"');
      const main = html.indexOf('<main');
      const rowHtml = html.slice(themeBar, main);
      const crumbs = rowHtml.indexOf('aria-label="Breadcrumb"');
      const toggle = rowHtml.indexOf('rf-theme-light');
      expect(crumbs, 'breadcrumb nav missing from the theme bar').toBeGreaterThan(-1);
      expect(toggle).toBeGreaterThan(-1);
      // DOM order mirrors the flex row: crumbs first (left), toggle last
      // (right); the row's flex-grow keeps them on one line.
      expect(crumbs).toBeLessThan(toggle);
      // The trail no longer renders outside the row.
      expect(html.slice(0, themeBar)).not.toContain('aria-label="Breadcrumb"');
      expect(html.slice(main)).not.toContain('aria-label="Breadcrumb"');
    } finally {
      currentPath = '/';
    }
  });
});
