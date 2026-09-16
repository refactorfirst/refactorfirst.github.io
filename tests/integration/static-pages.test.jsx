// Phase 4: the nine static content pages render their template content.
// Each assertion targets a distinctive heading from the legacy templates.
import { describe, test, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { jsx as _jsx } from 'react/jsx-runtime';

import AboutPage from '../../app/about/page';
import ApiPage from '../../app/api/page';
import DocumentationPage from '../../app/documentation/page';
import ExamplesPage from '../../app/examples/page';
import FaqPage from '../../app/faq/page';
import FeedbackPage from '../../app/feedback/page';
import GettingStartedPage from '../../app/getting-started/page';
import PrivacyPolicyPage from '../../app/privacy-policy/page';
import TermsOfServicePage from '../../app/terms-of-service/page';

const PAGES = [
  ['about', AboutPage, 'About RefactorFirst'],
  ['api', ApiPage, 'API for Tool Integrations'],
  ['documentation', DocumentationPage, 'Documentation'],
  ['examples', ExamplesPage, 'Example Reports'],
  ['faq', FaqPage, 'Frequently Asked Questions'],
  ['feedback', FeedbackPage, 'Feedback'],
  ['getting-started', GettingStartedPage, 'Getting Started'],
  ['privacy-policy', PrivacyPolicyPage, 'Privacy Policy'],
  ['terms-of-service', TermsOfServicePage, 'Terms of Service'],
];

describe('static content pages', () => {
  for (const [name, Page, heading] of PAGES) {
    test(`/${name} renders its template content`, () => {
      const html = renderToStaticMarkup(_jsx(Page, {}));
      expect(html).toContain(`<h1>${heading}</h1>`);
    });
  }

  test('getting-started carries the workflow-sample slot', () => {
    const html = renderToStaticMarkup(_jsx(GettingStartedPage, {}));
    expect(html).toContain('id="workflow-sample"');
  });

  test('examples links into a live report and the add-repo form', () => {
    const html = renderToStaticMarkup(_jsx(ExamplesPage, {}));
    expect(html).toContain('href="/refactorfirst/refactorfirst"');
    expect(html).toContain('href="/add-repo"');
  });
});
