// Phase 1: app shell — header nav, skip link, footer, html lang/CSP meta.
// Ported from index.html (legacy app shell) invariants.
import { describe, test, expect } from 'bun:test';
import { mock } from 'bun:test';

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} })
}));

import { render, screen, fireEvent, installRtlDom } from './rtl';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from '../../app/layout';
import SiteHeader from '../../components/site-header';
import SiteFooter from '../../components/site-footer';
import MenuToggle from '../../components/menu-toggle';

installRtlDom();

describe('app shell', () => {
  test('header nav contains all 9 menu links plus the external GitHub link', () => {
    render(_jsx(SiteHeader, {}));
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    expect(nav).toBeTruthy();
    const expected = [
      ['Home', '/'],
      ['Add Your Repo', '/add-repo'],
      ['Getting Started', '/getting-started'],
      ['Documentation', '/documentation'],
      ['FAQ', '/faq'],
      ['Examples', '/examples'],
      ['API', '/api'],
      ['About', '/about'],
      ['Feedback', '/feedback'],
    ];
    for (const [label, href] of expected) {
      const link = [...nav.querySelectorAll('a')].find(a => a.textContent.trim() === label);
      expect(link, `missing link ${label}`).toBeTruthy();
      expect(link.getAttribute('href')).toBe(href);
    }
    const github = [...nav.querySelectorAll('a')].find(a => a.textContent.trim() === 'GitHub');
    expect(github).toBeTruthy();
    expect(github.getAttribute('href')).toBe('https://github.com/refactorfirst/refactorfirst');
    expect(github.getAttribute('rel')).toContain('noopener');
  });

  test('brand renders the logo only (no redundant Title text)', () => {
    render(_jsx(SiteHeader, {}));
    const brand = document.querySelector('.menu-bar a.brand');
    expect(brand).toBeTruthy();
    expect(brand.getAttribute('href')).toBe('/');
    expect(brand.querySelector('img')).toBeTruthy();
    // The RefactorFirst wordmark is gone — the logo carries the branding.
    expect(brand.textContent.trim()).toBe('');
  });

  test('menu search sits after the nav links (right side of the bar)', () => {
    render(_jsx(SiteHeader, {}));
    const links = document.querySelector('ul#menu-links');
    const search = document.querySelector('.menu-search');
    expect(links).toBeTruthy();
    expect(search).toBeTruthy();
    // search must follow the link list in DOM order
    expect(Boolean(links.compareDocumentPosition(search) & 4 /* DOCUMENT_POSITION_FOLLOWING */)).toBe(true);
  });

  test('skip link targets the main content container', () => {
    render(_jsx(SiteHeader, {}));
    const skip = document.querySelector('.skip-link');
    expect(skip).toBeTruthy();
    expect(skip.getAttribute('href')).toBe('#app');
  });

  test('footer shows Privacy Policy and Terms of Service links', () => {
    render(_jsx(SiteFooter, {}));
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    expect(privacy.getAttribute('href')).toBe('/privacy-policy');
    expect(terms.getAttribute('href')).toBe('/terms-of-service');
  });

  test('root layout sets html lang="en" and carries the CSP meta verbatim', () => {
    const html = renderToStaticMarkup(_jsx(RootLayout, { children: null }));
    expect(html).toContain('lang="en"');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    // React HTML-escapes single quotes to &#x27; inside attribute values;
    // browsers decode them back, so compare on the entity-decoded markup.
    const decoded = html.replace(/&#x27;/g, "'");
    expect(decoded).toContain("'wasm-unsafe-eval'");
    expect(decoded).toContain("script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com");
    expect(html).toContain('name="submission-target"');
    expect(html).toContain('id="app"');
  });

  test('menu toggle flips aria-expanded and the open class', () => {
    render(_jsxs(_Fragment, {
      children: [_jsx(MenuToggle, {}), _jsx('ul', { id: 'menu-links', className: 'menu-links' })]
    }));
    const button = screen.getByRole('button', { name: 'Toggle navigation menu' });
    const links = document.getElementById('menu-links');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(links.classList.contains('open')).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(links.classList.contains('open')).toBe(false);
  });
});
