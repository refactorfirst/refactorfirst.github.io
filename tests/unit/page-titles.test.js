// WCAG 2.4.2 (Page Titled): every static content page exports Next.js
// metadata with a descriptive, page-specific <title> so no two pages share
// the bare site title.
import { describe, it, expect } from 'bun:test';

const PAGES = {
  'add-repo': () => import('../../app/add-repo/page.jsx'),
  about: () => import('../../app/about/page.jsx'),
  api: () => import('../../app/api/page.jsx'),
  documentation: () => import('../../app/documentation/page.jsx'),
  examples: () => import('../../app/examples/page.jsx'),
  faq: () => import('../../app/faq/page.jsx'),
  feedback: () => import('../../app/feedback/page.jsx'),
  'getting-started': () => import('../../app/getting-started/page.jsx'),
  'privacy-policy': () => import('../../app/privacy-policy/page.jsx'),
  'terms-of-service': () => import('../../app/terms-of-service/page.jsx')
};

const CHANGED_PAGE_TITLES = {
  about: 'About - RefactorFirst',
  api: 'API - RefactorFirst',
  documentation: 'Documentation - RefactorFirst',
  examples: 'Example Reports - RefactorFirst',
  faq: 'FAQ - RefactorFirst',
  feedback: 'Feedback - RefactorFirst',
  'getting-started': 'Getting Started - RefactorFirst',
  'privacy-policy': 'Privacy Policy - RefactorFirst',
  'terms-of-service': 'Terms of Service - RefactorFirst'
};

describe('static page titles (WCAG 2.4.2)', () => {
  it('every static page exports a descriptive, unique title', async () => {
    const titles = new Map();
    for (const [route, load] of Object.entries(PAGES)) {
      const mod = await load();
      const title = mod.metadata && mod.metadata.title;
      expect(
        typeof title,
        `${route}: expected page-specific metadata.title`
      ).toBe('string');
      expect(title.trim().length).toBeGreaterThan(0);
      expect(
        titles.has(title) ? `duplicate title "${title}" also used by ${titles.get(title)}` : null
      ).toBeNull();
      titles.set(title, route);
    }
  });

  it('uses the expected page-specific title before the site name', async () => {
    for (const [route, expectedTitle] of Object.entries(CHANGED_PAGE_TITLES)) {
      const mod = await PAGES[route]();
      expect(mod.metadata.title).toBe(expectedTitle);
    }
  });
});
